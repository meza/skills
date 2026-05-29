#!/usr/bin/env python3
"""
Prepare isolated run directories for skill evals.

The orchestrator provides a skill directory, a base run root, and a provider.
The module reads <skill>/evals/evals.json, stages any shared fixture source,
uses the stable workdirs root, and prepares one working directory for each
eval run type:

    <run-root>/
      fixtures/                 # cloned or reused fixture source, when needed
      workdirs/
        eval-1/
          skill/                 # provider-specific skills/<skill-name>/ copy
          baseline/              # no skill copy

Each eval directory is isolated from every other eval directory. Within an eval,
the skill and baseline run types receive separate fixture copies
so changes made by one run cannot contaminate the other. Files listed in an
eval's files[] entry are copied into both run types.

FixturePreparer returns a PreparedRun object as the in-memory handoff to the
eval runner:

    PreparedRun(
        eval_definitions_path=Path("<skill>/evals/evals.json"),
        run_root=Path("<run-root>"),
        provider="claude",
        skill_name="example-skill",
        evals=[
            PreparedEval(
                eval_id=1,
                eval_name="basic",
                skill_run_path=Path("<run-root>/workdirs/eval-1/skill"),
                baseline_run_path=Path("<run-root>/workdirs/eval-1/baseline"),
                skill_file=Path("<run-root>/workdirs/eval-1/skill/.../SKILL.md"),
                skill_fixture_path=None,
                baseline_fixture_path=None,
            )
        ],
    )
"""

import os
import re
import shutil
import stat
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from .eval_definitions import (
    EvalDefinition,
    FixturePlacement,
    load_evals_json_or_exit,
    select_evals_or_exit,
    validate_evals_data_or_exit,
)
from .run_layout import (
    BASELINE_RUN_TYPE,
    PreparedRunTypeEntry,
    RUN_TYPES,
    SKILL_RUN_TYPE,
    skill_directory_path,
    skill_file_path,
)
from .providers.registry import get_provider_skill_root_or_exit

GIT_COMMAND_TIMEOUT_SECONDS = 300

GITIGNORE_AUTH_ENTRY = "auth.json"


@dataclass(frozen=True)
class PrepareFixtureOptions:
    skill_path: Path
    run_root: Path
    provider: str
    eval_ids: str | None = None


@dataclass(frozen=True)
class PreparedEval:
    eval_id: int
    eval_name: str
    skill_run_path: Path
    baseline_run_path: Path
    skill_file: Path
    skill_fixture_path: Path | None
    baseline_fixture_path: Path | None

    def run_type_entry(self, run_type: str) -> PreparedRunTypeEntry | None:
        entries = {
            SKILL_RUN_TYPE: PreparedRunTypeEntry(
                run_dir=self.skill_run_path,
                fixture_path=self.skill_fixture_path,
                skill_file=self.skill_file,
            ),
            BASELINE_RUN_TYPE: PreparedRunTypeEntry(
                run_dir=self.baseline_run_path,
                fixture_path=self.baseline_fixture_path,
            ),
        }
        return entries.get(run_type)

    def to_dict(self) -> dict:
        return {
            "eval_id": self.eval_id,
            "eval_name": self.eval_name,
            "skill_run_path": str(self.skill_run_path),
            "baseline_run_path": str(self.baseline_run_path),
            "skill_file": str(self.skill_file),
            "skill_fixture_path": _optional_path_to_string(self.skill_fixture_path),
            "baseline_fixture_path": _optional_path_to_string(
                self.baseline_fixture_path
            ),
        }


@dataclass(frozen=True)
class PreparedRun:
    eval_definitions_path: Path
    run_root: Path
    provider: str
    skill_name: str
    evals: list[PreparedEval]

    @property
    def eval_count(self) -> int:
        return len(self.evals)

    def to_dict(self) -> dict:
        return {
            "eval_definitions_path": str(self.eval_definitions_path),
            "run_root": str(self.run_root),
            "provider": self.provider,
            "skill_name": self.skill_name,
            "evals": [eval_entry.to_dict() for eval_entry in self.evals],
        }

    def to_summary(self) -> dict:
        return {
            "run_root": str(self.run_root),
            "provider": self.provider,
            "skill_name": self.skill_name,
            "eval_count": self.eval_count,
        }


@dataclass(frozen=True)
class FixtureCopy:
    fixture_staging: Path
    eval_dir: Path
    run_dir: Path
    run_type: str
    fixture_name: str
    fixture_placement: FixturePlacement
    eval_id: str


@dataclass(frozen=True)
class RunTypePreparation:
    skill_path: Path
    run_root: Path
    eval_def: dict
    run_type: str
    fixture_staging: Path | None
    skill_name: str
    skill_root: str


class FixturePreparer:
    """Prepare isolated eval working directories for one skill evaluation run.

    The preparer owns the old fixture preparation workflow as application code.
    It validates the skill's eval definitions, stages shared fixtures when an
    eval uses them, creates stable eval workdirs, and returns a PreparedRun
    object that the eval runner can consume directly. It does not write an
    interchange manifest file.
    """

    def __init__(self, options: PrepareFixtureOptions):
        self.options = options

    def prepare(self) -> PreparedRun:
        skill_root = get_provider_skill_root_or_exit(self.options.provider)

        skill_path = self.options.skill_path.expanduser().resolve()
        evals_data = load_skill_evals_data_or_exit(skill_path)
        eval_defs = select_evals_or_exit(
            evals_data.get("evals", []), self.options.eval_ids
        )
        selected_evals_data = {**evals_data, "evals": eval_defs}
        skill_name = evals_data.get("skill_name", skill_path.name)

        # Providers with native skill discovery may not discover skills in temp
        # directories, so callers should provide a real workspace-local run root.
        base = self.options.run_root.expanduser().resolve()
        base.mkdir(parents=True, exist_ok=True)

        fixture_staging = resolve_fixture_staging_or_exit(selected_evals_data, base)
        run_root = create_workdir_root(base)

        prepared_evals = [
            prepare_eval(
                skill_path=skill_path,
                run_root=run_root,
                eval_def=eval_def,
                fixture_staging=fixture_staging,
                skill_name=skill_name,
                skill_root=skill_root,
            )
            for eval_def in eval_defs
        ]

        return PreparedRun(
            eval_definitions_path=(skill_path / "evals" / "evals.json").resolve(),
            run_root=base,
            provider=self.options.provider,
            skill_name=skill_name,
            evals=prepared_evals,
        )


def _optional_path_to_string(path: Path | None) -> str | None:
    return str(path) if path else None


def run_git_or_exit(cmd: list[str], error_prefix: str) -> str:
    """Run a git command and return stdout, exiting with context on failure."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=GIT_COMMAND_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        print(
            f"{error_prefix}: git command timed out after "
            f"{GIT_COMMAND_TIMEOUT_SECONDS}s",
            file=sys.stderr,
        )
        sys.exit(1)
    if result.returncode != 0:
        print(
            f"{error_prefix}:\n{result.stderr}",
            file=sys.stderr,
        )
        sys.exit(1)
    return result.stdout.strip()


def resolve_ref_or_exit(dest: Path, ref: str | None) -> str:
    """Resolve a fixture ref to a concrete commit.

    Fixture refs must be full commit SHAs so fixture-backed evals do not
    depend on mutable remote defaults, branches, or tags.
    """
    if not ref:
        print(
            "Error: fixture_ref is required when fixture_repo is set", file=sys.stderr
        )
        sys.exit(1)

    candidates = ref_candidates(ref)
    resolved = first_resolved_ref(dest, candidates)
    if resolved:
        return resolved

    if fetch_ref(dest, ref):
        resolved = first_resolved_ref(dest, candidates)
        if resolved:
            return resolved

    print(
        f"Error: could not resolve fixture_ref '{ref}' in {dest}",
        file=sys.stderr,
    )
    sys.exit(1)


def ref_candidates(ref: str) -> list[str]:
    return [
        ref,
        f"{ref}^{{commit}}",
        f"origin/{ref}",
        f"origin/{ref}^{{commit}}",
        f"refs/tags/{ref}",
        f"refs/tags/{ref}^{{commit}}",
    ]


def first_resolved_ref(dest: Path, candidates: list[str]) -> str | None:
    for candidate in candidates:
        try:
            result = subprocess.run(
                ["git", "-C", str(dest), "rev-parse", "--verify", candidate],
                capture_output=True,
                text=True,
                timeout=GIT_COMMAND_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            continue
        if result.returncode == 0:
            return result.stdout.strip()
    return None


def fetch_ref(dest: Path, ref: str) -> bool:
    try:
        result = subprocess.run(
            ["git", "-C", str(dest), "fetch", "origin", ref],
            capture_output=True,
            text=True,
            timeout=GIT_COMMAND_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return False
    return result.returncode == 0


def git_clone_or_pull(repo_url: str, dest: Path, ref: str | None = None) -> None:
    """Clone the repo or, if it already exists, reset it to a clean remote state.

    Uses fetch + reset --hard + clean rather than pull so that untracked or
    modified files left by previous eval agents never block the update.
    The canonical source must always be pristine before copies are made.
    """
    git_dir = dest / ".git"
    if git_dir.exists():
        run_git_or_exit(
            ["git", "-C", str(dest), "fetch", "--tags", "origin"],
            "Error: fixture repo fetch failed",
        )
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            clone_result = subprocess.run(
                ["git", "clone", repo_url, str(dest)],
                capture_output=True,
                text=True,
                timeout=GIT_COMMAND_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            print(
                f"Error: git clone timed out after {GIT_COMMAND_TIMEOUT_SECONDS}s",
                file=sys.stderr,
            )
            sys.exit(1)
        if clone_result.returncode != 0:
            print(f"Error: git clone failed:\n{clone_result.stderr}", file=sys.stderr)
            sys.exit(1)
        run_git_or_exit(
            ["git", "-C", str(dest), "fetch", "--tags", "origin"],
            "Error: fixture repo tag fetch failed",
        )

    resolved_ref = resolve_ref_or_exit(dest, ref)
    run_git_or_exit(
        ["git", "-C", str(dest), "reset", "--hard", resolved_ref],
        "Error: fixture repo reset failed",
    )
    run_git_or_exit(
        ["git", "-C", str(dest), "clean", "-fd"],
        "Error: fixture repo clean failed",
    )


def copy_skill(
    skill_path: Path, dest_run_dir: Path, skill_name: str, skill_root: str
) -> None:
    """Copy the skill under test into the run directory's skill discovery folder.

    The destination follows the convention <run_dir>/<skill_root>/skills/<skill_name>/
    where skill_root varies by provider (.claude, .codex, .github, .agents, etc.)
    and skills/<skill_name>/ is standard across all providers.
    """
    skill_dest = skill_directory_path(dest_run_dir, skill_root, skill_name)
    skill_dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        skill_path,
        skill_dest,
        ignore=shutil.ignore_patterns("fixtures", "evals", "__pycache__", ".git"),
    )


def write_eval_gitignore(run_dir: Path) -> None:
    """Ignore copied provider auth files inside an eval working directory."""
    gitignore_path = run_dir / ".gitignore"
    existing_entries = []
    if gitignore_path.exists():
        existing_entries = gitignore_path.read_text(encoding="utf-8").splitlines()

    if GITIGNORE_AUTH_ENTRY in existing_entries:
        return

    entries = [*existing_entries, GITIGNORE_AUTH_ENTRY]
    gitignore_path.write_text("\n".join(entries) + "\n", encoding="utf-8")


def copy_eval_files_or_exit(
    skill_path: Path, dest_run_dir: Path, files: list[str], eval_id: str
) -> None:
    """Copy eval input files into the run directory, preserving relative paths.

    File paths are relative to the skill root. They are copied into both
    skill and baseline working directories so the agent can access
    them naturally by browsing the run directory.
    """
    skill_root = skill_path.resolve()

    for raw_path in files:
        relative_path = Path(raw_path)
        source = (skill_path / relative_path).resolve()

        try:
            source.relative_to(skill_root)
        except ValueError:
            print(
                f"Error: eval file '{raw_path}' escapes the skill root "
                f"(referenced by eval id={eval_id})",
                file=sys.stderr,
            )
            sys.exit(1)

        if not source.exists():
            print(
                f"Error: eval file '{raw_path}' not found at {source} "
                f"(referenced by eval id={eval_id})",
                file=sys.stderr,
            )
            sys.exit(1)

        if not source.is_file():
            print(
                f"Error: eval file '{raw_path}' is not a file at {source} "
                f"(referenced by eval id={eval_id})",
                file=sys.stderr,
            )
            sys.exit(1)

        destination = dest_run_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def load_skill_evals_data_or_exit(skill_path: Path) -> dict:
    """Load evals/evals.json for a skill directory."""
    evals_json_path = skill_path / "evals" / "evals.json"

    if not evals_json_path.exists():
        print(f"Error: evals.json not found at {evals_json_path}", file=sys.stderr)
        sys.exit(1)

    evals_data = load_evals_json_or_exit(evals_json_path)
    validate_evals_data_or_exit(evals_data)
    validate_eval_fixture_names_or_exit(evals_data)
    return evals_data


def validate_eval_fixture_names_or_exit(evals_data: dict) -> None:
    for eval_def in evals_data.get("evals", []):
        eval_definition = EvalDefinition(eval_def)
        fixture_name = eval_definition.fixture_name
        if fixture_name:
            fixture_relative_path_or_exit(fixture_name, eval_definition.eval_id_string)


def resolve_fixture_staging_or_exit(evals_data: dict, base: Path) -> Path | None:
    """Resolve or prepare the fixture source directory for this run."""
    has_fixtures = any(
        EvalDefinition(eval_def).fixture_name
        for eval_def in evals_data.get("evals", [])
    )
    if not has_fixtures:
        return None

    fixture_repo = evals_data.get("fixture_repo")
    fixture_ref = evals_data.get("fixture_ref")
    fixture_base_raw = evals_data.get("fixture_base_path")

    if fixture_repo and fixture_base_raw:
        print(
            "Error: fixture_base_path cannot be used with fixture_repo",
            file=sys.stderr,
        )
        sys.exit(1)

    if fixture_base_raw:
        fixture_staging = Path(fixture_base_raw).expanduser().resolve()
    else:
        fixture_staging = base / "fixtures"

    if fixture_repo:
        require_fixture_ref_or_exit(fixture_ref)
        git_clone_or_pull(fixture_repo, fixture_staging, fixture_ref)
    elif not fixture_staging.exists():
        print(
            f"Error: fixture_base_path {fixture_staging} does not exist and "
            "no fixture_repo is defined to clone from",
            file=sys.stderr,
        )
        sys.exit(1)

    return fixture_staging


def require_fixture_ref_or_exit(fixture_ref: str | None) -> None:
    if not fixture_ref:
        print(
            "Error: fixture_ref is required when fixture_repo is set", file=sys.stderr
        )
        sys.exit(1)
    if is_commit_sha(fixture_ref):
        return
    print(
        "Error: fixture_ref must be a 40-character commit SHA",
        file=sys.stderr,
    )
    sys.exit(1)


def is_commit_sha(ref: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-fA-F]{40}", ref))


def fixture_relative_path_or_exit(fixture_name: str, eval_id: str) -> Path:
    relative_path = Path(fixture_name)
    if relative_path.is_absolute():
        print(
            f"Error: fixture '{fixture_name}' must be a relative fixture directory "
            f"name (referenced by eval id={eval_id})",
            file=sys.stderr,
        )
        sys.exit(1)
    if ".." in relative_path.parts:
        print(
            f"Error: fixture '{fixture_name}' escapes the fixture source root "
            f"(referenced by eval id={eval_id})",
            file=sys.stderr,
        )
        sys.exit(1)
    return relative_path


def require_fixture_path_inside_root_or_exit(
    path: Path,
    root: Path,
    fixture_name: str,
    eval_id: str,
    root_description: str,
) -> Path:
    resolved_path = path.resolve()
    resolved_root = root.resolve()
    try:
        resolved_path.relative_to(resolved_root)
    except ValueError:
        print(
            f"Error: fixture '{fixture_name}' escapes the {root_description} "
            f"(referenced by eval id={eval_id})",
            file=sys.stderr,
        )
        sys.exit(1)
    return resolved_path


def copy_fixture_or_exit(fixture: FixtureCopy) -> Path:
    """Copy one eval fixture for a single run type."""
    relative_path = fixture_relative_path_or_exit(fixture.fixture_name, fixture.eval_id)
    source = require_fixture_path_inside_root_or_exit(
        fixture.fixture_staging / relative_path,
        fixture.fixture_staging,
        fixture.fixture_name,
        fixture.eval_id,
        "fixture source root",
    )
    if not source.exists():
        print(
            f"Error: fixture '{fixture.fixture_name}' not found at {source} "
            f"(referenced by eval id={fixture.eval_id})",
            file=sys.stderr,
        )
        sys.exit(1)

    if fixture.fixture_placement is FixturePlacement.WORKDIR:
        dest = require_fixture_path_inside_root_or_exit(
            fixture.run_dir / relative_path,
            fixture.run_dir,
            fixture.fixture_name,
            fixture.eval_id,
            "prepared run directory",
        )
        shutil.copytree(source, dest)
        return dest

    external_dir = fixture.eval_dir / f"{fixture.run_type}_fixtures"
    external_dir.mkdir(parents=True, exist_ok=True)
    dest = require_fixture_path_inside_root_or_exit(
        external_dir / relative_path,
        external_dir,
        fixture.fixture_name,
        fixture.eval_id,
        "prepared fixture directory",
    )
    if not dest.exists():
        shutil.copytree(source, dest)
    return dest


def prepare_run_type(preparation: RunTypePreparation) -> PreparedRunTypeEntry:
    """Prepare one eval run-type working directory."""
    eval_definition = EvalDefinition(preparation.eval_def)
    eval_id = eval_definition.eval_id_string
    eval_dir = preparation.run_root / f"eval-{eval_id}"
    run_dir = eval_dir / preparation.run_type
    run_dir.mkdir(parents=True, exist_ok=True)
    write_eval_gitignore(run_dir)

    fixture_path = None
    fixture_name = eval_definition.fixture_name
    if fixture_name and preparation.fixture_staging:
        fixture_path = copy_fixture_or_exit(
            FixtureCopy(
                fixture_staging=preparation.fixture_staging,
                eval_dir=eval_dir,
                run_dir=run_dir,
                run_type=preparation.run_type,
                fixture_name=fixture_name,
                fixture_placement=eval_definition.fixture_placement,
                eval_id=eval_id,
            )
        )

    eval_files = eval_definition.files
    if eval_files:
        copy_eval_files_or_exit(preparation.skill_path, run_dir, eval_files, eval_id)

    if preparation.run_type == SKILL_RUN_TYPE:
        copy_skill(
            preparation.skill_path,
            run_dir,
            preparation.skill_name,
            preparation.skill_root,
        )

    skill_file = None
    if preparation.run_type == SKILL_RUN_TYPE:
        skill_file = skill_file_path(
            run_dir,
            preparation.skill_root,
            preparation.skill_name,
        )
    return PreparedRunTypeEntry(run_dir, fixture_path, skill_file)


def build_prepared_eval(
    eval_def: dict,
    run_paths: dict[str, PreparedRunTypeEntry],
) -> PreparedEval:
    """Build the prepared run entry for one eval."""
    eval_definition = EvalDefinition(eval_def)
    skill_entry = run_paths[SKILL_RUN_TYPE]
    baseline_entry = run_paths[BASELINE_RUN_TYPE]
    return PreparedEval(
        eval_id=eval_definition.eval_id,
        eval_name=eval_definition.eval_name,
        skill_run_path=skill_entry.run_dir,
        baseline_run_path=baseline_entry.run_dir,
        skill_file=skill_entry.require_skill_file(),
        skill_fixture_path=skill_entry.fixture_path,
        baseline_fixture_path=baseline_entry.fixture_path,
    )


def _optional_string_to_path(path: str | None) -> Path | None:
    return Path(path) if path else None


def prepare_eval(
    skill_path: Path,
    run_root: Path,
    eval_def: dict,
    fixture_staging: Path | None,
    skill_name: str,
    skill_root: str,
) -> PreparedEval:
    """Prepare all run types for one eval and return its manifest entry."""
    eval_definition = EvalDefinition(eval_def)
    reset_prepared_eval_dir(run_root, eval_definition.eval_id)
    run_paths = {
        run_type: prepare_run_type(
            RunTypePreparation(
                skill_path=skill_path,
                run_root=run_root,
                eval_def=eval_def,
                run_type=run_type,
                fixture_staging=fixture_staging,
                skill_name=skill_name,
                skill_root=skill_root,
            )
        )
        for run_type in RUN_TYPES
    }
    return build_prepared_eval(eval_def, run_paths)


def reset_prepared_eval_dir(run_root: Path, eval_id: int) -> None:
    """Remove one prepared eval directory while preserving run-level results."""
    eval_dir = run_root / f"eval-{eval_id}"
    if not eval_dir.exists():
        return

    resolved_run_root = run_root.resolve()
    resolved_eval_dir = eval_dir.resolve()
    assert_eval_dir_inside_run_root_or_exit(
        resolved_run_root, resolved_eval_dir, eval_dir
    )

    shutil.rmtree(eval_dir)


def create_workdir_root(run_root: Path) -> Path:
    """Create an empty stable eval workdir root for this run."""
    workdirs = run_root / "workdirs"
    if workdirs.exists():
        remove_tree(workdirs)
    workdirs.mkdir(parents=True, exist_ok=True)
    return workdirs


def remove_tree(path: Path) -> None:
    """Remove an orchestrator-owned tree, retrying read-only files on Windows."""
    shutil.rmtree(path, onexc=retry_read_only_delete)


def retry_read_only_delete(function, path, _error) -> None:
    os.chmod(path, stat.S_IWRITE)
    function(path)


def assert_eval_dir_inside_run_root_or_exit(
    resolved_run_root: Path,
    resolved_eval_dir: Path,
    display_path: Path,
) -> None:
    if resolved_eval_dir.parent == resolved_run_root:
        return

    print(
        f"Error: refusing to remove eval directory outside run root: {display_path}",
        file=sys.stderr,
    )
    sys.exit(1)


def prepare(options: PrepareFixtureOptions) -> PreparedRun:
    return FixturePreparer(options).prepare()

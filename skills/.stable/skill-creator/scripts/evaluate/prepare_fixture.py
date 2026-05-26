#!/usr/bin/env python3
"""
Prepare isolated run directories for skill evals.

The orchestrator provides a skill directory, a base run root, and a provider.
The module reads <skill>/evals/evals.json, stages any shared fixture source,
creates a fresh prepared run root, and prepares one working directory for each
eval configuration:

    <run-root>/
      fixtures/                 # cloned or reused fixture source, when needed
      <skill>-eval-runs-xxxxxx/  # fresh prepared run root for this invocation
        eval-1/
          with_skill/            # provider-specific skills/<skill-name>/ copy
          without_skill/         # no skill copy

Each eval directory is isolated from every other eval directory. Within an eval,
the with_skill and without_skill configurations receive separate fixture copies
so changes made by one run cannot contaminate the other. Files listed in an
eval's files[] entry are copied into both configurations.

FixturePreparer returns a PreparedRun object as the in-memory handoff to the
eval runner:

    PreparedRun(
        eval_definitions_path=Path("<skill>/evals/evals.json"),
        run_root=Path("<prepared-run-root>"),
        provider="claude",
        skill_name="example-skill",
        evals=[
            PreparedEval(
                eval_id=1,
                eval_name="basic",
                with_skill_path=Path("<prepared-run-root>/eval-1/with_skill"),
                without_skill_path=Path("<prepared-run-root>/eval-1/without_skill"),
                skill_file=Path("<prepared-run-root>/eval-1/with_skill/.../SKILL.md"),
                with_skill_fixture_path=None,
                without_skill_fixture_path=None,
            )
        ],
    )
"""

import json
import os
import shutil
import stat
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from .eval_definitions import select_evals

CONFIGURATIONS = ("with_skill", "without_skill")
PROVIDER_SKILL_ROOTS = {
    "claude": ".claude",
    "codex": ".codex",
}
GITIGNORE_AUTH_ENTRY = "auth.json"


@dataclass(frozen=True)
class PrepareFixtureOptions:
    skill_path: Path
    run_root: Path
    provider: str
    skill_root: str | None = None
    eval_ids: str | None = None


@dataclass(frozen=True)
class PreparedEval:
    eval_id: int
    eval_name: str
    with_skill_path: Path
    without_skill_path: Path
    skill_file: Path
    with_skill_fixture_path: Path | None
    without_skill_fixture_path: Path | None

    def to_dict(self) -> dict:
        return {
            "eval_id": self.eval_id,
            "eval_name": self.eval_name,
            "with_skill_path": str(self.with_skill_path),
            "without_skill_path": str(self.without_skill_path),
            "skill_file": str(self.skill_file),
            "with_skill_fixture_path": _optional_path_to_string(
                self.with_skill_fixture_path
            ),
            "without_skill_fixture_path": _optional_path_to_string(
                self.without_skill_fixture_path
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


class FixturePreparer:
    """Prepare isolated eval working directories for one skill evaluation run.

    The preparer owns the old fixture preparation workflow as application code.
    It validates the skill's eval definitions, stages shared fixtures when an
    eval uses them, creates a fresh prepared run root, and returns a PreparedRun
    object that the eval runner can consume directly. It does not write an
    interchange manifest file.
    """

    def __init__(self, options: PrepareFixtureOptions):
        self.options = options

    def prepare(self) -> PreparedRun:
        skill_root = self.options.skill_root or get_provider_skill_root(
            self.options.provider
        )

        skill_path = self.options.skill_path.expanduser().resolve()
        evals_data = load_evals_data(skill_path)
        eval_defs = select_evals(evals_data.get("evals", []), self.options.eval_ids)
        selected_evals_data = {**evals_data, "evals": eval_defs}
        skill_name = evals_data.get("skill_name", skill_path.name)

        # Providers with native skill discovery may not discover skills in temp
        # directories, so callers should provide a real workspace-local run root.
        base = self.options.run_root.expanduser().resolve()
        base.mkdir(parents=True, exist_ok=True)

        reset_workdirs(base)
        fixture_staging = resolve_fixture_staging(selected_evals_data, base)
        run_root = base / "workdirs"
        run_root.mkdir(parents=True, exist_ok=True)

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


def run_git(cmd: list[str], error_prefix: str) -> str:
    """Run a git command and return stdout, exiting with context on failure."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(
            f"{error_prefix}:\n{result.stderr}",
            file=sys.stderr,
        )
        sys.exit(1)
    return result.stdout.strip()


def resolve_ref(dest: Path, ref: str | None) -> str:
    """Resolve a fixture ref to a concrete commit.

    Supports branch names, tags, commit SHAs, and any rev parse expression
    reachable after fetch. When no ref is provided, use origin/HEAD.
    """
    if not ref:
        return run_git(
            ["git", "-C", str(dest), "rev-parse", "origin/HEAD"],
            "Error: could not resolve origin/HEAD for fixture repo",
        )

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
        result = subprocess.run(
            ["git", "-C", str(dest), "rev-parse", "--verify", candidate],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    return None


def fetch_ref(dest: Path, ref: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(dest), "fetch", "origin", ref],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def git_clone_or_pull(repo_url: str, dest: Path, ref: str | None = None) -> None:
    """Clone the repo or, if it already exists, reset it to a clean remote state.

    Uses fetch + reset --hard + clean rather than pull so that untracked or
    modified files left by previous eval agents never block the update.
    The canonical source must always be pristine before copies are made.
    """
    git_dir = dest / ".git"
    if git_dir.exists():
        run_git(
            ["git", "-C", str(dest), "fetch", "--tags", "origin"],
            "Error: fixture repo fetch failed",
        )
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        clone_result = subprocess.run(
            ["git", "clone", repo_url, str(dest)],
            capture_output=True,
            text=True,
        )
        if clone_result.returncode != 0:
            print(f"Error: git clone failed:\n{clone_result.stderr}", file=sys.stderr)
            sys.exit(1)
        run_git(
            ["git", "-C", str(dest), "fetch", "--tags", "origin"],
            "Error: fixture repo tag fetch failed",
        )

    resolved_ref = resolve_ref(dest, ref)
    run_git(
        ["git", "-C", str(dest), "reset", "--hard", resolved_ref],
        "Error: fixture repo reset failed",
    )
    run_git(
        ["git", "-C", str(dest), "clean", "-fd"],
        "Error: fixture repo clean failed",
    )


def copy_skill(
    skill_path: Path, dest_run_dir: Path, skill_name: str, skill_root: str = ".claude"
) -> None:
    """Copy the skill under test into the run directory's skill discovery folder.

    The destination follows the convention <run_dir>/<skill_root>/skills/<skill_name>/
    where skill_root varies by provider (.claude, .codex, .github, .agents, etc.)
    and skills/<skill_name>/ is standard across all providers.
    """
    skill_dest = dest_run_dir / skill_root / "skills" / skill_name
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


def copy_eval_files(
    skill_path: Path, dest_run_dir: Path, files: list[str], eval_id: str
) -> None:
    """Copy eval input files into the run directory, preserving relative paths.

    File paths are relative to the skill root. They are copied into both
    with_skill and without_skill working directories so the agent can access
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


def load_evals_data(skill_path: Path) -> dict:
    """Load evals/evals.json for a skill directory."""
    evals_json_path = skill_path / "evals" / "evals.json"

    if not evals_json_path.exists():
        print(f"Error: evals.json not found at {evals_json_path}", file=sys.stderr)
        sys.exit(1)

    with open(evals_json_path, encoding="utf-8") as f:
        return json.load(f)


def resolve_fixture_staging(evals_data: dict, base: Path) -> Path | None:
    """Resolve or prepare the fixture source directory for this run."""
    has_fixtures = any(e.get("fixture") for e in evals_data.get("evals", []))
    if not has_fixtures:
        return None

    fixture_repo = evals_data.get("fixture_repo")
    fixture_ref = evals_data.get("fixture_ref")
    fixture_base_raw = evals_data.get("fixture_base_path")

    if fixture_base_raw:
        fixture_staging = Path(fixture_base_raw).expanduser().resolve()
    else:
        fixture_staging = base / "fixtures"

    if fixture_repo:
        git_clone_or_pull(fixture_repo, fixture_staging, fixture_ref)
    elif not fixture_staging.exists():
        print(
            f"Error: fixture_base_path {fixture_staging} does not exist and "
            "no fixture_repo is defined to clone from",
            file=sys.stderr,
        )
        sys.exit(1)

    return fixture_staging


def copy_fixture(
    fixture_staging: Path,
    eval_dir: Path,
    run_dir: Path,
    config: str,
    fixture_name: str,
    fixture_in_workdir: bool,
    eval_id: str,
) -> str:
    """Copy one eval fixture for a single run configuration."""
    source = fixture_staging / fixture_name
    if not source.exists():
        print(
            f"Error: fixture '{fixture_name}' not found at {source} "
            f"(referenced by eval id={eval_id})",
            file=sys.stderr,
        )
        sys.exit(1)

    if fixture_in_workdir:
        dest = run_dir / fixture_name
        shutil.copytree(source, dest)
        return str(dest)

    external_dir = eval_dir / f"{config}_fixtures"
    external_dir.mkdir(parents=True, exist_ok=True)
    dest = external_dir / fixture_name
    if not dest.exists():
        shutil.copytree(source, dest)
    return str(dest)


def prepare_configuration(
    skill_path: Path,
    run_root: Path,
    eval_def: dict,
    config: str,
    fixture_staging: Path | None,
    skill_name: str,
    skill_root: str,
) -> dict:
    """Prepare one eval/configuration working directory."""
    eval_id = str(eval_def["id"])
    eval_dir = run_root / f"eval-{eval_id}"
    run_dir = eval_dir / config
    run_dir.mkdir(parents=True, exist_ok=True)
    write_eval_gitignore(run_dir)

    fixture_path = None
    fixture_name = eval_def.get("fixture")
    if fixture_name and fixture_staging:
        fixture_path = copy_fixture(
            fixture_staging=fixture_staging,
            eval_dir=eval_dir,
            run_dir=run_dir,
            config=config,
            fixture_name=fixture_name,
            fixture_in_workdir=eval_def.get("fixture_in_workdir", True),
            eval_id=eval_id,
        )

    eval_files = eval_def.get("files", [])
    if eval_files:
        copy_eval_files(skill_path, run_dir, eval_files, eval_id)

    if config == "with_skill":
        copy_skill(skill_path, run_dir, skill_name, skill_root)

    entry = {"path": str(run_dir)}
    if fixture_path:
        entry["fixture_path"] = fixture_path
    if config == "with_skill":
        entry["skill_file"] = str(
            run_dir / skill_root / "skills" / skill_name / "SKILL.md"
        )
    return entry


def build_prepared_eval(eval_def: dict, run_paths: dict[str, dict]) -> PreparedEval:
    """Build the prepared run entry for one eval."""
    eval_id = str(eval_def["id"])
    with_skill_entry = run_paths["with_skill"]
    without_skill_entry = run_paths["without_skill"]
    return PreparedEval(
        eval_id=eval_def["id"],
        eval_name=eval_def.get("eval_name", f"eval-{eval_id}"),
        with_skill_path=Path(with_skill_entry["path"]),
        without_skill_path=Path(without_skill_entry["path"]),
        skill_file=Path(with_skill_entry["skill_file"]),
        with_skill_fixture_path=_optional_string_to_path(
            with_skill_entry.get("fixture_path")
        ),
        without_skill_fixture_path=_optional_string_to_path(
            without_skill_entry.get("fixture_path")
        ),
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
    """Prepare all configurations for one eval and return its manifest entry."""
    reset_prepared_eval_dir(run_root, eval_def["id"])
    run_paths = {
        config: prepare_configuration(
            skill_path=skill_path,
            run_root=run_root,
            eval_def=eval_def,
            config=config,
            fixture_staging=fixture_staging,
            skill_name=skill_name,
            skill_root=skill_root,
        )
        for config in CONFIGURATIONS
    }
    return build_prepared_eval(eval_def, run_paths)


def reset_prepared_eval_dir(run_root: Path, eval_id: int) -> None:
    """Remove one prepared eval directory while preserving run-level results."""
    eval_dir = run_root / f"eval-{eval_id}"
    if not eval_dir.exists():
        return

    resolved_run_root = run_root.resolve()
    resolved_eval_dir = eval_dir.resolve()
    assert_eval_dir_inside_run_root(resolved_run_root, resolved_eval_dir, eval_dir)

    shutil.rmtree(eval_dir)


def reset_workdirs(run_root: Path) -> None:
    """Clear the disposable workdir root before preparing a new run."""
    workdirs = run_root / "workdirs"
    if workdirs.exists():
        remove_tree(workdirs)
    workdirs.mkdir(parents=True, exist_ok=True)


def remove_tree(path: Path) -> None:
    """Remove an orchestrator-owned tree, retrying read-only files on Windows."""
    shutil.rmtree(path, onexc=retry_read_only_delete)


def retry_read_only_delete(function, path, _error) -> None:
    os.chmod(path, stat.S_IWRITE)
    function(path)


def assert_eval_dir_inside_run_root(
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


def get_provider_skill_root(provider_name: str) -> str:
    """Return the skill discovery root for a supported provider."""
    skill_root = PROVIDER_SKILL_ROOTS.get(provider_name)
    if skill_root is None:
        available = ", ".join(sorted(PROVIDER_SKILL_ROOTS))
        print(
            f"Error: unknown provider '{provider_name}'. Available: {available}",
            file=sys.stderr,
        )
        sys.exit(1)
    return skill_root


def prepare(options: PrepareFixtureOptions) -> PreparedRun:
    return FixturePreparer(options).prepare()

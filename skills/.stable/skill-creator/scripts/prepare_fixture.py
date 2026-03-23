#!/usr/bin/env python3
"""
Prepare isolated run directories for each eval before an iteration's runs.

Everything is created under --run-root:
  <run-root>/
  ├── fixtures/               # cloned/staged fixture repo (if any)
  └── <skill>-eval-runs-xxx/  # unique per invocation
      ├── eval-1/
      │   ├── with_skill/     # has .claude/skills/<name>/
      │   └── without_skill/  # no skill
      └── eval-2/
          └── ...

Three-step process:
  1. If fixture_repo is defined, clone (or reset) it into <run-root>/fixtures/.
  2. For EVERY eval in evals.json, create a run directory per configuration
     (with_skill, without_skill). If the eval has a fixture, copy it into
     the run directory.
  3. For with_skill configurations, copy the skill under test into the run
     directory at .claude/skills/<skill-name>/ so Claude Code discovers it
     naturally. without_skill directories get no skill.

Claude Code does not discover skills in temp directories. The caller must
provide a --run-root that points to a real (non-temp) path.

Usage:
    python -m scripts.prepare_fixture --skill-path /path/to/skill --run-root /path/to/run-root

Output (stdout): JSON mapping eval id -> {configuration -> entry}.
    Each entry has "path" (the agent's working directory) and optionally
    "fixture_path" (only present when the eval defines a fixture).

    {
      "1": {
        "with_skill":    {"path": "/run-root/.../eval-1/with_skill", "fixture_path": "/run-root/.../eval-1/with_skill/my-fixture"},
        "without_skill": {"path": "/run-root/.../eval-1/without_skill", "fixture_path": "/run-root/.../eval-1/without_skill/my-fixture"}
      },
      "2": {
        "with_skill":    {"path": "/run-root/.../eval-2/with_skill"},
        "without_skill": {"path": "/run-root/.../eval-2/without_skill"}
      }
    }
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def git_clone_or_pull(repo_url: str, dest: Path) -> None:
    """Clone the repo or, if it already exists, reset it to a clean remote state.

    Uses fetch + reset --hard + clean rather than pull so that untracked or
    modified files left by previous eval agents never block the update.
    The canonical source must always be pristine before copies are made.
    """
    git_dir = dest / ".git"
    if git_dir.exists():
        steps = [
            ["git", "-C", str(dest), "fetch", "origin"],
            ["git", "-C", str(dest), "reset", "--hard", "origin/HEAD"],
            ["git", "-C", str(dest), "clean", "-fd"],
        ]
        for cmd in steps:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(
                    f"Error: '{' '.join(cmd)}' failed:\n{result.stderr}",
                    file=sys.stderr,
                )
                sys.exit(1)
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            ["git", "clone", repo_url, str(dest)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"Error: git clone failed:\n{result.stderr}", file=sys.stderr)
            sys.exit(1)


def copy_skill(skill_path: Path, dest_run_dir: Path, skill_name: str, skill_root: str = ".claude") -> None:
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


def main():
    parser = argparse.ArgumentParser(
        description="Prepare isolated run directories for eval runs."
    )
    parser.add_argument(
        "--skill-path",
        required=True,
        help="Path to the skill directory containing evals/evals.json",
    )
    parser.add_argument(
        "--run-root",
        required=True,
        help="Directory to create run directories in. Providers with skill "
             "discovery may require a non-temp path.",
    )
    parser.add_argument(
        "--skill-root",
        default=".claude",
        help="Provider-specific root directory for skill placement. "
             "Skills are copied to <run-dir>/<skill-root>/skills/<name>/. "
             "Examples: .claude, .codex, .github, .agents (default: .claude)",
    )
    args = parser.parse_args()

    skill_path = Path(args.skill_path).expanduser().resolve()
    evals_json_path = skill_path / "evals" / "evals.json"

    if not evals_json_path.exists():
        print(f"Error: evals.json not found at {evals_json_path}", file=sys.stderr)
        sys.exit(1)

    with open(evals_json_path, encoding="utf-8") as f:
        evals_data = json.load(f)

    fixture_repo = evals_data.get("fixture_repo")
    fixture_base_raw = evals_data.get("fixture_base_path")
    skill_name = evals_data.get("skill_name", skill_path.name)

    # Everything lives under --run-root: fixture staging, run directories, etc.
    # Claude Code does not discover skills in temp directories so this must be
    # a real path provided by the caller.
    base = Path(args.run_root).expanduser().resolve()
    base.mkdir(parents=True, exist_ok=True)

    # Fixture staging area (only needed if any eval uses fixtures)
    has_fixtures = any(e.get("fixture") for e in evals_data.get("evals", []))

    if has_fixtures:
        if fixture_base_raw:
            fixture_staging = Path(fixture_base_raw).expanduser().resolve()
        else:
            fixture_staging = base / "fixtures"

        if fixture_repo:
            git_clone_or_pull(fixture_repo, fixture_staging)
        elif not fixture_staging.exists():
            print(
                f"Error: fixture_base_path {fixture_staging} does not exist and no fixture_repo is defined to clone from",
                file=sys.stderr,
            )
            sys.exit(1)
    else:
        fixture_staging = None

    # Unique subdirectory for this invocation's run directories to prevent
    # cross-iteration contamination.
    run_root = Path(tempfile.mkdtemp(prefix=f"{skill_name}-eval-runs-", dir=base))

    CONFIGURATIONS = ["with_skill", "without_skill"]
    run_paths: dict[str, dict] = {}

    for eval_def in evals_data.get("evals", []):
        eval_id = str(eval_def["id"])
        fixture_name = eval_def.get("fixture")
        fixture_in_workdir = eval_def.get("fixture_in_workdir", True)

        run_paths[eval_id] = {}
        for config in CONFIGURATIONS:
            run_dir = run_root / f"eval-{eval_id}" / config
            run_dir.mkdir(parents=True, exist_ok=True)

            fixture_path = None
            if fixture_name and fixture_staging:
                source = fixture_staging / fixture_name
                if not source.exists():
                    print(
                        f"Error: fixture '{fixture_name}' not found at {source} (referenced by eval id={eval_id})",
                        file=sys.stderr,
                    )
                    sys.exit(1)

                if fixture_in_workdir:
                    # Copy fixture into the run directory (agent sees it immediately)
                    dest = run_dir / fixture_name
                    shutil.copytree(source, dest)
                    fixture_path = str(dest)
                else:
                    # Copy fixture to a sibling directory outside the run directory
                    # so the agent cannot discover it by browsing its working directory.
                    # Only accessible via {{FIXTURE_PATH}} substitution in prompts.
                    external_dir = run_dir.parent / f"{config}_fixtures"
                    external_dir.mkdir(parents=True, exist_ok=True)
                    dest = external_dir / fixture_name
                    if not dest.exists():
                        shutil.copytree(source, dest)
                    fixture_path = str(dest)

            # Copy skill into with_skill run directories
            if config == "with_skill":
                copy_skill(skill_path, run_dir, skill_name, args.skill_root)

            entry = {"path": str(run_dir)}
            if fixture_path:
                entry["fixture_path"] = fixture_path
            if config == "with_skill":
                entry["skill_file"] = str(
                    run_dir / args.skill_root / "skills" / skill_name / "SKILL.md"
                )
            run_paths[eval_id][config] = entry

    print(json.dumps(run_paths, indent=2))


if __name__ == "__main__":
    main()

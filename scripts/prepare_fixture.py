#!/usr/bin/env python3
"""
Prepare isolated run directories for each eval before an iteration's runs.

Three-step process:
  1. If fixture_repo is defined, clone (or reset) it into a temp staging area.
  2. For EVERY eval in evals.json, create a run directory per configuration
     (with_skill, without_skill). If the eval has a fixture, copy it into
     the run directory.
  3. For with_skill configurations, copy the skill under test into the run
     directory at .claude/skills/<skill-name>/ so Claude Code discovers it
     naturally. without_skill directories get no skill.

Each eval agent receives its own isolated run directory and works exclusively
inside it. The skill is discovered through normal Claude Code mechanisms
rather than being passed as a prompt parameter.

Usage:
    python -m scripts.prepare_fixture --skill-path /path/to/skill

Output (stdout): JSON mapping eval id (string) -> {configuration: path}
    {
      "1": {
        "with_skill":    "/tmp/.../eval-1/with_skill",
        "without_skill": "/tmp/.../eval-1/without_skill"
      },
      "2": { ... }
    }

Every eval appears in the output, regardless of whether it has a fixture.
The path points to the run directory root (the agent's working directory).
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


def copy_skill(skill_path: Path, dest_run_dir: Path, skill_name: str) -> None:
    """Copy the skill under test into the run directory's .claude/skills/ folder."""
    skill_dest = dest_run_dir / ".claude" / "skills" / skill_name
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
    args = parser.parse_args()

    skill_path = Path(args.skill_path).expanduser().resolve()
    evals_json_path = skill_path / "evals" / "evals.json"

    if not evals_json_path.exists():
        print(f"Error: evals.json not found at {evals_json_path}", file=sys.stderr)
        sys.exit(1)

    with open(evals_json_path) as f:
        evals_data = json.load(f)

    fixture_repo = evals_data.get("fixture_repo")
    fixture_base_raw = evals_data.get("fixture_base_path")
    skill_name = evals_data.get("skill_name", skill_path.name)

    # Fixture staging area (only needed if any eval uses fixtures)
    has_fixtures = any(e.get("fixture") for e in evals_data.get("evals", []))

    if has_fixtures:
        if fixture_base_raw:
            fixture_staging = Path(fixture_base_raw).expanduser().resolve()
        else:
            fixture_staging = Path(tempfile.gettempdir()) / f"{skill_name}-eval-fixtures"

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

    # Run directory root (separate from fixture staging)
    run_root = Path(tempfile.gettempdir()) / f"{skill_name}-eval-runs"
    if run_root.exists():
        shutil.rmtree(run_root)
    run_root.mkdir()

    CONFIGURATIONS = ["with_skill", "without_skill"]
    run_paths: dict[str, dict[str, str]] = {}

    for eval_def in evals_data.get("evals", []):
        eval_id = str(eval_def["id"])
        fixture_name = eval_def.get("fixture")

        run_paths[eval_id] = {}
        for config in CONFIGURATIONS:
            run_dir = run_root / f"eval-{eval_id}" / config
            run_dir.mkdir(parents=True, exist_ok=True)

            # Copy fixture into run directory if this eval has one
            if fixture_name and fixture_staging:
                source = fixture_staging / fixture_name
                if not source.exists():
                    print(
                        f"Error: fixture '{fixture_name}' not found at {source} (referenced by eval id={eval_id})",
                        file=sys.stderr,
                    )
                    sys.exit(1)
                shutil.copytree(source, run_dir / fixture_name)

            # Copy skill into with_skill run directories
            if config == "with_skill":
                copy_skill(skill_path, run_dir, skill_name)

            run_paths[eval_id][config] = str(run_dir)

    print(json.dumps(run_paths, indent=2))


if __name__ == "__main__":
    main()

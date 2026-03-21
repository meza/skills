#!/usr/bin/env python3
"""
Prepare clean per-eval fixture copies before an iteration's eval runs.

Two-step process:
  1. Clone fixture_repo into fixture_base_path if not already cloned.
     If the clone already exists, reset it to the clean remote state so
     modifications left by previous eval agents cannot affect new runs.
  2. Wipe fixture_base_path/eval/ entirely, then for every eval in
     evals.json that has a 'fixture' field, create one copy per
     configuration:
       fixture_base_path/eval/eval-<id>/with_skill/<fixture-name>/
       fixture_base_path/eval/eval-<id>/without_skill/<fixture-name>/

Each eval agent receives its own unique fixture path and works exclusively
inside that directory. Separate copies per configuration prevent parallel
with_skill and without_skill agents from modifying each other's fixture
when both write to the codebase (e.g. implementing a fix or adding a route).
The canonical source at fixture_base_path/<name>/ is never handed to an
agent — only copies are.

Usage:
    python -m scripts.prepare_fixture --skill-path /path/to/skill

Output (stdout): JSON mapping eval id (string) -> {configuration: path}
    {
      "1": {
        "with_skill":    "/path/.../eval/eval-1/with_skill/run-management-app",
        "without_skill": "/path/.../eval/eval-1/without_skill/run-management-app"
      },
      "2": { ... }
    }

Only evals with a 'fixture' field appear in the output. Pure-prompt evals
(no 'fixture' field) are omitted — they don't need a fixture path.
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


def main():
    parser = argparse.ArgumentParser(
        description="Prepare per-eval fixture copies from the canonical fixture repo."
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

    if fixture_base_raw:
        fixture_base = Path(fixture_base_raw).expanduser().resolve()
    else:
        # Default to the system temp directory so fixtures never live inside
        # the skill directory. tempfile.gettempdir() is cross-platform
        # (e.g. /tmp on Unix, %TEMP% on Windows).
        fixture_base = Path(tempfile.gettempdir()) / f"{skill_name}-eval-fixtures"

    # Step 1: Clone or pull the fixture repo into fixture_base_path
    if fixture_repo:
        git_clone_or_pull(fixture_repo, fixture_base)
    elif not fixture_base.exists():
        print(
            f"Error: fixture_base_path {fixture_base} does not exist and no fixture_repo is defined to clone from",
            file=sys.stderr,
        )
        sys.exit(1)

    # Step 2: Wipe the eval/ staging area and rebuild from scratch
    eval_staging = fixture_base / "eval"
    if eval_staging.exists():
        shutil.rmtree(eval_staging)
    eval_staging.mkdir()

    CONFIGURATIONS = ["with_skill", "without_skill"]
    fixture_paths: dict[str, dict[str, str]] = {}

    for eval_def in evals_data.get("evals", []):
        fixture_name = eval_def.get("fixture")
        if not fixture_name:
            continue

        eval_id = str(eval_def["id"])
        source = fixture_base / fixture_name

        if not source.exists():
            print(
                f"Error: fixture '{fixture_name}' not found at {source} (referenced by eval id={eval_id})",
                file=sys.stderr,
            )
            sys.exit(1)

        fixture_paths[eval_id] = {}
        for config in CONFIGURATIONS:
            dest = eval_staging / f"eval-{eval_id}" / config / fixture_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, dest)
            fixture_paths[eval_id][config] = str(dest)

    print(json.dumps(fixture_paths, indent=2))


if __name__ == "__main__":
    main()

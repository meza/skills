"""Resolve prepared run directories for skill eval execution."""

import sys
from pathlib import Path

from .providers import Provider
from .run_layout import RUN_TYPES, SKILL_RUN_TYPE, skill_file_path


def _exit_with_error(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def _require_existing_path(path: Path, message: str) -> None:
    if not path.exists():
        _exit_with_error(message)


def _fixture_path_for(
    eval_dir: Path,
    run_dir: Path,
    run_type: str,
    fixture_name: str,
    fixture_in_workdir: bool,
) -> Path:
    if fixture_in_workdir:
        return run_dir / fixture_name
    return eval_dir / f"{run_type}_fixtures" / fixture_name


def _build_run_type_entry(
    eval_dir: Path,
    run_type: str,
    provider: Provider,
    skill_name: str,
    fixture_name: str | None,
    fixture_in_workdir: bool,
) -> dict:
    run_dir = eval_dir / run_type
    _require_existing_path(
        run_dir,
        f"Error: prepared run directory not found at {run_dir}. "
        "Run prepare_fixture.py first or point --run-root at the correct "
        "prepared run root.",
    )

    entry = {"path": str(run_dir)}

    if fixture_name:
        fixture_path = _fixture_path_for(
            eval_dir,
            run_dir,
            run_type,
            fixture_name,
            fixture_in_workdir,
        )
        _require_existing_path(
            fixture_path,
            f"Error: fixture '{fixture_name}' for eval {eval_dir.name} "
            f"run type {run_type} not found at {fixture_path}. "
            "Run prepare_fixture.py first.",
        )
        entry["fixture_path"] = str(fixture_path)

    if run_type == SKILL_RUN_TYPE:
        skill_file = skill_file_path(run_dir, provider.skill_root, skill_name)
        _require_existing_path(
            skill_file,
            f"Error: skill file not found at {skill_file}. "
            "Run prepare_fixture.py first or use the matching provider.",
        )
        entry["skill_file"] = str(skill_file)

    return entry


def _build_eval_paths(
    run_root: Path,
    provider: Provider,
    eval_def: dict,
    skill_name: str,
) -> dict:
    eval_id = str(eval_def["id"])
    eval_dir = run_root / f"eval-{eval_id}"
    _require_existing_path(
        eval_dir,
        f"Error: prepared eval directory not found at {eval_dir}. "
        "Run prepare_fixture.py first or point --run-root at the correct "
        "prepared run root.",
    )

    fixture_name = eval_def.get("fixture")
    fixture_in_workdir = eval_def.get("fixture_in_workdir", True)
    return {
        run_type: _build_run_type_entry(
            eval_dir,
            run_type,
            provider,
            skill_name,
            fixture_name,
            fixture_in_workdir,
        )
        for run_type in RUN_TYPES
    }


def build_run_paths(
    run_root: Path,
    provider: Provider,
    evals_list: list[dict],
    skill_name: str,
) -> dict:
    """Resolve run directories from a prepared run root."""
    run_root = run_root.expanduser().resolve()
    if not run_root.exists():
        print(
            f"Error: prepared run root {run_root} does not exist. "
            "Run prepare_fixture.py first.",
            file=sys.stderr,
        )
        sys.exit(1)

    return {
        str(eval_def["id"]): _build_eval_paths(
            run_root,
            provider,
            eval_def,
            skill_name,
        )
        for eval_def in evals_list
    }

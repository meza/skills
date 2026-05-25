"""Run a skill-local preparation hook after generic fixture preparation."""

import subprocess
import sys
from pathlib import Path

from .prepare_fixture import PreparedEval, PreparedRun


class SkillPrepareHookError(RuntimeError):
    """Raised when a skill-local preparation hook fails."""


def run_skill_prepare_hook(
    skill_path: Path,
    prepared_run: PreparedRun,
    eval_ids: str | None,
) -> None:
    """Run optional skill-local preparation for selected prepared evals."""
    hook_path = skill_path / "scripts" / "prepare.py"
    if not hook_path.exists():
        return

    for eval_entry in _selected_prepared_evals(prepared_run.evals, eval_ids):
        _run_prepare_hook_for_eval(skill_path, hook_path, eval_entry)


def _selected_prepared_evals(
    prepared_evals: list[PreparedEval],
    eval_ids: str | None,
) -> list[PreparedEval]:
    if not eval_ids:
        return prepared_evals

    requested_ids = {eval_id.strip() for eval_id in eval_ids.split(",")}
    return [
        eval_entry
        for eval_entry in prepared_evals
        if str(eval_entry.eval_id) in requested_ids
    ]


def _run_prepare_hook_for_eval(
    skill_path: Path,
    hook_path: Path,
    eval_entry: PreparedEval,
) -> None:
    eval_run_dir = eval_entry.with_skill_path.parent

    result = subprocess.run(
        [
            sys.executable,
            str(hook_path),
            "--eval-id",
            str(eval_entry.eval_id),
            "--eval-run-dir",
            str(eval_run_dir),
        ],
        cwd=skill_path,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    if result.returncode == 0:
        return

    raise SkillPrepareHookError(
        "skill-local prepare hook failed for eval id "
        f"{eval_entry.eval_id} with exit code {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )

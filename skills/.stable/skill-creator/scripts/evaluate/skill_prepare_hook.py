"""Run a skill-local preparation hook after generic fixture preparation."""

import sys
from pathlib import Path

from .eval_job import run_with_timeout
from .prepare_fixture import PreparedEval, PreparedRun


class SkillPrepareHookError(RuntimeError):
    """Raised when a skill-local preparation hook fails."""


def run_skill_prepare_hook(
    skill_path: Path,
    prepared_run: PreparedRun,
    eval_ids: str | None,
    timeout: int = 600,
) -> None:
    """Run optional skill-local preparation for selected prepared evals."""
    hook_path = skill_path / "scripts" / "prepare.py"
    if not hook_path.exists():
        return

    for eval_entry in _selected_prepared_evals(prepared_run.evals, eval_ids):
        _run_prepare_hook_for_eval(skill_path, hook_path, eval_entry, timeout)


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
    timeout: int,
) -> None:
    eval_run_dir = eval_entry.with_skill_path.parent

    stdout, stderr, returncode, timed_out, _duration_ms = run_with_timeout(
        [
            sys.executable,
            str(hook_path),
            "--eval-id",
            str(eval_entry.eval_id),
            "--eval-run-dir",
            str(eval_run_dir),
        ],
        "",
        str(skill_path),
        timeout,
    )

    if returncode == 0 and not timed_out:
        return

    if timed_out:
        raise SkillPrepareHookError(
            "skill-local prepare hook timed out for eval id "
            f"{eval_entry.eval_id} after {timeout}s\n"
            f"stdout:\n{stdout}\n"
            f"stderr:\n{stderr}"
        )

    raise SkillPrepareHookError(
        "skill-local prepare hook failed for eval id "
        f"{eval_entry.eval_id} with exit code {returncode}\n"
        f"stdout:\n{stdout}\n"
        f"stderr:\n{stderr}"
    )

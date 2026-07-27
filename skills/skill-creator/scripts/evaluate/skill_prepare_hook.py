"""Run a skill-local preparation hook after generic fixture preparation."""

import sys
from dataclasses import dataclass
from pathlib import Path

from .eval_job import ActiveProcessRegistry, run_with_timeout
from .prepare_fixture import PreparedEval, PreparedRun
from .telemetry import redact_sensitive_telemetry


class SkillPrepareHookError(RuntimeError):
    """Raised when a skill-local preparation hook fails."""


@dataclass(frozen=True)
class SkillPrepareHookFailure:
    eval_id: int
    message: str


@dataclass(frozen=True)
class SkillPrepareHookResult:
    failures: list[SkillPrepareHookFailure]

    @property
    def failed_eval_ids(self) -> set[int]:
        return {failure.eval_id for failure in self.failures}

    @property
    def has_failures(self) -> bool:
        return bool(self.failures)


def run_skill_prepare_hook(
    skill_path: Path,
    prepared_run: PreparedRun,
    eval_ids: str | None,
    timeout: int = 600,
    process_registry: ActiveProcessRegistry | None = None,
) -> SkillPrepareHookResult:
    """Run optional skill-local preparation for selected prepared evals."""
    hook_path = skill_path / "scripts" / "prepare.py"
    if not hook_path.exists():
        return SkillPrepareHookResult([])

    registry = process_registry or ActiveProcessRegistry()
    failures = []
    for eval_entry in _selected_prepared_evals(prepared_run.evals, eval_ids):
        try:
            _run_prepare_hook_for_eval(
                skill_path, hook_path, eval_entry, timeout, registry
            )
        except SkillPrepareHookError as error:
            failures.append(
                SkillPrepareHookFailure(
                    eval_id=eval_entry.eval_id,
                    message=str(error),
                )
            )
            print(str(error), file=sys.stderr)
    return SkillPrepareHookResult(failures)


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
    process_registry: ActiveProcessRegistry,
) -> None:
    eval_run_dir = eval_entry.skill_run_path.parent

    process_result = run_with_timeout(
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
        process_registry=process_registry,
    )

    if process_result.returncode == 0 and not process_result.timed_out:
        return

    if process_result.timed_out:
        raise SkillPrepareHookError(
            "skill-local prepare hook timed out for eval id "
            f"{eval_entry.eval_id} after {timeout}s\n"
            f"stdout:\n{redact_sensitive_telemetry(process_result.stdout)}\n"
            f"stderr:\n{redact_sensitive_telemetry(process_result.stderr)}"
        )

    raise SkillPrepareHookError(
        "skill-local prepare hook failed for eval id "
        f"{eval_entry.eval_id} with exit code {process_result.returncode}\n"
        f"stdout:\n{redact_sensitive_telemetry(process_result.stdout)}\n"
        f"stderr:\n{redact_sensitive_telemetry(process_result.stderr)}"
    )

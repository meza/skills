#!/usr/bin/env python3
"""Prepare and run skill evals from one explicit command."""

import argparse
import signal
import json
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path

if __package__:
    from .evaluate.eval_job import ActiveProcessRegistry, stop_git_fsmonitor_daemons
    from .evaluate.prepare_fixture import FixturePreparer, PrepareFixtureOptions
    from .evaluate.providers.registry import PROVIDERS
    from .evaluate.results_aggregation import GradingResultAggregator
    from .evaluate.run_skill_evals import SkillEvalRunner, SkillEvalRunOptions
    from .evaluate.skill_prepare_hook import run_skill_prepare_hook
else:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from scripts.evaluate.eval_job import (
        ActiveProcessRegistry,
        stop_git_fsmonitor_daemons,
    )
    from scripts.evaluate.prepare_fixture import FixturePreparer, PrepareFixtureOptions
    from scripts.evaluate.providers.registry import PROVIDERS
    from scripts.evaluate.results_aggregation import GradingResultAggregator
    from scripts.evaluate.run_skill_evals import SkillEvalRunner, SkillEvalRunOptions
    from scripts.evaluate.skill_prepare_hook import run_skill_prepare_hook


class RunRootInsideGitWorkspaceError(ValueError):
    """Raised when eval isolation would be contaminated by an enclosing Git repo."""


INTERRUPT_EXCEPTIONS = (KeyboardInterrupt,)


def raise_keyboard_interrupt_for_signal(_signum, _frame) -> None:
    """Convert process interrupt signals into normal interrupt exceptions."""
    raise KeyboardInterrupt


def interrupt_signal_numbers() -> list[int]:
    """Return interrupt signals the orchestrator should handle gracefully."""
    signals = [signal.SIGINT]
    sigterm = getattr(signal, "SIGTERM", None)
    if sigterm is not None:
        signals.append(sigterm)
    return signals


@contextmanager
def interrupt_signals_raise_keyboard_interrupt() -> Iterator[None]:
    """Temporarily route interrupt signals through Python cleanup paths."""
    previous_handlers = {}
    for signal_number in interrupt_signal_numbers():
        previous_handlers[signal_number] = signal.getsignal(signal_number)
        signal.signal(signal_number, raise_keyboard_interrupt_for_signal)

    try:
        yield
    finally:
        for signal_number, handler in previous_handlers.items():
            signal.signal(signal_number, handler)


def find_containing_git_workspace_marker(path: Path) -> Path | None:
    """Return the nearest `.git` marker at or above a path without invoking Git."""
    resolved_path = path.expanduser().resolve(strict=False)

    for candidate in (resolved_path, *resolved_path.parents):
        marker = candidate / ".git"
        if marker.exists():
            return marker

    return None


def validate_run_root_is_not_in_git_workspace(run_root: Path) -> None:
    """Reject run roots whose generated eval directories would inherit a Git repo."""
    git_marker = find_containing_git_workspace_marker(run_root)
    if git_marker:
        raise RunRootInsideGitWorkspaceError(
            "--run-root must not be inside a Git workspace; "
            f"found Git marker at {git_marker}"
        )


def execute(args: argparse.Namespace) -> dict:
    """Prepare isolated run directories, then execute the eval run."""
    validate_run_root_is_not_in_git_workspace(args.run_root)
    process_registry = ActiveProcessRegistry()
    skill_workspace = args.run_root / args.skill_path.name

    prepared_run = FixturePreparer(
        PrepareFixtureOptions(
            skill_path=args.skill_path,
            run_root=skill_workspace,
            provider=args.provider,
            eval_ids=args.eval_ids,
        )
    ).prepare()

    try:
        prepare_hook_result = run_skill_prepare_hook(
            skill_path=args.skill_path,
            prepared_run=prepared_run,
            eval_ids=args.eval_ids,
            timeout=args.timeout,
            process_registry=process_registry,
        )
        failed_prepare_eval_ids = getattr(prepare_hook_result, "failed_eval_ids", set())
        if not isinstance(failed_prepare_eval_ids, set):
            failed_prepare_eval_ids = set()
        runnable_prepared_run = prepared_run_without_failed_prepare_hooks(
            prepared_run,
            failed_prepare_eval_ids,
        )

        run_manifest = SkillEvalRunner(
            runnable_prepared_run,
            SkillEvalRunOptions(
                eval_ids=args.eval_ids,
                skip_baseline=args.skip_baseline,
                model=args.model,
                effort=args.effort,
                max_parallel=args.max_parallel,
                timeout=args.timeout,
                process_registry=process_registry,
            ),
        ).run()
    finally:
        stop_git_fsmonitor_daemons(prepared_run.run_root)
        process_registry.kill_all()

    aggregation = GradingResultAggregator(
        iteration_dir=prepared_run.run_root
        / "results"
        / f"iteration-{run_manifest['iteration']}",
        skill_name=prepared_run.skill_name,
        skill_path=args.skill_path,
        provider=args.provider,
        model=run_manifest.get("model", args.model or "default"),
        effort=run_manifest.get("effort", args.effort or "default"),
    ).aggregate()

    return {
        "prepare": prepared_run.to_summary(),
        "run": run_manifest,
        "aggregation": aggregation,
    }


def prepared_run_without_failed_prepare_hooks(prepared_run, failed_eval_ids: set[int]):
    if not failed_eval_ids:
        return prepared_run
    return replace(
        prepared_run,
        evals=[
            eval_entry
            for eval_entry in prepared_run.evals
            if eval_entry.eval_id not in failed_eval_ids
        ],
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare fixtures and run skill evals."
    )
    parser.add_argument(
        "--skill-path",
        required=True,
        type=Path,
        help="Path to the skill directory containing evals/evals.json.",
    )
    parser.add_argument(
        "--run-root",
        required=True,
        type=Path,
        help="Directory where isolated eval run directories will be created.",
    )
    parser.add_argument(
        "--provider",
        required=True,
        choices=tuple(sorted(PROVIDERS)),
        help="LLM provider to use.",
    )
    parser.add_argument(
        "--model",
        required=True,
        help="Model to use for deterministic eval runs.",
    )
    parser.add_argument(
        "--effort",
        default=None,
        help="Reasoning effort to use. If omitted, the provider default is used.",
    )
    parser.add_argument(
        "--eval-ids",
        default=None,
        help="Comma-separated list of eval IDs to run. If omitted, all evals run.",
    )
    parser.add_argument(
        "--skip-baseline",
        action="store_true",
        help="Run only the skill-enabled eval, skipping the baseline run.",
    )
    parser.add_argument(
        "--max-parallel",
        type=int,
        default=10,
        help="Maximum number of eval runs to execute concurrently.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="Timeout in seconds for each eval turn.",
    )

    try:
        with interrupt_signals_raise_keyboard_interrupt():
            result = execute(parser.parse_args())
    except RunRootInsideGitWorkspaceError as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    except INTERRUPT_EXCEPTIONS as error:
        print(
            "Interrupted; terminating active eval subprocesses.",
            file=sys.stderr,
        )
        raise SystemExit(130) from error

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

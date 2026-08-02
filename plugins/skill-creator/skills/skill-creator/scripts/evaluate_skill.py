#!/usr/bin/env python3
"""Bootstrap dependencies, then run the Skill Creator evaluator CLI."""

import subprocess
import sys
from pathlib import Path

if __package__:
    from .evaluate.runtime_bootstrap import (
        RuntimeBootstrapError,
        RunRootInsideGitWorkspaceError,
        prepare_evaluator_runtime,
    )
else:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from scripts.evaluate.runtime_bootstrap import (
        RuntimeBootstrapError,
        RunRootInsideGitWorkspaceError,
        prepare_evaluator_runtime,
    )


def wait_for_managed_evaluator(process: subprocess.Popen) -> int:
    """Let the child finish its cleanup when the shared console sends Ctrl+C."""
    while True:
        try:
            return process.wait()
        except KeyboardInterrupt:
            continue


def run_managed_evaluator(python: Path, arguments: list[str]) -> int:
    """Run the public entrypoint in the prepared runtime and mirror its exit."""
    process = subprocess.Popen([str(python), str(Path(__file__).resolve()), *arguments])
    return wait_for_managed_evaluator(process)


def main(arguments: list[str] | None = None) -> None:
    """Prepare evaluator dependencies before importing the application."""
    arguments = list(sys.argv[1:] if arguments is None else arguments)
    try:
        managed_python = prepare_evaluator_runtime(arguments)
    except (RuntimeBootstrapError, RunRootInsideGitWorkspaceError) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error

    if managed_python is not None:
        raise SystemExit(run_managed_evaluator(managed_python, arguments))

    if __package__:
        from .evaluate.cli import main as application_main
    else:
        from scripts.evaluate.cli import main as application_main
    application_main(arguments)


if __name__ == "__main__":
    main()

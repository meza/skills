import argparse
import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
import warnings
from pathlib import Path
from unittest import mock

from scripts import evaluate_skill
from scripts.evaluate.prepare_fixture import PreparedRun


class EvaluateSkillTests(unittest.TestCase):
    def test_execute_prepares_skill_then_runs_prepared_run(self):
        prepared_run = PreparedRun(
            eval_definitions_path=Path("F:/skills/sample-skill/evals/evals.json"),
            run_root=Path("F:/runs/prepared"),
            provider="codex",
            skill_name="sample-skill",
            evals=[],
        )
        run_manifest = {
            "skill_name": "sample-skill",
            "provider": "codex",
            "model": "gpt-5.4",
            "effort": "high",
            "iteration": 3,
            "runs": [],
        }
        aggregation_result = {
            "json_path": (
                "F:/runs/sample-skill/results/iteration-3/aggregated_results.json"
            ),
        }
        process_registry = mock.Mock()

        with (
            mock.patch.object(
                evaluate_skill,
                "ActiveProcessRegistry",
                return_value=process_registry,
            ),
            mock.patch.object(
                evaluate_skill,
                "FixturePreparer",
            ) as fixture_preparer,
            mock.patch.object(
                evaluate_skill,
                "get_provider_skill_root_or_exit",
                return_value=".codex",
            ) as get_provider_skill_root_or_exit,
            mock.patch.object(
                evaluate_skill,
                "run_skill_prepare_hook",
                create=True,
            ) as run_skill_prepare_hook,
            mock.patch.object(
                evaluate_skill,
                "SkillEvalRunner",
            ) as skill_eval_runner,
            mock.patch.object(
                evaluate_skill,
                "GradingResultAggregator",
            ) as grading_result_aggregator,
            mock.patch.object(
                evaluate_skill,
                "stop_git_fsmonitor_daemons",
            ) as stop_fsmonitor,
        ):
            fixture_preparer.return_value.prepare.return_value = prepared_run
            skill_eval_runner.return_value.run.return_value = run_manifest
            grading_result_aggregator.return_value.aggregate.return_value = (
                aggregation_result
            )

            result = evaluate_skill.execute(
                argparse.Namespace(
                    skill_path=Path("F:/skills/sample-skill"),
                    run_root=Path("F:/runs"),
                    provider="codex",
                    model="gpt-5.4",
                    effort="high",
                    eval_ids="1,2",
                    skip_baseline=False,
                    max_parallel=12,
                    timeout=900,
                )
            )

        self.assertEqual(
            result,
            {
                "prepare": prepared_run.to_summary(),
                "run": run_manifest,
                "aggregation": aggregation_result,
            },
        )

        fixture_preparer.return_value.prepare.assert_called_once_with()
        run_skill_prepare_hook.assert_called_once_with(
            skill_path=Path("F:/skills/sample-skill"),
            prepared_run=prepared_run,
            eval_ids="1,2",
            timeout=900,
            process_registry=process_registry,
        )
        prepare_options = fixture_preparer.call_args.args[0]
        self.assertEqual(prepare_options.skill_path, Path("F:/skills/sample-skill"))
        self.assertEqual(prepare_options.run_root, Path("F:/runs/sample-skill"))
        self.assertEqual(prepare_options.provider, "codex")
        self.assertEqual(prepare_options.skill_root, ".codex")
        self.assertEqual(prepare_options.eval_ids, "1,2")
        get_provider_skill_root_or_exit.assert_called_once_with("codex")

        runner_args = skill_eval_runner.call_args.args
        self.assertIs(runner_args[0], prepared_run)
        run_options = runner_args[1]
        self.assertEqual(run_options.eval_ids, "1,2")
        self.assertFalse(run_options.skip_baseline)
        self.assertEqual(run_options.model, "gpt-5.4")
        self.assertEqual(run_options.effort, "high")
        self.assertEqual(run_options.max_parallel, 12)
        self.assertEqual(run_options.timeout, 900)
        self.assertIs(run_options.process_registry, process_registry)
        skill_eval_runner.return_value.run.assert_called_once_with()
        process_registry.kill_all.assert_called_once_with()
        aggregator_args = grading_result_aggregator.call_args.kwargs
        self.assertEqual(
            aggregator_args["iteration_dir"],
            Path("F:/runs/prepared/results/iteration-3"),
        )
        self.assertEqual(aggregator_args["skill_name"], "sample-skill")
        self.assertEqual(aggregator_args["skill_path"], Path("F:/skills/sample-skill"))
        self.assertEqual(aggregator_args["provider"], "codex")
        self.assertEqual(aggregator_args["model"], "gpt-5.4")
        self.assertEqual(aggregator_args["effort"], "high")
        grading_result_aggregator.return_value.aggregate.assert_called_once_with()
        stop_fsmonitor.assert_called_once_with(prepared_run.run_root)

    def test_execute_kills_active_processes_when_eval_runner_fails(self):
        prepared_run = PreparedRun(
            eval_definitions_path=Path("F:/skills/sample-skill/evals/evals.json"),
            run_root=Path("F:/runs/sample-skill"),
            provider="codex",
            skill_name="sample-skill",
            evals=[],
        )
        process_registry = mock.Mock()

        with (
            mock.patch.object(
                evaluate_skill,
                "ActiveProcessRegistry",
                return_value=process_registry,
            ),
            mock.patch.object(evaluate_skill, "FixturePreparer") as fixture_preparer,
            mock.patch.object(evaluate_skill, "run_skill_prepare_hook"),
            mock.patch.object(evaluate_skill, "SkillEvalRunner") as skill_eval_runner,
            mock.patch.object(
                evaluate_skill,
                "stop_git_fsmonitor_daemons",
            ) as stop_fsmonitor,
            self.assertRaises(RuntimeError),
        ):
            fixture_preparer.return_value.prepare.return_value = prepared_run
            skill_eval_runner.return_value.run.side_effect = RuntimeError("failed")

            evaluate_skill.execute(
                argparse.Namespace(
                    skill_path=Path("F:/skills/sample-skill"),
                    run_root=Path("F:/runs"),
                    provider="codex",
                    model="gpt-5.4",
                    effort="high",
                    eval_ids="1",
                    skip_baseline=False,
                    max_parallel=12,
                    timeout=900,
                )
            )

        process_registry.kill_all.assert_called_once_with()
        stop_fsmonitor.assert_called_once_with(prepared_run.run_root)

    def test_execute_kills_active_processes_when_skill_prepare_hook_fails(self):
        prepared_run = PreparedRun(
            eval_definitions_path=Path("F:/skills/sample-skill/evals/evals.json"),
            run_root=Path("F:/runs/sample-skill"),
            provider="codex",
            skill_name="sample-skill",
            evals=[],
        )
        process_registry = mock.Mock()

        with (
            mock.patch.object(
                evaluate_skill,
                "ActiveProcessRegistry",
                return_value=process_registry,
            ),
            mock.patch.object(evaluate_skill, "FixturePreparer") as fixture_preparer,
            mock.patch.object(
                evaluate_skill,
                "run_skill_prepare_hook",
                side_effect=RuntimeError("hook failed"),
            ),
            mock.patch.object(evaluate_skill, "SkillEvalRunner") as skill_eval_runner,
            mock.patch.object(
                evaluate_skill,
                "stop_git_fsmonitor_daemons",
            ) as stop_fsmonitor,
            self.assertRaises(RuntimeError),
        ):
            fixture_preparer.return_value.prepare.return_value = prepared_run

            evaluate_skill.execute(
                argparse.Namespace(
                    skill_path=Path("F:/skills/sample-skill"),
                    run_root=Path("F:/runs"),
                    provider="codex",
                    model="gpt-5.4",
                    effort="high",
                    eval_ids="1",
                    skip_baseline=False,
                    max_parallel=12,
                    timeout=900,
                )
            )

        skill_eval_runner.assert_not_called()
        process_registry.kill_all.assert_called_once_with()
        stop_fsmonitor.assert_called_once_with(prepared_run.run_root)

    def test_validate_run_root_rejects_path_inside_git_directory_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir) / "workspace"
            run_root = workspace / "tmp" / "evals"
            (workspace / ".git").mkdir(parents=True)

            with self.assertRaises(
                evaluate_skill.RunRootInsideGitWorkspaceError
            ) as raised:
                evaluate_skill.validate_run_root_is_not_in_git_workspace(run_root)

        self.assertIn(
            "--run-root must not be inside a Git workspace", str(raised.exception)
        )
        self.assertIn(".git", str(raised.exception))

    def test_validate_run_root_rejects_path_inside_git_file_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir) / "workspace"
            run_root = workspace / "tmp" / "evals"
            workspace.mkdir()
            (workspace / ".git").write_text(
                "gitdir: ../.git/worktrees/workspace\n",
                encoding="utf-8",
            )

            with self.assertRaises(evaluate_skill.RunRootInsideGitWorkspaceError):
                evaluate_skill.validate_run_root_is_not_in_git_workspace(run_root)

    def test_validate_run_root_allows_path_outside_git_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_root = Path(temp_dir) / "tmp" / "evals"

            evaluate_skill.validate_run_root_is_not_in_git_workspace(run_root)

    def test_interrupt_signal_handler_raises_keyboard_interrupt(self):
        with self.assertRaises(KeyboardInterrupt):
            evaluate_skill.raise_keyboard_interrupt_for_signal(None, None)

    def test_main_parses_cli_options_and_prints_execution_summary(self):
        expected_result = {
            "prepare": {
                "run_root": "F:/runs/prepared",
                "provider": "codex",
                "skill_name": "sample-skill",
                "eval_count": 1,
            },
            "run": {"runs": []},
        }
        argv = [
            "evaluate_skill.py",
            "--skill-path",
            "F:/skills/sample-skill",
            "--run-root",
            "F:/runs",
            "--provider",
            "codex",
            "--model",
            "gpt-5.5",
            "--effort",
            "high",
            "--eval-ids",
            "1,2",
            "--skip-baseline",
            "--max-parallel",
            "12",
            "--timeout",
            "900",
        ]

        with (
            mock.patch.object(sys, "argv", argv),
            mock.patch.object(
                evaluate_skill, "execute", return_value=expected_result
            ) as execute,
            contextlib.redirect_stdout(io.StringIO()) as stdout,
        ):
            evaluate_skill.main()

        args = execute.call_args.args[0]
        self.assertEqual(args.skill_path, Path("F:/skills/sample-skill"))
        self.assertEqual(args.run_root, Path("F:/runs"))
        self.assertEqual(args.provider, "codex")
        self.assertEqual(args.model, "gpt-5.5")
        self.assertEqual(args.effort, "high")
        self.assertEqual(args.eval_ids, "1,2")
        self.assertTrue(args.skip_baseline)
        self.assertEqual(args.max_parallel, 12)
        self.assertEqual(args.timeout, 900)
        self.assertEqual(json.loads(stdout.getvalue()), expected_result)

    def test_main_uses_runner_defaults_for_optional_limits(self):
        argv = [
            "evaluate_skill.py",
            "--skill-path",
            "F:/skills/sample-skill",
            "--run-root",
            "F:/runs",
            "--provider",
            "codex",
            "--model",
            "gpt-5.5",
        ]

        with (
            mock.patch.object(sys, "argv", argv),
            mock.patch.object(evaluate_skill, "execute", return_value={}) as execute,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            evaluate_skill.main()

        args = execute.call_args.args[0]
        self.assertEqual(args.model, "gpt-5.5")
        self.assertIsNone(args.effort)
        self.assertIsNone(args.eval_ids)
        self.assertFalse(args.skip_baseline)
        self.assertEqual(args.max_parallel, 10)
        self.assertEqual(args.timeout, 600)

    def test_main_reports_run_root_git_workspace_errors(self):
        argv = [
            "evaluate_skill.py",
            "--skill-path",
            "F:/skills/sample-skill",
            "--run-root",
            "F:/runs",
            "--provider",
            "codex",
            "--model",
            "gpt-5.5",
        ]

        with (
            mock.patch.object(sys, "argv", argv),
            mock.patch.object(
                evaluate_skill,
                "execute",
                side_effect=evaluate_skill.RunRootInsideGitWorkspaceError(
                    "--run-root must not be inside a Git workspace"
                ),
            ),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
            self.assertRaises(SystemExit) as raised,
        ):
            evaluate_skill.main()

        self.assertEqual(raised.exception.code, 1)
        self.assertIn(
            "Error: --run-root must not be inside a Git workspace",
            stderr.getvalue(),
        )

    def test_main_reports_interrupt_as_clean_exit(self):
        class InterruptForTest(BaseException):
            pass

        argv = [
            "evaluate_skill.py",
            "--skill-path",
            "F:/skills/sample-skill",
            "--run-root",
            "F:/runs",
            "--provider",
            "codex",
            "--model",
            "gpt-5.5",
        ]

        with (
            mock.patch.object(sys, "argv", argv),
            mock.patch.object(
                evaluate_skill,
                "execute",
                side_effect=InterruptForTest,
            ),
            mock.patch.object(
                evaluate_skill,
                "INTERRUPT_EXCEPTIONS",
                (InterruptForTest,),
                create=True,
            ),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
            self.assertRaises(SystemExit) as raised,
        ):
            evaluate_skill.main()

        self.assertEqual(raised.exception.code, 130)
        self.assertIn(
            "Interrupted; terminating active eval subprocesses.",
            stderr.getvalue(),
        )

    def test_module_entrypoint_requires_cli_boundaries(self):
        with (
            mock.patch.object(sys, "argv", ["evaluate_skill.py"]),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
            warnings.catch_warnings(),
            self.assertRaises(SystemExit) as raised,
        ):
            warnings.simplefilter("ignore", RuntimeWarning)
            runpy.run_module("scripts.evaluate_skill", run_name="__main__")

        self.assertEqual(raised.exception.code, 2)
        self.assertIn("--skill-path", stderr.getvalue())
        self.assertIn("--run-root", stderr.getvalue())
        self.assertIn("--provider", stderr.getvalue())
        self.assertIn("--model", stderr.getvalue())

    def test_direct_script_entrypoint_requires_cli_boundaries(self):
        script_path = (
            Path(__file__).resolve().parents[1] / "scripts" / "evaluate_skill.py"
        )

        with (
            mock.patch.object(sys, "argv", [str(script_path)]),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
            self.assertRaises(SystemExit) as raised,
        ):
            runpy.run_path(str(script_path), run_name="__main__")

        self.assertEqual(raised.exception.code, 2)
        self.assertIn("--skill-path", stderr.getvalue())
        self.assertIn("--run-root", stderr.getvalue())
        self.assertIn("--provider", stderr.getvalue())
        self.assertIn("--model", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()

import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import evaluate_skill


class EvaluateSkillLauncherTests(unittest.TestCase):
    def test_managed_evaluator_preserves_arguments_and_exit_code(self):
        python = Path("runtime with spaces") / "python.exe"
        arguments = ["--run-root", "run root", "--provider", "codex"]
        process = mock.Mock()
        process.wait.return_value = 17

        with mock.patch.object(
            evaluate_skill.subprocess,
            "Popen",
            return_value=process,
        ) as popen:
            result = evaluate_skill.run_managed_evaluator(python, arguments)

        self.assertEqual(result, 17)
        popen.assert_called_once_with(
            [
                str(python),
                str(Path(evaluate_skill.__file__).resolve()),
                *arguments,
            ]
        )

    def test_wait_retries_when_parent_receives_keyboard_interrupt(self):
        process = mock.Mock()
        process.wait.side_effect = [KeyboardInterrupt, 130]

        self.assertEqual(evaluate_skill.wait_for_managed_evaluator(process), 130)
        self.assertEqual(process.wait.call_count, 2)

    def test_main_reports_bootstrap_error_without_starting_application(self):
        with (
            mock.patch.object(
                evaluate_skill,
                "prepare_evaluator_runtime",
                side_effect=evaluate_skill.RuntimeBootstrapError("blocked"),
            ),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
            self.assertRaises(SystemExit) as raised,
        ):
            evaluate_skill.main(["--run-root", "runs"])

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("Error: blocked", stderr.getvalue())

    def test_main_mirrors_managed_child_exit_code(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            python = Path(temp_dir) / "python.exe"
            with (
                mock.patch.object(
                    evaluate_skill,
                    "prepare_evaluator_runtime",
                    return_value=python,
                ),
                mock.patch.object(
                    evaluate_skill,
                    "run_managed_evaluator",
                    return_value=23,
                ),
                self.assertRaises(SystemExit) as raised,
            ):
                evaluate_skill.main(["--run-root", "runs"])

        self.assertEqual(raised.exception.code, 23)


if __name__ == "__main__":
    unittest.main()

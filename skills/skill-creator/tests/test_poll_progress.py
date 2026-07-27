import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
import warnings
from argparse import Namespace
from pathlib import Path
from unittest import mock

from scripts import poll_progress


class PollProgressTests(unittest.TestCase):
    def test_format_progress_status_includes_counts_runtime_and_cost(self):
        self.assertEqual(
            poll_progress.format_progress_status(
                {
                    "completed": 3,
                    "total": 5,
                    "succeeded": 2,
                    "failed": 1,
                    "running": 2,
                    "elapsed_seconds": 12.4,
                    "cost_usd": 0.123456,
                }
            ),
            "[3/5] 2 ok, 1 failed | 2 running | 12s | $0.1235",
        )

    def test_poll_once_ignores_missing_or_invalid_progress_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            progress_file = Path(temp_dir) / "progress.json"
            args = Namespace(progress_file=progress_file, stale_timeout=1)

            self.assertEqual(
                poll_progress.poll_once(args, last_completed=-1, last_change_time=10),
                (-1, 10, False),
            )

            progress_file.write_text("{not-json", encoding="utf-8")
            self.assertEqual(
                poll_progress.poll_once(args, last_completed=-1, last_change_time=10),
                (-1, 10, False),
            )

    def test_poll_once_prints_new_progress_and_continues(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            progress_file = Path(temp_dir) / "progress.json"
            progress_file.write_text(
                json.dumps(
                    {
                        "completed": 1,
                        "total": 2,
                        "succeeded": 1,
                        "running": 1,
                    }
                ),
                encoding="utf-8",
            )
            args = Namespace(progress_file=progress_file, stale_timeout=600)

            with (
                mock.patch.object(poll_progress.time, "time", return_value=25),
                contextlib.redirect_stdout(io.StringIO()) as stdout,
            ):
                result = poll_progress.poll_once(
                    args, last_completed=0, last_change_time=10
                )

            self.assertEqual(result, (1, 25, False))
            self.assertIn("[1/2] 1 ok | 1 running", stdout.getvalue())

    def test_poll_once_stops_when_all_runs_complete(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            progress_file = Path(temp_dir) / "progress.json"
            progress_file.write_text(
                json.dumps({"completed": 2, "total": 2, "succeeded": 2}),
                encoding="utf-8",
            )
            args = Namespace(progress_file=progress_file, stale_timeout=600)

            with (
                mock.patch.object(poll_progress.time, "time", return_value=30),
                contextlib.redirect_stdout(io.StringIO()) as stdout,
            ):
                result = poll_progress.poll_once(
                    args, last_completed=1, last_change_time=10
                )

            self.assertEqual(result, (2, 30, True))
            self.assertIn("All runs complete.", stdout.getvalue())

    def test_poll_once_stops_when_progress_is_stale(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            progress_file = Path(temp_dir) / "progress.json"
            progress_file.write_text(
                json.dumps({"completed": 1, "total": 3, "succeeded": 1}),
                encoding="utf-8",
            )
            args = Namespace(progress_file=progress_file, stale_timeout=5)

            with (
                mock.patch.object(poll_progress.time, "time", return_value=16),
                contextlib.redirect_stdout(io.StringIO()) as stdout,
            ):
                result = poll_progress.poll_once(
                    args, last_completed=1, last_change_time=10
                )

            self.assertEqual(result, (1, 10, True))
            self.assertIn("No progress for 5s", stdout.getvalue())

    def test_poll_progress_sleeps_until_poll_once_reports_done(self):
        args = Namespace(interval=3)

        with (
            mock.patch.object(
                poll_progress,
                "poll_once",
                side_effect=[(0, 10, False), (1, 11, True)],
            ) as poll_once,
            mock.patch.object(poll_progress.time, "time", return_value=10),
            mock.patch.object(poll_progress.time, "sleep") as sleep,
        ):
            poll_progress.poll_progress(args)

        self.assertEqual(
            poll_once.call_args_list,
            [
                mock.call(args, -1, 10),
                mock.call(args, 0, 10),
            ],
        )
        sleep.assert_called_once_with(3)

    def test_main_parses_progress_file_and_polling_options(self):
        argv = [
            "poll_progress.py",
            "S:/TMP/evals/results/iteration-1/progress.json",
            "--interval",
            "2",
            "--stale-timeout",
            "5",
        ]

        with (
            mock.patch.object(sys, "argv", argv),
            mock.patch.object(poll_progress, "poll_progress") as run_poll_progress,
        ):
            poll_progress.main()

        args = run_poll_progress.call_args.args[0]
        self.assertEqual(
            args.progress_file,
            Path("S:/TMP/evals/results/iteration-1/progress.json"),
        )
        self.assertEqual(args.interval, 2)
        self.assertEqual(args.stale_timeout, 5)

    def test_module_entrypoint_runs_main(self):
        with (
            mock.patch.object(sys, "argv", ["poll_progress.py"]),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
            warnings.catch_warnings(),
            self.assertRaises(SystemExit) as raised,
        ):
            warnings.simplefilter("ignore", RuntimeWarning)
            runpy.run_module("scripts.poll_progress", run_name="__main__")

        self.assertEqual(raised.exception.code, 2)
        self.assertIn("progress_file", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()

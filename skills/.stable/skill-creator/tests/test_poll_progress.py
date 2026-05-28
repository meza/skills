import contextlib
import io
import json
import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()

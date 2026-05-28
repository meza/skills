import contextlib
import io
import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest import mock

from scripts import serve_viewer


class ServeViewerTests(unittest.TestCase):
    def test_build_viewer_command_includes_optional_inputs(self):
        args = Namespace(
            port=4555,
            skill_name="demo-skill",
            previous_workspace="previous",
            benchmark="benchmark.json",
        )

        port, command = serve_viewer._build_viewer_command(
            args,
            Path("generate_review.py"),
            Path("iteration-1"),
        )

        self.assertEqual(port, 4555)
        self.assertEqual(
            command,
            [
                serve_viewer.sys.executable,
                "generate_review.py",
                "iteration-1",
                "--port",
                "4555",
                "--skill-name",
                "demo-skill",
                "--previous-workspace",
                "previous",
                "--benchmark",
                "benchmark.json",
            ],
        )

    def test_cmd_stop_removes_malformed_pidfile(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            pidfile = Path(temp_dir) / "viewer.json"
            pidfile.write_text("{not-json", encoding="utf-8")

            with (
                mock.patch.object(serve_viewer, "PIDFILE", pidfile),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                serve_viewer.cmd_stop()

            self.assertFalse(pidfile.exists())

    def test_cmd_stop_reports_when_pidfile_process_is_not_running(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            pidfile = Path(temp_dir) / "viewer.json"
            pidfile.write_text(json.dumps({"pid": 222, "port": 3117}), encoding="utf-8")

            with (
                mock.patch.object(serve_viewer, "PIDFILE", pidfile),
                mock.patch.object(serve_viewer, "_kill_pid", return_value=False),
                mock.patch.object(serve_viewer, "_kill_port") as kill_port,
                contextlib.redirect_stdout(io.StringIO()) as stdout,
            ):
                serve_viewer.cmd_stop()

            kill_port.assert_called_once_with(3117)
            self.assertFalse(pidfile.exists())
            self.assertIn("Viewer was not running.", stdout.getvalue())

    def test_health_check_closes_successful_response(self):
        response = mock.MagicMock()
        response.status = 200
        response.read.return_value = b"ok"
        response.__enter__.return_value = response

        with mock.patch.object(
            serve_viewer.urllib.request,
            "urlopen",
            return_value=response,
        ):
            self.assertTrue(serve_viewer._health_check(3117, retries=1, interval=0))

        response.__enter__.assert_called_once_with()
        response.__exit__.assert_called_once()

    def test_start_background_viewer_cleans_up_when_health_check_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            pidfile = Path(temp_dir) / "viewer.json"
            proc = mock.Mock(pid=1234)
            args = Namespace(open=False)

            with (
                mock.patch.object(serve_viewer, "PIDFILE", pidfile),
                mock.patch.object(serve_viewer, "_kill_port"),
                mock.patch.object(
                    serve_viewer, "_viewer_popen_kwargs", return_value={}
                ) as popen_kwargs,
                mock.patch.object(serve_viewer.subprocess, "Popen", return_value=proc),
                mock.patch.object(
                    serve_viewer, "_get_local_ip", return_value="127.0.0.1"
                ),
                mock.patch.object(serve_viewer, "_health_check", return_value=False),
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                serve_viewer._start_background_viewer(args, ["server"], 3117)

            proc.terminate.assert_called_once_with()
            proc.wait.assert_called_once_with(timeout=5)
            self.assertFalse(pidfile.exists())
            self.assertIn('"event": "viewer_start_failed"', stderr.getvalue())
            self.assertIn('"port": 3117', stderr.getvalue())
            self.assertIn('"log_path":', stderr.getvalue())
            self.assertEqual(
                Path(popen_kwargs.call_args.args[0].name), pidfile.with_suffix(".log")
            )

    def test_start_background_viewer_writes_pidfile_on_success(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            pidfile = Path(temp_dir) / "viewer.json"
            proc = mock.Mock(pid=1234)
            args = Namespace(open=False)

            with (
                mock.patch.object(serve_viewer, "PIDFILE", pidfile),
                mock.patch.object(serve_viewer, "_kill_port"),
                mock.patch.object(
                    serve_viewer, "_viewer_popen_kwargs", return_value={}
                ) as popen_kwargs,
                mock.patch.object(serve_viewer.subprocess, "Popen", return_value=proc),
                mock.patch.object(
                    serve_viewer, "_get_local_ip", return_value="127.0.0.1"
                ),
                mock.patch.object(serve_viewer, "_health_check", return_value=True),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                serve_viewer._start_background_viewer(args, ["server"], 3117)

            self.assertEqual(
                json.loads(pidfile.read_text(encoding="utf-8")),
                {
                    "pid": 1234,
                    "port": 3117,
                    "log_path": str(pidfile.with_suffix(".log")),
                },
            )
            self.assertEqual(
                Path(popen_kwargs.call_args.args[0].name), pidfile.with_suffix(".log")
            )

    def test_viewer_popen_kwargs_routes_output_to_log_file(self):
        log_file = mock.Mock()

        kwargs = serve_viewer._viewer_popen_kwargs(log_file)

        self.assertEqual(kwargs["stdout"], log_file)
        self.assertEqual(kwargs["stderr"], serve_viewer.subprocess.STDOUT)


if __name__ == "__main__":
    unittest.main()

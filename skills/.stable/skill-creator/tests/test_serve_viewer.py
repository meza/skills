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
                ),
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
            self.assertIn("did not respond", stderr.getvalue())

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
                ),
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
                {"pid": 1234, "port": 3117},
            )


if __name__ == "__main__":
    unittest.main()

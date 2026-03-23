#!/usr/bin/env python3
"""Start and stop the eval viewer with reliable lifecycle management.

Usage:
    python serve_viewer.py start <workspace> [options]
    python serve_viewer.py stop
"""

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

_IS_WINDOWS = sys.platform == "win32"

if _IS_WINDOWS:
    PIDFILE = Path(os.environ.get("TEMP", "C:\\Temp")) / "skill-creator-viewer.json"
else:
    PIDFILE = Path("/tmp/skill-creator-viewer.json")
DEFAULT_PORT = 3117


def _get_local_ip() -> str:
    """Return the machine's LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return socket.gethostname()


def _is_ssh() -> bool:
    """Return True if the current session is over SSH."""
    return bool(os.environ.get("SSH_CONNECTION") or os.environ.get("SSH_TTY"))


def _kill_pid(pid: int) -> bool:
    """Terminate a process by PID. Return True if the process existed."""
    try:
        if _IS_WINDOWS:
            subprocess.run(
                ["taskkill", "/F", "/PID", str(pid)],
                capture_output=True,
                timeout=5,
            )
        else:
            os.kill(pid, signal.SIGTERM)
        return True
    except (ProcessLookupError, OSError):
        return False


def _kill_port(port: int) -> None:
    """Kill any process listening on the given port."""
    try:
        if _IS_WINDOWS:
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            for line in result.stdout.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    parts = line.split()
                    pid_str = parts[-1]
                    try:
                        _kill_pid(int(pid_str))
                    except ValueError:
                        pass
        else:
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            for pid_str in result.stdout.strip().split("\n"):
                if pid_str.strip():
                    try:
                        _kill_pid(int(pid_str.strip()))
                    except ValueError:
                        pass
        time.sleep(0.5)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass


def _health_check(port: int, retries: int = 30, interval: float = 0.2) -> bool:
    """Wait for the server to respond with content."""
    url = f"http://127.0.0.1:{port}"
    for _ in range(retries):
        try:
            resp = urllib.request.urlopen(url, timeout=2)
            if resp.status == 200 and len(resp.read()) > 0:
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def cmd_stop(_args=None, quiet: bool = False) -> None:
    """Stop any running viewer server."""
    if not PIDFILE.exists():
        if not quiet:
            print("No viewer running.")
        return

    try:
        data = json.loads(PIDFILE.read_text(encoding="utf-8"))
        pid = data.get("pid")
        port = data.get("port", DEFAULT_PORT)
    except (json.JSONDecodeError, OSError):
        PIDFILE.unlink(missing_ok=True)
        return

    stopped = False
    if pid:
        stopped = _kill_pid(pid)
    _kill_port(port)

    PIDFILE.unlink(missing_ok=True)
    if not quiet:
        if stopped:
            print(f"Stopped viewer (PID {pid}).")
        else:
            print("Viewer was not running.")


def cmd_start(args) -> None:
    """Start the viewer server in the background."""
    cmd_stop(quiet=True)

    script = (
        Path(__file__).resolve().parent.parent / "eval-viewer" / "generate_review.py"
    )
    if not script.exists():
        print(f"Error: {script} not found.", file=sys.stderr)
        sys.exit(1)

    workspace = Path(args.workspace).resolve()
    if not workspace.is_dir():
        print(f"Error: {workspace} is not a directory.", file=sys.stderr)
        sys.exit(1)

    cmd = [sys.executable, str(script), str(workspace)]

    port = args.port or DEFAULT_PORT
    cmd.extend(["--port", str(port)])

    if args.skill_name:
        cmd.extend(["--skill-name", args.skill_name])
    if args.previous_workspace:
        cmd.extend(["--previous-workspace", str(args.previous_workspace)])
    if args.benchmark:
        cmd.extend(["--benchmark", str(args.benchmark)])

    if args.static:
        cmd.extend(["--static", str(args.static)])
        subprocess.run(cmd)
        return

    _kill_port(port)

    popen_kwargs = dict(
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if _IS_WINDOWS:
        popen_kwargs["creationflags"] = (
            subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        )
    else:
        popen_kwargs["start_new_session"] = True

    proc = subprocess.Popen(cmd, **popen_kwargs)

    PIDFILE.write_text(json.dumps({"pid": proc.pid, "port": port}), encoding="utf-8")

    ip = _get_local_ip()
    url = f"http://{ip}:{port}"
    if _health_check(port):
        print(f"Viewer running at {url} (PID {proc.pid})")
        if args.open:
            webbrowser.open(url)
    else:
        print(
            f"Viewer process started (PID {proc.pid}) "
            f"but did not respond on port {port}.",
            file=sys.stderr,
        )
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manage the eval viewer server lifecycle"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    start_p = sub.add_parser("start", help="Start the viewer")
    start_p.add_argument("workspace", help="Path to iteration workspace directory")
    start_p.add_argument(
        "--port",
        "-p",
        type=int,
        default=None,
        help=f"Server port (default: {DEFAULT_PORT})",
    )
    start_p.add_argument(
        "--skill-name", "-n", type=str, default=None, help="Skill name for header"
    )
    start_p.add_argument(
        "--previous-workspace",
        type=str,
        default=None,
        help="Previous iteration workspace for diff view",
    )
    start_p.add_argument(
        "--benchmark", type=str, default=None, help="Path to benchmark.json"
    )
    start_p.add_argument(
        "--static",
        "-s",
        type=str,
        default=None,
        help="Write static HTML to this path instead of starting a server",
    )
    open_default = not _is_ssh()
    start_p.add_argument(
        "--open",
        action=argparse.BooleanOptionalAction,
        default=open_default,
        help="Open the viewer in the default browser (default: off over SSH)",
    )
    start_p.set_defaults(func=cmd_start)

    stop_p = sub.add_parser("stop", help="Stop the viewer")
    stop_p.set_defaults(func=cmd_stop)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

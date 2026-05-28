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
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return socket.gethostname()
    finally:
        s.close()


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
            _kill_windows_port(port)
        else:
            _kill_posix_port(port)
        time.sleep(0.5)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass


def _kill_windows_port(port: int) -> None:
    result = subprocess.run(
        ["netstat", "-ano"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    for line in result.stdout.splitlines():
        _kill_windows_listener_line(line, port)


def _kill_windows_listener_line(line: str, port: int) -> None:
    if f":{port}" not in line or "LISTENING" not in line:
        return
    _kill_pid_text(line.split()[-1])


def _kill_posix_port(port: int) -> None:
    result = subprocess.run(
        ["lsof", "-ti", f":{port}"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    for pid_str in result.stdout.strip().split("\n"):
        if pid_str.strip():
            _kill_pid_text(pid_str.strip())


def _kill_pid_text(pid_text: str) -> None:
    try:
        _kill_pid(int(pid_text))
    except ValueError:
        pass


def _health_check(port: int, retries: int = 30, interval: float = 0.2) -> bool:
    """Wait for the server to respond with content."""
    url = f"http://127.0.0.1:{port}"
    for _ in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200 and len(resp.read()) > 0:
                    return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def cmd_stop(_args=None, quiet: bool = False) -> None:
    """Stop any running viewer server."""
    if not PIDFILE.exists():
        _print_no_viewer(quiet)
        return

    pid_data = _read_pidfile()
    if pid_data is None:
        PIDFILE.unlink(missing_ok=True)
        return

    stopped = _stop_viewer_process(pid_data)

    PIDFILE.unlink(missing_ok=True)
    if not quiet:
        _print_stop_result(pid_data[0], stopped)


def _print_no_viewer(quiet: bool) -> None:
    if not quiet:
        print("No viewer running.")


def _stop_viewer_process(pid_data: tuple[int | None, int]) -> bool:
    pid, port = pid_data
    stopped = _kill_pid(pid) if pid else False
    _kill_port(port)
    return stopped


def _print_stop_result(pid: int | None, stopped: bool) -> None:
    if stopped:
        print(f"Stopped viewer (PID {pid}).")
    else:
        print("Viewer was not running.")


def _read_pidfile() -> tuple[int | None, int] | None:
    try:
        data = json.loads(PIDFILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return data.get("pid"), data.get("port", DEFAULT_PORT)


def cmd_start(args) -> None:
    """Start the viewer server in the background."""
    cmd_stop(quiet=True)

    script = _resolve_viewer_script()
    workspace = _resolve_workspace(args.workspace)
    port, cmd = _build_viewer_command(args, script, workspace)
    if args.static:
        cmd.extend(["--static", str(args.static)])
        subprocess.run(cmd)
        return

    _start_background_viewer(args, cmd, port)


def _resolve_viewer_script() -> Path:
    script = (
        Path(__file__).resolve().parent.parent
        / "eval-viewer"
        / "legaci-viewer"
        / "generate_review.py"
    )
    if script.exists():
        return script
    print(f"Error: {script} not found.", file=sys.stderr)
    sys.exit(1)


def _resolve_workspace(workspace_text: str) -> Path:
    workspace = Path(workspace_text).resolve()
    if workspace.is_dir():
        return workspace
    print(f"Error: {workspace} is not a directory.", file=sys.stderr)
    sys.exit(1)


def _start_background_viewer(args, cmd: list[str], port: int) -> None:
    _kill_port(port)

    proc = subprocess.Popen(cmd, **_viewer_popen_kwargs())

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
        _cleanup_failed_start(proc)
        sys.exit(1)


def _cleanup_failed_start(proc) -> None:
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)
    except OSError:
        pass
    PIDFILE.unlink(missing_ok=True)


def _viewer_popen_kwargs() -> dict:
    popen_kwargs = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if _IS_WINDOWS:
        popen_kwargs["creationflags"] = (
            subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        )
    else:
        popen_kwargs["start_new_session"] = True
    return popen_kwargs


def _build_viewer_command(args, script: Path, workspace: Path) -> tuple[int, list[str]]:
    port = args.port or DEFAULT_PORT
    cmd = [sys.executable, str(script), str(workspace), "--port", str(port)]
    _add_optional_arg(cmd, "--skill-name", args.skill_name)
    _add_optional_arg(cmd, "--previous-workspace", args.previous_workspace)
    _add_optional_arg(cmd, "--benchmark", args.benchmark)
    return port, cmd


def _add_optional_arg(cmd: list[str], flag: str, value: str | None) -> None:
    if value:
        cmd.extend([flag, str(value)])


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

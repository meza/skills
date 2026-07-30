#!/usr/bin/env python3
"""
Poll progress.json and print updates as eval runs complete.

Usage:
    python poll_progress.py <workspace>/iteration-N/progress.json [--interval 30]

Prints a status line each time a new run completes. Exits when all runs
are done or when progress.json stops updating for 10 minutes (stale).

Designed to be run in the background so the agent can check on it later
without blocking the conversation with sleep commands.
"""

import argparse
import json
import time
from pathlib import Path


def read_progress(progress_file: Path) -> dict | None:
    if not progress_file.exists():
        return None
    try:
        return json.loads(progress_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def format_progress_status(data: dict) -> str:
    completed = data.get("completed", 0)
    total = data.get("total", 0)
    succeeded = data.get("succeeded", 0)
    failed = data.get("failed", 0)
    running = data.get("running", 0)
    elapsed = data.get("elapsed_seconds", 0)
    cost = data.get("cost_usd", 0)

    status = f"[{completed}/{total}] {succeeded} ok"
    if failed:
        status += f", {failed} failed"
    return f"{status} | {running} running | {elapsed:.0f}s | ${cost:.4f}"


def poll_progress(args) -> None:
    last_completed = -1
    last_change_time = time.time()

    while True:
        last_completed, last_change_time, done = poll_once(
            args, last_completed, last_change_time
        )
        if done:
            break
        time.sleep(args.interval)


def poll_once(
    args, last_completed: int, last_change_time: float
) -> tuple[int, float, bool]:
    data = read_progress(args.progress_file)
    if data is None:
        return last_completed, last_change_time, False

    last_completed, last_change_time, complete = handle_progress_data(
        data, last_completed, last_change_time
    )
    if complete:
        return last_completed, last_change_time, True
    if is_stale(last_change_time, args.stale_timeout):
        print_stale_message(args.stale_timeout)
        return last_completed, last_change_time, True
    return last_completed, last_change_time, False


def handle_progress_data(
    data: dict, last_completed: int, last_change_time: float
) -> tuple[int, float, bool]:
    completed = data.get("completed", 0)
    if completed == last_completed:
        return last_completed, last_change_time, False

    print(format_progress_status(data), flush=True)
    if completed >= data.get("total", 0):
        print("All runs complete.", flush=True)
        return completed, time.time(), True
    return completed, time.time(), False


def is_stale(last_change_time: float, stale_timeout: int) -> bool:
    return time.time() - last_change_time > stale_timeout


def print_stale_message(stale_timeout: int) -> None:
    print(
        f"No progress for {stale_timeout}s. Something may be stuck.",
        flush=True,
    )


def main():
    parser = argparse.ArgumentParser(description="Poll eval progress")
    parser.add_argument("progress_file", type=Path, help="Path to progress.json")
    parser.add_argument(
        "--interval",
        type=int,
        default=30,
        help="Seconds between checks (default: 30)",
    )
    parser.add_argument(
        "--stale-timeout",
        type=int,
        default=600,
        help="Exit if no change for this many seconds (default: 600)",
    )
    args = parser.parse_args()

    poll_progress(args)


if __name__ == "__main__":
    main()

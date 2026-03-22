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
import sys
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Poll eval progress")
    parser.add_argument("progress_file", type=Path, help="Path to progress.json")
    parser.add_argument(
        "--interval", type=int, default=30,
        help="Seconds between checks (default: 30)",
    )
    parser.add_argument(
        "--stale-timeout", type=int, default=600,
        help="Exit if no change for this many seconds (default: 600)",
    )
    args = parser.parse_args()

    last_completed = -1
    last_change_time = time.time()

    while True:
        if not args.progress_file.exists():
            time.sleep(args.interval)
            continue

        try:
            data = json.loads(args.progress_file.read_text())
        except (json.JSONDecodeError, OSError):
            time.sleep(args.interval)
            continue

        completed = data.get("completed", 0)
        total = data.get("total", 0)
        succeeded = data.get("succeeded", 0)
        failed = data.get("failed", 0)
        running = data.get("running", 0)
        elapsed = data.get("elapsed_seconds", 0)
        cost = data.get("cost_usd", 0)

        if completed != last_completed:
            last_completed = completed
            last_change_time = time.time()

            status = f"[{completed}/{total}] {succeeded} ok"
            if failed:
                status += f", {failed} failed"
            status += f" | {running} running | {elapsed:.0f}s | ${cost:.4f}"
            print(status, flush=True)

            if completed >= total:
                print("All runs complete.", flush=True)
                break

        if time.time() - last_change_time > args.stale_timeout:
            print(
                f"No progress for {args.stale_timeout}s. Something may be stuck.",
                flush=True,
            )
            break

        time.sleep(args.interval)


if __name__ == "__main__":
    main()

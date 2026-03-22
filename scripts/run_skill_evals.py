#!/usr/bin/env python3
"""
Run all skill evals using a pluggable LLM provider.

Each eval runs as its own CLI process with its own working directory.
The default provider (claude) uses Claude Code's skill discovery: the
with_skill run directory has the skill in .claude/skills/<name>/, the
without_skill directory does not. Providers that lack automatic skill
discovery get the skill content prepended to every prompt.

Usage:
    python run_skill_evals.py \
        --skill-path /path/to/skill \
        --workspace /path/to/workspace \
        --iteration 1 \
        [--provider claude] \
        [--model claude-opus-4-6] \
        [--max-parallel 4] \
        [--timeout 300] \
        [--total-timeout 3600]

Produces:
    <workspace>/iteration-<N>/
    ├── eval-<id>/
    │   ├── eval_metadata.json
    │   ├── with_skill/
    │   │   ├── turn-1/outputs/{response.md, transcript.md}
    │   │   ├── timing.json
    │   │   └── raw_output.jsonl
    │   └── without_skill/
    │       └── (same structure)
    └── run_manifest.json
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from providers import Provider
from providers.claude import ClaudeProvider


CONFIGURATIONS = ["with_skill", "without_skill"]

PROVIDERS = {
    "claude": ClaudeProvider,
}


def get_provider(name: str) -> Provider:
    """Look up a provider by name."""
    cls = PROVIDERS.get(name)
    if cls is None:
        available = ", ".join(sorted(PROVIDERS))
        print(f"Error: unknown provider '{name}'. Available: {available}", file=sys.stderr)
        sys.exit(1)
    return cls()


def run_prepare_fixture(skill_path: Path, run_root: Path, skill_root: str = ".claude") -> dict:
    """Call prepare_fixture.py and return the run paths mapping."""
    script = Path(__file__).parent / "prepare_fixture.py"
    cmd = [
        sys.executable, str(script),
        "--skill-path", str(skill_path),
        "--run-root", str(run_root),
        "--skill-root", skill_root,
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"prepare_fixture.py failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    return json.loads(result.stdout)


def build_prompt(turn_prompt: str, eval_def: dict, fixture_path: str | None, skill_file: str | None = None) -> str:
    """Build the prompt for a turn, handling fixture path and skill file substitution.

    If skill_file is set (absolute path to SKILL.md in the run directory),
    prepend an instruction telling the agent to read and follow that skill.
    """
    prompt = turn_prompt

    if fixture_path and "{{FIXTURE_PATH}}" in prompt:
        prompt = prompt.replace("{{FIXTURE_PATH}}", fixture_path)
    elif fixture_path and eval_def.get("fixture_in_workdir", True):
        has_placeholder_in_any_turn = any(
            "{{FIXTURE_PATH}}" in t.get("prompt", "")
            for t in eval_def.get("turns", [])
        )
        if not has_placeholder_in_any_turn:
            prompt = f"The codebase is at {fixture_path}.\n\n{prompt}"

    if skill_file:
        prompt = f"Read and follow the skill at {skill_file} to complete this task.\n\n{prompt}"

    return prompt


# ---------------------------------------------------------------------------
# Cross-platform process management
# ---------------------------------------------------------------------------

_IS_WINDOWS = sys.platform == "win32"


def _kill_process_tree(pid):
    """Kill a process and all its children.

    On Unix uses process group kill (SIGTERM).
    On Windows uses taskkill /F /T which kills the entire tree.
    """
    if _IS_WINDOWS:
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
            )
        except OSError:
            pass
    else:
        try:
            pgid = os.getpgid(pid)
            os.killpg(pgid, signal.SIGTERM)
        except OSError:
            pass


def _force_kill_process_tree(pid):
    """Force kill a process tree. Unix only (Windows taskkill is already forced)."""
    if _IS_WINDOWS:
        return
    try:
        pgid = os.getpgid(pid)
        os.killpg(pgid, signal.SIGKILL)
    except OSError:
        pass


def run_with_timeout(cmd, prompt, cwd, timeout):
    """Run a CLI command with timeout and full process tree cleanup.

    On Unix spawns the process in its own session so the entire process
    group can be killed on timeout. On Windows uses CREATE_NEW_PROCESS_GROUP
    and taskkill /F /T for tree kill. A threading.Timer triggers the kill,
    which lets communicate() finish draining all buffered output before
    returning. This means partial output from timed-out runs is captured
    rather than lost.

    Returns (stdout, stderr, returncode, timed_out).
    """
    popen_kwargs = dict(
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        text=True,
    )
    if _IS_WINDOWS:
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popen_kwargs["start_new_session"] = True

    process = subprocess.Popen(cmd, **popen_kwargs)

    timed_out = False

    def kill_on_timeout():
        nonlocal timed_out
        timed_out = True
        _kill_process_tree(process.pid)
        force_timer = threading.Timer(5.0, _force_kill_process_tree, args=[process.pid])
        force_timer.daemon = True
        force_timer.start()

    timer = threading.Timer(float(timeout), kill_on_timeout)
    timer.daemon = True
    timer.start()

    try:
        stdout, stderr = process.communicate(input=prompt)
    except Exception:
        stdout, stderr = "", ""
        try:
            process.kill()
        except OSError:
            pass
        process.wait()
    finally:
        timer.cancel()

    return stdout, stderr, process.returncode, timed_out


# ---------------------------------------------------------------------------
# Job runner
# ---------------------------------------------------------------------------

def run_single_job(
    eval_def: dict,
    config: str,
    run_dir: str,
    fixture_path: str | None,
    iteration_dir: Path,
    provider: Provider,
    model: str | None,
    timeout: int,
    deadline: float | None = None,
    skill_file: str | None = None,
) -> dict:
    """Run all turns of one eval+config combination.

    Returns a summary dict for the run manifest.
    """
    eval_id = eval_def["id"]
    eval_name = eval_def.get("eval_name", f"eval-{eval_id}")
    turns = eval_def.get("turns", [])
    session_id = str(uuid.uuid4())

    config_dir = iteration_dir / f"eval-{eval_id}" / config
    config_dir.mkdir(parents=True, exist_ok=True)

    # Skip entirely if the total deadline already passed
    if deadline and time.time() >= deadline:
        print(f"  [{config}] eval-{eval_id} SKIPPED (total timeout exceeded)", flush=True)
        return {
            "eval_id": eval_id,
            "eval_name": eval_name,
            "config": config,
            "session_id": session_id,
            "status": "skipped",
            "error": "Total timeout exceeded before job started",
            "duration_ms": 0,
            "total_tokens": 0,
            "cost_usd": 0,
        }

    all_events = []
    total_input_tokens = 0
    total_output_tokens = 0
    total_duration_ms = 0
    total_cost_usd = 0.0
    status = "success"
    error_message = None

    # Eval-level timeout overrides the CLI default
    eval_timeout = eval_def.get("timeout", timeout)

    for turn_idx, turn in enumerate(turns):
        # Turn-level timeout overrides eval-level
        turn_timeout = turn.get("timeout", eval_timeout)

        # Check total deadline before each turn
        if deadline:
            remaining = deadline - time.time()
            if remaining <= 0:
                status = "timeout"
                error_message = (
                    f"Total timeout exceeded before turn {turn_idx + 1}/{len(turns)}"
                )
                print(
                    f"  [{config}] eval-{eval_id} turn {turn_idx + 1}/{len(turns)} "
                    f"SKIPPED (total timeout)",
                    flush=True,
                )
                break
            effective_timeout = min(turn_timeout, remaining)
        else:
            effective_timeout = turn_timeout

        prompt = build_prompt(turn["prompt"], eval_def, fixture_path, skill_file=skill_file)

        session_name = f"eval-{eval_id}-{config}"
        cmd = provider.build_command(
            session_id=session_id,
            session_name=session_name,
            turn_index=turn_idx,
            model=model,
        )

        print(
            f"  [{config}] eval-{eval_id} turn {turn_idx + 1}/{len(turns)} starting...",
            flush=True,
        )

        stdout, stderr, returncode, timed_out = run_with_timeout(
            cmd, prompt, run_dir, effective_timeout
        )

        turn_result = provider.parse_output(stdout, prompt)

        if timed_out:
            if turn_result.events:
                all_events.extend(turn_result.events)
                turn_dir = config_dir / f"turn-{turn_idx + 1}" / "outputs"
                turn_dir.mkdir(parents=True, exist_ok=True)
                (turn_dir / "response.md").write_text(turn_result.response)
                (turn_dir / "transcript.md").write_text(turn_result.transcript)

            status = "timeout"
            error_message = (
                f"Turn {turn_idx + 1}/{len(turns)} timed out "
                f"after {int(effective_timeout)}s"
            )
            print(
                f"  [{config}] eval-{eval_id} turn {turn_idx + 1}/{len(turns)} TIMEOUT",
                flush=True,
            )
            break

        if returncode != 0 and not stdout.strip():
            status = "error"
            error_message = stderr[:500] if stderr else f"Exit code {returncode}"
            print(
                f"  [{config}] eval-{eval_id} turn {turn_idx + 1}/{len(turns)} "
                f"ERROR: {error_message[:100]}",
                flush=True,
            )
            break

        all_events.extend(turn_result.events)

        turn_dir = config_dir / f"turn-{turn_idx + 1}" / "outputs"
        turn_dir.mkdir(parents=True, exist_ok=True)
        (turn_dir / "response.md").write_text(turn_result.response)
        (turn_dir / "transcript.md").write_text(turn_result.transcript)

        total_duration_ms += turn_result.duration_ms
        total_cost_usd += turn_result.cost_usd
        total_input_tokens += turn_result.input_tokens
        total_output_tokens += turn_result.output_tokens

        print(
            f"  [{config}] eval-{eval_id} turn {turn_idx + 1}/{len(turns)} done "
            f"({turn_result.duration_ms}ms)",
            flush=True,
        )

    total_tokens = total_input_tokens + total_output_tokens

    timing = {
        "total_tokens": total_tokens,
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "duration_ms": total_duration_ms,
        "total_duration_seconds": round(total_duration_ms / 1000.0, 1),
        "cost_usd": round(total_cost_usd, 6),
    }
    (config_dir / "timing.json").write_text(json.dumps(timing, indent=2))

    raw_lines = [json.dumps(e) for e in all_events]
    (config_dir / "raw_output.jsonl").write_text("\n".join(raw_lines))

    summary = {
        "eval_id": eval_id,
        "eval_name": eval_name,
        "config": config,
        "session_id": session_id,
        "status": status,
        "duration_ms": total_duration_ms,
        "total_tokens": total_tokens,
        "cost_usd": round(total_cost_usd, 6),
    }
    if error_message:
        summary["error"] = error_message

    return summary


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Run skill evals using a pluggable LLM provider"
    )
    parser.add_argument(
        "--skill-path", required=True, type=Path,
        help="Path to the skill directory containing evals/evals.json",
    )
    parser.add_argument(
        "--workspace", required=True, type=Path,
        help="Path to the workspace directory (results go here)",
    )
    parser.add_argument(
        "--iteration", required=True, type=int,
        help="Iteration number (creates iteration-N/ subdirectory)",
    )
    parser.add_argument(
        "--provider", default="claude",
        help="LLM provider to use (default: claude). "
             f"Available: {', '.join(sorted(PROVIDERS))}",
    )
    parser.add_argument(
        "--model", default=None,
        help="Model to use (e.g. claude-opus-4-6). Defaults to provider default.",
    )
    parser.add_argument(
        "--max-parallel", type=int, default=4,
        help="Maximum number of parallel eval runs (default: 4)",
    )
    parser.add_argument(
        "--timeout", type=int, default=600,
        help="Timeout per turn in seconds (default: 600)",
    )
    parser.add_argument(
        "--total-timeout", type=int, default=None,
        help="Total timeout for the entire run in seconds. Jobs that "
             "cannot start before this deadline are skipped. "
             "Turns already in progress are capped to the remaining time.",
    )
    parser.add_argument(
        "--run-root", required=True, type=Path,
        help="Directory to create run directories in. Providers with skill "
             "discovery may require a non-temp path.",
    )
    parser.add_argument(
        "--eval-ids", default=None,
        help="Comma-separated list of eval IDs to run (e.g. '1,3,5'). "
             "If omitted, all evals in evals.json are run.",
    )
    parser.add_argument(
        "--force-skill", action="store_true",
        help="Prepend an instruction telling the agent to read and follow the "
             "skill file. Only applies to with_skill runs. Can also be set "
             "per-eval via \"force_skill\": true in evals.json. Providers "
             "without skill discovery always behave as if this is set.",
    )

    args = parser.parse_args()
    skill_path = args.skill_path.expanduser().resolve()
    workspace = args.workspace.expanduser().resolve()

    provider = get_provider(args.provider)

    evals_json_path = skill_path / "evals" / "evals.json"
    if not evals_json_path.exists():
        print(f"Error: {evals_json_path} not found", file=sys.stderr)
        sys.exit(1)

    with open(evals_json_path) as f:
        evals_data = json.load(f)

    evals_list = evals_data.get("evals", [])
    if not evals_list:
        print("Error: no evals found in evals.json", file=sys.stderr)
        sys.exit(1)

    if args.eval_ids:
        requested = {int(x.strip()) for x in args.eval_ids.split(",")}
        evals_list = [e for e in evals_list if e["id"] in requested]
        missing = requested - {e["id"] for e in evals_list}
        if missing:
            print(f"Warning: eval IDs not found in evals.json: {missing}", file=sys.stderr)
        if not evals_list:
            print("Error: no matching evals after filtering by --eval-ids", file=sys.stderr)
            sys.exit(1)

    print(f"Running {len(evals_list)} evals from {evals_json_path}")
    print(f"Provider: {args.provider}")
    print(f"Preparing fixtures...")

    run_root = args.run_root.expanduser().resolve()
    run_paths = run_prepare_fixture(skill_path, run_root, provider.skill_root)

    iteration_dir = workspace / f"iteration-{args.iteration}"
    iteration_dir.mkdir(parents=True, exist_ok=True)

    for eval_def in evals_list:
        eval_id = eval_def["id"]
        eval_dir = iteration_dir / f"eval-{eval_id}"
        eval_dir.mkdir(parents=True, exist_ok=True)

        metadata = {
            "eval_id": eval_id,
            "eval_name": eval_def.get("eval_name", f"eval-{eval_id}"),
            "turns": eval_def.get("turns", []),
        }
        (eval_dir / "eval_metadata.json").write_text(json.dumps(metadata, indent=2))

    # Providers without skill discovery always force-inject the skill
    force_skill_global = args.force_skill or not provider.supports_skill_discovery

    jobs = []
    for eval_def in evals_list:
        eval_id = str(eval_def["id"])
        paths = run_paths.get(eval_id, {})
        for config in CONFIGURATIONS:
            entry = paths.get(config)
            if not entry:
                print(
                    f"Warning: no run directory for eval {eval_id} config {config}",
                    file=sys.stderr,
                )
                continue
            if isinstance(entry, str):
                run_dir = entry
                fixture_path = None
            else:
                run_dir = entry["path"]
                fixture_path = entry.get("fixture_path")
            force = force_skill_global or eval_def.get("force_skill", False)
            skill_file = entry.get("skill_file") if force else None
            jobs.append((eval_def, config, run_dir, fixture_path, skill_file))

    total_jobs = len(jobs)
    print(f"Launching {total_jobs} runs ({len(evals_list)} evals x {len(CONFIGURATIONS)} configs)")
    print(f"Max parallel: {args.max_parallel}, timeout per turn: {args.timeout}s")
    if args.total_timeout:
        print(f"Total timeout: {args.total_timeout}s")
    print()

    start_time = time.time()
    deadline = start_time + args.total_timeout if args.total_timeout else None
    summaries = []
    progress_lock = threading.Lock()
    progress_path = iteration_dir / "progress.json"

    def write_progress():
        elapsed = time.time() - start_time
        completed = len(summaries)
        succeeded = sum(1 for s in summaries if s.get("status") == "success")
        failed = completed - succeeded
        cost_so_far = sum(s.get("cost_usd", 0) for s in summaries)
        progress = {
            "total": total_jobs,
            "completed": completed,
            "succeeded": succeeded,
            "failed": failed,
            "running": total_jobs - completed,
            "elapsed_seconds": round(elapsed, 1),
            "cost_usd": round(cost_so_far, 6),
            "completed_runs": [
                f"eval-{s.get('eval_id')}/{s.get('config')}: {s.get('status')}"
                for s in summaries
            ],
        }
        progress_path.write_text(json.dumps(progress, indent=2))

    write_progress()

    with ThreadPoolExecutor(max_workers=args.max_parallel) as executor:
        futures = {}
        for eval_def, config, run_dir, fixture_path, skill_file in jobs:
            future = executor.submit(
                run_single_job,
                eval_def,
                config,
                run_dir,
                fixture_path,
                iteration_dir,
                provider,
                args.model,
                args.timeout,
                deadline,
                skill_file,
            )
            futures[future] = (eval_def["id"], config)

        for future in as_completed(futures):
            eval_id, config = futures[future]
            try:
                summary = future.result()
                with progress_lock:
                    summaries.append(summary)
                    write_progress()
            except Exception as e:
                print(f"  [{config}] eval-{eval_id} EXCEPTION: {e}", file=sys.stderr)
                with progress_lock:
                    summaries.append({
                        "eval_id": eval_id,
                        "config": config,
                        "status": "exception",
                        "error": str(e),
                    })
                    write_progress()

    elapsed = time.time() - start_time

    manifest = {
        "skill_name": evals_data.get("skill_name", skill_path.name),
        "skill_path": str(skill_path),
        "iteration": args.iteration,
        "provider": args.provider,
        "model": args.model or "default",
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_elapsed_seconds": round(elapsed, 1),
        "runs": summaries,
    }
    manifest_path = iteration_dir / "run_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    succeeded = sum(1 for s in summaries if s.get("status") == "success")
    failed = total_jobs - succeeded
    total_cost = sum(s.get("cost_usd", 0) for s in summaries)

    print()
    print(f"Done. {succeeded}/{total_jobs} runs succeeded in {elapsed:.0f}s")
    if failed:
        print(f"  {failed} runs failed:")
        for s in summaries:
            if s.get("status") != "success":
                print(f"    eval-{s['eval_id']} [{s['config']}]: {s.get('error', s.get('status'))}")
    print(f"  Total cost: ${total_cost:.4f}")
    print(f"  Results: {iteration_dir}")
    print(f"  Manifest: {manifest_path}")


if __name__ == "__main__":
    main()

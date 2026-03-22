#!/usr/bin/env python3
"""
Run all skill evals using claude -p for proper skill isolation.

Each eval runs as its own claude -p process with its own working directory.
Skill discovery works through normal Claude Code mechanisms: the with_skill
run directory has the skill in .claude/skills/<name>/, the without_skill
directory does not. This is the only difference between the two runs.

Usage:
    python run_skill_evals.py \
        --skill-path /path/to/skill \
        --workspace /path/to/workspace \
        --iteration 1 \
        [--model claude-opus-4-6] \
        [--max-parallel 4] \
        [--timeout 300]

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
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


CONFIGURATIONS = ["with_skill", "without_skill"]


def run_prepare_fixture(skill_path: Path) -> dict:
    """Call prepare_fixture.py and return the run paths mapping."""
    script = Path(__file__).parent / "prepare_fixture.py"
    result = subprocess.run(
        [sys.executable, str(script), "--skill-path", str(skill_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"prepare_fixture.py failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    return json.loads(result.stdout)


def parse_stream_json(raw_output: str) -> list[dict]:
    """Parse newline-delimited stream-json output into a list of events."""
    events = []
    for line in raw_output.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return events


def extract_response(events: list[dict]) -> str:
    """Extract text-only responses from stream-json events."""
    parts = []
    for event in events:
        if event.get("type") != "assistant":
            continue
        message = event.get("message", {})
        for block in message.get("content", []):
            if block.get("type") == "text":
                parts.append(block["text"])
    return "\n\n".join(parts)


def extract_transcript(events: list[dict], prompt: str) -> str:
    """Build a readable transcript from stream-json events.

    Format matches what the grader expects:
    [USER INPUT], [TOOL CALL], [TOOL RESULT], [ASSISTANT TEXT]
    """
    sections = []
    sections.append(f"[USER INPUT]\n{prompt}")

    for event in events:
        etype = event.get("type")

        if etype == "assistant":
            message = event.get("message", {})
            for block in message.get("content", []):
                if block.get("type") == "text":
                    sections.append(f"[ASSISTANT TEXT]\n{block['text']}")
                elif block.get("type") == "tool_use":
                    name = block.get("name", "?")
                    inp = block.get("input", {})
                    formatted_input = json.dumps(inp, indent=2)
                    sections.append(f"[TOOL CALL] {name}\n{formatted_input}")

        elif etype == "user":
            message = event.get("message", {})
            for block in message.get("content", []):
                if block.get("type") == "tool_result":
                    content = block.get("content", "")
                    if isinstance(content, list):
                        content = "\n".join(
                            c.get("text", "") for c in content if isinstance(c, dict)
                        )
                    sections.append(f"[TOOL RESULT]\n{content}")

    return "\n\n".join(sections)


def get_result_event(events: list[dict]) -> dict:
    """Find the result event from stream-json output."""
    for event in reversed(events):
        if event.get("type") == "result":
            return event
    return {}


def build_prompt(turn_prompt: str, eval_def: dict, run_dir: str) -> str:
    """Build the prompt for a turn, handling fixture path substitution."""
    fixture_name = eval_def.get("fixture")
    prompt = turn_prompt

    if fixture_name:
        fixture_path = str(Path(run_dir) / fixture_name)
        if "{{FIXTURE_PATH}}" in prompt:
            prompt = prompt.replace("{{FIXTURE_PATH}}", fixture_path)
        else:
            prompt = f"The codebase is at {fixture_path}.\n\n{prompt}"

    return prompt


def run_single_job(
    eval_def: dict,
    config: str,
    run_dir: str,
    iteration_dir: Path,
    model: str | None,
    timeout: int,
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

    all_events = []
    total_input_tokens = 0
    total_output_tokens = 0
    total_duration_ms = 0
    total_cost_usd = 0.0
    status = "success"
    error_message = None

    for turn_idx, turn in enumerate(turns):
        prompt = build_prompt(turn["prompt"], eval_def, run_dir)

        session_name = f"eval-{eval_id}-{config}"
        cmd = ["claude", "-p"]

        if turn_idx == 0:
            cmd.extend(["--session-id", session_id, "--name", session_name])
        else:
            cmd.extend(["--resume", session_id])

        cmd.extend([
            "--output-format", "stream-json",
            "--verbose",
            "--permission-mode", "bypassPermissions",
        ])

        if model:
            cmd.extend(["--model", model])

        print(
            f"  [{config}] eval-{eval_id} turn {turn_idx + 1}/{len(turns)} starting...",
            flush=True,
        )

        try:
            result = subprocess.run(
                cmd,
                input=prompt,
                cwd=run_dir,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            status = "timeout"
            error_message = f"Turn {turn_idx + 1} timed out after {timeout}s"
            print(f"  [{config}] eval-{eval_id} turn {turn_idx + 1} TIMEOUT", flush=True)
            break

        if result.returncode != 0 and not result.stdout.strip():
            status = "error"
            error_message = result.stderr[:500] if result.stderr else f"Exit code {result.returncode}"
            print(
                f"  [{config}] eval-{eval_id} turn {turn_idx + 1} ERROR: {error_message[:100]}",
                flush=True,
            )
            break

        events = parse_stream_json(result.stdout)
        all_events.extend(events)

        response_text = extract_response(events)
        transcript_text = extract_transcript(events, prompt)

        turn_dir = config_dir / f"turn-{turn_idx + 1}" / "outputs"
        turn_dir.mkdir(parents=True, exist_ok=True)
        (turn_dir / "response.md").write_text(response_text)
        (turn_dir / "transcript.md").write_text(transcript_text)

        result_event = get_result_event(events)
        total_duration_ms += result_event.get("duration_ms", 0)
        total_cost_usd += result_event.get("total_cost_usd", 0.0)

        usage = result_event.get("usage", {})
        total_input_tokens += usage.get("input_tokens", 0)
        total_input_tokens += usage.get("cache_read_input_tokens", 0)
        total_input_tokens += usage.get("cache_creation_input_tokens", 0)
        total_output_tokens += usage.get("output_tokens", 0)

        print(
            f"  [{config}] eval-{eval_id} turn {turn_idx + 1}/{len(turns)} done "
            f"({result_event.get('duration_ms', 0)}ms)",
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


def main():
    parser = argparse.ArgumentParser(
        description="Run skill evals using claude -p for proper skill isolation"
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
        "--model", default=None,
        help="Model to use (e.g. claude-opus-4-6). Defaults to session default.",
    )
    parser.add_argument(
        "--max-parallel", type=int, default=4,
        help="Maximum number of parallel eval runs (default: 4)",
    )
    parser.add_argument(
        "--timeout", type=int, default=600,
        help="Timeout per turn in seconds (default: 600)",
    )

    args = parser.parse_args()
    skill_path = args.skill_path.expanduser().resolve()
    workspace = args.workspace.expanduser().resolve()

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

    print(f"Found {len(evals_list)} evals in {evals_json_path}")
    print(f"Preparing fixtures...")

    run_paths = run_prepare_fixture(skill_path)

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

    jobs = []
    for eval_def in evals_list:
        eval_id = str(eval_def["id"])
        paths = run_paths.get(eval_id, {})
        for config in CONFIGURATIONS:
            run_dir = paths.get(config)
            if not run_dir:
                print(
                    f"Warning: no run directory for eval {eval_id} config {config}",
                    file=sys.stderr,
                )
                continue
            jobs.append((eval_def, config, run_dir))

    total_jobs = len(jobs)
    print(f"Launching {total_jobs} runs ({len(evals_list)} evals x {len(CONFIGURATIONS)} configs)")
    print(f"Max parallel: {args.max_parallel}, timeout per turn: {args.timeout}s")
    print()

    start_time = time.time()
    summaries = []
    progress_lock = threading.Lock()
    progress_path = iteration_dir / "progress.json"

    def write_progress():
        """Write current progress so the runner agent can poll it."""
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
        for eval_def, config, run_dir in jobs:
            future = executor.submit(
                run_single_job,
                eval_def,
                config,
                run_dir,
                iteration_dir,
                args.model,
                args.timeout,
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

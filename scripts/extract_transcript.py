#!/usr/bin/env python3
"""
Extract response.md and transcript.md from an agent's JSONL output file.

When an agent is resumed via SendMessage for multi-turn evals, the output
file replays the full prior conversation before appending the new turn.
This script detects replayed content and splits cleanly at turn boundaries.

The transcript includes the raw user input at each turn so reviewers can
see exactly what the agent received.

Usage (single run):
    python extract_transcript.py \\
        --output-file /path/to/agent.output \\
        --dest-dir /path/to/iteration-N/eval-1/with_skill \\
        --num-turns 2

Usage (all runs from a mapping file):
    python extract_transcript.py \\
        --mapping /path/to/iteration-N/agent_mapping.json \\
        --evals-json /path/to/skill/evals/evals.json \\
        --iteration-dir /path/to/iteration-N \\
        --task-dir /path/to/tasks

The mapping file maps agent names (e.g. "e1-ws") to agent IDs.
The script derives eval_id, config, and num_turns from the name and evals.json.
"""

import argparse
import json
import os
import sys


def parse_output_file(filepath):
    """Parse a JSONL output file into a list of entries."""
    entries = []
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def get_user_text(entry):
    """Extract text from a user message entry.

    Returns empty string for tool-result entries (not real user messages).
    """
    msg = entry.get("message", {})
    content = msg.get("content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        items = [item for item in content if isinstance(item, dict)]
        if all(item.get("type") == "tool_result" for item in items):
            return ""
        parts = []
        for item in items:
            if item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "\n".join(parts).strip()
    return ""


def find_turn_boundaries(entries, num_turns):
    """Find (start, end) index pairs for each turn.

    Handles the replay problem: when an agent is resumed via SendMessage,
    the output file contains the full prior conversation replayed before
    the new turn. We detect replays by tracking which user message texts
    have already appeared. A repeated text is a replay boundary. A new
    text is a turn boundary.
    """
    user_msgs = []
    for i, entry in enumerate(entries):
        if entry.get("type") == "user":
            text = get_user_text(entry)
            if text:
                user_msgs.append((i, text))

    if not user_msgs:
        return [(0, len(entries))] * num_turns

    seen_texts = set()
    turn_starts = []
    replay_starts = []

    for idx, text in user_msgs:
        if text in seen_texts:
            replay_starts.append(idx)
        else:
            turn_starts.append(idx)
            seen_texts.add(text)

    all_boundaries = sorted(turn_starts + replay_starts + [len(entries)])

    ranges = []
    for i in range(min(num_turns, len(turn_starts))):
        start = turn_starts[i]
        next_boundaries = [b for b in all_boundaries if b > start]
        end = next_boundaries[0] if next_boundaries else len(entries)
        ranges.append((start, end))

    while len(ranges) < num_turns:
        ranges.append((len(entries), len(entries)))

    return ranges


def extract_range(entries, start, end):
    """Extract response text and full transcript from a slice of entries."""
    response_parts = []
    transcript_parts = []

    for entry in entries[start:end]:
        entry_type = entry.get("type")

        if entry_type == "user":
            text = get_user_text(entry)
            if text:
                transcript_parts.append(f"[USER INPUT]\n{text}\n")
            else:
                msg = entry.get("message", {})
                content = msg.get("content", [])
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "tool_result":
                            rc = item.get("content", "")
                            if isinstance(rc, str):
                                preview = rc[:2000]
                            else:
                                preview = json.dumps(rc, indent=2)[:2000]
                            is_error = item.get("is_error", False)
                            label = "TOOL ERROR" if is_error else "TOOL RESULT"
                            transcript_parts.append(f"[{label}]\n{preview}\n")

        elif entry_type == "assistant":
            msg = entry.get("message", {})
            content = msg.get("content", [])
            if isinstance(content, list):
                for item in content:
                    if not isinstance(item, dict):
                        continue
                    if item.get("type") == "text":
                        text = item.get("text", "")
                        if text.strip():
                            response_parts.append(text)
                            transcript_parts.append(
                                f"[ASSISTANT TEXT]\n{text}\n"
                            )
                    elif item.get("type") == "tool_use":
                        tool_name = item.get("name", "unknown")
                        tool_input = json.dumps(
                            item.get("input", {}), indent=2
                        )[:2000]
                        transcript_parts.append(
                            f"[TOOL CALL: {tool_name}]\n{tool_input}\n"
                        )
            elif isinstance(content, str) and content.strip():
                response_parts.append(content)
                transcript_parts.append(f"[ASSISTANT TEXT]\n{content}\n")

    return {
        "response": "\n\n".join(response_parts),
        "transcript": "\n".join(transcript_parts),
    }


def extract_single(output_file, dest_dir, num_turns):
    """Extract one agent's output into turn-N/outputs/ directories."""
    entries = parse_output_file(output_file)
    turn_ranges = find_turn_boundaries(entries, num_turns)

    for turn_idx, (start, end) in enumerate(turn_ranges):
        turn_num = turn_idx + 1
        data = extract_range(entries, start, end)

        turn_dir = os.path.join(dest_dir, f"turn-{turn_num}", "outputs")
        os.makedirs(turn_dir, exist_ok=True)

        with open(os.path.join(turn_dir, "response.md"), "w") as f:
            f.write(data["response"])
        with open(os.path.join(turn_dir, "transcript.md"), "w") as f:
            f.write(data["transcript"])


def extract_all(mapping_path, evals_json_path, iteration_dir, task_dir):
    """Extract all agents listed in a mapping file."""
    with open(mapping_path) as f:
        mapping = json.load(f)

    with open(evals_json_path) as f:
        evals_data = json.load(f)

    turn_counts = {}
    for ev in evals_data["evals"]:
        turn_counts[ev["id"]] = len(ev.get("turns", [""]))

    processed = 0
    errors = []

    for name, agent_id in mapping.items():
        parts = name.split("-")
        eval_id = int(parts[0][1:])
        config = "with_skill" if parts[1] == "ws" else "without_skill"
        num_turns = turn_counts.get(eval_id, 1)

        output_file = os.path.join(task_dir, f"{agent_id}.output")
        if not os.path.exists(output_file):
            errors.append(f"{name}: output file not found at {output_file}")
            continue

        dest_dir = os.path.join(iteration_dir, f"eval-{eval_id}", config)
        extract_single(output_file, dest_dir, num_turns)
        processed += 1

    print(f"Extracted {processed}/{len(mapping)} agents")
    if errors:
        for e in errors:
            print(f"  ERROR: {e}", file=sys.stderr)

    return len(errors) == 0


def main():
    parser = argparse.ArgumentParser(
        description="Extract response.md and transcript.md from agent output files"
    )

    parser.add_argument(
        "--output-file",
        help="Path to a single agent JSONL output file",
    )
    parser.add_argument(
        "--dest-dir",
        help="Destination directory (e.g. iteration-N/eval-1/with_skill)",
    )
    parser.add_argument(
        "--num-turns",
        type=int,
        default=1,
        help="Number of turns for this eval (default: 1)",
    )

    parser.add_argument(
        "--mapping",
        help="Path to agent_mapping.json for batch extraction",
    )
    parser.add_argument(
        "--evals-json",
        help="Path to the skill's evals/evals.json",
    )
    parser.add_argument(
        "--iteration-dir",
        help="Path to the iteration directory",
    )
    parser.add_argument(
        "--task-dir",
        help="Path to the tasks directory containing .output files",
    )

    args = parser.parse_args()

    if args.output_file:
        if not args.dest_dir:
            parser.error("--dest-dir is required with --output-file")
        extract_single(args.output_file, args.dest_dir, args.num_turns)
        print(f"Extracted {args.num_turns} turn(s) to {args.dest_dir}")
    elif args.mapping:
        if not all([args.evals_json, args.iteration_dir, args.task_dir]):
            parser.error(
                "--evals-json, --iteration-dir, and --task-dir are all "
                "required with --mapping"
            )
        ok = extract_all(
            args.mapping, args.evals_json, args.iteration_dir, args.task_dir
        )
        sys.exit(0 if ok else 1)
    else:
        parser.error("Either --output-file or --mapping is required")


if __name__ == "__main__":
    main()

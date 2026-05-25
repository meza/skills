"""Claude Code provider for skill evaluation.

Runs turns via `claude -p` with stream-json output. Supports multi-turn
sessions via --session-id / --resume. Discovers skills automatically
through .claude/skills/ in the working directory.
"""

import json

from . import Provider, TurnResult
from ..prompt_format import extract_prompt_sections

DEFAULT_EFFORT = "medium"
STREAM_JSON_ARGS = [
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "bypassPermissions",
]


class ClaudeProvider(Provider):
    """Provider that uses the Claude Code CLI (claude -p)."""

    def build_command(
        self,
        session_id: str | None,
        session_name: str,
        turn_index: int,
        model: str | None,
        effort: str | None = None,
        working_dir: str | None = None,
    ) -> list[str]:
        del working_dir
        cmd = ["claude", "-p", "--effort", effort or DEFAULT_EFFORT]
        cmd.extend(_session_args(session_id, session_name, turn_index))
        cmd.extend(STREAM_JSON_ARGS)

        if model:
            cmd.extend(["--model", model])

        return cmd

    def parse_output(self, stdout: str, prompt: str) -> TurnResult:
        events = _parse_stream_json(stdout)
        result_event = _get_result_event(events)
        usage = _usage(result_event)

        return TurnResult(
            response=_extract_response(events),
            transcript=_extract_transcript(events, prompt),
            events=events,
            duration_ms=result_event.get("duration_ms", 0),
            input_tokens=_input_tokens(usage),
            output_tokens=usage.get("output_tokens", 0),
            cost_usd=result_event.get("total_cost_usd", 0.0),
        )

    @property
    def skill_root(self) -> str:
        return ".claude"


def _session_args(
    session_id: str | None, session_name: str, turn_index: int
) -> list[str]:
    if not session_id:
        raise ValueError("ClaudeProvider requires a session_id")

    if turn_index == 0:
        return ["--session-id", session_id, "--name", session_name]

    return ["--resume", session_id]


def _parse_stream_json(raw_output: str) -> list[dict]:
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


def _extract_response(events: list[dict]) -> str:
    """Extract text-only responses from stream-json events."""
    parts = list(_assistant_text_blocks(events))
    return "\n\n".join(parts)


def _assistant_text_blocks(events: list[dict]) -> list[str]:
    return [
        block.get("text", "")
        for event in events
        if event.get("type") == "assistant"
        for block in event.get("message", {}).get("content", [])
        if block.get("type") == "text" and block.get("text", "")
    ]


def _extract_transcript(events: list[dict], prompt: str) -> str:
    """Build a readable transcript from stream-json events.

    Format matches what the grader expects:
    [USER INPUT], [TOOL CALL], [TOOL RESULT], [ASSISTANT TEXT]
    """
    sections = [
        f"{label}\n{content}" for label, content in extract_prompt_sections(prompt)
    ]

    for event in events:
        sections.extend(_event_transcript_sections(event))

    return "\n\n".join(sections)


def _event_transcript_sections(event: dict) -> list[str]:
    if event.get("type") == "assistant":
        return _assistant_sections(event)
    if event.get("type") == "user":
        return _user_sections(event)
    return []


def _assistant_sections(event: dict) -> list[str]:
    return [
        section
        for block in event.get("message", {}).get("content", [])
        for section in _assistant_block_sections(block)
    ]


def _assistant_block_sections(block: dict) -> list[str]:
    if block.get("type") == "text" and block.get("text", ""):
        return [f"[ASSISTANT TEXT]\n{block['text']}"]
    if block.get("type") == "tool_use":
        name = block.get("name", "?")
        formatted_input = json.dumps(block.get("input", {}), indent=2)
        return [f"[TOOL CALL] {name}\n{formatted_input}"]
    return []


def _user_sections(event: dict) -> list[str]:
    return [
        f"[TOOL RESULT]\n{_tool_result_content(block)}"
        for block in event.get("message", {}).get("content", [])
        if block.get("type") == "tool_result"
    ]


def _tool_result_content(block: dict) -> str:
    content = block.get("content", "")
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict))
    return content


def _get_result_event(events: list[dict]) -> dict:
    """Find the result event from stream-json output."""
    for event in reversed(events):
        if event.get("type") == "result":
            return event
    return {}


def _usage(result_event: dict) -> dict:
    return result_event.get("usage", {})


def _input_tokens(usage: dict) -> int:
    return (
        usage.get("input_tokens", 0)
        + usage.get("cache_read_input_tokens", 0)
        + usage.get("cache_creation_input_tokens", 0)
    )

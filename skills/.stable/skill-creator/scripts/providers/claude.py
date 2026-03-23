"""Claude Code provider for skill evaluation.

Runs turns via `claude -p` with stream-json output. Supports multi-turn
sessions via --session-id / --resume. Discovers skills automatically
through .claude/skills/ in the working directory.
"""

import json

from . import Provider, TurnResult


class ClaudeProvider(Provider):
    """Provider that uses the Claude Code CLI (claude -p)."""

    def build_command(
        self,
        session_id: str | None,
        session_name: str,
        turn_index: int,
        model: str | None,
    ) -> list[str]:
        if not session_id:
            raise ValueError("ClaudeProvider requires a session_id")

        cmd = ["claude", "-p", "--effort", "medium"]

        if turn_index == 0:
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

        return cmd

    def parse_output(self, stdout: str, prompt: str) -> TurnResult:
        events = _parse_stream_json(stdout)
        result_event = _get_result_event(events)

        usage = result_event.get("usage", {})
        input_tokens = (
            usage.get("input_tokens", 0)
            + usage.get("cache_read_input_tokens", 0)
            + usage.get("cache_creation_input_tokens", 0)
        )

        return TurnResult(
            response=_extract_response(events),
            transcript=_extract_transcript(events, prompt),
            events=events,
            duration_ms=result_event.get("duration_ms", 0),
            input_tokens=input_tokens,
            output_tokens=usage.get("output_tokens", 0),
            cost_usd=result_event.get("total_cost_usd", 0.0),
        )

    @property
    def skill_root(self) -> str:
        return ".claude"

    @property
    def supports_skill_discovery(self) -> bool:
        return True


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
    parts = []
    for event in events:
        if event.get("type") != "assistant":
            continue
        message = event.get("message", {})
        for block in message.get("content", []):
            if block.get("type") == "text":
                parts.append(block["text"])
    return "\n\n".join(parts)


def _extract_transcript(events: list[dict], prompt: str) -> str:
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


def _get_result_event(events: list[dict]) -> dict:
    """Find the result event from stream-json output."""
    for event in reversed(events):
        if event.get("type") == "result":
            return event
    return {}

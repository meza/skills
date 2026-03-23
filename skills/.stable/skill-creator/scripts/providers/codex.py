"""Codex CLI provider for skill evaluation.

Runs turns via `codex exec --json` and resumes multi-turn conversations with
`codex exec resume`. This provider does not rely on native skill discovery;
the runner force-injects the skill path into the prompt for with_skill runs.
"""

import json
import shutil

from prompt_format import extract_prompt_sections
from . import Provider, TurnResult


class CodexProvider(Provider):
    """Provider that uses the Codex CLI in non-interactive mode."""

    def build_command(
        self,
        session_id: str | None,
        session_name: str,
        turn_index: int,
        model: str | None,
    ) -> list[str]:
        del session_name  # Codex manages thread naming internally.
        executable = _find_codex_executable()

        if turn_index == 0:
            cmd = [executable, "exec", "--json", "--skip-git-repo-check", "-"]
        else:
            if not session_id:
                raise ValueError("Codex resume requires a session_id after turn 0")
            cmd = [
                executable,
                "exec",
                "resume",
                "--json",
                "--skip-git-repo-check",
                session_id,
                "-",
            ]

        if model:
            cmd.extend(["--model", model])

        return cmd

    def parse_output(self, stdout: str, prompt: str) -> TurnResult:
        events = _parse_json_events(stdout)
        usage = _get_turn_completed_usage(events)

        return TurnResult(
            response=_extract_response(events),
            transcript=_extract_transcript(events, prompt),
            events=events,
            session_id=_extract_thread_id(events),
            input_tokens=usage.get("input_tokens", 0) + usage.get("cached_input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
        )

    @property
    def skill_root(self) -> str:
        return ".codex"

    @property
    def supports_skill_discovery(self) -> bool:
        return False


def _find_codex_executable() -> str:
    """Resolve the Codex executable path for subprocess use on Windows."""
    return shutil.which("codex") or shutil.which("codex.cmd") or "codex"


def _parse_json_events(raw_output: str) -> list[dict]:
    """Parse newline-delimited Codex JSON events into a list of dicts."""
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


def _extract_thread_id(events: list[dict]) -> str | None:
    """Return the thread ID emitted by Codex for this turn, if present."""
    for event in events:
        if event.get("type") == "thread.started":
            return event.get("thread_id")
    return None


def _extract_response(events: list[dict]) -> str:
    """Collect completed assistant messages into one response string."""
    parts = []
    for event in events:
        if event.get("type") != "item.completed":
            continue
        item = event.get("item", {})
        if item.get("type") == "agent_message":
            text = item.get("text", "")
            if text:
                parts.append(text)
    return "\n\n".join(parts)


def _extract_transcript(events: list[dict], prompt: str) -> str:
    """Build a readable transcript from Codex JSON events."""
    sections = [f"{label}\n{content}" for label, content in extract_prompt_sections(prompt)]

    for event in events:
        if event.get("type") != "item.completed":
            continue

        item = event.get("item", {})
        item_type = item.get("type")

        if item_type == "command_execution":
            command = item.get("command", "")
            if command:
                sections.append(f"[TOOL CALL] shell\n{command}")

            output = item.get("aggregated_output", "")
            if output:
                sections.append(f"[TOOL RESULT]\n{output}")

        elif item_type == "agent_message":
            text = item.get("text", "")
            if text:
                sections.append(f"[ASSISTANT TEXT]\n{text}")

    return "\n\n".join(sections)


def _get_turn_completed_usage(events: list[dict]) -> dict:
    """Extract token usage from the turn completion event."""
    for event in reversed(events):
        if event.get("type") == "turn.completed":
            return event.get("usage", {})
    return {}

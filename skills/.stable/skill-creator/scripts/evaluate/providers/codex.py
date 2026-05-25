"""Codex CLI provider for skill evaluation.

Runs turns via `codex exec --json` and resumes multi-turn conversations with
`codex exec resume`. The runner prepares an isolated `.codex/skills`
directory for with_skill runs.
"""

import json
import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from . import Provider, TurnResult
from ..prompt_format import extract_prompt_sections

AUTH_FILENAME = "auth.json"
CODEX_API_KEY_ENV = "CODEX_API_KEY"
CODEX_ACCESS_TOKEN_ENV = "CODEX_ACCESS_TOKEN"
CODEX_HOME_ENV = "CODEX_HOME"
HOME_ENV = "HOME"
USERPROFILE_ENV = "USERPROFILE"
CODEX_AUTH_ENV_VARS = [
    CODEX_API_KEY_ENV,
    CODEX_ACCESS_TOKEN_ENV,
]
SHELL_ENV_SECRET_FILTER_ARGS = [
    "-c",
    "shell_environment_policy.ignore_default_excludes=false",
]
EVAL_ISOLATION_CONFIG_ARGS = [
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    "features.plugins=false",
]


class CodexProvider(Provider):
    """Provider that uses the Codex CLI in non-interactive mode."""

    def build_command(
        self,
        session_id: str | None,
        session_name: str,
        turn_index: int,
        model: str | None,
        effort: str | None = None,
        working_dir: str | None = None,
    ) -> list[str]:
        del session_name  # Codex manages thread naming internally.
        del effort
        executable = _find_codex_executable()

        if turn_index == 0:
            cmd = [
                executable,
                "exec",
                "--json",
                "--skip-git-repo-check",
                "--ephemeral",
                "--ignore-user-config",
                *SHELL_ENV_SECRET_FILTER_ARGS,
                *EVAL_ISOLATION_CONFIG_ARGS,
                "-",
            ]
            if working_dir:
                cmd.extend(["--cd", working_dir])
        else:
            if not session_id:
                raise ValueError("Codex resume requires a session_id after turn 0")
            cmd = [
                executable,
                "exec",
                "resume",
                "--json",
                "--skip-git-repo-check",
                "--ephemeral",
                "--ignore-user-config",
                *SHELL_ENV_SECRET_FILTER_ARGS,
                *EVAL_ISOLATION_CONFIG_ARGS,
                session_id,
                "-",
            ]

        if model:
            cmd.extend(["--model", model])

        return cmd

    def build_grading_command(
        self,
        model: str | None,
        effort: str | None,
        working_dir: str,
        output_schema: str,
    ) -> list[str]:
        del effort
        cmd = [
            _find_codex_executable(),
            "exec",
            "--json",
            "--skip-git-repo-check",
            "--ephemeral",
            "--ignore-user-config",
            *SHELL_ENV_SECRET_FILTER_ARGS,
            *EVAL_ISOLATION_CONFIG_ARGS,
            "-",
            "--cd",
            working_dir,
            "--output-schema",
            output_schema,
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
            input_tokens=usage.get("input_tokens", 0)
            + usage.get("cached_input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
        )

    @contextmanager
    def process_environment(
        self,
        base_env: dict[str, str],
        run_dir: str,
        artifact_dir,
    ) -> Iterator[dict[str, str]]:
        del artifact_dir

        with tempfile.TemporaryDirectory(prefix="skill-creator-codex-") as temp_dir:
            isolated_root = Path(temp_dir)
            isolated_home = isolated_root / "home"
            isolated_home.mkdir()

            isolated_codex_home = Path(run_dir) / self.skill_root
            isolated_codex_home.mkdir(parents=True, exist_ok=True)
            _copy_codex_auth_file(
                source_codex_home=_source_codex_home(base_env),
                target_codex_home=isolated_codex_home,
            )

            process_env = _base_process_env(base_env)
            process_env[CODEX_HOME_ENV] = str(isolated_codex_home)
            process_env[HOME_ENV] = str(isolated_home)
            process_env[USERPROFILE_ENV] = str(isolated_home)
            try:
                yield process_env
            finally:
                _remove_copied_codex_auth_file(isolated_codex_home)

    @property
    def skill_root(self) -> str:
        return ".codex"


def _find_codex_executable() -> str:
    """Resolve the Codex executable path for subprocess use on Windows."""
    return shutil.which("codex") or shutil.which("codex.cmd") or "codex"


def _source_codex_home(env: dict[str, str]) -> Path:
    if env.get(CODEX_HOME_ENV):
        return Path(env[CODEX_HOME_ENV]).expanduser()
    if env.get(HOME_ENV):
        return Path(env[HOME_ENV]).expanduser() / ".codex"
    if env.get(USERPROFILE_ENV):
        return Path(env[USERPROFILE_ENV]).expanduser() / ".codex"
    return Path.home() / ".codex"


def _base_process_env(env: dict[str, str]) -> dict[str, str]:
    process_env = dict(env)
    for auth_env_var in CODEX_AUTH_ENV_VARS:
        process_env.pop(auth_env_var, None)
    return process_env


def _copy_codex_auth_file(source_codex_home: Path, target_codex_home: Path) -> None:
    source_auth = source_codex_home / AUTH_FILENAME
    if not source_auth.exists():
        return

    try:
        target_codex_home.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_auth, target_codex_home / AUTH_FILENAME)
    except OSError as error:
        raise RuntimeError(f"Unable to copy Codex auth from {source_auth}") from error


def _remove_copied_codex_auth_file(target_codex_home: Path) -> None:
    try:
        (target_codex_home / AUTH_FILENAME).unlink(missing_ok=True)
    except OSError as error:
        raise RuntimeError(
            f"Unable to remove copied Codex auth from {target_codex_home}"
        ) from error


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
    """Return the final completed assistant message for the turn."""
    messages = [
        item.get("text", "")
        for item in _completed_items(events)
        if item.get("type") == "agent_message" and item.get("text", "")
    ]
    return messages[-1] if messages else ""


def _extract_transcript(events: list[dict], prompt: str) -> str:
    """Build a readable transcript from Codex JSON events."""
    sections = [
        f"{label}\n{content}" for label, content in extract_prompt_sections(prompt)
    ]

    for item in _completed_items(events):
        sections.extend(_item_transcript_sections(item))

    return "\n\n".join(sections)


def _completed_items(events: list[dict]) -> list[dict]:
    return [
        event.get("item", {})
        for event in events
        if event.get("type") == "item.completed"
    ]


def _item_transcript_sections(item: dict) -> list[str]:
    if item.get("type") == "command_execution":
        return _command_execution_sections(item)
    if item.get("type") == "agent_message" and item.get("text", ""):
        return [f"[ASSISTANT TEXT]\n{item['text']}"]
    return []


def _command_execution_sections(item: dict) -> list[str]:
    sections = []
    if item.get("command", ""):
        sections.append(f"[TOOL CALL] shell\n{item['command']}")
    if item.get("aggregated_output", ""):
        sections.append(f"[TOOL RESULT]\n{item['aggregated_output']}")
    return sections


def _get_turn_completed_usage(events: list[dict]) -> dict:
    """Extract token usage from the turn completion event."""
    for event in reversed(events):
        if event.get("type") == "turn.completed":
            return event.get("usage", {})
    return {}

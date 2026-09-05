"""Codex CLI provider for skill evaluation.

Runs turns via `codex exec --json` and resumes multi-turn conversations with
`codex exec resume`. The runner prepares an isolated `.codex/skills`
directory for skill runs.
"""

import json
import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from . import PermissionMode, Provider, TurnResult, minimized_process_env
from .codex_parent_evidence import enrich_parent
from ..prompt_format import extract_prompt_sections
from ..telemetry import redact_sensitive_telemetry

AUTH_FILENAME = "auth.json"
SENSITIVE_ACTIONS_FILENAME = "sensitive_actions.jsonl"
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
CODEX_SANDBOX_MODES = {
    PermissionMode.RESTRICTED: "workspace-write",
    PermissionMode.UNRESTRICTED: "danger-full-access",
}
CODEX_APPROVAL_CONFIG_ARGS = [
    "-c",
    'approval_policy="never"',
]
CODEX_LOGIN_SHELL_CONFIG_ARGS = [
    "-c",
    "allow_login_shell=false",
]
# Eval jobs use fresh Codex homes, so elevated setup would request administrator
# approval for every worker. The documented fallback preserves sandboxing without UAC.
CODEX_WINDOWS_SANDBOX_CONFIG_ARGS = [
    "-c",
    'windows.sandbox="unelevated"',
]
EVAL_ISOLATION_CONFIG_ARGS = [
    "-c",
    "skills.bundled.enabled=false",
    "-c",
    "features.plugins=false",
]


def _codex_eval_policy_args(
    command_args: list[str] | None = None,
    extra_config_args: list[str] | None = None,
    effort: str | None = None,
) -> list[str]:
    return [
        "--json",
        "--skip-git-repo-check",
        *(command_args or []),
        "--ignore-user-config",
        "--ignore-rules",
        *SHELL_ENV_SECRET_FILTER_ARGS,
        *CODEX_APPROVAL_CONFIG_ARGS,
        *CODEX_LOGIN_SHELL_CONFIG_ARGS,
        *CODEX_WINDOWS_SANDBOX_CONFIG_ARGS,
        *(extra_config_args or []),
        *EVAL_ISOLATION_CONFIG_ARGS,
        *_codex_reasoning_effort_args(effort),
    ]


def _codex_reasoning_effort_args(effort: str | None) -> list[str]:
    if effort is None:
        return []
    return ["-c", f"model_reasoning_effort={json.dumps(effort)}"]


def _codex_sandbox_args(permission_mode: PermissionMode) -> list[str]:
    return ["--sandbox", CODEX_SANDBOX_MODES[permission_mode]]


def _codex_sandbox_config_args(permission_mode: PermissionMode) -> list[str]:
    sandbox_mode = CODEX_SANDBOX_MODES[permission_mode]
    return ["-c", f'sandbox_mode="{sandbox_mode}"']


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
        additional_writable_dirs: list[str] | None = None,
        permission_mode: PermissionMode = PermissionMode.RESTRICTED,
    ) -> list[str]:
        del session_name  # Codex manages thread naming internally.
        executable = _find_codex_executable()

        if turn_index == 0:
            cmd = [
                executable,
                "exec",
                *_codex_eval_policy_args(
                    command_args=_codex_sandbox_args(permission_mode),
                    effort=effort,
                ),
            ]
            _add_initial_working_dirs(cmd, working_dir, additional_writable_dirs)
            cmd.append("-")
        else:
            if not session_id:
                raise ValueError("Codex resume requires a session_id after turn 0")
            cmd = [
                executable,
                "exec",
                "resume",
                *_codex_eval_policy_args(
                    extra_config_args=_codex_sandbox_config_args(permission_mode),
                    effort=effort,
                ),
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
        permission_mode: PermissionMode = PermissionMode.RESTRICTED,
    ) -> list[str]:
        cmd = [
            _find_codex_executable(),
            "exec",
            *_codex_eval_policy_args(
                command_args=_codex_sandbox_args(permission_mode),
                effort=effort,
            ),
            "--cd",
            working_dir,
            "-",
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
        with tempfile.TemporaryDirectory(prefix="skill-creator-codex-") as temp_dir:
            isolated_root = Path(temp_dir)
            isolated_home = isolated_root / "home"
            isolated_home.mkdir()

            prepared_codex_home = Path(run_dir) / self.skill_root
            isolated_codex_home = isolated_root / self.skill_root
            isolated_codex_home.mkdir(parents=True, exist_ok=True)
            _copy_prepared_codex_skills(prepared_codex_home, isolated_codex_home)
            copied_auth = _copy_codex_auth_file(
                source_codex_home=_source_codex_home(base_env),
                target_codex_home=isolated_codex_home,
            )
            if copied_auth:
                _write_sensitive_action_event(
                    Path(artifact_dir),
                    {
                        "type": "codex.auth_staged",
                        "source": str(copied_auth["source"]),
                        "target": str(copied_auth["target"]),
                    },
                )

            process_env = _base_process_env(base_env)
            process_env[CODEX_HOME_ENV] = str(isolated_codex_home)
            process_env[HOME_ENV] = str(isolated_home)
            process_env[USERPROFILE_ENV] = str(isolated_home)
            try:
                yield process_env
            finally:
                _remove_copied_codex_auth_file(isolated_codex_home)
                if copied_auth:
                    _write_sensitive_action_event(
                        Path(artifact_dir),
                        {
                            "type": "codex.auth_removed",
                            "target": str(copied_auth["target"]),
                        },
                    )

    @property
    def skill_root(self) -> str:
        return ".codex"

    def enrich_turn_result(
        self, result, process_env, artifact_dir, turn_index, session_id
    ) -> None:
        enrich_parent(result, process_env, artifact_dir, turn_index, session_id)

    @property
    def requires_first_turn_session_id(self) -> bool:
        return True


def _add_initial_working_dirs(
    cmd: list[str],
    working_dir: str | None,
    additional_writable_dirs: list[str] | None,
) -> None:
    if working_dir:
        cmd.extend(["--cd", working_dir, "--add-dir", working_dir])
    for writable_dir in additional_writable_dirs or []:
        cmd.extend(["--add-dir", writable_dir])


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
    process_env = minimized_process_env(env)
    for auth_env_var in CODEX_AUTH_ENV_VARS:
        process_env.pop(auth_env_var, None)
    return process_env


def _copy_prepared_codex_skills(
    prepared_codex_home: Path,
    isolated_codex_home: Path,
) -> None:
    prepared_skills = prepared_codex_home / "skills"
    if not prepared_skills.exists():
        return

    shutil.copytree(
        prepared_skills,
        isolated_codex_home / "skills",
        dirs_exist_ok=True,
    )


def _copy_codex_auth_file(
    source_codex_home: Path,
    target_codex_home: Path,
) -> dict[str, Path] | None:
    source_auth = source_codex_home / AUTH_FILENAME
    if not source_auth.exists():
        return None

    target_auth = target_codex_home / AUTH_FILENAME
    try:
        target_codex_home.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_auth, target_auth)
    except OSError as error:
        raise RuntimeError(f"Unable to copy Codex auth from {source_auth}") from error
    return {"source": source_auth, "target": target_auth}


def _remove_copied_codex_auth_file(target_codex_home: Path) -> None:
    try:
        (target_codex_home / AUTH_FILENAME).unlink(missing_ok=True)
    except OSError as error:
        raise RuntimeError(
            f"Unable to remove copied Codex auth from {target_codex_home}"
        ) from error


def _write_sensitive_action_event(artifact_dir: Path, event: dict[str, str]) -> None:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    with (artifact_dir / SENSITIVE_ACTIONS_FILENAME).open(
        "a",
        encoding="utf-8",
    ) as audit_file:
        audit_file.write(json.dumps(event))
        audit_file.write("\n")


def _parse_json_events(raw_output: str) -> list[dict]:
    """Parse newline-delimited Codex JSON events into a list of dicts."""
    events = []
    for line_number, line in enumerate(raw_output.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            events.append(_parse_warning_event("codex", line_number, line))
    return events


def _parse_warning_event(provider: str, line_number: int, content: str) -> dict:
    return {
        "type": "provider.parse_warning",
        "provider": provider,
        "line": line_number,
        "message": "Malformed JSON event",
        "content": redact_sensitive_telemetry(content),
    }


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
    item_type = item.get("type", "")
    if item_type == "collab_tool_call":
        return [
            f"[COLLABORATION] {item.get('tool', item_type)}\n"
            f"{json.dumps(item, indent=2)}"
        ]
    if item_type.endswith("_tool_call") or item_type == "web_search":
        tool = item.get("tool") or item.get("name") or item_type
        return [f"[TOOL CALL] {tool}\n{json.dumps(item, indent=2)}"]
    return [json.dumps(item, indent=2)]


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

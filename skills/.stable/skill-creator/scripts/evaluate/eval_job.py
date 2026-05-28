"""Run one prepared eval run type and write its artifacts."""

import contextlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from .eval_definitions import EvalDefinition, EvalTurn, ensure_eval_definition
from .providers import Provider

_IS_WINDOWS = sys.platform == "win32"
_ACTIVE_PROCESS_IDS: set[int] = set()
_ACTIVE_PROCESS_IDS_LOCK = threading.Lock()


def build_prompt(
    turn_prompt: str,
    eval_def: EvalDefinition | dict,
    fixture_path: str | None,
) -> str:
    """Build the prompt for a turn."""
    prompt = turn_prompt

    if fixture_path and "{{FIXTURE_PATH}}" in prompt:
        prompt = prompt.replace("{{FIXTURE_PATH}}", fixture_path)
    elif _should_prefix_fixture_path(eval_def, fixture_path):
        prompt = f"The codebase is at {fixture_path}.\n\n{prompt}"

    return prompt


def _should_prefix_fixture_path(
    eval_def: EvalDefinition | dict, fixture_path: str | None
) -> bool:
    typed_eval = ensure_eval_definition(eval_def)
    if not fixture_path or not typed_eval.fixture_in_workdir:
        return False
    return not any("{{FIXTURE_PATH}}" in turn.prompt for turn in typed_eval.turns)


def _resolve_existing_git_global_config(env: dict[str, str]) -> Path | None:
    """Return the current global git config path if the environment defines one."""
    for path in _git_global_config_candidates(env):
        if path.exists():
            return path.resolve()
    return None


def _git_global_config_candidates(env: dict[str, str]) -> list[Path]:
    candidates = []
    if env.get("GIT_CONFIG_GLOBAL"):
        candidates.append(Path(env["GIT_CONFIG_GLOBAL"]).expanduser())
    if env.get("XDG_CONFIG_HOME"):
        candidates.append(Path(env["XDG_CONFIG_HOME"]).expanduser() / "git" / "config")
    for home_var in ("HOME", "USERPROFILE"):
        if env.get(home_var):
            candidates.append(Path(env[home_var]).expanduser() / ".gitconfig")
    return candidates


def _safe_directory_variants(path: str | Path) -> list[str]:
    """Return equivalent path strings Git may compare for safe.directory."""
    resolved = Path(path).expanduser().resolve()
    return [resolved.as_posix()]


def _build_git_process_env(
    base_env: dict[str, str],
    trusted_repo_paths: list[str | None],
) -> tuple[dict[str, str], Path | None]:
    """Create a process-scoped git config that trusts the prepared repo paths."""
    safe_directories = _safe_directories_for(trusted_repo_paths)
    env = dict(base_env)
    if not safe_directories:
        return env, None

    temp_config_path = _write_process_git_config(
        _resolve_existing_git_global_config(env),
        safe_directories,
    )
    env["GIT_CONFIG_GLOBAL"] = str(temp_config_path)
    return env, temp_config_path


def _safe_directories_for(trusted_repo_paths: list[str | None]) -> list[str]:
    safe_directories: list[str] = []
    for repo_path in _trusted_git_repo_paths(trusted_repo_paths):
        for variant in _safe_directory_variants(repo_path):
            if variant not in safe_directories:
                safe_directories.append(variant)
    return safe_directories


def _trusted_git_repo_paths(trusted_repo_paths: list[str | None]) -> list[str]:
    return [
        repo_path
        for repo_path in trusted_repo_paths
        if repo_path and (Path(repo_path).expanduser().resolve() / ".git").exists()
    ]


def _write_process_git_config(
    existing_global: Path | None,
    safe_directories: list[str],
) -> Path:
    lines: list[str] = []
    if existing_global:
        lines.extend(
            [
                "[include]",
                f"\tpath = {existing_global.as_posix()}",
                "",
            ]
        )

    lines.extend(
        [
            "[core]",
            "\tfsmonitor = false",
            "",
        ]
    )

    for safe_directory in safe_directories:
        lines.extend(
            [
                "[safe]",
                f"\tdirectory = {safe_directory}",
                "",
            ]
        )

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".gitconfig",
        delete=False,
    ) as temp_config:
        temp_config.write("\n".join(lines))
        temp_config_path = Path(temp_config.name)

    return temp_config_path


def stop_git_fsmonitor_daemons(run_root: Path | str) -> None:
    """Stop Git fsmonitor daemons for repositories created under an eval run root.

    The eval provider runs with a temporary Git config that disables fsmonitor,
    but existing fixture repositories may already have detached fsmonitor daemons.
    This cleanup is intentionally scoped to repositories physically located under
    the eval run root and does not change any Git config.
    """
    root = Path(run_root).expanduser().resolve()
    if not root.exists():
        return

    for git_dir in root.rglob(".git"):
        repo_path = git_dir.parent
        try:
            subprocess.run(
                ["git", "-C", str(repo_path), "fsmonitor--daemon", "stop"],
                capture_output=True,
                text=True,
                timeout=5,
            )
        except (OSError, subprocess.TimeoutExpired):
            pass


def _kill_process_tree(pid):
    """Kill a process and all its children."""
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
    """Force kill a process tree on Unix."""
    if _IS_WINDOWS:
        return
    try:
        pgid = os.getpgid(pid)
        os.killpg(pgid, signal.SIGKILL)
    except OSError:
        pass


def register_process(pid: int) -> None:
    with _ACTIVE_PROCESS_IDS_LOCK:
        _ACTIVE_PROCESS_IDS.add(pid)


def unregister_process(pid: int) -> None:
    with _ACTIVE_PROCESS_IDS_LOCK:
        _ACTIVE_PROCESS_IDS.discard(pid)


def kill_active_processes() -> None:
    with _ACTIVE_PROCESS_IDS_LOCK:
        process_ids = sorted(_ACTIVE_PROCESS_IDS)
        _ACTIVE_PROCESS_IDS.clear()

    for pid in process_ids:
        _kill_process_tree(pid)


def run_with_timeout(cmd, prompt, cwd, timeout, env=None):
    """Run a CLI command with timeout and full process tree cleanup."""
    popen_kwargs = dict(
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
    )
    if _IS_WINDOWS:
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popen_kwargs["start_new_session"] = True

    process = subprocess.Popen(cmd, **popen_kwargs)
    register_process(process.pid)

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

    start = time.monotonic()
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
        unregister_process(process.pid)

    duration_ms = int((time.monotonic() - start) * 1000)
    return stdout, stderr, process.returncode, timed_out, duration_ms


@dataclass
class EvalJob:
    eval_def: EvalDefinition | dict
    run_type: str
    run_dir: str
    fixture_path: str | None
    iteration_dir: Path
    provider: Provider
    model: str | None
    effort: str | None
    timeout: int
    deadline: float | None = None
    grading_job_factory: Callable[["EvalJob"], object] | None = None
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    all_events: list[dict] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0
    cost_usd: float = 0.0
    status: str = "success"
    error_message: str | None = None

    def __post_init__(self) -> None:
        self.eval_def = ensure_eval_definition(self.eval_def)

    @property
    def eval_id(self) -> int:
        return self.eval_def.id

    @property
    def turns(self) -> list[EvalTurn]:
        return self.eval_def.turns

    @property
    def run_type_dir(self) -> Path:
        return self.iteration_dir / f"eval-{self.eval_id}" / self.run_type

    def run(self) -> dict:
        self.run_type_dir.mkdir(parents=True, exist_ok=True)
        if self.deadline and time.time() >= self.deadline:
            return self.skipped_summary()

        process_env, temp_git_config = _build_git_process_env(
            os.environ,
            [self.run_dir, self.fixture_path],
        )
        try:
            with _provider_process_environment(
                self.provider,
                process_env,
                self.run_dir,
                self.run_type_dir,
            ) as provider_env:
                self.run_turns(provider_env)
        finally:
            if temp_git_config:
                temp_git_config.unlink(missing_ok=True)

        self.write_run_artifacts()
        self.run_grading_job()
        return self.summary()

    def run_turns(self, process_env: dict[str, str]) -> None:
        eval_timeout = self.eval_def.timeout or self.timeout
        for turn_idx, turn in enumerate(self.turns):
            turn_timeout = turn.timeout or eval_timeout
            effective_timeout = self.effective_timeout(turn_timeout, turn_idx)
            if effective_timeout is None:
                break
            if not self.run_turn(turn_idx, turn, effective_timeout, process_env):
                break

    def effective_timeout(self, turn_timeout: int, turn_idx: int) -> float | None:
        if not self.deadline:
            return turn_timeout
        remaining = self.deadline - time.time()
        if remaining > 0:
            return min(turn_timeout, remaining)
        self.status = "timeout"
        self.error_message = (
            f"Total timeout exceeded before turn {turn_idx + 1}/{len(self.turns)}"
        )
        print(
            f"  [{self.run_type}] eval-{self.eval_id} turn "
            f"{turn_idx + 1}/{len(self.turns)} SKIPPED (total timeout)",
            flush=True,
        )
        return None

    def run_turn(
        self,
        turn_idx: int,
        turn: EvalTurn,
        effective_timeout: float,
        process_env: dict[str, str],
    ) -> bool:
        prompt = build_prompt(
            turn.prompt,
            self.eval_def,
            self.fixture_path,
        )
        stdout, stderr, returncode, timed_out, wall_clock_ms = self.invoke_provider(
            turn_idx,
            prompt,
            effective_timeout,
            process_env,
        )
        turn_result = self.provider.parse_output(stdout, prompt)
        if turn_result.duration_ms <= 0:
            turn_result.duration_ms = wall_clock_ms
        self.session_id = turn_result.session_id or self.session_id

        if timed_out:
            return self.record_timeout(turn_idx, effective_timeout, turn_result)
        if returncode != 0 and not stdout.strip():
            return self.record_error(turn_idx, stderr, returncode)
        self.record_success(turn_idx, turn_result)
        return True

    def invoke_provider(
        self,
        turn_idx: int,
        prompt: str,
        effective_timeout: float,
        process_env: dict[str, str],
    ) -> tuple[str, str, int, bool, int]:
        cmd = self.provider.build_command(
            session_id=self.session_id,
            session_name=f"eval-{self.eval_id}-{self.run_type}",
            turn_index=turn_idx,
            model=self.model,
            effort=self.effort,
            working_dir=self.run_dir,
        )
        print(
            f"  [{self.run_type}] eval-{self.eval_id} turn "
            f"{turn_idx + 1}/{len(self.turns)} starting...",
            flush=True,
        )
        return run_with_timeout(
            cmd,
            prompt,
            self.run_dir,
            effective_timeout,
            env=process_env,
        )

    def record_timeout(self, turn_idx: int, effective_timeout: float, turn_result):
        if turn_result.events:
            self.all_events.extend(turn_result.events)
            self.write_turn_outputs(turn_idx, turn_result)
        self.status = "timeout"
        self.error_message = (
            f"Turn {turn_idx + 1}/{len(self.turns)} timed out "
            f"after {int(effective_timeout)}s"
        )
        print(
            f"  [{self.run_type}] eval-{self.eval_id} turn "
            f"{turn_idx + 1}/{len(self.turns)} TIMEOUT",
            flush=True,
        )
        return False

    def record_error(self, turn_idx: int, stderr: str, returncode: int) -> bool:
        self.status = "error"
        self.error_message = stderr[:500] if stderr else f"Exit code {returncode}"
        print(
            f"  [{self.run_type}] eval-{self.eval_id} turn "
            f"{turn_idx + 1}/{len(self.turns)} ERROR: {self.error_message[:100]}",
            flush=True,
        )
        return False

    def record_success(self, turn_idx: int, turn_result) -> None:
        self.all_events.extend(turn_result.events)
        self.write_turn_outputs(turn_idx, turn_result)
        self.duration_ms += turn_result.duration_ms
        self.cost_usd += turn_result.cost_usd
        self.input_tokens += turn_result.input_tokens
        self.output_tokens += turn_result.output_tokens
        print(
            f"  [{self.run_type}] eval-{self.eval_id} turn "
            f"{turn_idx + 1}/{len(self.turns)} done ({turn_result.duration_ms}ms)",
            flush=True,
        )

    def write_turn_outputs(self, turn_idx: int, turn_result) -> None:
        turn_dir = self.run_type_dir / f"turn-{turn_idx + 1}" / "outputs"
        turn_dir.mkdir(parents=True, exist_ok=True)
        (turn_dir / "response.md").write_text(
            turn_result.response,
            encoding="utf-8",
        )
        (turn_dir / "transcript.md").write_text(
            turn_result.transcript,
            encoding="utf-8",
        )

    def write_run_artifacts(self) -> None:
        (self.run_type_dir / "transcript.md").write_text(
            self.run_transcript(),
            encoding="utf-8",
        )
        (self.run_type_dir / "timing.json").write_text(
            json.dumps(self.timing(), indent=2),
            encoding="utf-8",
        )
        raw_lines = [json.dumps(event) for event in self.all_events]
        (self.run_type_dir / "raw_output.jsonl").write_text(
            "\n".join(raw_lines),
            encoding="utf-8",
        )

    def run_transcript(self) -> str:
        transcript_parts = []
        for turn_dir in sorted(self.run_type_dir.glob("turn-*/outputs")):
            transcript_path = turn_dir / "transcript.md"
            if transcript_path.exists():
                transcript_parts.append(transcript_path.read_text(encoding="utf-8"))
        return "\n\n".join(transcript_parts)

    def run_grading_job(self) -> None:
        if not self.grading_job_factory:
            return
        self.grading_job_factory(self).run()

    def timing(self) -> dict:
        return {
            "total_tokens": self.total_tokens,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "duration_ms": self.duration_ms,
            "total_duration_seconds": round(self.duration_ms / 1000.0, 1),
            "cost_usd": round(self.cost_usd, 6),
        }

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    def summary(self) -> dict:
        summary = {
            "eval_id": self.eval_id,
            "eval_name": self.eval_def.display_name,
            "run_type": self.run_type,
            "session_id": self.session_id,
            "status": self.status,
            "duration_ms": self.duration_ms,
            "total_tokens": self.total_tokens,
            "cost_usd": round(self.cost_usd, 6),
        }
        if self.error_message:
            summary["error"] = self.error_message
        return summary

    def skipped_summary(self) -> dict:
        print(
            f"  [{self.run_type}] eval-{self.eval_id} SKIPPED "
            "(total timeout exceeded)",
            flush=True,
        )
        return {
            "eval_id": self.eval_id,
            "eval_name": self.eval_def.display_name,
            "run_type": self.run_type,
            "session_id": self.session_id,
            "status": "skipped",
            "error": "Total timeout exceeded before job started",
            "duration_ms": 0,
            "total_tokens": 0,
            "cost_usd": 0,
        }


def run_single_job(
    eval_def: EvalDefinition | dict,
    run_type: str,
    run_dir: str,
    fixture_path: str | None,
    iteration_dir: Path,
    provider: Provider,
    model: str | None,
    effort: str | None,
    timeout: int,
    deadline: float | None = None,
    grading_job_factory: Callable[["EvalJob"], object] | None = None,
) -> dict:
    """Run all turns of one eval and run-type combination."""
    return EvalJob(
        eval_def=eval_def,
        run_type=run_type,
        run_dir=run_dir,
        fixture_path=fixture_path,
        iteration_dir=iteration_dir,
        provider=provider,
        model=model,
        effort=effort,
        timeout=timeout,
        deadline=deadline,
        grading_job_factory=grading_job_factory,
    ).run()


def _provider_process_environment(
    provider: Provider,
    process_env: dict[str, str],
    run_dir: str,
    artifact_dir: Path,
):
    process_environment = getattr(provider, "process_environment", None)
    if process_environment is None:
        return contextlib.nullcontext(process_env)
    return process_environment(process_env, run_dir, artifact_dir)

"""Prepare the evaluator's isolated runtime before importing its dependencies.

The operator owns Python discovery and host permissions. This module owns only
the evaluator packages below the validated run root. It never installs Python,
changes PATH, or writes into the installed skill directory.
"""

import hashlib
import importlib.metadata
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Callable

REQUIRED_PYTHON = (3, 13)
COMPLETION_MARKER = ".skill-creator-runtime.json"
SKILL_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_REQUIREMENTS_PATH = SKILL_ROOT / "runtime-requirements.txt"
PINNED_REQUIREMENT = re.compile(
    r"^(?P<name>[A-Za-z0-9][A-Za-z0-9_.-]*)==(?P<version>[^\s;]+)$"
)


class RuntimeBootstrapError(RuntimeError):
    """Report a host or runtime condition that prevents safe bootstrapping."""


class RunRootInsideGitWorkspaceError(ValueError):
    """Reject eval output paths that would inherit a Git workspace."""


def parse_run_root(arguments: list[str]) -> Path | None:
    """Read only ``--run-root`` while leaving the public CLI parser authoritative."""
    for index, argument in enumerate(arguments):
        if argument == "--run-root" and index + 1 < len(arguments):
            return Path(arguments[index + 1]).expanduser().resolve(strict=False)
        if argument.startswith("--run-root="):
            return Path(argument.split("=", 1)[1]).expanduser().resolve(strict=False)
    return None


def validate_python_version(version_info=None) -> None:
    """Require the interpreter version declared by the Skill Creator toolchain."""
    version_info = version_info or sys.version_info
    actual = tuple(version_info[:2])
    if actual != REQUIRED_PYTHON:
        raise RuntimeBootstrapError(
            "Python 3.13 is required to run Skill Creator evals; "
            f"the selected interpreter is Python {actual[0]}.{actual[1]}. "
            "Resolve or acquire Python 3.13 in the operator environment, then "
            "invoke evaluate_skill.py with its absolute path."
        )


def find_containing_git_workspace_marker(path: Path) -> Path | None:
    """Return the nearest ``.git`` marker at or above a path."""
    resolved_path = path.expanduser().resolve(strict=False)
    for candidate in (resolved_path, *resolved_path.parents):
        marker = candidate / ".git"
        if marker.exists():
            return marker
    return None


def validate_run_root_is_not_in_git_workspace(run_root: Path) -> None:
    """Reject run roots whose generated state would inherit repository state."""
    git_marker = find_containing_git_workspace_marker(run_root)
    if git_marker:
        raise RunRootInsideGitWorkspaceError(
            "--run-root must not be inside a Git workspace; "
            f"found Git marker at {git_marker}"
        )


def normalize_distribution_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _read_requirement_lines(path: Path) -> list[str]:
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise RuntimeBootstrapError(
            f"Could not read runtime requirements at {path}: {error}"
        ) from error


def _parse_locked_requirement(
    path: Path, line_number: int, raw_line: str
) -> tuple[str, str] | None:
    line = raw_line.strip()
    if not line or line.startswith("#"):
        return None
    match = PINNED_REQUIREMENT.fullmatch(line)
    if not match:
        raise RuntimeBootstrapError(
            f"Runtime requirement on line {line_number} of {path} must be "
            "exactly pinned with '=='."
        )
    return (
        normalize_distribution_name(match.group("name")),
        match.group("version"),
    )


def read_locked_requirements(path: Path) -> dict[str, str]:
    """Load the exact direct dependencies that define a reusable runtime."""
    requirements = {}
    for line_number, raw_line in enumerate(_read_requirement_lines(path), start=1):
        requirement = _parse_locked_requirement(path, line_number, raw_line)
        if requirement:
            requirements[requirement[0]] = requirement[1]

    if not requirements:
        raise RuntimeBootstrapError(f"Runtime requirements are empty: {path}")
    return requirements


def current_environment_is_compatible(
    requirements: dict[str, str],
    version_reader: Callable[[str], str] = importlib.metadata.version,
) -> bool:
    """Return whether the active interpreter already has every locked version."""
    try:
        return all(
            version_reader(name) == version for name, version in requirements.items()
        )
    except (importlib.metadata.PackageNotFoundError, KeyError, ValueError):
        return False


def runtime_fingerprint(
    requirements_content: bytes,
    *,
    python_version: tuple[int, ...],
    cache_tag: str,
    platform_name: str,
    machine: str,
) -> str:
    """Identify runtimes by dependencies, interpreter ABI, and host platform."""
    identity = {
        "requirements_sha256": hashlib.sha256(requirements_content).hexdigest(),
        "python_version": list(python_version),
        "cache_tag": cache_tag,
        "platform": platform_name,
        "machine": machine,
    }
    encoded = json.dumps(identity, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:16]


def virtualenv_python(root: Path, platform_name: str = sys.platform) -> Path:
    if platform_name == "win32":
        return root / "Scripts" / "python.exe"
    return root / "bin" / "python"


def _windows_cache_root(environ: dict[str, str]) -> Path:
    preferred = Path("S:/AppData")
    if preferred.is_dir():
        return preferred / "skill-creator"
    application_data = environ.get("LOCALAPPDATA") or environ.get("APPDATA")
    if not application_data:
        raise RuntimeBootstrapError(
            "Skill Creator could not resolve application data storage. Set "
            "SKILL_CREATOR_CACHE_ROOT to an operator-approved directory."
        )
    return Path(application_data) / "skill-creator"


def _posix_cache_root(environ: dict[str, str]) -> Path:
    cache_home = environ.get("XDG_CACHE_HOME")
    if cache_home:
        return Path(cache_home).expanduser() / "skill-creator"
    return Path.home() / ".cache" / "skill-creator"


def default_cache_root(
    environ: dict[str, str] | None = None,
    platform_name: str = sys.platform,
) -> Path:
    """Keep reusable package data in Skill Creator-owned application storage."""
    environ = environ or os.environ
    override = environ.get("SKILL_CREATOR_CACHE_ROOT")
    if override:
        return Path(override).expanduser()
    if platform_name == "win32":
        return _windows_cache_root(environ)
    return _posix_cache_root(environ)


def remove_owned_tree(path: Path, runtime_root: Path) -> None:
    """Remove only a direct child of the evaluator-owned runtime directory."""
    resolved_path = path.resolve(strict=False)
    resolved_root = runtime_root.resolve(strict=False)
    if resolved_path.parent != resolved_root:
        raise RuntimeBootstrapError(
            f"Refusing to remove {path}; it is outside the managed runtime directory "
            f"{runtime_root}."
        )
    if resolved_path.exists():
        try:
            shutil.rmtree(resolved_path)
        except OSError as error:
            raise RuntimeBootstrapError(
                f"Could not remove bootstrap-owned runtime path {path}: {error}"
            ) from error


def _version_probe(requirements: dict[str, str]) -> str:
    expected = json.dumps(requirements, sort_keys=True)
    return (
        "import importlib.metadata, json, sys; "
        f"expected = json.loads({expected!r}); "
        "actual = {name: importlib.metadata.version(name) for name in expected}; "
        "sys.exit(0 if actual == expected else 1)"
    )


def environment_is_ready(
    root: Path,
    *,
    fingerprint: str,
    requirements: dict[str, str],
    platform_name: str = sys.platform,
) -> bool:
    """Verify both the publication marker and the installed package contract."""
    marker = root / COMPLETION_MARKER
    python = virtualenv_python(root, platform_name)
    if not marker.is_file() or not python.is_file():
        return False
    try:
        marker_data = json.loads(marker.read_text(encoding="utf-8"))
        if marker_data.get("fingerprint") != fingerprint:
            return False
        completed = subprocess.run(
            [str(python), "-c", _version_probe(requirements)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        return False
    return completed.returncode == 0


def build_runtime_environment(
    *,
    build_root: Path,
    runtime_root: Path,
    requirements_path: Path,
    fingerprint: str,
    cache_root: Path,
    platform_name: str = sys.platform,
) -> None:
    """Build a complete environment without exposing partial state to readers."""
    temporary_root = runtime_root.parent / "tmp"
    try:
        cache_root.mkdir(parents=True, exist_ok=True)
        temporary_root.mkdir(parents=True, exist_ok=True)
        environment = os.environ.copy()
        environment.update(
            {
                "PIP_CACHE_DIR": str(cache_root / "pip"),
                "TMP": str(temporary_root),
                "TEMP": str(temporary_root),
                "TMPDIR": str(temporary_root),
            }
        )
        subprocess.run(
            [sys.executable, "-m", "venv", str(build_root)],
            check=True,
            env=environment,
            timeout=180,
        )
        python = virtualenv_python(build_root, platform_name)
        subprocess.run(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--requirement",
                str(requirements_path),
            ],
            check=True,
            env=environment,
            timeout=600,
        )
        (build_root / COMPLETION_MARKER).write_text(
            json.dumps({"fingerprint": fingerprint}, indent=2),
            encoding="utf-8",
        )
    except (OSError, subprocess.SubprocessError) as error:
        if build_root.exists():
            remove_owned_tree(build_root, runtime_root)
        raise RuntimeBootstrapError(
            "Skill Creator could not create its isolated Python environment. "
            "Confirm that the selected Python 3.13 provides venv and pip, the run "
            "root permits file creation and subprocess execution, and package "
            "access or the configured cache is available. "
            f"Underlying error: {error}"
        ) from error


def _runtime_is_ready(
    target: Path,
    *,
    fingerprint: str,
    requirements: dict[str, str],
    platform_name: str,
    readiness_check: Callable[..., bool],
) -> bool:
    return readiness_check(
        target,
        fingerprint=fingerprint,
        requirements=requirements,
        platform_name=platform_name,
    )


def _try_publish_environment(
    *,
    build_root: Path,
    target: Path,
    runtime_root: Path,
    fingerprint: str,
    requirements: dict[str, str],
    platform_name: str,
    readiness_check: Callable[..., bool],
) -> tuple[bool, OSError | None]:
    try:
        build_root.rename(target)
        return True, None
    except OSError as error:
        if _runtime_is_ready(
            target,
            fingerprint=fingerprint,
            requirements=requirements,
            platform_name=platform_name,
            readiness_check=readiness_check,
        ):
            remove_owned_tree(build_root, runtime_root)
            return True, None
        return False, error


def _quarantine_corrupt_environment(
    *,
    target: Path,
    runtime_root: Path,
    fingerprint: str,
    requirements: dict[str, str],
    platform_name: str,
    readiness_check: Callable[..., bool],
) -> None:
    if _runtime_is_ready(
        target,
        fingerprint=fingerprint,
        requirements=requirements,
        platform_name=platform_name,
        readiness_check=readiness_check,
    ):
        return
    quarantine = runtime_root / f".corrupt-{target.name}-{uuid.uuid4().hex}"
    try:
        target.rename(quarantine)
    except FileNotFoundError:
        return
    except OSError as error:
        if _runtime_is_ready(
            target,
            fingerprint=fingerprint,
            requirements=requirements,
            platform_name=platform_name,
            readiness_check=readiness_check,
        ):
            return
        raise RuntimeBootstrapError(
            f"Could not replace corrupt evaluator runtime {target}: {error}"
        ) from error
    remove_owned_tree(quarantine, runtime_root)


def _publish_environment(
    *,
    build_root: Path,
    target: Path,
    runtime_root: Path,
    fingerprint: str,
    requirements: dict[str, str],
    platform_name: str,
    readiness_check: Callable[..., bool],
) -> None:
    published, error = _try_publish_environment(
        build_root=build_root,
        target=target,
        runtime_root=runtime_root,
        fingerprint=fingerprint,
        requirements=requirements,
        platform_name=platform_name,
        readiness_check=readiness_check,
    )
    if published:
        return
    if not target.exists():
        raise RuntimeBootstrapError(
            f"Could not publish the evaluator runtime at {target}: {error}"
        ) from error

    _quarantine_corrupt_environment(
        target=target,
        runtime_root=runtime_root,
        fingerprint=fingerprint,
        requirements=requirements,
        platform_name=platform_name,
        readiness_check=readiness_check,
    )
    published, error = _try_publish_environment(
        build_root=build_root,
        target=target,
        runtime_root=runtime_root,
        fingerprint=fingerprint,
        requirements=requirements,
        platform_name=platform_name,
        readiness_check=readiness_check,
    )
    if not published:
        raise RuntimeBootstrapError(
            f"Could not publish the evaluator runtime at {target}: {error}"
        ) from error


def _read_requirements_content(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except OSError as error:
        raise RuntimeBootstrapError(
            f"Could not fingerprint runtime requirements at {path}: {error}"
        ) from error


def _create_build_root(runtime_root: Path, fingerprint: str) -> Path:
    try:
        runtime_root.mkdir(parents=True, exist_ok=True)
        return Path(tempfile.mkdtemp(prefix=f".build-{fingerprint}-", dir=runtime_root))
    except OSError as error:
        raise RuntimeBootstrapError(
            f"Skill Creator cannot write its runtime below {runtime_root}: {error}"
        ) from error


def _require_ready_environment(
    target: Path,
    *,
    fingerprint: str,
    requirements: dict[str, str],
    platform_name: str,
    readiness_check: Callable[..., bool],
    phase: str,
) -> None:
    if not _runtime_is_ready(
        target,
        fingerprint=fingerprint,
        requirements=requirements,
        platform_name=platform_name,
        readiness_check=readiness_check,
    ):
        raise RuntimeBootstrapError(
            f"The {phase} evaluator runtime at {target} failed verification."
        )


def _build_and_publish_environment(
    *,
    build_root: Path,
    target: Path,
    runtime_root: Path,
    requirements_path: Path,
    requirements: dict[str, str],
    fingerprint: str,
    cache_root: Path,
    platform_name: str,
    build_environment: Callable[..., None],
    readiness_check: Callable[..., bool],
) -> None:
    try:
        build_environment(
            build_root=build_root,
            runtime_root=runtime_root,
            requirements_path=requirements_path,
            fingerprint=fingerprint,
            cache_root=cache_root,
            platform_name=platform_name,
        )
        _require_ready_environment(
            build_root,
            fingerprint=fingerprint,
            requirements=requirements,
            platform_name=platform_name,
            readiness_check=readiness_check,
            phase="staged",
        )
        _publish_environment(
            build_root=build_root,
            target=target,
            runtime_root=runtime_root,
            fingerprint=fingerprint,
            requirements=requirements,
            platform_name=platform_name,
            readiness_check=readiness_check,
        )
    except BaseException:
        if build_root.exists():
            remove_owned_tree(build_root, runtime_root)
        raise


def ensure_runtime_environment(
    *,
    run_root: Path,
    requirements_path: Path = RUNTIME_REQUIREMENTS_PATH,
    cache_root: Path | None = None,
    python_version: tuple[int, ...] | None = None,
    cache_tag: str | None = None,
    platform_name: str = sys.platform,
    machine: str | None = None,
    build_environment: Callable[..., None] = build_runtime_environment,
    readiness_check: Callable[..., bool] = environment_is_ready,
) -> Path:
    """Create or reuse the fingerprinted runtime and return its interpreter."""
    requirements = read_locked_requirements(requirements_path)
    requirements_content = _read_requirements_content(requirements_path)
    python_version = python_version or tuple(sys.version_info[:3])
    cache_tag = cache_tag or getattr(sys.implementation, "cache_tag", "unknown")
    machine = machine or platform.machine()
    fingerprint = runtime_fingerprint(
        requirements_content,
        python_version=python_version,
        cache_tag=cache_tag,
        platform_name=platform_name,
        machine=machine,
    )
    runtime_root = run_root / ".skill-creator" / "runtime"
    target = runtime_root / fingerprint

    if _runtime_is_ready(
        target,
        fingerprint=fingerprint,
        requirements=requirements,
        platform_name=platform_name,
        readiness_check=readiness_check,
    ):
        return virtualenv_python(target, platform_name)

    build_root = _create_build_root(runtime_root, fingerprint)
    _build_and_publish_environment(
        build_root=build_root,
        target=target,
        runtime_root=runtime_root,
        requirements_path=requirements_path,
        requirements=requirements,
        fingerprint=fingerprint,
        cache_root=cache_root or default_cache_root(),
        platform_name=platform_name,
        build_environment=build_environment,
        readiness_check=readiness_check,
    )
    _require_ready_environment(
        target,
        fingerprint=fingerprint,
        requirements=requirements,
        platform_name=platform_name,
        readiness_check=readiness_check,
        phase="published",
    )
    return virtualenv_python(target, platform_name)


def prepare_evaluator_runtime(
    arguments: list[str],
    requirements_path: Path = RUNTIME_REQUIREMENTS_PATH,
) -> Path | None:
    """Validate the host and return a managed interpreter when one is needed."""
    run_root = parse_run_root(arguments)
    if run_root is None:
        return None

    validate_python_version()
    validate_run_root_is_not_in_git_workspace(run_root)
    requirements = read_locked_requirements(requirements_path)
    if current_environment_is_compatible(requirements):
        return None

    return ensure_runtime_environment(
        run_root=run_root,
        requirements_path=requirements_path,
    )

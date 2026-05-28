"""Shared prepared-run layout rules for skill evals."""

from pathlib import Path

SKILL_RUN_TYPE = "skill"
BASELINE_RUN_TYPE = "baseline"
RUN_TYPES = (SKILL_RUN_TYPE, BASELINE_RUN_TYPE)


def skill_file_path(run_dir: Path, skill_root: str, skill_name: str) -> Path:
    """Return the prepared skill file path for a provider run directory."""
    return skill_directory_path(run_dir, skill_root, skill_name) / "SKILL.md"


def skill_directory_path(run_dir: Path, skill_root: str, skill_name: str) -> Path:
    """Return the prepared skill directory for a provider run directory."""
    return run_dir / skill_root / "skills" / skill_name

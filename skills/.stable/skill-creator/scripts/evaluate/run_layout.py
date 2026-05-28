"""Shared prepared-run layout rules for skill evals."""

from dataclasses import dataclass
from pathlib import Path

SKILL_RUN_TYPE = "skill"
BASELINE_RUN_TYPE = "baseline"
RUN_TYPES = (SKILL_RUN_TYPE, BASELINE_RUN_TYPE)


@dataclass(frozen=True)
class PreparedRunTypeEntry:
    run_dir: Path
    fixture_path: Path | None = None
    skill_file: Path | None = None

    def require_skill_file(self) -> Path:
        if not self.skill_file:
            raise ValueError("Prepared run type entry is missing skill_file")
        return self.skill_file

    def to_dict(self) -> dict:
        entry = {"path": str(self.run_dir)}
        if self.fixture_path:
            entry["fixture_path"] = str(self.fixture_path)
        if self.skill_file:
            entry["skill_file"] = str(self.skill_file)
        return entry


def skill_file_path(run_dir: Path, skill_root: str, skill_name: str) -> Path:
    """Return the prepared skill file path for a provider run directory."""
    return skill_directory_path(run_dir, skill_root, skill_name) / "SKILL.md"


def skill_directory_path(run_dir: Path, skill_root: str, skill_name: str) -> Path:
    """Return the prepared skill directory for a provider run directory."""
    return run_dir / skill_root / "skills" / skill_name

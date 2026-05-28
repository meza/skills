"""Load and prepare eval definitions for execution."""

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

RUN_TYPES = ("skill", "baseline")


@dataclass(frozen=True)
class EvalTurn:
    """One prompt turn from an eval definition."""

    prompt: str
    expectations: list[Any] = field(default_factory=list)
    timeout: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_mapping(cls, data: dict) -> "EvalTurn":
        known = {"prompt", "expectations", "timeout"}
        return cls(
            prompt=data["prompt"],
            expectations=list(data.get("expectations", [])),
            timeout=data.get("timeout"),
            extra={key: value for key, value in data.items() if key not in known},
        )

    def to_dict(self) -> dict:
        data = {
            "prompt": self.prompt,
            "expectations": self.expectations,
            **self.extra,
        }
        if self.timeout is not None:
            data["timeout"] = self.timeout
        return data


@dataclass(frozen=True)
class EvalDefinition:
    """A single eval definition with typed access to its schema fields."""

    id: int
    eval_name: str | None = None
    turns: list[EvalTurn] = field(default_factory=list)
    timeout: int | None = None
    fixture: str | None = None
    fixture_in_workdir: bool = True
    files: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_mapping(cls, data: dict) -> "EvalDefinition":
        known = {
            "id",
            "eval_name",
            "turns",
            "timeout",
            "fixture",
            "fixture_in_workdir",
            "files",
        }
        return cls(
            id=data["id"],
            eval_name=data.get("eval_name"),
            turns=[EvalTurn.from_mapping(turn) for turn in data.get("turns", [])],
            timeout=data.get("timeout"),
            fixture=data.get("fixture"),
            fixture_in_workdir=data.get("fixture_in_workdir", True),
            files=list(data.get("files", [])),
            extra={key: value for key, value in data.items() if key not in known},
        )

    @property
    def display_name(self) -> str:
        return self.eval_name or f"eval-{self.id}"

    def to_dict(self) -> dict:
        data = {
            "id": self.id,
            "turns": [turn.to_dict() for turn in self.turns],
            **self.extra,
        }
        if self.eval_name is not None:
            data["eval_name"] = self.eval_name
        if self.timeout is not None:
            data["timeout"] = self.timeout
        if self.fixture is not None:
            data["fixture"] = self.fixture
        if not self.fixture_in_workdir:
            data["fixture_in_workdir"] = self.fixture_in_workdir
        if self.files:
            data["files"] = self.files
        return data


@dataclass(frozen=True)
class EvalSuite:
    """Top-level evals.json content with typed eval definitions."""

    evals: list[EvalDefinition]
    skill_name: str | None = None
    fixture_repo: str | None = None
    fixture_ref: str | None = None
    fixture_base_path: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_mapping(cls, data: dict) -> "EvalSuite":
        known = {
            "evals",
            "skill_name",
            "fixture_repo",
            "fixture_ref",
            "fixture_base_path",
        }
        return cls(
            evals=[
                ensure_eval_definition(eval_def) for eval_def in data.get("evals", [])
            ],
            skill_name=data.get("skill_name"),
            fixture_repo=data.get("fixture_repo"),
            fixture_ref=data.get("fixture_ref"),
            fixture_base_path=data.get("fixture_base_path"),
            extra={key: value for key, value in data.items() if key not in known},
        )

    def with_evals(self, evals: list[EvalDefinition]) -> "EvalSuite":
        return EvalSuite(
            evals=evals,
            skill_name=self.skill_name,
            fixture_repo=self.fixture_repo,
            fixture_ref=self.fixture_ref,
            fixture_base_path=self.fixture_base_path,
            extra=dict(self.extra),
        )

    def to_dict(self) -> dict:
        data = {
            **self.extra,
            "evals": [eval_def.to_dict() for eval_def in self.evals],
        }
        if self.skill_name is not None:
            data["skill_name"] = self.skill_name
        if self.fixture_repo is not None:
            data["fixture_repo"] = self.fixture_repo
        if self.fixture_ref is not None:
            data["fixture_ref"] = self.fixture_ref
        if self.fixture_base_path is not None:
            data["fixture_base_path"] = self.fixture_base_path
        return data


def ensure_eval_definition(eval_def: EvalDefinition | dict) -> EvalDefinition:
    if isinstance(eval_def, EvalDefinition):
        return eval_def
    return EvalDefinition.from_mapping(eval_def)


def ensure_eval_suite(evals_data: EvalSuite | dict) -> EvalSuite:
    if isinstance(evals_data, EvalSuite):
        return evals_data
    return EvalSuite.from_mapping(evals_data)


def selected_run_types(skip_baseline: bool) -> list[str]:
    """Return the run types requested for one eval invocation."""
    if skip_baseline:
        return ["skill"]
    return list(RUN_TYPES)


def load_evals_data(evals_json_path: Path) -> EvalSuite:
    """Load an eval definitions JSON file and reject empty eval suites."""
    if not evals_json_path.exists():
        print(f"Error: {evals_json_path} not found", file=sys.stderr)
        sys.exit(1)

    with open(evals_json_path, encoding="utf-8") as evals_json:
        evals_data = json.load(evals_json)

    if not evals_data.get("evals", []):
        print("Error: no evals found in evals.json", file=sys.stderr)
        sys.exit(1)

    return EvalSuite.from_mapping(evals_data)


def select_evals(
    evals_list: list[EvalDefinition | dict], raw_eval_ids: str | None
) -> list[EvalDefinition]:
    """Return the eval definitions selected by the optional ID filter."""
    typed_evals = [ensure_eval_definition(eval_def) for eval_def in evals_list]
    if not raw_eval_ids:
        return typed_evals

    requested = {int(eval_id.strip()) for eval_id in raw_eval_ids.split(",")}
    selected = [eval_def for eval_def in typed_evals if eval_def.id in requested]
    missing = requested - {eval_def.id for eval_def in selected}
    if missing:
        print(f"Warning: eval IDs not found in evals.json: {missing}", file=sys.stderr)
    if not selected:
        print("Error: no matching evals after filtering by --eval-ids", file=sys.stderr)
        sys.exit(1)
    return selected


def write_eval_metadata(
    iteration_dir: Path, evals_list: list[EvalDefinition | dict]
) -> None:
    """Write per-eval metadata files into the iteration output directory."""
    for raw_eval_def in evals_list:
        eval_def = ensure_eval_definition(raw_eval_def)
        eval_id = eval_def.id
        eval_dir = iteration_dir / f"eval-{eval_id}"
        eval_dir.mkdir(parents=True, exist_ok=True)

        metadata = {
            "eval_id": eval_id,
            "eval_name": eval_def.display_name,
            "turns": [turn.to_dict() for turn in eval_def.turns],
        }
        (eval_dir / "eval_metadata.json").write_text(
            json.dumps(metadata, indent=2),
            encoding="utf-8",
        )

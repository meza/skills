"""Load and prepare eval definitions for execution."""

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from .run_layout import RUN_TYPES, SKILL_RUN_TYPE

SUPPORTED_EVAL_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class EvalDefinition:
    """Domain view over one eval definition loaded from evals.json."""

    data: dict

    @property
    def eval_id(self) -> int:
        return self.data["id"]

    @property
    def eval_name(self) -> str:
        return self.data.get("eval_name", f"eval-{self.eval_id}")

    @property
    def turns(self) -> list[dict]:
        return self.data.get("turns", [])

    def timeout_or_default(self, default_timeout: int) -> int:
        return self.data.get("timeout", default_timeout)


def selected_run_types(skip_baseline: bool) -> list[str]:
    """Return the run types requested for one eval invocation."""
    if skip_baseline:
        return [SKILL_RUN_TYPE]
    return list(RUN_TYPES)


def load_evals_data_or_exit(evals_json_path: Path) -> dict:
    """Load an eval definitions JSON file and reject empty eval suites."""
    if not evals_json_path.exists():
        print(f"Error: {evals_json_path} not found", file=sys.stderr)
        sys.exit(1)

    with open(evals_json_path, encoding="utf-8") as evals_json:
        evals_data = json.load(evals_json)

    validate_evals_data_or_exit(evals_data)
    return evals_data


def validate_evals_data_or_exit(evals_data: dict) -> None:
    validate_schema_version_or_exit(evals_data)
    evals_list = evals_data.get("evals", [])
    if not evals_list:
        print("Error: no evals found in evals.json", file=sys.stderr)
        sys.exit(1)

    for eval_index, eval_def in enumerate(evals_list, start=1):
        validate_eval_definition_or_exit(eval_def, eval_index)


def validate_schema_version_or_exit(evals_data: object) -> None:
    if not isinstance(evals_data, dict):
        print("Error: evals.json must contain an object", file=sys.stderr)
        sys.exit(1)

    schema_version = evals_data.get("schema_version")
    if schema_version is None:
        print("Error: evals.json must include schema_version", file=sys.stderr)
        sys.exit(1)
    if schema_version != SUPPORTED_EVAL_SCHEMA_VERSION:
        print(
            f"Error: unsupported evals.json schema_version {schema_version}; "
            f"expected {SUPPORTED_EVAL_SCHEMA_VERSION}",
            file=sys.stderr,
        )
        sys.exit(1)


def validate_eval_definition_or_exit(eval_def: object, eval_index: int) -> None:
    if not isinstance(eval_def, dict):
        print(f"Error: eval {eval_index} must be an object", file=sys.stderr)
        sys.exit(1)

    eval_id = eval_def.get("id")
    if not isinstance(eval_id, int):
        print(f"Error: eval {eval_index} must include integer id", file=sys.stderr)
        sys.exit(1)

    validate_timeout_or_exit(eval_def.get("timeout"), f"eval id={eval_id}")
    for turn_index, turn in enumerate(
        require_turns_or_exit(eval_def, eval_id), start=1
    ):
        validate_turn_or_exit(turn, eval_id, turn_index)


def require_turns_or_exit(eval_def: dict, eval_id: int) -> list[dict]:
    turns = eval_def.get("turns")
    if not isinstance(turns, list) or not turns:
        print(
            f"Error: eval id={eval_id} must include non-empty turns",
            file=sys.stderr,
        )
        sys.exit(1)
    return turns


def validate_turn_or_exit(turn: object, eval_id: int, turn_index: int) -> None:
    if not isinstance(turn, dict):
        print(
            f"Error: eval id={eval_id} turn {turn_index} must be an object",
            file=sys.stderr,
        )
        sys.exit(1)

    prompt = turn.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        print(
            f"Error: eval id={eval_id} turn {turn_index} must include "
            "a non-empty prompt",
            file=sys.stderr,
        )
        sys.exit(1)

    validate_timeout_or_exit(
        turn.get("timeout"),
        f"eval id={eval_id} turn {turn_index}",
    )


def validate_timeout_or_exit(timeout: object, context: str) -> None:
    if timeout is None:
        return
    if not isinstance(timeout, int) or timeout <= 0:
        print(f"Error: {context} timeout must be a positive integer", file=sys.stderr)
        sys.exit(1)


def select_evals_or_exit(
    evals_list: list[dict], raw_eval_ids: str | None
) -> list[dict]:
    """Return the eval definitions selected by the optional ID filter."""
    if not raw_eval_ids:
        return evals_list

    requested = {int(eval_id.strip()) for eval_id in raw_eval_ids.split(",")}
    selected = [eval_def for eval_def in evals_list if eval_def["id"] in requested]
    missing = requested - {eval_def["id"] for eval_def in selected}
    if missing:
        print(f"Warning: eval IDs not found in evals.json: {missing}", file=sys.stderr)
    if not selected:
        print("Error: no matching evals after filtering by --eval-ids", file=sys.stderr)
        sys.exit(1)
    return selected


def write_eval_metadata(iteration_dir: Path, evals_list: list[dict]) -> None:
    """Write per-eval metadata files into the iteration output directory."""
    for eval_def in evals_list:
        eval_id = eval_def["id"]
        eval_dir = iteration_dir / f"eval-{eval_id}"
        eval_dir.mkdir(parents=True, exist_ok=True)

        metadata = {
            "eval_id": eval_id,
            "eval_name": eval_def.get("eval_name", f"eval-{eval_id}"),
            "turns": eval_def.get("turns", []),
        }
        (eval_dir / "eval_metadata.json").write_text(
            json.dumps(metadata, indent=2),
            encoding="utf-8",
        )

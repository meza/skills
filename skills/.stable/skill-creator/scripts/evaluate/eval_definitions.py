"""Load and prepare eval definitions for execution."""

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from .run_layout import RUN_TYPES, SKILL_RUN_TYPE


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

    if not evals_data.get("evals", []):
        print("Error: no evals found in evals.json", file=sys.stderr)
        sys.exit(1)

    return evals_data


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

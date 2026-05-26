"""Aggregate grader outputs for one eval iteration."""

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


def calculate_stats(values: list[float]) -> dict:
    values = [value for value in values if value is not None]
    if not values:
        return {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0}

    mean = sum(values) / len(values)
    stddev = 0.0
    if len(values) > 1:
        variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
        stddev = math.sqrt(variance)

    return {
        "mean": round(mean, 4),
        "stddev": round(stddev, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
    }


@dataclass(frozen=True)
class GradingResultAggregator:
    """Create machine and markdown summaries from completed grading outputs.

    The aggregator is application code for `evaluate_skill.py`, not an
    independent CLI boundary. It summarizes the exact iteration directory
    produced by one orchestrated eval run and writes aggregate artifacts into
    that same directory.
    """

    iteration_dir: Path
    skill_name: str
    skill_path: Path
    provider: str
    model: str
    effort: str

    def aggregate(self) -> dict:
        aggregated = self.aggregated_results()
        json_path = self.iteration_dir / "aggregated_results.json"
        json_path.write_text(json.dumps(aggregated, indent=2), encoding="utf-8")
        return {
            "json_path": str(json_path),
        }

    def aggregated_results(self) -> dict:
        graded_runs = self.load_graded_runs()
        return {
            "metadata": {
                "skill_name": self.skill_name,
                "skill_path": str(self.skill_path),
                "provider": self.provider,
                "model": self.model,
                "effort": self.effort,
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            "graded_runs": graded_runs,
            "summary": aggregate_results(graded_runs),
        }

    def load_graded_runs(self) -> list[dict]:
        graded_runs = []
        for eval_dir in sorted(self.iteration_dir.glob("eval-*")):
            graded_runs.extend(load_eval_graded_runs(eval_dir))
        return graded_runs


def load_eval_metadata(eval_dir: Path) -> tuple[int, str | None]:
    metadata_path = eval_dir / "eval_metadata.json"
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            metadata = {}
        return metadata.get("eval_id", parse_eval_id(eval_dir)), metadata.get(
            "eval_name"
        )
    return parse_eval_id(eval_dir), None


def parse_eval_id(eval_dir: Path) -> int:
    return int(eval_dir.name.removeprefix("eval-"))


def load_eval_graded_runs(eval_dir: Path) -> list[dict]:
    eval_id, eval_name = load_eval_metadata(eval_dir)
    return [
        load_graded_run(
            run_type_dir / "grading.json", eval_id, eval_name, run_type_dir.name
        )
        for run_type_dir in sorted(eval_dir.iterdir())
        if is_graded_run_type_dir(run_type_dir)
    ]


def is_graded_run_type_dir(run_type_dir: Path) -> bool:
    return run_type_dir.is_dir() and (run_type_dir / "grading.json").exists()


def load_graded_run(
    grading_path: Path,
    eval_id: int,
    eval_name: str | None,
    run_type: str,
) -> dict:
    grading = json.loads(grading_path.read_text(encoding="utf-8"))
    summary = grading.get("summary") or {}
    run = {
        "eval_id": eval_id,
        "eval_name": eval_name,
        "run_type": run_type,
        "result": {
            "pass_rate": summary.get("pass_rate", 0.0),
            "passed": summary.get("passed", 0),
            "failed": summary.get("failed", 0),
            "total": summary.get("total", 0),
        },
        "grading": {
            "executive_summary": grading.get("executive_summary", ""),
            "results": grading.get("results") or {},
        },
    }
    add_timing(run, grading_path.parent)
    return run


def add_timing(run: dict, run_type_dir: Path) -> None:
    timing_path = run_type_dir / "timing.json"
    timing = {}
    if timing_path.exists():
        timing = json.loads(timing_path.read_text(encoding="utf-8"))
    run["result"]["time_seconds"] = timing.get("total_duration_seconds") or 0.0
    run["result"]["tokens"] = timing.get("total_tokens") or 0


def aggregate_results(graded_runs: list[dict]) -> dict:
    summary = {}
    run_types = sorted({run["run_type"] for run in graded_runs})
    for run_type in run_types:
        run_type_runs = [run for run in graded_runs if run["run_type"] == run_type]
        summary[run_type] = {
            "pass_rate": calculate_stats(
                [run["result"]["pass_rate"] for run in run_type_runs]
            ),
            "time_seconds": calculate_stats(
                [run["result"]["time_seconds"] for run in run_type_runs]
            ),
            "tokens": calculate_stats(
                [run["result"]["tokens"] for run in run_type_runs]
            ),
        }
    return summary

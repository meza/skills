#!/usr/bin/env python3
"""
Aggregate individual run results into benchmark summary statistics.

Reads grading.json files from run directories and produces:
- run_summary with mean, stddev, min, max for each metric
- delta between with_skill and without_skill configurations

Usage:
    python aggregate_benchmark.py <benchmark_dir>

Example:
    python aggregate_benchmark.py benchmarks/2026-01-15T10-30-00/

The script supports two directory layouts:

    Workspace layout (from skill-creator iterations):
    <benchmark_dir>/
    └── eval-N/
        ├── with_skill/
        │   ├── run-1/grading.json
        │   └── run-2/grading.json
        └── without_skill/
            ├── run-1/grading.json
            └── run-2/grading.json

    Legacy layout (with runs/ subdirectory):
    <benchmark_dir>/
    └── runs/
        └── eval-N/
            ├── with_skill/
            │   └── run-1/grading.json
            └── without_skill/
                └── run-1/grading.json
"""

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
import re


def calculate_stats(values: list[float]) -> dict:
    """Calculate mean, stddev, min, max for a list of values."""
    # Filter out None values that can appear from timed-out or failed runs
    values = [v for v in values if v is not None]
    if not values:
        return {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0}

    n = len(values)
    mean = sum(values) / n

    if n > 1:
        variance = sum((x - mean) ** 2 for x in values) / (n - 1)
        stddev = math.sqrt(variance)
    else:
        stddev = 0.0

    return {
        "mean": round(mean, 4),
        "stddev": round(stddev, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
    }


def load_run_results(benchmark_dir: Path) -> dict:
    """
    Load all run results from a benchmark directory.

    Returns dict keyed by config name (e.g. "with_skill"/"without_skill",
    or "new_skill"/"old_skill"), each containing a list of run results.
    """
    search_dir = _resolve_search_dir(benchmark_dir)
    if search_dir is None:
        return {}

    results: dict[str, list] = {}

    for eval_idx, eval_dir in enumerate(sorted(search_dir.glob("eval-*"))):
        eval_id, eval_name = _load_eval_metadata(eval_dir, eval_idx)
        _load_eval_results(results, eval_dir, eval_id, eval_name)

    return results


def _resolve_search_dir(benchmark_dir: Path) -> Path | None:
    runs_dir = benchmark_dir / "runs"
    if runs_dir.exists():
        return runs_dir
    if list(benchmark_dir.glob("eval-*")):
        return benchmark_dir
    print(f"No eval directories found in {benchmark_dir} or {runs_dir}")
    return None


def _load_eval_metadata(eval_dir: Path, fallback_id: int) -> tuple[int, str | None]:
    metadata_path = eval_dir / "eval_metadata.json"
    if metadata_path.exists():
        return _read_eval_metadata(metadata_path, fallback_id)
    return _parse_eval_id_from_dir(eval_dir, fallback_id), None


def _read_eval_metadata(
    metadata_path: Path, fallback_id: int
) -> tuple[int, str | None]:
    try:
        with open(metadata_path) as mf:
            meta = json.load(mf)
    except (json.JSONDecodeError, OSError):
        return fallback_id, None
    return meta.get("eval_id", fallback_id), meta.get("eval_name")


def _parse_eval_id_from_dir(eval_dir: Path, fallback_id: int) -> int:
    try:
        return int(eval_dir.name.split("-")[1])
    except (IndexError, ValueError):
        return fallback_id


def _load_eval_results(
    results: dict[str, list],
    eval_dir: Path,
    eval_id: int,
    eval_name: str | None,
) -> None:
    for config_dir in sorted(eval_dir.iterdir()):
        _load_config_results(results, config_dir, eval_id, eval_name)


def _load_config_results(
    results: dict[str, list],
    config_dir: Path,
    eval_id: int,
    eval_name: str | None,
) -> None:
    if not config_dir.is_dir():
        return
    run_dirs_numbered = _discover_run_dirs(config_dir)
    if not run_dirs_numbered:
        return
    config_results = results.setdefault(config_dir.name, [])
    for run_dir, run_number in run_dirs_numbered:
        _append_run_result(config_results, run_dir, run_number, eval_id, eval_name)


def _append_run_result(
    config_results: list,
    run_dir: Path,
    run_number: int,
    eval_id: int,
    eval_name: str | None,
) -> None:
    result = _load_single_run_result(run_dir, run_number, eval_id, eval_name)
    if result:
        config_results.append(result)


def _discover_run_dirs(config_dir: Path) -> list[tuple[Path, int]]:
    run_dirs_numbered = sorted(
        filter(None, [_numbered_run_dir(path) for path in config_dir.iterdir()]),
        key=lambda item: item[1],
    )
    if run_dirs_numbered:
        return run_dirs_numbered
    if (config_dir / "grading.json").exists():
        return [(config_dir, 1)]
    return []


def _numbered_run_dir(path: Path) -> tuple[Path, int] | None:
    if not path.is_dir() or not re.match(r"^run-\d+$", path.name):
        return None
    return path, int(path.name.split("-")[1])


def _load_single_run_result(
    run_dir: Path,
    run_number: int,
    eval_id: int,
    eval_name: str | None,
) -> dict | None:
    grading_file = run_dir / "grading.json"
    if not grading_file.exists():
        print(f"Warning: grading.json not found in {run_dir}")
        return None

    try:
        with open(grading_file) as f:
            grading = json.load(f)
    except json.JSONDecodeError as error:
        print(f"Warning: Invalid JSON in {grading_file}: {error}")
        return None

    result = _extract_summary_metrics(grading, eval_id, eval_name, run_number)
    _add_timing_metrics(result, grading, run_dir)
    _add_execution_metrics(result, grading)
    result["expectations"] = _extract_expectations(grading, grading_file)
    result["notes"] = _extract_notes(grading)
    return result


def _extract_summary_metrics(
    grading: dict,
    eval_id: int,
    eval_name: str | None,
    run_number: int,
) -> dict:
    summary = grading.get("summary") or {}
    return {
        "eval_id": eval_id,
        "eval_name": eval_name,
        "run_number": run_number,
        "pass_rate": summary.get("pass_rate", 0.0),
        "passed": summary.get("passed", 0),
        "failed": summary.get("failed", 0),
        "total": summary.get("total", 0),
    }


def _add_timing_metrics(result: dict, grading: dict, run_dir: Path) -> None:
    timing = grading.get("timing") or {}
    result["time_seconds"] = timing.get("total_duration_seconds") or 0.0
    timing_file = run_dir / "timing.json"
    if result["time_seconds"] != 0.0 or not timing_file.exists():
        return
    try:
        with open(timing_file) as tf:
            timing_data = json.load(tf)
    except json.JSONDecodeError:
        return
    result["time_seconds"] = timing_data.get("total_duration_seconds") or 0.0
    result["tokens"] = timing_data.get("total_tokens") or 0


def _add_execution_metrics(result: dict, grading: dict) -> None:
    metrics = grading.get("execution_metrics") or {}
    result["tool_calls"] = metrics.get("total_tool_calls") or 0
    if not result.get("tokens"):
        result["tokens"] = metrics.get("output_chars") or 0
    result["errors"] = metrics.get("errors_encountered") or 0


def _extract_expectations(grading: dict, grading_file: Path) -> list:
    expectations = _flatten_grading_expectations(grading.get("results") or {})
    for expectation in expectations:
        if "text" not in expectation or "passed" not in expectation:
            print(
                "Warning: expectation in "
                f"{grading_file} missing required fields "
                f"(text, passed, evidence): {expectation}"
            )
    return expectations


def _flatten_grading_expectations(results: dict) -> list:
    expectations = []
    for expectation in results.get("overall_expectations") or []:
        expectations.append({"scope": "overall", **expectation})

    for turn_result in results.get("turns") or []:
        turn = turn_result.get("turn")
        for expectation in turn_result.get("expectations") or []:
            expectations.append({"scope": "turn", "turn": turn, **expectation})

    return expectations


def _extract_notes(grading: dict) -> list:
    notes_summary = grading.get("user_notes_summary") or {}
    notes = []
    notes.extend(notes_summary.get("uncertainties") or [])
    notes.extend(notes_summary.get("needs_review") or [])
    notes.extend(notes_summary.get("workarounds") or [])
    return notes


def aggregate_results(results: dict) -> dict:
    """
    Aggregate run results into summary statistics.

    Returns run_summary with stats for each configuration and delta.
    """
    run_summary = {}
    configs = list(results.keys())

    for config in configs:
        run_summary[config] = _aggregate_config_results(results.get(config, []))

    run_summary["delta"] = _calculate_delta_summary(run_summary, configs)

    return run_summary


def _empty_config_summary() -> dict:
    return {
        "pass_rate": {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0},
        "time_seconds": {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0},
        "tokens": {"mean": 0, "stddev": 0, "min": 0, "max": 0},
    }


def _aggregate_config_results(runs: list[dict]) -> dict:
    if not runs:
        return _empty_config_summary()
    return {
        "pass_rate": calculate_stats([r["pass_rate"] for r in runs]),
        "time_seconds": calculate_stats([r["time_seconds"] for r in runs]),
        "tokens": calculate_stats([r.get("tokens", 0) for r in runs]),
    }


def _calculate_delta_summary(run_summary: dict, configs: list[str]) -> dict:
    primary = run_summary.get(configs[0], {}) if configs else {}
    baseline = run_summary.get(configs[1], {}) if len(configs) >= 2 else {}
    return {
        "pass_rate": f"{_metric_delta(primary, baseline, 'pass_rate'):+.2f}",
        "time_seconds": f"{_metric_delta(primary, baseline, 'time_seconds'):+.1f}",
        "tokens": f"{_metric_delta(primary, baseline, 'tokens'):+.0f}",
    }


def _metric_delta(primary: dict, baseline: dict, metric: str) -> float:
    return (primary.get(metric) or {}).get("mean", 0) - (
        baseline.get(metric) or {}
    ).get("mean", 0)


def generate_benchmark(
    benchmark_dir: Path, skill_name: str = "", skill_path: str = ""
) -> dict:
    """
    Generate complete benchmark.json from run results.
    """
    results = load_run_results(benchmark_dir)
    run_summary = aggregate_results(results)

    runs = _build_benchmark_runs(results)

    # Determine eval IDs from results
    eval_ids = sorted(set(r["eval_id"] for config in results.values() for r in config))

    benchmark = {
        "metadata": {
            "skill_name": skill_name or "<skill-name>",
            "skill_path": skill_path or "<path/to/skill>",
            "executor_model": "<model-name>",
            "analyzer_model": "<model-name>",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "evals_run": eval_ids,
            "runs_per_configuration": 3,
        },
        "runs": runs,
        "run_summary": run_summary,
        "notes": [],  # To be filled by analyzer
    }

    return benchmark


def _build_benchmark_runs(results: dict) -> list[dict]:
    runs = []
    for config in results:
        runs.extend(_build_config_runs(config, results[config]))
    return runs


def _build_config_runs(config: str, results: list[dict]) -> list[dict]:
    return [_build_run_entry(config, result) for result in results]


def _build_run_entry(config: str, result: dict) -> dict:
    run_entry = {
        "eval_id": result["eval_id"],
        "configuration": config,
        "run_number": result["run_number"],
        "result": {
            "pass_rate": result["pass_rate"],
            "passed": result["passed"],
            "failed": result["failed"],
            "total": result["total"],
            "time_seconds": result["time_seconds"],
            "tokens": result.get("tokens", 0),
            "tool_calls": result.get("tool_calls", 0),
            "errors": result.get("errors", 0),
        },
        "expectations": result["expectations"],
        "notes": result["notes"],
    }
    if result.get("eval_name"):
        run_entry["eval_name"] = result["eval_name"]
    return run_entry


def generate_markdown(benchmark: dict) -> str:
    """Generate human-readable benchmark.md from benchmark data."""
    metadata = benchmark["metadata"]
    run_summary = benchmark["run_summary"]

    # Determine config names (excluding "delta")
    configs = [k for k in run_summary if k != "delta"]
    config_a = configs[0] if len(configs) >= 1 else "config_a"
    config_b = configs[1] if len(configs) >= 2 else "config_b"
    label_a = config_a.replace("_", " ").title()
    label_b = config_b.replace("_", " ").title()

    lines = [
        f"# Skill Benchmark: {metadata['skill_name']}",
        "",
        f"**Model**: {metadata['executor_model']}",
        f"**Date**: {metadata['timestamp']}",
        (
            f"**Evals**: {', '.join(map(str, metadata['evals_run']))} "
            f"({metadata['runs_per_configuration']} runs each per configuration)"
        ),
        "",
        "## Summary",
        "",
        f"| Metric | {label_a} | {label_b} | Delta |",
        "|--------|------------|---------------|-------|",
    ]

    a_summary = run_summary.get(config_a, {})
    b_summary = run_summary.get(config_b, {})
    delta = run_summary.get("delta", {})

    # Format pass rate
    a_pr = a_summary.get("pass_rate", {})
    b_pr = b_summary.get("pass_rate", {})
    lines.append(
        "| Pass Rate | "
        f"{a_pr.get('mean', 0)*100:.0f}% ± "
        f"{a_pr.get('stddev', 0)*100:.0f}% | "
        f"{b_pr.get('mean', 0)*100:.0f}% ± "
        f"{b_pr.get('stddev', 0)*100:.0f}% | "
        f"{delta.get('pass_rate', '—')} |"
    )

    # Format time
    a_time = a_summary.get("time_seconds", {})
    b_time = b_summary.get("time_seconds", {})
    lines.append(
        "| Time | "
        f"{a_time.get('mean', 0):.1f}s ± "
        f"{a_time.get('stddev', 0):.1f}s | "
        f"{b_time.get('mean', 0):.1f}s ± "
        f"{b_time.get('stddev', 0):.1f}s | "
        f"{delta.get('time_seconds', '—')}s |"
    )

    # Format tokens
    a_tokens = a_summary.get("tokens", {})
    b_tokens = b_summary.get("tokens", {})
    lines.append(
        "| Tokens | "
        f"{a_tokens.get('mean', 0):.0f} ± "
        f"{a_tokens.get('stddev', 0):.0f} | "
        f"{b_tokens.get('mean', 0):.0f} ± "
        f"{b_tokens.get('stddev', 0):.0f} | "
        f"{delta.get('tokens', '—')} |"
    )

    # Notes section
    if benchmark.get("notes"):
        lines.extend(["", "## Notes", ""])
        for note in benchmark["notes"]:
            lines.append(f"- {note}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Aggregate benchmark run results into summary statistics"
    )
    parser.add_argument(
        "benchmark_dir", type=Path, help="Path to the benchmark directory"
    )
    parser.add_argument(
        "--skill-name", default="", help="Name of the skill being benchmarked"
    )
    parser.add_argument(
        "--skill-path", default="", help="Path to the skill being benchmarked"
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Output path for benchmark.json (default: <benchmark_dir>/benchmark.json)",
    )

    args = parser.parse_args()

    if not args.benchmark_dir.exists():
        print(f"Directory not found: {args.benchmark_dir}")
        sys.exit(1)

    # Generate benchmark
    benchmark = generate_benchmark(args.benchmark_dir, args.skill_name, args.skill_path)

    # Determine output paths
    output_json = args.output or (args.benchmark_dir / "benchmark.json")
    output_md = output_json.with_suffix(".md")

    # Write benchmark.json
    with open(output_json, "w") as f:
        json.dump(benchmark, f, indent=2)
    print(f"Generated: {output_json}")

    # Write benchmark.md
    markdown = generate_markdown(benchmark)
    with open(output_md, "w") as f:
        f.write(markdown)
    print(f"Generated: {output_md}")

    # Print summary
    run_summary = benchmark["run_summary"]
    configs = [k for k in run_summary if k != "delta"]
    delta = run_summary.get("delta", {})

    print("\nSummary:")
    for config in configs:
        pr = run_summary[config]["pass_rate"]["mean"]
        label = config.replace("_", " ").title()
        print(f"  {label}: {pr*100:.1f}% pass rate")
    print(f"  Delta:         {delta.get('pass_rate', '—')}")


if __name__ == "__main__":
    main()

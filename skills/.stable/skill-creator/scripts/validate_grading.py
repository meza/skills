#!/usr/bin/env python3
"""Validate grader output against the required grading.json contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _validate_string_list(name: str, value: object, errors: list[str]) -> None:
    if not isinstance(value, list):
        errors.append(f"{name} must be a list")
        return
    for index, item in enumerate(value):
        if not isinstance(item, str):
            errors.append(f"{name}[{index}] must be a string")


def validate_grading_data(data: object) -> list[str]:
    errors: list[str] = []

    if not isinstance(data, dict):
        return ["top-level JSON value must be an object"]

    expectations = data.get("expectations")
    if not isinstance(expectations, list):
        errors.append("expectations must be a list")
        expectations = []
    for index, expectation in enumerate(expectations):
        prefix = f"expectations[{index}]"
        if not isinstance(expectation, dict):
            errors.append(f"{prefix} must be an object")
            continue
        if not isinstance(expectation.get("text"), str) or not expectation["text"].strip():
            errors.append(f"{prefix}.text must be a non-empty string")
        if not isinstance(expectation.get("passed"), bool):
            errors.append(f"{prefix}.passed must be a boolean")
        if not isinstance(expectation.get("evidence"), str) or not expectation["evidence"].strip():
            errors.append(f"{prefix}.evidence must be a non-empty string")

    summary = data.get("summary")
    if not isinstance(summary, dict):
        errors.append("summary must be an object")
        summary = {}
    for field in ("passed", "failed", "total"):
        value = summary.get(field)
        if not isinstance(value, int) or isinstance(value, bool):
            errors.append(f"summary.{field} must be an integer")
    pass_rate = summary.get("pass_rate")
    if not _is_number(pass_rate):
        errors.append("summary.pass_rate must be a number")
    if isinstance(summary.get("passed"), int) and isinstance(summary.get("failed"), int) and isinstance(summary.get("total"), int):
        if summary["passed"] + summary["failed"] != summary["total"]:
            errors.append("summary.passed + summary.failed must equal summary.total")
        if isinstance(expectations, list) and summary["total"] != len(expectations):
            errors.append("summary.total must match len(expectations)")

    eval_feedback = data.get("eval_feedback")
    if not isinstance(eval_feedback, dict):
        errors.append("eval_feedback must be an object")
        eval_feedback = {}
    suggestions = eval_feedback.get("suggestions")
    if not isinstance(suggestions, list):
        errors.append("eval_feedback.suggestions must be a list")
        suggestions = []
    for index, suggestion in enumerate(suggestions):
        prefix = f"eval_feedback.suggestions[{index}]"
        if not isinstance(suggestion, dict):
            errors.append(f"{prefix} must be an object")
            continue
        reason = suggestion.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            errors.append(f"{prefix}.reason must be a non-empty string")
        assertion = suggestion.get("assertion")
        if assertion is not None and not isinstance(assertion, str):
            errors.append(f"{prefix}.assertion must be a string when present")
    overall = eval_feedback.get("overall")
    if not isinstance(overall, str) or not overall.strip():
        errors.append("eval_feedback.overall must be a non-empty string")

    claims = data.get("claims")
    if claims is not None:
        if not isinstance(claims, list):
            errors.append("claims must be a list when present")
        else:
            for index, claim in enumerate(claims):
                prefix = f"claims[{index}]"
                if not isinstance(claim, dict):
                    errors.append(f"{prefix} must be an object")
                    continue
                if not isinstance(claim.get("claim"), str) or not claim["claim"].strip():
                    errors.append(f"{prefix}.claim must be a non-empty string")
                if not isinstance(claim.get("type"), str) or not claim["type"].strip():
                    errors.append(f"{prefix}.type must be a non-empty string")
                if not isinstance(claim.get("verified"), bool):
                    errors.append(f"{prefix}.verified must be a boolean")
                if not isinstance(claim.get("evidence"), str) or not claim["evidence"].strip():
                    errors.append(f"{prefix}.evidence must be a non-empty string")

    user_notes = data.get("user_notes_summary")
    if user_notes is not None:
        if not isinstance(user_notes, dict):
            errors.append("user_notes_summary must be an object when present")
        else:
            for field in ("uncertainties", "needs_review", "workarounds"):
                if field in user_notes:
                    _validate_string_list(f"user_notes_summary.{field}", user_notes[field], errors)

    execution_metrics = data.get("execution_metrics")
    if execution_metrics is not None:
        if not isinstance(execution_metrics, dict):
            errors.append("execution_metrics must be an object when present")
        else:
            tool_calls = execution_metrics.get("tool_calls")
            if tool_calls is not None and not isinstance(tool_calls, dict):
                errors.append("execution_metrics.tool_calls must be an object when present")
            for field in ("total_tool_calls", "total_steps", "errors_encountered", "output_chars", "transcript_chars"):
                if field in execution_metrics:
                    value = execution_metrics[field]
                    if not isinstance(value, int) or isinstance(value, bool):
                        errors.append(f"execution_metrics.{field} must be an integer")

    timing = data.get("timing")
    if timing is not None:
        if not isinstance(timing, dict):
            errors.append("timing must be an object when present")
        else:
            for field in ("executor_duration_seconds", "grader_duration_seconds", "total_duration_seconds"):
                if field in timing and not _is_number(timing[field]):
                    errors.append(f"timing.{field} must be a number")

    return errors


def validate_grading_file(path: Path) -> list[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"{path}: file not found"]
    except json.JSONDecodeError as exc:
        return [f"{path}: invalid JSON ({exc})"]
    except OSError as exc:
        return [f"{path}: could not read file ({exc})"]

    return [f"{path}: {error}" for error in validate_grading_data(data)]


def _resolve_target(path_text: str) -> Path:
    path = Path(path_text)
    if path.is_dir():
        return path / "grading.json"
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate grading.json files")
    parser.add_argument(
        "paths",
        nargs="+",
        help="Path(s) to grading.json files or run directories containing grading.json",
    )
    args = parser.parse_args()

    all_errors: list[str] = []
    for raw_path in args.paths:
        path = _resolve_target(raw_path)
        all_errors.extend(validate_grading_file(path))

    if all_errors:
        for error in all_errors:
            print(error, file=sys.stderr)
        return 1

    for raw_path in args.paths:
        print(f"OK: {_resolve_target(raw_path)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

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

    expectations = _validate_expectations(data, errors)
    _validate_summary(data, expectations, errors)
    _validate_eval_feedback(data, errors)
    _validate_claims(data, errors)
    _validate_user_notes(data, errors)
    _validate_execution_metrics(data, errors)
    _validate_timing(data, errors)

    return errors


def _validate_expectations(data: dict, errors: list[str]) -> list:
    expectations = data.get("expectations")
    if not isinstance(expectations, list):
        errors.append("expectations must be a list")
        return []
    for index, expectation in enumerate(expectations):
        _validate_expectation(index, expectation, errors)
    return expectations


def _validate_expectation(index: int, expectation: object, errors: list[str]) -> None:
    prefix = f"expectations[{index}]"
    if not isinstance(expectation, dict):
        errors.append(f"{prefix} must be an object")
        return
    _require_non_empty_string(expectation, "text", f"{prefix}.text", errors)
    if not isinstance(expectation.get("passed"), bool):
        errors.append(f"{prefix}.passed must be a boolean")
    _require_non_empty_string(expectation, "evidence", f"{prefix}.evidence", errors)


def _validate_summary(data: dict, expectations: list, errors: list[str]) -> None:
    summary = data.get("summary")
    if not isinstance(summary, dict):
        errors.append("summary must be an object")
        return
    for field in ("passed", "failed", "total"):
        value = summary.get(field)
        if not isinstance(value, int) or isinstance(value, bool):
            errors.append(f"summary.{field} must be an integer")
    if not _is_number(summary.get("pass_rate")):
        errors.append("summary.pass_rate must be a number")
    if _summary_counts_are_ints(summary):
        _validate_summary_totals(summary, expectations, errors)


def _summary_counts_are_ints(summary: dict) -> bool:
    return all(isinstance(summary.get(field), int) for field in _SUMMARY_FIELDS)


_SUMMARY_FIELDS = ("passed", "failed", "total")


def _validate_summary_totals(
    summary: dict, expectations: list, errors: list[str]
) -> None:
    if summary["passed"] + summary["failed"] != summary["total"]:
        errors.append("summary.passed + summary.failed must equal summary.total")
    if summary["total"] != len(expectations):
        errors.append("summary.total must match len(expectations)")


def _validate_eval_feedback(data: dict, errors: list[str]) -> None:
    eval_feedback = data.get("eval_feedback")
    if not isinstance(eval_feedback, dict):
        errors.append("eval_feedback must be an object")
        return
    suggestions = eval_feedback.get("suggestions")
    if not isinstance(suggestions, list):
        errors.append("eval_feedback.suggestions must be a list")
        suggestions = []
    for index, suggestion in enumerate(suggestions):
        _validate_suggestion(index, suggestion, errors)
    _require_non_empty_string(eval_feedback, "overall", "eval_feedback.overall", errors)


def _validate_suggestion(index: int, suggestion: object, errors: list[str]) -> None:
    prefix = f"eval_feedback.suggestions[{index}]"
    if not isinstance(suggestion, dict):
        errors.append(f"{prefix} must be an object")
        return
    _require_non_empty_string(suggestion, "reason", f"{prefix}.reason", errors)
    assertion = suggestion.get("assertion")
    if assertion is not None and not isinstance(assertion, str):
        errors.append(f"{prefix}.assertion must be a string when present")


def _validate_claims(data: dict, errors: list[str]) -> None:
    claims = data.get("claims")
    if claims is None:
        return
    if not isinstance(claims, list):
        errors.append("claims must be a list when present")
        return
    for index, claim in enumerate(claims):
        _validate_claim(index, claim, errors)


def _validate_claim(index: int, claim: object, errors: list[str]) -> None:
    prefix = f"claims[{index}]"
    if not isinstance(claim, dict):
        errors.append(f"{prefix} must be an object")
        return
    _require_non_empty_string(claim, "claim", f"{prefix}.claim", errors)
    _require_non_empty_string(claim, "type", f"{prefix}.type", errors)
    if not isinstance(claim.get("verified"), bool):
        errors.append(f"{prefix}.verified must be a boolean")
    _require_non_empty_string(claim, "evidence", f"{prefix}.evidence", errors)


def _validate_user_notes(data: dict, errors: list[str]) -> None:
    user_notes = data.get("user_notes_summary")
    if user_notes is None:
        return
    if not isinstance(user_notes, dict):
        errors.append("user_notes_summary must be an object when present")
        return
    for field in ("uncertainties", "needs_review", "workarounds"):
        if field in user_notes:
            _validate_string_list(
                f"user_notes_summary.{field}", user_notes[field], errors
            )


def _validate_execution_metrics(data: dict, errors: list[str]) -> None:
    execution_metrics = data.get("execution_metrics")
    if execution_metrics is None:
        return
    if not isinstance(execution_metrics, dict):
        errors.append("execution_metrics must be an object when present")
        return
    _validate_tool_calls(execution_metrics, errors)
    for field in _EXECUTION_INTEGER_FIELDS:
        _validate_optional_integer(execution_metrics, field, errors)


_EXECUTION_INTEGER_FIELDS = (
    "total_tool_calls",
    "total_steps",
    "errors_encountered",
    "output_chars",
    "transcript_chars",
)


def _validate_tool_calls(execution_metrics: dict, errors: list[str]) -> None:
    tool_calls = execution_metrics.get("tool_calls")
    if tool_calls is not None and not isinstance(tool_calls, dict):
        errors.append("execution_metrics.tool_calls must be an object when present")


def _validate_optional_integer(values: dict, field: str, errors: list[str]) -> None:
    if field not in values:
        return
    value = values[field]
    if not isinstance(value, int) or isinstance(value, bool):
        errors.append(f"execution_metrics.{field} must be an integer")


def _validate_timing(data: dict, errors: list[str]) -> None:
    timing = data.get("timing")
    if timing is None:
        return
    if not isinstance(timing, dict):
        errors.append("timing must be an object when present")
        return
    for field in _TIMING_NUMBER_FIELDS:
        if field in timing and not _is_number(timing[field]):
            errors.append(f"timing.{field} must be a number")


_TIMING_NUMBER_FIELDS = (
    "executor_duration_seconds",
    "grader_duration_seconds",
    "total_duration_seconds",
)


def _require_non_empty_string(
    values: dict, field: str, name: str, errors: list[str]
) -> None:
    value = values.get(field)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{name} must be a non-empty string")


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

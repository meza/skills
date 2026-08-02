"""Derive and validate grading summary arithmetic."""


def derive_grading_summary(grading_data: dict) -> dict:
    """Calculate summary counts from the canonical expectation verdicts."""
    results = grading_data["results"]
    expectations = list(results["overall_expectations"])
    for turn_result in results["turns"]:
        expectations.extend(turn_result["expectations"])

    passed = sum(expectation["passed"] is True for expectation in expectations)
    total = len(expectations)
    failed = total - passed
    return {
        "passed": passed,
        "failed": failed,
        "total": total,
        "pass_rate": passed / total if total else 0.0,
    }


def validate_grading_summary(grading_data: dict) -> None:
    """Reject stored summary arithmetic that disagrees with expectation verdicts."""
    derived_summary = derive_grading_summary(grading_data)
    if grading_data.get("summary") != derived_summary:
        raise ValueError(
            "Grading summary does not match expectation verdicts: "
            f"stored={grading_data.get('summary')!r}, derived={derived_summary!r}"
        )

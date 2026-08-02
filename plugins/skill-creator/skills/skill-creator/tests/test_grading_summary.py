import copy
import unittest

from scripts.evaluate.grading_summary import (
    derive_grading_summary,
    validate_grading_summary,
)


def expectation(passed: bool) -> dict:
    return {
        "text": "Expected behavior",
        "passed": passed,
        "evidence": "Observed evidence.",
    }


class GradingSummaryTests(unittest.TestCase):
    def test_derives_summary_from_turn_expectations(self):
        grading = {
            "results": {
                "overall_expectations": [],
                "turns": [
                    {
                        "turn": 1,
                        "expectations": [
                            expectation(True),
                            expectation(False),
                            expectation(False),
                        ],
                    }
                ],
            }
        }

        self.assertEqual(
            derive_grading_summary(grading),
            {
                "passed": 1,
                "failed": 2,
                "total": 3,
                "pass_rate": 1 / 3,
            },
        )

    def test_counts_overall_expectations_across_multiple_turns(self):
        grading = {
            "results": {
                "overall_expectations": [expectation(True), expectation(False)],
                "turns": [
                    {"turn": 1, "expectations": [expectation(True)]},
                    {
                        "turn": 2,
                        "expectations": [expectation(False), expectation(True)],
                    },
                ],
            }
        }

        self.assertEqual(
            derive_grading_summary(grading),
            {
                "passed": 3,
                "failed": 2,
                "total": 5,
                "pass_rate": 0.6,
            },
        )

    def test_empty_expectations_have_zero_pass_rate(self):
        grading = {
            "results": {
                "overall_expectations": [],
                "turns": [],
            }
        }

        self.assertEqual(
            derive_grading_summary(grading),
            {
                "passed": 0,
                "failed": 0,
                "total": 0,
                "pass_rate": 0.0,
            },
        )

    def test_derivation_does_not_modify_expectation_records(self):
        grading = {
            "results": {
                "overall_expectations": [expectation(True)],
                "turns": [{"turn": 1, "expectations": [expectation(False)]}],
            }
        }
        original = copy.deepcopy(grading)

        derive_grading_summary(grading)

        self.assertEqual(grading, original)

    def test_semantic_validation_rejects_conflicting_summary(self):
        grading = {
            "results": {
                "overall_expectations": [],
                "turns": [{"turn": 1, "expectations": [expectation(False)]}],
            },
            "summary": {
                "passed": 1,
                "failed": 0,
                "total": 1,
                "pass_rate": 1.0,
            },
        }

        with self.assertRaisesRegex(
            ValueError,
            "Grading summary does not match expectation verdicts",
        ):
            validate_grading_summary(grading)


if __name__ == "__main__":
    unittest.main()

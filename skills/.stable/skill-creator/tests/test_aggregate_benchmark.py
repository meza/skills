import unittest
from pathlib import Path

from scripts.aggregate_benchmark import _extract_expectations


class AggregateBenchmarkTests(unittest.TestCase):
    def test_extract_expectations_flattens_nested_grading_results(self):
        expectations = _extract_expectations(
            {
                "results": {
                    "overall_expectations": [
                        {
                            "text": "Whole run does the thing",
                            "passed": True,
                            "evidence": "Full transcript evidence.",
                        }
                    ],
                    "turns": [
                        {
                            "turn": 1,
                            "expectations": [
                                {
                                    "text": "Turn does the thing",
                                    "passed": False,
                                    "evidence": "Turn response evidence.",
                                }
                            ],
                        }
                    ],
                }
            },
            Path("grading.json"),
        )

        self.assertEqual(
            expectations,
            [
                {
                    "scope": "overall",
                    "text": "Whole run does the thing",
                    "passed": True,
                    "evidence": "Full transcript evidence.",
                },
                {
                    "scope": "turn",
                    "turn": 1,
                    "text": "Turn does the thing",
                    "passed": False,
                    "evidence": "Turn response evidence.",
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()

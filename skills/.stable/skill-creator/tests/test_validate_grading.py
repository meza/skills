import json
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from validate_grading import validate_grading_data, validate_grading_file


class ValidateGradingTests(unittest.TestCase):
    def test_validate_grading_data_accepts_valid_minimal_payload(self):
        payload = {
            "expectations": [
                {
                    "text": "The output includes the expected file",
                    "passed": True,
                    "evidence": "Observed in outputs/report.txt",
                }
            ],
            "summary": {
                "passed": 1,
                "failed": 0,
                "total": 1,
                "pass_rate": 1.0,
            },
            "eval_feedback": {
                "suggestions": [
                    {
                        "assertion": "The output includes the expected file",
                        "reason": "This assertion is discriminating and matched the observed output.",
                    }
                ],
                "overall": "The run completed cleanly and the assertions covered the main outcome.",
            },
        }

        self.assertEqual(validate_grading_data(payload), [])

    def test_validate_grading_data_rejects_missing_required_fields(self):
        payload = {
            "expectations": [
                {
                    "text": "The output includes the expected file",
                    "passed": True,
                }
            ],
            "summary": {
                "passed": 1,
                "failed": 0,
                "total": 2,
                "pass_rate": "1.0",
            },
        }

        errors = validate_grading_data(payload)

        self.assertIn("expectations[0].evidence must be a non-empty string", errors)
        self.assertIn("summary.pass_rate must be a number", errors)
        self.assertIn("summary.total must match len(expectations)", errors)
        self.assertIn("eval_feedback must be an object", errors)

    def test_validate_grading_file_reports_invalid_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            grading_path = Path(temp_dir) / "grading.json"
            grading_path.write_text("{not valid json", encoding="utf-8")

            errors = validate_grading_file(grading_path)

            self.assertEqual(len(errors), 1)
            self.assertIn("invalid JSON", errors[0])

    def test_validate_grading_file_accepts_directory_input_pattern(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_dir = Path(temp_dir) / "run-1"
            run_dir.mkdir()
            grading_path = run_dir / "grading.json"
            grading_path.write_text(
                json.dumps(
                    {
                        "expectations": [
                            {
                                "text": "The output includes the expected file",
                                "passed": False,
                                "evidence": "report.txt was missing",
                            }
                        ],
                        "summary": {
                            "passed": 0,
                            "failed": 1,
                            "total": 1,
                            "pass_rate": 0.0,
                        },
                        "eval_feedback": {
                            "suggestions": [],
                            "overall": "The run failed because the expected file was not produced.",
                        },
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(validate_grading_file(grading_path), [])


if __name__ == "__main__":
    unittest.main()

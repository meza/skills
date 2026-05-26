import json
import unittest
from pathlib import Path

import jsonschema

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = PROJECT_ROOT / "schemas" / "grading.schema.json"


class GradingSchemaTests(unittest.TestCase):
    def test_schema_accepts_valid_grading_payload(self):
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        payload = {
            "executive_summary": "The run satisfied the evaluated expectations.",
            "results": {
                "overall_expectations": [
                    {
                        "text": "It does the thing across the full run",
                        "passed": True,
                        "evidence": "The full transcript includes the required output.",
                    }
                ],
                "turns": [
                    {
                        "turn": 1,
                        "expectations": [
                            {
                                "text": "It does the thing",
                                "passed": True,
                                "evidence": (
                                    "The response includes the required output."
                                ),
                            }
                        ],
                    }
                ],
            },
            "summary": {
                "passed": 2,
                "failed": 0,
                "total": 2,
                "pass_rate": 1.0,
            },
        }

        jsonschema.validate(payload, schema)

    def test_schema_rejects_payload_without_summary(self):
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        payload = {
            "executive_summary": "Missing summary.",
            "results": {"overall_expectations": [], "turns": []},
        }

        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(payload, schema)

    def test_schema_rejects_flat_expectations(self):
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        payload = {
            "executive_summary": "The run satisfied the evaluated expectations.",
            "expectations": [
                {
                    "text": "It does the thing",
                    "passed": True,
                    "evidence": "The response includes the required output.",
                }
            ],
            "summary": {
                "passed": 1,
                "failed": 0,
                "total": 1,
                "pass_rate": 1.0,
            },
        }

        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(payload, schema)

    def test_schema_requires_turn_number_for_turn_results(self):
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        payload = {
            "executive_summary": "The run satisfied the evaluated expectations.",
            "results": {
                "overall_expectations": [],
                "turns": [
                    {
                        "expectations": [
                            {
                                "text": "It does the thing",
                                "passed": True,
                                "evidence": (
                                    "The response includes the required output."
                                ),
                            }
                        ]
                    }
                ],
            },
            "summary": {
                "passed": 1,
                "failed": 0,
                "total": 1,
                "pass_rate": 1.0,
            },
        }

        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(payload, schema)


if __name__ == "__main__":
    unittest.main()

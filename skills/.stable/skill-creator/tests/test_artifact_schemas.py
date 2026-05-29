import json
import tempfile
import unittest
from pathlib import Path

import jsonschema

from scripts.evaluate.artifact_validation import (
    ArtifactValidationError,
    SCHEMA_ROOT,
    validate_artifact,
    write_json_artifact,
)


class ArtifactSchemaTests(unittest.TestCase):
    def test_all_schema_files_are_valid_json_schemas(self):
        for schema_path in SCHEMA_ROOT.glob("*.schema.json"):
            with self.subTest(schema=schema_path.name):
                schema = json.loads(schema_path.read_text(encoding="utf-8"))
                jsonschema.Draft202012Validator.check_schema(schema)

    def test_writer_rejects_invalid_payload_before_writing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "timing.json"

            with self.assertRaisesRegex(
                ArtifactValidationError,
                "Invalid timing.json",
            ):
                write_json_artifact(path, {"total_tokens": 1}, "timing.schema.json")

            self.assertFalse(path.exists())

    def test_schemas_accept_minimal_viewer_iteration_contract(self):
        grading = {
            "executive_summary": "The run satisfied the evaluated expectations.",
            "results": {
                "overall_expectations": [
                    {
                        "id": "d2eceb7e-7768-5d46-ac68-c4dc3f0e8e31",
                        "text": "Whole run expectation",
                        "passed": True,
                        "evidence": "Full transcript evidence.",
                    }
                ],
                "turns": [
                    {
                        "turn": 1,
                        "expectations": [
                            {
                                "id": "9fb0a83a-8301-50ae-8502-133bc77fc19f",
                                "text": "Turn expectation",
                                "passed": False,
                                "evidence": "Turn evidence.",
                            }
                        ],
                    }
                ],
            },
            "summary": {
                "passed": 1,
                "failed": 1,
                "total": 2,
                "pass_rate": 0.5,
            },
        }
        timing = {
            "total_tokens": 42,
            "input_tokens": 20,
            "output_tokens": 22,
            "duration_ms": 12500,
            "total_duration_seconds": 12.5,
            "cost_usd": 0.123456,
        }
        metadata = {
            "eval_id": 1,
            "eval_name": "sample-eval",
            "turns": [{"prompt": "Do it", "expectations": ["It works"]}],
        }
        turn_output_root = "F:/runs/iteration-1/eval-1/skill/turn-1/outputs"
        run_artifacts = {
            "skill_name": "sample-skill",
            "eval": {
                "id": 1,
                "eval_name": "sample-eval",
                "turns": [{"prompt": "Do it", "expectations": ["It works"]}],
            },
            "run_type": "skill",
            "artifacts": {
                "results_dir_path": "F:/runs/iteration-1/eval-1/skill",
                "working_dir_path": "F:/runs/work/eval-1/skill",
                "run_transcript_path": "F:/runs/iteration-1/eval-1/skill/transcript.md",
                "raw_output_path": "F:/runs/iteration-1/eval-1/skill/raw_output.jsonl",
                "timing_path": "F:/runs/iteration-1/eval-1/skill/timing.json",
                "turns": [
                    {
                        "turn": 1,
                        "response_path": f"{turn_output_root}/response.md",
                        "transcript_path": f"{turn_output_root}/transcript.md",
                    }
                ],
            },
            "schema_path": "F:/skill-creator/schemas/grading.schema.json",
        }
        manifest = {
            "skill_name": "sample-skill",
            "eval_definitions_path": "F:/skills/sample/evals/evals.json",
            "iteration": 1,
            "provider": "codex",
            "model": "gpt-5",
            "effort": "high",
            "timestamp": "2026-05-29T10:00:00Z",
            "total_elapsed_seconds": 12.5,
            "runs": [
                {
                    "eval_id": 1,
                    "eval_name": "sample-eval",
                    "run_type": "skill",
                    "session_id": "session-1",
                    "status": "success",
                    "duration_ms": 12500,
                    "total_tokens": 42,
                    "cost_usd": 0.123456,
                }
            ],
        }
        aggregated = {
            "metadata": {
                "skill_name": "sample-skill",
                "skill_path": "F:/skills/sample",
                "provider": "codex",
                "model": "gpt-5",
                "effort": "high",
                "timestamp": "2026-05-29T10:00:00Z",
            },
            "graded_runs": [
                {
                    "eval_id": 1,
                    "eval_name": "sample-eval",
                    "run_type": "skill",
                    "result": {
                        "pass_rate": 0.5,
                        "passed": 1,
                        "failed": 1,
                        "total": 2,
                        "time_seconds": 12.5,
                        "tokens": 42,
                    },
                    "grading": {
                        "executive_summary": grading["executive_summary"],
                        "results": grading["results"],
                    },
                }
            ],
            "summary": {
                "skill": {
                    "pass_rate": {
                        "mean": 0.5,
                        "stddev": 0.0,
                        "min": 0.5,
                        "max": 0.5,
                    },
                    "time_seconds": {
                        "mean": 12.5,
                        "stddev": 0.0,
                        "min": 12.5,
                        "max": 12.5,
                    },
                    "tokens": {
                        "mean": 42,
                        "stddev": 0.0,
                        "min": 42,
                        "max": 42,
                    },
                }
            },
        }

        validate_artifact(manifest, "run-manifest.schema.json", "run_manifest.json")
        validate_artifact(metadata, "eval-metadata.schema.json", "eval_metadata.json")
        validate_artifact(
            run_artifacts, "run-artifacts.schema.json", "run_artifacts.json"
        )
        validate_artifact(timing, "timing.schema.json", "timing.json")
        validate_artifact(grading, "grading.schema.json", "grading.json")
        validate_artifact(
            aggregated,
            "aggregated-results.schema.json",
            "aggregated_results.json",
        )
        validate_artifact(
            {
                "total": 1,
                "completed": 0,
                "succeeded": 0,
                "failed": 0,
                "running": 1,
                "elapsed_seconds": 0.1,
                "cost_usd": 0.0,
                "completed_runs": [],
            },
            "progress.schema.json",
            "progress.json",
        )
        validate_artifact(
            {
                "reviews": [
                    {
                        "eval_id": 1,
                        "updated_at": "2026-05-29T10:00:00Z",
                        "comments": "Looks good.",
                    }
                ]
            },
            "viewer-feedback.schema.json",
            "viewer_feedback.json",
        )
        validate_artifact(
            {
                "run_manifest": manifest,
                "aggregated_results": aggregated,
                "eval_metadata": [metadata],
                "run_artifacts": [run_artifacts],
                "grading": [grading],
                "timing": [timing],
            },
            "viewer-iteration.schema.json",
            "viewer iteration",
        )


if __name__ == "__main__":
    unittest.main()

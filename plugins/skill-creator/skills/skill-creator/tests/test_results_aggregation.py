import json
import tempfile
import unittest
import warnings
from pathlib import Path

from scripts.evaluate.results_aggregation import (
    GradingResultAggregator,
    calculate_stats,
    load_eval_metadata,
    load_graded_run,
)

# A Windows drive letter is absolute on Windows but a *relative* path on POSIX
# (and "/x" is the reverse), so synthetic absolute paths must be anchored to
# the running platform's filesystem root to stay absolute everywhere.
FAKE_ROOT = Path(Path(tempfile.gettempdir()).anchor)


class GradingResultAggregatorTests(unittest.TestCase):
    def test_calculate_stats_handles_empty_and_multiple_values(self):
        self.assertEqual(
            calculate_stats([]),
            {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0},
        )
        self.assertEqual(
            calculate_stats([1.0, 3.0, None]),
            {"mean": 2.0, "stddev": 1.4142, "min": 1.0, "max": 3.0},
        )

    def test_load_eval_metadata_uses_metadata_file_and_falls_back_for_invalid_json(
        self,
    ):
        with tempfile.TemporaryDirectory() as temp_dir:
            eval_dir = Path(temp_dir) / "eval-7"
            eval_dir.mkdir()
            metadata_path = eval_dir / "eval_metadata.json"
            metadata_path.write_text(
                json.dumps({"eval_id": 17, "eval_name": "metadata-name"}),
                encoding="utf-8",
            )

            self.assertEqual(load_eval_metadata(eval_dir), (17, "metadata-name"))

            metadata_path.write_text("{invalid", encoding="utf-8")

            self.assertEqual(load_eval_metadata(eval_dir), (7, None))

    def test_aggregates_grading_outputs_for_iteration(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            iteration_dir = Path(temp_dir) / "results" / "iteration-1"
            run_type_dir = iteration_dir / "eval-1" / "skill"
            run_type_dir.mkdir(parents=True)
            (run_type_dir / "grading.json").write_text(
                json.dumps(
                    {
                        "executive_summary": "The skill partially succeeded.",
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
                                            "id": (
                                                "9fb0a83a-8301-50ae-8502-"
                                                "133bc77fc19f"
                                            ),
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
                ),
                encoding="utf-8",
            )
            (run_type_dir / "timing.json").write_text(
                json.dumps(
                    {
                        "total_duration_seconds": 12.5,
                        "total_tokens": 42,
                    }
                ),
                encoding="utf-8",
            )

            result = GradingResultAggregator(
                iteration_dir=iteration_dir,
                skill_name="sample-skill",
                skill_path=FAKE_ROOT / "skills/sample-skill",
                provider="codex",
                model="gpt-5.5",
                effort="high",
            ).aggregate()

            aggregated_json_path = iteration_dir / "aggregated_results.json"
            self.assertEqual(
                result,
                {
                    "json_path": str(aggregated_json_path),
                },
            )

            aggregated = json.loads(aggregated_json_path.read_text(encoding="utf-8"))
            self.assertEqual(aggregated["metadata"]["skill_name"], "sample-skill")
            self.assertEqual(aggregated["metadata"]["provider"], "codex")
            self.assertEqual(aggregated["metadata"]["model"], "gpt-5.5")
            self.assertEqual(aggregated["metadata"]["effort"], "high")
            self.assertEqual(
                aggregated["metadata"]["skill_path"],
                str(FAKE_ROOT / "skills/sample-skill"),
            )
            self.assertEqual(
                aggregated["graded_runs"][0]["grading"],
                {
                    "executive_summary": "The skill partially succeeded.",
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
                },
            )
            self.assertEqual(
                aggregated["summary"]["skill"]["pass_rate"]["mean"],
                0.5,
            )
            self.assertFalse((iteration_dir / "aggregated_results.md").exists())

    def test_load_graded_run_recalculates_inconsistent_legacy_summary(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_type_dir = Path(temp_dir) / "eval-1" / "skill"
            run_type_dir.mkdir(parents=True)
            grading_path = run_type_dir / "grading.json"
            grading_path.write_text(
                json.dumps(
                    {
                        "executive_summary": "The run partially succeeded.",
                        "results": {
                            "overall_expectations": [],
                            "turns": [
                                {
                                    "turn": 1,
                                    "expectations": [
                                        {
                                            "id": (
                                                "d2eceb7e-7768-5d46-ac68-"
                                                "c4dc3f0e8e31"
                                            ),
                                            "text": "Passing expectation",
                                            "passed": True,
                                            "evidence": "Passing evidence.",
                                        },
                                        {
                                            "id": (
                                                "9fb0a83a-8301-50ae-8502-"
                                                "133bc77fc19f"
                                            ),
                                            "text": "First failing expectation",
                                            "passed": False,
                                            "evidence": "First failure evidence.",
                                        },
                                        {
                                            "id": (
                                                "b04d32a3-d148-5a0b-8bc4-"
                                                "bb25dba54bc0"
                                            ),
                                            "text": "Second failing expectation",
                                            "passed": False,
                                            "evidence": "Second failure evidence.",
                                        },
                                    ],
                                }
                            ],
                        },
                        "summary": {
                            "passed": 2,
                            "failed": 1,
                            "total": 3,
                            "pass_rate": 2 / 3,
                        },
                    }
                ),
                encoding="utf-8",
            )

            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                run = load_graded_run(grading_path, 1, "sample", "skill")

            self.assertEqual(
                run["result"],
                {
                    "pass_rate": 1 / 3,
                    "passed": 1,
                    "failed": 2,
                    "total": 3,
                    "time_seconds": 0.0,
                    "tokens": 0,
                },
            )
            self.assertEqual(len(caught), 1)
            self.assertIn(str(grading_path), str(caught[0].message))
            self.assertIn("does not match expectation verdicts", str(caught[0].message))


if __name__ == "__main__":
    unittest.main()

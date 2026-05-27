import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

from scripts.evaluate.grading import (
    DEFAULT_GRADER_INSTRUCTIONS_PATH,
    DEFAULT_GRADING_SCHEMA_PATH,
    GradingJob,
    add_grading_expectation_ids,
    create_grading_job_factory,
)
from scripts.evaluate.providers import TurnResult


class FakeProvider:
    def build_grading_command(
        self,
        model,
        effort=None,
        working_dir=None,
        output_schema=None,
    ):
        del model, effort
        return ["fake-provider", "--cwd", working_dir, "--schema", output_schema]

    def parse_output(self, stdout, prompt):
        del prompt
        return TurnResult(response=stdout)

    def process_environment(self, base_env, run_dir, artifact_dir):
        del run_dir, artifact_dir
        return _FakeEnvironment(base_env)


class _FakeEnvironment:
    def __init__(self, env):
        self.env = env

    def __enter__(self):
        return self.env

    def __exit__(self, exc_type, exc, traceback):
        return False


class GradingJobTests(unittest.TestCase):
    def test_add_grading_expectation_ids_assigns_stable_ids(self):
        grading_payload = {
            "executive_summary": "The run satisfied the expectations.",
            "results": {
                "overall_expectations": [
                    {
                        "text": "It does the thing across the full run",
                        "passed": True,
                        "evidence": "The full transcript includes it.",
                    },
                    {
                        "text": "It avoids extra output",
                        "passed": True,
                        "evidence": "The response contains only the requested output.",
                    },
                ],
                "turns": [
                    {
                        "turn": 1,
                        "expectations": [
                            {
                                "text": "It does the first thing",
                                "passed": True,
                                "evidence": "The first response includes it.",
                            },
                            {
                                "text": "It avoids the first bad thing",
                                "passed": True,
                                "evidence": "The first response omits it.",
                            },
                        ],
                    },
                    {
                        "turn": 2,
                        "expectations": [
                            {
                                "text": "It does the second thing",
                                "passed": True,
                                "evidence": "The second response includes it.",
                            }
                        ],
                    },
                ],
            },
            "summary": {
                "passed": 5,
                "failed": 0,
                "total": 5,
                "pass_rate": 1.0,
            },
        }

        add_grading_expectation_ids(grading_payload, eval_id=7, run_type="skill")

        self.assertEqual(
            [
                expectation["id"]
                for expectation in grading_payload["results"]["overall_expectations"]
            ],
            [
                str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        "skill-creator/grading/eval-7/skill/overall/1",
                    )
                ),
                str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        "skill-creator/grading/eval-7/skill/overall/2",
                    )
                ),
            ],
        )
        self.assertEqual(
            [
                expectation["id"]
                for expectation in grading_payload["results"]["turns"][0][
                    "expectations"
                ]
            ],
            [
                str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        "skill-creator/grading/eval-7/skill/turn-1/expectation/1",
                    )
                ),
                str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        "skill-creator/grading/eval-7/skill/turn-1/expectation/2",
                    )
                ),
            ],
        )
        self.assertEqual(
            grading_payload["results"]["turns"][1]["expectations"][0]["id"],
            str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    "skill-creator/grading/eval-7/skill/turn-2/expectation/1",
                )
            ),
        )

    def test_create_grading_job_factory_uses_default_schema_and_instructions(self):
        eval_job = mock.Mock()
        eval_job.eval_def = {"id": 1}
        eval_job.run_type = "skill"
        eval_job.run_type_dir = Path("F:/runs/eval-1/skill")
        eval_job.run_dir = "F:/runs/workdirs/eval-1/skill"
        provider = FakeProvider()

        grading_job = create_grading_job_factory(
            provider=provider,
            skill_name="sample-skill",
            model="gpt-test",
            effort="high",
            timeout=600,
        )(eval_job)

        self.assertIsInstance(grading_job, GradingJob)
        self.assertEqual(grading_job.eval_def, {"id": 1})
        self.assertEqual(grading_job.run_type, "skill")
        self.assertEqual(grading_job.run_type_dir, Path("F:/runs/eval-1/skill"))
        self.assertEqual(grading_job.run_dir, "F:/runs/workdirs/eval-1/skill")
        self.assertEqual(grading_job.skill_name, "sample-skill")
        self.assertIs(grading_job.provider, provider)
        self.assertEqual(grading_job.model, "gpt-test")
        self.assertEqual(grading_job.effort, "high")
        self.assertEqual(grading_job.timeout, 600)
        self.assertEqual(grading_job.schema_path, DEFAULT_GRADING_SCHEMA_PATH)
        self.assertEqual(
            DEFAULT_GRADER_INSTRUCTIONS_PATH,
            Path(__file__).resolve().parents[1]
            / "scripts"
            / "evaluate"
            / "instructions"
            / "grading.md",
        )
        self.assertEqual(
            grading_job.grader_instructions_path,
            DEFAULT_GRADER_INSTRUCTIONS_PATH,
        )

    def test_run_writes_provider_json_response_to_grading_file(self):
        grading_payload = {
            "executive_summary": "The run satisfied the expectation.",
            "results": {
                "overall_expectations": [
                    {
                        "text": "It does the thing across the full run",
                        "passed": True,
                        "evidence": "The full transcript includes the output.",
                    }
                ],
                "turns": [
                    {
                        "turn": 1,
                        "expectations": [
                            {
                                "text": "It does the thing",
                                "passed": True,
                                "evidence": "The response says so.",
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
        expected_grading_payload = {
            **grading_payload,
            "results": {
                "overall_expectations": [
                    {
                        **grading_payload["results"]["overall_expectations"][0],
                        "id": str(
                            uuid.uuid5(
                                uuid.NAMESPACE_URL,
                                "skill-creator/grading/eval-1/skill/overall/1",
                            )
                        ),
                    }
                ],
                "turns": [
                    {
                        **grading_payload["results"]["turns"][0],
                        "expectations": [
                            {
                                **grading_payload["results"]["turns"][0][
                                    "expectations"
                                ][0],
                                "id": str(
                                    uuid.uuid5(
                                        uuid.NAMESPACE_URL,
                                        (
                                            "skill-creator/grading/eval-1/skill/"
                                            "turn-1/expectation/1"
                                        ),
                                    )
                                ),
                            }
                        ],
                    }
                ],
            },
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            run_type_dir = (
                Path(temp_dir) / "results" / "iteration-1" / "eval-1" / "skill"
            )
            outputs_dir = run_type_dir / "turn-1" / "outputs"
            outputs_dir.mkdir(parents=True)
            (outputs_dir / "response.md").write_text("answer", encoding="utf-8")
            (outputs_dir / "transcript.md").write_text("transcript", encoding="utf-8")
            instructions_path = Path(temp_dir) / "grader.md"
            instructions_path.write_text(
                "Grade carefully.\n{run_result_json}",
                encoding="utf-8",
            )

            with mock.patch(
                "scripts.evaluate.grading.run_with_timeout",
                return_value=(json.dumps(grading_payload), "", 0, False, 125),
            ) as run_with_timeout:
                grading_job = GradingJob(
                    eval_def={
                        "id": 1,
                        "eval_name": "sample-eval",
                        "turns": [
                            {
                                "prompt": "Do it",
                                "expectations": ["It does the thing"],
                            }
                        ],
                    },
                    run_type="skill",
                    run_type_dir=run_type_dir,
                    skill_name="sample-skill",
                    provider=FakeProvider(),
                    model="gpt-test",
                    effort="high",
                    timeout=600,
                    schema_path=DEFAULT_GRADING_SCHEMA_PATH,
                    grader_instructions_path=instructions_path,
                )
                grading_job.run()

            self.assertEqual(
                json.loads((run_type_dir / "grading.json").read_text(encoding="utf-8")),
                expected_grading_payload,
            )
            run_artifacts = json.loads(
                (run_type_dir / "run_artifacts.json").read_text(encoding="utf-8")
            )
            self.assertEqual(run_artifacts, grading_job.run_result())
            self.assertIn(
                json.dumps(run_artifacts, indent=2),
                run_with_timeout.call_args.args[1],
            )
            self.assertEqual(
                run_with_timeout.call_args.args[0],
                [
                    "fake-provider",
                    "--cwd",
                    str(run_type_dir),
                    "--schema",
                    str(run_type_dir / "grader_output_schema.json"),
                ],
            )
            grader_output_schema = json.loads(
                (run_type_dir / "grader_output_schema.json").read_text(encoding="utf-8")
            )
            self.assertNotIn(
                "id",
                grader_output_schema["$defs"]["expectation_result"]["properties"],
            )

    def test_run_rejects_provider_json_that_fails_grading_validation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_type_dir = (
                Path(temp_dir) / "results" / "iteration-1" / "eval-1" / "skill"
            )
            outputs_dir = run_type_dir / "turn-1" / "outputs"
            outputs_dir.mkdir(parents=True)
            (outputs_dir / "response.md").write_text("answer", encoding="utf-8")
            (outputs_dir / "transcript.md").write_text("transcript", encoding="utf-8")
            instructions_path = Path(temp_dir) / "grader.md"
            instructions_path.write_text("Grade carefully.", encoding="utf-8")

            with (
                mock.patch(
                    "scripts.evaluate.grading.run_with_timeout",
                    return_value=(json.dumps({"expectations": []}), "", 0, False, 125),
                ),
                self.assertRaisesRegex(RuntimeError, "Invalid grading output"),
            ):
                GradingJob(
                    eval_def={
                        "id": 1,
                        "eval_name": "sample-eval",
                        "turns": [
                            {
                                "prompt": "Do it",
                                "expectations": ["It does the thing"],
                            }
                        ],
                    },
                    run_type="skill",
                    run_type_dir=run_type_dir,
                    skill_name="sample-skill",
                    provider=FakeProvider(),
                    model="gpt-test",
                    effort="high",
                    timeout=600,
                    schema_path=DEFAULT_GRADING_SCHEMA_PATH,
                    grader_instructions_path=instructions_path,
                ).run()

            self.assertFalse((run_type_dir / "grading.json").exists())

    def test_run_reports_grading_timeout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            run_type_dir = temp_path / "results" / "iteration-1" / "eval-1" / "skill"
            outputs_dir = run_type_dir / "turn-1" / "outputs"
            outputs_dir.mkdir(parents=True)
            (outputs_dir / "response.md").write_text("answer", encoding="utf-8")
            (outputs_dir / "transcript.md").write_text("transcript", encoding="utf-8")
            instructions_path = temp_path / "grader.md"
            instructions_path.write_text("Grade carefully.", encoding="utf-8")

            with (
                mock.patch(
                    "scripts.evaluate.grading.run_with_timeout",
                    return_value=("", "", 1, True, 600000),
                ),
                self.assertRaisesRegex(
                    TimeoutError,
                    "Grading eval-1/skill timed out",
                ),
            ):
                GradingJob(
                    eval_def={"id": 1, "turns": []},
                    run_type="skill",
                    run_type_dir=run_type_dir,
                    skill_name="sample-skill",
                    provider=FakeProvider(),
                    model=None,
                    effort=None,
                    timeout=600,
                    schema_path=DEFAULT_GRADING_SCHEMA_PATH,
                    grader_instructions_path=instructions_path,
                ).run()

    def test_run_reports_grading_process_error_without_stdout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            run_type_dir = temp_path / "results" / "iteration-1" / "eval-1" / "skill"
            outputs_dir = run_type_dir / "turn-1" / "outputs"
            outputs_dir.mkdir(parents=True)
            (outputs_dir / "response.md").write_text("answer", encoding="utf-8")
            (outputs_dir / "transcript.md").write_text("transcript", encoding="utf-8")
            instructions_path = temp_path / "grader.md"
            instructions_path.write_text("Grade carefully.", encoding="utf-8")

            with (
                mock.patch(
                    "scripts.evaluate.grading.run_with_timeout",
                    return_value=("", "grader failed", 2, False, 125),
                ),
                self.assertRaisesRegex(RuntimeError, "grader failed"),
            ):
                GradingJob(
                    eval_def={"id": 1, "turns": []},
                    run_type="skill",
                    run_type_dir=run_type_dir,
                    skill_name="sample-skill",
                    provider=FakeProvider(),
                    model=None,
                    effort=None,
                    timeout=600,
                    schema_path=DEFAULT_GRADING_SCHEMA_PATH,
                    grader_instructions_path=instructions_path,
                ).run()

    def test_build_prompt_injects_run_result_json_with_artifact_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            run_type_dir = temp_path / "results" / "iteration-1" / "eval-1" / "skill"
            run_dir = temp_path / "workdirs" / "eval-1" / "skill"
            outputs_dir = run_type_dir / "turn-1" / "outputs"
            outputs_dir.mkdir(parents=True)
            run_dir.mkdir(parents=True)
            (outputs_dir / "response.md").write_text("answer", encoding="utf-8")
            (outputs_dir / "transcript.md").write_text("transcript", encoding="utf-8")
            (run_type_dir / "transcript.md").write_text(
                "full transcript", encoding="utf-8"
            )
            (run_type_dir / "raw_output.jsonl").write_text("{}", encoding="utf-8")
            (run_type_dir / "timing.json").write_text("{}", encoding="utf-8")
            instructions_path = temp_path / "grader.md"
            instructions_path.write_text(
                "Grade {skill_name}.\n{run_result_json}",
                encoding="utf-8",
            )
            schema_path = temp_path / "grading.schema.json"

            prompt = GradingJob(
                eval_def={
                    "id": 1,
                    "eval_name": "sample-eval",
                    "turns": [
                        {
                            "prompt": "Do it",
                            "expectations": ["It does the thing"],
                        }
                    ],
                },
                run_type="skill",
                run_type_dir=run_type_dir,
                run_dir=str(run_dir),
                skill_name="sample-skill",
                provider=FakeProvider(),
                model=None,
                effort=None,
                timeout=600,
                schema_path=schema_path,
                grader_instructions_path=instructions_path,
            ).build_prompt()

        self.assertIn("Grade sample-skill.", prompt)
        self.assertNotIn("{run_result_json}", prompt)
        self.assertNotIn('"response": "answer"', prompt)
        self.assertNotIn('"transcript": "transcript"', prompt)
        run_result = json.loads(prompt.split("\n", 1)[1])
        self.assertEqual(run_result["skill_name"], "sample-skill")
        self.assertEqual(
            run_result["eval"],
            {
                "id": 1,
                "eval_name": "sample-eval",
                "turns": [
                    {
                        "prompt": "Do it",
                        "expectations": ["It does the thing"],
                    }
                ],
            },
        )
        self.assertEqual(run_result["run_type"], "skill")
        self.assertEqual(
            run_result["artifacts"]["results_dir_path"],
            str(run_type_dir),
        )
        self.assertEqual(
            run_result["artifacts"]["working_dir_path"],
            str(run_dir),
        )
        self.assertEqual(
            run_result["artifacts"]["run_transcript_path"],
            str(run_type_dir / "transcript.md"),
        )
        self.assertEqual(
            run_result["artifacts"]["raw_output_path"],
            str(run_type_dir / "raw_output.jsonl"),
        )
        self.assertEqual(
            run_result["artifacts"]["timing_path"],
            str(run_type_dir / "timing.json"),
        )
        self.assertEqual(run_result["schema_path"], str(schema_path))
        self.assertEqual(
            run_result["artifacts"]["turns"],
            [
                {
                    "turn": 1,
                    "response_path": str(outputs_dir / "response.md"),
                    "transcript_path": str(outputs_dir / "transcript.md"),
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()

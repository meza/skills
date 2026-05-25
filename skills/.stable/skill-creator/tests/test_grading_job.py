import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate.grading import (
    DEFAULT_GRADER_INSTRUCTIONS_PATH,
    DEFAULT_GRADING_SCHEMA_PATH,
    GradingJob,
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
    def test_create_grading_job_factory_uses_default_schema_and_instructions(self):
        eval_job = mock.Mock()
        eval_job.eval_def = {"id": 1}
        eval_job.config = "with_skill"
        eval_job.config_dir = Path("F:/runs/eval-1/with_skill")
        provider = FakeProvider()

        grading_job = create_grading_job_factory(
            provider=provider,
            model="gpt-test",
            effort="high",
            timeout=600,
        )(eval_job)

        self.assertIsInstance(grading_job, GradingJob)
        self.assertEqual(grading_job.eval_def, {"id": 1})
        self.assertEqual(grading_job.config, "with_skill")
        self.assertEqual(grading_job.config_dir, Path("F:/runs/eval-1/with_skill"))
        self.assertIs(grading_job.provider, provider)
        self.assertEqual(grading_job.model, "gpt-test")
        self.assertEqual(grading_job.effort, "high")
        self.assertEqual(grading_job.timeout, 600)
        self.assertEqual(grading_job.schema_path, DEFAULT_GRADING_SCHEMA_PATH)
        self.assertEqual(
            grading_job.grader_instructions_path,
            DEFAULT_GRADER_INSTRUCTIONS_PATH,
        )

    def test_run_writes_provider_json_response_to_grading_file(self):
        grading_payload = {
            "executive_summary": "The run satisfied the expectation.",
            "expectations": [
                {
                    "text": "It does the thing",
                    "passed": True,
                    "evidence": "The response says so.",
                }
            ],
            "summary": {
                "passed": 1,
                "failed": 0,
                "total": 1,
                "pass_rate": 1.0,
            },
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = (
                Path(temp_dir) / "results" / "iteration-1" / "eval-1" / "with_skill"
            )
            outputs_dir = config_dir / "turn-1" / "outputs"
            outputs_dir.mkdir(parents=True)
            (outputs_dir / "response.md").write_text("answer", encoding="utf-8")
            (outputs_dir / "transcript.md").write_text("transcript", encoding="utf-8")
            instructions_path = Path(temp_dir) / "grader.md"
            instructions_path.write_text("Grade carefully.", encoding="utf-8")

            with mock.patch(
                "scripts.evaluate.grading.run_with_timeout",
                return_value=(json.dumps(grading_payload), "", 0, False, 125),
            ) as run_with_timeout:
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
                    config="with_skill",
                    config_dir=config_dir,
                    provider=FakeProvider(),
                    model="gpt-test",
                    effort="high",
                    timeout=600,
                    schema_path=DEFAULT_GRADING_SCHEMA_PATH,
                    grader_instructions_path=instructions_path,
                ).run()

            self.assertEqual(
                json.loads((config_dir / "grading.json").read_text(encoding="utf-8")),
                grading_payload,
            )
            self.assertEqual(
                run_with_timeout.call_args.args[0],
                [
                    "fake-provider",
                    "--cwd",
                    str(config_dir),
                    "--schema",
                    str(DEFAULT_GRADING_SCHEMA_PATH),
                ],
            )

    def test_run_rejects_provider_json_that_fails_grading_validation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = (
                Path(temp_dir) / "results" / "iteration-1" / "eval-1" / "with_skill"
            )
            outputs_dir = config_dir / "turn-1" / "outputs"
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
                    config="with_skill",
                    config_dir=config_dir,
                    provider=FakeProvider(),
                    model="gpt-test",
                    effort="high",
                    timeout=600,
                    schema_path=DEFAULT_GRADING_SCHEMA_PATH,
                    grader_instructions_path=instructions_path,
                ).run()

            self.assertFalse((config_dir / "grading.json").exists())

    def test_run_reports_grading_timeout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            config_dir = temp_path / "results" / "iteration-1" / "eval-1" / "with_skill"
            outputs_dir = config_dir / "turn-1" / "outputs"
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
                    "Grading eval-1/with_skill timed out",
                ),
            ):
                GradingJob(
                    eval_def={"id": 1, "turns": []},
                    config="with_skill",
                    config_dir=config_dir,
                    provider=FakeProvider(),
                    model=None,
                    effort=None,
                    timeout=600,
                    schema_path=temp_path / "grading.schema.json",
                    grader_instructions_path=instructions_path,
                ).run()

    def test_run_reports_grading_process_error_without_stdout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            config_dir = temp_path / "results" / "iteration-1" / "eval-1" / "with_skill"
            outputs_dir = config_dir / "turn-1" / "outputs"
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
                    config="with_skill",
                    config_dir=config_dir,
                    provider=FakeProvider(),
                    model=None,
                    effort=None,
                    timeout=600,
                    schema_path=temp_path / "grading.schema.json",
                    grader_instructions_path=instructions_path,
                ).run()

    def test_build_prompt_includes_grader_instructions_eval_and_turn_outputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            config_dir = temp_path / "results" / "iteration-1" / "eval-1" / "with_skill"
            outputs_dir = config_dir / "turn-1" / "outputs"
            outputs_dir.mkdir(parents=True)
            (outputs_dir / "response.md").write_text("answer", encoding="utf-8")
            (outputs_dir / "transcript.md").write_text("transcript", encoding="utf-8")
            instructions_path = temp_path / "grader.md"
            instructions_path.write_text("Grade carefully.", encoding="utf-8")

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
                config="with_skill",
                config_dir=config_dir,
                provider=FakeProvider(),
                model=None,
                effort=None,
                timeout=600,
                schema_path=temp_path / "grading.schema.json",
                grader_instructions_path=instructions_path,
            ).build_prompt()

        self.assertIn("Grade carefully.", prompt)
        self.assertIn('"eval_name": "sample-eval"', prompt)
        self.assertIn('"config": "with_skill"', prompt)
        self.assertIn('"response": "answer"', prompt)
        self.assertIn('"transcript": "transcript"', prompt)


if __name__ == "__main__":
    unittest.main()

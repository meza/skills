"""Grade one completed eval run type."""

import json
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

import jsonschema

from .eval_job import run_with_timeout
from .providers import Provider

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GRADER_INSTRUCTIONS_PATH = (
    PROJECT_ROOT / "scripts" / "evaluate" / "instructions" / "grading.md"
)
DEFAULT_GRADING_SCHEMA_PATH = PROJECT_ROOT / "schemas" / "grading.schema.json"


def add_grading_expectation_ids(
    grading_data: dict, *, eval_id: int, run_type: str
) -> None:
    """Assign orchestrator-owned IDs to each grading expectation result."""
    results = grading_data["results"]
    for index, expectation in enumerate(results["overall_expectations"], start=1):
        expectation["id"] = grading_expectation_id(
            eval_id=eval_id,
            run_type=run_type,
            expectation_path=f"overall/{index}",
        )

    for turn_result in results["turns"]:
        turn = turn_result["turn"]
        for index, expectation in enumerate(turn_result["expectations"], start=1):
            expectation["id"] = grading_expectation_id(
                eval_id=eval_id,
                run_type=run_type,
                expectation_path=f"turn-{turn}/expectation/{index}",
            )


def grading_expectation_id(
    *, eval_id: int, run_type: str, expectation_path: str
) -> str:
    name = f"skill-creator/grading/eval-{eval_id}/{run_type}/{expectation_path}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, name))


def create_grading_job_factory(
    provider: Provider,
    skill_name: str,
    model: str | None,
    effort: str | None,
    timeout: int,
):
    """Create grading jobs for completed eval run types."""

    def factory(eval_job) -> "GradingJob":
        return GradingJob(
            eval_def=eval_job.eval_def,
            run_type=eval_job.run_type,
            run_type_dir=eval_job.run_type_dir,
            skill_name=skill_name,
            provider=provider,
            model=model,
            effort=effort,
            timeout=timeout,
            schema_path=DEFAULT_GRADING_SCHEMA_PATH,
            grader_instructions_path=DEFAULT_GRADER_INSTRUCTIONS_PATH,
            run_dir=eval_job.run_dir,
        )

    return factory


@dataclass
class GradingJob:
    """Run a schema-constrained grader for one completed eval run-type directory."""

    eval_def: dict
    run_type: str
    run_type_dir: Path
    skill_name: str
    provider: Provider
    model: str | None
    effort: str | None
    timeout: int
    schema_path: Path
    grader_instructions_path: Path
    run_dir: str | None = None

    def run(self) -> None:
        self.write_run_artifacts_manifest()
        prompt = self.build_prompt()
        grader_output_schema_path = self.write_grader_output_schema()
        command = self.provider.build_grading_command(
            model=self.model,
            effort=self.effort,
            working_dir=str(self.run_type_dir),
            output_schema=str(grader_output_schema_path),
        )
        with self.provider.process_environment(
            os.environ,
            str(self.run_type_dir),
            self.run_type_dir,
        ) as process_env:
            stdout, stderr, returncode, timed_out, _duration_ms = run_with_timeout(
                command,
                prompt,
                str(self.run_type_dir),
                self.timeout,
                env=process_env,
            )

        if timed_out:
            raise TimeoutError(f"Grading eval-{self.eval_id}/{self.run_type} timed out")
        if returncode != 0 and not stdout.strip():
            raise RuntimeError(stderr or f"Grading exited with code {returncode}")

        result = self.provider.parse_output(stdout, prompt)
        grading_data = json.loads(result.response)
        self.validate_grading_data(grading_data)
        add_grading_expectation_ids(
            grading_data,
            eval_id=self.eval_id,
            run_type=self.run_type,
        )
        (self.run_type_dir / "grading.json").write_text(
            json.dumps(grading_data, indent=2),
            encoding="utf-8",
        )

    def write_run_artifacts_manifest(self) -> None:
        (self.run_type_dir / "run_artifacts.json").write_text(
            json.dumps(self.run_result(), indent=2),
            encoding="utf-8",
        )

    def validate_grading_data(self, grading_data: object) -> None:
        schema = json.loads(self.schema_path.read_text(encoding="utf-8"))
        try:
            jsonschema.validate(grading_data, schema)
        except jsonschema.ValidationError as error:
            raise RuntimeError(f"Invalid grading output: {error.message}") from error

    def write_grader_output_schema(self) -> Path:
        schema = json.loads(self.schema_path.read_text(encoding="utf-8"))
        schema["$defs"]["expectation_result"]["properties"].pop("id", None)
        path = self.run_type_dir / "grader_output_schema.json"
        path.write_text(json.dumps(schema, indent=2), encoding="utf-8")
        return path

    @property
    def eval_id(self) -> int:
        return self.eval_def["id"]

    def build_prompt(self) -> str:
        instructions = self.grader_instructions_path.read_text(encoding="utf-8")
        return instructions.replace("{skill_name}", self.skill_name).replace(
            "{run_result_json}",
            json.dumps(self.run_result(), indent=2),
        )

    def run_result(self) -> dict:
        return {
            "skill_name": self.skill_name,
            "eval": self.eval_def,
            "run_type": self.run_type,
            "artifacts": self.artifacts(),
            "schema_path": str(self.schema_path),
        }

    def artifacts(self) -> dict:
        return {
            "results_dir_path": str(self.run_type_dir),
            "working_dir_path": self.run_dir,
            "run_transcript_path": str(self.run_type_dir / "transcript.md"),
            "raw_output_path": str(self.run_type_dir / "raw_output.jsonl"),
            "timing_path": str(self.run_type_dir / "timing.json"),
            "turns": self.turn_artifacts(),
        }

    def turn_artifacts(self) -> list[dict]:
        artifacts = []
        for turn_dir in sorted(self.run_type_dir.glob("turn-*/outputs")):
            artifacts.append(
                {
                    "turn": int(turn_dir.parent.name.removeprefix("turn-")),
                    "response_path": str(turn_dir / "response.md"),
                    "transcript_path": str(turn_dir / "transcript.md"),
                }
            )
        return artifacts

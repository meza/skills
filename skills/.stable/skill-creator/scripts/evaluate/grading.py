"""Grade one completed eval configuration."""

import json
import os
from dataclasses import dataclass
from pathlib import Path

import jsonschema

from .eval_job import run_with_timeout
from .providers import Provider

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GRADER_INSTRUCTIONS_PATH = PROJECT_ROOT / "agents" / "grader.md"
DEFAULT_GRADING_SCHEMA_PATH = PROJECT_ROOT / "schemas" / "grading.schema.json"


def create_grading_job_factory(
    provider: Provider,
    model: str | None,
    effort: str | None,
    timeout: int,
):
    """Create grading jobs for completed eval/config runs."""

    def factory(eval_job) -> "GradingJob":
        return GradingJob(
            eval_def=eval_job.eval_def,
            config=eval_job.config,
            config_dir=eval_job.config_dir,
            provider=provider,
            model=model,
            effort=effort,
            timeout=timeout,
            schema_path=DEFAULT_GRADING_SCHEMA_PATH,
            grader_instructions_path=DEFAULT_GRADER_INSTRUCTIONS_PATH,
        )

    return factory


@dataclass
class GradingJob:
    """Run a schema-constrained grader for one completed eval/config directory."""

    eval_def: dict
    config: str
    config_dir: Path
    provider: Provider
    model: str | None
    effort: str | None
    timeout: int
    schema_path: Path
    grader_instructions_path: Path

    def run(self) -> None:
        prompt = self.build_prompt()
        command = self.provider.build_grading_command(
            model=self.model,
            effort=self.effort,
            working_dir=str(self.config_dir),
            output_schema=str(self.schema_path),
        )
        with self.provider.process_environment(
            os.environ,
            str(self.config_dir),
            self.config_dir,
        ) as process_env:
            stdout, stderr, returncode, timed_out, _duration_ms = run_with_timeout(
                command,
                prompt,
                str(self.config_dir),
                self.timeout,
                env=process_env,
            )

        if timed_out:
            raise TimeoutError(f"Grading eval-{self.eval_id}/{self.config} timed out")
        if returncode != 0 and not stdout.strip():
            raise RuntimeError(stderr or f"Grading exited with code {returncode}")

        result = self.provider.parse_output(stdout, prompt)
        grading_data = json.loads(result.response)
        self.validate_grading_data(grading_data)
        (self.config_dir / "grading.json").write_text(
            json.dumps(grading_data, indent=2),
            encoding="utf-8",
        )

    def validate_grading_data(self, grading_data: object) -> None:
        schema = json.loads(self.schema_path.read_text(encoding="utf-8"))
        try:
            jsonschema.validate(grading_data, schema)
        except jsonschema.ValidationError as error:
            raise RuntimeError(f"Invalid grading output: {error.message}") from error

    @property
    def eval_id(self) -> int:
        return self.eval_def["id"]

    def build_prompt(self) -> str:
        grading_input = json.dumps(
            {
                "eval": self.eval_def,
                "config": self.config,
                "outputs": self.read_outputs(),
            },
            indent=2,
        )
        instructions = self.grader_instructions_path.read_text(encoding="utf-8")
        return f"{instructions}\n\nGrading input:\n{grading_input}"

    def read_outputs(self) -> list[dict]:
        outputs = []
        for turn_dir in sorted(self.config_dir.glob("turn-*/outputs")):
            outputs.append(
                {
                    "turn": turn_dir.parent.name,
                    "response": (turn_dir / "response.md").read_text(encoding="utf-8"),
                    "transcript": (turn_dir / "transcript.md").read_text(
                        encoding="utf-8"
                    ),
                }
            )
        return outputs

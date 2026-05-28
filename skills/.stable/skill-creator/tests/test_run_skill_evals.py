import contextlib
import io
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate import (
    eval_definitions,
    eval_job,
    eval_run_paths,
    eval_runner,
    run_layout,
)
from scripts.evaluate import run_skill_evals
from scripts.evaluate.eval_job import (
    _build_git_process_env,
    build_prompt,
    run_with_timeout,
)
from scripts.evaluate.eval_runner import (
    EvalJobSpec,
    EvalRun,
    EvalRunOptions,
)
from scripts.evaluate.prepare_fixture import PreparedEval, PreparedRun
from scripts.evaluate.providers import TurnResult
from scripts.evaluate.providers.claude import (
    ClaudeProvider,
)
from scripts.evaluate.providers.codex import (
    CodexProvider,
    _extract_response as extract_codex_response,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def timed_process_result(
    stdout: str = "",
    stderr: str = "",
    returncode: int = 0,
    timed_out: bool = False,
    duration_ms: int = 100,
) -> eval_job.TimedProcessResult:
    return eval_job.TimedProcessResult(
        stdout=stdout,
        stderr=stderr,
        returncode=returncode,
        timed_out=timed_out,
        duration_ms=duration_ms,
    )


class FakeProvider:
    skill_root = ".fake"
    requires_first_turn_session_id = False

    def __init__(self):
        self.commands = []
        self.prompts = []

    def build_command(
        self,
        session_id,
        session_name,
        turn_index,
        model,
        effort=None,
        working_dir=None,
    ):
        command = ["fake-provider", session_name, str(turn_index)]
        self.commands.append(
            {
                "session_id": session_id,
                "session_name": session_name,
                "turn_index": turn_index,
                "model": model,
                "effort": effort,
                "working_dir": working_dir,
                "command": command,
            }
        )
        return command

    def parse_output(self, stdout, prompt):
        self.prompts.append(prompt)
        return TurnResult(
            response=f"response for {stdout}",
            transcript=f"transcript for {stdout}",
            events=[{"event": stdout}],
            session_id=f"session-{stdout}",
            duration_ms=123,
            input_tokens=10,
            output_tokens=5,
            cost_usd=0.25,
        )


class FirstTurnSessionProvider(FakeProvider):
    requires_first_turn_session_id = True

    def parse_output(self, stdout, prompt):
        self.prompts.append(prompt)
        return TurnResult(
            response="response",
            transcript="transcript",
            events=[{"event": "completed"}],
            session_id=None,
            duration_ms=123,
        )


class EnvironmentProvider(FakeProvider):
    def process_environment(self, base_env, run_dir, artifact_dir):
        self.environment_args = {
            "base_env": base_env,
            "run_dir": run_dir,
            "artifact_dir": artifact_dir,
        }
        return contextlib.nullcontext({**base_env, "PROVIDER_ENV": "present"})


class RunSkillEvalsContractTests(unittest.TestCase):
    def _write_skill(self, root: Path, evals_data: dict) -> Path:
        skill_path = root / "fake-skill"
        skill_path.mkdir()
        (skill_path / "SKILL.md").write_text("# Fake Skill\n", encoding="utf-8")
        evals_dir = skill_path / "evals"
        evals_dir.mkdir()
        (evals_dir / "evals.json").write_text(
            json.dumps(evals_data, indent=2),
            encoding="utf-8",
        )
        return skill_path

    def _write_prepared_run_root(
        self, root: Path, skill_name: str = "fake-skill"
    ) -> Path:
        run_root = root / "prepared"
        for config in ("skill", "baseline"):
            run_dir = run_root / "eval-1" / config
            run_dir.mkdir(parents=True)
            if config == "skill":
                skill_dir = run_dir / ".fake" / "skills" / skill_name
                skill_dir.mkdir(parents=True)
                (skill_dir / "SKILL.md").write_text("# Fake Skill\n", encoding="utf-8")
        return run_root

    def _prepared_run(
        self,
        skill_path: Path,
        run_root: Path,
        provider: str = "fake",
        skill_name: str = "fake-skill",
    ) -> PreparedRun:
        return PreparedRun(
            eval_definitions_path=skill_path / "evals" / "evals.json",
            run_root=run_root,
            provider=provider,
            skill_name=skill_name,
            evals=[
                PreparedEval(
                    eval_id=1,
                    eval_name="basic",
                    skill_run_path=run_root / "eval-1" / "skill",
                    baseline_run_path=run_root / "eval-1" / "baseline",
                    skill_file=run_root
                    / "eval-1"
                    / "skill"
                    / ".fake"
                    / "skills"
                    / skill_name
                    / "SKILL.md",
                    skill_fixture_path=None,
                    baseline_fixture_path=None,
                )
            ],
        )

    def _args(
        self,
        skip_baseline: bool = False,
    ) -> run_skill_evals.SkillEvalRunOptions:
        return run_skill_evals.SkillEvalRunOptions(
            skip_baseline=skip_baseline,
            model=None,
            effort=None,
        )

    def test_process_exiting_eval_helpers_have_explicit_names(self):
        self.assertTrue(hasattr(eval_definitions, "load_evals_data_or_exit"))
        self.assertTrue(hasattr(eval_definitions, "select_evals_or_exit"))
        self.assertTrue(hasattr(eval_run_paths, "build_run_paths_or_exit"))

    def _execute_with_fake_provider(
        self,
        prepared_run: PreparedRun,
        options: run_skill_evals.SkillEvalRunOptions,
        provider: FakeProvider,
        run_results,
    ) -> dict:
        class NoOpGradingJob:
            def run(self):
                pass

        with (
            mock.patch.object(
                run_skill_evals, "get_provider_or_exit", return_value=provider
            ),
            mock.patch.object(
                run_skill_evals,
                "create_grading_job_factory",
                return_value=lambda _job: NoOpGradingJob(),
            ),
            mock.patch.object(eval_job, "run_with_timeout", side_effect=run_results),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            return run_skill_evals.SkillEvalRunner(prepared_run, options).run()

    def test_execute_writes_run_artifacts_for_both_run_types(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                {
                    "skill_name": "fake-skill",
                    "evals": [
                        {
                            "id": 1,
                            "eval_name": "basic",
                            "turns": [{"prompt": "Do the task", "expectations": []}],
                        }
                    ],
                },
            )
            run_root = self._write_prepared_run_root(temp_path)
            prepared_run = self._prepared_run(skill_path, run_root)
            provider = FakeProvider()

            manifest = self._execute_with_fake_provider(
                prepared_run,
                self._args(),
                provider,
                self._fake_output_for_command,
            )

            iteration_dir = run_root / "results" / "iteration-1"
            self.assertEqual(manifest["skill_name"], "fake-skill")
            self.assertEqual(manifest["provider"], "fake")
            self.assertEqual(len(manifest["runs"]), 2)
            self.assertEqual({run["status"] for run in manifest["runs"]}, {"success"})

            metadata = json.loads(
                (iteration_dir / "eval-1" / "eval_metadata.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(metadata["eval_id"], 1)
            self.assertEqual(metadata["eval_name"], "basic")

            for config, stdout in (
                ("skill", "with-skill-output"),
                ("baseline", "without-skill-output"),
            ):
                run_type_dir = iteration_dir / "eval-1" / config
                self.assertEqual(
                    (run_type_dir / "turn-1" / "outputs" / "response.md").read_text(
                        encoding="utf-8"
                    ),
                    f"response for {stdout}",
                )
                self.assertEqual(
                    (run_type_dir / "turn-1" / "outputs" / "transcript.md").read_text(
                        encoding="utf-8"
                    ),
                    f"transcript for {stdout}",
                )
                self.assertEqual(
                    json.loads(
                        (run_type_dir / "timing.json").read_text(encoding="utf-8")
                    )["total_tokens"],
                    15,
                )
                self.assertEqual(
                    json.loads(
                        (run_type_dir / "raw_output.jsonl").read_text(encoding="utf-8")
                    ),
                    {"event": stdout},
                )
                self.assertEqual(
                    (run_type_dir / "transcript.md").read_text(encoding="utf-8"),
                    f"transcript for {stdout}",
                )

            progress = json.loads(
                (iteration_dir / "progress.json").read_text(encoding="utf-8")
            )
            self.assertEqual(progress["total"], 2)
            self.assertEqual(progress["completed"], 2)
            self.assertEqual(progress["succeeded"], 2)

            written_manifest = json.loads(
                (iteration_dir / "run_manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(written_manifest["runs"], manifest["runs"])
            self.assertEqual(provider.prompts, ["Do the task", "Do the task"])

    def _fake_output_for_command(self, cmd, *_args, **_kwargs):
        stdout_by_session = {
            "eval-1-skill": "with-skill-output",
            "eval-1-baseline": "without-skill-output",
        }
        return timed_process_result(stdout=stdout_by_session[cmd[1]])

    def test_eval_job_uses_provider_process_environment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                {
                    "skill_name": "fake-skill",
                    "evals": [
                        {
                            "id": 1,
                            "eval_name": "basic",
                            "turns": [{"prompt": "Do the task", "expectations": []}],
                        }
                    ],
                },
            )
            run_root = self._write_prepared_run_root(temp_path)
            prepared_run = self._prepared_run(skill_path, run_root)
            provider = EnvironmentProvider()
            observed_env = {}

            def run_with_observed_env(*args, **kwargs):
                del args
                observed_env.update(kwargs["env"])
                return "stdout", "", 0, False, 50

            with (
                mock.patch.object(
                    run_skill_evals, "get_provider_or_exit", return_value=provider
                ),
                mock.patch.object(
                    eval_job,
                    "run_with_timeout",
                    side_effect=run_with_observed_env,
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                run_skill_evals.SkillEvalRunner(
                    prepared_run,
                    self._args(skip_baseline=True),
                ).run()

            self.assertEqual(observed_env["PROVIDER_ENV"], "present")
            self.assertEqual(
                provider.environment_args["run_dir"],
                str(run_root / "eval-1" / "skill"),
            )
            self.assertEqual(
                provider.environment_args["artifact_dir"],
                (run_root / "results" / "iteration-1" / "eval-1" / "skill"),
            )

    def test_eval_job_invokes_grading_after_writing_run_artifacts(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            iteration_dir = temp_path / "iteration"
            run_dir = temp_path / "run"
            run_dir.mkdir()
            graded_paths = []

            def grading_job_factory(job):
                class FakeGradingJob:
                    def run(self):
                        run_type_dir = job.run_type_dir
                        assert (run_type_dir / "timing.json").exists()
                        assert (run_type_dir / "raw_output.jsonl").exists()
                        graded_paths.append(run_type_dir)

                return FakeGradingJob()

            job = eval_job.EvalJob(
                eval_def={
                    "id": 1,
                    "eval_name": "basic",
                    "turns": [{"prompt": "Do the task", "expectations": []}],
                },
                run_type="skill",
                run_dir=str(run_dir),
                fixture_path=None,
                iteration_dir=iteration_dir,
                provider=FakeProvider(),
                model=None,
                effort=None,
                timeout=30,
                grading_job_factory=grading_job_factory,
            )

            with mock.patch.object(
                eval_job,
                "run_with_timeout",
                return_value=timed_process_result(stdout="stdout", duration_ms=50),
            ):
                job.run()

            self.assertEqual(
                graded_paths,
                [iteration_dir / "eval-1" / "skill"],
            )

    def test_run_artifact_writer_serializes_job_outputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_type_dir = Path(temp_dir) / "iteration" / "eval-1" / "skill"
            first_turn = run_type_dir / "turn-1" / "outputs"
            second_turn = run_type_dir / "turn-2" / "outputs"
            first_turn.mkdir(parents=True)
            second_turn.mkdir(parents=True)
            (first_turn / "transcript.md").write_text("first", encoding="utf-8")
            (second_turn / "transcript.md").write_text("second", encoding="utf-8")

            eval_job.RunArtifactWriter(
                run_type_dir=run_type_dir,
                timing={
                    "total_tokens": 3,
                    "input_tokens": 1,
                    "output_tokens": 2,
                    "duration_ms": 400,
                    "total_duration_seconds": 0.4,
                    "cost_usd": 0.01,
                },
                events=[{"event": "one"}, {"event": "two"}],
            ).write()

            self.assertEqual(
                (run_type_dir / "transcript.md").read_text(encoding="utf-8"),
                "first\n\nsecond",
            )
            self.assertEqual(
                json.loads((run_type_dir / "timing.json").read_text(encoding="utf-8")),
                {
                    "total_tokens": 3,
                    "input_tokens": 1,
                    "output_tokens": 2,
                    "duration_ms": 400,
                    "total_duration_seconds": 0.4,
                    "cost_usd": 0.01,
                },
            )
            self.assertEqual(
                (run_type_dir / "raw_output.jsonl").read_text(encoding="utf-8"),
                '{"event": "one"}\n{"event": "two"}',
            )

    def test_eval_job_run_summary_owns_manifest_shape(self):
        self.assertEqual(
            eval_job.RunSummary(
                eval_id=1,
                eval_name="basic",
                run_type="skill",
                session_id="session-1",
                status="success",
                duration_ms=25,
                total_tokens=7,
                cost_usd=0.1234567,
            ).to_dict(),
            {
                "eval_id": 1,
                "eval_name": "basic",
                "run_type": "skill",
                "session_id": "session-1",
                "status": "success",
                "duration_ms": 25,
                "total_tokens": 7,
                "cost_usd": 0.123457,
            },
        )
        self.assertEqual(
            eval_job.RunSummary(
                eval_id=1,
                eval_name="basic",
                run_type="skill",
                session_id="session-1",
                status="error",
                duration_ms=0,
                total_tokens=0,
                cost_usd=0,
                error="failed",
            ).to_dict()["error"],
            "failed",
        )

    def test_execute_resumes_multi_turn_runs_with_provider_session_id(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                {
                    "skill_name": "fake-skill",
                    "evals": [
                        {
                            "id": 1,
                            "eval_name": "multi-turn",
                            "turns": [
                                {"prompt": "First turn", "expectations": []},
                                {"prompt": "Second turn", "expectations": []},
                            ],
                        }
                    ],
                },
            )
            run_root = self._write_prepared_run_root(temp_path)
            prepared_run = self._prepared_run(skill_path, run_root)
            provider = FakeProvider()

            self._execute_with_fake_provider(
                prepared_run,
                self._args(skip_baseline=True),
                provider,
                [
                    timed_process_result(stdout="turn-one"),
                    timed_process_result(stdout="turn-two"),
                ],
            )

            self.assertEqual(len(provider.commands), 2)
            self.assertEqual(provider.commands[0]["turn_index"], 0)
            self.assertEqual(provider.commands[1]["turn_index"], 1)
            self.assertEqual(provider.commands[1]["session_id"], "session-turn-one")

            run_type_dir = run_root / "results" / "iteration-1" / "eval-1" / "skill"
            self.assertTrue(
                (run_type_dir / "turn-1" / "outputs" / "response.md").exists()
            )
            self.assertTrue(
                (run_type_dir / "turn-2" / "outputs" / "response.md").exists()
            )

    def test_execute_records_timeout_artifacts_without_invoking_real_provider_cli(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                {
                    "skill_name": "fake-skill",
                    "evals": [
                        {
                            "id": 1,
                            "eval_name": "timeout",
                            "turns": [{"prompt": "Slow task", "expectations": []}],
                        }
                    ],
                },
            )
            run_root = self._write_prepared_run_root(temp_path)
            prepared_run = self._prepared_run(skill_path, run_root)
            provider = FakeProvider()

            manifest = self._execute_with_fake_provider(
                prepared_run,
                self._args(skip_baseline=True),
                provider,
                [
                    timed_process_result(
                        stdout="partial-output",
                        timed_out=True,
                        duration_ms=600000,
                    )
                ],
            )

            run = manifest["runs"][0]
            self.assertEqual(run["status"], "timeout")
            self.assertEqual(run["error"], "Turn 1/1 timed out after 600s")

            run_type_dir = run_root / "results" / "iteration-1" / "eval-1" / "skill"
            self.assertEqual(
                (run_type_dir / "turn-1" / "outputs" / "response.md").read_text(
                    encoding="utf-8"
                ),
                "response for partial-output",
            )
            self.assertEqual(
                json.loads(
                    (run_type_dir / "raw_output.jsonl").read_text(encoding="utf-8")
                ),
                {"event": "partial-output"},
            )

    def test_runner_options_control_parallelism_and_timeout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                {
                    "skill_name": "fake-skill",
                    "evals": [{"id": 1, "turns": []}],
                },
            )
            run_root = self._write_prepared_run_root(temp_path)
            prepared_run = self._prepared_run(skill_path, run_root)
            provider = FakeProvider()

            with (
                mock.patch.object(
                    run_skill_evals, "get_provider_or_exit", return_value=provider
                ),
                mock.patch.object(
                    run_skill_evals,
                    "create_grading_job_factory",
                    return_value="grading-factory",
                ) as create_grading_job_factory,
                mock.patch.object(run_skill_evals, "EvalRun") as eval_run,
            ):
                run_skill_evals.SkillEvalRunner(
                    prepared_run,
                    run_skill_evals.SkillEvalRunOptions(
                        max_parallel=12,
                        timeout=900,
                    ),
                ).run()

            options = eval_run.call_args.args[0]
            self.assertEqual(options.max_parallel, 12)
            self.assertEqual(options.timeout, 900)
            self.assertEqual(options.grading_job_factory, "grading-factory")
            create_grading_job_factory.assert_called_once_with(
                provider=provider,
                skill_name="fake-skill",
                model=None,
                effort=None,
                timeout=900,
            )

    def test_runner_uses_next_results_iteration_for_stable_run_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                {
                    "skill_name": "fake-skill",
                    "evals": [{"id": 1, "turns": []}],
                },
            )
            run_root = self._write_prepared_run_root(temp_path)
            (run_root / "results" / "iteration-1").mkdir(parents=True)
            (run_root / "results" / "iteration-2").mkdir(parents=True)
            prepared_run = self._prepared_run(skill_path, run_root)
            provider = FakeProvider()

            with (
                mock.patch.object(
                    run_skill_evals, "get_provider_or_exit", return_value=provider
                ),
                mock.patch.object(
                    run_skill_evals,
                    "create_grading_job_factory",
                    return_value="grading-factory",
                ),
                mock.patch.object(run_skill_evals, "EvalRun") as eval_run,
            ):
                run_skill_evals.SkillEvalRunner(
                    prepared_run,
                    run_skill_evals.SkillEvalRunOptions(),
                ).run()

            options = eval_run.call_args.args[0]
            self.assertEqual(options.iteration, 3)

    def test_next_iteration_ignores_non_iteration_entries(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            results_dir = Path(temp_dir) / "results"
            results_dir.mkdir()
            (results_dir / "progress.json").write_text("{}", encoding="utf-8")
            (results_dir / "iteration-old").mkdir()

            self.assertEqual(run_skill_evals.next_iteration(results_dir), 1)
            self.assertFalse(
                run_skill_evals.is_iteration_dir(results_dir / "progress.json")
            )
            self.assertFalse(
                run_skill_evals.is_iteration_dir(results_dir / "iteration-old")
            )

    def test_run_skill_evals_delegates_to_runner(self):
        prepared_run = PreparedRun(
            eval_definitions_path=Path("F:/skills/sample/evals/evals.json"),
            run_root=Path("F:/runs/prepared"),
            provider="codex",
            skill_name="sample",
            evals=[],
        )
        options = run_skill_evals.SkillEvalRunOptions(max_parallel=10, timeout=600)
        expected_manifest = {"runs": []}

        with mock.patch.object(
            run_skill_evals.SkillEvalRunner,
            "run",
            return_value=expected_manifest,
        ) as run:
            manifest = run_skill_evals.run_skill_evals(prepared_run, options)

        self.assertEqual(manifest, expected_manifest)
        run.assert_called_once_with()


class EvalLibTests(unittest.TestCase):
    def _job(
        self,
        iteration_dir: Path,
        provider: FakeProvider | None = None,
        eval_def: dict | None = None,
        deadline: float | None = None,
    ) -> eval_job.EvalJob:
        return eval_job.EvalJob(
            eval_def=eval_def
            or {
                "id": 1,
                "eval_name": "unit",
                "turns": [{"prompt": "Do it", "expectations": []}],
            },
            run_type="skill",
            run_dir=str(iteration_dir / "run"),
            fixture_path=None,
            iteration_dir=iteration_dir,
            provider=provider or FakeProvider(),
            model="fake-model",
            effort="high",
            timeout=30,
            deadline=deadline,
        )

    def test_build_prompt_handles_fixture_path_variants(self):
        self.assertEqual(
            build_prompt(
                "Open {{FIXTURE_PATH}}.",
                {"turns": [{"prompt": "Open {{FIXTURE_PATH}}."}]},
                "F:/fixture",
            ),
            "Open F:/fixture.",
        )
        self.assertEqual(
            build_prompt(
                "Open the project.",
                {
                    "fixture_in_workdir": False,
                    "turns": [{"prompt": "Open the project."}],
                },
                "F:/fixture",
            ),
            "Open the project.",
        )
        self.assertEqual(
            build_prompt("Open the project.", {"turns": []}, "F:/fixture"),
            "The codebase is at F:/fixture.\n\nOpen the project.",
        )

    def test_git_config_candidates_and_missing_global_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            missing_home = temp_path / "missing-home"
            xdg_home = temp_path / "xdg"
            user_profile = temp_path / "profile"
            explicit_config = temp_path / "explicit.gitconfig"
            xdg_config = xdg_home / "git" / "config"
            user_config = user_profile / ".gitconfig"

            xdg_config.parent.mkdir(parents=True)
            xdg_config.write_text("[user]\n\tname = XDG\n", encoding="utf-8")
            user_profile.mkdir()
            user_config.write_text("[user]\n\tname = Profile\n", encoding="utf-8")

            candidates = eval_job._git_global_config_candidates(
                {
                    "GIT_CONFIG_GLOBAL": str(explicit_config),
                    "XDG_CONFIG_HOME": str(xdg_home),
                    "HOME": str(missing_home),
                    "USERPROFILE": str(user_profile),
                }
            )

            self.assertEqual(
                candidates,
                [
                    explicit_config,
                    xdg_config,
                    missing_home / ".gitconfig",
                    user_config,
                ],
            )
            self.assertEqual(
                eval_job._resolve_existing_git_global_config(
                    {
                        "GIT_CONFIG_GLOBAL": str(explicit_config),
                        "XDG_CONFIG_HOME": str(xdg_home),
                    }
                ),
                xdg_config.resolve(),
            )
            self.assertIsNone(
                eval_job._resolve_existing_git_global_config(
                    {"HOME": str(missing_home)}
                )
            )

    def test_process_tree_helpers_handle_windows_and_unix_failures(self):
        with (
            mock.patch.object(eval_job, "_IS_WINDOWS", True),
            mock.patch.object(eval_job.subprocess, "run", side_effect=OSError),
        ):
            eval_job._kill_process_tree(123)
            eval_job._force_kill_process_tree(123)

        with (
            mock.patch.object(eval_job, "_IS_WINDOWS", False),
            mock.patch.object(eval_job.os, "getpgid", return_value=456, create=True),
            mock.patch.object(eval_job.os, "killpg", side_effect=OSError, create=True),
            mock.patch.object(eval_job.signal, "SIGKILL", 9, create=True),
        ):
            eval_job._kill_process_tree(123)
            eval_job._force_kill_process_tree(123)

    def test_run_with_timeout_handles_non_windows_process_errors(self):
        class BrokenProcess:
            pid = 123
            returncode = None

            def communicate(self, input=None):
                raise RuntimeError("broken pipe")

            def kill(self):
                raise OSError

            def wait(self):
                self.returncode = -9

        with (
            mock.patch.object(eval_job, "_IS_WINDOWS", False),
            mock.patch.object(
                eval_job.subprocess, "Popen", return_value=BrokenProcess()
            ) as popen,
            mock.patch.object(eval_job.threading, "Timer") as timer,
            mock.patch.object(eval_job, "_kill_process_tree") as kill_process_tree,
        ):
            timer.return_value = mock.Mock()
            result = run_with_timeout(
                ["fake"],
                "prompt",
                "F:/tmp",
                5,
            )

        self.assertEqual(result.stdout, "")
        self.assertIn("Provider communication failed: broken pipe", result.stderr)
        self.assertEqual(result.returncode, -9)
        self.assertFalse(result.timed_out)
        self.assertGreaterEqual(result.duration_ms, 0)
        self.assertTrue(popen.call_args.kwargs["start_new_session"])
        kill_process_tree.assert_called_once_with(123)

    def test_run_with_timeout_returns_named_process_result(self):
        class CompletedProcess:
            pid = 123
            returncode = 0

            def communicate(self, input=None):
                return "stdout", "stderr"

        with (
            mock.patch.object(eval_job, "_IS_WINDOWS", False),
            mock.patch.object(
                eval_job.subprocess, "Popen", return_value=CompletedProcess()
            ),
            mock.patch.object(eval_job.threading, "Timer") as timer,
        ):
            timer.return_value = mock.Mock()
            result = run_with_timeout(["fake"], "prompt", "F:/tmp", 5)

        self.assertIsInstance(result, eval_job.TimedProcessResult)
        self.assertEqual(result.stdout, "stdout")
        self.assertEqual(result.stderr, "stderr")
        self.assertEqual(result.returncode, 0)
        self.assertFalse(result.timed_out)
        self.assertGreaterEqual(result.duration_ms, 0)

    def test_run_with_timeout_marks_timeout_when_timer_fires(self):
        class SlowProcess:
            pid = 123
            returncode = 0

            def communicate(self, input=None):
                return "stdout", "stderr"

        def timer_factory(interval, function, args=None):
            timer = mock.Mock()
            if function.__name__ == "kill_on_timeout":
                timer.start.side_effect = function
            return timer

        with (
            mock.patch.object(eval_job, "_IS_WINDOWS", True),
            mock.patch.object(eval_job.subprocess, "Popen", return_value=SlowProcess()),
            mock.patch.object(eval_job.threading, "Timer", side_effect=timer_factory),
            mock.patch.object(eval_job, "_kill_process_tree") as kill_process_tree,
        ):
            result = run_with_timeout(
                ["fake"],
                "prompt",
                "F:/tmp",
                5,
            )

        self.assertEqual(
            (result.stdout, result.stderr, result.returncode), ("stdout", "stderr", 0)
        )
        self.assertTrue(result.timed_out)
        kill_process_tree.assert_called_once_with(123)

    def test_eval_job_skips_when_deadline_already_passed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir), deadline=time.time() - 1)

            with contextlib.redirect_stdout(io.StringIO()):
                summary = job.run()

        self.assertEqual(summary["status"], "skipped")
        self.assertEqual(summary["error"], "Total timeout exceeded before job started")

    def test_eval_job_handles_deadline_expiring_before_a_turn(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir), deadline=time.time() - 1)

            with contextlib.redirect_stdout(io.StringIO()):
                job.run_turns({})

            self.assertEqual(job.status, "timeout")
            self.assertEqual(
                job.error_message,
                "Total timeout exceeded before turn 1/1",
            )

    def test_eval_job_effective_timeout_caps_remaining_deadline(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir), deadline=time.time() + 30)

            self.assertEqual(job.effective_timeout(10, 0), 10)
            self.assertLess(job.effective_timeout(100, 0), 100)

    def test_eval_job_uses_wall_clock_duration_when_provider_duration_is_missing(self):
        class NoDurationProvider(FakeProvider):
            def parse_output(self, stdout, prompt):
                return TurnResult(
                    response="response",
                    transcript="transcript",
                    events=[{"event": "completed"}],
                    session_id="session",
                    duration_ms=0,
                    input_tokens=1,
                    output_tokens=2,
                    cost_usd=0.0,
                )

        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir), provider=NoDurationProvider())

            with mock.patch.object(
                job,
                "invoke_provider",
                return_value=timed_process_result(stdout="stdout", duration_ms=987),
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertTrue(job.run_turn(0, job.turns[0], 30, {}))

        self.assertEqual(job.duration_ms, 987)

    def test_eval_job_records_process_error_without_stdout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir))

            with mock.patch.object(
                job,
                "invoke_provider",
                return_value=timed_process_result(
                    stderr="provider failed badly",
                    returncode=17,
                    duration_ms=10,
                ),
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertFalse(job.run_turn(0, job.turns[0], 30, {}))

            self.assertEqual(job.status, "error")
            self.assertEqual(job.error_message, "provider failed badly")

    def test_eval_job_records_process_error_without_stderr(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir))

            with mock.patch.object(
                job,
                "invoke_provider",
                return_value=timed_process_result(returncode=17, duration_ms=10),
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertFalse(job.run_turn(0, job.turns[0], 30, {}))

            self.assertEqual(job.status, "error")
            self.assertEqual(job.error_message, "Exit code 17")

    def test_eval_job_records_process_error_even_with_stdout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir))

            with mock.patch.object(
                job,
                "invoke_provider",
                return_value=timed_process_result(
                    stdout="partial provider output",
                    stderr="provider failed badly",
                    returncode=17,
                    duration_ms=10,
                ),
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertFalse(job.run_turn(0, job.turns[0], 30, {}))

            self.assertEqual(job.status, "error")
            self.assertEqual(job.error_message, "provider failed badly")

    def test_eval_job_records_unparseable_provider_output_as_error(self):
        class EmptyEventsProvider(FakeProvider):
            def parse_output(self, stdout, prompt):
                self.prompts.append(prompt)
                return TurnResult(
                    response="",
                    transcript="[USER INPUT]\nprompt",
                    events=[],
                )

        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir), provider=EmptyEventsProvider())

            with mock.patch.object(
                job,
                "invoke_provider",
                return_value=timed_process_result(
                    stdout="not json",
                    returncode=0,
                    duration_ms=10,
                ),
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertFalse(job.run_turn(0, job.turns[0], 30, {}))

            self.assertEqual(job.status, "error")
            self.assertEqual(
                job.error_message,
                "Provider output did not contain parseable events",
            )

    def test_eval_job_requires_first_turn_session_id_for_multi_turn_provider(self):
        eval_def = {
            "id": 1,
            "eval_name": "unit",
            "turns": [
                {"prompt": "First", "expectations": []},
                {"prompt": "Second", "expectations": []},
            ],
        }
        provider = FirstTurnSessionProvider()

        with tempfile.TemporaryDirectory() as temp_dir:
            job = self._job(Path(temp_dir), provider=provider, eval_def=eval_def)

            with mock.patch.object(
                job,
                "invoke_provider",
                return_value=timed_process_result(stdout="{}", duration_ms=10),
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertFalse(job.run_turn(0, job.turns[0], 30, {}))

            self.assertEqual(job.status, "error")
            self.assertEqual(
                job.error_message,
                "Provider did not return a session id for multi-turn resume",
            )

    def test_eval_job_unlinks_temporary_git_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            config_path = temp_path / "temp.gitconfig"
            config_path.write_text("[safe]\n", encoding="utf-8")
            job = self._job(
                temp_path,
                eval_def={"id": 1, "eval_name": "unit", "turns": []},
            )

            with mock.patch.object(
                eval_job,
                "_build_git_process_env",
                return_value=({}, config_path),
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    job.run()

            self.assertFalse(config_path.exists())

    def test_run_layout_owns_run_types_and_skill_file_path(self):
        self.assertEqual(run_layout.RUN_TYPES, ("skill", "baseline"))
        self.assertEqual(
            run_layout.skill_directory_path(
                Path("run/eval-1/skill"),
                ".codex",
                "demo-skill",
            ),
            Path("run/eval-1/skill/.codex/skills/demo-skill"),
        )
        self.assertEqual(
            run_layout.skill_file_path(
                Path("run/eval-1/skill"),
                ".codex",
                "demo-skill",
            ),
            Path("run/eval-1/skill/.codex/skills/demo-skill/SKILL.md"),
        )

    def test_run_layout_owns_prepared_run_type_entry_shape(self):
        self.assertEqual(
            run_layout.PreparedRunTypeEntry(
                run_dir=Path("run/eval-1/skill"),
                fixture_path=Path("run/eval-1/skill/project"),
                skill_file=Path("run/eval-1/skill/.codex/skills/demo/SKILL.md"),
            ).to_dict(),
            {
                "path": str(Path("run/eval-1/skill")),
                "fixture_path": str(Path("run/eval-1/skill/project")),
                "skill_file": str(Path("run/eval-1/skill/.codex/skills/demo/SKILL.md")),
            },
        )
        self.assertEqual(
            run_layout.PreparedRunTypeEntry(
                run_dir=Path("run/eval-1/baseline")
            ).to_dict(),
            {"path": str(Path("run/eval-1/baseline"))},
        )

    def test_eval_run_paths_resolves_external_fixtures(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            eval_dir = temp_path / "eval-1"
            provider = FakeProvider()
            for config in eval_run_paths.RUN_TYPES:
                (eval_dir / config).mkdir(parents=True)
                (eval_dir / f"{config}_fixtures").mkdir()
                (eval_dir / f"{config}_fixtures" / "fixture").mkdir()

            skill_dir = (
                eval_dir / "skill" / provider.skill_root / "skills" / "fake-skill"
            )
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").write_text("# Skill\n", encoding="utf-8")

            paths = eval_run_paths.build_run_paths_or_exit(
                temp_path,
                provider,
                [
                    {
                        "id": 1,
                        "fixture": "fixture",
                        "fixture_in_workdir": False,
                    }
                ],
                "fake-skill",
            )

            self.assertEqual(
                paths["1"]["baseline"]["fixture_path"],
                str(eval_dir / "baseline_fixtures" / "fixture"),
            )
            self.assertEqual(
                paths["1"]["skill"]["skill_file"],
                str(skill_dir / "SKILL.md"),
            )

    def test_eval_run_paths_exits_for_missing_paths(self):
        provider = FakeProvider()

        with tempfile.TemporaryDirectory() as temp_dir:
            missing_root = Path(temp_dir) / "missing"
            with (
                contextlib.redirect_stderr(io.StringIO()) as stderr,
                self.assertRaises(SystemExit) as raised,
            ):
                eval_run_paths.build_run_paths_or_exit(
                    missing_root, provider, [], "fake-skill"
                )

            self.assertEqual(raised.exception.code, 1)
            self.assertIn("prepared run root", stderr.getvalue())

        with tempfile.TemporaryDirectory() as temp_dir:
            with (
                contextlib.redirect_stderr(io.StringIO()) as stderr,
                self.assertRaises(SystemExit) as raised,
            ):
                eval_run_paths.build_run_paths_or_exit(
                    Path(temp_dir),
                    provider,
                    [{"id": 1}],
                    "fake-skill",
                )

            self.assertEqual(raised.exception.code, 1)
            self.assertIn("prepared eval directory", stderr.getvalue())

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            (temp_path / "eval-1").mkdir()

            with (
                contextlib.redirect_stderr(io.StringIO()) as stderr,
                self.assertRaises(SystemExit) as raised,
            ):
                eval_run_paths.build_run_paths_or_exit(
                    temp_path,
                    provider,
                    [{"id": 1}],
                    "fake-skill",
                )

            self.assertEqual(raised.exception.code, 1)
            self.assertIn("prepared run directory", stderr.getvalue())

    def test_eval_run_paths_exits_for_missing_fixture_and_skill_file(self):
        provider = FakeProvider()

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            eval_dir = temp_path / "eval-1"
            for config in eval_run_paths.RUN_TYPES:
                (eval_dir / config).mkdir(parents=True)

            with (
                contextlib.redirect_stderr(io.StringIO()) as stderr,
                self.assertRaises(SystemExit) as raised,
            ):
                eval_run_paths.build_run_paths_or_exit(
                    temp_path,
                    provider,
                    [{"id": 1, "fixture": "fixture"}],
                    "fake-skill",
                )

            self.assertEqual(raised.exception.code, 1)
            self.assertIn("fixture 'fixture'", stderr.getvalue())

            for config in eval_run_paths.RUN_TYPES:
                (eval_dir / config / "fixture").mkdir()

            with (
                contextlib.redirect_stderr(io.StringIO()) as stderr,
                self.assertRaises(SystemExit) as raised,
            ):
                eval_run_paths.build_run_paths_or_exit(
                    temp_path,
                    provider,
                    [{"id": 1, "fixture": "fixture"}],
                    "fake-skill",
                )

            self.assertEqual(raised.exception.code, 1)
            self.assertIn("skill file not found", stderr.getvalue())

    def test_eval_definitions_selects_run_types_and_rejects_missing_or_empty_evals(
        self,
    ):
        self.assertEqual(
            eval_definitions.selected_run_types(False), ["skill", "baseline"]
        )
        self.assertEqual(eval_definitions.selected_run_types(True), ["skill"])
        with mock.patch.object(
            eval_definitions,
            "SKILL_RUN_TYPE",
            "custom-skill",
            create=True,
        ):
            self.assertEqual(
                eval_definitions.selected_run_types(True),
                ["custom-skill"],
            )

        with tempfile.TemporaryDirectory() as temp_dir:
            missing_evals_json = (
                Path(temp_dir) / "missing-skill" / "evals" / "evals.json"
            )
            with (
                contextlib.redirect_stderr(io.StringIO()) as stderr,
                self.assertRaises(SystemExit) as raised,
            ):
                eval_definitions.load_evals_data_or_exit(missing_evals_json)

            self.assertEqual(raised.exception.code, 1)
            self.assertIn("evals.json not found", stderr.getvalue())

        with tempfile.TemporaryDirectory() as temp_dir:
            skill_path = Path(temp_dir) / "skill"
            evals_dir = skill_path / "evals"
            evals_dir.mkdir(parents=True)
            (evals_dir / "evals.json").write_text(
                json.dumps({"evals": []}),
                encoding="utf-8",
            )

            with (
                contextlib.redirect_stderr(io.StringIO()) as stderr,
                self.assertRaises(SystemExit) as raised,
            ):
                eval_definitions.load_evals_data_or_exit(evals_dir / "evals.json")

            self.assertEqual(raised.exception.code, 1)
            self.assertIn("no evals found", stderr.getvalue())

    def test_eval_definitions_select_evals_warns_and_rejects_empty_selection(self):
        evals_list = [{"id": 1}, {"id": 2}]

        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            self.assertEqual(
                eval_definitions.select_evals_or_exit(evals_list, "1,3"),
                [{"id": 1}],
            )

        self.assertIn("eval IDs not found", stderr.getvalue())

        with (
            contextlib.redirect_stderr(io.StringIO()) as stderr,
            self.assertRaises(SystemExit) as raised,
        ):
            eval_definitions.select_evals_or_exit(evals_list, "3")

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("no matching evals", stderr.getvalue())

    def test_eval_run_handles_string_jobs_missing_jobs_and_exception_summaries(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            runner = EvalRun(
                EvalRunOptions(
                    eval_definitions_path=temp_path / "skill" / "evals" / "evals.json",
                    workspace=temp_path / "workspace",
                    iteration=1,
                    provider_name="fake",
                    model=None,
                    effort=None,
                    max_parallel=1,
                    timeout=30,
                    total_timeout=60,
                    run_types=["skill", "baseline"],
                    run_root=temp_path / "prepared",
                ),
                FakeProvider(),
                {},
                [{"id": 1, "eval_name": "unit"}],
                [],
            )

            with contextlib.redirect_stderr(io.StringIO()) as stderr:
                jobs = runner.build_jobs()

            self.assertEqual(jobs, [])
            self.assertIn("no run directory", stderr.getvalue())

            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                runner.print_launch_summary(len(jobs))

            self.assertIn("Total timeout: 60s", stdout.getvalue())

            failed_future = mock.Mock()
            failed_future.result.side_effect = RuntimeError("boom")
            failed_job = EvalJobSpec(
                {"id": 1},
                "skill",
                str(temp_path / "run"),
                None,
            )
            with contextlib.redirect_stderr(io.StringIO()) as stderr:
                summary = runner.future_summary(failed_future, failed_job)

            self.assertEqual(
                summary,
                {
                    "eval_id": 1,
                    "run_type": "skill",
                    "status": "exception",
                    "error": "boom",
                },
            )
            self.assertIn("EXCEPTION: boom", stderr.getvalue())

            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                runner.print_failed_runs(
                    [
                        {"eval_id": 1, "run_type": "skill", "status": "success"},
                        {
                            "eval_id": 2,
                            "run_type": "baseline",
                            "status": "error",
                            "error": "failed",
                        },
                    ]
                )

            self.assertNotIn("eval-1", stdout.getvalue())
            self.assertIn("eval-2 [baseline]: failed", stdout.getvalue())

    def test_eval_run_job_for_run_type_uses_prepared_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            runner = EvalRun(
                EvalRunOptions(
                    eval_definitions_path=temp_path / "skill" / "evals" / "evals.json",
                    workspace=temp_path / "workspace",
                    iteration=1,
                    provider_name="fake",
                    model=None,
                    effort=None,
                    max_parallel=1,
                    timeout=30,
                    total_timeout=None,
                    run_types=["skill"],
                    run_root=temp_path / "prepared",
                ),
                FakeProvider(),
                {},
                [{"id": 1}],
                [],
            )

            job = runner.job_for_run_type(
                {"id": 1},
                "skill",
                PreparedEval(
                    eval_id=1,
                    eval_name="unit",
                    skill_run_path=temp_path / "skill",
                    baseline_run_path=temp_path / "baseline",
                    skill_file=temp_path / "SKILL.md",
                    skill_fixture_path=temp_path / "fixture",
                    baseline_fixture_path=None,
                ),
            )

            self.assertEqual(job.run_dir, str(temp_path / "skill"))
            self.assertEqual(job.fixture_path, str(temp_path / "fixture"))
            job_prepared_eval = PreparedEval(
                eval_id=1,
                eval_name="unit",
                skill_run_path=temp_path / "skill",
                baseline_run_path=temp_path / "baseline",
                skill_file=temp_path / "SKILL.md",
                skill_fixture_path=None,
                baseline_fixture_path=temp_path / "without_fixture",
            )
            self.assertEqual(
                runner.run_dir_for_run_type(job_prepared_eval, "baseline"),
                str(temp_path / "baseline"),
            )
            self.assertEqual(
                runner.fixture_path_for_run_type(job_prepared_eval, "baseline"),
                str(temp_path / "without_fixture"),
            )
            self.assertIsNone(runner.run_dir_for_run_type(job_prepared_eval, "other"))
            self.assertIsNone(
                runner.fixture_path_for_run_type(job_prepared_eval, "other")
            )

    def test_eval_run_records_completed_future_and_writes_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            runner = EvalRun(
                EvalRunOptions(
                    eval_definitions_path=temp_path / "skill" / "evals" / "evals.json",
                    workspace=temp_path / "workspace",
                    iteration=1,
                    provider_name="fake",
                    model=None,
                    effort=None,
                    max_parallel=1,
                    timeout=30,
                    total_timeout=None,
                    run_types=["skill"],
                    run_root=temp_path / "prepared",
                ),
                FakeProvider(),
                {"skill_name": "unit-skill"},
                [{"id": 1}],
                [],
            )
            iteration_dir = temp_path / "iteration"
            iteration_dir.mkdir()
            job = EvalJobSpec({"id": 1}, "skill", "run", None)
            future = mock.Mock()
            future.result.return_value = {
                "eval_id": 1,
                "run_type": "skill",
                "status": "success",
                "cost_usd": 0.5,
            }

            with (
                mock.patch.object(
                    runner,
                    "submit_jobs",
                    return_value={future: job},
                ),
                mock.patch.object(eval_runner, "as_completed", return_value=[future]),
            ):
                summaries = runner.run_jobs([job], iteration_dir, time.time())

            self.assertEqual(summaries, [future.result.return_value])

            manifest = runner.write_run_manifest(
                iteration_dir,
                time.time(),
                summaries,
            )

            self.assertEqual(manifest["skill_name"], "unit-skill")
            self.assertEqual(
                json.loads(
                    (iteration_dir / "run_manifest.json").read_text(encoding="utf-8")
                )["runs"],
                summaries,
            )

            final_summaries = summaries + [
                {
                    "eval_id": 2,
                    "run_type": "baseline",
                    "status": "error",
                    "error": "failed",
                }
            ]
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                runner.print_final_summary(
                    2,
                    time.time(),
                    final_summaries,
                    iteration_dir,
                )

            self.assertIn("failed runs:", stdout.getvalue())
            self.assertIn("eval-2 [baseline]: failed", stdout.getvalue())

    def test_eval_run_submit_jobs_passes_resolved_job_fields(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            grading_job_factory = object()
            runner = EvalRun(
                EvalRunOptions(
                    eval_definitions_path=temp_path / "skill" / "evals" / "evals.json",
                    workspace=temp_path / "workspace",
                    iteration=1,
                    provider_name="fake",
                    model="fake-model",
                    effort="high",
                    max_parallel=1,
                    timeout=30,
                    total_timeout=None,
                    run_types=["skill"],
                    run_root=temp_path / "prepared",
                    grading_job_factory=grading_job_factory,
                ),
                FakeProvider(),
                {},
                [{"id": 1}],
                [],
            )
            executor = mock.Mock()
            future = mock.Mock()
            executor.submit.return_value = future
            job = EvalJobSpec(
                {"id": 1},
                "skill",
                str(temp_path / "run"),
                str(temp_path / "fixture"),
            )

            futures = runner.submit_jobs(executor, [job], temp_path, deadline=123.0)

            self.assertEqual(futures, {future: job})
            submitted = executor.submit.call_args.args
            self.assertEqual(submitted[1:], executor.submit.call_args.args[1:])
            self.assertEqual(submitted[2], "skill")
            self.assertEqual(submitted[3], str(temp_path / "run"))
            self.assertEqual(submitted[4], str(temp_path / "fixture"))
            self.assertEqual(submitted[7], "fake-model")
            self.assertEqual(submitted[8], "high")
            self.assertEqual(submitted[10], 123.0)
            self.assertIs(submitted[11], grading_job_factory)


class RunSkillEvalsPromptTests(unittest.TestCase):
    def test_build_prompt_preserves_plain_user_prompt(self):
        prompt = build_prompt(
            "Please update the fixture.",
            {"turns": []},
            fixture_path=None,
        )

        self.assertEqual(prompt, "Please update the fixture.")


class EvalRunInterruptTests(unittest.TestCase):
    def test_run_jobs_shuts_down_executor_without_waiting_when_interrupted(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            iteration_dir = Path(temp_dir)
            job = EvalJobSpec(
                {"id": 1, "eval_name": "interrupt"},
                "skill",
                "F:/runs/eval-1/skill",
                None,
            )
            executor = mock.Mock()
            executor.submit.return_value = "future"
            process_registry = mock.Mock()
            run = EvalRun(
                EvalRunOptions(
                    eval_definitions_path=Path("F:/skills/evals/evals.json"),
                    workspace=iteration_dir,
                    iteration=1,
                    provider_name="fake",
                    model=None,
                    effort=None,
                    max_parallel=1,
                    timeout=600,
                    total_timeout=None,
                    run_types=["skill"],
                    run_root=Path("F:/runs"),
                    process_registry=process_registry,
                ),
                FakeProvider(),
                {"skill_name": "fake-skill"},
                [{"id": 1, "eval_name": "interrupt"}],
                [],
            )

            with (
                mock.patch.object(
                    eval_runner,
                    "ThreadPoolExecutor",
                    return_value=executor,
                ),
                mock.patch.object(
                    eval_runner,
                    "as_completed",
                    side_effect=KeyboardInterrupt,
                ),
                self.assertRaises(KeyboardInterrupt),
            ):
                run.run_jobs([job], iteration_dir, time.time())

        process_registry.kill_all.assert_called_once_with()
        executor.shutdown.assert_called_once_with(
            wait=False,
            cancel_futures=True,
        )


class CodexProviderTests(unittest.TestCase):
    def test_build_command_sets_cwd_for_turn_zero_only(self):
        provider = CodexProvider()

        start_command = provider.build_command(
            session_id=None,
            session_name="eval-1-skill",
            turn_index=0,
            model="gpt-5.4",
            working_dir="F:/tmp/eval-1/skill",
        )

        self.assertTrue(
            start_command[0].lower().endswith("codex")
            or start_command[0].lower().endswith("codex.cmd")
        )
        self.assertEqual(
            start_command[1:],
            [
                "exec",
                "--json",
                "--skip-git-repo-check",
                "--sandbox",
                "workspace-write",
                "--enable",
                "experimental_windows_sandbox",
                "--ignore-user-config",
                "--ignore-rules",
                "-c",
                "shell_environment_policy.ignore_default_excludes=false",
                "-c",
                'approval_policy="never"',
                "-c",
                "skills.bundled.enabled=false",
                "-c",
                "features.plugins=false",
                "--cd",
                "F:/tmp/eval-1/skill",
                "--add-dir",
                "F:/tmp/eval-1/skill",
                "-",
                "--model",
                "gpt-5.4",
            ],
        )
        self.assertNotIn("--ephemeral", start_command)
        self.assertIn("--sandbox", start_command)
        self.assertEqual(
            start_command[start_command.index("--sandbox") + 1],
            "workspace-write",
        )

        resume_command = provider.build_command(
            session_id="thread-123",
            session_name="eval-1-skill",
            turn_index=1,
            model="gpt-5.4",
            working_dir="F:/tmp/eval-1/skill",
        )

        self.assertEqual(
            resume_command[1:],
            [
                "exec",
                "resume",
                "--json",
                "--skip-git-repo-check",
                "--enable",
                "experimental_windows_sandbox",
                "--ignore-user-config",
                "--ignore-rules",
                "-c",
                "shell_environment_policy.ignore_default_excludes=false",
                "-c",
                'approval_policy="never"',
                "-c",
                'sandbox_mode="workspace-write"',
                "-c",
                "skills.bundled.enabled=false",
                "-c",
                "features.plugins=false",
                "thread-123",
                "-",
                "--model",
                "gpt-5.4",
            ],
        )
        self.assertNotIn("--ephemeral", resume_command)
        self.assertNotIn("--sandbox", resume_command)

    def test_extract_response_returns_last_agent_message_only(self):
        response = extract_codex_response(
            [
                {
                    "type": "item.completed",
                    "item": {"type": "agent_message", "text": "progress note"},
                },
                {
                    "type": "item.completed",
                    "item": {"type": "command_execution", "command": "git status"},
                },
                {
                    "type": "item.completed",
                    "item": {
                        "type": "agent_message",
                        "text": "fix(auth): reject malformed token signatures safely",
                    },
                },
            ]
        )

        self.assertEqual(
            response, "fix(auth): reject malformed token signatures safely"
        )


class ClaudeProviderTests(unittest.TestCase):
    def test_build_command_uses_supplied_effort_or_default(self):
        provider = ClaudeProvider()

        command = provider.build_command(
            session_id="session-123",
            session_name="eval-1-skill",
            turn_index=0,
            model="claude-sonnet-4-5",
            effort="high",
        )

        self.assertEqual(command[:4], ["claude", "-p", "--effort", "high"])
        self.assertIn("--model", command)
        self.assertIn("claude-sonnet-4-5", command)

        default_command = provider.build_command(
            session_id="session-123",
            session_name="eval-1-skill",
            turn_index=0,
            model=None,
        )

        self.assertEqual(default_command[:4], ["claude", "-p", "--effort", "medium"])


class GitEnvironmentTests(unittest.TestCase):
    def test_build_git_process_env_creates_ephemeral_safe_directory_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            repo_path = temp_path / "repo"
            repo_path.mkdir()
            (repo_path / ".git").mkdir()
            global_config = temp_path / ".gitconfig"
            global_config.write_text("[user]\n\tname = Test User\n", encoding="utf-8")

            env, config_path = _build_git_process_env(
                {"HOME": temp_dir},
                [str(repo_path)],
            )

            self.assertIsNotNone(config_path)
            self.assertEqual(env["GIT_CONFIG_GLOBAL"], str(config_path))

            config_text = config_path.read_text(encoding="utf-8")
            self.assertIn("[include]", config_text)
            self.assertIn(global_config.as_posix(), config_text)
            self.assertIn("[core]", config_text)
            self.assertIn("\tfsmonitor = false", config_text)
            self.assertIn("[safe]", config_text)
            self.assertIn(repo_path.resolve().as_posix(), config_text)

            config_path.unlink(missing_ok=True)

    def test_stop_git_fsmonitor_daemons_stops_repos_under_run_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            repo_path = temp_path / "workdirs" / "eval-1" / "skill" / "repo"
            repo_path.mkdir(parents=True)
            (repo_path / ".git").mkdir()

            with mock.patch.object(eval_job.subprocess, "run") as run:
                eval_job.stop_git_fsmonitor_daemons(temp_path)

        run.assert_called_once_with(
            [
                "git",
                "-C",
                str(repo_path),
                "fsmonitor--daemon",
                "stop",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )

    def test_stop_git_fsmonitor_daemons_ignores_missing_run_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_root = Path(temp_dir) / "missing"

            with mock.patch.object(eval_job.subprocess, "run") as run:
                eval_job.stop_git_fsmonitor_daemons(missing_root)

        run.assert_not_called()

    def test_stop_git_fsmonitor_daemons_ignores_stop_failures(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            repo_path = temp_path / "repo"
            repo_path.mkdir()
            (repo_path / ".git").mkdir()

            with mock.patch.object(
                eval_job.subprocess,
                "run",
                side_effect=eval_job.subprocess.TimeoutExpired("git", 5),
            ):
                eval_job.stop_git_fsmonitor_daemons(temp_path)

    def test_run_with_timeout_passes_env_to_child_process(self):
        command = [
            sys.executable,
            "-c",
            "import os; print(os.environ.get('SKILL_CREATOR_ENV_TEST', 'missing'))",
        ]

        result = run_with_timeout(
            command,
            "",
            str(PROJECT_ROOT),
            5,
            env={"SKILL_CREATOR_ENV_TEST": "present"},
        )

        self.assertEqual(result.stderr, "")
        self.assertEqual(result.returncode, 0)
        self.assertFalse(result.timed_out)
        self.assertEqual(result.stdout.strip(), "present")

    def test_run_with_timeout_forces_utf8_text_encoding_for_provider_stdin(self):
        process = mock.Mock()
        process.communicate.return_value = ("stdout", "")
        process.returncode = 0
        process.pid = 123

        with mock.patch.object(
            eval_job.subprocess,
            "Popen",
            return_value=process,
        ) as popen:
            result = run_with_timeout(
                ["provider"],
                "curly quote: \u201c",
                str(PROJECT_ROOT),
                5,
            )

        self.assertEqual(
            (result.stdout, result.stderr, result.returncode, result.timed_out),
            ("stdout", "", 0, False),
        )
        self.assertEqual(popen.call_args.kwargs["encoding"], "utf-8")

    def test_run_with_timeout_unregisters_process_after_completion(self):
        process = mock.Mock()
        process.communicate.return_value = ("stdout", "")
        process.returncode = 0
        process.pid = 456

        process_registry = mock.Mock()

        with mock.patch.object(eval_job.subprocess, "Popen", return_value=process):
            run_with_timeout(
                ["provider"],
                "prompt",
                str(PROJECT_ROOT),
                5,
                process_registry=process_registry,
            )

        process_registry.register.assert_called_once_with(456)
        process_registry.unregister.assert_called_once_with(456)

    def test_active_process_registry_kills_only_owned_processes(self):
        first_registry = eval_job.ActiveProcessRegistry()
        second_registry = eval_job.ActiveProcessRegistry()
        first_registry.register(111)
        second_registry.register(222)

        with mock.patch.object(eval_job, "_kill_process_tree") as kill_process_tree:
            first_registry.kill_all()
            second_registry.kill_all()

        self.assertEqual(
            kill_process_tree.call_args_list,
            [mock.call(111), mock.call(222)],
        )


if __name__ == "__main__":
    unittest.main()

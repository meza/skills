import contextlib
import io
import inspect
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate import prepare_fixture


class PrepareFixtureUnitTests(unittest.TestCase):
    def test_fixture_helpers_accept_cohesive_specs(self):
        self.assertEqual(
            list(inspect.signature(prepare_fixture.copy_fixture_or_exit).parameters),
            ["fixture"],
        )
        self.assertEqual(
            list(inspect.signature(prepare_fixture.prepare_run_type).parameters),
            ["preparation"],
        )
        self.assertIn(
            "fixture_placement",
            inspect.signature(prepare_fixture.FixtureCopy).parameters,
        )
        self.assertNotIn(
            "fixture_in_workdir",
            inspect.signature(prepare_fixture.FixtureCopy).parameters,
        )

    def _write_skill(self, root: Path, evals_data: dict) -> Path:
        evals_data = {"schema_version": 1, **evals_data}
        skill_path = root / "demo-skill"
        skill_path.mkdir()
        (skill_path / "SKILL.md").write_text(
            "---\n"
            "name: demo-skill\n"
            "description: Demo skill for fixture preparation tests.\n"
            "---\n\n"
            "# Demo Skill\n",
            encoding="utf-8",
        )
        evals_dir = skill_path / "evals"
        evals_dir.mkdir()
        (evals_dir / "evals.json").write_text(
            json.dumps(evals_data, indent=2),
            encoding="utf-8",
        )
        return skill_path

    def _minimal_evals(self, eval_def: dict | None = None, **top_level: object) -> dict:
        data = {
            "skill_name": "demo-skill",
            "evals": [
                {
                    "id": 1,
                    "eval_name": "basic",
                    "turns": [{"prompt": "Do the task", "expectations": []}],
                }
            ],
        }
        if eval_def:
            data["evals"][0].update(eval_def)
        data.update(top_level)
        return data

    def _write_fixture_base(self, root: Path, name: str = "sample-project") -> Path:
        fixtures = root / "fixtures"
        fixture = fixtures / name
        fixture.mkdir(parents=True)
        (fixture / "README.md").write_text("fixture", encoding="utf-8")
        return fixtures

    def _completed_process(
        self, returncode: int = 0, stdout: str = "", stderr: str = ""
    ):
        return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)

    def test_process_exiting_fixture_helpers_have_explicit_names(self):
        expected_helpers = [
            "assert_eval_dir_inside_run_root_or_exit",
            "copy_eval_files_or_exit",
            "copy_fixture_or_exit",
            "load_skill_evals_data_or_exit",
            "resolve_fixture_staging_or_exit",
            "resolve_ref_or_exit",
            "run_git_or_exit",
        ]

        for helper_name in expected_helpers:
            with self.subTest(helper_name=helper_name):
                self.assertTrue(hasattr(prepare_fixture, helper_name))

    def test_build_prepared_eval_uses_shared_run_type_names(self):
        run_paths = {
            "custom-skill": prepare_fixture.PreparedRunTypeEntry(
                run_dir=Path("runs/eval-1/custom-skill"),
                skill_file=Path("runs/eval-1/custom-skill/SKILL.md"),
            ),
            "custom-baseline": prepare_fixture.PreparedRunTypeEntry(
                run_dir=Path("runs/eval-1/custom-baseline"),
            ),
        }

        with (
            mock.patch.object(prepare_fixture, "SKILL_RUN_TYPE", "custom-skill"),
            mock.patch.object(
                prepare_fixture,
                "BASELINE_RUN_TYPE",
                "custom-baseline",
                create=True,
            ),
        ):
            prepared_eval = prepare_fixture.build_prepared_eval(
                {"id": 1, "eval_name": "custom"},
                run_paths,
            )

        self.assertEqual(
            prepared_eval.skill_run_path,
            Path("runs/eval-1/custom-skill"),
        )
        self.assertEqual(
            prepared_eval.baseline_run_path,
            Path("runs/eval-1/custom-baseline"),
        )

    def test_run_git_returns_trimmed_stdout(self):
        with mock.patch.object(
            prepare_fixture.subprocess,
            "run",
            return_value=self._completed_process(stdout="abc123\n"),
        ) as run:
            result = prepare_fixture.run_git_or_exit(["git", "status"], "failed")

        self.assertEqual(result, "abc123")
        run.assert_called_once_with(
            ["git", "status"],
            capture_output=True,
            text=True,
            timeout=prepare_fixture.GIT_COMMAND_TIMEOUT_SECONDS,
        )

    def test_run_git_exits_with_error_context_on_failure(self):
        with (
            mock.patch.object(
                prepare_fixture.subprocess,
                "run",
                return_value=self._completed_process(
                    returncode=1, stderr="fatal error"
                ),
            ),
            self.assertRaises(SystemExit),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
        ):
            prepare_fixture.run_git_or_exit(["git", "status"], "failed")

        self.assertIn("failed", stderr.getvalue())
        self.assertIn("fatal error", stderr.getvalue())

    def test_run_git_exits_with_timeout_context(self):
        with (
            mock.patch.object(
                prepare_fixture.subprocess,
                "run",
                side_effect=prepare_fixture.subprocess.TimeoutExpired(
                    ["git", "status"],
                    timeout=1,
                ),
            ),
            self.assertRaises(SystemExit),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
        ):
            prepare_fixture.run_git_or_exit(["git", "status"], "failed")

        self.assertIn("failed", stderr.getvalue())
        self.assertIn("timed out", stderr.getvalue())

    def test_resolve_ref_exits_when_ref_is_missing(self):
        with (
            self.assertRaises(SystemExit),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
        ):
            prepare_fixture.resolve_ref_or_exit(Path("repo"), None)

        self.assertIn("fixture_ref is required", stderr.getvalue())

    def test_resolve_ref_returns_first_candidate_that_verifies(self):
        results = [
            self._completed_process(returncode=1),
            self._completed_process(stdout="tag-commit\n"),
        ]

        with mock.patch.object(
            prepare_fixture.subprocess, "run", side_effect=results
        ) as run:
            resolved = prepare_fixture.resolve_ref_or_exit(Path("repo"), "v1")

        self.assertEqual(resolved, "tag-commit")
        self.assertEqual(
            run.call_args_list[0].args[0],
            ["git", "-C", "repo", "rev-parse", "--verify", "v1"],
        )
        self.assertEqual(
            run.call_args_list[1].args[0],
            ["git", "-C", "repo", "rev-parse", "--verify", "v1^{commit}"],
        )
        self.assertEqual(
            run.call_args_list[0].kwargs["timeout"],
            prepare_fixture.GIT_COMMAND_TIMEOUT_SECONDS,
        )

    def test_resolve_ref_ignores_timed_out_candidate(self):
        results = [
            prepare_fixture.subprocess.TimeoutExpired(["git"], 1),
            self._completed_process(stdout="next-commit\n"),
        ]

        with mock.patch.object(
            prepare_fixture.subprocess,
            "run",
            side_effect=results,
        ):
            resolved = prepare_fixture.resolve_ref_or_exit(Path("repo"), "v1")

        self.assertEqual(resolved, "next-commit")

    def test_fetch_ref_returns_false_when_fetch_times_out(self):
        with mock.patch.object(
            prepare_fixture.subprocess,
            "run",
            side_effect=prepare_fixture.subprocess.TimeoutExpired(["git"], 1),
        ):
            self.assertFalse(prepare_fixture.fetch_ref(Path("repo"), "main"))

    def test_resolve_ref_fetches_ref_when_initial_candidates_fail(self):
        failed_candidates = [self._completed_process(returncode=1) for _ in range(6)]
        fetch_success = self._completed_process()
        fetched_ref = self._completed_process(stdout="fetched-commit\n")

        with mock.patch.object(
            prepare_fixture.subprocess,
            "run",
            side_effect=[*failed_candidates, fetch_success, fetched_ref],
        ) as run:
            resolved = prepare_fixture.resolve_ref_or_exit(Path("repo"), "feature")

        self.assertEqual(resolved, "fetched-commit")
        self.assertEqual(
            run.call_args_list[6].args[0],
            ["git", "-C", "repo", "fetch", "origin", "feature"],
        )
        self.assertEqual(
            run.call_args_list[6].kwargs["timeout"],
            prepare_fixture.GIT_COMMAND_TIMEOUT_SECONDS,
        )
        self.assertEqual(
            run.call_args_list[7].args[0],
            ["git", "-C", "repo", "rev-parse", "--verify", "feature"],
        )

    def test_resolve_ref_exits_when_ref_cannot_be_resolved(self):
        failed_candidates = [self._completed_process(returncode=1) for _ in range(6)]
        fetch_failure = self._completed_process(returncode=1)

        with (
            mock.patch.object(
                prepare_fixture.subprocess,
                "run",
                side_effect=[*failed_candidates, fetch_failure],
            ),
            self.assertRaises(SystemExit),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
        ):
            prepare_fixture.resolve_ref_or_exit(Path("repo"), "missing")

        self.assertIn("could not resolve fixture_ref 'missing'", stderr.getvalue())

    def test_git_clone_or_pull_clones_when_destination_is_not_git_repo(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            dest = Path(temp_dir) / "fixtures"

            with (
                mock.patch.object(
                    prepare_fixture.subprocess,
                    "run",
                    return_value=self._completed_process(),
                ) as run,
                mock.patch.object(
                    prepare_fixture, "run_git_or_exit"
                ) as run_git_or_exit,
                mock.patch.object(
                    prepare_fixture, "resolve_ref_or_exit", return_value="abc123"
                ) as resolve_ref_or_exit,
            ):
                prepare_fixture.git_clone_or_pull(
                    "https://example.invalid/repo.git", dest, "main"
                )

            run.assert_called_once_with(
                ["git", "clone", "https://example.invalid/repo.git", str(dest)],
                capture_output=True,
                text=True,
                timeout=prepare_fixture.GIT_COMMAND_TIMEOUT_SECONDS,
            )
            resolve_ref_or_exit.assert_called_once_with(dest, "main")
            self.assertEqual(
                run_git_or_exit.call_args_list,
                [
                    mock.call(
                        ["git", "-C", str(dest), "fetch", "--tags", "origin"],
                        "Error: fixture repo tag fetch failed",
                    ),
                    mock.call(
                        ["git", "-C", str(dest), "reset", "--hard", "abc123"],
                        "Error: fixture repo reset failed",
                    ),
                    mock.call(
                        ["git", "-C", str(dest), "clean", "-fd"],
                        "Error: fixture repo clean failed",
                    ),
                ],
            )

    def test_git_clone_or_pull_exits_when_clone_times_out(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            dest = Path(temp_dir) / "fixtures"

            with (
                mock.patch.object(
                    prepare_fixture.subprocess,
                    "run",
                    side_effect=prepare_fixture.subprocess.TimeoutExpired(
                        ["git", "clone"], 1
                    ),
                ),
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.git_clone_or_pull(
                    "https://example.invalid/repo.git", dest, "main"
                )

        self.assertIn("git clone timed out", stderr.getvalue())

    def test_git_clone_or_pull_fetches_when_destination_is_git_repo(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            dest = Path(temp_dir) / "fixtures"
            (dest / ".git").mkdir(parents=True)

            with (
                mock.patch.object(prepare_fixture.subprocess, "run") as run,
                mock.patch.object(
                    prepare_fixture, "run_git_or_exit"
                ) as run_git_or_exit,
                mock.patch.object(
                    prepare_fixture, "resolve_ref_or_exit", return_value="abc123"
                ) as resolve_ref_or_exit,
            ):
                prepare_fixture.git_clone_or_pull(
                    "https://example.invalid/repo.git", dest, "main"
                )

            run.assert_not_called()
            resolve_ref_or_exit.assert_called_once_with(dest, "main")
            self.assertEqual(
                run_git_or_exit.call_args_list,
                [
                    mock.call(
                        ["git", "-C", str(dest), "fetch", "--tags", "origin"],
                        "Error: fixture repo fetch failed",
                    ),
                    mock.call(
                        ["git", "-C", str(dest), "reset", "--hard", "abc123"],
                        "Error: fixture repo reset failed",
                    ),
                    mock.call(
                        ["git", "-C", str(dest), "clean", "-fd"],
                        "Error: fixture repo clean failed",
                    ),
                ],
            )

    def test_git_clone_or_pull_exits_when_clone_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            dest = Path(temp_dir) / "fixtures"

            with (
                mock.patch.object(
                    prepare_fixture.subprocess,
                    "run",
                    return_value=self._completed_process(
                        returncode=1, stderr="clone failed"
                    ),
                ),
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.git_clone_or_pull(
                    "https://example.invalid/repo.git", dest
                )

        self.assertIn("git clone failed", stderr.getvalue())
        self.assertIn("clone failed", stderr.getvalue())

    def test_load_evals_data_reads_skill_eval_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            evals_data = self._minimal_evals()
            skill_path = self._write_skill(temp_path, evals_data)

            self.assertEqual(
                prepare_fixture.load_skill_evals_data_or_exit(skill_path),
                {"schema_version": 1, **evals_data},
            )

    def test_load_evals_data_exits_when_evals_json_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_path = Path(temp_dir) / "demo-skill"
            skill_path.mkdir()

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.load_skill_evals_data_or_exit(skill_path)

            self.assertIn("evals.json not found", stderr.getvalue())

    def test_load_evals_data_rejects_malformed_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_path = Path(temp_dir) / "demo-skill"
            evals_dir = skill_path / "evals"
            evals_dir.mkdir(parents=True)
            (evals_dir / "evals.json").write_text("{", encoding="utf-8")

            with (
                self.assertRaises(SystemExit) as raised,
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.load_skill_evals_data_or_exit(skill_path)

            self.assertEqual(raised.exception.code, 1)
            self.assertIn("invalid JSON in evals.json", stderr.getvalue())

    def test_load_evals_data_uses_shared_eval_suite_validation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_path = self._write_skill(
                Path(temp_dir),
                {"skill_name": "demo-skill", "evals": []},
            )

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.load_skill_evals_data_or_exit(skill_path)

            self.assertIn("no evals found", stderr.getvalue())

    def test_load_evals_data_exits_when_fixture_name_is_unsafe(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                self._minimal_evals({"fixture": "../outside-project"}),
            )

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.load_skill_evals_data_or_exit(skill_path)

            self.assertIn("escapes the fixture source root", stderr.getvalue())

    def test_resolve_fixture_staging_returns_none_when_no_eval_uses_fixture(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            staging = prepare_fixture.resolve_fixture_staging_or_exit(
                self._minimal_evals(),
                Path(temp_dir),
            )

            self.assertIsNone(staging)

    def test_resolve_fixture_staging_uses_existing_fixture_base_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)
            evals_data = self._minimal_evals(
                {"fixture": "sample-project"},
                fixture_base_path=str(fixtures),
            )

            staging = prepare_fixture.resolve_fixture_staging_or_exit(
                evals_data, temp_path / "runs"
            )

            self.assertEqual(staging, fixtures.resolve())

    def test_resolve_fixture_staging_uses_default_run_root_fixtures_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            default_fixtures = self._write_fixture_base(temp_path / "runs")
            evals_data = self._minimal_evals({"fixture": "sample-project"})

            staging = prepare_fixture.resolve_fixture_staging_or_exit(
                evals_data, temp_path / "runs"
            )

            self.assertEqual(staging, default_fixtures)

    def test_resolve_fixture_staging_exits_when_fixture_base_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            evals_data = self._minimal_evals(
                {"fixture": "sample-project"},
                fixture_base_path=str(temp_path / "missing-fixtures"),
            )

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.resolve_fixture_staging_or_exit(
                    evals_data, temp_path / "runs"
                )

            self.assertIn("fixture_base_path", stderr.getvalue())

    def test_resolve_fixture_staging_delegates_fixture_repo_setup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixture_ref = "a" * 40
            evals_data = self._minimal_evals(
                {"fixture": "sample-project"},
                fixture_repo="https://example.invalid/fixtures.git",
                fixture_ref=fixture_ref,
            )

            with mock.patch.object(prepare_fixture, "git_clone_or_pull") as clone:
                staging = prepare_fixture.resolve_fixture_staging_or_exit(
                    evals_data, temp_path / "runs"
                )

            self.assertEqual(staging, temp_path / "runs" / "fixtures")
            clone.assert_called_once_with(
                "https://example.invalid/fixtures.git",
                temp_path / "runs" / "fixtures",
                fixture_ref,
            )

    def test_resolve_fixture_staging_rejects_mutable_fixture_ref(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            evals_data = self._minimal_evals(
                {"fixture": "sample-project"},
                fixture_repo="https://example.invalid/fixtures.git",
                fixture_ref="main",
            )

            with (
                mock.patch.object(prepare_fixture, "git_clone_or_pull") as clone,
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.resolve_fixture_staging_or_exit(
                    evals_data, temp_path / "runs"
                )

            clone.assert_not_called()
            self.assertIn(
                "fixture_ref must be a 40-character commit SHA", stderr.getvalue()
            )

    def test_resolve_fixture_staging_rejects_repo_with_fixture_base_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            evals_data = self._minimal_evals(
                {"fixture": "sample-project"},
                fixture_repo="https://example.invalid/fixtures.git",
                fixture_ref="abc123",
                fixture_base_path=str(temp_path / "outside"),
            )

            with (
                mock.patch.object(prepare_fixture, "git_clone_or_pull") as clone,
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.resolve_fixture_staging_or_exit(
                    evals_data, temp_path / "runs"
                )

            clone.assert_not_called()
            self.assertIn(
                "fixture_base_path cannot be used with fixture_repo",
                stderr.getvalue(),
            )

    def test_resolve_fixture_staging_requires_ref_for_fixture_repo(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            evals_data = self._minimal_evals(
                {"fixture": "sample-project"},
                fixture_repo="https://example.invalid/fixtures.git",
            )

            with (
                mock.patch.object(prepare_fixture, "git_clone_or_pull") as clone,
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.resolve_fixture_staging_or_exit(
                    evals_data, temp_path / "runs"
                )

            clone.assert_not_called()
            self.assertIn("fixture_ref is required", stderr.getvalue())

    def test_copy_fixture_places_fixture_in_workdir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)
            eval_dir = temp_path / "eval-1"
            run_dir = eval_dir / "skill"
            run_dir.mkdir(parents=True)

            copied = prepare_fixture.copy_fixture_or_exit(
                prepare_fixture.FixtureCopy(
                    fixture_staging=fixtures,
                    eval_dir=eval_dir,
                    run_dir=run_dir,
                    run_type="skill",
                    fixture_name="sample-project",
                    fixture_placement=prepare_fixture.FixturePlacement.WORKDIR,
                    eval_id="1",
                )
            )

            copied_path = Path(copied)
            self.assertTrue(copied_path.is_relative_to(run_dir))
            self.assertEqual(
                (copied_path / "README.md").read_text(encoding="utf-8"), "fixture"
            )

    def test_copy_fixture_places_fixture_outside_workdir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)
            eval_dir = temp_path / "eval-1"
            run_dir = eval_dir / "skill"
            run_dir.mkdir(parents=True)

            copied = prepare_fixture.copy_fixture_or_exit(
                prepare_fixture.FixtureCopy(
                    fixture_staging=fixtures,
                    eval_dir=eval_dir,
                    run_dir=run_dir,
                    run_type="skill",
                    fixture_name="sample-project",
                    fixture_placement=prepare_fixture.FixturePlacement.EXTERNAL,
                    eval_id="1",
                )
            )

            copied_path = Path(copied)
            self.assertFalse(copied_path.is_relative_to(run_dir))
            self.assertEqual(copied_path.parent, eval_dir / "skill_fixtures")
            self.assertEqual(
                (copied_path / "README.md").read_text(encoding="utf-8"), "fixture"
            )

    def test_copy_fixture_exits_when_fixture_directory_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = temp_path / "fixtures"
            fixtures.mkdir()
            eval_dir = temp_path / "eval-1"
            run_dir = eval_dir / "skill"
            run_dir.mkdir(parents=True)

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.copy_fixture_or_exit(
                    prepare_fixture.FixtureCopy(
                        fixture_staging=fixtures,
                        eval_dir=eval_dir,
                        run_dir=run_dir,
                        run_type="skill",
                        fixture_name="missing-project",
                        fixture_placement=prepare_fixture.FixturePlacement.WORKDIR,
                        eval_id="1",
                    )
                )

            self.assertIn("fixture 'missing-project' not found", stderr.getvalue())

    def test_copy_fixture_exits_when_fixture_name_escapes_source_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)
            outside = temp_path / "outside-project"
            outside.mkdir()
            (outside / "README.md").write_text("outside", encoding="utf-8")
            eval_dir = temp_path / "eval-1"
            run_dir = eval_dir / "skill"
            run_dir.mkdir(parents=True)

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.copy_fixture_or_exit(
                    prepare_fixture.FixtureCopy(
                        fixture_staging=fixtures,
                        eval_dir=eval_dir,
                        run_dir=run_dir,
                        run_type="skill",
                        fixture_name="../outside-project",
                        fixture_placement=prepare_fixture.FixturePlacement.WORKDIR,
                        eval_id="1",
                    )
                )

            self.assertIn("escapes the fixture source root", stderr.getvalue())
            self.assertFalse((eval_dir / "outside-project").exists())

    def test_copy_fixture_exits_when_fixture_name_is_absolute(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)
            eval_dir = temp_path / "eval-1"
            run_dir = eval_dir / "skill"
            run_dir.mkdir(parents=True)

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.copy_fixture_or_exit(
                    prepare_fixture.FixtureCopy(
                        fixture_staging=fixtures,
                        eval_dir=eval_dir,
                        run_dir=run_dir,
                        run_type="skill",
                        fixture_name=str((temp_path / "absolute-project").resolve()),
                        fixture_placement=prepare_fixture.FixturePlacement.EXTERNAL,
                        eval_id="1",
                    )
                )

            self.assertIn(
                "must be a relative fixture directory name", stderr.getvalue()
            )

    def test_copy_eval_files_exits_when_file_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            run_dir = temp_path / "run"
            run_dir.mkdir()

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.copy_eval_files_or_exit(
                    skill_path,
                    run_dir,
                    ["evals/files/missing.txt"],
                    "1",
                )

            self.assertIn("not found", stderr.getvalue())

    def test_copy_eval_files_exits_when_path_is_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            directory = skill_path / "evals" / "files" / "directory"
            directory.mkdir(parents=True)
            run_dir = temp_path / "run"
            run_dir.mkdir()

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.copy_eval_files_or_exit(
                    skill_path,
                    run_dir,
                    ["evals/files/directory"],
                    "1",
                )

            self.assertIn("is not a file", stderr.getvalue())

    def test_copy_eval_files_exits_when_path_escapes_skill_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            (temp_path / "outside.txt").write_text("outside", encoding="utf-8")
            run_dir = temp_path / "run"
            run_dir.mkdir()

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.copy_eval_files_or_exit(
                    skill_path,
                    run_dir,
                    ["../outside.txt"],
                    "1",
                )

            self.assertIn("escapes the skill root", stderr.getvalue())

    def test_require_fixture_path_inside_root_exits_for_escaped_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixture_root = temp_path / "fixtures"
            fixture_root.mkdir()
            escaped_path = temp_path / "outside" / "project"
            escaped_path.mkdir(parents=True)

            with (
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.require_fixture_path_inside_root_or_exit(
                    escaped_path,
                    fixture_root,
                    "project",
                    "1",
                    "fixture source root",
                )

        self.assertIn("escapes the fixture source root", stderr.getvalue())

    def test_copy_skill_requires_explicit_skill_root(self):
        skill_root = inspect.signature(prepare_fixture.copy_skill).parameters[
            "skill_root"
        ]

        self.assertIs(skill_root.default, inspect.Parameter.empty)

    def test_write_eval_gitignore_adds_auth_json_once(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_dir = Path(temp_dir)
            gitignore = run_dir / ".gitignore"
            gitignore.write_text("existing.log\n", encoding="utf-8")

            prepare_fixture.write_eval_gitignore(run_dir)
            prepare_fixture.write_eval_gitignore(run_dir)

            self.assertEqual(
                gitignore.read_text(encoding="utf-8"),
                "existing.log\nauth.json\n",
            )

    def test_build_prepared_eval_flattens_prepared_run_paths(self):
        entry = prepare_fixture.build_prepared_eval(
            {"id": 7, "eval_name": "named-eval"},
            {
                "skill": prepare_fixture.PreparedRunTypeEntry(
                    run_dir=Path("runs/eval-7/skill"),
                    fixture_path=Path("runs/eval-7/skill/project"),
                    skill_file=Path("runs/eval-7/skill/.claude/skills/demo/SKILL.md"),
                ),
                "baseline": prepare_fixture.PreparedRunTypeEntry(
                    run_dir=Path("runs/eval-7/baseline"),
                    fixture_path=Path("runs/eval-7/baseline/project"),
                ),
            },
        )

        self.assertEqual(
            entry,
            prepare_fixture.PreparedEval(
                eval_id=7,
                eval_name="named-eval",
                skill_run_path=Path("runs/eval-7/skill"),
                baseline_run_path=Path("runs/eval-7/baseline"),
                skill_file=Path("runs/eval-7/skill/.claude/skills/demo/SKILL.md"),
                skill_fixture_path=Path("runs/eval-7/skill/project"),
                baseline_fixture_path=Path("runs/eval-7/baseline/project"),
            ),
        )

    def test_prepared_run_serializes_for_orchestrator_output(self):
        prepared_eval = prepare_fixture.PreparedEval(
            eval_id=1,
            eval_name="basic",
            skill_run_path=Path("run/eval-1/skill"),
            baseline_run_path=Path("run/eval-1/baseline"),
            skill_file=Path("run/eval-1/skill/.claude/skills/demo/SKILL.md"),
            skill_fixture_path=Path("run/eval-1/skill/project"),
            baseline_fixture_path=None,
        )
        prepared_run = prepare_fixture.PreparedRun(
            eval_definitions_path=Path("skill/evals/evals.json"),
            run_root=Path("run"),
            provider="claude",
            skill_name="demo",
            evals=[prepared_eval],
        )

        self.assertEqual(
            prepared_eval.to_dict(),
            {
                "eval_id": 1,
                "eval_name": "basic",
                "skill_run_path": str(Path("run/eval-1/skill")),
                "baseline_run_path": str(Path("run/eval-1/baseline")),
                "skill_file": str(
                    Path("run/eval-1/skill/.claude/skills/demo/SKILL.md")
                ),
                "skill_fixture_path": str(Path("run/eval-1/skill/project")),
                "baseline_fixture_path": None,
            },
        )
        self.assertEqual(
            prepared_run.to_dict(),
            {
                "eval_definitions_path": str(Path("skill/evals/evals.json")),
                "run_root": str(Path("run")),
                "provider": "claude",
                "skill_name": "demo",
                "evals": [prepared_eval.to_dict()],
            },
        )
        self.assertEqual(
            prepared_run.to_summary(),
            {
                "run_root": str(Path("run")),
                "provider": "claude",
                "skill_name": "demo",
                "eval_count": 1,
            },
        )

    def test_optional_string_to_path_returns_path_or_none(self):
        self.assertIsNone(prepare_fixture._optional_string_to_path(None))
        self.assertEqual(
            prepare_fixture._optional_string_to_path("fixtures/project"),
            Path("fixtures/project"),
        )

    def test_prepare_resolves_skill_root_from_provider_registry(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            with mock.patch.object(
                prepare_fixture,
                "get_provider_skill_root_or_exit",
                return_value=".new-provider",
            ) as get_provider_skill_root_or_exit:
                prepared_run = prepare_fixture.prepare(
                    prepare_fixture.PrepareFixtureOptions(
                        skill_path=skill_path,
                        run_root=temp_path / "runs",
                        provider="new-provider",
                    )
                )

            get_provider_skill_root_or_exit.assert_called_once_with("new-provider")
            self.assertTrue(
                (
                    prepared_run.evals[0].skill_run_path
                    / ".new-provider"
                    / "skills"
                    / "demo-skill"
                    / "SKILL.md"
                ).exists()
            )

    def test_prepare_run_type_copies_skill_files_and_eval_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                self._minimal_evals(
                    {
                        "files": ["evals/files/input.txt"],
                    }
                ),
            )
            input_file = skill_path / "evals" / "files" / "input.txt"
            input_file.parent.mkdir()
            input_file.write_text("sample", encoding="utf-8")

            entry = prepare_fixture.prepare_run_type(
                prepare_fixture.RunTypePreparation(
                    skill_path=skill_path,
                    run_root=temp_path / "prepared",
                    eval_def=self._minimal_evals()["evals"][0]
                    | {"files": ["evals/files/input.txt"]},
                    run_type="skill",
                    fixture_staging=None,
                    skill_name="demo-skill",
                    skill_root=".claude",
                )
            )

            self.assertIsInstance(entry, prepare_fixture.PreparedRunTypeEntry)
            run_dir = entry.run_dir
            self.assertTrue(
                (run_dir / ".claude" / "skills" / "demo-skill" / "SKILL.md").exists()
            )
            self.assertEqual(
                (run_dir / "evals" / "files" / "input.txt").read_text(encoding="utf-8"),
                "sample",
            )
            self.assertEqual(
                entry.skill_file,
                run_dir / ".claude" / "skills" / "demo-skill" / "SKILL.md",
            )
            self.assertIn(
                "auth.json",
                (run_dir / ".gitignore").read_text(encoding="utf-8").splitlines(),
            )

    def test_prepare_run_type_copies_fixture_when_defined(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            fixtures = self._write_fixture_base(temp_path)
            eval_def = self._minimal_evals(
                {
                    "fixture": "sample-project",
                    "fixture_in_workdir": True,
                }
            )["evals"][0]

            entry = prepare_fixture.prepare_run_type(
                prepare_fixture.RunTypePreparation(
                    skill_path=skill_path,
                    run_root=temp_path / "prepared",
                    eval_def=eval_def,
                    run_type="baseline",
                    fixture_staging=fixtures,
                    skill_name="demo-skill",
                    skill_root=".claude",
                )
            )

            self.assertIsInstance(entry, prepare_fixture.PreparedRunTypeEntry)
            fixture_path = entry.fixture_path
            self.assertIsNotNone(fixture_path)
            self.assertTrue(fixture_path.is_relative_to(entry.run_dir))
            self.assertEqual(
                (fixture_path / "README.md").read_text(encoding="utf-8"), "fixture"
            )

    def test_prepare_returns_prepared_run_in_process(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            prepared_run = prepare_fixture.prepare(
                prepare_fixture.PrepareFixtureOptions(
                    skill_path=skill_path,
                    run_root=temp_path / "runs",
                    provider="claude",
                )
            )

            self.assertEqual(prepared_run.provider, "claude")
            self.assertEqual(prepared_run.skill_name, "demo-skill")
            self.assertEqual(prepared_run.eval_count, 1)
            self.assertEqual(
                prepared_run.eval_definitions_path,
                (skill_path / "evals" / "evals.json").resolve(),
            )
            self.assertEqual(prepared_run.evals[0].eval_id, 1)
            self.assertFalse(
                (prepared_run.run_root / "prepared_manifest.json").exists()
            )

    def test_assert_eval_dir_inside_run_root_exits_for_external_path(self):
        with (
            self.assertRaises(SystemExit),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
        ):
            prepare_fixture.assert_eval_dir_inside_run_root_or_exit(
                Path("run").resolve(),
                Path("elsewhere/eval-1").resolve(),
                Path("elsewhere/eval-1"),
            )

        self.assertIn("refusing to remove eval directory", stderr.getvalue())

    def test_reset_prepared_eval_dir_removes_existing_eval_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_root = Path(temp_dir)
            eval_dir = run_root / "eval-1"
            eval_dir.mkdir()
            (eval_dir / "stale.txt").write_text("stale", encoding="utf-8")

            prepare_fixture.reset_prepared_eval_dir(run_root, 1)

            self.assertFalse(eval_dir.exists())

    def test_create_workdir_root_returns_stable_workdirs_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_root = Path(temp_dir)

            first = prepare_fixture.create_workdir_root(run_root)
            second = prepare_fixture.create_workdir_root(run_root)

            self.assertEqual(first, run_root / "workdirs")
            self.assertEqual(second, run_root / "workdirs")
            self.assertTrue(first.is_dir())

    def test_create_workdir_root_removes_existing_workdirs_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_root = Path(temp_dir)
            active_file = run_root / "workdirs" / "eval-1" / "marker.txt"
            active_file.parent.mkdir(parents=True)
            active_file.write_text("active", encoding="utf-8")

            workdir_root = prepare_fixture.create_workdir_root(run_root)

            self.assertEqual(workdir_root, run_root / "workdirs")
            self.assertFalse(active_file.exists())
            self.assertTrue(workdir_root.exists())

    def test_assert_eval_dir_inside_run_root_accepts_direct_child(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_root = Path(temp_dir)
            eval_dir = run_root / "eval-1"

            prepare_fixture.assert_eval_dir_inside_run_root_or_exit(
                run_root.resolve(),
                eval_dir.resolve(),
                eval_dir,
            )

    def test_reset_prepared_eval_dir_ignores_missing_eval_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_root = Path(temp_dir)

            prepare_fixture.reset_prepared_eval_dir(run_root, 1)

            self.assertFalse((run_root / "eval-1").exists())

    def test_retry_read_only_delete_makes_path_writable_before_retry(self):
        calls = []

        def delete(path):
            calls.append(path)

        with mock.patch.object(prepare_fixture.os, "chmod") as chmod:
            prepare_fixture.retry_read_only_delete(delete, "locked.txt", None)

        chmod.assert_called_once_with("locked.txt", prepare_fixture.stat.S_IWRITE)
        self.assertEqual(calls, ["locked.txt"])


if __name__ == "__main__":
    unittest.main()

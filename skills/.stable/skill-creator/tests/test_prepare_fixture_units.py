import argparse
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import prepare_fixture


class PrepareFixtureUnitTests(unittest.TestCase):
    def _write_skill(self, root: Path, evals_data: dict) -> Path:
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

    def _completed_process(self, returncode: int = 0, stdout: str = "", stderr: str = ""):
        return mock.Mock(returncode=returncode, stdout=stdout, stderr=stderr)

    def test_run_git_returns_trimmed_stdout(self):
        with mock.patch.object(
            prepare_fixture.subprocess,
            "run",
            return_value=self._completed_process(stdout="abc123\n"),
        ) as run:
            result = prepare_fixture.run_git(["git", "status"], "failed")

        self.assertEqual(result, "abc123")
        run.assert_called_once_with(["git", "status"], capture_output=True, text=True)

    def test_run_git_exits_with_error_context_on_failure(self):
        with (
            mock.patch.object(
                prepare_fixture.subprocess,
                "run",
                return_value=self._completed_process(returncode=1, stderr="fatal error"),
            ),
            self.assertRaises(SystemExit),
            contextlib.redirect_stderr(io.StringIO()) as stderr,
        ):
            prepare_fixture.run_git(["git", "status"], "failed")

        self.assertIn("failed", stderr.getvalue())
        self.assertIn("fatal error", stderr.getvalue())

    def test_resolve_ref_uses_origin_head_when_ref_is_missing(self):
        with mock.patch.object(prepare_fixture, "run_git", return_value="origin-head") as run_git:
            resolved = prepare_fixture.resolve_ref(Path("repo"), None)

        self.assertEqual(resolved, "origin-head")
        run_git.assert_called_once_with(
            ["git", "-C", "repo", "rev-parse", "origin/HEAD"],
            "Error: could not resolve origin/HEAD for fixture repo",
        )

    def test_resolve_ref_returns_first_candidate_that_verifies(self):
        results = [
            self._completed_process(returncode=1),
            self._completed_process(stdout="tag-commit\n"),
        ]

        with mock.patch.object(prepare_fixture.subprocess, "run", side_effect=results) as run:
            resolved = prepare_fixture.resolve_ref(Path("repo"), "v1")

        self.assertEqual(resolved, "tag-commit")
        self.assertEqual(run.call_args_list[0].args[0], ["git", "-C", "repo", "rev-parse", "--verify", "v1"])
        self.assertEqual(run.call_args_list[1].args[0], ["git", "-C", "repo", "rev-parse", "--verify", "v1^{commit}"])

    def test_resolve_ref_fetches_ref_when_initial_candidates_fail(self):
        failed_candidates = [self._completed_process(returncode=1) for _ in range(6)]
        fetch_success = self._completed_process()
        fetched_ref = self._completed_process(stdout="fetched-commit\n")

        with mock.patch.object(
            prepare_fixture.subprocess,
            "run",
            side_effect=[*failed_candidates, fetch_success, fetched_ref],
        ) as run:
            resolved = prepare_fixture.resolve_ref(Path("repo"), "feature")

        self.assertEqual(resolved, "fetched-commit")
        self.assertEqual(run.call_args_list[6].args[0], ["git", "-C", "repo", "fetch", "origin", "feature"])
        self.assertEqual(run.call_args_list[7].args[0], ["git", "-C", "repo", "rev-parse", "--verify", "feature"])

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
            prepare_fixture.resolve_ref(Path("repo"), "missing")

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
                mock.patch.object(prepare_fixture, "run_git") as run_git,
                mock.patch.object(prepare_fixture, "resolve_ref", return_value="abc123") as resolve_ref,
            ):
                prepare_fixture.git_clone_or_pull("https://example.invalid/repo.git", dest, "main")

            run.assert_called_once_with(
                ["git", "clone", "https://example.invalid/repo.git", str(dest)],
                capture_output=True,
                text=True,
            )
            resolve_ref.assert_called_once_with(dest, "main")
            self.assertEqual(
                run_git.call_args_list,
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

    def test_git_clone_or_pull_fetches_when_destination_is_git_repo(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            dest = Path(temp_dir) / "fixtures"
            (dest / ".git").mkdir(parents=True)

            with (
                mock.patch.object(prepare_fixture.subprocess, "run") as run,
                mock.patch.object(prepare_fixture, "run_git") as run_git,
                mock.patch.object(prepare_fixture, "resolve_ref", return_value="abc123") as resolve_ref,
            ):
                prepare_fixture.git_clone_or_pull("https://example.invalid/repo.git", dest, "main")

            run.assert_not_called()
            resolve_ref.assert_called_once_with(dest, "main")
            self.assertEqual(
                run_git.call_args_list,
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
                    return_value=self._completed_process(returncode=1, stderr="clone failed"),
                ),
                self.assertRaises(SystemExit),
                contextlib.redirect_stderr(io.StringIO()) as stderr,
            ):
                prepare_fixture.git_clone_or_pull("https://example.invalid/repo.git", dest)

        self.assertIn("git clone failed", stderr.getvalue())
        self.assertIn("clone failed", stderr.getvalue())

    def test_load_evals_data_reads_skill_eval_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            evals_data = self._minimal_evals()
            skill_path = self._write_skill(temp_path, evals_data)

            self.assertEqual(prepare_fixture.load_evals_data(skill_path), evals_data)

    def test_load_evals_data_exits_when_evals_json_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_path = Path(temp_dir) / "demo-skill"
            skill_path.mkdir()

            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()) as stderr:
                prepare_fixture.load_evals_data(skill_path)

            self.assertIn("evals.json not found", stderr.getvalue())

    def test_resolve_fixture_staging_returns_none_when_no_eval_uses_fixture(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            staging = prepare_fixture.resolve_fixture_staging(
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

            staging = prepare_fixture.resolve_fixture_staging(evals_data, temp_path / "runs")

            self.assertEqual(staging, fixtures.resolve())

    def test_resolve_fixture_staging_uses_default_run_root_fixtures_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            default_fixtures = self._write_fixture_base(temp_path / "runs")
            evals_data = self._minimal_evals({"fixture": "sample-project"})

            staging = prepare_fixture.resolve_fixture_staging(evals_data, temp_path / "runs")

            self.assertEqual(staging, default_fixtures)

    def test_resolve_fixture_staging_exits_when_fixture_base_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            evals_data = self._minimal_evals(
                {"fixture": "sample-project"},
                fixture_base_path=str(temp_path / "missing-fixtures"),
            )

            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()) as stderr:
                prepare_fixture.resolve_fixture_staging(evals_data, temp_path / "runs")

            self.assertIn("fixture_base_path", stderr.getvalue())

    def test_resolve_fixture_staging_delegates_fixture_repo_setup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            evals_data = self._minimal_evals(
                {"fixture": "sample-project"},
                fixture_repo="https://example.invalid/fixtures.git",
                fixture_ref="abc123",
            )

            with mock.patch.object(prepare_fixture, "git_clone_or_pull") as clone:
                staging = prepare_fixture.resolve_fixture_staging(evals_data, temp_path / "runs")

            self.assertEqual(staging, temp_path / "runs" / "fixtures")
            clone.assert_called_once_with(
                "https://example.invalid/fixtures.git",
                temp_path / "runs" / "fixtures",
                "abc123",
            )

    def test_copy_fixture_places_fixture_in_workdir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)
            eval_dir = temp_path / "eval-1"
            run_dir = eval_dir / "with_skill"
            run_dir.mkdir(parents=True)

            copied = prepare_fixture.copy_fixture(
                fixture_staging=fixtures,
                eval_dir=eval_dir,
                run_dir=run_dir,
                config="with_skill",
                fixture_name="sample-project",
                fixture_in_workdir=True,
                eval_id="1",
            )

            copied_path = Path(copied)
            self.assertTrue(copied_path.is_relative_to(run_dir))
            self.assertEqual((copied_path / "README.md").read_text(encoding="utf-8"), "fixture")

    def test_copy_fixture_places_fixture_outside_workdir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)
            eval_dir = temp_path / "eval-1"
            run_dir = eval_dir / "with_skill"
            run_dir.mkdir(parents=True)

            copied = prepare_fixture.copy_fixture(
                fixture_staging=fixtures,
                eval_dir=eval_dir,
                run_dir=run_dir,
                config="with_skill",
                fixture_name="sample-project",
                fixture_in_workdir=False,
                eval_id="1",
            )

            copied_path = Path(copied)
            self.assertFalse(copied_path.is_relative_to(run_dir))
            self.assertEqual(copied_path.parent, eval_dir / "with_skill_fixtures")
            self.assertEqual((copied_path / "README.md").read_text(encoding="utf-8"), "fixture")

    def test_copy_fixture_exits_when_fixture_directory_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = temp_path / "fixtures"
            fixtures.mkdir()
            eval_dir = temp_path / "eval-1"
            run_dir = eval_dir / "with_skill"
            run_dir.mkdir(parents=True)

            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()) as stderr:
                prepare_fixture.copy_fixture(
                    fixture_staging=fixtures,
                    eval_dir=eval_dir,
                    run_dir=run_dir,
                    config="with_skill",
                    fixture_name="missing-project",
                    fixture_in_workdir=True,
                    eval_id="1",
                )

            self.assertIn("fixture 'missing-project' not found", stderr.getvalue())

    def test_copy_eval_files_exits_when_file_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            run_dir = temp_path / "run"
            run_dir.mkdir()

            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()) as stderr:
                prepare_fixture.copy_eval_files(
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

            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()) as stderr:
                prepare_fixture.copy_eval_files(
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

            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()) as stderr:
                prepare_fixture.copy_eval_files(
                    skill_path,
                    run_dir,
                    ["../outside.txt"],
                    "1",
                )

            self.assertIn("escapes the skill root", stderr.getvalue())

    def test_build_manifest_entry_flattens_prepared_run_paths(self):
        entry = prepare_fixture.build_manifest_entry(
            {"id": 7, "eval_name": "named-eval"},
            {
                "with_skill": {
                    "path": "runs/eval-7/with_skill",
                    "skill_file": "runs/eval-7/with_skill/.claude/skills/demo/SKILL.md",
                    "fixture_path": "runs/eval-7/with_skill/project",
                },
                "without_skill": {
                    "path": "runs/eval-7/without_skill",
                    "fixture_path": "runs/eval-7/without_skill/project",
                },
            },
        )

        self.assertEqual(
            entry,
            {
                "eval_id": 7,
                "eval_name": "named-eval",
                "with_skill_path": "runs/eval-7/with_skill",
                "without_skill_path": "runs/eval-7/without_skill",
                "skill_file": "runs/eval-7/with_skill/.claude/skills/demo/SKILL.md",
                "with_skill_fixture_path": "runs/eval-7/with_skill/project",
                "without_skill_fixture_path": "runs/eval-7/without_skill/project",
            },
        )

    def test_write_manifest_uses_explicit_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            manifest = {"run_root": "runs/root", "provider": "claude", "skill_name": "demo", "evals": []}
            manifest_path = temp_path / "nested" / "manifest.json"

            written = prepare_fixture.write_manifest(
                manifest,
                str(manifest_path),
                temp_path / "unused-run-root",
            )

            self.assertEqual(written, manifest_path.resolve())
            self.assertEqual(json.loads(written.read_text(encoding="utf-8")), manifest)

    def test_build_summary_returns_stdout_contract(self):
        summary = prepare_fixture.build_summary(
            manifest_path=Path("manifest.json"),
            run_root=Path("prepared"),
            provider_name="claude",
            skill_name="demo-skill",
            eval_count=3,
        )

        self.assertEqual(
            summary,
            {
                "manifest_path": "manifest.json",
                "run_root": "prepared",
                "provider": "claude",
                "skill_name": "demo-skill",
                "eval_count": 3,
            },
        )

    def test_prepare_configuration_copies_skill_files_and_eval_files(self):
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

            entry = prepare_fixture.prepare_configuration(
                skill_path=skill_path,
                run_root=temp_path / "prepared",
                eval_def=self._minimal_evals()["evals"][0] | {"files": ["evals/files/input.txt"]},
                config="with_skill",
                fixture_staging=None,
                skill_name="demo-skill",
                skill_root=".claude",
            )

            run_dir = Path(entry["path"])
            self.assertTrue((run_dir / ".claude" / "skills" / "demo-skill" / "SKILL.md").exists())
            self.assertEqual(
                (run_dir / "evals" / "files" / "input.txt").read_text(encoding="utf-8"),
                "sample",
            )
            self.assertEqual(
                Path(entry["skill_file"]),
                run_dir / ".claude" / "skills" / "demo-skill" / "SKILL.md",
            )

    def test_prepare_configuration_copies_fixture_when_defined(self):
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

            entry = prepare_fixture.prepare_configuration(
                skill_path=skill_path,
                run_root=temp_path / "prepared",
                eval_def=eval_def,
                config="without_skill",
                fixture_staging=fixtures,
                skill_name="demo-skill",
                skill_root=".claude",
            )

            fixture_path = Path(entry["fixture_path"])
            self.assertTrue(fixture_path.is_relative_to(Path(entry["path"])))
            self.assertEqual((fixture_path / "README.md").read_text(encoding="utf-8"), "fixture")

    def test_execute_prepares_manifest_and_summary_in_process(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            manifest_path = temp_path / "manifest.json"

            summary = prepare_fixture.execute(
                argparse.Namespace(
                    skill_path=str(skill_path),
                    run_root=str(temp_path / "runs"),
                    provider="claude",
                    skill_root=None,
                    manifest_path=str(manifest_path),
                )
            )

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(summary["manifest_path"], str(manifest_path.resolve()))
            self.assertEqual(summary["provider"], "claude")
            self.assertEqual(summary["skill_name"], "demo-skill")
            self.assertEqual(summary["eval_count"], 1)
            self.assertEqual(manifest["run_root"], summary["run_root"])
            self.assertEqual(manifest["evals"][0]["eval_id"], 1)

    def test_main_prints_execute_summary(self):
        fake_summary = {
            "manifest_path": "manifest.json",
            "run_root": "run-root",
            "provider": "claude",
            "skill_name": "demo-skill",
            "eval_count": 1,
        }
        argv = [
            "prepare_fixture.py",
            "--skill-path",
            "demo-skill",
            "--run-root",
            "runs",
            "--provider",
            "claude",
        ]

        with (
            mock.patch.object(prepare_fixture.sys, "argv", argv),
            mock.patch.object(prepare_fixture, "execute", return_value=fake_summary),
            contextlib.redirect_stdout(io.StringIO()) as stdout,
        ):
            prepare_fixture.main()

        self.assertEqual(json.loads(stdout.getvalue()), fake_summary)


if __name__ == "__main__":
    unittest.main()

import json
import tempfile
import unittest
from pathlib import Path

from scripts.evaluate import prepare_fixture


class PrepareFixtureContractTests(unittest.TestCase):
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

    def _write_fixture_base(self, root: Path, name: str = "sample-project") -> Path:
        fixtures = root / "fixtures"
        project_fixture = fixtures / name
        project_fixture.mkdir(parents=True)
        (project_fixture / "README.md").write_text("fixture", encoding="utf-8")
        return fixtures

    def _run_prepare(
        self,
        skill_path: Path,
        run_root: Path,
        provider: str = "claude",
        eval_ids: str | None = None,
    ) -> prepare_fixture.PreparedRun:
        return prepare_fixture.FixturePreparer(
            prepare_fixture.PrepareFixtureOptions(
                skill_path=skill_path,
                run_root=run_root,
                provider=provider,
                eval_ids=eval_ids,
            )
        ).prepare()

    def _prepared_eval(
        self, prepared_run: prepare_fixture.PreparedRun, eval_id: int = 1
    ) -> prepare_fixture.PreparedEval:
        for eval_entry in prepared_run.evals:
            if eval_entry.eval_id == eval_id:
                return eval_entry
        self.fail(f"eval_id {eval_id} not found in prepared run")

    def test_returns_prepared_run_without_writing_handoff_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            prepared_run = self._run_prepare(skill_path, temp_path / "runs")
            eval_entry = self._prepared_eval(prepared_run)

            self.assertEqual(
                prepared_run.eval_definitions_path,
                (skill_path / "evals" / "evals.json").resolve(),
            )
            self.assertEqual(prepared_run.provider, "claude")
            self.assertEqual(prepared_run.skill_name, "demo-skill")
            self.assertEqual(prepared_run.eval_count, 1)
            self.assertFalse(
                (prepared_run.run_root / "prepared_manifest.json").exists()
            )
            self.assertEqual(eval_entry.eval_id, 1)
            self.assertEqual(eval_entry.eval_name, "basic")
            invocation_root = eval_entry.skill_run_path.parents[1]
            self.assertEqual(invocation_root.parent, prepared_run.run_root / "workdirs")
            self.assertEqual(
                eval_entry.skill_run_path, invocation_root / "eval-1" / "skill"
            )
            self.assertEqual(
                eval_entry.baseline_run_path,
                invocation_root / "eval-1" / "baseline",
            )
            self.assertEqual(
                eval_entry.skill_file,
                eval_entry.skill_run_path
                / ".claude"
                / "skills"
                / "demo-skill"
                / "SKILL.md",
            )
            self.assertIsNone(eval_entry.skill_fixture_path)
            self.assertIsNone(eval_entry.baseline_fixture_path)

    def test_places_skill_only_in_skill_provider_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            prepared_run = self._run_prepare(skill_path, temp_path / "runs")
            eval_entry = self._prepared_eval(prepared_run)

            self.assertTrue(
                (
                    eval_entry.skill_run_path
                    / ".claude"
                    / "skills"
                    / "demo-skill"
                    / "SKILL.md"
                ).exists()
            )
            self.assertFalse((eval_entry.baseline_run_path / ".claude").exists())
            self.assertEqual(
                eval_entry.skill_file,
                eval_entry.skill_run_path
                / ".claude"
                / "skills"
                / "demo-skill"
                / "SKILL.md",
            )

    def test_uses_codex_skill_root_for_codex_provider(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            prepared_run = self._run_prepare(
                skill_path, temp_path / "runs", provider="codex"
            )
            eval_entry = self._prepared_eval(prepared_run)

            self.assertTrue(
                (
                    eval_entry.skill_run_path
                    / ".codex"
                    / "skills"
                    / "demo-skill"
                    / "SKILL.md"
                ).exists()
            )
            self.assertFalse((eval_entry.skill_run_path / ".claude").exists())
            self.assertEqual(
                eval_entry.skill_file,
                eval_entry.skill_run_path
                / ".codex"
                / "skills"
                / "demo-skill"
                / "SKILL.md",
            )

    def test_copies_eval_files_into_both_run_types(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                self._minimal_evals(
                    {
                        "eval_name": "file-input",
                        "files": ["evals/files/input.txt"],
                        "turns": [
                            {"prompt": "Read the input file", "expectations": []}
                        ],
                    }
                ),
            )
            input_file = skill_path / "evals" / "files" / "input.txt"
            input_file.parent.mkdir()
            input_file.write_text("sample", encoding="utf-8")

            prepared_run = self._run_prepare(skill_path, temp_path / "runs")
            eval_entry = self._prepared_eval(prepared_run)

            self.assertEqual(
                (eval_entry.skill_run_path / "evals" / "files" / "input.txt").read_text(
                    encoding="utf-8"
                ),
                "sample",
            )
            self.assertEqual(
                (
                    eval_entry.baseline_run_path / "evals" / "files" / "input.txt"
                ).read_text(encoding="utf-8"),
                "sample",
            )

    def test_copies_fixture_into_each_workdir_when_fixture_is_in_workdir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)

            skill_path = self._write_skill(
                temp_path,
                self._minimal_evals(
                    {
                        "eval_name": "fixture",
                        "fixture": "sample-project",
                        "fixture_in_workdir": True,
                        "turns": [
                            {"prompt": "Inspect the project", "expectations": []}
                        ],
                    },
                    fixture_base_path=str(fixtures),
                ),
            )

            prepared_run = self._run_prepare(skill_path, temp_path / "runs")
            eval_entry = self._prepared_eval(prepared_run)

            with_fixture = eval_entry.skill_fixture_path
            without_fixture = eval_entry.baseline_fixture_path
            self.assertEqual(with_fixture.name, "sample-project")
            self.assertEqual(without_fixture.name, "sample-project")
            self.assertTrue(with_fixture.is_relative_to(eval_entry.skill_run_path))
            self.assertTrue(
                without_fixture.is_relative_to(eval_entry.baseline_run_path)
            )
            self.assertEqual(
                (with_fixture / "README.md").read_text(encoding="utf-8"), "fixture"
            )
            self.assertEqual(
                (without_fixture / "README.md").read_text(encoding="utf-8"),
                "fixture",
            )
            self.assertNotEqual(with_fixture, without_fixture)

    def test_keeps_fixture_outside_workdir_when_fixture_is_not_in_workdir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)

            skill_path = self._write_skill(
                temp_path,
                self._minimal_evals(
                    {
                        "eval_name": "external-fixture",
                        "fixture": "sample-project",
                        "fixture_in_workdir": False,
                        "turns": [
                            {
                                "prompt": "The project is at {{FIXTURE_PATH}}.",
                                "expectations": [],
                            }
                        ],
                    },
                    fixture_base_path=str(fixtures),
                ),
            )

            prepared_run = self._run_prepare(skill_path, temp_path / "runs")
            eval_entry = self._prepared_eval(prepared_run)

            with_fixture = eval_entry.skill_fixture_path
            without_fixture = eval_entry.baseline_fixture_path
            self.assertFalse(with_fixture.is_relative_to(eval_entry.skill_run_path))
            self.assertFalse(
                without_fixture.is_relative_to(eval_entry.baseline_run_path)
            )
            self.assertEqual(
                (with_fixture / "README.md").read_text(encoding="utf-8"), "fixture"
            )
            self.assertEqual(
                (without_fixture / "README.md").read_text(encoding="utf-8"),
                "fixture",
            )
            self.assertNotEqual(with_fixture, without_fixture)

    def test_reuses_run_root_and_reserves_workdir_for_each_invocation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            run_base = temp_path / "runs"

            first = self._run_prepare(skill_path, run_base)
            second = self._run_prepare(skill_path, run_base)

            first_path = self._prepared_eval(first).skill_run_path
            second_path = self._prepared_eval(second).skill_run_path
            self.assertEqual(first.run_root, run_base)
            self.assertEqual(second.run_root, run_base)
            self.assertNotEqual(first_path, second_path)
            self.assertEqual(first_path.parents[2], run_base / "workdirs")
            self.assertEqual(second_path.parents[2], run_base / "workdirs")
            self.assertTrue(first_path.exists())
            self.assertTrue(second_path.exists())

    def test_reuses_run_root_and_keeps_invocation_workdirs_isolated(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            fixtures = self._write_fixture_base(temp_path)
            skill_path = self._write_skill(
                temp_path,
                self._minimal_evals(
                    {
                        "eval_name": "fixture",
                        "fixture": "sample-project",
                        "fixture_in_workdir": True,
                    },
                    fixture_base_path=str(fixtures),
                ),
            )
            run_root = temp_path / "runs" / "demo-skill"

            first = self._run_prepare(skill_path, run_root)
            stale_file = first.evals[0].skill_run_path / "stale.txt"
            stale_file.write_text("stale", encoding="utf-8")
            preserved_result = first.run_root / "results" / "iteration-1" / "marker.txt"
            preserved_result.parent.mkdir(parents=True)
            preserved_result.write_text("keep", encoding="utf-8")
            stale_workdir = first.evals[0].skill_run_path.parent / "stale-eval"
            stale_workdir.mkdir()

            second = self._run_prepare(skill_path, run_root)

            self.assertEqual(first.run_root, run_root)
            self.assertEqual(second.run_root, run_root)
            self.assertNotEqual(
                first.evals[0].skill_run_path.parent,
                second.evals[0].skill_run_path.parent,
            )
            self.assertTrue(stale_file.exists())
            self.assertTrue(stale_workdir.exists())
            self.assertEqual(preserved_result.read_text(encoding="utf-8"), "keep")
            self.assertEqual(
                (second.evals[0].skill_fixture_path / "README.md").read_text(
                    encoding="utf-8"
                ),
                "fixture",
            )

    def test_prepares_only_requested_eval_ids(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                {
                    "skill_name": "demo-skill",
                    "evals": [
                        {
                            "id": 1,
                            "eval_name": "first",
                            "turns": [{"prompt": "First", "expectations": []}],
                        },
                        {
                            "id": 2,
                            "eval_name": "second",
                            "turns": [{"prompt": "Second", "expectations": []}],
                        },
                    ],
                },
            )
            run_root = temp_path / "runs"

            prepared_run = self._run_prepare(skill_path, run_root, eval_ids="2")

            self.assertEqual(prepared_run.eval_count, 1)
            self.assertEqual(prepared_run.evals[0].eval_id, 2)
            invocation_root = prepared_run.evals[0].skill_run_path.parents[1]
            self.assertFalse((invocation_root / "eval-1").exists())
            self.assertTrue((invocation_root / "eval-2").exists())

    def test_fixture_staging_uses_only_requested_eval_ids(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                {
                    "skill_name": "demo-skill",
                    "fixture_base_path": str(temp_path / "missing-fixtures"),
                    "evals": [
                        {
                            "id": 1,
                            "eval_name": "fixture",
                            "fixture": "sample-project",
                            "turns": [{"prompt": "Fixture", "expectations": []}],
                        },
                        {
                            "id": 2,
                            "eval_name": "no-fixture",
                            "turns": [{"prompt": "No fixture", "expectations": []}],
                        },
                    ],
                },
            )
            run_root = temp_path / "runs"

            prepared_run = self._run_prepare(skill_path, run_root, eval_ids="2")

            self.assertEqual(prepared_run.eval_count, 1)
            self.assertEqual(prepared_run.evals[0].eval_id, 2)
            self.assertFalse((run_root / "fixtures").exists())


if __name__ == "__main__":
    unittest.main()

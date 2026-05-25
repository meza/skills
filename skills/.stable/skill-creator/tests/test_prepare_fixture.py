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
    ) -> prepare_fixture.PreparedRun:
        return prepare_fixture.FixturePreparer(
            prepare_fixture.PrepareFixtureOptions(
                skill_path=skill_path,
                run_root=run_root,
                provider=provider,
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
            self.assertEqual(
                eval_entry.with_skill_path,
                prepared_run.run_root / "eval-1" / "with_skill",
            )
            self.assertEqual(
                eval_entry.without_skill_path,
                prepared_run.run_root / "eval-1" / "without_skill",
            )
            self.assertEqual(
                eval_entry.skill_file,
                eval_entry.with_skill_path
                / ".claude"
                / "skills"
                / "demo-skill"
                / "SKILL.md",
            )
            self.assertIsNone(eval_entry.with_skill_fixture_path)
            self.assertIsNone(eval_entry.without_skill_fixture_path)

    def test_places_skill_only_in_with_skill_provider_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            prepared_run = self._run_prepare(skill_path, temp_path / "runs")
            eval_entry = self._prepared_eval(prepared_run)

            self.assertTrue(
                (
                    eval_entry.with_skill_path
                    / ".claude"
                    / "skills"
                    / "demo-skill"
                    / "SKILL.md"
                ).exists()
            )
            self.assertFalse((eval_entry.without_skill_path / ".claude").exists())
            self.assertEqual(
                eval_entry.skill_file,
                eval_entry.with_skill_path
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
                    eval_entry.with_skill_path
                    / ".codex"
                    / "skills"
                    / "demo-skill"
                    / "SKILL.md"
                ).exists()
            )
            self.assertFalse((eval_entry.with_skill_path / ".claude").exists())
            self.assertEqual(
                eval_entry.skill_file,
                eval_entry.with_skill_path
                / ".codex"
                / "skills"
                / "demo-skill"
                / "SKILL.md",
            )

    def test_copies_eval_files_into_both_configurations(self):
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
                (
                    eval_entry.with_skill_path / "evals" / "files" / "input.txt"
                ).read_text(encoding="utf-8"),
                "sample",
            )
            self.assertEqual(
                (
                    eval_entry.without_skill_path / "evals" / "files" / "input.txt"
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

            with_fixture = eval_entry.with_skill_fixture_path
            without_fixture = eval_entry.without_skill_fixture_path
            self.assertEqual(with_fixture.name, "sample-project")
            self.assertEqual(without_fixture.name, "sample-project")
            self.assertTrue(with_fixture.is_relative_to(eval_entry.with_skill_path))
            self.assertTrue(
                without_fixture.is_relative_to(eval_entry.without_skill_path)
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

            with_fixture = eval_entry.with_skill_fixture_path
            without_fixture = eval_entry.without_skill_fixture_path
            self.assertFalse(with_fixture.is_relative_to(eval_entry.with_skill_path))
            self.assertFalse(
                without_fixture.is_relative_to(eval_entry.without_skill_path)
            )
            self.assertEqual(
                (with_fixture / "README.md").read_text(encoding="utf-8"), "fixture"
            )
            self.assertEqual(
                (without_fixture / "README.md").read_text(encoding="utf-8"),
                "fixture",
            )
            self.assertNotEqual(with_fixture, without_fixture)

    def test_creates_fresh_prepared_run_root_for_each_invocation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            run_base = temp_path / "runs"

            first = self._run_prepare(skill_path, run_base)
            second = self._run_prepare(skill_path, run_base)

            first_path = self._prepared_eval(first).with_skill_path
            second_path = self._prepared_eval(second).with_skill_path
            self.assertNotEqual(first.run_root, second.run_root)
            self.assertTrue(first_path.exists())
            self.assertTrue(second_path.exists())


if __name__ == "__main__":
    unittest.main()

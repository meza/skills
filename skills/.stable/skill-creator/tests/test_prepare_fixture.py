import argparse
import contextlib
import json
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from scripts import prepare_fixture


PROJECT_ROOT = Path(__file__).resolve().parents[1]


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

    def _run_prepare_process(
        self,
        skill_path: Path,
        run_root: Path,
        provider: str = "claude",
        manifest_path: Path | None = None,
    ) -> SimpleNamespace:
        args = argparse.Namespace(
            skill_path=str(skill_path),
            run_root=str(run_root),
            provider=provider,
            skill_root=None,
            manifest_path=str(manifest_path) if manifest_path else None,
        )

        stdout = io.StringIO()
        stderr = io.StringIO()
        try:
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                summary = prepare_fixture.execute(args)
                print(json.dumps(summary))
        except SystemExit as error:
            code = error.code if isinstance(error.code, int) else 1
            return SimpleNamespace(returncode=code, stdout=stdout.getvalue(), stderr=stderr.getvalue())

        return SimpleNamespace(returncode=0, stdout=stdout.getvalue(), stderr=stderr.getvalue())

    def _run_prepare(
        self,
        skill_path: Path,
        run_root: Path,
        provider: str = "claude",
        manifest_path: Path | None = None,
    ) -> dict:
        result = self._run_prepare_process(skill_path, run_root, provider, manifest_path)
        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout:\n{result.stdout}\n\nstderr:\n{result.stderr}",
        )
        return json.loads(result.stdout)

    def _manifest_from_output(self, output: dict) -> dict:
        manifest_path = Path(output["manifest_path"])
        self.assertTrue(manifest_path.exists())
        return json.loads(manifest_path.read_text(encoding="utf-8"))

    def _manifest_eval(self, manifest: dict, eval_id: int = 1) -> dict:
        for eval_entry in manifest["evals"]:
            if eval_entry["eval_id"] == eval_id:
                return eval_entry
        self.fail(f"eval_id {eval_id} not found in manifest")

    def test_writes_explicit_prepared_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            expected_manifest_path = temp_path / "expected-manifest.json"

            output = self._run_prepare(
                skill_path,
                temp_path / "runs",
                provider="claude",
                manifest_path=expected_manifest_path,
            )
            manifest = self._manifest_from_output(output)
            eval_entry = self._manifest_eval(manifest)

            self.assertEqual(manifest["run_root"], output["run_root"])
            self.assertEqual(manifest["provider"], "claude")
            self.assertEqual(manifest["skill_name"], "demo-skill")
            self.assertEqual(
                output,
                {
                    "manifest_path": str(expected_manifest_path.resolve()),
                    "run_root": manifest["run_root"],
                    "provider": "claude",
                    "skill_name": "demo-skill",
                    "eval_count": 1,
                },
            )
            self.assertEqual(eval_entry["eval_id"], 1)
            self.assertEqual(eval_entry["eval_name"], "basic")
            self.assertEqual(
                Path(eval_entry["with_skill_path"]),
                Path(manifest["run_root"]) / "eval-1" / "with_skill",
            )
            self.assertEqual(
                Path(eval_entry["without_skill_path"]),
                Path(manifest["run_root"]) / "eval-1" / "without_skill",
            )
            self.assertEqual(
                Path(eval_entry["skill_file"]),
                Path(eval_entry["with_skill_path"])
                / ".claude"
                / "skills"
                / "demo-skill"
                / "SKILL.md",
            )
            self.assertIsNone(eval_entry["with_skill_fixture_path"])
            self.assertIsNone(eval_entry["without_skill_fixture_path"])

    def test_defaults_manifest_path_to_prepared_run_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            output = self._run_prepare(skill_path, temp_path / "runs")
            manifest = self._manifest_from_output(output)

            self.assertEqual(
                Path(output["manifest_path"]),
                Path(manifest["run_root"]) / "prepared_manifest.json",
            )

    def test_places_skill_only_in_with_skill_provider_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            output = self._run_prepare(skill_path, temp_path / "runs", provider="claude")
            manifest = self._manifest_from_output(output)
            eval_entry = self._manifest_eval(manifest)

            with_skill = Path(eval_entry["with_skill_path"])
            without_skill = Path(eval_entry["without_skill_path"])

            self.assertTrue(
                (with_skill / ".claude" / "skills" / "demo-skill" / "SKILL.md").exists()
            )
            self.assertFalse((without_skill / ".claude").exists())
            self.assertEqual(
                Path(eval_entry["skill_file"]),
                with_skill / ".claude" / "skills" / "demo-skill" / "SKILL.md",
            )

    def test_uses_codex_skill_root_for_codex_provider(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())

            output = self._run_prepare(skill_path, temp_path / "runs", provider="codex")
            manifest = self._manifest_from_output(output)
            eval_entry = self._manifest_eval(manifest)

            with_skill = Path(eval_entry["with_skill_path"])
            self.assertTrue(
                (with_skill / ".codex" / "skills" / "demo-skill" / "SKILL.md").exists()
            )
            self.assertFalse((with_skill / ".claude").exists())
            self.assertEqual(
                Path(eval_entry["skill_file"]),
                with_skill / ".codex" / "skills" / "demo-skill" / "SKILL.md",
            )

    def test_injected_skill_excludes_eval_and_generated_directories(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            (skill_path / "fixtures").mkdir()
            (skill_path / "fixtures" / "secret.txt").write_text("fixture", encoding="utf-8")
            (skill_path / ".git").mkdir()
            (skill_path / ".git" / "config").write_text("[core]\n", encoding="utf-8")
            (skill_path / "__pycache__").mkdir()
            (skill_path / "__pycache__" / "cache.pyc").write_bytes(b"cache")

            output = self._run_prepare(skill_path, temp_path / "runs")
            manifest = self._manifest_from_output(output)
            eval_entry = self._manifest_eval(manifest)

            injected = (
                Path(eval_entry["with_skill_path"])
                / ".claude"
                / "skills"
                / "demo-skill"
            )
            self.assertTrue((injected / "SKILL.md").exists())
            self.assertFalse((injected / "evals").exists())
            self.assertFalse((injected / "fixtures").exists())
            self.assertFalse((injected / ".git").exists())
            self.assertFalse((injected / "__pycache__").exists())

    def test_copies_eval_files_into_both_configurations(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                self._minimal_evals(
                    {
                        "eval_name": "file-input",
                        "files": ["evals/files/input.txt"],
                        "turns": [{"prompt": "Read the input file", "expectations": []}],
                    }
                ),
            )
            input_file = skill_path / "evals" / "files" / "input.txt"
            input_file.parent.mkdir()
            input_file.write_text("sample", encoding="utf-8")

            output = self._run_prepare(skill_path, temp_path / "runs")
            manifest = self._manifest_from_output(output)
            eval_entry = self._manifest_eval(manifest)

            with_skill = Path(eval_entry["with_skill_path"])
            without_skill = Path(eval_entry["without_skill_path"])
            self.assertEqual(
                (with_skill / "evals" / "files" / "input.txt").read_text(encoding="utf-8"),
                "sample",
            )
            self.assertEqual(
                (without_skill / "evals" / "files" / "input.txt").read_text(encoding="utf-8"),
                "sample",
            )

    def test_rejects_eval_files_that_escape_skill_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(
                temp_path,
                self._minimal_evals(
                    {
                        "eval_name": "bad-file",
                        "files": ["../outside.txt"],
                        "turns": [{"prompt": "Read the input file", "expectations": []}],
                    }
                ),
            )
            (temp_path / "outside.txt").write_text("outside", encoding="utf-8")

            result = self._run_prepare_process(skill_path, temp_path / "runs")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("escapes the skill root", result.stderr)

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
                        "turns": [{"prompt": "Inspect the project", "expectations": []}],
                    },
                    fixture_base_path=str(fixtures),
                ),
            )

            output = self._run_prepare(skill_path, temp_path / "runs")
            manifest = self._manifest_from_output(output)
            eval_entry = self._manifest_eval(manifest)

            with_fixture = Path(eval_entry["with_skill_fixture_path"])
            without_fixture = Path(eval_entry["without_skill_fixture_path"])
            self.assertEqual(with_fixture.name, "sample-project")
            self.assertEqual(without_fixture.name, "sample-project")
            self.assertTrue(with_fixture.is_relative_to(Path(eval_entry["with_skill_path"])))
            self.assertTrue(without_fixture.is_relative_to(Path(eval_entry["without_skill_path"])))
            self.assertEqual((with_fixture / "README.md").read_text(encoding="utf-8"), "fixture")
            self.assertEqual((without_fixture / "README.md").read_text(encoding="utf-8"), "fixture")
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

            output = self._run_prepare(skill_path, temp_path / "runs")
            manifest = self._manifest_from_output(output)
            eval_entry = self._manifest_eval(manifest)

            with_workdir = Path(eval_entry["with_skill_path"])
            without_workdir = Path(eval_entry["without_skill_path"])
            with_fixture = Path(eval_entry["with_skill_fixture_path"])
            without_fixture = Path(eval_entry["without_skill_fixture_path"])
            self.assertFalse(with_fixture.is_relative_to(with_workdir))
            self.assertFalse(without_fixture.is_relative_to(without_workdir))
            self.assertEqual((with_fixture / "README.md").read_text(encoding="utf-8"), "fixture")
            self.assertEqual((without_fixture / "README.md").read_text(encoding="utf-8"), "fixture")
            self.assertNotEqual(with_fixture, without_fixture)

    def test_creates_fresh_prepared_run_root_for_each_invocation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = self._write_skill(temp_path, self._minimal_evals())
            run_base = temp_path / "runs"

            first = self._run_prepare(skill_path, run_base)
            second = self._run_prepare(skill_path, run_base)
            first_manifest = self._manifest_from_output(first)
            second_manifest = self._manifest_from_output(second)

            first_path = Path(self._manifest_eval(first_manifest)["with_skill_path"])
            second_path = Path(self._manifest_eval(second_manifest)["with_skill_path"])
            self.assertNotEqual(first_manifest["run_root"], second_manifest["run_root"])
            self.assertTrue(first_path.exists())
            self.assertTrue(second_path.exists())


if __name__ == "__main__":
    unittest.main()

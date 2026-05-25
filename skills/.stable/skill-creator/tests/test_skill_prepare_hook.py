import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate.prepare_fixture import PreparedEval, PreparedRun
from scripts.evaluate import skill_prepare_hook


class SkillPrepareHookTests(unittest.TestCase):
    def _prepared_run(self, run_root: Path) -> PreparedRun:
        return PreparedRun(
            eval_definitions_path=Path("skill/evals/evals.json"),
            run_root=run_root,
            provider="codex",
            skill_name="demo",
            evals=[
                self._prepared_eval(run_root, 1),
                self._prepared_eval(run_root, 2),
            ],
        )

    def _prepared_eval(self, run_root: Path, eval_id: int) -> PreparedEval:
        return PreparedEval(
            eval_id=eval_id,
            eval_name=f"eval-{eval_id}",
            with_skill_path=run_root / "workdirs" / f"eval-{eval_id}" / "with_skill",
            without_skill_path=run_root
            / "workdirs"
            / f"eval-{eval_id}"
            / "without_skill",
            skill_file=run_root
            / "workdirs"
            / f"eval-{eval_id}"
            / "with_skill"
            / ".codex"
            / "skills"
            / "demo"
            / "SKILL.md",
            with_skill_fixture_path=None,
            without_skill_fixture_path=None,
        )

    def test_missing_skill_prepare_script_is_noop(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            with mock.patch.object(
                skill_prepare_hook.subprocess,
                "run",
            ) as run:
                skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=temp_path / "skill",
                    prepared_run=self._prepared_run(temp_path / "runs"),
                    eval_ids=None,
                )

        run.assert_not_called()

    def test_runs_skill_prepare_script_for_selected_eval_ids(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = temp_path / "skill"
            (skill_path / "scripts").mkdir(parents=True)
            (skill_path / "scripts" / "prepare.py").write_text(
                "print('prepare')\n",
                encoding="utf-8",
            )
            prepared_run = self._prepared_run(temp_path / "runs")

            with mock.patch.object(
                skill_prepare_hook.subprocess,
                "run",
                return_value=mock.Mock(returncode=0, stdout="", stderr=""),
            ) as run:
                skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=skill_path,
                    prepared_run=prepared_run,
                    eval_ids="2",
                )

        run.assert_called_once_with(
            [
                sys.executable,
                str(skill_path / "scripts" / "prepare.py"),
                "--eval-id",
                "2",
                "--eval-run-dir",
                str(prepared_run.run_root / "workdirs" / "eval-2"),
            ],
            cwd=skill_path,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

    def test_runs_skill_prepare_script_for_every_eval_when_no_filter_is_set(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = temp_path / "skill"
            (skill_path / "scripts").mkdir(parents=True)
            (skill_path / "scripts" / "prepare.py").write_text(
                "print('prepare')\n",
                encoding="utf-8",
            )
            prepared_run = self._prepared_run(temp_path / "runs")

            with mock.patch.object(
                skill_prepare_hook.subprocess,
                "run",
                return_value=mock.Mock(returncode=0, stdout="", stderr=""),
            ) as run:
                skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=skill_path,
                    prepared_run=prepared_run,
                    eval_ids=None,
                )

        self.assertEqual(run.call_count, 2)
        self.assertEqual(
            [
                call.args[0][call.args[0].index("--eval-id") + 1]
                for call in run.call_args_list
            ],
            ["1", "2"],
        )

    def test_skill_prepare_script_failure_is_reported_with_context(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = temp_path / "skill"
            (skill_path / "scripts").mkdir(parents=True)
            (skill_path / "scripts" / "prepare.py").write_text(
                "print('prepare')\n",
                encoding="utf-8",
            )

            with (
                mock.patch.object(
                    skill_prepare_hook.subprocess,
                    "run",
                    return_value=mock.Mock(
                        returncode=1,
                        stdout="stdout details",
                        stderr="stderr details",
                    ),
                ),
                self.assertRaisesRegex(
                    skill_prepare_hook.SkillPrepareHookError,
                    "skill-local prepare hook failed for eval id 1",
                ) as raised,
            ):
                skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=skill_path,
                    prepared_run=self._prepared_run(temp_path / "runs"),
                    eval_ids="1",
                )

        self.assertIn("stderr details", str(raised.exception))
        self.assertIn("stdout details", str(raised.exception))

    def test_skill_prepare_script_runs_as_real_integration_hook(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = temp_path / "skill"
            scripts_dir = skill_path / "scripts"
            scripts_dir.mkdir(parents=True)
            (scripts_dir / "prepare.py").write_text(
                "import argparse\n"
                "import json\n"
                "from pathlib import Path\n"
                "parser = argparse.ArgumentParser()\n"
                "parser.add_argument('--eval-id', required=True)\n"
                "parser.add_argument('--eval-run-dir', required=True)\n"
                "args = parser.parse_args()\n"
                "if not Path(args.eval_run_dir).is_dir():\n"
                "    raise SystemExit(f'missing {args.eval_run_dir}')\n"
                "Path(args.eval_run_dir, 'hook.json').write_text(\n"
                "    json.dumps({'eval_id': args.eval_id}), encoding='utf-8'\n"
                ")\n",
                encoding="utf-8",
            )
            prepared_run = self._prepared_run(temp_path / "runs")
            (prepared_run.evals[0].with_skill_path.parent).mkdir(parents=True)

            skill_prepare_hook.run_skill_prepare_hook(
                skill_path=skill_path,
                prepared_run=prepared_run,
                eval_ids="1",
            )

            marker = prepared_run.run_root / "workdirs" / "eval-1" / "hook.json"
            self.assertEqual(
                json.loads(marker.read_text(encoding="utf-8")),
                {"eval_id": "1"},
            )
            self.assertFalse(
                (prepared_run.run_root / "workdirs" / "eval-2" / "hook.json").exists()
            )


if __name__ == "__main__":
    unittest.main()

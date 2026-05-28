import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate import skill_prepare_hook
from scripts.evaluate.eval_job import TimedProcessResult
from scripts.evaluate.prepare_fixture import PreparedEval, PreparedRun


def timed_process_result(
    stdout: str = "",
    stderr: str = "",
    returncode: int = 0,
    timed_out: bool = False,
    duration_ms: int = 100,
) -> TimedProcessResult:
    return TimedProcessResult(
        stdout=stdout,
        stderr=stderr,
        returncode=returncode,
        timed_out=timed_out,
        duration_ms=duration_ms,
    )


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
            skill_run_path=run_root / "workdirs" / f"eval-{eval_id}" / "skill",
            baseline_run_path=run_root / "workdirs" / f"eval-{eval_id}" / "baseline",
            skill_file=run_root
            / "workdirs"
            / f"eval-{eval_id}"
            / "skill"
            / ".codex"
            / "skills"
            / "demo"
            / "SKILL.md",
            skill_fixture_path=None,
            baseline_fixture_path=None,
        )

    def test_missing_skill_prepare_script_is_noop(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            with mock.patch.object(
                skill_prepare_hook,
                "run_with_timeout",
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
            process_registry = mock.Mock()

            with mock.patch.object(
                skill_prepare_hook,
                "run_with_timeout",
                return_value=timed_process_result(),
            ) as run:
                skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=skill_path,
                    prepared_run=prepared_run,
                    eval_ids="2",
                    process_registry=process_registry,
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
            "",
            str(skill_path),
            600,
            process_registry=process_registry,
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
                skill_prepare_hook,
                "run_with_timeout",
                return_value=timed_process_result(),
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

            with mock.patch.object(
                skill_prepare_hook,
                "run_with_timeout",
                return_value=timed_process_result(
                    stdout="stdout details",
                    stderr="stderr details",
                    returncode=1,
                ),
            ):
                result = skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=skill_path,
                    prepared_run=self._prepared_run(temp_path / "runs"),
                    eval_ids="1",
                )

        self.assertEqual(result.failed_eval_ids, {1})
        self.assertIn("stderr details", result.failures[0].message)
        self.assertIn("stdout details", result.failures[0].message)

    def test_skill_prepare_script_failure_redacts_sensitive_streams(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = temp_path / "skill"
            (skill_path / "scripts").mkdir(parents=True)
            (skill_path / "scripts" / "prepare.py").write_text(
                "print('prepare')\n",
                encoding="utf-8",
            )

            with mock.patch.object(
                skill_prepare_hook,
                "run_with_timeout",
                return_value=timed_process_result(
                    stdout="API_KEY=sk-live-stdout safe detail",
                    stderr="Authorization: Bearer stderr-token",
                    returncode=1,
                ),
            ):
                result = skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=skill_path,
                    prepared_run=self._prepared_run(temp_path / "runs"),
                    eval_ids="1",
                )

        message = result.failures[0].message
        self.assertIn("safe detail", message)
        self.assertIn("API_KEY=[REDACTED]", message)
        self.assertIn("Authorization: Bearer [REDACTED]", message)
        self.assertNotIn("sk-live-stdout", message)
        self.assertNotIn("stderr-token", message)

    def test_skill_prepare_script_timeout_is_reported_with_context(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = temp_path / "skill"
            (skill_path / "scripts").mkdir(parents=True)
            (skill_path / "scripts" / "prepare.py").write_text(
                "print('prepare')\n",
                encoding="utf-8",
            )

            with mock.patch.object(
                skill_prepare_hook,
                "run_with_timeout",
                return_value=timed_process_result(
                    stdout="stdout details",
                    stderr="stderr details",
                    timed_out=True,
                ),
            ):
                result = skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=skill_path,
                    prepared_run=self._prepared_run(temp_path / "runs"),
                    eval_ids="1",
                    timeout=5,
                )

        self.assertIn(
            "skill-local prepare hook timed out for eval id 1 after 5s",
            result.failures[0].message,
        )
        self.assertIn("stderr details", result.failures[0].message)
        self.assertIn("stdout details", result.failures[0].message)

    def test_skill_prepare_script_continues_after_one_eval_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            skill_path = temp_path / "skill"
            (skill_path / "scripts").mkdir(parents=True)
            (skill_path / "scripts" / "prepare.py").write_text(
                "print('prepare')\n",
                encoding="utf-8",
            )

            with mock.patch.object(
                skill_prepare_hook,
                "run_with_timeout",
                side_effect=[
                    timed_process_result(returncode=1, stderr="failed first"),
                    timed_process_result(),
                ],
            ) as run:
                result = skill_prepare_hook.run_skill_prepare_hook(
                    skill_path=skill_path,
                    prepared_run=self._prepared_run(temp_path / "runs"),
                    eval_ids=None,
                )

        self.assertEqual(run.call_count, 2)
        self.assertEqual(result.failed_eval_ids, {1})
        self.assertTrue(result.has_failures)

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
            (prepared_run.evals[0].skill_run_path.parent).mkdir(parents=True)

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

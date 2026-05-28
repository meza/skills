import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate.providers import codex as codex_provider
from scripts.evaluate.providers.codex import CodexProvider


class CodexProviderEnvironmentTests(unittest.TestCase):
    def test_process_environment_isolates_home_and_copies_auth_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source_codex_home = temp_path / "source-codex-home"
            source_codex_home.mkdir()
            (source_codex_home / "auth.json").write_text(
                json.dumps({"tokens": {"access_token": "secret-access-token"}}),
                encoding="utf-8",
            )
            (source_codex_home / "config.toml").write_text(
                "model = 'from-user-config'\n",
                encoding="utf-8",
            )
            (source_codex_home / "skills" / "global").mkdir(parents=True)
            user_home = temp_path / "user-home"
            user_home.mkdir()

            with CodexProvider().process_environment(
                {
                    "CODEX_HOME": str(source_codex_home),
                    "HOME": str(user_home),
                    "USERPROFILE": str(user_home),
                    "KEEP": "present",
                },
                str(temp_path / "run"),
                temp_path / "artifacts",
            ) as env:
                isolated_codex_home = Path(env["CODEX_HOME"])
                isolated_home = Path(env["HOME"])

                self.assertNotEqual(isolated_codex_home, source_codex_home)
                self.assertNotEqual(isolated_home, user_home)
                self.assertEqual(isolated_codex_home, temp_path / "run" / ".codex")
                self.assertEqual(env["USERPROFILE"], str(isolated_home))
                self.assertEqual(env["KEEP"], "present")
                self.assertNotIn("CODEX_API_KEY", env)
                self.assertNotIn("CODEX_ACCESS_TOKEN", env)
                self.assertEqual(
                    json.loads(
                        (isolated_codex_home / "auth.json").read_text(encoding="utf-8")
                    ),
                    {"tokens": {"access_token": "secret-access-token"}},
                )
                self.assertFalse((isolated_codex_home / "config.toml").exists())
                self.assertFalse((isolated_codex_home / "skills").exists())
                self.assertTrue(isolated_home.exists())

            self.assertTrue(isolated_codex_home.exists())
            self.assertFalse((isolated_codex_home / "auth.json").exists())
            self.assertFalse(isolated_home.exists())

    def test_process_environment_uses_home_codex_auth_without_codex_home(
        self,
    ):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            user_home = temp_path / "user-home"
            auth_home = user_home / ".codex"
            auth_home.mkdir(parents=True)
            (auth_home / "auth.json").write_text(
                json.dumps({"tokens": {"access_token": "home-token"}}),
                encoding="utf-8",
            )

            with CodexProvider().process_environment(
                {"HOME": str(user_home)},
                str(temp_path / "run"),
                temp_path / "artifacts",
            ) as env:
                isolated_auth = Path(env["CODEX_HOME"]) / "auth.json"
                self.assertEqual(
                    json.loads(isolated_auth.read_text(encoding="utf-8")),
                    {"tokens": {"access_token": "home-token"}},
                )
                self.assertNotIn("CODEX_ACCESS_TOKEN", env)

            self.assertFalse(isolated_auth.exists())

    def test_process_environment_removes_copied_auth_when_run_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source_codex_home = temp_path / "source-codex-home"
            source_codex_home.mkdir()
            (source_codex_home / "auth.json").write_text(
                json.dumps({"tokens": {"access_token": "secret-access-token"}}),
                encoding="utf-8",
            )

            with self.assertRaises(RuntimeError):
                with CodexProvider().process_environment(
                    {"CODEX_HOME": str(source_codex_home)},
                    str(temp_path / "run"),
                    temp_path / "artifacts",
                ) as env:
                    isolated_auth = Path(env["CODEX_HOME"]) / "auth.json"
                    self.assertTrue(isolated_auth.exists())
                    raise RuntimeError("run failed")

            self.assertFalse(isolated_auth.exists())

    def test_process_environment_does_not_require_existing_auth(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source_codex_home = temp_path / "source-codex-home"
            source_codex_home.mkdir()

            with CodexProvider().process_environment(
                {
                    "CODEX_HOME": str(source_codex_home),
                    "CODEX_API_KEY": "parent-api-key",
                    "CODEX_ACCESS_TOKEN": "parent-access-token",
                },
                str(temp_path / "run"),
                temp_path / "artifacts",
            ) as env:
                self.assertFalse((Path(env["CODEX_HOME"]) / "auth.json").exists())
                self.assertNotIn("CODEX_API_KEY", env)
                self.assertNotIn("CODEX_ACCESS_TOKEN", env)

    def test_process_environment_filters_non_codex_secrets(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source_codex_home = temp_path / "source-codex-home"
            source_codex_home.mkdir()

            with CodexProvider().process_environment(
                {
                    "CODEX_HOME": str(source_codex_home),
                    "PATH": "bin",
                    "GITHUB_TOKEN": "github-secret",
                    "AWS_SECRET_ACCESS_KEY": "aws-secret",
                    "SAFE_SETTING": "kept",
                },
                str(temp_path / "run"),
                temp_path / "artifacts",
            ) as env:
                self.assertEqual(env["PATH"], "bin")
                self.assertEqual(env["SAFE_SETTING"], "kept")
                self.assertNotIn("GITHUB_TOKEN", env)
                self.assertNotIn("AWS_SECRET_ACCESS_KEY", env)

    def test_process_environment_reports_uncopyable_auth_without_secret_value(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source_codex_home = temp_path / "source-codex-home"
            source_codex_home.mkdir()
            (source_codex_home / "auth.json").write_text(
                json.dumps({"tokens": {"access_token": "secret-access-token"}}),
                encoding="utf-8",
            )

            with (
                mock.patch.object(
                    codex_provider.shutil,
                    "copy2",
                    side_effect=OSError("copy failed secret-access-token"),
                ),
                self.assertRaises(RuntimeError) as raised,
            ):
                with CodexProvider().process_environment(
                    {"CODEX_HOME": str(source_codex_home)},
                    str(temp_path / "run"),
                    temp_path / "artifacts",
                ):
                    pass

            self.assertNotIn("secret-access-token", str(raised.exception))

    def test_remove_copied_auth_reports_cleanup_failure_without_secret_value(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            codex_home = Path(temp_dir) / ".codex"
            codex_home.mkdir()
            (codex_home / "auth.json").write_text(
                json.dumps({"tokens": {"access_token": "secret-access-token"}}),
                encoding="utf-8",
            )

            with (
                mock.patch.object(
                    codex_provider.Path,
                    "unlink",
                    side_effect=OSError("delete failed secret-access-token"),
                ),
                self.assertRaises(RuntimeError) as raised,
            ):
                codex_provider._remove_copied_codex_auth_file(codex_home)

            self.assertNotIn("secret-access-token", str(raised.exception))

    def test_build_command_filters_secret_env_vars_from_codex_shell_tools(self):
        command = CodexProvider().build_command(
            session_id=None,
            session_name="session",
            turn_index=0,
            model=None,
        )

        self.assertIn("-c", command)
        self.assertIn(
            "shell_environment_policy.ignore_default_excludes=false",
            command,
        )

    def test_build_command_disables_bundled_skills_and_plugins(self):
        command = CodexProvider().build_command(
            session_id=None,
            session_name="session",
            turn_index=0,
            model=None,
        )

        self.assertIn("skills.bundled.enabled=false", command)
        self.assertIn("features.plugins=false", command)

    def test_build_command_sets_execution_policy_before_prompt(self):
        command = CodexProvider().build_command(
            session_id=None,
            session_name="session",
            turn_index=0,
            model=None,
            working_dir="F:/runs/eval-1/skill",
        )

        prompt_index = command.index("-")
        self.assertLess(command.index("--cd"), prompt_index)
        self.assertLess(command.index("--add-dir"), prompt_index)
        self.assertEqual(
            command[command.index("--add-dir") + 1],
            "F:/runs/eval-1/skill",
        )
        self.assertLess(command.index("--ignore-rules"), prompt_index)

    def test_build_command_enables_windows_workspace_write_sandbox(self):
        start_command = CodexProvider().build_command(
            session_id=None,
            session_name="session",
            turn_index=0,
            model=None,
            working_dir="F:/runs/eval-1/skill",
        )
        resume_command = CodexProvider().build_command(
            session_id="thread-123",
            session_name="session",
            turn_index=1,
            model=None,
        )
        grading_command = CodexProvider().build_grading_command(
            model=None,
            effort=None,
            working_dir="F:/runs/eval-1/skill",
            output_schema="F:/schemas/grading.schema.json",
        )

        for command in (start_command, resume_command, grading_command):
            self.assertIn("--enable", command)
            self.assertEqual(
                command[command.index("--enable") + 1],
                "experimental_windows_sandbox",
            )

    def test_resume_command_carries_writable_sandbox_config(self):
        command = CodexProvider().build_command(
            session_id="thread-123",
            session_name="session",
            turn_index=1,
            model=None,
        )

        self.assertIn("-c", command)
        self.assertIn('sandbox_mode="workspace-write"', command)

    def test_commands_disable_approval_requests(self):
        start_command = CodexProvider().build_command(
            session_id=None,
            session_name="session",
            turn_index=0,
            model=None,
            working_dir="F:/runs/eval-1/skill",
        )
        resume_command = CodexProvider().build_command(
            session_id="thread-123",
            session_name="session",
            turn_index=1,
            model=None,
        )
        grading_command = CodexProvider().build_grading_command(
            model=None,
            effort=None,
            working_dir="F:/runs/eval-1/skill",
            output_schema="F:/schemas/grading.schema.json",
        )

        self.assertIn('approval_policy="never"', start_command)
        self.assertIn('approval_policy="never"', resume_command)
        self.assertIn('approval_policy="never"', grading_command)

    def test_build_grading_command_applies_output_schema(self):
        command = CodexProvider().build_grading_command(
            model="gpt-5.5",
            effort=None,
            working_dir="F:/runs/eval-1/skill",
            output_schema="F:/schemas/grading.schema.json",
        )

        self.assertIn("--output-schema", command)
        self.assertEqual(
            command[command.index("--output-schema") + 1],
            "F:/schemas/grading.schema.json",
        )
        self.assertIn("--cd", command)
        self.assertEqual(
            command[command.index("--cd") + 1],
            "F:/runs/eval-1/skill",
        )
        self.assertIn("--sandbox", command)
        self.assertEqual(command[command.index("--sandbox") + 1], "workspace-write")
        self.assertIn("--model", command)
        self.assertEqual(command[command.index("--model") + 1], "gpt-5.5")

    def test_build_command_resumes_existing_session(self):
        command = CodexProvider().build_command(
            session_id="thread-123",
            session_name="session",
            turn_index=1,
            model="gpt-5.5",
        )

        self.assertEqual(
            command[1:],
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
                "gpt-5.5",
            ],
        )
        self.assertNotIn("--ephemeral", command)
        self.assertNotIn("--sandbox", command)

    def test_build_command_rejects_resume_without_session_id(self):
        with self.assertRaisesRegex(
            ValueError,
            "Codex resume requires a session_id after turn 0",
        ):
            CodexProvider().build_command(
                session_id=None,
                session_name="session",
                turn_index=1,
                model=None,
            )

    def test_provider_metadata_matches_codex_skill_layout(self):
        provider = CodexProvider()

        self.assertEqual(provider.skill_root, ".codex")
        self.assertTrue(provider.requires_first_turn_session_id)

    def test_parse_output_extracts_response_transcript_session_and_usage(self):
        stdout = "\n".join(
            [
                "",
                "not json",
                json.dumps({"type": "thread.started", "thread_id": "thread-123"}),
                json.dumps(
                    {
                        "type": "item.completed",
                        "item": {
                            "type": "command_execution",
                            "command": "git status",
                            "aggregated_output": "clean",
                        },
                    }
                ),
                json.dumps(
                    {
                        "type": "item.completed",
                        "item": {
                            "type": "agent_message",
                            "text": "first response",
                        },
                    }
                ),
                json.dumps(
                    {
                        "type": "item.completed",
                        "item": {
                            "type": "agent_message",
                            "text": "final response",
                        },
                    }
                ),
                json.dumps(
                    {
                        "type": "turn.completed",
                        "usage": {
                            "input_tokens": 10,
                            "cached_input_tokens": 3,
                            "output_tokens": 5,
                        },
                    }
                ),
            ]
        )

        result = CodexProvider().parse_output(stdout, "Do it")

        self.assertEqual(result.response, "final response")
        self.assertEqual(result.session_id, "thread-123")
        self.assertEqual(result.input_tokens, 13)
        self.assertEqual(result.output_tokens, 5)
        self.assertIn("[USER INPUT]\nDo it", result.transcript)
        self.assertIn("[TOOL CALL] shell\ngit status", result.transcript)
        self.assertIn("[TOOL RESULT]\nclean", result.transcript)
        self.assertIn("[ASSISTANT TEXT]\nfinal response", result.transcript)
        self.assertEqual(len(result.events), 6)
        self.assertEqual(
            result.events[0],
            {
                "type": "provider.parse_warning",
                "provider": "codex",
                "line": 2,
                "message": "Malformed JSON event",
                "content": "not json",
            },
        )

    def test_parse_output_handles_missing_optional_codex_events(self):
        stdout = "\n".join(
            [
                json.dumps({"type": "item.completed", "item": {"type": "reasoning"}}),
                json.dumps(
                    {
                        "type": "item.completed",
                        "item": {"type": "command_execution"},
                    }
                ),
            ]
        )

        result = CodexProvider().parse_output(stdout, "Do it")

        self.assertEqual(result.response, "")
        self.assertIsNone(result.session_id)
        self.assertEqual(result.input_tokens, 0)
        self.assertEqual(result.output_tokens, 0)
        self.assertEqual(result.transcript, "[USER INPUT]\nDo it")

    def test_source_codex_home_uses_userprofile_when_home_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            user_profile = Path(temp_dir) / "profile"

            self.assertEqual(
                codex_provider._source_codex_home({"USERPROFILE": str(user_profile)}),
                user_profile / ".codex",
            )

    def test_source_codex_home_uses_path_home_when_env_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir) / "fallback-home"

            with mock.patch.object(codex_provider.Path, "home", return_value=home):
                self.assertEqual(
                    codex_provider._source_codex_home({}),
                    home / ".codex",
                )

    def test_find_codex_executable_prefers_codex_then_windows_command(self):
        with mock.patch.object(
            codex_provider.shutil,
            "which",
            side_effect=["/bin/codex", "/bin/codex.cmd"],
        ):
            self.assertEqual(codex_provider._find_codex_executable(), "/bin/codex")

        with mock.patch.object(
            codex_provider.shutil,
            "which",
            side_effect=[None, "/bin/codex.cmd"],
        ):
            self.assertEqual(
                codex_provider._find_codex_executable(),
                "/bin/codex.cmd",
            )

        with mock.patch.object(
            codex_provider.shutil,
            "which",
            return_value=None,
        ):
            self.assertEqual(codex_provider._find_codex_executable(), "codex")


if __name__ == "__main__":
    unittest.main()

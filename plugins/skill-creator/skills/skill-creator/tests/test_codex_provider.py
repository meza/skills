import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate.providers import codex as codex_provider
from scripts.evaluate.providers.codex import CodexProvider

# A Windows drive letter is absolute on Windows but a *relative* path on POSIX
# (and "/x" is the reverse), so synthetic absolute paths must be anchored to
# the running platform's filesystem root to stay absolute everywhere.
FAKE_ROOT = Path(Path(tempfile.gettempdir()).anchor)


class CodexProviderEnvironmentTests(unittest.TestCase):
    def _build_all_commands(self, effort):
        provider = CodexProvider()
        return [
            provider.build_command(
                session_id=None,
                session_name="session",
                turn_index=0,
                model=None,
                effort=effort,
            ),
            provider.build_command(
                session_id="thread-123",
                session_name="session",
                turn_index=1,
                model=None,
                effort=effort,
            ),
            provider.build_grading_command(
                model=None,
                effort=effort,
                working_dir=str(FAKE_ROOT / "runs/eval-1/skill"),
                output_schema=str(FAKE_ROOT / "schemas/grading.schema.json"),
            ),
        ]

    def test_command_builders_share_codex_eval_policy_args(self):
        policy_args = codex_provider._codex_eval_policy_args()

        start_command = CodexProvider().build_command(
            session_id=None,
            session_name="session",
            turn_index=0,
            model=None,
            working_dir=str(FAKE_ROOT / "runs/eval-1/skill"),
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
            working_dir=str(FAKE_ROOT / "runs/eval-1/skill"),
            output_schema=str(FAKE_ROOT / "schemas/grading.schema.json"),
        )

        for command in (start_command, resume_command, grading_command):
            for arg in policy_args:
                self.assertIn(arg, command)

    def test_command_builders_forward_reasoning_effort(self):
        for command in self._build_all_commands(effort="high"):
            self.assertIn('model_reasoning_effort="high"', command)

    def test_command_builders_omit_reasoning_effort_when_unspecified(self):
        for command in self._build_all_commands(effort=None):
            self.assertFalse(
                any(arg.startswith("model_reasoning_effort=") for arg in command)
            )

    def test_build_command_safely_quotes_reasoning_effort(self):
        effort = 'high"\nlow'

        command = self._build_all_commands(effort=effort)[0]

        self.assertIn(f"model_reasoning_effort={json.dumps(effort)}", command)

    def test_command_builders_disable_login_shells(self):
        for command in self._build_all_commands(effort=None):
            self.assertIn("allow_login_shell=false", command)

    def test_command_builders_select_elevated_windows_sandbox(self):
        for command in self._build_all_commands(effort=None):
            self.assertIn('windows.sandbox="elevated"', command)

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
            run_dir = temp_path / "run"
            prepared_skill = run_dir / ".codex" / "skills" / "demo" / "SKILL.md"
            prepared_skill.parent.mkdir(parents=True)
            prepared_skill.write_text("demo skill", encoding="utf-8")
            user_home = temp_path / "user-home"
            user_home.mkdir()

            with CodexProvider().process_environment(
                {
                    "CODEX_HOME": str(source_codex_home),
                    "HOME": str(user_home),
                    "USERPROFILE": str(user_home),
                    "KEEP": "present",
                },
                str(run_dir),
                temp_path / "artifacts",
            ) as env:
                isolated_codex_home = Path(env["CODEX_HOME"])
                isolated_home = Path(env["HOME"])

                self.assertNotEqual(isolated_codex_home, source_codex_home)
                self.assertNotEqual(isolated_home, user_home)
                self.assertFalse(isolated_codex_home.is_relative_to(run_dir))
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
                self.assertEqual(
                    (isolated_codex_home / "skills" / "demo" / "SKILL.md").read_text(
                        encoding="utf-8"
                    ),
                    "demo skill",
                )
                self.assertTrue(isolated_home.exists())

            self.assertFalse(isolated_codex_home.exists())
            self.assertFalse((isolated_codex_home / "auth.json").exists())
            self.assertFalse(isolated_home.exists())

    def test_process_environment_keeps_codex_auth_outside_agent_workspace(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source_codex_home = temp_path / "source-codex-home"
            source_codex_home.mkdir()
            (source_codex_home / "auth.json").write_text(
                json.dumps({"tokens": {"access_token": "secret-access-token"}}),
                encoding="utf-8",
            )
            run_dir = temp_path / "run"

            with CodexProvider().process_environment(
                {"CODEX_HOME": str(source_codex_home)},
                str(run_dir),
                temp_path / "artifacts",
            ) as env:
                isolated_codex_home = Path(env["CODEX_HOME"])
                isolated_auth = isolated_codex_home / "auth.json"

                self.assertTrue(isolated_auth.exists())
                self.assertFalse(isolated_codex_home.is_relative_to(run_dir))
                self.assertFalse((run_dir / ".codex" / "auth.json").exists())

    def test_process_environment_writes_codex_auth_audit_events(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            source_codex_home = temp_path / "source-codex-home"
            source_codex_home.mkdir()
            (source_codex_home / "auth.json").write_text(
                json.dumps({"tokens": {"access_token": "secret-access-token"}}),
                encoding="utf-8",
            )
            artifact_dir = temp_path / "artifacts"

            with CodexProvider().process_environment(
                {"CODEX_HOME": str(source_codex_home)},
                str(temp_path / "run"),
                artifact_dir,
            ):
                pass

            audit_log = artifact_dir / "sensitive_actions.jsonl"
            raw_audit = audit_log.read_text(encoding="utf-8")
            audit_events = [
                json.loads(line) for line in raw_audit.splitlines() if line.strip()
            ]

            self.assertEqual(audit_events[0]["type"], "codex.auth_staged")
            self.assertEqual(
                audit_events[0]["source"],
                str(source_codex_home / "auth.json"),
            )
            self.assertEqual(audit_events[1]["type"], "codex.auth_removed")
            self.assertEqual(audit_events[1]["target"], audit_events[0]["target"])
            self.assertFalse(
                Path(audit_events[0]["target"]).is_relative_to(temp_path / "run")
            )
            self.assertNotIn("secret-access-token", raw_audit)

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
        external_fixture = str(FAKE_ROOT / "runs/eval-1/skill-fixtures/project")
        command = CodexProvider().build_command(
            session_id=None,
            session_name="session",
            turn_index=0,
            model=None,
            working_dir=str(FAKE_ROOT / "runs/eval-1/skill"),
            additional_writable_dirs=[external_fixture],
        )

        prompt_index = command.index("-")
        self.assertLess(command.index("--cd"), prompt_index)
        self.assertLess(command.index("--add-dir"), prompt_index)
        self.assertEqual(
            command[command.index("--add-dir") + 1],
            str(FAKE_ROOT / "runs/eval-1/skill"),
        )
        self.assertEqual(command.count("--add-dir"), 2)
        self.assertEqual(
            command[command.index("--add-dir", command.index("--add-dir") + 1) + 1],
            external_fixture,
        )
        self.assertLess(command.index("--ignore-rules"), prompt_index)

    def test_command_builders_omit_obsolete_windows_sandbox_feature(self):
        for command in self._build_all_commands(effort=None):
            self.assertNotIn("experimental_windows_sandbox", command)

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
            working_dir=str(FAKE_ROOT / "runs/eval-1/skill"),
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
            working_dir=str(FAKE_ROOT / "runs/eval-1/skill"),
            output_schema=str(FAKE_ROOT / "schemas/grading.schema.json"),
        )

        self.assertIn('approval_policy="never"', start_command)
        self.assertIn('approval_policy="never"', resume_command)
        self.assertIn('approval_policy="never"', grading_command)

    def test_build_grading_command_applies_output_schema(self):
        command = CodexProvider().build_grading_command(
            model="gpt-5.5",
            effort=None,
            working_dir=str(FAKE_ROOT / "runs/eval-1/skill"),
            output_schema=str(FAKE_ROOT / "schemas/grading.schema.json"),
        )

        self.assertIn("--output-schema", command)
        self.assertEqual(
            command[command.index("--output-schema") + 1],
            str(FAKE_ROOT / "schemas/grading.schema.json"),
        )
        self.assertIn("--cd", command)
        self.assertEqual(
            command[command.index("--cd") + 1],
            str(FAKE_ROOT / "runs/eval-1/skill"),
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
                "--ignore-user-config",
                "--ignore-rules",
                "-c",
                "shell_environment_policy.ignore_default_excludes=false",
                "-c",
                'approval_policy="never"',
                "-c",
                "allow_login_shell=false",
                "-c",
                'windows.sandbox="elevated"',
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
                "not json TOKEN=secret-value",
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
                "content": "not json TOKEN=[REDACTED]",
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

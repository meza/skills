import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from prompt_format import SYSTEM_NOTIFICATION_SECTION, USER_INPUT_SECTION
from providers.claude import _extract_transcript as extract_claude_transcript
from providers.codex import (
    CodexProvider,
    _extract_response as extract_codex_response,
    _extract_transcript as extract_codex_transcript,
)
from run_skill_evals import build_prompt


class RunSkillEvalsPromptTests(unittest.TestCase):
    def test_build_prompt_wraps_force_skill_as_system_notification(self):
        prompt = build_prompt(
            "Please update the fixture.",
            {"turns": []},
            fixture_path=None,
            skill_file="F:/tmp/.codex/skills/example/SKILL.md",
        )

        self.assertEqual(
            prompt,
            (
                f"{SYSTEM_NOTIFICATION_SECTION}\n"
                "Use this skill at F:/tmp/.codex/skills/example/SKILL.md to complete this task.\n\n"
                f"{USER_INPUT_SECTION}\n"
                "Please update the fixture."
            ),
        )

    def test_build_prompt_without_force_skill_preserves_plain_user_prompt(self):
        prompt = build_prompt(
            "Please update the fixture.",
            {"turns": []},
            fixture_path=None,
            skill_file=None,
        )

        self.assertEqual(prompt, "Please update the fixture.")

    def test_claude_transcript_keeps_system_notification_out_of_user_input(self):
        prompt = build_prompt(
            "Implement the change.",
            {"turns": []},
            fixture_path=None,
            skill_file="F:/tmp/.claude/skills/example/SKILL.md",
        )

        transcript = extract_claude_transcript([], prompt)

        self.assertIn(
            "[SYSTEM NOTIFICATION]\nUse this skill at F:/tmp/.claude/skills/example/SKILL.md to complete this task.",
            transcript,
        )
        self.assertIn("[USER INPUT]\nImplement the change.", transcript)

    def test_codex_transcript_keeps_system_notification_out_of_user_input(self):
        prompt = build_prompt(
            "Implement the change.",
            {"turns": []},
            fixture_path=None,
            skill_file="F:/tmp/.codex/skills/example/SKILL.md",
        )

        transcript = extract_codex_transcript([], prompt)

        self.assertIn(
            "[SYSTEM NOTIFICATION]\nUse this skill at F:/tmp/.codex/skills/example/SKILL.md to complete this task.",
            transcript,
        )
        self.assertIn("[USER INPUT]\nImplement the change.", transcript)


class CodexProviderTests(unittest.TestCase):
    def test_build_command_sets_cwd_for_turn_zero_only(self):
        provider = CodexProvider()

        start_command = provider.build_command(
            session_id=None,
            session_name="eval-1-with_skill",
            turn_index=0,
            model="gpt-5.4",
            working_dir="F:/tmp/eval-1/with_skill",
        )

        self.assertTrue(start_command[0].lower().endswith("codex") or start_command[0].lower().endswith("codex.cmd"))
        self.assertEqual(
            start_command[1:],
            [
                "exec",
                "--json",
                "--skip-git-repo-check",
                "-",
                "--cd",
                "F:/tmp/eval-1/with_skill",
                "--model",
                "gpt-5.4",
            ],
        )

        resume_command = provider.build_command(
            session_id="thread-123",
            session_name="eval-1-with_skill",
            turn_index=1,
            model="gpt-5.4",
            working_dir="F:/tmp/eval-1/with_skill",
        )

        self.assertEqual(
            resume_command[1:],
            [
                "exec",
                "resume",
                "--json",
                "--skip-git-repo-check",
                "thread-123",
                "-",
                "--model",
                "gpt-5.4",
            ],
        )

    def test_extract_response_returns_last_agent_message_only(self):
        response = extract_codex_response(
            [
                {"type": "item.completed", "item": {"type": "agent_message", "text": "progress note"}},
                {"type": "item.completed", "item": {"type": "command_execution", "command": "git status"}},
                {"type": "item.completed", "item": {"type": "agent_message", "text": "fix(auth): reject malformed token signatures safely"}},
            ]
        )

        self.assertEqual(response, "fix(auth): reject malformed token signatures safely")


if __name__ == "__main__":
    unittest.main()

import json
import unittest

from scripts.evaluate.providers.claude import ClaudeProvider


def stream_json(*events: dict, invalid_line: bool = False) -> str:
    lines = ["", *(json.dumps(event) for event in events)]
    if invalid_line:
        lines.insert(1, "{not-json")
    return "\n".join(lines)


class ClaudeProviderCommandTests(unittest.TestCase):
    def test_first_turn_command_starts_named_session(self):
        command = ClaudeProvider().build_command(
            session_id="session-123",
            session_name="eval-1-skill",
            turn_index=0,
            model="claude-sonnet-4-5",
            effort="high",
            working_dir="F:/tmp/eval-1/skill",
        )

        self.assertEqual(
            command,
            [
                "claude",
                "-p",
                "--effort",
                "high",
                "--session-id",
                "session-123",
                "--name",
                "eval-1-skill",
                "--output-format",
                "stream-json",
                "--verbose",
                "--permission-mode",
                "bypassPermissions",
                "--model",
                "claude-sonnet-4-5",
            ],
        )

    def test_resume_command_uses_default_effort_and_existing_session(self):
        command = ClaudeProvider().build_command(
            session_id="session-123",
            session_name="eval-1-skill",
            turn_index=1,
            model=None,
        )

        self.assertEqual(
            command,
            [
                "claude",
                "-p",
                "--effort",
                "medium",
                "--resume",
                "session-123",
                "--output-format",
                "stream-json",
                "--verbose",
                "--permission-mode",
                "bypassPermissions",
            ],
        )

    def test_command_requires_session_id(self):
        with self.assertRaisesRegex(ValueError, "ClaudeProvider requires a session_id"):
            ClaudeProvider().build_command(
                session_id=None,
                session_name="eval-1-skill",
                turn_index=0,
                model=None,
            )

    def test_provider_declares_claude_skill_layout(self):
        provider = ClaudeProvider()

        self.assertEqual(provider.skill_root, ".claude")

    def test_grading_command_uses_single_shot_stream_json_command(self):
        command = ClaudeProvider().build_grading_command(
            model="claude-sonnet-4-5",
            effort="high",
            working_dir="F:/tmp/eval-1/skill",
            output_schema="F:/schemas/grading.schema.json",
        )

        self.assertEqual(
            command,
            [
                "claude",
                "-p",
                "--effort",
                "high",
                "--output-format",
                "stream-json",
                "--verbose",
                "--permission-mode",
                "bypassPermissions",
                "--model",
                "claude-sonnet-4-5",
            ],
        )


class ClaudeProviderParseOutputTests(unittest.TestCase):
    def test_parse_output_extracts_response_transcript_and_usage(self):
        stdout = stream_json(
            {
                "type": "assistant",
                "message": {
                    "content": [
                        {"type": "text", "text": "I will inspect it."},
                        {"type": "tool_use", "name": "shell", "input": {"cmd": "ls"}},
                        {"type": "unknown", "value": "ignored"},
                    ]
                },
            },
            {
                "type": "user",
                "message": {
                    "content": [
                        {
                            "type": "tool_result",
                            "content": "file-a\nfile-b",
                        },
                        {"type": "text", "text": "ignored"},
                    ]
                },
            },
            {
                "type": "assistant",
                "message": {
                    "content": [
                        {"type": "text", "text": "Done."},
                        {"type": "text"},
                    ]
                },
            },
            {
                "type": "result",
                "duration_ms": 1,
                "total_cost_usd": 0.1,
                "usage": {"input_tokens": 1, "output_tokens": 2},
            },
            {
                "type": "result",
                "duration_ms": 1234,
                "total_cost_usd": 0.25,
                "usage": {
                    "input_tokens": 10,
                    "cache_read_input_tokens": 20,
                    "cache_creation_input_tokens": 30,
                    "output_tokens": 40,
                },
            },
            {"type": "unknown"},
            invalid_line=True,
        )

        result = ClaudeProvider().parse_output(
            stdout,
            "[SYSTEM NOTIFICATION]\nUse the skill.\n\n[USER INPUT]\nFix this.",
        )

        self.assertEqual(result.response, "I will inspect it.\n\nDone.")
        self.assertEqual(result.events[-1], {"type": "unknown"})
        self.assertEqual(
            result.events[0],
            {
                "type": "provider.parse_warning",
                "provider": "claude",
                "line": 2,
                "message": "Malformed JSON event",
                "content": "{not-json",
            },
        )
        self.assertEqual(result.duration_ms, 1234)
        self.assertEqual(result.input_tokens, 60)
        self.assertEqual(result.output_tokens, 40)
        self.assertEqual(result.cost_usd, 0.25)
        self.assertIn("[SYSTEM NOTIFICATION]\nUse the skill.", result.transcript)
        self.assertIn("[USER INPUT]\nFix this.", result.transcript)
        self.assertIn("[ASSISTANT TEXT]\nI will inspect it.", result.transcript)
        self.assertIn('[TOOL CALL] shell\n{\n  "cmd": "ls"\n}', result.transcript)
        self.assertIn("[TOOL RESULT]\nfile-a\nfile-b", result.transcript)
        self.assertIn("[ASSISTANT TEXT]\nDone.", result.transcript)
        self.assertNotIn("ignored", result.transcript)

    def test_parse_output_handles_tool_result_lists_and_missing_result_event(self):
        stdout = stream_json(
            {
                "type": "assistant",
                "message": {
                    "content": [
                        {"type": "tool_use"},
                        {"type": "text", "text": ""},
                    ]
                },
            },
            {
                "type": "user",
                "message": {
                    "content": [
                        {
                            "type": "tool_result",
                            "content": [
                                {"text": "first"},
                                "ignored",
                                {"text": "second"},
                            ],
                        }
                    ]
                },
            },
        )

        result = ClaudeProvider().parse_output(stdout, "Plain prompt")

        self.assertEqual(result.response, "")
        self.assertEqual(result.duration_ms, 0)
        self.assertEqual(result.input_tokens, 0)
        self.assertEqual(result.output_tokens, 0)
        self.assertEqual(result.cost_usd, 0.0)
        self.assertIn("[USER INPUT]\nPlain prompt", result.transcript)
        self.assertIn("[TOOL CALL] ?\n{}", result.transcript)
        self.assertIn("[TOOL RESULT]\nfirst\nsecond", result.transcript)

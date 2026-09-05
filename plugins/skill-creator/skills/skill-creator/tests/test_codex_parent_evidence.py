import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate.providers.codex import CodexProvider
from scripts.evaluate.eval_job import EvalJob, TimedProcessResult

PARENT = "01a07231-ae08-74d3-8b74-8ad0f0f94333"
CHILD = "01a07239-0cfa-7fe2-9882-cb32d924620b"


def record(kind, payload):
    return {"timestamp": "2026-09-05T15:39:00Z", "type": kind, "payload": payload}


def call(call_id="call_1"):
    return record(
        "response_item",
        {
            "type": "function_call",
            "namespace": "collaboration",
            "name": "spawn_agent",
            "call_id": call_id,
            "arguments": '{"task_name":"review","message":"Review this"}',
        },
    )


def output(call_id="call_1"):
    return record(
        "response_item",
        {
            "type": "function_call_output",
            "call_id": call_id,
            "output": '{"task_name":"/root/review"}',
        },
    )


def append(path, records):
    data = b"".join(json.dumps(event).encode() + b"\n" for event in records)
    with path.open("ab") as stream:
        stream.write(data)
    return data


class CodexParentEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.home = self.root / "home"
        self.sessions = self.home / "sessions/2026/09/05"
        self.sessions.mkdir(parents=True)
        self.parent = self.sessions / f"rollout-date-{PARENT}.jsonl"
        self.artifacts = self.root / "artifacts"
        self.provider = CodexProvider()
        append(self.parent, [record("session_meta", {"id": PARENT})])

    def capture(self, turn_index=0):
        result = self.provider.parse_output(
            json.dumps({"type": "thread.started", "thread_id": PARENT}), "Go"
        )
        self.provider.enrich_turn_result(
            result, {"CODEX_HOME": str(self.home)}, self.artifacts, turn_index, PARENT
        )
        return result

    def test_capture_parent_calls_results_and_received_plaintext_only(self):
        append(
            self.parent,
            [record("event_msg", {"type": "task_started", "turn_id": "turn-a"})],
        )
        evidence = [
            call(),
            output(),
            record(
                "response_item",
                {
                    "type": "agent_message",
                    "author": "/root/review",
                    "recipient": "/root",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "Review complete: change accepted",
                        }
                    ],
                },
            ),
        ]
        originals = append(self.parent, evidence)
        append(
            self.parent,
            [record("response_item", {"type": "reasoning", "text": "private thought"})],
        )
        child = self.sessions / f"rollout-date-{CHILD}.jsonl"
        append(child, [record("session_meta", {"id": CHILD}), call("child-secret")])
        original_open = Path.open

        def guarded_open(path, *args, **kwargs):
            self.assertNotEqual(path, child)
            return original_open(path, *args, **kwargs)

        with mock.patch.object(Path, "open", guarded_open):
            result = self.capture()
        self.assertIn("spawn_agent", result.transcript)
        self.assertIn("Review complete: change accepted", result.transcript)
        self.assertIn("/root/review", result.transcript)
        self.assertIn("turn-a", result.transcript)
        self.assertNotIn("private thought", result.transcript)
        self.assertEqual(
            (self.artifacts / "parent_collaboration/turn-1.jsonl").read_bytes(),
            originals,
        )

    def test_opaque_received_body_is_preserved_but_not_claimed_readable(self):
        raw = append(
            self.parent,
            [
                record(
                    "response_item",
                    {
                        "type": "agent_message",
                        "author": "/root/review",
                        "recipient": "/root",
                        "content": [
                            {"type": "input_text", "text": "Payload:"},
                            {
                                "type": "encrypted_content",
                                "encrypted_content": "opaque-ciphertext",
                            },
                        ],
                    },
                )
            ],
        )
        result = self.capture()
        self.assertIn("unavailable", result.transcript)
        self.assertNotIn("opaque-ciphertext", result.transcript)
        self.assertEqual(
            (self.artifacts / "parent_collaboration/turn-1.jsonl").read_bytes(), raw
        )

    def test_collaboration_prose_exposes_operations_and_multiline_bodies(self):
        event = call()
        event["payload"]["arguments"] = json.dumps(
            {"task_name": "review", "message": "First line\nSecond line"}
        )
        result_event = output()
        result_event["payload"]["output"] = json.dumps({"message": "Started\nWaiting"})
        append(
            self.parent,
            [
                event,
                result_event,
                record(
                    "response_item",
                    {
                        "type": "agent_message",
                        "author": "/root/review",
                        "recipient": "/root",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "Review body\nSecond paragraph",
                            }
                        ],
                    },
                ),
            ],
        )
        result = self.capture()
        self.assertIn(
            "[COLLABORATION CALL] collaboration.spawn_agent", result.transcript
        )
        self.assertIn("message:\nFirst line\nSecond line", result.transcript)
        self.assertIn("[COLLABORATION RESULT] call_1", result.transcript)
        self.assertIn("Started\nWaiting", result.transcript)
        self.assertIn(
            "[COLLABORATION MESSAGE] /root/review -> /root", result.transcript
        )
        self.assertIn("Review body\nSecond paragraph", result.transcript)

    def test_resumed_capture_joins_pending_result_without_repeating_call(self):
        append(self.parent, [call()])
        self.capture()
        later = append(
            self.parent,
            [
                record("event_msg", {"type": "task_started", "turn_id": "turn-b"}),
                output(),
            ],
        )
        result = self.capture(1)
        self.assertNotIn('"arguments"', result.transcript)
        self.assertIn("/root/review", result.transcript)
        self.assertEqual(
            (self.artifacts / "parent_collaboration/turn-2.jsonl").read_bytes(),
            later.split(b"\n", 1)[1],
        )

    def test_missing_parent_is_reported_without_reading_child(self):
        self.parent.unlink()
        result = self.capture()
        self.assertIn("unavailable", result.transcript)
        self.assertIn("not proof", result.transcript)
        self.assertFalse((self.artifacts / "parent_collaboration/cursor.json").exists())

    def test_failed_artifact_write_does_not_advance_cursor(self):
        append(self.parent, [call()])
        self.capture()
        cursor = self.artifacts / "parent_collaboration/cursor.json"
        before = cursor.read_bytes()
        append(self.parent, [output()])
        original_open = Path.open

        def failing_open(path, *args, **kwargs):
            if path.name == "turn-2.jsonl":
                raise OSError("cannot write evidence")
            return original_open(path, *args, **kwargs)

        with mock.patch.object(Path, "open", failing_open):
            result = self.capture(1)
        self.assertIn("unavailable", result.transcript)
        self.assertEqual(cursor.read_bytes(), before)

    def test_malformed_and_truncated_parent_are_explicit(self):
        with self.parent.open("ab") as stream:
            stream.write(b"malformed\n")
        result = self.capture()
        self.assertIn("Malformed", result.transcript)
        self.parent.write_bytes(b"")
        result = self.capture(1)
        self.assertIn("unavailable", result.transcript)

    def test_wrong_parent_metadata_is_not_collected(self):
        self.parent.write_bytes(b"")
        append(self.parent, [record("session_meta", {"id": CHILD}), call()])
        result = self.capture()
        self.assertIn("unavailable", result.transcript)
        self.assertNotIn("spawn_agent", result.transcript)

    def test_non_object_parent_metadata_is_reported_as_unavailable(self):
        for metadata in ([], None, "unexpected"):
            with self.subTest(metadata=metadata):
                self.parent.write_text(json.dumps(metadata) + "\n")
                result = self.capture()
                self.assertIn("unavailable", result.transcript)
                self.assertFalse(
                    (self.artifacts / "parent_collaboration/cursor.json").exists()
                )

    def test_non_object_later_record_is_reported_as_malformed(self):
        append(self.parent, [[], None, "unexpected", call()])
        result = self.capture()
        self.assertEqual(result.transcript.count("Malformed parent source record"), 3)
        self.assertIn("spawn_agent", result.transcript)

    def test_resume_uses_session_id_fallback(self):
        event = call()
        event["payload"]["name"] = "send_message"
        append(self.parent, [event])
        result = self.provider.parse_output("", "Go")
        self.provider.enrich_turn_result(
            result, {"CODEX_HOME": str(self.home)}, self.artifacts, 0, PARENT
        )
        self.assertIn("send_message", result.transcript)

    def test_message_between_source_turns_has_no_invented_turn_id(self):
        append(
            self.parent,
            [
                record("event_msg", {"type": "task_started", "turn_id": "turn-a"}),
                record("event_msg", {"type": "task_complete", "turn_id": "turn-a"}),
                record(
                    "response_item",
                    {
                        "type": "agent_message",
                        "author": "/root/review",
                        "recipient": "/root",
                        "content": [],
                    },
                ),
            ],
        )
        self.capture()
        metadata = json.loads(
            (self.artifacts / "parent_collaboration/turn-1.json").read_text()
        )
        self.assertIsNone(metadata["records"][0]["source_turn_id"])

    def test_partial_last_record_is_deferred_until_resume(self):
        data = json.dumps(call()).encode()
        with self.parent.open("ab") as stream:
            stream.write(data[:20])
        result = self.capture()
        self.assertIn("incomplete record", result.transcript)
        with self.parent.open("ab") as stream:
            stream.write(data[20:] + b"\n")
        result = self.capture(1)
        self.assertIn("spawn_agent", result.transcript)
        self.assertEqual(
            (self.artifacts / "parent_collaboration/turn-2.jsonl").read_bytes(),
            data + b"\n",
        )

    def test_eval_job_captures_parent_before_cleanup_and_grading(self):
        job = EvalJob(
            {"id": 1, "turns": [{"prompt": "Review"}]},
            "skill",
            str(self.root / "run"),
            None,
            self.root / "results",
            self.provider,
            None,
            None,
            5,
        )
        observed_home = []

        def execute(*args, **kwargs):
            home = Path(kwargs["env"]["CODEX_HOME"])
            observed_home.append(home)
            path = home / "sessions" / self.parent.name
            path.parent.mkdir()
            append(path, [record("session_meta", {"id": PARENT}), call(), output()])
            return TimedProcessResult(
                json.dumps({"type": "thread.started", "thread_id": PARENT}),
                "",
                0,
                False,
                1,
            )

        def grade():
            transcript = (job.run_type_dir / "transcript.md").read_text()
            self.assertIn("spawn_agent", transcript)
            self.assertFalse(observed_home[0].exists())

        with mock.patch.dict(
            "os.environ", {"CODEX_HOME": str(self.root / "no-auth")}
        ), mock.patch(
            "scripts.evaluate.eval_job.run_with_timeout", side_effect=execute
        ), mock.patch.object(
            job, "run_grading_job", side_effect=grade
        ):
            job.run()

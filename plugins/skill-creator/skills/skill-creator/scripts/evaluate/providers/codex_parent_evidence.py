"""Supplement CLI output with collaboration recorded in the evaluated parent."""

import hashlib
import json
from pathlib import Path
from uuid import UUID

from ..telemetry import redact_sensitive_telemetry

NOTICE = (
    "[PARENT COLLABORATION EVIDENCE]\n"
    "This supplement contains only records observed in the evaluated parent. "
    "Missing records are not proof that an action did not occur. "
    "Collection turns describe capture timing; source turn IDs describe "
    "the active recorded turn, when available."
)


class ParentEvidenceUnavailable(ValueError):
    """A known parent evidence gap safe to explain in the transcript."""


def parent_source(home: Path, parent_id: str) -> Path:
    UUID(parent_id)
    candidates = [
        path
        for directory in ("sessions", "archived_sessions")
        for path in (home / directory).rglob(f"rollout-*-{parent_id}.jsonl")
    ]
    if len(candidates) != 1:
        raise ParentEvidenceUnavailable("Parent session source missing or ambiguous")
    source = candidates[0]
    if source.is_symlink() or not source.resolve().is_relative_to(home.resolve()):
        raise ParentEvidenceUnavailable(
            "Parent session source is outside the isolated home"
        )
    return source


def object_value(value):
    return value if isinstance(value, dict) else {}


def load_cursor(directory, parent_id, source, data):
    path = directory / "cursor.json"
    if not path.exists():
        return {"offset": 0, "line": 0, "turn_id": None, "calls": {}}
    cursor = json.loads(path.read_text(encoding="utf-8"))
    if cursor["parent_id"] != parent_id or cursor["source"] != str(source):
        raise ParentEvidenceUnavailable(
            "Parent session identity changed since the preceding capture"
        )
    prefix = data[: cursor["offset"]]
    if (
        len(prefix) != cursor["offset"]
        or hashlib.sha256(prefix).hexdigest() != cursor["sha256"]
    ):
        raise ParentEvidenceUnavailable(
            "Parent session source was truncated or replaced"
        )
    return cursor


def collaboration_call(payload):
    return payload.get("type") == "function_call" and (
        payload.get("namespace") == "collaboration"
    )


def select_record(event, cursor):
    payload = object_value(event.get("payload"))
    update_source_turn(event, payload, cursor)
    if event.get("type") != "response_item":
        return False
    if collaboration_call(payload):
        cursor["calls"][payload.get("call_id")] = payload.get("name")
        return True
    if payload.get("type") == "function_call_output":
        return cursor["calls"].pop(payload.get("call_id"), None) is not None
    return payload.get("type") == "agent_message"


def update_source_turn(event, payload, cursor):
    if event.get("type") in {"event_msg", "turn_context"} and payload.get("turn_id"):
        cursor["turn_id"] = payload["turn_id"]
    if payload.get("type") == "task_complete":
        cursor["turn_id"] = None


def readable(value):
    if isinstance(value, list):
        return [readable(item) for item in value]
    if isinstance(value, dict):
        return {
            key: (
                "unavailable: encrypted message body"
                if key == "encrypted_content"
                else readable(item)
            )
            for key, item in value.items()
        }
    return value


def parse_parent_records(data, cursor):
    selected, locations, issues = [], [], []
    offset = cursor["offset"]
    for line in data[offset:].splitlines(keepends=True):
        if not line.endswith(b"\n"):
            issues.append(
                "Parent source ends with an incomplete record; capture deferred"
            )
            break
        cursor["line"] += 1
        location = {"line": cursor["line"], "byte_offset": cursor["offset"]}
        cursor["offset"] += len(line)
        event = parse_record(line, cursor["line"], issues)
        if select_record(event, cursor):
            selected.append(line)
            locations.append(
                {**location, "source_turn_id": cursor["turn_id"], "event": event}
            )
    return selected, locations, issues


def parse_record(line, line_number, issues):
    try:
        event = json.loads(line)
        if isinstance(event, dict):
            return event
        issues.append(f"Malformed parent source record at line {line_number}")
        return {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        issues.append(f"Malformed parent source record at line {line_number}")
        return {}


def capture_parent(home, directory, parent_id, turn_index):
    source = parent_source(home, parent_id)
    data = source.read_bytes()
    metadata = object_value(json.loads(data.splitlines()[0]))
    if (
        metadata.get("type") != "session_meta"
        or object_value(metadata.get("payload")).get("id") != parent_id
    ):
        raise ParentEvidenceUnavailable(
            "Parent session metadata does not match the evaluated parent"
        )
    cursor = load_cursor(directory, parent_id, source, data)
    selected, locations, issues = parse_parent_records(data, cursor)
    manifest = {
        "parent_id": parent_id,
        "source": str(source),
        "collection_turn": turn_index + 1,
        "issues": issues,
    }
    transcript = render_evidence(manifest, locations)
    manifest["records"] = [
        {key: value for key, value in location.items() if key != "event"}
        for location in locations
    ]
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"turn-{turn_index + 1}.jsonl").write_bytes(b"".join(selected))
    (directory / f"turn-{turn_index + 1}.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    cursor.update(
        parent_id=parent_id,
        source=str(source),
        sha256=hashlib.sha256(data[: cursor["offset"]]).hexdigest(),
    )
    temporary = directory / "cursor.json.tmp"
    temporary.write_text(json.dumps(cursor, indent=2), encoding="utf-8")
    temporary.replace(directory / "cursor.json")
    return transcript


def render_evidence(manifest, locations):
    sections = [
        NOTICE,
        f"Parent: {manifest['parent_id']}\nSource: {manifest['source']}",
    ]
    for location in locations:
        event = location["event"]
        payload = event["payload"]
        rendered = render_payload(payload)
        if '"encrypted_content"' in json.dumps(payload):
            manifest["issues"].append(
                "Received body unavailable: encrypted content at "
                f"line {location['line']}"
            )
        sections.append(
            f"[PARENT COLLABORATION] source line={location['line']} "
            f"source turn={location['source_turn_id']} "
            f"timestamp={event.get('timestamp')}\n"
            + redact_sensitive_telemetry(rendered)
        )
    return "\n\n".join(sections + manifest["issues"])


def render_payload(payload):
    if payload.get("type") == "function_call":
        return (
            f"[COLLABORATION CALL] {payload.get('namespace')}.{payload.get('name')} "
            f"call_id={payload.get('call_id')}\n"
            + render_body(payload.get("arguments", ""))
        )
    if payload.get("type") == "function_call_output":
        return f"[COLLABORATION RESULT] {payload.get('call_id')}\n" + render_body(
            payload.get("output", "")
        )
    return (
        f"[COLLABORATION MESSAGE] {payload.get('author')} -> "
        f"{payload.get('recipient')}\n"
        + "\n\n".join(render_message_part(part) for part in payload.get("content", []))
    )


def render_message_part(part):
    if object_value(part).get("type") == "input_text":
        return part.get("text", "")
    if object_value(part).get("type") == "encrypted_content":
        return "[Message body unavailable: encrypted content]"
    return render_body(readable(part))


def render_body(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return value
    if isinstance(value, dict):
        return "\n\n".join(
            f"{key}:\n{render_body(item)}" for key, item in value.items()
        )
    if isinstance(value, str):
        return value
    return json.dumps(value, indent=2)


def enrich_parent(result, process_env, artifact_dir, turn_index, session_id):
    try:
        supplement = capture_parent(
            Path(process_env["CODEX_HOME"]),
            Path(artifact_dir) / "parent_collaboration",
            result.session_id or session_id,
            turn_index,
        )
    except ParentEvidenceUnavailable as error:
        supplement = NOTICE + f"\nParent collaboration evidence unavailable: {error}."
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        supplement = (
            NOTICE + "\nParent collaboration evidence unavailable: "
            "capture could not be completed."
        )
    result.transcript += "\n\n" + supplement

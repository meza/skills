"""Validate JSON artifacts against the repository-owned schemas."""

import json
from pathlib import Path

import jsonschema
from referencing import Registry, Resource

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_ROOT = PROJECT_ROOT / "schemas"


class ArtifactValidationError(RuntimeError):
    """Raised when a generated artifact violates its schema contract."""


def schema_path(schema_name: str) -> Path:
    return SCHEMA_ROOT / schema_name


def load_schema(schema_name: str) -> dict:
    return json.loads(schema_path(schema_name).read_text(encoding="utf-8"))


def schema_registry() -> Registry:
    registry = Registry()
    for path in SCHEMA_ROOT.glob("*.schema.json"):
        schema = json.loads(path.read_text(encoding="utf-8"))
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    return registry


def validate_artifact(payload: object, schema_name: str, artifact_name: str) -> None:
    validate_with_schema(payload, load_schema(schema_name), artifact_name)


def validate_with_schema(payload: object, schema: dict, artifact_name: str) -> None:
    validator = jsonschema.Draft202012Validator(
        schema,
        format_checker=jsonschema.Draft202012Validator.FORMAT_CHECKER,
        registry=schema_registry(),
    )
    errors = sorted(validator.iter_errors(payload), key=lambda error: error.path)
    if errors:
        error = errors[0]
        path = ".".join(str(part) for part in error.absolute_path) or "<root>"
        raise ArtifactValidationError(
            f"Invalid {artifact_name}: {path}: {error.message}"
        )


def write_json_artifact(path: Path, payload: object, schema_name: str) -> None:
    validate_artifact(payload, schema_name, path.name)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

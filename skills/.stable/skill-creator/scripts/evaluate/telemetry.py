"""Helpers for preparing diagnostic text for telemetry artifacts."""

import re

_BEARER_TOKEN_RE = re.compile(r"(?i)\b(authorization\s*:\s*bearer\s+)([^\s,;]+)")
_SENSITIVE_FIELD_RE = re.compile(
    r"(?i)\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)"
    r"(\s*[:=]\s*)"
    r"([^\s,;]+)"
)


def redact_sensitive_telemetry(text: str) -> str:
    """Redact common secret-bearing fields before text enters telemetry."""
    if not text:
        return text

    redacted = _BEARER_TOKEN_RE.sub(r"\1[REDACTED]", text)
    return _SENSITIVE_FIELD_RE.sub(r"\1\2[REDACTED]", redacted)

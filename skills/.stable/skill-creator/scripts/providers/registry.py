"""Provider registry shared by skill-creator entry points."""

import sys

from . import Provider
from .claude import ClaudeProvider
from .codex import CodexProvider


PROVIDERS = {
    "claude": ClaudeProvider,
    "codex": CodexProvider,
}


def get_provider(name: str) -> Provider:
    """Look up a provider by name."""
    cls = PROVIDERS.get(name)
    if cls is None:
        available = ", ".join(sorted(PROVIDERS))
        print(f"Error: unknown provider '{name}'. Available: {available}", file=sys.stderr)
        sys.exit(1)
    return cls()

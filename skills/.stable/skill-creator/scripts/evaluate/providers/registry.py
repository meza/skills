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
    """Return the registered provider for ``name``.

    Returns a new provider instance on each successful lookup. For an unknown
    provider name, this function writes the registry error to stderr and
    raises SystemExit with code 1. This keeps CLI callers and application
    orchestration on one provider-name error contract.
    """
    cls = PROVIDERS.get(name)
    if cls is None:
        available = ", ".join(sorted(PROVIDERS))
        print(
            f"Error: unknown provider '{name}'. Available: {available}", file=sys.stderr
        )
        sys.exit(1)
    return cls()


def get_provider_skill_root(name: str) -> str:
    """Return the skill discovery root for a registered provider.

    Unknown provider names use the same stderr plus SystemExit error contract
    as get_provider.
    """
    return get_provider(name).skill_root

import io
import unittest
from contextlib import redirect_stderr

from scripts.evaluate.providers.claude import ClaudeProvider
from scripts.evaluate.providers.codex import CodexProvider
from scripts.evaluate.providers.registry import (
    PROVIDERS,
    get_provider,
    get_provider_skill_root,
)


class ProviderRegistryTests(unittest.TestCase):
    def test_registry_exposes_supported_provider_names(self):
        self.assertEqual(
            PROVIDERS,
            {
                "claude": ClaudeProvider,
                "codex": CodexProvider,
            },
        )

    def test_get_provider_returns_new_provider_instance(self):
        first = get_provider("claude")
        second = get_provider("claude")

        self.assertIsInstance(first, ClaudeProvider)
        self.assertIsInstance(second, ClaudeProvider)
        self.assertIsNot(first, second)
        self.assertIsInstance(get_provider("codex"), CodexProvider)

    def test_get_provider_skill_root_uses_provider_contract(self):
        self.assertEqual(get_provider_skill_root("claude"), ".claude")
        self.assertEqual(get_provider_skill_root("codex"), ".codex")

    def test_get_provider_exits_with_available_names_for_unknown_provider(self):
        stderr = io.StringIO()

        with redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            get_provider("unknown")

        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(
            stderr.getvalue().strip(),
            "Error: unknown provider 'unknown'. Available: claude, codex",
        )

    def test_get_provider_skill_root_exits_with_registry_error(self):
        stderr = io.StringIO()

        with redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            get_provider_skill_root("unknown")

        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(
            stderr.getvalue().strip(),
            "Error: unknown provider 'unknown'. Available: claude, codex",
        )

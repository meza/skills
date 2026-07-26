import io
import inspect
import unittest
from contextlib import redirect_stderr

from scripts.evaluate.providers.claude import ClaudeProvider
from scripts.evaluate.providers.codex import CodexProvider
from scripts.evaluate.providers.registry import (
    PROVIDERS,
    get_provider_or_exit,
    get_provider_skill_root_or_exit,
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
        first = get_provider_or_exit("claude")
        second = get_provider_or_exit("claude")

        self.assertIsInstance(first, ClaudeProvider)
        self.assertIsInstance(second, ClaudeProvider)
        self.assertIsNot(first, second)
        self.assertIsInstance(get_provider_or_exit("codex"), CodexProvider)

    def test_get_provider_documents_process_exit_contract(self):
        doc = inspect.getdoc(get_provider_or_exit)

        self.assertIn("Returns a new provider instance", doc)
        self.assertIn("writes the registry error to stderr", doc)
        self.assertIn("raises SystemExit with code 1", doc)

    def test_get_provider_skill_root_uses_provider_contract(self):
        self.assertEqual(get_provider_skill_root_or_exit("claude"), ".claude")
        self.assertEqual(get_provider_skill_root_or_exit("codex"), ".codex")

    def test_get_provider_exits_with_available_names_for_unknown_provider(self):
        stderr = io.StringIO()

        with redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            get_provider_or_exit("unknown")

        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(
            stderr.getvalue().strip(),
            "Error: unknown provider 'unknown'. Available: claude, codex",
        )

    def test_get_provider_skill_root_exits_with_registry_error(self):
        stderr = io.StringIO()

        with redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            get_provider_skill_root_or_exit("unknown")

        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(
            stderr.getvalue().strip(),
            "Error: unknown provider 'unknown'. Available: claude, codex",
        )

import unittest

from scripts.evaluate.providers import Provider, TurnResult


class MinimalProvider(Provider):
    def build_command(
        self,
        session_id,
        session_name,
        turn_index,
        model,
        effort=None,
        working_dir=None,
    ):
        return []

    def parse_output(self, stdout, prompt):
        return TurnResult(response=stdout, transcript=prompt)

    def build_grading_command(
        self,
        model,
        effort,
        working_dir,
        output_schema,
    ):
        return []

    @property
    def skill_root(self):
        return ".minimal"


class ProviderInterfaceTests(unittest.TestCase):
    def test_default_process_environment_yields_base_environment(self):
        provider = MinimalProvider()
        base_env = {"HOME": "/tmp/home"}

        with provider.process_environment(
            base_env,
            "/tmp/run",
            "/tmp/artifacts",
        ) as env:
            self.assertIs(env, base_env)

    def test_provider_does_not_require_first_turn_session_id_by_default(self):
        self.assertFalse(MinimalProvider().requires_first_turn_session_id)


if __name__ == "__main__":
    unittest.main()

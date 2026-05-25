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


if __name__ == "__main__":
    unittest.main()

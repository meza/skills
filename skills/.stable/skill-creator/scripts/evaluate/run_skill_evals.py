"""Run prepared skill evals using a pluggable LLM provider."""

from dataclasses import dataclass

from .eval_definitions import load_evals_data, select_evals, selected_configs
from .eval_runner import EvalRun, EvalRunOptions
from .prepare_fixture import PreparedRun
from .providers.registry import get_provider

DEFAULT_ITERATION = 1
DEFAULT_MAX_PARALLEL = 10
DEFAULT_TIMEOUT_SECONDS = 600


@dataclass(frozen=True)
class SkillEvalRunOptions:
    eval_ids: str | None = None
    config: str | None = None
    model: str | None = None
    effort: str | None = None
    max_parallel: int = DEFAULT_MAX_PARALLEL
    timeout: int = DEFAULT_TIMEOUT_SECONDS


class SkillEvalRunner:
    """Execute evals from a PreparedRun produced by FixturePreparer.

    This is application code, not a CLI boundary. Callers provide the in-memory
    PreparedRun directly, so fixture preparation and eval execution no longer
    communicate through a JSON handoff file.
    """

    def __init__(self, prepared_run: PreparedRun, options: SkillEvalRunOptions):
        self.prepared_run = prepared_run
        self.options = options

    def run(self) -> dict:
        provider = get_provider(self.prepared_run.provider)
        evals_data = load_evals_data(self.prepared_run.eval_definitions_path)
        evals_list = select_evals(evals_data.get("evals", []), self.options.eval_ids)

        options = EvalRunOptions(
            eval_definitions_path=self.prepared_run.eval_definitions_path,
            workspace=self.prepared_run.run_root / "results",
            iteration=DEFAULT_ITERATION,
            provider_name=self.prepared_run.provider,
            model=self.options.model,
            effort=self.options.effort,
            max_parallel=self.options.max_parallel,
            timeout=self.options.timeout,
            total_timeout=None,
            run_root=self.prepared_run.run_root,
            configs=selected_configs(self.options.config),
        )
        return EvalRun(
            options,
            provider,
            evals_data,
            evals_list,
            self.prepared_run.evals,
        ).run()


def run_skill_evals(prepared_run: PreparedRun, options: SkillEvalRunOptions) -> dict:
    return SkillEvalRunner(prepared_run, options).run()

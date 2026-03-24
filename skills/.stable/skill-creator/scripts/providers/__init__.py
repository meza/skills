"""LLM provider interface for skill evaluation.

Providers handle two responsibilities:
1. Building the CLI command for each conversation turn
2. Parsing the raw output into a structured result

Everything else (process lifecycle, timeout handling, file I/O,
orchestration) lives in the runner and is shared across providers.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class TurnResult:
    """Structured result from a single conversation turn."""

    response: str = ""
    transcript: str = ""
    events: list[dict] = field(default_factory=list)
    session_id: str | None = None
    duration_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class Provider(ABC):
    """Abstract base for LLM providers.

    A provider knows how to invoke a specific LLM CLI tool and how to
    parse its output. The runner handles everything else: process
    management, timeouts, saving files, and orchestrating parallel jobs.
    """

    @abstractmethod
    def build_command(
        self,
        session_id: str | None,
        session_name: str,
        turn_index: int,
        model: str | None,
        working_dir: str | None = None,
    ) -> list[str]:
        """Build the CLI command for a single turn.

        The runner pipes the prompt via stdin and captures stdout/stderr.

        Args:
            session_id: Session/thread ID for multi-turn continuity. This may be
                None on the first turn for providers whose CLI creates the ID.
            session_name: Human-readable session label.
            turn_index: Zero-based turn number. Turn 0 starts a new session.
                Subsequent turns resume the existing session.
            model: Model override, or None for the provider default.
            working_dir: Optional directory that the provider should use as the
                working root when its CLI exposes a cwd flag.

        Returns:
            Command as a list of strings (passed to Popen).
        """

    @abstractmethod
    def parse_output(self, stdout: str, prompt: str) -> TurnResult:
        """Parse raw stdout from the CLI into a structured result.

        Args:
            stdout: Raw stdout captured from the process.
            prompt: The prompt that was sent (needed for transcript building).

        Returns:
            A TurnResult with response text, transcript, events, metrics, and
            the session/thread ID observed for this turn when available.
        """

    @property
    @abstractmethod
    def skill_root(self) -> str:
        """The provider-specific root directory for skill discovery.

        Skills are placed at <run_dir>/<skill_root>/skills/<skill_name>/.
        The skills/<skill_name>/ part is standard across all providers.
        Only the root changes:
            - Claude:  .claude
            - Codex:   .codex
            - GitHub:  .github
            - Generic: .agents
        """

    @property
    @abstractmethod
    def supports_skill_discovery(self) -> bool:
        """Whether the provider discovers skills automatically.

        Providers that return True are expected to find skills placed at
        <skill_root>/skills/<name>/ in the working directory. Providers
        that return False will always get the skill content prepended
        to the prompt (equivalent to --force-skill).
        """

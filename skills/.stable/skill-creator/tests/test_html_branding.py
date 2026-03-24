import importlib.util
import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
EVAL_VIEWER_DIR = PROJECT_ROOT / "eval-viewer"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import generate_report


def _load_generate_review_module():
    module_path = EVAL_VIEWER_DIR / "generate_review.py"
    spec = importlib.util.spec_from_file_location("skill_creator_generate_review", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


generate_review = _load_generate_review_module()


class GeneratedHtmlBrandingTests(unittest.TestCase):
    def test_eval_review_asset_is_provider_agnostic(self):
        asset = (PROJECT_ROOT / "assets" / "eval_review.html").read_text(encoding="utf-8")

        self.assertNotIn("Claude", asset)
        self.assertNotIn("Anthropic", asset)
        self.assertNotIn("OpenAI", asset)

    def test_generate_review_output_uses_neutral_review_labels(self):
        html = generate_review.generate_html(
            runs=[
                {
                    "id": "eval-1-with-skill",
                    "prompt": "Review the sample output",
                    "eval_id": 1,
                    "eval_name": "Sample Eval",
                    "turns": [{"role": "user", "text": "Prompt"}, {"role": "agent", "files": []}],
                    "outputs": [],
                    "grading": {
                        "eval_feedback": {
                            "overall": "Mostly correct with a few gaps.",
                            "suggestions": [{"reason": "Clarify the final step."}],
                        }
                    },
                    "transcript": None,
                }
            ],
            skill_name="skill-creator",
        )

        self.assertIn("AI Summary", html)
        self.assertIn("your current session", html)
        self.assertIn("tell the agent you are done reviewing", html)
        self.assertNotIn("Claude Code", html)
        self.assertNotIn("Claude&#x27;s Notes", html)
        self.assertNotIn("claude-notes", html)
        self.assertNotIn("Review Notes", html)

    def test_generate_report_output_is_provider_agnostic(self):
        html = generate_report.generate_html(
            data={
                "history": [
                    {
                        "iteration": 1,
                        "description": "First attempt",
                        "train_results": [
                            {"query": "help me build a dashboard", "should_trigger": True, "pass": True, "triggers": 3, "runs": 3}
                        ],
                        "test_results": [
                            {"query": "translate this sentence", "should_trigger": False, "pass": True, "triggers": 0, "runs": 3}
                        ],
                        "train_passed": 1,
                        "train_total": 1,
                        "test_passed": 1,
                        "test_total": 1,
                    }
                ],
                "best_description": "First attempt",
                "original_description": "Original description",
                "best_score": "2/2",
                "best_test_score": "1/1",
                "iterations_run": 1,
                "train_size": 1,
                "test_size": 1,
            },
            skill_name="skill-creator",
        )

        self.assertIn("the optimizer tests different versions", html)
        self.assertIn("best-performing description is highlighted below", html)
        self.assertNotIn("Claude tests different versions", html)
        self.assertNotIn("Claude will apply the best-performing description", html)
        self.assertNotIn("Anthropic", html)


if __name__ == "__main__":
    unittest.main()

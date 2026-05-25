import unittest

from scripts.evaluate.prompt_format import (
    SYSTEM_NOTIFICATION_SECTION,
    USER_INPUT_SECTION,
    extract_prompt_sections,
    format_prompt_sections,
)


class PromptFormatTests(unittest.TestCase):
    def test_format_prompt_returns_user_prompt_when_notification_is_missing(self):
        self.assertEqual(format_prompt_sections("Do the task."), "Do the task.")
        self.assertEqual(format_prompt_sections("Do the task.", ""), "Do the task.")

    def test_format_prompt_adds_system_notification_section(self):
        self.assertEqual(
            format_prompt_sections(
                "Do the task.",
                "Use this skill file.",
            ),
            "[SYSTEM NOTIFICATION]\n"
            "Use this skill file.\n\n"
            "[USER INPUT]\n"
            "Do the task.",
        )

    def test_extract_prompt_sections_splits_wrapped_prompt(self):
        prompt = format_prompt_sections(
            "Do the task.",
            "Use this skill file.",
        )

        self.assertEqual(
            extract_prompt_sections(prompt),
            [
                (SYSTEM_NOTIFICATION_SECTION, "Use this skill file."),
                (USER_INPUT_SECTION, "Do the task."),
            ],
        )

    def test_extract_prompt_sections_treats_unwrapped_prompt_as_user_input(self):
        self.assertEqual(
            extract_prompt_sections("Do the task."),
            [(USER_INPUT_SECTION, "Do the task.")],
        )

    def test_extract_prompt_sections_requires_complete_wrapper(self):
        partial_prompt = "[SYSTEM NOTIFICATION]\nUse this skill file."

        self.assertEqual(
            extract_prompt_sections(partial_prompt),
            [(USER_INPUT_SECTION, partial_prompt)],
        )


if __name__ == "__main__":
    unittest.main()

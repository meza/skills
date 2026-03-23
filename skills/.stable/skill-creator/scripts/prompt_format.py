"""Helpers for formatting eval prompts and transcripts."""

SYSTEM_NOTIFICATION_SECTION = "[SYSTEM NOTIFICATION]"
USER_INPUT_SECTION = "[USER INPUT]"


def format_prompt_sections(user_prompt: str, system_notification: str | None = None) -> str:
    """Render the prompt with an optional system-notification section."""
    if not system_notification:
        return user_prompt

    return (
        f"{SYSTEM_NOTIFICATION_SECTION}\n"
        f"{system_notification}\n\n"
        f"{USER_INPUT_SECTION}\n"
        f"{user_prompt}"
    )


def extract_prompt_sections(prompt: str) -> list[tuple[str, str]]:
    """Split a prompt into transcript sections.

    Prompts without an explicit system-notification wrapper are treated as a
    single user-input section for backward compatibility.
    """
    section_separator = f"\n\n{USER_INPUT_SECTION}\n"
    prefix = f"{SYSTEM_NOTIFICATION_SECTION}\n"

    if prompt.startswith(prefix):
        system_notification, separator, user_prompt = prompt[len(prefix):].partition(
            section_separator
        )
        if separator:
            return [
                (SYSTEM_NOTIFICATION_SECTION, system_notification),
                (USER_INPUT_SECTION, user_prompt),
            ]

    return [(USER_INPUT_SECTION, prompt)]

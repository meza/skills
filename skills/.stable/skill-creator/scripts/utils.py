"""Shared utilities for skill-creator scripts."""

from pathlib import Path


def parse_skill_md(skill_path: Path) -> tuple[str, str, str]:
    """Parse a SKILL.md file, returning (name, description, full_content)."""
    content = (skill_path / "SKILL.md").read_text(encoding="utf-8")
    lines = content.split("\n")
    end_idx = _find_frontmatter_end(lines)
    name, description = _parse_frontmatter(lines[1:end_idx])
    return name, description, content


def _find_frontmatter_end(lines: list[str]) -> int:
    if lines[0].strip() != "---":
        raise ValueError("SKILL.md missing frontmatter (no opening ---)")

    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return i

    raise ValueError("SKILL.md missing frontmatter (no closing ---)")


def _parse_frontmatter(frontmatter_lines: list[str]) -> tuple[str, str]:
    name = ""
    description = ""
    i = 0
    while i < len(frontmatter_lines):
        line = frontmatter_lines[i]
        if line.startswith("name:"):
            name = line[len("name:") :].strip().strip('"').strip("'")
        elif line.startswith("description:"):
            description, i = _parse_description(frontmatter_lines, i)
        i += 1

    return name, description


def _parse_description(frontmatter_lines: list[str], index: int) -> tuple[str, int]:
    value = frontmatter_lines[index][len("description:") :].strip()
    if value not in (">", "|", ">-", "|-"):
        return value.strip('"').strip("'"), index
    description, final_index = _parse_multiline_value(frontmatter_lines, index + 1)
    return description, final_index


def _parse_multiline_value(
    frontmatter_lines: list[str], start_index: int
) -> tuple[str, int]:
    continuation_lines: list[str] = []
    index = start_index
    while index < len(frontmatter_lines) and _is_indented(frontmatter_lines[index]):
        continuation_lines.append(frontmatter_lines[index].strip())
        index += 1
    return " ".join(continuation_lines), index - 1


def _is_indented(line: str) -> bool:
    return line.startswith("  ") or line.startswith("\t")

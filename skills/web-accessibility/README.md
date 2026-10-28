# Web accessibility

This skill guides an agent applying WCAG 2.2 when creating, changing, testing,
or reviewing web content and interfaces. It covers content alternatives,
semantics, visual presentation, keyboard and pointer input, navigation, forms,
authentication, and status messages.

The skill requires the agent to identify applicable criteria and their levels,
preserve conditions and exceptions, and distinguish normative requirements from
informative techniques. Findings separate confirmed failures from areas needing
runtime testing and advisory improvements. Static source review alone cannot
establish full WCAG conformance.

## Install with `npx skills`

Install the skill into the current project:

```console
npx skills add meza/skills --skill web-accessibility
```

Install it globally for Codex:

```console
npx skills add meza/skills --skill web-accessibility --agent codex --global
```

Install it globally for Claude Code:

```console
npx skills add meza/skills --skill web-accessibility --agent claude-code --global
```

After installation, ask your agent to build, test, or review a web interface.
Supply the conformance target when you have one. For example:

```text
Review this checkout flow against WCAG 2.2 Level AA. Report confirmed failures,
areas needing runtime testing, and advisory improvements separately.
```

The agent's complete instructions and links to topic references are in
[SKILL.md](SKILL.md).

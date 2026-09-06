# Meza's Skills

Meza's Skills is a plugin marketplace for [Codex](https://github.com/openai/codex)
and [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Add the
marketplace to either tool, then install the plugins that match the work you
want your agent to perform.

Each plugin includes its skill. You do not need to download or copy a
`SKILL.md` file separately.

## Choose a plugin

| Plugin | Use it when you want to |
| --- | --- |
| `addressing-code-review-findings` | Verify and adjudicate code-review feedback before acting on it |
| `clean-code` | Reason about code, tests, APIs, modules, and architecture through a progressive catalog of quality concerns |
| `skill-creator` | Create, revise, and evaluate agent skills |
| `conventional-commit-message` | Generate a Conventional Commit message from staged changes or a working tree |
| `fixing-linter-violations` | Fix linter findings at their underlying cause without unauthorized suppressions |
| `review-swarm` | Run a comprehensive multi-agent review with one investigator per quality symptom |
| `review-swarm-fast` | Cover the same review catalogue with nine grouped investigators for a faster result |
| `charm-tui` | Build reusable Charm v2 terminal components with explicit ownership, tests, and Bubblebook stories |

`review-swarm` gives every quality symptom to a separate investigator.
`review-swarm-fast` groups related symptoms into nine areas, reducing the
number of agents while keeping the same catalogue coverage.

## Install in Codex

You need an installed and authenticated Codex CLI with plugin support. Add this
repository as a marketplace:

```console
codex plugin marketplace add meza/skills
```

Install a plugin by replacing `<plugin>` with a name from the table above:

```console
codex plugin add <plugin>@mezas-skills
```

For example, install Skill Creator with:

```console
codex plugin add skill-creator@mezas-skills
```

Confirm that the plugin is installed:

```console
codex plugin list
```

## Install in Claude Code

You need an installed and authenticated Claude Code CLI with plugin support.
Add this repository as a marketplace:

```console
claude plugin marketplace add meza/skills
```

Install a plugin by replacing `<plugin>` with a name from the table above:

```console
claude plugin install <plugin>@mezas-skills
```

For example, install Skill Creator with:

```console
claude plugin install skill-creator@mezas-skills
```

Confirm that the plugin is installed:

```console
claude plugin list
```

These commands use each CLI's default user-level configuration.

## Use the installed skills

Ask your agent for the capability you installed. For example:

| Plugin | Example prompt |
| --- | --- |
| `addressing-code-review-findings` | `Help me assess and address these code-review findings.` |
| `clean-code` | `Help me reason about the clean-code concerns in this design.` |
| `skill-creator` | `Help me create and evaluate an agent skill.` |
| `conventional-commit-message` | `Write a Conventional Commit message for my staged changes.` |
| `fixing-linter-violations` | `Fix these linter violations by addressing their root causes.` |
| `review-swarm` | `Run the review swarm on my current changes.` |
| `review-swarm-fast` | `Run the fast review swarm on my current changes.` |
| `charm-tui` | `Build a Charm v2 component with tests and Bubblebook stories.` |

Charm TUI's [usage guide](plugins/charm-tui/skills/charm-tui/README.md) explains
the component and Bubblebook story workflow.

Skill Creator's [workflow guide](plugins/skill-creator/skills/skill-creator/README.md)
explains how to define and run skill evaluations.

## Contribute

Repository contributors and maintainers should start with
[CONTRIBUTING.md](CONTRIBUTING.md). The
[plugin architecture guide](plugins/README.md) explains package structure and
artifact ownership.

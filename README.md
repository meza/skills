# Meza's Skills

Agent skills for Codex and Claude Code. Browse [skills/](skills/) for standalone
skills, or install one of the [plugins](#plugins) for a complete tool package.

## Standalone skills

| Skill | Use it when you want to |
| --- | --- |
| [addressing-code-review-findings](skills/addressing-code-review-findings/) | Verify and adjudicate code-review feedback before acting on it |
| [charm-tui](skills/charm-tui/) | Build reusable Charm v2 terminal components with tests and Bubblebook stories |
| [clean-code](skills/clean-code/) | Reason about code, tests, APIs, modules, and architecture through a catalog of quality concerns |
| [conventional-commit-message](skills/conventional-commit-message/) | Generate a Conventional Commit message from staged changes or a working tree |
| [fixing-linter-violations](skills/fixing-linter-violations/) | Fix linter findings at their underlying cause without unauthorized suppressions |
| [web-accessibility](skills/web-accessibility/) | Apply WCAG 2.2 when building, testing, or reviewing web content and interfaces |

### Install a skill

You need Node.js 22.20 or later and npm. Run this from the project where you want
to use the skill, replacing `<name>` with a name from the table:

```console
npx skills add meza/skills --skill <name>
```

Choose your agent when prompted. To install a skill for all your projects,
select the agent and add `--global`. For example, for Codex:

```console
npx skills add meza/skills --skill clean-code --agent codex --global
```

For Claude Code:

```console
npx skills add meza/skills --skill clean-code --agent claude-code --global
```

The installer includes the skill's bundled resources. Ask your agent for the
capability you installed, such as `Review this design using the clean-code
qualities.` See the [skills CLI reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md)
for installation and update options.

Charm TUI's [usage guide](skills/charm-tui/README.md) explains the component and
Bubblebook story workflow.

### Migrate from a standalone skill's old plugin

Some standalone skills were previously distributed as plugins. If you installed
one of those skills as a plugin:

1. Uninstall that plugin through your agent's plugin manager, using the same
   installation scope as the original installation.
2. Install the corresponding standalone skill with the commands above.
3. Start a new agent session and check its available skills. Confirm that the
   skill appears once and the old plugin is no longer installed.

Removing a plugin from the marketplace does not uninstall an existing copy or
convert it into a standalone skill.

## Plugins

| Plugin | Use it when you want to |
| --- | --- |
| `review-swarm` | Run a comprehensive multi-agent review with one investigator per quality symptom |
| `review-swarm-fast` | Cover the same review catalogue with nine grouped investigators for a faster result |
| `skill-creator` | Create, revise, and evaluate agent skills |

Each plugin includes its skills and tools. Install it through your agent's
marketplace; you do not need a separate skill installation.

### Install in Codex

You need an installed and authenticated Codex CLI with plugin support:

```console
codex plugin marketplace add meza/skills
codex plugin add <plugin>@mezas-skills
codex plugin list
```

Replace `<plugin>` with a name from the plugin table. For example,
`codex plugin add skill-creator@mezas-skills` installs Skill Creator.

### Install in Claude Code

You need an installed and authenticated Claude Code CLI with plugin support:

```console
claude plugin marketplace add meza/skills
claude plugin install <plugin>@mezas-skills
claude plugin list
```

Replace `<plugin>` with a name from the plugin table. These plugin commands use
each CLI's default user-level configuration.

Ask your agent to `Run the review swarm on my current changes`,
`Run the fast review swarm on my current changes`, or `Help me create and
evaluate an agent skill`.

Skill Creator's [workflow guide](plugins/skill-creator/skills/skill-creator/README.md)
explains how to define and run skill evaluations.

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for repository structure,
validation, and releases. The [plugin architecture guide](plugins/README.md)
explains plugin package structure and artifact ownership.

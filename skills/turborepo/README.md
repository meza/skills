# Turborepo

Use this skill to configure, review, or troubleshoot tasks and caching in a
pnpm-managed Turborepo monorepo. The agent checks the project's Turbo version,
task dependencies, and scripts against official documentation. See the
[skill instructions](SKILL.md).

## Install with `npx skills`

Run this in the project where you want to use the skill. Install both skills so
the agent can use the pnpm skill for package-manager operations.

```console
npx skills add meza/skills --skill turborepo --skill pnpm
```

For prerequisites and global installation, see [Install a skill](../../README.md#install-a-skill).

For example, ask your agent to check whether a Turbo task's dependencies and
cache inputs match the repository's scripts.

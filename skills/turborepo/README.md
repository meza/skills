# Turborepo

Use this skill to configure, review, or troubleshoot tasks and caching in a
pnpm-managed Turborepo monorepo. The agent checks the project's Turbo version,
task dependencies, and scripts against official documentation. See the
[skill instructions](SKILL.md).

## Install with `npx skills`

Install both skills for the same agent and at the same scope so the Turborepo
skill can find the pnpm instructions. For a project install, run this in that
project.

```console
npx skills add meza/skills --skill turborepo --skill pnpm
```

For prerequisites and global installation, see [Install a skill](https://github.com/meza/skills#install-a-skill).

For example, ask your agent to check whether a Turbo task's dependencies and
cache inputs match the repository's scripts.

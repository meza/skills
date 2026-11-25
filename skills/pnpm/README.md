# pnpm

Use this skill for pnpm commands, dependency changes, workspace configuration,
lockfiles, or CI installs. The agent checks the project's pinned pnpm version
and verifies the relevant behavior against official documentation or source.
See the [skill instructions](SKILL.md).

## Install with `npx skills`

Run this in the project where you want to use the skill.

```console
npx skills add meza/skills --skill pnpm
```

For prerequisites and global installation, see [Install a skill](../../README.md#install-a-skill).

For example, ask your agent to determine which workspace owns a dependency and
how to add it using the project's pnpm version.

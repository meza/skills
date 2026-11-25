# Paved road

Use this skill to check whether a tool, framework, or shared project component
already supports what you need before proposing a workaround. The agent checks
documented options, tests the ones that fit, and explains any gap and the
approval needed to take on a workaround. See the [skill instructions](SKILL.md).

## Install with `npx skills`

Run this in the project where you want to use the skill.

```console
npx skills add meza/skills --skill paved-road
```

For prerequisites and global installation, see [Install a skill](../../README.md#install-a-skill).

For example, ask your agent to check whether your deployment tool has a
supported readiness check before proposing a polling script.

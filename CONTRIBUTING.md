# Contributing

This repository publishes one marketplace for Codex and Claude Code. Each plugin is a single package with host-specific manifests and, where needed, host-specific integration files. Read [the plugin architecture guide](plugins/README.md) before changing package structure or shared runtime artifacts.

## Prepare a checkout

Use Git and Node `24.18.0`, which is the version used by the repository workflows. This repository has no root package-manager installation step.

Maintainers who push releases from a checkout must also install the pinned semantic-release toolchain described in [Release prerequisites](#release-prerequisites), then enable the tracked hook:

```console
git config core.hooksPath .githooks
```

An ordinary push runs non-mutating release checks. If a plugin or the aggregate marketplace needs a release, the hook blocks the push and prints the release command.

## Make a change

Keep changes within the plugin that owns the behavior. A plugin directory contains both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`; their `version` fields must always match exactly. Marketplace entries for the plugin must both point to `./plugins/<plugin-name>`.

Do not edit an existing plugin version or `CHANGELOG.md` manually. Semantic-release derives the next version from Conventional Commits that touch that plugin directory:

- `fix` produces a patch release.
- `feat` produces a minor release.
- a breaking change produces a major release.
- commits without a release-worthy change do not release the plugin.

A commit that touches more than one plugin can release each affected plugin independently. The commit scope does not select the plugin; changed paths do.

When adding a plugin, give its two host manifests the same initial version, add it to both marketplaces, and add the identity-only `package.json` and `.releaserc.cjs` used by the release tooling. The package file is semantic-release metadata, not an npm package or version authority.

The Skill Creator package has additional development environments and contributor instructions:

- [Skill Creator contribution guide](plugins/skill-creator/skills/skill-creator/CONTRIBUTING.md)
- [Evaluation viewer contribution guide](plugins/skill-creator/skills/skill-creator/eval-viewer/CONTRIBUTING.md)

## Validate the change

Run the checks relevant to the files you changed. The repository-wide plugin checks are:

```console
node --test .githooks/pre-push.test.cjs .github/scripts/release-config.test.cjs
node --test plugins/review-swarm/shared/review-swarm.test.mjs
node --test plugins/review-swarm-fast/shared/review-swarm-fast.test.mjs
node .github/scripts/check-plugins.mjs .
```

The invariant checker verifies marketplace sources, manifest shape, semantic versions, exact Claude/Codex version equality, release package identity, and required runtime artifacts.

CI additionally validates the Claude marketplace and every Claude plugin with `@anthropic-ai/claude-code@2.1.104`. It installs every Codex marketplace entry with `@openai/codex@0.145.0`, and exercises the pre-push hook on Windows and Ubuntu. Those CLIs are invoked as pinned validation tools; they do not establish a repository package-management workflow.

Before opening a pull request, review the diff for generated files, unrelated edits, credentials, and manual version or changelog changes. Describe the behavior changed and the validation performed.

## Release prerequisites

Releases run through a pinned semantic-release installation outside this repository. It must expose `semantic-release` on `PATH` and provide these packages together:

| Package | Version |
| --- | --- |
| `semantic-release` | `25.0.8` |
| `semantic-release-monorepo` | `8.0.2` |
| `@semantic-release/commit-analyzer` | `13.0.1` |
| `@semantic-release/release-notes-generator` | `14.1.1` |
| `@semantic-release/changelog` | `7.0.0` |
| `semantic-release-replace-plugin` | `1.2.7` |
| `@semantic-release/git` | `11.0.1` |
| `@semantic-release/exec` | `7.1.0` |

On POSIX systems the hook executes `semantic-release` directly. On Windows it uses the system `cmd.exe` to launch the standard `semantic-release.cmd` shim with fixed arguments, because Node cannot execute a `.cmd` file directly through `CreateProcess`. No repository-owned Bash, PowerShell, or batch wrapper is involved.

Releases run only from `main`. Start with a clean, current branch, passing validation, and direct permission to push commits and tags to `main`.

## Publish a release

Run the cross-platform release command from the repository root:

```console
node .githooks/pre-push --release
```

The hook invokes semantic-release sequentially for each configured plugin and then for the aggregate marketplace. It does not calculate versions or edit release files itself.

For each plugin with release-worthy commits, semantic-release:

1. Considers only commits that touched that plugin directory.
2. Calculates the next version using Conventional Commit rules.
3. Updates both host manifests and prepends the plugin's `CHANGELOG.md`.
4. Commits the generated files as `chore(plugin-release): <plugin>-v<version> [skip ci]`.
5. Creates and pushes `<plugin>-v<version>`.

After all plugin releases finish, the root release recognizes the generated plugin-release commits, increments `.claude-plugin/marketplace.json` once for the batch, commits only that manifest, and creates `marketplace-v<version>`. The Codex marketplace has no aggregate version field. The process creates no GitHub Release and publishes no npm package.

Semantic-release pushes during this command carry an environment guard, so they do not recursively run another release check.

## Recover from a partial release

Plugin releases are sequential, not transactional. If a later release fails after an earlier plugin was pushed, correct the reported problem and run the same command again. Existing component tags prevent completed releases from being repeated, and the final root run completes any pending marketplace increment.

Published tags are immutable. Never move, delete, or reuse a published tag to correct a release. Revert or correct the faulty change and publish the next semantic version.

The architectural rationale and ownership boundaries are recorded in [ADR 2](doc/arch/0002-use-semantic-release-for-independent-plugin-versioning.md).

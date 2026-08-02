# 2. Use semantic-release for independent plugin versioning

Date: 2026-08-02

## Status

Accepted

Amended by [3. Manage the release toolchain with npm](0003-manage-the-release-toolchain-with-npm.md)

## Context

The repository contains independently evolving plugins served to Claude and Codex from the same plugin directory. Each host manifest must identify the same plugin release, while the Claude marketplace metadata must also advance whenever one or more plugins are published. The Codex marketplace has no corresponding aggregate version field.

The release process must attribute commits by plugin path, derive versions from Conventional Commits, keep committed manifests and changelogs current, and avoid project-owned version calculation. The repository is not an npm workspace and does not publish npm packages. `semantic-release-monorepo` nevertheless requires package identity metadata in each component directory.

A component semantic-release process cannot safely own the root marketplace file because `@semantic-release/git` discovers modified assets from the process working directory downward. Sequential component releases can also partially complete because each semantic-release invocation pushes its own commit and tag.

## Decision

We will run semantic-release independently from each plugin directory using `semantic-release-monorepo`. Minimal private `package.json` files will provide names and path boundaries only; plugin manifests remain the version authority.

Each component release will update both host manifests, maintain a component changelog, create a namespaced tag, and emit a `chore(plugin-release)` commit. A separate root semantic-release configuration will recognize only those generated commits, increment the Claude marketplace once per batch, and create a namespaced marketplace tag. No configuration will publish an npm package or create a GitHub Release object.

We will keep orchestration in one cross-platform Node pre-push hook. Normal invocation performs dry-run release checks. An explicit `--release` mode runs components sequentially and then runs the root marketplace release. An environment guard prevents semantic-release's internal pushes from recursively invoking the hook.

The hook executes `semantic-release` directly on POSIX systems. Windows `.cmd` shims cannot be launched directly through Node's `CreateProcess` path, so Windows dispatch uses the system `cmd.exe` solely to execute `semantic-release.cmd` with fixed arguments. No repository-owned platform wrapper is introduced.

## Consequences

Plugin changes receive independent versions without relying on commit scopes for component attribution. Claude and Codex versions, component changelogs, marketplace metadata, commits, and tags are produced through standard semantic-release plugins rather than repository-owned version logic.

The release toolchain must be installed and pinned outside the repository, because the repository does not adopt a package-manager workflow. Contributors must configure `core.hooksPath` for each checkout. Release credentials must permit generated commits and tags to be pushed directly to `main`.

Multi-plugin publication is not atomic. If a later component fails, earlier tags and commits remain published. Rerunning the release command resumes from those tags and completes the remaining components. Published tags must never be moved; faults are corrected with a subsequent release.

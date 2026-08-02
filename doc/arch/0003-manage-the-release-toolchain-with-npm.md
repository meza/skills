# 3. Manage the release toolchain with npm

Date: 2026-08-02

## Status

Accepted

Amends [2. Use semantic-release for independent plugin versioning](0002-use-semantic-release-for-independent-plugin-versioning.md)

## Context

ADR 2 placed the semantic-release toolchain outside the repository to avoid introducing a package-management workflow. That leaves the required dependency graph outside version control: maintainers must reproduce a version table manually, the hook discovers an ambient executable through `PATH`, and CI cannot prove that the documented toolchain installs together.

The release orchestrator is already a Node program, semantic-release and its plugins are Node packages, and the repository requires an exact Node version. Reproducible releases need one authoritative dependency set without turning plugin manifests into npm packages or introducing npm publishing.

## Decision

We will use npm to manage the root release-toolchain dependencies. A private root `package.json` declares exact development dependency versions and the required Node and npm versions; `package-lock.json` records the complete dependency graph. Maintainers and CI will install it with `npm ci`.

The root package will expose `npm run release` as the maintainer-facing release command. A dedicated Node release script will resolve semantic-release from the repository's `node_modules/.bin` directory, orchestrate component publication, and fail with installation guidance when the dependency is absent. The pre-push hook will call only the script's non-mutating check operation.

The root package will define no package version, workspaces, or publishing configuration. Plugin-level package files remain identity metadata for `semantic-release-monorepo`; plugin manifests remain the released-version authority. This amendment does not change ADR 2's independent release calculation, generated files, tag scheme, or publishing boundaries.

## Consequences

The repository and lockfile become the authoritative, reproducible release environment. A checkout can be prepared with one standard command, CI can verify installation on Windows and POSIX, and the hook no longer depends on whichever semantic-release installation happens to be on `PATH`.

Contributors need npm and a local `node_modules` directory before the push guard or release command can run. Dependency updates create intentional lockfile changes and must be reviewed like other toolchain changes. npm provides the stable release entry point, while the Node release script owns orchestration. The repository does not publish npm packages.

Semantic-release installs its default npm-publishing plugin transitively even though this repository does not configure or execute that plugin. Vulnerabilities in the npm CLI bundled under that unused plugin cannot be replaced through root overrides; maintainers must review semantic-release updates until its upstream dependency tree is patched.

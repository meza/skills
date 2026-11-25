---
name: pnpm
description: Use for pnpm commands, dependency and workspace changes, lockfiles, catalogs, overrides, patches, hooks, migrations, CI installs, stores, and troubleshooting. Check official sources for the pnpm version the project uses.
---

# pnpm

pnpm behavior changes across releases. The repository owns its pnpm version and local conventions. Commit-pinned pnpm documentation owns general mechanics, while the matching pnpm release or source tag owns version-specific behavior.

## Establish the project context

Read the nearest repository guidance and inspect the task-relevant manifests, `pnpm-workspace.yaml`, lockfile, scripts, and CI configuration.

Use the repository's committed exact pnpm pin instead of the locally installed version. Treat conflicting declarations or a missing pin as unresolved unless repository guidance establishes the governing version. Do not rely on version-sensitive behavior while it remains unresolved.

Distinguish pnpm capability from repository policy. Local scripts and guidance may deliberately narrow or wrap pnpm behavior.

## Research from official sources

Never use `pnpm --help`, `pnpm help`, command-specific `--help`, or equivalent CLI output to discover, interpret, or verify pnpm behavior. CLI help lacks the contextual guidance needed to apply commands safely. Inspect it only when the user explicitly asks about the help output itself, and never use it as a substitute for the documentation when advising or acting.

Select a `pnpm/pnpm.io` revision whose documentation covers the governing pnpm version, then resolve it to a commit SHA. Use that SHA rather than `main` in raw documentation URLs:

- pnpm 11 or 12: `https://raw.githubusercontent.com/pnpm/pnpm.io/<commit-sha>/docs/<page>.md`
- pnpm 10: `https://raw.githubusercontent.com/pnpm/pnpm.io/<commit-sha>/versioned_docs/version-10.x/<page>.md`

Inspect `docs` and `versioned_docs` when the page or major is unclear. For research across several pages, materialize the relevant documentation once under `.tmp/pnpm-docs-<commit-sha>/` using a shallow or sparse checkout at the selected SHA, then reuse it. Use Git worktree metadata to identify the primary checkout. Outside the primary worktree, treat an existing `.tmp/pnpm-docs-<hash>/` as valid and record the hash from its name without checking the checkout state, unless the task changes the pnpm version. In the primary checkout or a pnpm version-upgrade task, confirm the cached checkout's `HEAD` equals the selected commit before reusing it.

Verify behavior that changed within a major against the matching release notes or source tag in `pnpm/pnpm`. Prefer the narrowest applicable raw primary source. Do not substitute rendered repository pages, blogs, search summaries, copied examples, or memory.

When documentation and observed behavior differ, check the effective pnpm version and local configuration. Whenever consequential uncertainty remains, report it and stop before advising or acting rather than guessing.

## Apply changes conservatively

Target the intended workspace and dependency field. Reuse repository scripts and configuration locations, and avoid unrelated dependency updates or lockfile churn.

Lifecycle-script approvals, registries, authentication, proxies, shared stores, overrides, patches, publishing, and integrity exceptions are security-sensitive. Explain their consequences and follow the governing authority requirements. Never expose or commit credentials.

Inspect every affected manifest, configuration file, patch, and lockfile after a pnpm command changes files. Command success does not prove that only the intended scope changed.

## Self-verification

- Record the governing pnpm version, documentation SHA, and any exact release or source tag used.
- Confirm raw documentation, not CLI help, established the relevant behavior.
- Confirm repository policy, intended scope, resulting changes, and the narrowest relevant check.
- Confirm security-sensitive consequences were handled and no credential appears in files, captured output, or the result.

## Maintain quick references

After an official-source lookup identifies a useful section, automatically add or refresh its entry under `Quick references`. Do this without asking for separate permission.

Use `- [Short description of the content](permalink)`. Link to the actual verified section in the official corpus with a GitHub `blob/<full-commit-sha>/...` URL and a heading or line anchor. Include version context in the description when needed to distinguish applicability. Keep entries concise and deduplicate existing coverage.

Use the index to find sources, not as a substitute for reading them. Before relying on an entry, check its version applicability and freshness through the research workflow above. Repair or replace stale links and descriptions; remove entries that no longer apply when no useful replacement exists.

When a coherent topic warrants subdivision, move its entries into `quick-references/<topic>.md` within this skill directory. Replace the moved entries with a short topic description and relative link in the main index. State when to read that topic index. Preserve all useful moved entries and keep topic indexes limited to descriptions and links, without copied documentation or local technical recipes.

This automatic upkeep permission covers only the `Quick references` index and its linked topic indexes. It does not cover frontmatter, research instructions, or other policy. Respect explicit read-only assignments and project boundaries; report upkeep that those constraints prevent. Verify section anchors, descriptions, version qualifiers, and local router links after edits.

## Quick references

- [Use catalog versions in dependency fields (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/catalogs.md#the-catalog-protocol-catalog)
- [Define and reference the default catalog (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/catalogs.md#default-catalog)
- [Verify manifest and lockfile consistency with a frozen install (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/cli/install.md#--frozen-lockfile)
- [Install pnpm and cache trusted directories in CI (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/continuous-integration.md#installing-pnpm)
- [Configure and safely share a pnpm store (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/settings/store.md#storedir)
- [Fail installation for unreviewed dependency build scripts (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/settings/build.md#strictdepbuilds)
- [Approve or deny dependency build scripts with `allowBuilds` (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/settings/build.md#allowbuilds)
- [Install the current project as standalone with `--ignore-workspace` (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/cli/install.md#--ignore-workspace)
- [Configure exact-version patches with `patchedDependencies` (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/cli/patch.md#patcheddependencies)
- [Generate and register a dependency patch with `patch-commit` (pnpm 12.11.2)](https://github.com/pnpm/pnpm.io/blob/e5b39ba571ca59b6e7b492082e8d5b81a05217c0/docs/cli/patch-commit.md#L6-L8)
- [Run installed project binaries with `pnpm exec` (pnpm 12.12.1)](https://github.com/pnpm/pnpm.io/blob/0472530abfca3f724024377739c5796c27fe7956/docs/cli/exec.md#examples)
- [Run manifest scripts with `pnpm run` (pnpm 12.12.1)](https://github.com/pnpm/pnpm.io/blob/0472530abfca3f724024377739c5796c27fe7956/docs/cli/run.md#examples)

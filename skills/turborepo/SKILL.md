---
name: turborepo
description: MUST USE before using, changing, reviewing, debugging, or reasoning about Turborepo tasks, configuration, caching, or monorepo build orchestration in pnpm projects. Use the pnpm skill for package-manager operations.
---

# Turborepo

Use current official documentation to establish Turborepo behavior before advising or changing tasks, configuration, or workflows.

## Establish the project context

Inspect the relevant manifests, lockfile, workspace declarations, root and package scripts, Turbo configuration, and CI context. Establish the governing `turbo` version and actual package and task dependencies. Read owning scripts before inferring outputs, environment loading, or dependency relationships.

Documentation owns Turbo mechanics. Repository guidance and configuration own package boundaries, task ownership, and dependency policy.

Use pnpm exclusively and apply the [pnpm skill](../pnpm/SKILL.md) for package-manager operations.

## Research from official sources

Start at the [official documentation source](https://github.com/vercel/turborepo/tree/main/apps/docs/content/docs). Resolve the current `main` revision to a commit SHA and inspect its documentation tree. Read complete task-relevant Markdown or MDX pages and relevant linked guidance through raw URLs:

`https://raw.githubusercontent.com/vercel/turborepo/<commit-sha>/apps/docs/content/docs/<page-path>`

Select the relevant concepts, repository guides, configuration references, or command references from the actual tree. Verify that each page applies to the governing version, including version notes and experimental status.

If behavior differs or version coverage is missing, consult matching official release notes and source tags. Check installed declarations or implementation where needed. For migrations, establish source and target versions and read the applicable upgrade guidance and intervening breaking changes. Current documentation does not authorize dependency upgrades or experimental adoption.

Establish relevant behavior from these sources rather than bundled technical summaries, memory, search summaries, third-party guides, or copied examples. If sources cannot resolve consequential uncertainty, state the gap and stop only the affected decision until it is resolved.

## Verify the result

Record the governing Turbo version, documentation SHA and page paths, and any release or source tag used. Confirm that the proposed behavior fits repository policy and the owning scripts.

Use the narrowest documented inspection or verification for the changed surface. Check relevant task relationships, cache inputs and outputs, environment hashing and availability, persistence, and configuration scope against the official contract.

## Maintain quick references

After an official-source lookup identifies a useful section, automatically add or refresh its entry under `Quick references`. Do this without asking for separate permission.

Use `- [Short description of the content](permalink)`. Link to the actual verified section in the official corpus with a GitHub `blob/<full-commit-sha>/...` URL and a heading or line anchor. Include version context in the description when needed to distinguish applicability. Keep entries concise and deduplicate existing coverage.

Use the index to find sources, not as a substitute for reading them. Before relying on an entry, check its version applicability and freshness through the research workflow above. Repair or replace stale links and descriptions; remove entries that no longer apply when no useful replacement exists.

When a coherent topic warrants subdivision, move its entries into `quick-references/<topic>.md` within this skill directory. Replace the moved entries with a short topic description and relative link in the main index. State when to read that topic index. Preserve all useful moved entries and keep topic indexes limited to descriptions and links, without copied documentation or local technical recipes.

This automatic upkeep permission covers only the `Quick references` index and its linked topic indexes. It does not cover frontmatter, research instructions, or other policy. Respect explicit read-only assignments and project boundaries; report upkeep that those constraints prevent. Verify section anchors, descriptions, version qualifiers, and local router links after edits.

## Quick references

- [Use just-in-time internal packages (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/bdfbb2141e5ce76d2300c52fe38c01e7eb42129a/apps/docs/content/docs/core-concepts/internal-packages.mdx#just-in-time-packages)
- [Register scripts from the workspace root as tasks (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/configuring-tasks.mdx#registering-root-tasks)
- [Understand Package Configuration inheritance and array replacement (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/reference/package-configurations.mdx#inheritance-behavior)
- [Depend on a task in a specific package (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/configuring-tasks.mdx#depending-on-a-specific-task-in-a-specific-package)
- [Run dependency-aware tasks in parallel with Transit Nodes (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/configuring-tasks.mdx#dependent-tasks-that-can-be-run-in-parallel)
- [Use a task's built-in dependency-aware watcher (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/reference/watch.mdx#dependency-aware-persistent-tasks)
- [Restart persistent tasks without dependency-aware watchers (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/reference/watch.mdx#persistent-tasks-without-dependency-awareness)
- [Understand how custom inputs replace source-control defaults (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/configuring-tasks.mdx#specifying-inputs)
- [Restore default task inputs before adding exclusions (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/configuring-tasks.mdx#restoring-defaults-with-turbo_default)
- [Include root-relative files in task inputs with `$TURBO_ROOT$` (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/reference/configuration.mdx#turbo_root)
- [Declare file outputs for cache restoration (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/configuring-tasks.mdx#specifying-outputs)
- [Choose the local cache directory (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/reference/run.mdx#--cache-dir-path)
- [Disable caching for side-effect tasks (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/configuring-tasks.mdx#performing-side-effects)
- [Include shared files in every task hash (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/reference/configuration.mdx#globaldependencies)
- [Limit task runtime variables with Strict Mode (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/using-environment-variables.mdx#strict-mode)
- [Pass runtime-only variables without hashing them (Turbo 2.11.8)](https://github.com/vercel/turborepo/blob/7663d6b9f56061d07214f874b494fba94bdf4885/apps/docs/content/docs/crafting-your-repository/using-environment-variables.mdx#passthrough-variables)

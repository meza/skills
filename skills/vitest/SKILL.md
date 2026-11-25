---
name: vitest
description: MUST USE before writing, changing, reviewing, debugging, or reasoning about Vitest tests, APIs, configuration, or migrations. Verify runner features such as mocking, test environments, and coverage against official sources for the project's Vitest version.
---

# Vitest

Use current official documentation to establish Vitest behavior before advising or changing tests or configuration.

## Establish the project context

Inspect the affected workspace's manifests, lockfile, test scripts, Vitest configuration, and setup files. Establish the governing Vitest version, related integration versions, selected test project, and execution environment.

Documentation owns Vitest mechanics. Repository guidance owns test boundaries, dependency substitution, determinism, placement, and dependency policy.

## Research from official sources

Resolve the current `main` revision of `vitest-dev/vitest` to a commit SHA. Inspect the actual documentation paths and select the sources relevant to the task:

- [usage guides](https://github.com/vitest-dev/vitest/tree/main/docs/guide) for supported testing patterns, APIs, mocking, timers, lifecycle, and environments
- [configuration reference](https://github.com/vitest-dev/vitest/tree/main/docs/config) for option semantics, defaults, scope, interactions, and version conditions
- [release and migration context](https://github.com/vitest-dev/vitest/tree/main/docs/blog) for release-specific changes, following the applicable instructions under `docs/guide/migration`

Read complete task-relevant pages and referenced migration instructions through raw URLs at that SHA:

`https://raw.githubusercontent.com/vitest-dev/vitest/<commit-sha>/docs/<page-path>`

Verify that each selected page applies to the governing versions, including version notes and experimental status. If behavior differs or version coverage is missing, consult matching official release notes and source tags. Check installed declarations or implementation where needed.

For migrations, establish the source and target versions. Read the applicable migration instructions and release posts for intervening breaking changes. Do not treat current documentation as permission to upgrade dependencies or adopt experimental features.

Establish relevant behavior from these sources rather than memory, search summaries, third-party guides, or copied examples. If sources cannot resolve consequential uncertainty, state the gap and stop only the affected decision until it is resolved.

## Verify the result

Record the governing versions, documentation SHA and page paths, and any release or source tag used. Confirm that the proposed behavior fits the repository's configuration and testing policies. Use the narrowest applicable verification for the changed surface.

## Maintain quick references

After an official-source lookup identifies a useful section, automatically add or refresh its entry under `Quick references`. Do this without asking for separate permission.

Use `- [Short description of the content](permalink)`. Link to the actual verified section in the official corpus with a GitHub `blob/<full-commit-sha>/...` URL and a heading or line anchor. Include version context in the description when needed to distinguish applicability. Keep entries concise and deduplicate existing coverage.

Use the index to find sources, not as a substitute for reading them. Before relying on an entry, check its version applicability and freshness through the research workflow above. Repair or replace stale links and descriptions; remove entries that no longer apply when no useful replacement exists.

When a coherent topic warrants subdivision, move its entries into `quick-references/<topic>.md` within this skill directory. Replace the moved entries with a short topic description and relative link in the main index. State when to read that topic index. Preserve all useful moved entries and keep topic indexes limited to descriptions and links, without copied documentation or local technical recipes.

This automatic upkeep permission covers only the `Quick references` index and its linked topic indexes. It does not cover frontmatter, research instructions, or other policy. Respect explicit read-only assignments and project boundaries; report upkeep that those constraints prevent. Verify section anchors, descriptions, version qualifiers, and local router links after edits.

## Quick references

- [Coverage providers and optional support packages (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/fb150158b3499ae9e2bd52defd90b0a09b860424/docs/guide/coverage.md#coverage-providers)
- [Include unimported source in coverage reports (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/fb150158b3499ae9e2bd52defd90b0a09b860424/docs/guide/coverage.md#including-and-excluding-files-from-coverage-report)
- [Enable coverage collection (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/fb150158b3499ae9e2bd52defd90b0a09b860424/docs/config/coverage.md#coverageenabled)
- [Set all four coverage thresholds to 100% (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/fb150158b3499ae9e2bd52defd90b0a09b860424/docs/config/coverage.md#coveragethresholds100)
- [Mock or spy on an exported function (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/fb150158b3499ae9e2bd52defd90b0a09b860424/docs/guide/mocking.md#mock-an-exported-function)
- [Access Playwright context from browser commands (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/7a825db43e2beca0b219d2eadaec334cb81af0c7/docs/api/browser/commands.md#custom-playwright-commands)
- [Combine Node and Browser Mode projects (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/7a825db43e2beca0b219d2eadaec334cb81af0c7/docs/guide/browser/index.md#L265-L309)
- [Run-phase timing, slow-import, and coverage profiling (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/7a825db43e2beca0b219d2eadaec334cb81af0c7/docs/guide/profiling-test-performance.md#profiling-test-performance)
- [DOM environment cost per test file versus per worker (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/7a825db43e2beca0b219d2eadaec334cb81af0c7/docs/guide/improving-performance.md#test-environments)
- [Setup files run before every test file (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/7a825db43e2beca0b219d2eadaec334cb81af0c7/docs/config/setupfiles.md#setupfiles)
- [Randomize test-file order from the root configuration (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/7a825db43e2beca0b219d2eadaec334cb81af0c7/docs/config/sequence.md#sequenceshufflefiles--sequence-shuffle-files)
- [Randomize test order within a project (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/7a825db43e2beca0b219d2eadaec334cb81af0c7/docs/config/sequence.md#sequenceshuffletests-sequence-shuffle-tests)
- [Project configuration inheritance rules (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/7a825db43e2beca0b219d2eadaec334cb81af0c7/docs/guide/projects.md#configuration)
- [Select an environment for one test file (Vitest 5.0.5)](https://github.com/vitest-dev/vitest/blob/c8558f1c2e3232a119aed69ca53e6923b232094c/docs/guide/environment.md#environments-for-specific-files)

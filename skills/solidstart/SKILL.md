---
name: solidstart
description: MUST USE before writing, changing, reviewing, debugging, or reasoning about SolidJS or SolidStart code. Verify reactivity, routing, rendering, and framework configuration against official sources for the project's versions.
---

# Solid and SolidStart

Use current official documentation to establish framework behavior before advising or changing code.

## Establish the project context

Inspect the affected workspace's manifests, lockfile, framework configuration, and relevant repository guidance. Establish the governing versions of `solid-js`, `@solidjs/start`, and `@solidjs/router` where used, together with the application's rendering mode.

Documentation owns framework mechanics. Repository guidance owns architecture, testing, styling, and dependency policy. Apply documented capabilities within those boundaries.

## Research from official sources

Start at the [official documentation source](https://github.com/solidjs/solid-docs/tree/main/src/routes). Resolve the current `main` revision to a commit SHA and inspect its route tree. Read the complete task-relevant Markdown or MDX pages through raw URLs:

`https://raw.githubusercontent.com/solidjs/solid-docs/<commit-sha>/src/routes/<page-path>`

Use the concepts, guides, and reference pages for Solid, `solid-router` for routing, and the version-appropriate subtree of `solid-start` for SolidStart. Inspect the actual paths and page version metadata; the latest repository contains documentation for multiple framework versions.

Verify that each selected page applies to the project's governing versions. If behavior differs or version coverage is missing, consult matching official release notes and source tags. Check installed declarations or implementation where needed. Do not treat current documentation as permission to upgrade the project.

Establish relevant behavior from these sources rather than memory, search summaries, third-party guides, or copied examples. If sources cannot resolve consequential uncertainty, state the gap and stop only the affected decision until it is resolved.

## Verify the result

Record the governing framework versions, documentation SHA and page paths, and any matching release or source tag used. Confirm that the proposed behavior fits the repository's configuration and policies. Use the narrowest applicable verification for the changed surface.

## Maintain quick references

After an official-source lookup identifies a useful section, automatically add or refresh its entry under `Quick references`. Do this without asking for separate permission.

Use `- [Short description of the content](permalink)`. Link to the actual verified section in the official corpus with a GitHub `blob/<full-commit-sha>/...` URL and a heading or line anchor. Include version context in the description when needed to distinguish applicability. Keep entries concise and deduplicate existing coverage.

Use the index to find sources, not as a substitute for reading them. Before relying on an entry, check its version applicability and freshness through the research workflow above. Repair or replace stale links and descriptions; remove entries that no longer apply when no useful replacement exists.

When a coherent topic warrants subdivision, move its entries into `quick-references/<topic>.md` within this skill directory. Replace the moved entries with a short topic description and relative link in the main index. State when to read that topic index. Preserve all useful moved entries and keep topic indexes limited to descriptions and links, without copied documentation or local technical recipes.

This automatic upkeep permission covers only the `Quick references` index and its linked topic indexes. It does not cover frontmatter, research instructions, or other policy. Respect explicit read-only assignments and project boundaries; report upkeep that those constraints prevent. Verify section anchors, descriptions, version qualifiers, and local router links after edits.

## Quick references

- [Use locally scoped CSS Modules in Solid components (Solid 1.9.17)](https://github.com/solidjs/solid-docs/blob/dadb1f193443921569890316cda059ee13f06556/src/routes/%282%29guides/%280%29styling-components/css-modules.mdx#using-modules-in-components)
- [Resolve nested fragments and zero-argument child accessors (Solid 1.9.17)](https://github.com/solidjs/solid-docs/blob/dadb1f193443921569890316cda059ee13f06556/src/routes/reference/component-apis/children.mdx#behavior)
- [Resource source triggers and suppression (Solid 1.9.17)](https://github.com/solidjs/solid-docs/blob/c0e44ba82e29b1069a8f09caa45d041934bc8f93/src/routes/reference/basic-reactivity/create-resource.mdx#parameters)
- [Resource states, loading and error flags, and latest value (Solid 1.9.17)](https://github.com/solidjs/solid-docs/blob/c0e44ba82e29b1069a8f09caa45d041934bc8f93/src/routes/reference/basic-reactivity/create-resource.mdx#return-value)
- [Synchronous server-only string rendering behavior (Solid 1.9.17)](https://github.com/solidjs/solid-docs/blob/c0e44ba82e29b1069a8f09caa45d041934bc8f93/src/routes/reference/rendering/render-to-string.mdx#behavior)
- [Custom server document structure (SolidStart 2.0.6)](https://github.com/solidjs/solid-docs/blob/c0e44ba82e29b1069a8f09caa45d041934bc8f93/src/routes/solid-start/v2/reference/entrypoints/entry-server.mdx#examples)
- [SPA mode entrypoint behavior (SolidStart 2.0.6)](https://github.com/solidjs/solid-docs/blob/303aa3b4b894ff01abf358bd75565bc39360a3e7/src/routes/solid-start/v2/reference/config/solid-start.mdx#ssr)
- [Import component styles (SolidStart 2.0.6)](https://github.com/solidjs/solid-docs/blob/8d2b0f646db221a6cf110a1238268e41d70c20c4/src/routes/solid-start/v2/%280%29building-your-application/%282%29css-and-styling.mdx#styling-components)
- [Client entry selection and mount contract (SolidStart 2.0.6)](https://github.com/solidjs/solid-docs/blob/303aa3b4b894ff01abf358bd75565bc39360a3e7/src/routes/solid-start/v2/reference/entrypoints/entry-client.mdx#L22-L40)
- [Disable HMR runtime injection with `hot: false` (vite-plugin-solid 2.11.14)](https://github.com/solidjs/solid-vite-plugin/blob/ce707ed620d5d4839472f9defb3c52c6ce57840e/README.md#optionshot)
- [Native and delegated JSX event handlers (Solid 1.9.17)](https://github.com/solidjs/solid-docs/blob/dadb1f193443921569890316cda059ee13f06556/src/routes/reference/jsx-attributes/on_.mdx#behavior)

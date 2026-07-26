# Plugins

This directory contains installable agent plugins that can serve more than one host from one versioned package root.

## Review Swarm

`review-swarm` reviews a submitted code change through 84 focused quality lenses. Each investigator owns one lens. A separate synthesis pass verifies and combines the evidence into one actionable report.

Both marketplaces point to `plugins/review-swarm`. Host-specific component paths prevent Claude and Codex from discovering each other's orchestration instructions:

```text
review-swarm/
|-- .claude-plugin/plugin.json
|-- .codex-plugin/plugin.json
|-- claude/
|   |-- hooks/
|   |-- scripts/
|   |-- skills/
|   `-- workflows/
|-- codex/
|   `-- skills/
`-- shared/
    |-- code_review_symptoms.csv
    |-- instruction_template.md
    |-- code_review_output_schema.json
    `-- review-swarm.mjs
```

Claude keeps its named workflow and direct-path fallback. Codex uses native subagents directly from its skill. Both hosts use the same offline helper and repository-owned artifacts.

## Artifact ownership

The catalogue, instruction template, and output schema under `review-swarm/shared` are authoritative in this repository. Runtime code does not download or synchronize them. Git and the plugin version are the version history.

The helper requires Node 18 or newer. It validates the artifact contracts before rendering briefs or accepting results:

```console
node plugins/review-swarm/shared/review-swarm.mjs verify
```

## Validation

Run the fast local checks from the repository root:

```console
node --test plugins/review-swarm/shared/review-swarm.test.mjs
node .github/scripts/check-plugins.mjs .
npx --yes @anthropic-ai/claude-code@2.1.104 plugin validate plugins/review-swarm
```

CI also adds this repository as an isolated Codex marketplace with `@openai/codex@0.145.0` and installs every listed Codex plugin. This catches marketplace ingestion and cached-package path errors.

## Release procedure

When changing the catalogue, template, or schema:

1. Edit the authoritative file under `review-swarm/shared`.
2. Run the helper tests and both host validators.
3. Bump both plugin manifests to the same semantic version.
4. Bump `.claude-plugin/marketplace.json` metadata when publishing the repository marketplace update.

There is no upstream synchronization step. A previous release can be restored by reverting the plugin and marketplace files together.

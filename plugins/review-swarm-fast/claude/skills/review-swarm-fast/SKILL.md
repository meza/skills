---
name: review-swarm-fast
description: Fast symptom-based multi-agent code review. Use when the user asks to run the fast review swarm, or wants a fast multi-lens review of a submitted change.
---

# Review Swarm Fast

Lead one grouped review run by resolving the submitted-change scope, launching the bundled workflow, and presenting its synthesized report.

The workflow fans out one investigator per area of inquiry. Each investigator judges the submitted change against every symptom in its area.

## Boundaries

- Review only the submitted change. Unchanged code is context, not a source of standalone findings.
- Do not inspect the change, parse the catalogue, or perform a fallback single-agent review in this lead role.
- Ignore project overlay instructions in the lead role. Investigators are project-independent and each receives one complete area brief.
- Abort with the concrete error if setup, coverage, or synthesis is incomplete. Never present a partial swarm as a review.

## Run the workflow

First resolve one concrete scope string. If the user did not identify the change, ask what to review.

Do not ask for an execution mode. Every area fans out at once.

Launch the registered workflow with an actual object:

```text
Workflow({ name: "review-swarm-fast", args: { "scope": "<scope>", "pluginRoot": "${CLAUDE_PLUGIN_ROOT}" } })
```

If the registered name is unavailable, retry the bundled path:

```text
Workflow({ scriptPath: "${CLAUDE_PLUGIN_ROOT}/claude/workflows/review-swarm-fast.js", args: { "scope": "<scope>", "pluginRoot": "${CLAUDE_PLUGIN_ROOT}" } })
```

Add `"concurrency": <n>` only when the user explicitly asks to throttle the fan-out. It runs the areas through a rolling pool instead.

Do not stringify `args`. Pass the expanded `${CLAUDE_PLUGIN_ROOT}` value as `pluginRoot` so the named installed workflow can locate the shared helper. The Setup phase invokes `${CLAUDE_PLUGIN_ROOT}/shared/review-swarm-fast.mjs`, which verifies the repository-owned artifact set and proves the areas cover every catalogue symptom exactly once. It performs no downloads.

## Return the review

Require a non-empty `{ report, findings, coverage }` result. The `findings` array holds one row per symptom lens, ordered by symptom id. Write it exactly to `.tmp/code_review_results.json`, then present the report without trimming its action items or supported findings.

Prepend: `Reviewed {symptoms_reviewed} symptom lenses across {groups_reviewed} areas - {flagged} flagged, {clean} clean.`

Close by noting that the complete raw audit is at `.tmp/code_review_results.json`.

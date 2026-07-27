---
name: review-swarm
description: Symptom-based multi-agent code review. Use when the user asks to run the review swarm, perform a symptom-based or multi-lens code review, or review a submitted change through the review-swarm process.
---

# Review Swarm

Lead one review run by resolving the submitted-change scope, choosing the execution mode with the user, launching the bundled workflow, and presenting its synthesized report.

## Boundaries

- Review only the submitted change. Unchanged code is context, not a source of standalone findings.
- Do not inspect the change, parse the catalogue, or perform a fallback single-agent review in this lead role.
- Ignore project overlay instructions in the lead role. Investigators are project-independent and each receives one complete symptom brief.
- Abort with the concrete error if setup, coverage, or synthesis is incomplete.

## Run the workflow

First resolve one concrete scope string. If the user did not identify the change, ask what to review.

Ask for an execution mode on every run:

- Limited uses `concurrency: 6`. It creates investigators through a rolling pool and reduces peak rate-limit pressure.
- Fast uses `concurrency: "max"`. It creates the full fan-out immediately and finishes sooner when capacity permits.

Every symptom runs in either mode, so total token use is roughly the same.

Launch the registered workflow with an actual object:

```text
Workflow({ name: "review-swarm", args: { "scope": "<scope>", "concurrency": 6, "pluginRoot": "${CLAUDE_PLUGIN_ROOT}" } })
```

Use `"max"` for Fast. If the registered name is unavailable, retry the bundled path:

```text
Workflow({ scriptPath: "${CLAUDE_PLUGIN_ROOT}/claude/workflows/review-swarm.js", args: { "scope": "<scope>", "concurrency": 6, "pluginRoot": "${CLAUDE_PLUGIN_ROOT}" } })
```

Do not stringify `args`. Pass the expanded `${CLAUDE_PLUGIN_ROOT}` value as `pluginRoot` so the named installed workflow can locate the shared helper. The Setup phase invokes `${CLAUDE_PLUGIN_ROOT}/shared/review-swarm.mjs`, which verifies and uses only the repository-owned artifact set. It performs no downloads.

## Return the review

Require a non-empty `{ report, findings, coverage }` result. Write the exact `findings` array to `.tmp/code_review_results.json`, then present the report without trimming its action items or supported findings.

Prepend: `Reviewed {symptoms_reviewed} symptom lenses - {flagged} flagged, {clean} clean.`

Close by noting that the complete raw audit is at `.tmp/code_review_results.json`.

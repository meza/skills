---
name: review-swarm
description: Run a symptom-based multi-agent review of a submitted code change. Use when the user asks to run review-swarm, requests a review swarm, or wants one investigator per code-quality symptom followed by an evidence-based synthesis.
---

# Review Swarm

Run the repository-owned review catalogue through native Codex subagents. One fresh investigator owns one symptom. A separate fresh agent synthesizes the complete validated audit.

## Preconditions and scope

Use the absolute path of this `SKILL.md` from the skill catalogue to resolve `<plugin-root>`: it is three directories above the directory containing this file. The shared helper is `<plugin-root>/shared/review-swarm.mjs`.

Resolve one concrete submitted-change scope before doing any review work. If the user did not identify the change, ask what to review. Review only changed behavior and hunks; unchanged code is context unless the submitted change depends on it, worsens it, or makes it newly relevant.

Do not use custom agent configuration, CSV batch jobs, or a nested review-swarm. If native `spawn_agent`, `wait_agent`, `followup_task`, and `list_agents` facilities are unavailable, abort and report that review coverage cannot be guaranteed.

## Choose capacity

Ask the user for Limited or Fast on every run, even if they chose a mode on a previous run:

- Limited runs exactly two investigators concurrently.
- Fast uses currently available subagent capacity, capped at six investigators concurrently.

Every symptom runs in both modes. The choice changes elapsed time and peak capacity, not catalogue coverage. Use `list_agents` before starting and as the queue advances. If the requested mode cannot obtain its required capacity, fail fast rather than silently changing modes.

## Prepare the run

Write the exact scope to `<workspace>/.tmp/review-swarm/scope.txt`, creating its parent directory if needed. Then run:

```text
node "<plugin-root>/shared/review-swarm.mjs" prepare --workspace "<workspace>" --scope-file "<workspace>/.tmp/review-swarm/scope.txt"
```

The command validates the repository-owned artifact structure, cleans only `<workspace>/.tmp/review-swarm`, parses the RFC-4180 catalogue, and returns a JSON manifest. Abort on any error or if `symptomCount` and `symptoms.length` differ.

## Investigate every symptom

Maintain a rolling queue at the chosen capacity. For each manifest entry, call `spawn_agent` with:

- `agent_type: "default"`;
- `fork_turns: "none"` so no conversation history is inherited;
- one task containing only the absolute brief path `<briefsDir>/<symptom-id>.md`, the unique result path `<resultsDir>/<symptom-id>.json`, and the rules below.

Each task must tell the investigator to:

- read and obey only its brief;
- ignore `AGENTS.md`, `CLAUDE.md`, and other project overlays for review policy;
- inspect tracked files read-only and review only the submitted change;
- find every violation of its one symptom without broadening into a general review;
- write exactly one JSON object matching `<schemaPath>` to its assigned result path;
- make no tracked-file edits and return only a short completion status after writing the file.

As investigators finish, validate each result immediately:

```text
node "<plugin-root>/shared/review-swarm.mjs" validate-result --file "<result-path>" --symptom-id "<symptom-id>"
```

If validation fails, send that investigator one `followup_task` containing the validator error and require it to replace its result with a corrected object. Wait and validate once more. Abort the entire review if the second result is absent or invalid. Never synthesize partial coverage.

Start the next queued investigator whenever a slot becomes free. Continue until every manifest ID has one validated result.

## Aggregate and synthesize

Run:

```text
node "<plugin-root>/shared/review-swarm.mjs" aggregate --workspace "<workspace>"
```

Require complete coverage and retain the returned `auditPath`. Then spawn one fresh `default` synthesis agent with `fork_turns: "none"`. Give it only the submitted-change scope, `auditPath`, the coverage object, and these rules:

- treat investigator results as evidence, not unquestionable truth;
- verify each non-zero claim against its cited evidence in the submitted change;
- discount vague or unsupported claims;
- merge duplicates and separate root causes from downstream symptoms;
- normalize severity without averaging;
- preserve every distinct supported non-zero finding;
- write Markdown to `<workspace>/.tmp/review-swarm/synthesis.md` with `Verdict`, `Action items`, `Supported findings`, and `Systemic patterns` only when real;
- make each action item state what to change, where, why, and its contributing symptom IDs;
- make no tracked-file edits.

Abort if the synthesis file is missing or empty.

## Present the result

Present the synthesis unchanged beneath this coverage line:

`Reviewed {symptoms_reviewed} symptom lenses - {flagged} flagged, {clean} clean.`

Close with the absolute raw audit path. Do not hide incomplete coverage, rewrite the synthesis, or replace a failed swarm with a single-agent review.

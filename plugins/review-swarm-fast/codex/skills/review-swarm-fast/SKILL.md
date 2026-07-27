---
name: review-swarm-fast
description: Run a fast grouped multi-agent review of a submitted code change. Use when the user asks to run review-swarm-fast, or wants a fast multi-lens review of a submitted change.
---

# Review Swarm Fast

Run the repository-owned review catalogue through native Codex subagents, grouped into areas of inquiry. One fresh investigator owns one area and reports every symptom in it. A separate fresh agent synthesizes the complete validated audit.

## Preconditions and scope

Use the absolute path of this `SKILL.md` from the skill catalogue to resolve `<plugin-root>`: it is three directories above the directory containing this file. The shared helper is `<plugin-root>/shared/review-swarm-fast.mjs`.

Resolve one concrete submitted-change scope before doing any review work. If the user did not identify the change, ask what to review. Review only changed behavior and hunks; unchanged code is context unless the submitted change depends on it, worsens it, or makes it newly relevant.

Do not use custom agent configuration, CSV batch jobs, or a nested review-swarm. If native `spawn_agent`, `wait_agent`, `followup_task`, and `list_agents` facilities are unavailable, abort and report that review coverage cannot be guaranteed.

## Capacity

Do not ask for an execution mode.

Use currently available subagent capacity, capped at six investigators concurrently, and maintain a rolling queue until every area has run. Use `list_agents` before starting and as the queue advances. If no capacity can be obtained, fail fast rather than reviewing a subset of the areas.

## Prepare the run

Write the exact scope to `<workspace>/.tmp/review-swarm-fast/scope.txt`, creating its parent directory if needed. Then run:

```text
node "<plugin-root>/shared/review-swarm-fast.mjs" prepare --workspace "<workspace>" --scope-file "<workspace>/.tmp/review-swarm-fast/scope.txt"
```

The command validates the repository-owned artifact structure, proves the areas cover every catalogue symptom exactly once, cleans only `<workspace>/.tmp/review-swarm-fast`, and returns a JSON manifest. Abort on any error or if `groupCount` and `groups.length` differ.

## Investigate every area

For each manifest entry in `groups`, call `spawn_agent` with:

- `agent_type: "default"`;
- `fork_turns: "none"` so no conversation history is inherited;
- one task containing only the absolute brief path `<briefsDir>/<group-id>.md`, the result schema path `<schemasDir>/<group-id>.json`, the unique result path `<resultsDir>/<group-id>.json`, and the rules below.

Each task must tell the investigator to:

- read and obey only its brief, which defines every symptom lens in its area;
- ignore `AGENTS.md`, `CLAUDE.md`, and other project overlays for review policy;
- inspect tracked files read-only and review only the submitted change;
- judge the change against each symptom in its area on that symptom's own evidence, finding every violation of every one of them without broadening into a general review or judging symptoms outside the area;
- complete the brief's self-verification before finalizing;
- write exactly one JSON object matching its area schema to its assigned result path, containing its `group_id` and exactly one finding per symptom id listed in the brief, with clean lenses reported as severity 0 rather than omitted;
- make no tracked-file edits and return only a short completion status after writing the file.

As investigators finish, validate each result immediately:

```text
node "<plugin-root>/shared/review-swarm-fast.mjs" validate-result --file "<result-path>" --group-id "<group-id>"
```

Validation fails when a member symptom is missing, duplicated, or foreign, so a dropped lens cannot pass as coverage. If validation fails, send that investigator one `followup_task` containing the validator error and require it to replace its result with a corrected object. Wait and validate once more. Abort the entire review if the second result is absent or invalid. Never synthesize partial coverage.

Start the next queued investigator whenever a slot becomes free. Continue until every manifest area has one validated result.

## Aggregate and synthesize

Run:

```text
node "<plugin-root>/shared/review-swarm-fast.mjs" aggregate --workspace "<workspace>"
```

Aggregation flattens the area results into one symptom-ordered audit and requires complete coverage. Retain the returned `auditPath` and `coverage`. Then spawn one fresh `default` synthesis agent with `fork_turns: "none"`. Give it only the submitted-change scope, `auditPath`, the coverage object, and these rules:

- treat investigator results as evidence, not unquestionable truth;
- verify each non-zero claim against its cited evidence in the submitted change;
- discount vague or unsupported claims;
- merge duplicates and separate root causes from downstream symptoms, including neighbouring lenses from one area that describe the same defect;
- normalize severity without averaging;
- preserve every distinct supported non-zero finding;
- write Markdown to `<workspace>/.tmp/review-swarm-fast/synthesis.md` with `Verdict`, `Action items`, `Supported findings`, and `Systemic patterns` only when real;
- make each action item state what to change, where, why, and its contributing symptom IDs;
- make no tracked-file edits.

Abort if the synthesis file is missing or empty.

## Present the result

Present the synthesis unchanged beneath this coverage line:

`Reviewed {symptoms_reviewed} symptom lenses across {groups_reviewed} areas - {flagged} flagged, {clean} clean.`

Close with the absolute raw audit path. Do not hide incomplete coverage, rewrite the synthesis, or replace a failed swarm with a single-agent review.

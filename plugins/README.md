# Plugins

This directory contains installable agent plugins that can serve more than one host from one versioned package root.

## Skill Creator

`skill-creator` packages the complete skill-authoring and evaluation environment for Codex and Claude. Its nested skill owns the evaluator scripts, schemas, tests, references, and eval viewer so those applications move and version together.

```text
skill-creator/
|-- .claude-plugin/plugin.json
|-- .codex-plugin/plugin.json
`-- skills/
    `-- skill-creator/
        |-- SKILL.md
        |-- scripts/
        |-- schemas/
        |-- tests/
        `-- eval-viewer/
```

## Conventional Commit Message

`conventional-commit-message` generates release-aware Conventional Commit messages from the actual Git surface. Its skill package includes the eval preparation script, fixture patches, and eval definitions so the workflow and its verification inputs remain versioned together.

```text
conventional-commit-message/
|-- .claude-plugin/plugin.json
|-- .codex-plugin/plugin.json
`-- skills/
    `-- conventional-commit-message/
        |-- SKILL.md
        |-- scripts/
        |-- fixtures/
        `-- evals/
```

## Addressing Code-Review Findings

`addressing-code-review-findings` verifies and classifies review feedback before presenting or acting on it. The plugin is a self-contained skill shared unchanged by Codex and Claude.

```text
addressing-code-review-findings/
|-- .claude-plugin/plugin.json
|-- .codex-plugin/plugin.json
`-- skills/
    `-- addressing-code-review-findings/
        `-- SKILL.md
```

## Fixing Linter Violations

`fixing-linter-violations` treats linter output as diagnostic evidence and requires fixes to address the underlying cause. The plugin is a self-contained skill shared unchanged by Codex and Claude.

```text
fixing-linter-violations/
|-- .claude-plugin/plugin.json
|-- .codex-plugin/plugin.json
`-- skills/
    `-- fixing-linter-violations/
        `-- SKILL.md
```

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

## Review Swarm Fast

`review-swarm-fast` covers the same 84 lenses, grouped into 9 areas of inquiry. One investigator owns one area: it reads the change once, then judges it against every symptom in that area. The fan-out is 9 agents instead of 84, which is where the time is saved.

`code_review_symptom_groups.csv` is this plugin's single authoritative catalogue, in the same register as the symptom catalogue but grouped: one row per area, `id,name,description,details,symptoms`. `details` is the combined lens for the area - what it covers, why those symptoms are answered by the same reading of the code, what strong and weak signals look like, and why the area matters. `symptoms` carries the area's own symptom definitions, one `SYM-### | name | description` per line. Nothing is referenced from outside the row, so a group travels with everything an investigator needs to review it.

Symptoms are grouped by the reading they require: the same files, the same traces, the same mental model.

| Area | Symptoms | Reading it requires |
| --- | --- | --- |
| GRP-01 Comprehension and intent | 10 | The change as its next maintainer will read it |
| GRP-02 Domain modeling and data expressiveness | 7 | Declarations, signatures, and data shapes |
| GRP-03 State effects and failure behavior | 11 | Execution paths, including every failure path |
| GRP-04 Structure boundaries and dependencies | 8 | The change mapped onto the modules around it |
| GRP-05 Evolvability and consistency | 9 | The cost of the next change, and the neighbours' conventions |
| GRP-06 Operability and production behavior | 9 | The system from the position of whoever is on call |
| GRP-07 Security privacy and user harm | 9 | Trust, privilege, and consequence for the people it touches |
| GRP-08 Test meaning and evidence | 11 | Each test as a specification of a promise |
| GRP-09 Test placement and isolation | 10 | Each test's layer and what it really touches |

Coverage stays accountable rather than assumed. `verify` fails if two areas define the same symptom id, so every finding is attributable to exactly one area. Each investigator must return one finding per symptom its area defines, with clean symptoms scored 0 rather than omitted, so a dropped symptom fails validation instead of passing as silence. The raw audit is written in symptom-id order and is shape-identical to a `review-swarm` run.

Validation can force a symptom to be answered, but it cannot force it to be searched. The brief's self-verification therefore asks the investigator whether any symptom in its area got a shallower search because a neighbouring symptom produced a louder finding, and requires it to search that symptom on its own terms before finishing.

The two plugins are independent packages and share no artifacts. `review-swarm` owns the per-symptom catalogue; `review-swarm-fast` owns the grouped one. A change to the review lenses that should apply to both has to be made in both.

## Artifact ownership

The catalogues, instruction templates, and output schemas under each plugin's `shared` directory are authoritative in this repository. Runtime code does not download or synchronize them. Git and the plugin version are the version history.

The helpers require Node 18 or newer. They validate the artifact contracts before rendering briefs or accepting results:

```console
node plugins/review-swarm/shared/review-swarm.mjs verify
node plugins/review-swarm-fast/shared/review-swarm-fast.mjs verify
```

Contributor validation and release instructions live in the repository-level [contribution guide](../CONTRIBUTING.md).

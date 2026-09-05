# Skill Creator

Skill Creator helps an agent create, revise, and evaluate agent skills. It combines three capabilities:

- guidance for structuring a skill and its bundled resources
- a collaborative process for turning an operator's intent into effective skill instructions
- an evaluation workflow that compares skill-enabled and baseline runs, grades them, and presents the results for human review

This guide is for operators who are authoring a skill, defining its evals, running the evaluator, or reviewing results. Contributors changing Skill Creator itself should use [CONTRIBUTING.md](CONTRIBUTING.md). Contributors changing the viewer should use [eval-viewer/CONTRIBUTING.md](eval-viewer/CONTRIBUTING.md).

## How the workflow fits together

```text
Author skill and evals
        |
        v
Run operator preflight
        |
        v
evaluate_skill.py
  |-- prepares isolated inputs
  |-- runs with the skill
  |-- runs without the skill (baseline)
  |-- grades each successful run
  `-- aggregates the iteration
        |
        v
Eval Viewer
  |-- compare skill and baseline behavior
  |-- inspect expectations, transcripts, and artifacts
  `-- save human feedback
        |
        v
Revise the skill and run the next iteration
```

The evaluator and the provider are separate execution boundaries. Run the evaluator from the operator host. The provider processes execute the prompts, but they do not own Python discovery, runtime bootstrap, run-root access, or viewer startup.

## Before you begin

You need:

- an installed Skill Creator plugin
- a skill directory containing `SKILL.md`
- Python 3.13 on the operator host
- an authenticated Codex or Claude provider CLI
- Node.js 24 or newer to run the packaged viewer
- a run root outside every Git workspace that the operator can create, execute, and remove files beneath
- package-index access on the first evaluator run, or an already populated Skill Creator package cache

Do not create a virtual environment or manually install the evaluator's Python packages. The evaluator bootstraps and verifies its own fingerprinted runtime below `<run-root>/.skill-creator/runtime/`.

If Python 3.13 is unavailable, do not install Python or `uv` silently. Follow the approval-based [Python acquisition ladder](references/evaluation-framework.md#acquiring-python-with-approval).

## Author the skill

Ask the agent to use Skill Creator and describe the outcome you need. For example:

```text
Help me create a skill for reviewing dependency update pull requests. It should
check changelogs, breaking changes, security notes, test coverage, and rollback
risk. The review should put blockers first.
```

The authoring process should establish:

- what the skill enables the agent to do
- the situations and user language that should trigger it
- the expected output or side effects
- important constraints, dependencies, and edge cases
- whether objective evals are useful for the skill

Skill Creator uses progressive disclosure. `SKILL.md` is the agent's entry point; detailed material belongs in `references/`, deterministic or repetitive work belongs in `scripts/`, and output resources such as templates belong in `assets/`. See [Anatomy of a Skill](references/skill-anatomy.md) and [Writing Skills](references/writing-skills.md) for the authoring contract.

## Define evals

Create the eval definition at:

```text
<skill-path>/evals/evals.json
```

Read [schemas/evals.schema.json](schemas/evals.schema.json) before creating or editing the file. The schema owns the supported shape, field names, and validation rules. New files must set `schema_version` to `1`; a missing version is accepted only as legacy schema v1.

A minimal one-turn suite looks like this:

```json
{
  "schema_version": 1,
  "skill_name": "dependency-upgrade-reviewer",
  "evals": [
    {
      "id": 1,
      "eval_name": "breaking dependency update",
      "turns": [
        {
          "prompt": "Review the dependency update in this project.",
          "expectations": [
            "The review identifies any documented breaking changes.",
            "The review puts release blockers before warnings and suggestions."
          ]
        }
      ],
      "outcome_expectations": [
        "The final review distinguishes blockers, warnings, and follow-up suggestions."
      ]
    }
  ]
}
```

### Eval definition reference

| Level | Field | Required | Meaning |
| --- | --- | --- | --- |
| Suite | `schema_version` | New files | Must be `1`. |
| Suite | `skill_name` | No | Skill identity used by preparation and display. Set it to the skill directory and frontmatter name. When present, it must be non-empty and cannot contain `\\`, `/`, or `:`. |
| Suite | `fixture_repo` | No | Git repository containing reusable fixture directories. Requires `fixture_ref`. |
| Suite | `fixture_ref` | With `fixture_repo` | Full 40-character commit SHA used to pin the fixture repository. |
| Suite | `fixture_base_path` | No | Existing local directory containing fixture directories. Cannot be combined with `fixture_repo`. |
| Suite | `evals` | Yes | Non-empty list of eval cases. |
| Eval | `id` | Yes | Integer identifier used by filters, artifacts, and the viewer. Use a unique value; duplicate IDs are not rejected early and can collide in generated paths. |
| Eval | `eval_name` | No | Human-readable name. The evaluator uses `eval-<id>` when omitted. |
| Eval | `turns` | Yes | Non-empty ordered list of prompts in one provider session. |
| Eval | `outcome_expectations` | No | Expectations graded against the completed eval as a whole. |
| Eval | `timeout` | No | Positive timeout in seconds inherited by turns that do not set their own timeout. |
| Eval | `files` | No | Skill-relative files copied into both skill and baseline workdirs. |
| Eval | `fixture` | No | Relative path to a fixture directory below the selected fixture source. |
| Eval | `fixture_in_workdir` | No | Places the fixture inside the provider workdir when `true`, or outside it when `false`. Defaults to `true`. |
| Turn | `prompt` | Yes | Non-empty prompt sent to the provider. |
| Turn | `expectations` | No | Expectations graded for this turn. |
| Turn | `timeout` | No | Positive timeout in seconds for this turn. |

Timeout precedence is turn `timeout`, then eval `timeout`, then the evaluator's `--timeout` value.

Do not add fields merely because the JSON schema permits additional properties. An extra field is meaningful only when an existing skill-local preparation hook explicitly consumes it.

### Write useful evals

Eval prompts should look like real user interactions. Avoid phrases such as "use the skill under test" or other eval-aware instructions that would not appear in normal use.

Expectations should be specific, independently useful, and grounded in the behavior the skill is meant to improve. Use turn expectations for behavior observable in one response and outcome expectations for behavior that can only be judged after the complete interaction. Do not force every eval to have the same number of expectations.

For multi-turn behavior, add turns in the order the provider should receive them:

```json
{
  "id": 2,
  "eval_name": "revision after feedback",
  "turns": [
    {
      "prompt": "Draft a skill for reviewing API documentation.",
      "expectations": [
        "The agent establishes the intended review scope before finalizing the skill."
      ]
    },
    {
      "prompt": "Tighten the trigger criteria and remove generic advice.",
      "expectations": [
        "The revision narrows the trigger criteria and removes generic guidance."
      ]
    }
  ],
  "outcome_expectations": [
    "The completed skill is focused on API documentation review."
  ]
}
```

Turn 1 starts a new provider session. Later turns resume that session, so the agent retains prior conversation state but cannot see future turns.

Agree the eval design with the user before running it. Evals are evidence for iteration, not a target to overfit. Look for patterns in feedback and real-world behavior rather than making narrow edits solely to raise a score.

## Supply input files and fixtures

Each eval can use plain files, a directory fixture, or both. The evaluator makes independent copies for every eval and run type, so skill and baseline runs cannot contaminate each other.

### Skill-relative files

Use `files` for individual inputs that belong with the skill, such as a sample document or patch:

```json
{
  "id": 3,
  "eval_name": "review supplied release notes",
  "files": [
    "evals/files/release-notes.md",
    "evals/files/dependency.diff"
  ],
  "turns": [
    {
      "prompt": "Review the supplied dependency change.",
      "expectations": []
    }
  ]
}
```

Paths are relative to the skill directory, must resolve to files inside that directory, and are copied with their relative paths preserved into both provider workdirs. Directories, missing files, and paths that escape the skill directory are rejected.

### Fixture source options

Fixtures are directory trees for evals that need a project, repository, or document workspace. Choose one source for the suite.

Use a pinned Git repository for shared, reproducible fixtures. Add these fields at the suite level alongside `evals`:

```json
{
  "fixture_repo": "https://github.com/example/agent-eval-fixtures.git",
  "fixture_ref": "2c4d9a8c4c7d95c4e5b46f7a0fd5f7f8c6e4d3b2"
}
```

Use an existing local fixture root while developing fixtures locally:

```json
{
  "fixture_base_path": "F:/dev/agent-eval-fixtures"
}
```

`fixture_repo` and `fixture_base_path` are mutually exclusive. A repository source must have a full commit SHA in `fixture_ref`; branches and short SHAs are rejected. A local source must already exist. Relative local paths resolve from the operator shell's working directory, so prefer an absolute path. Every eval's `fixture` value is a relative directory below the selected source and cannot be absolute or contain `..`.

### Fixture placement options

By default, the evaluator copies the fixture into the provider workdir:

```json
{
  "id": 4,
  "eval_name": "review project in workdir",
  "fixture": "sample-project",
  "fixture_in_workdir": true,
  "turns": [
    {
      "prompt": "Review this project's dependency update.",
      "expectations": []
    }
  ]
}
```

When no turn in an in-workdir eval contains `{{FIXTURE_PATH}}`, the evaluator prefixes the prompts with the fixture location. If any turn uses the placeholder, only prompts containing it receive an injected path; include it in each turn that needs the location.

Set `fixture_in_workdir` to `false` when the provider should receive the fixture as an external path rather than as part of its working directory:

```json
{
  "id": 5,
  "eval_name": "review external project",
  "fixture": "sample-project",
  "fixture_in_workdir": false,
  "turns": [
    {
      "prompt": "Review the dependency update at {{FIXTURE_PATH}}.",
      "expectations": []
    }
  ]
}
```

For external fixtures, include `{{FIXTURE_PATH}}` in every prompt that needs the path. The evaluator replaces it with the isolated fixture copy for the current run type. Without the placeholder, the provider is not told where the external fixture is.

### Advanced per-eval preparation

If copied files are not enough—for example, an eval needs a real Git repository with a staged patch—the skill can provide:

```text
<skill-path>/scripts/prepare.py
```

After generic input preparation, the evaluator invokes the hook once for each selected eval:

```text
<evaluator-python> scripts/prepare.py \
  --eval-id <id> \
  --eval-run-dir <prepared-eval-directory>
```

The hook runs with the skill directory as its working directory. It owns any additional eval fields it reads and must prepare both the `skill` and `baseline` copies consistently. A non-zero exit or timeout prevents that eval from running and is reported with redacted hook output. Keep this hook deterministic and skill-local; do not call the evaluator's internal fixture scripts directly.

## Run the evaluator

### Complete the operator preflight

Before every session:

1. Resolve a Python 3.13 executable and verify it by invoking the exact executable with `--version`.
2. Choose one run root outside every Git workspace and keep it for the whole iteration session.
3. Confirm the operator shell can create, execute, and remove files below that run root.
4. Confirm subprocess execution is allowed.
5. Confirm first use can reach the package index or reuse a populated Skill Creator cache.

Run `evaluate_skill.py` from the operator host, not from a generated workdir, fixture, provider session, baseline run, skill run, or grading session.

### Run the full comparison

Use the absolute Python path verified during preflight:

```bash
<python-3.13-path> <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-external-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort>
```

The default run executes every eval twice: once with the skill installed in the provider's discovery location and once without it. The baseline comparison shows whether the skill improves the requested behavior over the provider alone.

`evaluate_skill.py` is the only public evaluator entry point. Do not call `prepare_fixture.py`, `run_skill_evals.py`, a separate grader, or a separate aggregator.

The command prints preparation, manifest, and aggregation summaries when orchestration completes. Do not infer that every eval passed from a zero process exit or from the existence of `aggregated_results.json`: provider and grading failures can be recorded as run statuses while aggregation still completes. Inspect every entry in `run_manifest.json` and require the expected `grading.json` files.

### Evaluator options

| Option | Required | Default | Use |
| --- | --- | --- | --- |
| `--skill-path` | Yes | — | Skill directory containing `SKILL.md` and `evals/evals.json`. |
| `--run-root` | Yes | — | External root for runtime files, workdirs, and results. Must be outside every Git workspace. |
| `--provider` | Yes | — | `claude` or `codex`. |
| `--model` | Yes | — | Provider model identifier. |
| `--effort` | No | Provider default | Provider reasoning effort. |
| `--permission-mode` | No | `restricted` | Provider tool permissions: `restricted` or `unrestricted`. |
| `--eval-ids` | No | All evals | Comma-separated intentional subset, such as `1,3`. |
| `--skip-baseline` | No | False | Runs only the skill-enabled side. |
| `--max-parallel` | No | `10` | Positive maximum number of provider runs executed concurrently. |
| `--timeout` | No | `600` | Positive default timeout in seconds for each turn, each grading job, and each prepare-hook invocation. Eval and turn values can override turn execution. |

To run an intentional subset:

```bash
<python-3.13-path> <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-external-run-root> \
  --provider codex \
  --model <model-id> \
  --effort <effort> \
  --eval-ids 1,3
```

To run only the skill side:

```bash
<python-3.13-path> <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-external-run-root> \
  --provider codex \
  --model <model-id> \
  --effort <effort> \
  --skip-baseline
```

Use `--skip-baseline` only when the missing comparison is intentional. The viewer cannot show a baseline delta or baseline expectation results for a skill-only run.

### Provider permissions

Normal runs use `--permission-mode restricted`. If a known provider sandbox defect blocks the eval, the operator can explicitly choose unrestricted provider execution:

```bash
<python-3.13-path> <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-external-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort> \
  --permission-mode unrestricted
```

Unrestricted mode applies to skill, baseline, and grading provider processes. It maps to `danger-full-access` for Codex and `bypassPermissions` for Claude, granting the agent the access allowed by the host process. Use it only when the operator accepts that risk; prefer Linux when it avoids the sandbox defect.

Provider permissions cannot repair operator-host failures such as missing Python, denied subprocess execution, an unusable run root, or unavailable packages.

## Understand the generated workspace

In the paths below, `<skill-directory>` is the directory name from `--skill-path`. Set `skill_name` in `evals.json` to that same name so provider discovery and result identity stay consistent.

Each invocation recreates the working directories and uses the next result iteration number:

```text
<run-root>/
|-- .skill-creator/runtime/
`-- <skill-directory>/
    |-- fixtures/
    |-- workdirs/
    |   `-- eval-<ID>/
    |       |-- skill/
    |       `-- baseline/
    `-- results/
        `-- iteration-N/
            |-- progress.json
            |-- run_manifest.json
            |-- aggregated_results.json
            `-- eval-<ID>/
                |-- eval_metadata.json
                |-- skill/
                `-- baseline/
```

The `fixtures/` staging directory exists when repository-backed fixtures use the default staging location. Historical results remain across invocations; prepared workdirs are disposable and are recreated.

Each run-type result contains:

```text
<run-type>/
|-- turn-N/outputs/response.md
|-- turn-N/outputs/transcript.md
|-- transcript.md
|-- grader_output_schema.json
|-- grading.json
|-- raw_output.jsonl
|-- run_artifacts.json
`-- timing.json
```

The evaluator owns this layout. Do not create or edit grading and aggregation files manually.

Use the artifacts according to the question you are investigating:

| Artifact | Answers |
| --- | --- |
| `progress.json` | How many runs are pending, running, complete, successful, or failed while an iteration is active. |
| `run_manifest.json` | Which runs were requested, their status, model, effort, timing, and cost metadata. |
| `aggregated_results.json` | How the iteration performed across evals and run types. |
| `eval_metadata.json` | Which eval name, prompts, and expectations produced these results. |
| `grading.json` | Which expectations passed, why, and the grader's feedback. |
| `response.md` | What the provider returned for a turn. |
| `transcript.md` | What happened during one turn, or across the combined run at the run-type root, including tool activity represented by the provider. |
| `raw_output.jsonl` | Raw provider event output for deeper diagnosis. |
| `run_artifacts.json` | Files associated with the provider run. |
| `timing.json` | Timing data for the run. |

After a Codex turn is parsed, its transcript also includes collaboration records
captured from the evaluated parent session: its agent calls, tool results, and
messages received from other agents. Entries identify the operation or sender
and recipient, with source locations for the recorded evidence. The evaluator
does not read child sessions or reconstruct conversations between child agents.

Selected original parent records are retained separately in
`parent_collaboration/turn-N.jsonl`; the adjacent `turn-N.json` records source
locations, turn attribution, and collection issues. Later turns capture newly
recorded activity without repeating earlier records. Collection notes identify
unavailable or incomplete evidence. Some received message bodies are encrypted
in the source; their entries identify the sender and recipient but state that
the body is
unavailable. A recorded receipt alone does not establish what the message said.

If the parent source is unavailable or capture fails, the transcript explains
the gap and the evidence files may be absent. Runs that fail before turn parsing
do not capture parent evidence.

## Review results in Eval Viewer

Start the viewer after the first evaluator run completes:

```bash
node <skill-creator-path>/eval-viewer/dist/server/main.js <run-root>/<skill-directory>
```

Serve the skill's evaluation workspace root, not `results/iteration-N`. The packaged viewer does not require `npm install` or a build and does not write into the installed plugin cache.

Open:

```text
http://localhost:4177
```

To use another port in PowerShell:

```powershell
$env:PORT = 4180
node <skill-creator-path>/eval-viewer/dist/server/main.js <run-root>/<skill-directory>
```

`PORT` must be an integer from 1 through 65535.

### What to review

The viewer opens the latest reviewable iteration and provides:

- navigation and filtering across skill evals
- pass rate, change from the previous numbered iteration, and change from baseline
- the grader's overall and per-turn expectation results
- a skill/baseline toggle when baseline results exist
- prompts, responses, raw execution context, working-directory and provider-session metadata
- links to raw output and run artifacts
- per-expectation feedback and overall comments for the skill run
- iteration switching and notification when a newer reviewable iteration appears

Use the baseline comparison to identify value added by the skill, not merely whether the provider produced a plausible answer. Read the grader evidence and transcript before accepting a score: the feedback is more useful than the number alone.

Feedback saves to:

```text
<run-root>/<skill-directory>/results/iteration-N/viewer_feedback.json
```

The viewer autosaves edits and also saves before moving to another eval or iteration. `viewer_feedback.json` is the primary input for the next revision. Do not edit it by hand while the viewer is running.

When you tell the agent that feedback is submitted or the review is complete,
the agent should read `viewer_feedback.json` directly from the active iteration.
It should not operate the browser or viewer to retrieve saved feedback. A review
completion message is a handoff, not permission to change the skill or start a
new run; include that authorization separately when you want the agent to
proceed immediately.

### Keep one viewer running

Start the viewer once and keep it running for the session. Continue using the same run root for later evaluator invocations. The viewer watches for new reviewable iterations and offers to load them; it does not need to be restarted after each run.

An iteration appears only when its manifest lists at least one run, every listed run completed successfully, and every listed run has `grading.json`. Failed and ungraded iterations remain on disk for diagnosis but are hidden from the viewer.

The viewer writes `eval-viewer.log`, `eval-viewer.1.log`, and `eval-viewer.2.log` under `<run-root>/<skill-directory>`. Check these files for viewer startup, workspace, or artifact-loading failures.

When upgrading from a 1.0.x plugin release, stop the old npm-based viewer before installing the current version so the old process releases files in the installed cache.

## Iterate without overfitting

After the user completes a review:

1. Read `viewer_feedback.json` for the reviewed iteration.
2. Group recurring issues across evals and compare them with real user needs.
3. Revise the skill's overall instructions or resources, not only phrases that affect one fixture.
4. Keep the same run root.
5. Re-run the evaluator when the user wants to compare the revision.
6. Review the new iteration in the already-running viewer.

The `vs Last Iteration` metric compares iteration `N` only with `iteration-(N-1)`. If an immediately preceding iteration failed or was not graded, that comparison is unavailable even when an older reviewable iteration exists.

## Troubleshooting

### The evaluator fails before provider runs start

Check the operator boundary first:

- invoke the exact Python executable with `--version` and confirm Python 3.13
- confirm the run root is outside every Git workspace
- verify create, execute, and remove access below the run root
- verify subprocesses are allowed
- verify package-index access on first use or a populated Skill Creator cache

Do not change `--permission-mode` for these failures; it controls provider processes only.

### A provider turn fails with an output-limit error

The evaluator also rejects a provider turn whose captured stdout and stderr exceed 20 MiB. There is no CLI override for this limit; reduce unexpectedly verbose provider or tool output and rerun the affected eval.

### Fixture preparation fails

Confirm that:

- `fixture_repo` is paired with a full 40-character `fixture_ref`
- `fixture_repo` is not combined with `fixture_base_path`
- the local `fixture_base_path` exists
- each `fixture` is a relative directory inside the fixture source
- every entry in `files` is an existing file inside the skill directory
- external fixture prompts contain `{{FIXTURE_PATH}}`
- a skill-local `scripts/prepare.py` accepts the documented arguments and prepares both run types

### A run does not appear in the viewer

Inspect the iteration's `run_manifest.json`. The viewer hides an iteration if any manifest-listed run failed or lacks `grading.json`. Use that run's transcript, raw output, artifacts, and timing data to diagnose it. Do not manufacture the missing grading or aggregation artifacts.

### The viewer does not start

Confirm Node.js 24 or newer, pass `<run-root>/<skill-directory>` rather than an iteration directory, and check whether the configured port is already in use. Then inspect `eval-viewer.log` under the evaluation workspace root.

## Authoritative references

- [Skill structure](references/skill-anatomy.md)
- [Skill authoring](references/writing-skills.md)
- [Evaluation framework](references/evaluation-framework.md)
- [Eval definition schema](schemas/evals.schema.json)
- [Eval Viewer operator guide](eval-viewer/README.md)
- [Skill Creator contributor guide](CONTRIBUTING.md)

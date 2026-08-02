# Evaluation Framework

The evaluation framework provides a repeatable workflow for developing skills through eval-driven iteration. The workflow runs realistic prompts against a skill, compares runs with and without that skill, grades the outputs, aggregates results, and opens a viewer for human review.

## The workflow

1. Write a skill with a `SKILL.md` and an `evals/evals.json` file.
2. Self-Verification checkpoint as prescribed in the [Eval Self-Verification](#eval-self-verification) section below.
3. Run the evals with `evaluate_skill.py` as defined below.
4. Open the packaged eval viewer (or reuse it if already running) with Node.js 24 or newer.
5. User reviews results and identifies issues.
6. The UI saves a `<run-root>/<skill-name>/results/iteration-N/viewer_feedback.json` file with user feedback and improvement suggestions.
7. The user signals that feedback is submitted or the review is complete.
8. Follow the [feedback handoff](#feedback-handoff), then iterate on the skill only within the authority the user gives you. Keep the same run root and re-run the evals when the user asks to see how the changes affect the results.

## Evals file

Path:

```text
<skill-path>/evals/evals.json
```

Before creating or editing it, read:

```text
<skill-creator-path>/schemas/evals.schema.json
```

Rules:

* the schema owns the file shape
* the schema owns field names
* the schema owns required fields
* the schema owns field descriptions
* new files set `schema_version` to `1`
* do not invent fields

## Run root

Use a run root outside every Git workspace.

Rules:

* do not put the run root inside the skill repository
* do not put the run root inside any fixture repository
* do not put the run root inside any project repository
* keep the same run root for the session

Results are written under:

```text
<run-root>/<skill-name>/results/iteration-N/
```

## Run evaluator

### Operator boundary

Run the evaluator from the operator agent's host shell. Never run it from an
eval fixture, generated work directory, skill run, baseline run, grading
session, or provider subprocess. The operator environment must be able to:

* launch subprocesses
* create, execute, and remove files below the run root
* access the package index for first use or a populated package cache

Provider permissions do not grant these host capabilities. The evaluator's
`--permission-mode` controls only the skill, baseline, and grading provider
processes. Do not change it to repair a host bootstrap failure.

### Operator preflight

Complete this preflight before invoking the evaluator:

1. Resolve Python 3.13, which is the version declared in `.python-version`.
   Prefer an interpreter returned by a host dependency discovery tool. Then
   check approved explicit paths and `PATH`.
2. Invoke the resolved executable with `--version`. Do not infer its version
   from a directory name or tool response.
3. Choose one run root outside every Git workspace. Confirm that the operator
   shell can create, execute, and remove files there.
4. Confirm that subprocess execution is allowed and that first use has package
   index access or a populated Skill Creator package cache.
5. Invoke `evaluate_skill.py` with the absolute interpreter path.

Do not create a virtual environment or manually install `jsonschema`, `psutil`,
`referencing`, or their dependencies. `evaluate_skill.py` creates or reuses a
fingerprinted environment below `<run-root>/.skill-creator/runtime/` and keeps
the installed plugin cache read-only.

### Acquiring Python with approval

Python acquisition belongs to the operator. It is never part of evaluator
bootstrap. If Python 3.13 is unavailable, use this fallback ladder and obtain
user approval before each installation or permission expansion:

1. If `uv` is already available, propose downloading Python 3.13 into
   Skill Creator-owned application data. Set `UV_PYTHON_INSTALL_DIR` and
   `UV_CACHE_DIR` before running `uv python install 3.13`.
2. If `uv` is unavailable, propose installing portable `uv` 0.11.32. Set
   `UV_UNMANAGED_INSTALL`, `UV_NO_MODIFY_PATH=1`, `UV_PYTHON_INSTALL_DIR`, and
   `UV_CACHE_DIR` before running the reviewed installer. Do not modify `PATH`
   or shell profiles.
3. On the configured Windows host, use `S:\AppData\skill-creator\` for durable
   binaries, Python installations, and caches. Use `S:\TMP` for temporary
   downloads. On other hosts, use an operator-approved application data and
   cache location.
4. If portable `uv` cannot work, explain the target, persistence, privileges,
   and rollback for a user-level or system package-manager installation. Get
   separate approval before proceeding.

Never silently install Python or `uv`, broaden a sandbox, or fall through to a
wider installation scope. The official uv documentation defines the
[`UV_UNMANAGED_INSTALL` installer control](https://docs.astral.sh/uv/reference/installer/)
and the [`UV_PYTHON_INSTALL_DIR` Python storage control](https://docs.astral.sh/uv/guides/install-python/).

### Runtime bootstrap

On first use, the evaluator installs the checked-in runtime lock into a staging
environment below the run root, verifies it, and publishes it atomically.
Completed environments are reused when their requirements, Python version and
ABI, operating system, and architecture match. Reuse works without network
access.

Package caches use Skill Creator-owned application storage. Set
`SKILL_CREATOR_CACHE_ROOT` before invocation only when the operator has approved
a different cache location. Temporary installation work stays below the run
root. A failed bootstrap removes its unpublished staging environment and
reports the unmet host prerequisite.

### Command

Use the absolute Python 3.13 path resolved during preflight:

```bash
<python-3.13-path> <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort>
```

Rules:

* use `evaluate_skill.py`
* do not call `prepare_fixture.py`
* do not call `run_skill_evals.py`
* baseline runs by default
* provider permissions default to `restricted`
* use `--eval-ids` only for an intentional subset
* use `--skip-baseline` only for an intentional skill-only run

Subset command:

```bash
<python-3.13-path> <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort> \
  --eval-ids 1,3
```

Skill-only command:

```bash
<python-3.13-path> <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort> \
  --skip-baseline
```

### Provider permissions

Keep the default `--permission-mode restricted` for normal eval runs. If a
provider sandbox defect prevents the tooling from working, the operator can
choose unrestricted execution instead of moving the run to Linux:

```bash
<python-3.13-path> <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort> \
  --permission-mode unrestricted
```

The allowed values are `restricted` and `unrestricted`. Unrestricted mode
applies to skill, baseline, and grading provider processes. It maps to
`danger-full-access` for Codex and `bypassPermissions` for Claude. This bypasses
provider sandbox protections and grants the agent access allowed by the host
process, so prefer Linux when it avoids the defect. Use unrestricted mode only
when the operator accepts that risk.

## Input isolation

The evaluator prepares isolated inputs for each run.

Rules:

* copied eval files are isolated per eval and per run type
* copied fixtures are isolated per eval and per run type
* skill runs and baseline runs do not share copied inputs
* one eval cannot modify another eval

Read `schemas/evals.schema.json` for eval file and fixture fields.

## Multi-turn execution

Runner behavior:

* turn 1 starts a new provider session
* later turns resume the same provider session
* the agent cannot see future turns before they are sent

Read `schemas/evals.schema.json` for turn fields.

## Result layout

The evaluator creates the layout.

Do not create it manually.

Top level:

```text
<run-root>/<skill-name>/results/iteration-N/
├── run_manifest.json
├── aggregated_results.json
└── eval-<ID>/
```

Per eval:

```text
eval-<ID>/
├── eval_metadata.json
├── skill/
└── baseline/
```

Per run type:

```text
<run-type>/
├── turn-N/
├── grader_output_schema.json
├── grading.json
├── raw_output.jsonl
├── run_artifacts.json
└── timing.json
```

Per turn:

```text
turn-N/outputs/
├── response.md
└── transcript.md
```

## Generated artifacts

Use these files after a run:

```text
<run-root>/<skill-name>/results/iteration-N/run_manifest.json
<run-root>/<skill-name>/results/iteration-N/aggregated_results.json
<run-root>/<skill-name>/results/iteration-N/eval-<ID>/eval_metadata.json
<run-root>/<skill-name>/results/iteration-N/eval-<ID>/<run-type>/grading.json
<run-root>/<skill-name>/results/iteration-N/eval-<ID>/<run-type>/timing.json
<run-root>/<skill-name>/results/iteration-N/eval-<ID>/<run-type>/raw_output.jsonl
<run-root>/<skill-name>/results/iteration-N/eval-<ID>/<run-type>/run_artifacts.json
<run-root>/<skill-name>/results/iteration-N/eval-<ID>/<run-type>/turn-N/outputs/response.md
<run-root>/<skill-name>/results/iteration-N/eval-<ID>/<run-type>/turn-N/outputs/transcript.md
```

Rules:

* grading is generated by the evaluator
* aggregation is generated by the evaluator
* do not create `grading.json`
* do not create `aggregated_results.json`
* do not run a separate grading process
* do not run a separate aggregation process

## Viewer

The viewer exists for human review and provide feedback of eval results. It surfaces the generated artifacts in a user-friendly way, allows drill-down into individual evals, and captures user feedback.

Viewer path:

```text
<skill-creator-path>/eval-viewer
```

Start after the first evaluator run completes:

```bash
node <skill-creator-path>/eval-viewer/dist/server/main.js <run-root>/<skill-name>
```

Rules:

* serve `<run-root>/<skill-name>`
* do not run `npm install` or build inside the installed plugin cache
* do not serve `results/iteration-N`
* start the viewer once
* keep it running for the session
* do not restart it for each iteration
* later reviewable evaluator runs appear in the UI automatically
* an iteration is reviewable only when every manifest-listed run completed successfully and has `grading.json`
* failed and ungraded iteration directories remain on disk for diagnosis and do not appear in the viewer
* expect `eval-viewer.log` and its rotated files under `<run-root>/<skill-name>`

When upgrading from plugin version 1.0.x, stop the old npm-based viewer before
installing the new version. This one-time stop releases files opened by the old
process. Start the packaged viewer with the command above after the update.

### User feedback

The user can provide feedback for a specific iteration in the viewer, which is captured in:

```text
<run-root>/<skill-name>/results/iteration-N/viewer_feedback.json
```

This is your primary source of feedback for the next iteration. Use this feedback to guide your revisions to the skill, and then re-run the evals to see how the changes impact the results.

### Feedback handoff

Treat phrases such as "I've submitted the feedback," "I've finished the
review," and "I'm done reviewing" as a feedback handoff for the active
iteration. The handoff means the saved feedback is ready to read. It does not
by itself authorize changes to the skill, evals, or evaluator state.

Follow this sequence:

1. Resolve the reviewed iteration from the run root and iteration already
   established in the session. If more than one iteration could reasonably be
   active, ask the user which iteration they reviewed.
2. Read that iteration's `viewer_feedback.json` directly from the filesystem.
   Do not use browser control, operate the viewer, or inspect the UI to retrieve
   feedback that the viewer has already persisted.
3. If the file is missing or malformed, report the exact expected path. Ask the
   user to confirm the reviewed iteration and that the viewer finished saving.
   Do not invent feedback or fall back to UI inspection.
4. Combine the saved viewer feedback with feedback stated directly in the
   user's handoff message. Keep the two sources distinguishable when that helps
   resolve scope or conflicts.
5. Respect any requested discussion or pause. Summarize the feedback, identify
   themes or tensions, and present proposed changes without editing files or
   starting another evaluator run.
6. Change the skill or evals and re-run evaluation only when the user's message
   authorizes those actions. A completion signal alone is not authorization.

## Next iteration

Follow [the workflow](#the-workflow) for the next iteration, keeping the same run root to accumulate results across iterations. This allows you to track progress over time and see how changes to the skill impact the eval results.
Remember, the UI should be open the whole time, and new runs should appear automatically without needing to restart the viewer.

## Eval Self-Verification

You must verify that all the following are true before considering evals well written:

- Prompts avoid meta-language and eval-aware phrasing. 
- Eval prompts represent real-life interaction turns.
- Expectations test outputs for correctness based on the skill under test in the lens of the eval intent.
- Expectations are useful and not repetitive of other expectations.
- The number of expectations for a turn is reasonable for the eval intent and the skill under test, and not just matching the number of expectations in other evals which is a common failure mode.
- The eval json matches the eval schema and is well-formed JSON.
- You followed the evaluation-framework rules to the letter
- You consulted the user about the eval design and got their buy-in

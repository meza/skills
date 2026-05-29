# Skill Creator

Skill Creator provides a repeatable workflow for developing skills through eval-driven iteration.

The workflow runs realistic prompts against a skill, compares runs with and without that skill, grades the outputs, aggregates results, and opens a viewer for human review.

## Workflow

Use this sequence for each iteration:

1. Run the evals with `evaluate_skill.py` as defined below.
2. Open the eval viewer UI in the `eval-viewer` folder with `npm run serve -- <path-to-iteration>`.

## Inputs

A skill under test needs a `SKILL.md` file and an eval definition at `evals/evals.json`.

`evals/evals.json` defines the skill name, test prompts, optional expectations,
optional eval files, and optional fixture sources. New eval definitions should
declare `"schema_version": 1`; missing schema versions are treated as legacy
schema v1.

```json
{
  "schema_version": 1,
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "eval_name": "basic",
      "turns": [
        {
          "prompt": "Do the task.",
          "expectations": []
        }
      ]
    }
  ]
}
```

Eval files are copied from paths listed in each eval's `files` array. Paths are relative to the skill directory and must stay inside that directory.

Fixtures can come from a shared fixture repository or a local fixture base path. Fixture-backed evals can either place the fixture in the run directory or keep it outside the working directory and expose it through `{{FIXTURE_PATH}}`.

## Run Evals

Run evals through the single orchestration entrypoint:

```bash
python <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort>
```

Optional filters:

```bash
python <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --eval-ids 1,3 \
  --skip-baseline
```

By default, the runner executes both the skill run and the baseline run. Use `--skip-baseline` when you only want to run the skill-enabled eval.

Use a run root outside any Git workspace. The evaluator rejects `--run-root`
paths that sit inside a Git workspace so generated artifacts cannot inherit
repository state. Each invocation writes result artifacts under:

```text
<run-root>/<skill-name>/results/iteration-1/
```

The final command output includes the prepared run root, run manifest summary,
and aggregation summary.

## Result Layout

Every iteration follows this structure:

```text
iteration-N/
├── run_manifest.json
├── aggregated_results.json
└── eval-<ID>/
    ├── eval_metadata.json
    ├── skill/
    │   ├── turn-1/
    │   │   └── outputs/
    │   │       ├── response.md
    │   │       └── transcript.md
    │   ├── turn-2/
    │   │   └── outputs/
    │   │       ├── response.md
    │   │       └── transcript.md
    │   ├── grader_output_schema.json
    │   ├── grading.json
    │   ├── raw_output.jsonl
    │   ├── run_artifacts.json
    │   └── timing.json
    └── baseline/
        ├── turn-1/
        ├── turn-2/
        ├── grader_output_schema.json
        ├── grading.json
        ├── raw_output.jsonl
        ├── run_artifacts.json
        └── timing.json
```

`eval_metadata.json` is shared by both run types for one eval. `grading.json`,
`timing.json`, `raw_output.jsonl`, and `run_artifacts.json` live under the run
type directory.

## Multi-Turn Evals

Each eval defines a `turns` array. A one-turn eval has one entry. A multi-turn eval has multiple entries in the order they should be sent.

```json
{
  "id": 3,
  "eval_name": "revise-after-feedback",
  "turns": [
    {
      "prompt": "Draft a skill for reviewing API documentation.",
      "expectations": []
    },
    {
      "prompt": "Tighten the trigger criteria and remove generic advice.",
      "expectations": []
    }
  ]
}
```

The runner sends the first turn as a new provider session and sends later turns by resuming that same session. The agent can use conversation state from earlier turns, but it cannot see future turns before they are sent.

Each turn writes its own `response.md` and `transcript.md`. Expectations belong to the turn they evaluate.

## Eval Fixtures

Fixtures are input workspaces used by eval prompts. Use them when an eval needs a project, repository, document set, or other directory tree for the agent to inspect or modify.

Define fixture sources at the top level of `evals/evals.json`:

```json
{
  "schema_version": 1,
  "fixture_repo": "https://github.com/example/eval-fixtures.git",
  "fixture_ref": "2c4d9a8c4c7d95c4e5b46f7a0fd5f7f8c6e4d3b2"
}
```

`fixture_repo` points to a git repository containing fixture directories. `fixture_ref` must be a full 40-character commit SHA. Fixture repositories must set `fixture_ref` so repeated eval runs use the same fixture state.

Use `fixture_base_path` instead when fixtures are already staged locally:

```json
{
  "schema_version": 1,
  "fixture_base_path": "F:/dev/fixtures"
}
```

Each eval selects a fixture by directory name:

```json
{
  "id": 1,
  "eval_name": "update-project-docs",
  "fixture": "sample-project",
  "fixture_in_workdir": true,
  "turns": [
    {
      "prompt": "Update the README in the provided project.",
      "expectations": []
    }
  ]
}
```

When `fixture_in_workdir` is `true`, the fixture is copied into both the `skill` and `baseline` working directories. The agent can discover it by listing the run directory.

When `fixture_in_workdir` is `false`, the fixture is copied to a sibling directory outside the agent's working directory. The agent receives the path only if the prompt uses `{{FIXTURE_PATH}}`.

Fixture copies are isolated per eval and per run type. Changes made by a `skill` run cannot affect the matching `baseline` run, and changes from one eval cannot affect another eval.

## Internal Application Shape

`evaluate_skill.py` owns the CLI. It creates typed options and calls the internal application classes:

- `FixturePreparer` in `prepare_fixture.py`
- `SkillEvalRunner` in `run_skill_evals.py`

The handoff between preparation and execution is an in-memory `PreparedRun` dataclass. There is no prepared manifest file between those steps.

`run_manifest.json` exists as a result artifact under the iteration directory.
It summarizes completed runs, execution statuses, timings, costs, model, and
effort.

## Grading And Aggregation

`evaluate_skill.py` grades successful run types as part of the eval run. Each
completed run type gets a `grading.json` file at:

```text
iteration-N/eval-<ID>/<run-type>/grading.json
```

`grading.json` includes expectation results, summary counts, pass rate, and eval
feedback. The evaluator validates grader output before writing the artifact.

After grading, `evaluate_skill.py` aggregates the iteration and writes:

```text
iteration-N/aggregated_results.json
```

## Review Results

Open the viewer after grading and aggregation:

```bash
cd <skill-creator-path>/eval-viewer
npm install
npm run serve -- <run-root>/<skill-name>/results/iteration-1
```

## Isolation

Every `evaluate_skill.py` invocation writes to the next results iteration and
creates fresh invocation workdirs under the skill run root. Each eval gets
separate `skill` and `baseline` working directories.

`skill` receives a copied version of the skill under test in the provider-specific discovery location. `baseline` does not receive the skill.

Fixtures and eval files are copied into each run type separately. A run modifies only its own prepared working directory, so one eval or run type cannot contaminate another.

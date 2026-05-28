# Skill Creator

Skill Creator provides a repeatable workflow for developing skills through eval-driven iteration.

The workflow runs realistic prompts against a skill, compares runs with and without that skill, grades the outputs, aggregates benchmark results, and opens a viewer for human review.

## Workflow

Use this sequence for each iteration:

1. Run the evals with `evaluate_skill.py`.
2. Grade each run and write `grading.json`.
3. Validate grader output with `validate_grading.py`.
4. Aggregate results with `aggregate_benchmark.py`.
5. Open the review UI with `serve_viewer.py`.

`evaluate_skill.py` is the only eval-running command. Fixture preparation and eval execution are internal application steps. Do not call `prepare_fixture.py` or `run_skill_evals.py` directly.

## Inputs

A skill under test needs a `SKILL.md` file and an eval definition at `evals/evals.json`.

`evals/evals.json` defines the skill name, test prompts, optional expectations,
optional eval files, and optional fixture sources. The file must declare
`"schema_version": 1` so incompatible eval definition shapes fail at load time.

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

Use a run root under the current workspace so generated artifacts stay contained to the session. Each invocation creates a fresh prepared run root under `--run-root`, then writes result artifacts under:

```text
<prepared-run-root>/results/iteration-1/
```

The final command output includes the prepared run root and the run manifest summary.

## Result Layout

Every iteration follows this structure:

```text
iteration-N/
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
    │   ├── grading.json
    │   ├── raw_output.jsonl
    │   └── timing.json
    └── baseline/
        ├── turn-1/
        ├── turn-2/
        ├── grading.json
        ├── raw_output.jsonl
        └── timing.json
```

`eval_metadata.json` is shared by both run types for one eval. `grading.json`, `timing.json`, and `raw_output.jsonl` live under the run type directory.

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

`run_manifest.json` still exists as a result artifact under the iteration directory. It summarizes completed runs, statuses, timings, costs, model, and effort.

## Grade Results

Each run needs a `grading.json` file at the run type directory level:

```text
iteration-N/eval-<ID>/<run-type>/grading.json
```

Validate every grading file before aggregating:

```bash
python <skill-creator-path>/scripts/validate_grading.py \
  <prepared-run-root>/results/iteration-1/eval-<ID>/<run-type>/grading.json
```

`grading.json` must include expectation results, summary counts, pass rate, and eval feedback.

## Aggregate Results

After all grading files validate, aggregate the iteration:

```bash
python <skill-creator-path>/scripts/aggregate_benchmark.py \
  <prepared-run-root>/results/iteration-1 \
  --skill-name <skill-name>
```

This writes `benchmark.json` and `benchmark.md` into the iteration directory.

## Review Results

Open the viewer after grading and aggregation:

```bash
python <skill-creator-path>/scripts/serve_viewer.py start \
  <prepared-run-root>/results/iteration-1 \
  --skill-name <skill-name> \
  --benchmark <prepared-run-root>/results/iteration-1/benchmark.json
```

For later iterations, include the previous iteration so the viewer can show comparisons:

```bash
python <skill-creator-path>/scripts/serve_viewer.py start \
  <prepared-run-root>/results/iteration-1 \
  --skill-name <skill-name> \
  --benchmark <prepared-run-root>/results/iteration-1/benchmark.json \
  --previous-workspace <previous-prepared-run-root>/results/iteration-1
```

In headless environments, write a static viewer file instead of starting a server:

```bash
python <skill-creator-path>/scripts/serve_viewer.py start \
  <prepared-run-root>/results/iteration-1 \
  --skill-name <skill-name> \
  --benchmark <prepared-run-root>/results/iteration-1/benchmark.json \
  --static <path-to-output-html> \
  --no-open
```

## Isolation

Every `evaluate_skill.py` invocation creates a new prepared run root. Each eval gets separate `skill` and `baseline` working directories.

`skill` receives a copied version of the skill under test in the provider-specific discovery location. `baseline` does not receive the skill.

Fixtures and eval files are copied into each run type separately. A run modifies only its own prepared working directory, so one eval or run type cannot contaminate another.

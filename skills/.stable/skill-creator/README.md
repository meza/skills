# Skill Creator

Skill Creator provides a repeatable workflow for developing skills through eval-driven iteration.

The workflow runs realistic prompts against a skill, compares runs with and without that skill, grades the outputs, aggregates benchmark results, and opens a viewer for human review.

## Workflow

Use this sequence for each iteration:

1. Prepare isolated run directories with `prepare_fixture.py`.
2. Run the evals with `run_skill_evals.py`.
3. Grade each run and write `grading.json`.
4. Validate grader output with `validate_grading.py`.
5. Aggregate results with `aggregate_benchmark.py`.
6. Open the review UI with `serve_viewer.py`.

## Inputs

A skill under test needs a `SKILL.md` file and an eval definition at `evals/evals.json`.

`evals/evals.json` defines the skill name, test prompts, optional expectations, optional eval files, and optional fixture sources.

Eval files are copied from paths listed in each eval's `files` array. Paths are relative to the skill directory and must stay inside that directory.

Fixtures can come from a shared fixture repository or a local fixture base path. Fixture-backed evals can either place the fixture in the run directory or keep it outside the working directory and expose it through `{{FIXTURE_PATH}}`.

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

`run_skill_evals.py` sends the first turn as a new provider session and sends later turns by resuming that same session. The agent can use conversation state from earlier turns, but it cannot see future turns before they are sent.

Each turn writes its own response and transcript:

```text
iteration-N/eval-<ID>/<configuration>/turn-1/outputs/response.md
iteration-N/eval-<ID>/<configuration>/turn-1/outputs/transcript.md
iteration-N/eval-<ID>/<configuration>/turn-2/outputs/response.md
iteration-N/eval-<ID>/<configuration>/turn-2/outputs/transcript.md
```

Expectations belong to the turn they evaluate. Use turn-level expectations when the success criteria change across the conversation.

Timeouts can be set at the eval level or on an individual turn. A turn-level timeout overrides the eval-level timeout and the command-line `--timeout`.

## Eval Fixtures

Fixtures are input workspaces used by eval prompts. Use them when an eval needs a project, repository, document set, or other directory tree for the agent to inspect or modify.

Define fixture sources at the top level of `evals/evals.json`:

```json
{
  "fixture_repo": "https://github.com/example/eval-fixtures.git",
  "fixture_ref": "2c4d9a8"
}
```

`fixture_repo` points to a git repository containing fixture directories. `fixture_ref` pins that repository to a branch, tag, or commit. When `fixture_ref` is omitted, fixture setup uses the remote default branch head.

Use `fixture_base_path` instead when fixtures are already staged locally:

```json
{
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

When `fixture_in_workdir` is `true`, the fixture is copied into both the `with_skill` and `without_skill` working directories. The agent can discover it by listing the run directory.

When `fixture_in_workdir` is `false`, the fixture is copied to a sibling directory outside the agent's working directory. The agent receives the path only if the prompt uses `{{FIXTURE_PATH}}`.

```json
{
  "id": 2,
  "eval_name": "hidden-project-path",
  "fixture": "sample-project",
  "fixture_in_workdir": false,
  "turns": [
    {
      "prompt": "The project is at {{FIXTURE_PATH}}. Inspect it and summarize the build steps.",
      "expectations": []
    }
  ]
}
```

`prepare_fixture.py` copies the selected fixture separately for each eval configuration. Changes made by a `with_skill` run cannot affect the matching `without_skill` run, and changes from one eval cannot affect another eval.

## Prepare Runs

Run `prepare_fixture.py` first. It creates a fresh prepared run root containing one directory for each eval and configuration.

```bash
python <skill-creator-path>/scripts/prepare_fixture.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex>
```

The command prints a JSON mapping of eval IDs to prepared `with_skill` and `without_skill` directories. The prepared run root is a unique subdirectory under `--run-root`.

Use a run root under the current workspace so generated artifacts stay contained to the session.

## Run Evals

Pass the prepared run root from `prepare_fixture.py` to `run_skill_evals.py`.

```bash
python <skill-creator-path>/scripts/run_skill_evals.py \
  --skill-path <path-to-skill> \
  --workspace <workspace-path> \
  --iteration <N> \
  --provider <claude|codex> \
  --model <model-id> \
  --max-parallel 4 \
  --timeout 900 \
  --run-root <prepared-run-root>
```

`--workspace` receives the iteration outputs. Each run writes extracted responses, transcripts, timing data, raw provider output, progress data, and a run manifest.

Claude uses provider skill discovery from `.claude/skills/<skill-name>/`.

Codex receives an explicit instruction pointing to the copied `SKILL.md` for `with_skill` runs.

## Grade Results

Each run needs a `grading.json` file at the configuration directory level.

For each eval and configuration, the grader reads the run outputs and writes:

```text
iteration-N/eval-<ID>/<configuration>/grading.json
```

Validate every grading file before aggregating:

```bash
python <skill-creator-path>/scripts/validate_grading.py \
  <workspace-path>/iteration-<N>/eval-<ID>/<configuration>/grading.json
```

`grading.json` must include expectation results, summary counts, pass rate, and eval feedback.

## Aggregate Results

After all grading files validate, aggregate the iteration:

```bash
python <skill-creator-path>/scripts/aggregate_benchmark.py \
  <workspace-path>/iteration-<N> \
  --skill-name <skill-name>
```

This writes `benchmark.json` and `benchmark.md` into the iteration directory.

## Review Results

Open the viewer after grading and aggregation:

```bash
python <skill-creator-path>/scripts/serve_viewer.py start \
  <workspace-path>/iteration-<N> \
  --skill-name <skill-name> \
  --benchmark <workspace-path>/iteration-<N>/benchmark.json
```

For later iterations, include the previous iteration so the viewer can show comparisons:

```bash
python <skill-creator-path>/scripts/serve_viewer.py start \
  <workspace-path>/iteration-<N> \
  --skill-name <skill-name> \
  --benchmark <workspace-path>/iteration-<N>/benchmark.json \
  --previous-workspace <workspace-path>/iteration-<N-1>
```

In headless environments, write a static viewer file instead of starting a server:

```bash
python <skill-creator-path>/scripts/serve_viewer.py start \
  <workspace-path>/iteration-<N> \
  --skill-name <skill-name> \
  --benchmark <workspace-path>/iteration-<N>/benchmark.json \
  --static <path-to-output-html> \
  --no-open
```

## Isolation

`prepare_fixture.py` creates a new prepared run root for every invocation. Each eval gets separate `with_skill` and `without_skill` working directories.

`with_skill` receives a copied version of the skill under test in the provider-specific discovery location. `without_skill` does not receive the skill.

Fixtures and eval files are copied into each run configuration separately. A run modifies only its own prepared working directory, so one eval or configuration cannot contaminate another.

`run_skill_evals.py` executes against the prepared directories. It does not recreate or reuse the run root.

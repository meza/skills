# Requirements

## Goal

Build a new local viewer application for skill evaluation results.

The viewer reads evaluation artifacts, presents them for human review, collects
feedback, and writes a feedback artifact. It does not run evaluations, grade
outputs, aggregate results, or collaborate with the Python orchestrator except
through handoff files.

## System Boundary

The Python evaluator owns:

- preparing fixtures
- running evals
- grading eval runs
- aggregating grader results
- producing evaluation artifacts

The viewer owns:

- reading evaluator-produced artifacts
- rendering the review experience
- recording human review state
- writing feedback output

The only integration contract between evaluator and viewer is the filesystem.

## Target Stack

The new viewer is a standalone local web app:

- React
- TypeScript
- Vite
- Fastify server
- Biome using `@meza/biome`
- Vitest
- Playwright visual tests

No Python backend for the viewer.

The old Python/html viewer is retained only under `legaci-viewer/` as a
reference.

## Primary Input

The viewer starts with an evaluation result root.

It reads evaluator-produced artifacts, including:

- `run_manifest.json`
- `aggregated_results.json`
- per-run `run_artifacts.json`
- per-run `grading.json`
- transcripts
- responses
- raw provider output
- timing data

The viewer treats these files as immutable inputs.

## Primary Output

The viewer writes human feedback as a viewer-owned artifact.

Feedback must distinguish:

- not reviewed
- reviewed with no comments
- reviewed with comments

Feedback must be keyed at least by eval id and config.

## Core Behaviour

The viewer shows one evaluation iteration.

It must show:

- skill name
- provider
- model
- effort
- eval ids and names
- configs run for each eval
- execution status
- pass rate
- timing
- token usage
- grader executive summaries
- overall expectation results
- turn expectation results
- evidence for each expectation

For each eval/config run, it must show:

- eval id
- eval name
- config
- execution status
- duration
- token count
- executive summary
- overall expectation results
- turn-level expectation results
- evidence
- prompts
- responses
- transcripts
- raw output access
- timing data
- artifact paths

For each turn, it must show:

- prompt
- response
- transcript
- turn expectations
- grader result for each expectation
- evidence for each expectation

## Comparison Behaviour

If both `with_skill` and `without_skill` exist for the same eval, the viewer must
support comparing them.

Comparison must cover:

- final responses
- pass/fail results
- expectation evidence
- duration
- token usage

If earlier iterations exist, the viewer must support comparing the current
eval/config run with the same eval/config in a previous iteration.

## Failure Behaviour

Missing or invalid artifacts must be visible as review states.

That includes:

- missing grading
- invalid grading
- missing transcript
- missing response
- missing raw output
- missing timing
- failed execution
- missing comparison target

The viewer must not silently hide broken or incomplete runs.

## Server Responsibilities

The Fastify server must:

- start with an evaluation result root
- validate the root exists
- expose JSON APIs for iteration, runs, artifacts, and feedback
- serve the React app
- save feedback
- avoid mutating evaluator-produced artifacts

The server must not:

- run evals
- grade evals
- aggregate grader output
- import Python evaluator code
- infer result meaning from legacy folder scanning when explicit artifacts exist

## Frontend Responsibilities

The React app must:

- render the review UI from server APIs
- manage selected run state
- support filtering and navigation
- render expectation breakdowns
- render execution history
- render comparison data
- collect feedback
- show review completion state
- surface artifact errors clearly

The visual target is `design/`.

The design prototype is a reference for visual direction and interaction intent,
not production architecture.

## Development Method

The viewer must be built with proper TDD.

For each unit of functionality:

1. Write one focused failing test first.
2. Run the relevant whole-project verification command enough to see the
   intended failure.
3. Implement only enough production code to pass that test.
4. Run the full required viewer verification.
5. Refactor only after the test is green.
6. Repeat with the next behaviour.

Tests are not coverage collectors. They drive the design.

That means:

- awkward tests are treated as design feedback
- excessive mocking is treated as a possible boundary problem
- repeated setup is treated as a missing test fixture or missing domain concept
- hard-to-test code is refactored toward explicit dependencies and clear
  contracts
- visual behaviour is captured with Playwright, not manual inspection
- server/file contract behaviour is captured before route or filesystem
  implementation is expanded

## Verification Standard

The viewer project must have 100% meaningful coverage.

Required local verification:

```bash
npm run biome:fix
npm run test
npm run coverage
npm run test:visual
```

Verification must always run across the whole viewer project. No narrowed
coverage, targeted lint-only handoffs, or partial visual checks.

Biome violations, test failures, coverage gaps, and visual regressions must be
fixed immediately. Suppressions require approval.

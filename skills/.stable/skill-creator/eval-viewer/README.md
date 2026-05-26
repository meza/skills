# Eval Viewer

The eval viewer is the human review application for skill evaluation results.

The evaluation orchestrator produces result artifacts. The viewer reads those
artifacts, helps a human inspect the run, and writes a feedback artifact. The
viewer does not run evaluations, grade results, or call back into the
orchestrator.

## Runtime Boundary

The viewer communicates with the evaluator through files only.

Input files are produced by the evaluator:

- `run_manifest.json`
- `aggregated_results.json`
- per-run `run_artifacts.json`
- per-run `grading.json`
- per-run transcript, response, raw output, and timing artifacts

The viewer output is the human feedback artifact.

The evaluator may read that feedback later, but the viewer does not coordinate
with evaluator internals while it is running.

## Application Shape

The viewer is a local web application.

The intended stack is:

- React with TypeScript for the interface
- Vite for frontend development and bundling
- Fastify for the local Node server

The server owns filesystem access. The browser reads and writes review data
through HTTP APIs.

## Server Responsibilities

The server starts with an evaluation result root.

It must:

- validate that the result root exists
- read evaluator-produced artifacts
- expose structured JSON APIs for the frontend
- serve artifact contents when requested
- save human feedback
- serve the React application

It must not:

- mutate evaluator-produced artifacts
- run evaluations
- grade results
- import or depend on the Python evaluator implementation

## Frontend Responsibilities

The frontend must show one evaluation iteration.

It must show:

- skill name
- provider, model, and effort
- eval ids and names
- run types for each eval
- run status
- pass rate, timing, and token usage
- grader executive summaries
- overall expectation results
- turn expectation results
- evidence for each expectation
- prompts, responses, transcripts, raw outputs, timing, and artifact paths

When both `skill` and `baseline` exist for an eval, the frontend must
support comparing them.

When earlier iterations are available, the frontend must support comparing the
same eval/config across iterations.

The frontend must allow feedback to be recorded per eval/config run. Feedback
state must distinguish:

- not reviewed
- reviewed with no comments
- reviewed with comments

Missing or invalid artifacts must be visible as review states, not silently
hidden.

## Design Target

The visual target lives in `design/`.

The prototype is a reference for interaction and visual direction. It is not the
application architecture.

## Legacy Viewer

The previous Python/html viewer implementation is kept in `legaci-viewer/`.
It exists only as a reference while the new viewer is built.

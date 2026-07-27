# Eval Viewer

Eval Viewer is a local web app for inspecting evaluation results produced by the skill evaluator.

It depends on an evaluation workspace directory that contains `results/iteration-N` child directories. Each valid iteration directory contains `run_manifest.json`.

## Launch

Install dependencies from this directory:

```bash
npm install
```

Start the server with the evaluation workspace root:

```bash
npm run serve -- <run-root>/<skill-name>
```

The server argument must be the evaluation workspace root. Direct `iteration-N`
directories are not supported, and no compatibility path exists for serving
them. The viewer opens the latest valid iteration by default and saves feedback
to the active iteration shown in the browser.

The `vs Last Iteration` metric compares the selected iteration to the
immediately previous numbered iteration, `iteration-(N-1)`.

Open the app at:

```text
http://localhost:4177
```

Set `PORT` to use a different port:

```bash
PORT=4180 npm run serve -- <run-root>/<skill-name>
```

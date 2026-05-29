# Eval Viewer

Eval Viewer is a local web app for inspecting evaluation results produced by the skill evaluator.

It depends on an evaluator output directory that contains `run_manifest.json` for one evaluation iteration.

## Launch

Install dependencies from this directory:

```bash
npm install
```

Start the server with the evaluator output directory:

```bash
npm run serve -- <run-root>/results/iteration-1
```

Open the app at:

```text
http://localhost:4177
```

Set `PORT` to use a different port:

```bash
PORT=4180 npm run serve -- <run-root>/results/iteration-1
```

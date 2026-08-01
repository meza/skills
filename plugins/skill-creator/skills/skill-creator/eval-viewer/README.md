# Eval Viewer

Eval Viewer is a local web app for inspecting evaluation results produced by the skill evaluator.

It depends on an evaluation workspace directory that contains `results/iteration-N` child directories. Each valid iteration directory contains `run_manifest.json`.

## Launch

Use Node.js 24 or newer to start the packaged server. The command can run from
any working directory and does not install dependencies or build assets:

```bash
node <skill-creator-path>/eval-viewer/dist/server/main.js <run-root>/<skill-name>
```

The server argument must be the evaluation workspace root. Direct `iteration-N`
directories are not supported, and no compatibility path exists for serving
them. The viewer opens the latest valid iteration by default and saves feedback
to the active iteration shown in the browser.

The `vs Last Iteration` metric compares the selected iteration to the
immediately previous numbered iteration, `iteration-(N-1)`.

The server writes `eval-viewer.log` and its two rotated files under the
evaluation workspace root. The installed plugin directory remains unchanged
while the viewer runs.

Open the app at:

```text
http://localhost:4177
```

Set `PORT` to use a different port. For PowerShell:

```powershell
$env:PORT = 4180
node <skill-creator-path>/eval-viewer/dist/server/main.js <run-root>/<skill-name>
```

## Upgrade from a 1.0.x release

Stop the old npm-based viewer before installing the current plugin. Old viewer
processes can retain files in their installed cache. After the update, use the
packaged launch command above. Future launches do not write into the plugin
cache.

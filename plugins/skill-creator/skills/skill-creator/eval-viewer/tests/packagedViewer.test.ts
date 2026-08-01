import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { writeSampleWorkspace } from './fixtures/sampleIteration.js';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

const STARTUP_TIMEOUT_MS = 10_000;
const PROCESS_EXIT_TIMEOUT_MS = 5_000;
const STARTUP_POLL_INTERVAL_MS = 50;
const HTTP_STATUS_OK = 200;
const INSTALLED_VERSION = '1.0.5';
const temporaryRoots: string[] = [];
const runningProcesses: ChildProcess[] = [];

afterEach(async () => {
  await Promise.all(
    runningProcesses.splice(0).map(async (process) => {
      if (process.exitCode !== null) {
        return;
      }
      process.kill();
      await waitForExit(process);
    })
  );
  await Promise.all(temporaryRoots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })));
});

it('runs the packaged viewer without dependencies or cache writes', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'skill-creator-package-'));
  temporaryRoots.push(temporaryRoot);
  const sourceSkillRoot = resolve('..');
  const installedPluginRoot = join(temporaryRoot, 'cache', 'skill-creator', INSTALLED_VERSION);
  const workspaceRoot = join(temporaryRoot, 'runs', 'sample-skill');
  await Promise.all([
    cp(join(sourceSkillRoot, 'eval-viewer', 'dist'), join(installedPluginRoot, 'eval-viewer', 'dist'), {
      recursive: true
    }),
    cp(join(sourceSkillRoot, 'schemas'), join(installedPluginRoot, 'schemas'), { recursive: true })
  ]);
  await expect(stat(join(installedPluginRoot, 'eval-viewer', 'node_modules'))).rejects.toMatchObject({
    code: 'ENOENT'
  });
  await writeSampleWorkspace(workspaceRoot);
  const installedPayloadBefore = await directoryDigest(installedPluginRoot);
  const port = await availablePort();
  const serverEntry = join(installedPluginRoot, 'eval-viewer', 'dist', 'server', 'main.js');
  const viewer = spawn(process.execPath, [serverEntry, workspaceRoot], {
    cwd: installedPluginRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  runningProcesses.push(viewer);
  const output = collectOutput(viewer);
  const baseUrl = `http://127.0.0.1:${port}`;

  await waitForViewer(baseUrl, viewer, output);
  const page = await fetch(baseUrl);
  expect(page.status).toBe(HTTP_STATUS_OK);
  expect(await page.text()).toContain('<div id="root"></div>');

  const iterations = await fetch(`${baseUrl}/api/iterations`);
  expect(iterations.status).toBe(HTTP_STATUS_OK);
  await expect(iterations.json()).resolves.toEqual({ iterations: [1], latestIteration: 1 });

  const feedback = await fetch(`${baseUrl}/api/feedback/1?iteration=1`, {
    body: JSON.stringify({ comments: 'Packaged viewer feedback.', overall: [], turns: [] }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT'
  });
  expect(feedback.status).toBe(HTTP_STATUS_OK);
  await expect(
    readFile(join(workspaceRoot, 'results', 'iteration-1', 'viewer_feedback.json'), 'utf-8')
  ).resolves.toContain('Packaged viewer feedback.');

  const renamedPluginRoot = `${installedPluginRoot}-renamed`;
  await rename(installedPluginRoot, renamedPluginRoot);
  await rename(renamedPluginRoot, installedPluginRoot);

  await expect(stat(join(workspaceRoot, 'eval-viewer.log'))).resolves.toBeDefined();
  expect(await directoryDigest(installedPluginRoot)).toBe(installedPayloadBefore);

  viewer.kill();
  await waitForExit(viewer);
  runningProcesses.splice(runningProcesses.indexOf(viewer), 1);
});

async function directoryDigest(root: string): Promise<string> {
  const hash = createHash('sha256');
  const paths = await recursiveFiles(root);
  const files = await Promise.all(
    paths.map(async (path) => ({ content: await readFile(path), relativePath: relative(root, path) }))
  );
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(file.content);
  }
  return hash.digest('hex');
}

async function recursiveFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? recursiveFiles(path) : Promise.resolve([path]);
    })
  );
  return paths.flat().sort();
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate a viewer test port.');
  }
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise()))
  );
  return address.port;
}

function collectOutput(process: ChildProcess): () => string {
  let output = '';
  process.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  process.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  return () => output;
}

async function waitForViewer(baseUrl: string, process: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  await waitForViewerUntil(baseUrl, process, output, deadline);
}

async function waitForViewerUntil(
  baseUrl: string,
  process: ChildProcess,
  output: () => string,
  deadline: number
): Promise<void> {
  if (process.exitCode !== null) {
    throw new Error(`Packaged viewer exited during startup.\n${output()}`);
  }
  try {
    const response = await fetch(`${baseUrl}/api/iterations`);
    if (response.ok) {
      return;
    }
  } catch {
    // The server has not bound the port yet.
  }
  if (Date.now() >= deadline) {
    throw new Error(`Packaged viewer did not start within ${STARTUP_TIMEOUT_MS}ms.\n${output()}`);
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, STARTUP_POLL_INTERVAL_MS));
  await waitForViewerUntil(baseUrl, process, output, deadline);
}

async function waitForExit(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null) {
    return;
  }
  await Promise.race([
    new Promise<void>((resolvePromise) => process.once('exit', () => resolvePromise())),
    new Promise<never>((_resolvePromise, reject) =>
      setTimeout(
        () => reject(new Error(`Viewer process did not exit within ${PROCESS_EXIT_TIMEOUT_MS}ms.`)),
        PROCESS_EXIT_TIMEOUT_MS
      )
    )
  ]);
}

import { rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildServer } from './buildServer.js';

export const DEFAULT_PORT = 4177;
const LOG_FILE_NAME = 'eval-viewer.log';
const LOG_FILE_EXTENSION_PATTERN = /\.log$/;
const MIN_PORT = 1;
const MAX_PORT = 65535;

interface StartServerOptions {
  argv: string[];
  buildServer: (options: { logFilePath: string; workspaceRoot: string }) => Promise<{
    close: () => Promise<unknown>;
    listen: (options: { host: string; port: number }) => Promise<unknown>;
  }>;
  env: NodeJS.ProcessEnv;
}

export interface RunningViewerServer {
  /**
   * Owns the resources acquired by one successful viewer startup.
   * Call `shutdown` once during process termination to close the HTTP listener,
   * workspace watchers, and logger before replacing the installed plugin.
   */
  shutdown: () => Promise<void>;
}

/**
 * Resolves the required serve argument to the evaluation workspace root.
 *
 * The serve command accepts only a workspace root containing `results/iteration-N`.
 * Direct iteration roots are rejected later during repository startup validation.
 */
export function workspaceRootFromArgs(argv: string[]): string {
  const workspaceRoot = argv[2];
  if (!workspaceRoot) {
    throw new Error('Usage: node <skill-creator-path>/eval-viewer/dist/server/main.js <evaluation-workspace-root>');
  }
  return resolve(workspaceRoot);
}

/** Reads the HTTP port from `PORT`, defaulting to the viewer port when it is unset. */
export function viewerPortFromEnv(env: NodeJS.ProcessEnv): number {
  const portText = env.PORT;
  if (portText === undefined) {
    return DEFAULT_PORT;
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`PORT must be an integer from ${MIN_PORT} to ${MAX_PORT}.`);
  }
  return port;
}

/**
 * Starts one packaged eval viewer for an evaluation workspace.
 *
 * Startup rotates logs under the workspace root, validates the workspace through
 * `buildServer`, and binds Fastify on the configured port. The returned owner must
 * be shut down once so every listener and watcher is released. Invalid arguments,
 * log rotation failures, workspace validation failures, and bind failures reject
 * startup without returning a partially running owner.
 */
export async function startServer(options: StartServerOptions): Promise<RunningViewerServer> {
  const workspaceRoot = workspaceRootFromArgs(options.argv);
  const port = viewerPortFromEnv(options.env);
  const logFilePath = logFilePathFromWorkspaceRoot(workspaceRoot);
  await rotateLogFiles(logFilePath);
  const server = await options.buildServer({ logFilePath, workspaceRoot });
  await server.listen({ host: '0.0.0.0', port });
  return {
    async shutdown() {
      await server.close();
    }
  };
}

function logFilePathFromWorkspaceRoot(workspaceRoot: string): string {
  return resolve(workspaceRoot, LOG_FILE_NAME);
}

async function rotateLogFiles(logFilePath: string): Promise<void> {
  await rm(rotatedLogPath(logFilePath, 2), { force: true });
  await renameIfExists(rotatedLogPath(logFilePath, 1), rotatedLogPath(logFilePath, 2));
  await renameIfExists(logFilePath, rotatedLogPath(logFilePath, 1));
}

function rotatedLogPath(logFilePath: string, rotation: 1 | 2): string {
  return logFilePath.replace(LOG_FILE_EXTENSION_PATTERN, `.${rotation}.log`);
}

async function renameIfExists(source: string, target: string): Promise<void> {
  try {
    await rename(source, target);
  } catch (error) {
    /* v8 ignore next 3 -- rename failures other than a missing old log should stop startup. */
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/* v8 ignore start -- direct CLI launch is covered by the packaged viewer smoke test. */
if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  const directArgv = [...process.argv];
  const workspaceRoot = workspaceRootFromArgs(directArgv);
  directArgv[2] = workspaceRoot;
  process.chdir(workspaceRoot);
  const runningServer = await startServer({ argv: directArgv, buildServer, env: process.env });
  const shutdown = async () => runningServer.shutdown();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
/* v8 ignore stop */

import { rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildServer } from './buildServer.js';

export const DEFAULT_PORT = 4177;
const LOG_FILE_NAME = 'eval-viewer.log';
const MIN_PORT = 1;
const MAX_PORT = 65535;

interface StartServerOptions {
  argv: string[];
  buildServer: (options: { logFilePath: string; workspaceRoot: string }) => Promise<{
    listen: (options: { host: string; port: number }) => Promise<unknown>;
  }>;
  cwd?: string;
  env: NodeJS.ProcessEnv;
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
    throw new Error('Usage: npm run serve -- <evaluation-workspace-root>');
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
 * Starts the packaged eval viewer server.
 *
 * Startup rotates local viewer logs, validates the workspace through `buildServer`,
 * and binds Fastify on all interfaces so the browser can open the local UI.
 */
export async function startServer(options: StartServerOptions): Promise<void> {
  const workspaceRoot = workspaceRootFromArgs(options.argv);
  const port = viewerPortFromEnv(options.env);
  const logFilePath = logFilePathFromCwd(options.cwd ?? process.cwd());
  await rotateLogFiles(logFilePath);
  const server = await options.buildServer({ logFilePath, workspaceRoot });
  await server.listen({ host: '0.0.0.0', port });
}

function logFilePathFromCwd(cwd: string): string {
  return resolve(cwd, LOG_FILE_NAME);
}

async function rotateLogFiles(logFilePath: string): Promise<void> {
  await rm(rotatedLogPath(logFilePath, 2), { force: true });
  await renameIfExists(rotatedLogPath(logFilePath, 1), rotatedLogPath(logFilePath, 2));
  await renameIfExists(logFilePath, rotatedLogPath(logFilePath, 1));
}

function rotatedLogPath(logFilePath: string, rotation: 1 | 2): string {
  return logFilePath.replace(/\.log$/, `.${rotation}.log`);
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

/* v8 ignore next 3 -- direct CLI launch is covered through startServer(). */
if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  await startServer({ argv: process.argv, buildServer, env: process.env });
}

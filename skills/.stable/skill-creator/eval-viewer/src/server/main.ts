import { resolve } from 'node:path';
import { buildServer } from './buildServer.js';

export const DEFAULT_PORT = 4177;
const MIN_PORT = 1;
const MAX_PORT = 65535;

interface StartServerOptions {
  argv: string[];
  buildServer: (options: { resultRoot: string }) => Promise<{
    listen: (options: { host: string; port: number }) => Promise<unknown>;
  }>;
  env: NodeJS.ProcessEnv;
}

export function resultRootFromArgs(argv: string[]): string {
  const resultRoot = argv[2];
  if (!resultRoot) {
    throw new Error('Usage: npm run serve -- <evaluation-result-root>');
  }
  return resolve(resultRoot);
}

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

export async function startServer(options: StartServerOptions): Promise<void> {
  const resultRoot = resultRootFromArgs(options.argv);
  const port = viewerPortFromEnv(options.env);
  const server = await options.buildServer({ resultRoot });
  await server.listen({ host: '0.0.0.0', port });
}

/* v8 ignore next 3 -- direct CLI launch is covered through startServer(). */
if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  await startServer({ argv: process.argv, buildServer, env: process.env });
}

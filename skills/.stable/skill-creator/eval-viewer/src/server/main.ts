import { resolve } from 'node:path';
import { buildServer } from './buildServer.js';

export const DEFAULT_PORT = 4177;

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

export async function startServer(options: StartServerOptions): Promise<void> {
  const server = await options.buildServer({ resultRoot: resultRootFromArgs(options.argv) });
  await server.listen({ host: '0.0.0.0', port: Number(options.env.PORT ?? DEFAULT_PORT) });
}

/* v8 ignore next 3 -- direct CLI launch is covered through startServer(). */
if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  await startServer({ argv: process.argv, buildServer, env: process.env });
}

import type { InlineConfig } from 'vite';
import { resolve } from 'node:path';
import { DEFAULT_PORT } from './main.js';

type DevApiServer = {
  close: () => Promise<unknown>;
  listen: (options: { host: string; port: number }) => Promise<unknown>;
};

type DevViteServer = {
  close: () => Promise<unknown>;
  listen: () => Promise<unknown>;
  printUrls: () => void;
};

interface StartDevServerOptions {
  argv: string[];
  buildServer: (options: { logFilePath: string; workspaceRoot: string }) => Promise<DevApiServer>;
  createServer: (config: InlineConfig) => Promise<DevViteServer>;
}

export interface RunningDevServer {
  shutdown: () => Promise<void>;
}

/**
 * Starts the local development viewer with Vite serving the client and Fastify serving the API.
 *
 * The optional third CLI argument is the evaluation workspace root. When omitted, the generated
 * visual fixture workspace is used so `npm run dev:server` can launch without a real eval run.
 */
export async function startDevServer(options: StartDevServerOptions): Promise<RunningDevServer> {
  const apiPort = DEFAULT_PORT + 1;
  const logFilePath = resolve('eval-viewer.dev.log');
  const workspaceRoot = resolve(options.argv[2] ?? '.tmp/visual-fixture');

  const api = await options.buildServer({ logFilePath, workspaceRoot });
  await api.listen({ host: '127.0.0.1', port: apiPort });

  const vite = await options.createServer({
    server: {
      host: '0.0.0.0',
      port: DEFAULT_PORT,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`
      },
      strictPort: true
    }
  });
  await vite.listen();
  vite.printUrls();

  return {
    async shutdown() {
      await vite.close();
      await api.close();
    }
  };
}

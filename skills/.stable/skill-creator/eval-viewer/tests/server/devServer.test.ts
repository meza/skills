import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { startDevServer } from '../../src/server/devServer.js';
import { DEFAULT_PORT } from '../../src/server/main.js';

describe('development server entrypoint', () => {
  it('starts the API with the resolved workspace root and proxies Vite requests', async () => {
    const apiServer = { close: vi.fn(async () => undefined), listen: vi.fn(async () => undefined) };
    const viteServer = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => undefined),
      printUrls: vi.fn()
    };
    const buildServer = vi.fn(async () => apiServer);
    const createServer = vi.fn(async () => viteServer);
    const workspaceRoot = join('tmp', 'workspace');

    const devServer = await startDevServer({
      argv: ['node', 'scripts/devServer.ts', workspaceRoot],
      buildServer,
      createServer
    });

    expect(buildServer).toHaveBeenCalledWith({
      logFilePath: resolve('eval-viewer.dev.log'),
      workspaceRoot: resolve(workspaceRoot)
    });
    expect(apiServer.listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: DEFAULT_PORT + 1 });
    expect(createServer).toHaveBeenCalledWith({
      server: {
        host: '0.0.0.0',
        port: DEFAULT_PORT,
        proxy: {
          '/api': `http://127.0.0.1:${DEFAULT_PORT + 1}`
        },
        strictPort: true
      }
    });
    expect(viteServer.listen).toHaveBeenCalledWith();
    expect(viteServer.printUrls).toHaveBeenCalledWith();

    await devServer.shutdown();

    expect(viteServer.close).toHaveBeenCalledWith();
    expect(apiServer.close).toHaveBeenCalledWith();
  });

  it('uses the visual fixture workspace when no path is supplied', async () => {
    const buildServer = vi.fn(async () => ({
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => undefined)
    }));
    const createServer = vi.fn(async () => ({
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => undefined),
      printUrls: vi.fn()
    }));

    const devServer = await startDevServer({
      argv: ['node', 'scripts/devServer.ts'],
      buildServer,
      createServer
    });

    expect(buildServer).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: resolve('.tmp/visual-fixture')
      })
    );
    await devServer.shutdown();
  });
});

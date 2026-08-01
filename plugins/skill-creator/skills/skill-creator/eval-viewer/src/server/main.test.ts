import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fs, vol } from '../../tests/support/memfs.js';
import { DEFAULT_PORT, startServer, viewerPortFromEnv, workspaceRootFromArgs } from './main.js';

const CONFIGURED_VIEWER_PORT = 4123;
const PORT_RANGE_ERROR_PATTERN = /PORT must be an integer from 1 to 65535/;
const USAGE_ERROR_PATTERN = /usage/i;
const WORKSPACE_ROOT = resolve('workspace');

describe('server entrypoint', () => {
  it('requires an evaluation workspace root argument', () => {
    expect(() => workspaceRootFromArgs(['node', 'main.ts'])).toThrow(USAGE_ERROR_PATTERN);
  });

  it('starts the server with the resolved workspace root and port', async () => {
    vol.reset();
    await fs.promises.mkdir(WORKSPACE_ROOT, { recursive: true });
    const listen = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const buildServer = vi.fn(async () => ({ close, listen }));

    const runningServer = await startServer({
      argv: ['node', 'main.ts', WORKSPACE_ROOT],
      buildServer,
      env: { PORT: '4123' }
    });

    expect(buildServer).toHaveBeenCalledWith({
      logFilePath: join(WORKSPACE_ROOT, 'eval-viewer.log'),
      workspaceRoot: WORKSPACE_ROOT
    });
    expect(listen).toHaveBeenCalledWith({ host: '0.0.0.0', port: 4123 });
    await runningServer.shutdown();
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses the shared viewer port when PORT is not set', async () => {
    vol.reset();
    const listen = vi.fn(async () => undefined);
    const buildServer = vi.fn(async () => ({ close: vi.fn(async () => undefined), listen }));

    await startServer({
      argv: ['node', 'main.ts', '.'],
      buildServer,
      env: {}
    });

    expect(listen).toHaveBeenCalledWith({ host: '0.0.0.0', port: DEFAULT_PORT });
  });

  it.each([
    ['empty', ''],
    ['non-numeric', 'abc'],
    ['decimal', '4123.5'],
    ['zero', '0'],
    ['out-of-range', '65536']
  ])('rejects %s PORT values before starting the server', async (_name, port) => {
    const buildServer = vi.fn(async () => ({
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => undefined)
    }));

    await expect(
      startServer({
        argv: ['node', 'main.ts', '.'],
        buildServer,
        env: { PORT: port }
      })
    ).rejects.toThrow(PORT_RANGE_ERROR_PATTERN);

    expect(buildServer).not.toHaveBeenCalled();
  });

  it('rotates workspace-local log files before starting the server', async () => {
    vol.reset();
    await fs.promises.mkdir(WORKSPACE_ROOT, { recursive: true });
    await fs.promises.writeFile(join(WORKSPACE_ROOT, 'eval-viewer.log'), 'current', 'utf-8');
    await fs.promises.writeFile(join(WORKSPACE_ROOT, 'eval-viewer.1.log'), 'previous', 'utf-8');
    await fs.promises.writeFile(join(WORKSPACE_ROOT, 'eval-viewer.2.log'), 'oldest', 'utf-8');
    const listen = vi.fn(async () => undefined);
    const buildServer = vi.fn(async () => ({ close: vi.fn(async () => undefined), listen }));

    await startServer({
      argv: ['node', 'main.ts', WORKSPACE_ROOT],
      buildServer,
      env: {}
    });

    await expect(fs.promises.readFile(join(WORKSPACE_ROOT, 'eval-viewer.log'), 'utf-8')).rejects.toMatchObject({
      code: 'ENOENT'
    });
    await expect(fs.promises.readFile(join(WORKSPACE_ROOT, 'eval-viewer.1.log'), 'utf-8')).resolves.toBe('current');
    await expect(fs.promises.readFile(join(WORKSPACE_ROOT, 'eval-viewer.2.log'), 'utf-8')).resolves.toBe('previous');
    expect(buildServer).toHaveBeenCalledWith({
      logFilePath: join(WORKSPACE_ROOT, 'eval-viewer.log'),
      workspaceRoot: WORKSPACE_ROOT
    });
  });

  it('propagates startup failures', async () => {
    const buildServer = vi.fn(() => Promise.reject(new Error('invalid evaluation workspace')));

    await expect(
      startServer({
        argv: ['node', 'main.ts', WORKSPACE_ROOT],
        buildServer,
        env: {}
      })
    ).rejects.toThrow('invalid evaluation workspace');

    expect(buildServer).toHaveBeenCalledOnce();
  });

  it('parses configured viewer ports', () => {
    expect(viewerPortFromEnv({ PORT: '4123' })).toBe(CONFIGURED_VIEWER_PORT);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PORT, startServer, viewerPortFromEnv, workspaceRootFromArgs } from '../../src/server/main.js';
import { fs, vol } from '../support/memfs.js';

const CONFIGURED_VIEWER_PORT = 4123;
const EVAL_VIEWER_LOG_PATH_PATTERN = /eval-viewer\.log$/;
const EVAL_VIEWER_WORKSPACE_PATTERN = /eval-viewer$/;
const PORT_RANGE_ERROR_PATTERN = /PORT must be an integer from 1 to 65535/;
const USAGE_ERROR_PATTERN = /usage/i;

describe('server entrypoint', () => {
  it('requires an evaluation workspace root argument', () => {
    expect(() => workspaceRootFromArgs(['node', 'main.ts'])).toThrow(USAGE_ERROR_PATTERN);
  });

  it('starts the server with the resolved workspace root and port', async () => {
    vol.reset();
    await fs.promises.mkdir('/cwd', { recursive: true });
    const listen = vi.fn(async () => undefined);
    const buildServer = vi.fn(async () => ({ listen }));

    await startServer({
      argv: ['node', 'main.ts', '.'],
      buildServer,
      cwd: '/cwd',
      env: { PORT: '4123' }
    });

    expect(buildServer).toHaveBeenCalledWith({
      logFilePath: expect.stringMatching(EVAL_VIEWER_LOG_PATH_PATTERN),
      workspaceRoot: expect.stringMatching(EVAL_VIEWER_WORKSPACE_PATTERN)
    });
    expect(listen).toHaveBeenCalledWith({ host: '0.0.0.0', port: 4123 });
  });

  it('uses the shared viewer port when PORT is not set', async () => {
    vol.reset();
    const listen = vi.fn(async () => undefined);
    const buildServer = vi.fn(async () => ({ listen }));

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
    const buildServer = vi.fn(async () => ({ listen: vi.fn(async () => undefined) }));

    await expect(
      startServer({
        argv: ['node', 'main.ts', '.'],
        buildServer,
        env: { PORT: port }
      })
    ).rejects.toThrow(PORT_RANGE_ERROR_PATTERN);

    expect(buildServer).not.toHaveBeenCalled();
  });

  it('rotates cwd-local log files before starting the server', async () => {
    vol.reset();
    await fs.promises.mkdir('/cwd', { recursive: true });
    await fs.promises.writeFile('/cwd/eval-viewer.log', 'current', 'utf-8');
    await fs.promises.writeFile('/cwd/eval-viewer.1.log', 'previous', 'utf-8');
    await fs.promises.writeFile('/cwd/eval-viewer.2.log', 'oldest', 'utf-8');
    const listen = vi.fn(async () => undefined);
    const buildServer = vi.fn(async () => ({ listen }));

    await startServer({
      argv: ['node', 'main.ts', '.'],
      buildServer,
      cwd: '/cwd',
      env: {}
    });

    await expect(fs.promises.readFile('/cwd/eval-viewer.log', 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.promises.readFile('/cwd/eval-viewer.1.log', 'utf-8')).resolves.toBe('current');
    await expect(fs.promises.readFile('/cwd/eval-viewer.2.log', 'utf-8')).resolves.toBe('previous');
    expect(buildServer).toHaveBeenCalledWith({
      logFilePath: expect.stringMatching(EVAL_VIEWER_LOG_PATH_PATTERN),
      workspaceRoot: expect.stringMatching(EVAL_VIEWER_WORKSPACE_PATTERN)
    });
  });

  it('parses configured viewer ports', () => {
    expect(viewerPortFromEnv({ PORT: '4123' })).toBe(CONFIGURED_VIEWER_PORT);
  });
});

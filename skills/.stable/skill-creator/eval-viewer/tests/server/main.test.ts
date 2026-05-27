import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PORT, resultRootFromArgs, startServer } from '../../src/server/main.js';

describe('server entrypoint', () => {
  it('requires an evaluation result root argument', () => {
    expect(() => resultRootFromArgs(['node', 'main.ts'])).toThrow(/usage/i);
  });

  it('starts the server with the resolved result root and port', async () => {
    const listen = vi.fn(async () => undefined);
    const buildServer = vi.fn(async () => ({ listen }));

    await startServer({
      argv: ['node', 'main.ts', '.'],
      buildServer,
      env: { PORT: '4123' }
    });

    expect(buildServer).toHaveBeenCalledWith({ resultRoot: expect.stringMatching(/eval-viewer$/) });
    expect(listen).toHaveBeenCalledWith({ host: '0.0.0.0', port: 4123 });
  });

  it('uses the shared viewer port when PORT is not set', async () => {
    const listen = vi.fn(async () => undefined);
    const buildServer = vi.fn(async () => ({ listen }));

    await startServer({
      argv: ['node', 'main.ts', '.'],
      buildServer,
      env: {}
    });

    expect(listen).toHaveBeenCalledWith({ host: '0.0.0.0', port: DEFAULT_PORT });
  });
});

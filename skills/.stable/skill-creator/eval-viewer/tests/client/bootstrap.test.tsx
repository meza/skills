import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadInitialIteration, renderViewer } from '../../src/client/bootstrap.js';
import { iterationView } from './appFixture.js';

describe('client bootstrap', () => {
  it('loads the server iteration when the API responds successfully', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(iterationView())));

    await expect(loadInitialIteration(fetcher)).resolves.toMatchObject({
      summary: { skillName: 'conventional-commit-message' }
    });
  });

  it('fails loudly when the API fails or is unavailable', async () => {
    const rejectedFetcher = vi.fn(async () => new Response('', { status: 500 }));
    const throwingFetcher = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(loadInitialIteration(rejectedFetcher)).rejects.toThrow('Could not load evaluation results.');
    await expect(loadInitialIteration(throwingFetcher)).rejects.toThrow('offline');
  });

  it('renders the viewer into the provided container', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(iterationView())))
    );
    const container = document.createElement('div');

    await renderViewer(container);

    await waitFor(() => expect(container.textContent).toContain('Skill Evaluation'));
    vi.unstubAllGlobals();
  });

  it('rejects startup when the initial iteration cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }))
    );
    const container = document.createElement('div');

    await expect(renderViewer(container)).rejects.toThrow('Could not load evaluation results.');
    expect(container.textContent).toBe('');
    vi.unstubAllGlobals();
  });

  it('rejects startup when the loaded iteration has no runs', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            feedbackPath: 'viewer_feedback.json',
            runs: [],
            summary: {
              effort: 'high',
              iteration: 1,
              model: 'gpt-5',
              provider: 'codex',
              runCount: 0,
              skillName: 'empty'
            }
          })
        )
    );

    await expect(loadInitialIteration(fetcher)).rejects.toThrow('no runs to review');
  });
});

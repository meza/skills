import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadInitialIteration, renderViewer } from '../../src/client/bootstrap.js';
import { demoIteration } from '../../src/client/demoData.js';

describe('client bootstrap', () => {
  it('loads the server iteration when the API responds successfully', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ summary: { skillName: 'loaded' } })));

    await expect(loadInitialIteration(fetcher)).resolves.toMatchObject({
      summary: { skillName: 'loaded' }
    });
  });

  it('falls back to demo data when the API fails or is unavailable', async () => {
    const rejectedFetcher = vi.fn(async () => new Response('', { status: 500 }));
    const throwingFetcher = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(loadInitialIteration(rejectedFetcher)).resolves.toBe(demoIteration);
    await expect(loadInitialIteration(throwingFetcher)).resolves.toBe(demoIteration);
  });

  it('renders the viewer into the provided container', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }))
    );
    const container = document.createElement('div');

    await renderViewer(container);

    await waitFor(() => expect(container.textContent).toContain('Skill Evaluation'));
    vi.unstubAllGlobals();
  });
});

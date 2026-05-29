import { expect, it, vi } from 'vitest';
import { loadIterationFromServer, loadIterationIndexFromServer, saveFeedbackToServer } from '../../src/client/api.js';
import type { FeedbackInput } from '../../src/shared/viewModel.js';

const feedback: FeedbackInput = {
  comments: '',
  evalId: 1,
  overall: [],
  turns: []
};

it('includes JSON error details when feedback save fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid feedback.' }), { status: 500 }))
  );

  await expect(saveFeedbackToServer(feedback, 4)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1?iteration=4. Invalid feedback.'
  );

  vi.unstubAllGlobals();
});

it('includes plain text error details when feedback save fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Disk is full.', { status: 500 })));

  await expect(saveFeedbackToServer(feedback, 4)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1?iteration=4. Disk is full.'
  );

  vi.unstubAllGlobals();
});

it('falls back to the response status text when feedback save details are empty', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' }))
  );

  await expect(saveFeedbackToServer(feedback, 4)).rejects.toThrow(
    'Could not save feedback: 503 from /api/feedback/1?iteration=4. Service Unavailable'
  );

  vi.unstubAllGlobals();
});

it('omits feedback save details when the response has no error body or status text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

  await expect(saveFeedbackToServer(feedback, 4)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1?iteration=4.'
  );

  vi.unstubAllGlobals();
});

it('uses status text when JSON feedback save details are not a string', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 500 }), { status: 500, statusText: 'Bad' }))
  );

  await expect(saveFeedbackToServer(feedback, 4)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1?iteration=4. Bad'
  );

  vi.unstubAllGlobals();
});

it('loads selected iterations and the iteration index from the server', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ summary: { iteration: 3 } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ iterations: [1, 3], latestIteration: 3 })));
  vi.stubGlobal('fetch', fetcher);

  await expect(loadIterationFromServer(3)).resolves.toEqual({ summary: { iteration: 3 } });
  await expect(loadIterationIndexFromServer()).resolves.toEqual({ iterations: [1, 3], latestIteration: 3 });
  expect(fetcher).toHaveBeenNthCalledWith(1, '/api/iteration?iteration=3');
  expect(fetcher).toHaveBeenNthCalledWith(2, '/api/iterations');

  vi.unstubAllGlobals();
});

it('reports iteration index load failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('No iterations.', { status: 500 })));

  await expect(loadIterationIndexFromServer()).rejects.toThrow(
    'Could not load iterations: 500 from /api/iterations. No iterations.'
  );

  vi.unstubAllGlobals();
});

it('reports selected iteration load failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Missing iteration.', { status: 404 })));

  await expect(loadIterationFromServer(9)).rejects.toThrow(
    'Could not load evaluation results: 404 from /api/iteration?iteration=9. Missing iteration.'
  );

  vi.unstubAllGlobals();
});

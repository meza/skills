import type { FeedbackInput } from '../shared/viewModel.js';
import { expect, it, vi } from 'vitest';
import { loadIterationFromServer, loadIterationIndexFromServer, saveFeedbackToServer } from './api.js';

const feedback: FeedbackInput = {
  comments: '',
  evalId: 1,
  overall: [],
  turns: []
};
const FEEDBACK_SAVE_ITERATION = 4;
const SELECTED_ITERATION = 3;
const FIRST_AVAILABLE_ITERATION = 1;
const MISSING_ITERATION = 9;
const FIRST_FETCH_CALL = 1;
const SECOND_FETCH_CALL = 2;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

it('includes JSON error details when feedback save fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid feedback.' }), { status: HTTP_STATUS_INTERNAL_SERVER_ERROR })
      )
  );

  await expect(saveFeedbackToServer(feedback, FEEDBACK_SAVE_ITERATION)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1?iteration=4. Invalid feedback.'
  );

  vi.unstubAllGlobals();
});

it('includes plain text error details when feedback save fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('Disk is full.', { status: HTTP_STATUS_INTERNAL_SERVER_ERROR }))
  );

  await expect(saveFeedbackToServer(feedback, FEEDBACK_SAVE_ITERATION)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1?iteration=4. Disk is full.'
  );

  vi.unstubAllGlobals();
});

it('falls back to the response status text when feedback save details are empty', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: HTTP_STATUS_SERVICE_UNAVAILABLE, statusText: 'Service Unavailable' })
      )
  );

  await expect(saveFeedbackToServer(feedback, FEEDBACK_SAVE_ITERATION)).rejects.toThrow(
    'Could not save feedback: 503 from /api/feedback/1?iteration=4. Service Unavailable'
  );

  vi.unstubAllGlobals();
});

it('omits feedback save details when the response has no error body or status text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: HTTP_STATUS_INTERNAL_SERVER_ERROR })));

  await expect(saveFeedbackToServer(feedback, FEEDBACK_SAVE_ITERATION)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1?iteration=4.'
  );

  vi.unstubAllGlobals();
});

it('uses status text when JSON feedback save details are not a string', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: HTTP_STATUS_INTERNAL_SERVER_ERROR }), {
        status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
        statusText: 'Bad'
      })
    )
  );

  await expect(saveFeedbackToServer(feedback, FEEDBACK_SAVE_ITERATION)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1?iteration=4. Bad'
  );

  vi.unstubAllGlobals();
});

it('loads selected iterations and the iteration index from the server', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ summary: { iteration: SELECTED_ITERATION } })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          iterations: [FIRST_AVAILABLE_ITERATION, SELECTED_ITERATION],
          latestIteration: SELECTED_ITERATION
        })
      )
    );
  vi.stubGlobal('fetch', fetcher);

  await expect(loadIterationFromServer(SELECTED_ITERATION)).resolves.toEqual({
    summary: { iteration: SELECTED_ITERATION }
  });
  await expect(loadIterationIndexFromServer()).resolves.toEqual({
    iterations: [FIRST_AVAILABLE_ITERATION, SELECTED_ITERATION],
    latestIteration: SELECTED_ITERATION
  });
  expect(fetcher).toHaveBeenNthCalledWith(FIRST_FETCH_CALL, '/api/iteration?iteration=3');
  expect(fetcher).toHaveBeenNthCalledWith(SECOND_FETCH_CALL, '/api/iterations');

  vi.unstubAllGlobals();
});

it('reports iteration index load failures', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('No iterations.', { status: HTTP_STATUS_INTERNAL_SERVER_ERROR }))
  );

  await expect(loadIterationIndexFromServer()).rejects.toThrow(
    'Could not load iterations: 500 from /api/iterations. No iterations.'
  );

  vi.unstubAllGlobals();
});

it('reports selected iteration load failures', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('Missing iteration.', { status: HTTP_STATUS_NOT_FOUND }))
  );

  await expect(loadIterationFromServer(MISSING_ITERATION)).rejects.toThrow(
    'Could not load evaluation results: 404 from /api/iteration?iteration=9. Missing iteration.'
  );

  vi.unstubAllGlobals();
});

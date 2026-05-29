import { expect, it, vi } from 'vitest';
import { saveFeedbackToServer } from '../../src/client/api.js';
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

  await expect(saveFeedbackToServer(feedback)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1. Invalid feedback.'
  );

  vi.unstubAllGlobals();
});

it('includes plain text error details when feedback save fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Disk is full.', { status: 500 })));

  await expect(saveFeedbackToServer(feedback)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1. Disk is full.'
  );

  vi.unstubAllGlobals();
});

it('falls back to the response status text when feedback save details are empty', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' }))
  );

  await expect(saveFeedbackToServer(feedback)).rejects.toThrow(
    'Could not save feedback: 503 from /api/feedback/1. Service Unavailable'
  );

  vi.unstubAllGlobals();
});

it('omits feedback save details when the response has no error body or status text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

  await expect(saveFeedbackToServer(feedback)).rejects.toThrow('Could not save feedback: 500 from /api/feedback/1.');

  vi.unstubAllGlobals();
});

it('uses status text when JSON feedback save details are not a string', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 500 }), { status: 500, statusText: 'Bad' }))
  );

  await expect(saveFeedbackToServer(feedback)).rejects.toThrow(
    'Could not save feedback: 500 from /api/feedback/1. Bad'
  );

  vi.unstubAllGlobals();
});

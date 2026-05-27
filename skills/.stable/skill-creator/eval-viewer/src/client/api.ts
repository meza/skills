import type { FeedbackInput } from '../shared/viewModel.js';

export async function saveFeedbackToServer(feedback: FeedbackInput): Promise<unknown> {
  const response = await fetch(`/api/feedback/${feedback.evalId}`, {
    body: JSON.stringify({
      comments: feedback.comments,
      overall: feedback.overall,
      turns: feedback.turns
    }),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'PUT'
  });
  if (!response.ok) {
    throw new Error('Could not save feedback.');
  }
  return response.json();
}

import type { FeedbackInput } from '../shared/viewModel.js';

export async function saveFeedbackToServer(feedback: FeedbackInput): Promise<unknown> {
  const endpoint = `/api/feedback/${feedback.evalId}`;
  const response = await fetch(endpoint, {
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
    throw new Error(await feedbackSaveErrorMessage(response, endpoint));
  }
  return response.json();
}

async function feedbackSaveErrorMessage(response: Response, endpoint: string): Promise<string> {
  const details = await responseErrorDetails(response);
  return details
    ? `Could not save feedback: ${response.status} from ${endpoint}. ${details}`
    : `Could not save feedback: ${response.status} from ${endpoint}.`;
}

async function responseErrorDetails(response: Response): Promise<string> {
  const fallback = response.statusText.trim();
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    return typeof body.error === 'string' && body.error.trim() ? body.error.trim() : fallback;
  } catch {
    const text = (await response.text()).trim();
    return text || fallback;
  }
}

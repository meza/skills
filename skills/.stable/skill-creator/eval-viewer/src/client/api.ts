import type { FeedbackInput, IterationIndexView, IterationNumber, IterationView } from '../shared/viewModel.js';

/** Loads the latest iteration, or a specific iteration when an iteration number is supplied. */
export async function loadIterationFromServer(iterationNumber?: IterationNumber): Promise<IterationView> {
  const endpoint = iterationNumber === undefined ? '/api/iteration' : `/api/iteration?iteration=${iterationNumber}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, endpoint, 'Could not load evaluation results'));
  }
  return response.json();
}

/** Loads the iteration selector state without loading full run artifacts. */
export async function loadIterationIndexFromServer(): Promise<IterationIndexView> {
  const endpoint = '/api/iterations';
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, endpoint, 'Could not load iterations'));
  }
  return response.json();
}

/** Saves reviewer feedback to the active iteration shown in the browser. */
export async function saveFeedbackToServer(
  feedback: FeedbackInput,
  iterationNumber: IterationNumber
): Promise<unknown> {
  const endpoint = `/api/feedback/${feedback.evalId}?iteration=${iterationNumber}`;
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
    throw new Error(await responseErrorMessage(response, endpoint, 'Could not save feedback'));
  }
  return response.json();
}

async function responseErrorMessage(response: Response, endpoint: string, prefix: string): Promise<string> {
  const details = await responseErrorDetails(response);
  return details
    ? `${prefix}: ${response.status} from ${endpoint}. ${details}`
    : `${prefix}: ${response.status} from ${endpoint}.`;
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

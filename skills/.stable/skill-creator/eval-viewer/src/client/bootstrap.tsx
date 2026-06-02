import type { IterationView } from '../shared/viewModel.js';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { loadIterationFromServer } from './api.js';

export async function loadInitialIteration(
  fetcher: typeof fetch = fetch,
  loadIteration = loadIterationFromServer
): Promise<IterationView> {
  const iteration = fetcher === fetch ? await loadIteration() : await loadInitialIterationWithFetcher(fetcher);
  assertRunnableIteration(iteration);
  return iteration;
}

export async function renderViewer(container: HTMLElement): Promise<void> {
  createRoot(container).render(<App initialIteration={await loadInitialIteration()} />);
}

async function loadInitialIterationWithFetcher(fetcher: typeof fetch): Promise<IterationView> {
  const response = await fetcher('/api/iteration');
  if (!response.ok) {
    throw new Error('Could not load evaluation results.');
  }
  return (await response.json()) as IterationView;
}

function assertRunnableIteration(iteration: IterationView): void {
  if (!Array.isArray(iteration.runs) || iteration.runs.length === 0) {
    throw new Error('Evaluation results contain no runs to review.');
  }
}

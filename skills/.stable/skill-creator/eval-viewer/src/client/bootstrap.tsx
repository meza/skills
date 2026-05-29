import { createRoot } from 'react-dom/client';
import type { IterationView } from '../shared/viewModel.js';
import { App } from './App.js';

export async function loadInitialIteration(fetcher: typeof fetch = fetch): Promise<IterationView> {
  const response = await fetcher('/api/iteration');
  if (!response.ok) {
    throw new Error('Could not load evaluation results.');
  }
  const iteration = (await response.json()) as IterationView;
  assertRunnableIteration(iteration);
  return iteration;
}

export async function renderViewer(container: HTMLElement): Promise<void> {
  createRoot(container).render(<App initialIteration={await loadInitialIteration()} />);
}

function assertRunnableIteration(iteration: IterationView): void {
  if (!Array.isArray(iteration.runs) || iteration.runs.length === 0) {
    throw new Error('Evaluation results contain no runs to review.');
  }
}

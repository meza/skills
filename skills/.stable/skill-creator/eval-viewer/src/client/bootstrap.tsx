import { createRoot } from 'react-dom/client';
import type { IterationView } from '../shared/viewModel.js';
import { App } from './App.js';
import { demoIteration } from './demoData.js';

export async function loadInitialIteration(fetcher: typeof fetch = fetch): Promise<IterationView> {
  try {
    const response = await fetcher('/api/iteration');
    if (!response.ok) {
      return demoIteration;
    }
    return (await response.json()) as IterationView;
  } catch {
    return demoIteration;
  }
}

export async function renderViewer(container: HTMLElement): Promise<void> {
  createRoot(container).render(<App initialIteration={await loadInitialIteration()} />);
}

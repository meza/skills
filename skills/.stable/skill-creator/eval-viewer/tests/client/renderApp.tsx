import { render } from '@testing-library/react';
import { App } from '../../src/client/App.js';
import type { FeedbackInput, IterationView } from '../../src/shared/viewModel.js';
import { iterationView } from './appFixture.js';

export function renderApp({
  initialIteration = iterationView(),
  autosaveDelayMs,
  evalTransitionMs = 0,
  saveFeedback
}: {
  autosaveDelayMs?: number;
  evalTransitionMs?: number;
  initialIteration?: IterationView;
  saveFeedback?: (feedback: FeedbackInput) => Promise<unknown>;
} = {}) {
  return render(
    <App
      autosaveDelayMs={autosaveDelayMs}
      evalTransitionMs={evalTransitionMs}
      initialIteration={initialIteration}
      saveFeedback={saveFeedback}
    />
  );
}

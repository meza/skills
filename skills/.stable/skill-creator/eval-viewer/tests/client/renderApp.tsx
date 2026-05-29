import { render } from '@testing-library/react';
import { App, type IterationEventSource } from '../../src/client/App.js';
import type { FeedbackInput, IterationIndexView, IterationNumber, IterationView } from '../../src/shared/viewModel.js';
import { iterationView } from './appFixture.js';

export function renderApp({
  initialIteration = iterationView(),
  autosaveDelayMs,
  createIterationEventSource,
  evalTransitionMs = 0,
  loadIteration,
  loadIterationIndex,
  saveFeedback
}: {
  autosaveDelayMs?: number;
  createIterationEventSource?: () => IterationEventSource;
  evalTransitionMs?: number;
  initialIteration?: IterationView;
  loadIteration?: (iteration?: IterationNumber) => Promise<IterationView>;
  loadIterationIndex?: () => Promise<IterationIndexView>;
  saveFeedback?: (feedback: FeedbackInput, iteration: IterationNumber) => Promise<unknown>;
} = {}) {
  return render(
    <App
      autosaveDelayMs={autosaveDelayMs}
      createIterationEventSource={createIterationEventSource}
      evalTransitionMs={evalTransitionMs}
      initialIteration={initialIteration}
      loadIteration={loadIteration}
      loadIterationIndex={loadIterationIndex}
      saveFeedback={saveFeedback}
    />
  );
}

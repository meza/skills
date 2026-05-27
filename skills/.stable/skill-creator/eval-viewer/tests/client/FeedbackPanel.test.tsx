import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { FeedbackPanel } from '../../src/client/components/FeedbackPanel.js';
import type { RunFeedbackView } from '../../src/shared/viewModel.js';
import { iterationView } from './appFixture.js';

it('submits the current feedback draft and reports success', async () => {
  const user = userEvent.setup();
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the feedback fixture.');
  }
  const saveFeedback = vi.fn().mockResolvedValue(undefined);

  render(
    <FeedbackPanel
      draft={{ ...run.feedback, comments: 'Ready to keep.' }}
      run={run}
      saveFeedback={saveFeedback}
      updateDraft={() => undefined}
    />
  );

  await user.click(screen.getByRole('button', { name: 'Submit Review & Finalize' }));

  expect(saveFeedback).toHaveBeenCalledWith({
    comments: 'Ready to keep.',
    evalId: run.evalId,
    overall: run.feedback.overall,
    turns: run.feedback.turns
  });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
});

it('updates draft comments and reports save failures', async () => {
  const user = userEvent.setup();
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the feedback fixture.');
  }
  let updatedDraft: RunFeedbackView | undefined;
  const updateDraft = vi.fn((updater: (draft: RunFeedbackView) => RunFeedbackView) => {
    updatedDraft = updater(run.feedback);
  });

  render(
    <FeedbackPanel
      draft={run.feedback}
      run={run}
      saveFeedback={vi.fn().mockRejectedValue(new Error('write failed'))}
      updateDraft={updateDraft}
    />
  );

  fireEvent.change(screen.getByLabelText('Review comments'), { target: { value: 'Needs a follow-up.' } });
  expect(updatedDraft?.comments).toBe('Needs a follow-up.');

  await user.click(screen.getByRole('button', { name: 'Submit Review & Finalize' }));
  expect(await screen.findByText('Could not save feedback.')).toBeInTheDocument();
});

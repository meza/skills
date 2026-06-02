import type { RunFeedbackView } from '../../src/shared/viewModel.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { FeedbackPanel } from '../../src/client/components/FeedbackPanel.js';
import { iterationView } from './appFixture.js';

it('renders workflow actions and reports save state', async () => {
  const user = userEvent.setup();
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the feedback fixture.');
  }
  const onPrimaryAction = vi.fn();
  const onPrevious = vi.fn();

  render(
    <FeedbackPanel
      draft={{ ...run.feedback, comments: 'Ready to keep.' }}
      hasPrevious={true}
      onPrevious={onPrevious}
      onPrimaryAction={onPrimaryAction}
      primaryActionLabel='Save & Next'
      saveState='saved'
      updateDraft={() => undefined}
    />
  );

  await user.click(screen.getByRole('button', { name: 'Previous' }));
  await user.click(screen.getByRole('button', { name: 'Save & Next' }));

  expect(onPrevious).toHaveBeenCalledTimes(1);
  expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Saved');
});

it('updates draft comments and reports save failures', async () => {
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
      hasPrevious={false}
      onPrevious={vi.fn()}
      onPrimaryAction={vi.fn()}
      primaryActionLabel='Complete feedback for iteration'
      saveError='Could not save feedback: 500 from /api/feedback/1. Disk is full.'
      saveState='error'
      updateDraft={updateDraft}
    />
  );

  fireEvent.change(screen.getByLabelText('Review comments'), { target: { value: 'Needs a follow-up.' } });
  expect(updatedDraft?.comments).toBe('Needs a follow-up.');
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Complete feedback for iteration' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not save feedback: 500 from /api/feedback/1. Disk is full.'
  );
});

it('uses a default save failure message when no details are provided', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the feedback fixture.');
  }

  render(
    <FeedbackPanel
      draft={run.feedback}
      hasPrevious={false}
      onPrevious={vi.fn()}
      onPrimaryAction={vi.fn()}
      primaryActionLabel='Complete feedback for iteration'
      saveState='error'
      updateDraft={() => undefined}
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Could not save feedback.');
});

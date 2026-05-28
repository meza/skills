import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ExpectationCard } from '../../src/client/components/ExpectationCard.js';
import type { ExpectationView, RunFeedbackView } from '../../src/shared/viewModel.js';

const expectation: ExpectationView = {
  evidence: 'The answer starts with feat!:',
  id: 'turn-one-expectation',
  passed: true,
  scope: 'turn',
  text: 'The response uses a breaking-change marker.',
  turn: 1
};

const draft: RunFeedbackView = {
  comments: '',
  overall: [],
  turns: [{ expectations: [{ comment: '', expectation_id: expectation.id }], turn: 1 }]
};

it('renders expectation text as body copy with the status badge', () => {
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={{ ...expectation, passed: false }}
      comparisonLabel="Baseline"
      draft={draft}
      expectation={expectation}
      expectations={[expectation]}
      index={0}
      resultLabel="Run"
      updateDraft={() => undefined}
    />
  );

  const expectationText = screen.getByText('The response uses a breaking-change marker.');
  const card = expectationText.closest('article');

  expect(expectationText.tagName).toBe('P');
  expect(expectationText).toHaveClass('expectation-text');
  expect(card).toHaveClass('expectation', 'pass');
  expect(within(card as HTMLElement).getByText('Baseline: FAIL')).toBeInTheDocument();
});

it('toggles passing expectation feedback from the card button', async () => {
  const user = userEvent.setup();
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel="Baseline"
      draft={draft}
      expectation={expectation}
      expectations={[expectation]}
      index={0}
      resultLabel="Run"
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  const feedbackArea = feedback.closest('.inline-feedback');
  const toggle = screen.getByRole('button', {
    name: /Toggle feedback for The response uses a breaking-change marker/i
  });

  expect(feedbackArea).toHaveAttribute('aria-hidden', 'true');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await user.click(toggle);

  expect(feedbackArea).toHaveAttribute('aria-hidden', 'false');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

it('toggles expectation feedback from the card surface', async () => {
  const user = userEvent.setup();
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel="Baseline"
      draft={draft}
      expectation={expectation}
      expectations={[expectation]}
      index={0}
      resultLabel="Run"
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  const card = screen.getByText('The response uses a breaking-change marker.').closest('article');

  expect(feedback.closest('.inline-feedback')).toHaveAttribute('aria-hidden', 'true');

  await user.click(card as HTMLElement);

  expect(feedback.closest('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');
});

it('keeps feedback open when interacting with the textarea', async () => {
  const user = userEvent.setup();
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel="Baseline"
      draft={draft}
      expectation={{ ...expectation, passed: false }}
      expectations={[expectation]}
      index={0}
      resultLabel="Run"
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');

  expect(feedback.closest('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');

  await user.click(feedback);

  expect(feedback.closest('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');
});

it('records feedback through the draft updater', async () => {
  const user = userEvent.setup();
  const updateDraft = vi.fn();
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel="Baseline"
      draft={draft}
      expectation={{ ...expectation, passed: false }}
      expectations={[expectation]}
      index={0}
      resultLabel="Run"
      updateDraft={updateDraft}
    />
  );

  await user.type(screen.getByLabelText('Feedback for turn 1 expectation 1'), 'Reviewer note.');

  expect(updateDraft).toHaveBeenCalled();
});

it('opens feedback by default when the expectation already has feedback', () => {
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel="Baseline"
      draft={{
        ...draft,
        turns: [{ expectations: [{ comment: 'Existing note.', expectation_id: expectation.id }], turn: 1 }]
      }}
      expectation={expectation}
      expectations={[expectation]}
      index={0}
      resultLabel="Run"
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');

  expect(feedback.closest('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');
  expect(feedback).toHaveValue('Existing note.');
});

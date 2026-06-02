import type { ExpectationView, RunFeedbackView } from '../../src/shared/viewModel.js';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ExpectationCard } from '../../src/client/components/ExpectationCard.js';

const BREAKING_CHANGE_FEEDBACK_TOGGLE_PATTERN = /Toggle feedback for The response uses a breaking-change marker/i;

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

it('shows expectation result and comparison status', () => {
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={{ ...expectation, passed: false }}
      comparisonLabel='Baseline'
      draft={draft}
      expectation={expectation}
      expectations={[expectation]}
      index={0}
      resultLabel='Run'
      updateDraft={() => undefined}
    />
  );

  const expectationText = screen.getByText('The response uses a breaking-change marker.');

  expect(expectationText).toBeInTheDocument();
  expect(
    screen.getByText((_, element) => element?.textContent?.replace(/\s+/gu, ' ').trim() === 'PASS | Baseline: FAIL')
  ).toBeInTheDocument();
});

it('toggles passing expectation feedback from the card button', async () => {
  const user = userEvent.setup();
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel='Baseline'
      draft={draft}
      expectation={expectation}
      expectations={[expectation]}
      index={0}
      resultLabel='Run'
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  const toggle = screen.getByRole('button', {
    name: BREAKING_CHANGE_FEEDBACK_TOGGLE_PATTERN
  });

  expect(feedback).toHaveAttribute('tabIndex', '-1');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await user.click(toggle);

  expect(feedback).not.toHaveAttribute('tabIndex');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

it('toggles expectation feedback from the card surface', async () => {
  const user = userEvent.setup();
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel='Baseline'
      draft={draft}
      expectation={expectation}
      expectations={[expectation]}
      index={0}
      resultLabel='Run'
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  const expectationText = screen.getByText('The response uses a breaking-change marker.');

  expect(feedback).toHaveAttribute('tabIndex', '-1');

  await user.click(expectationText);

  expect(feedback).not.toHaveAttribute('tabIndex');
});

it('keeps feedback open when interacting with the textarea', async () => {
  const user = userEvent.setup();
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel='Baseline'
      draft={draft}
      expectation={{ ...expectation, passed: false }}
      expectations={[expectation]}
      index={0}
      resultLabel='Run'
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  const toggle = screen.getByRole('button', {
    name: BREAKING_CHANGE_FEEDBACK_TOGGLE_PATTERN
  });

  expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await user.click(feedback);

  expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

it('records feedback through the draft updater', async () => {
  const user = userEvent.setup();
  const updateDraft = vi.fn();
  render(
    <ExpectationCard
      allowFeedback
      comparisonExpectation={undefined}
      comparisonLabel='Baseline'
      draft={draft}
      expectation={{ ...expectation, passed: false }}
      expectations={[expectation]}
      index={0}
      resultLabel='Run'
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
      comparisonLabel='Baseline'
      draft={{
        ...draft,
        turns: [{ expectations: [{ comment: 'Existing note.', expectation_id: expectation.id }], turn: 1 }]
      }}
      expectation={expectation}
      expectations={[expectation]}
      index={0}
      resultLabel='Run'
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  const toggle = screen.getByRole('button', {
    name: BREAKING_CHANGE_FEEDBACK_TOGGLE_PATTERN
  });

  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(feedback).toHaveValue('Existing note.');
});

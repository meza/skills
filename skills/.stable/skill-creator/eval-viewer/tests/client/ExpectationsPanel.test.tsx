import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { ExpectationsPanel } from '../../src/client/components/ExpectationsPanel.js';
import { iterationView } from './appFixture.js';

it('switches between skill and baseline expectation results', async () => {
  const user = userEvent.setup();
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }

  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  expect(screen.getByRole('button', { name: 'skill' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('1/1 requirements passed')).toBeInTheDocument();
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'baseline' }));

  expect(screen.getByRole('button', { name: 'baseline' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('0/1 requirements passed')).toBeInTheDocument();
  expect(screen.getByText('Baseline Evidence')).toBeInTheDocument();
  expect(screen.getByText('The answer uses fix: and omits the breaking-change impact.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Feedback for turn 1 expectation 1')).not.toBeInTheDocument();
});

it('does not render turn indicators inside expectation cards', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  const expectationText = screen.getByText('The response uses a breaking-change marker.');
  const expectationCard = expectationText.closest('article');
  if (!expectationCard) {
    throw new Error('Expected the turn expectation to render inside an expectation card.');
  }

  expect(within(expectationCard).queryByText('Turn 1')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();
});

it('renders expectation text as body copy rather than a heading', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  const expectationText = screen.getByText('The response uses a breaking-change marker.');

  expect(
    screen.queryByRole('heading', { name: 'The response uses a breaking-change marker.' })
  ).not.toBeInTheDocument();
  expect(expectationText.tagName).toBe('P');
  expect(expectationText).toHaveClass('expectation-text');
});

it('keeps expectation status out of the inline feedback area', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  const expectationText = screen.getByText('The response uses a breaking-change marker.');
  const expectationCard = expectationText.closest('article');
  if (!expectationCard) {
    throw new Error('Expected the turn expectation to render inside an expectation card.');
  }

  expect(within(expectationCard).getByText('Baseline: FAIL')).toBeInTheDocument();
  const feedbackArea = within(expectationCard).getByLabelText('Feedback for turn 1 expectation 1').closest('div');
  if (!feedbackArea) {
    throw new Error('Expected the expectation feedback textarea to render inside a feedback area.');
  }
  expect(within(feedbackArea).queryByText(/PASS \| Baseline: FAIL/i)).not.toBeInTheDocument();
});

it('keeps passing expectation feedback collapsed until the card is toggled', async () => {
  const user = userEvent.setup();
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  const feedbackArea = feedback.closest('.inline-feedback');
  if (!feedbackArea) {
    throw new Error('Expected the expectation feedback textarea to render inside a feedback area.');
  }

  expect(feedbackArea).toHaveAttribute('aria-hidden', 'true');
  expect(feedback).toHaveAttribute('tabIndex', '-1');

  await user.click(
    screen.getByRole('button', { name: /Toggle feedback for The response uses a breaking-change marker/i })
  );

  expect(feedbackArea).toHaveAttribute('aria-hidden', 'false');
  expect(feedback).not.toHaveAttribute('tabIndex');

  await user.click(
    screen.getByRole('button', { name: /Toggle feedback for The response uses a breaking-change marker/i })
  );

  expect(feedbackArea).toHaveAttribute('aria-hidden', 'true');
  expect(feedback).toHaveAttribute('tabIndex', '-1');
});

it('opens expectation feedback by default when feedback already exists', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(
    <ExpectationsPanel
      draft={{
        ...run.feedback,
        turns: [{ expectations: [{ comment: 'Already reviewed.', expectation_id: run.expectations[0]?.id }], turn: 1 }]
      }}
      run={run}
      updateDraft={() => undefined}
    />
  );

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  expect(feedback.closest('.inline-feedback')).toHaveAttribute('aria-hidden', 'false');
  expect(feedback).toHaveValue('Already reviewed.');
});

it('opens failed expectation feedback by default', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(
    <ExpectationsPanel
      draft={{ ...run.feedback, overall: [{ comment: '' }] }}
      run={{
        ...run,
        expectations: [
          {
            evidence: 'The response missed the required footer.',
            passed: false,
            scope: 'overall',
            text: 'Requires a footer.'
          }
        ]
      }}
      updateDraft={() => undefined}
    />
  );

  expect(screen.getByLabelText('Feedback for overall expectation 1').closest('.inline-feedback')).toHaveAttribute(
    'aria-hidden',
    'false'
  );
});

it('disables baseline viewing when comparison expectations are unavailable', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }

  render(<ExpectationsPanel draft={run.feedback} run={{ ...run, comparisons: {} }} updateDraft={() => undefined} />);

  expect(screen.getByRole('button', { name: 'baseline' })).toBeDisabled();
});

it('renders failed expectation evidence and empty evidence copy', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }

  render(
    <ExpectationsPanel
      draft={{ ...run.feedback, overall: [{ comment: '' }, { comment: '' }] }}
      run={{
        ...run,
        expectations: [
          {
            evidence: 'The response missed the required footer.',
            passed: false,
            scope: 'overall',
            text: 'Requires a footer.'
          },
          {
            evidence: '',
            passed: false,
            scope: 'overall',
            text: 'Requires recorded evidence.'
          }
        ]
      }}
      updateDraft={() => undefined}
    />
  );

  expect(screen.getByText('Run Evidence')).toBeInTheDocument();
  expect(screen.getByText('The response missed the required footer.')).toBeInTheDocument();
  expect(screen.getByText('No evidence was recorded for this expectation.')).toBeInTheDocument();
});

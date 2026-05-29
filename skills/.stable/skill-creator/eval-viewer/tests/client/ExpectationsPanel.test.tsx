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

  await user.click(screen.getByRole('button', { name: /Turn 1 1\/1 expectations passed/i }));

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
        turns: [{ expectations: [{ comment: 'Already reviewed.', expectation_id: run.expectations[0]!.id }], turn: 1 }]
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
      draft={{ ...run.feedback, overall: [{ comment: '', expectation_id: 'footer-overall-expectation' }] }}
      run={{
        ...run,
        expectations: [
          {
            evidence: 'The response missed the required footer.',
            id: 'footer-overall-expectation',
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
      draft={{
        ...run.feedback,
        overall: [
          { comment: '', expectation_id: 'footer-evidence-overall-expectation' },
          { comment: '', expectation_id: 'recorded-evidence-overall-expectation' }
        ]
      }}
      run={{
        ...run,
        expectations: [
          {
            evidence: 'The response missed the required footer.',
            id: 'footer-evidence-overall-expectation',
            passed: false,
            scope: 'overall',
            text: 'Requires a footer.'
          },
          {
            evidence: '',
            id: 'recorded-evidence-overall-expectation',
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

it('starts passing turns closed and failing turns open for the loaded eval', () => {
  const run = runWithTwoTurns();

  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  expect(screen.getByRole('button', { name: /Turn 1 2\/2 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.getByRole('button', { name: /Turn 2 1\/2 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
});

it('persists turn open state while switching between skill and baseline results', async () => {
  const user = userEvent.setup();
  const run = runWithTwoTurns();

  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  const turnOne = screen.getByRole('button', { name: /Turn 1 2\/2 expectations passed/i });
  const turnTwo = screen.getByRole('button', { name: /Turn 2 1\/2 expectations passed/i });

  await user.click(turnOne);
  await user.click(turnTwo);
  await user.click(screen.getByRole('button', { name: 'baseline' }));

  expect(screen.getByRole('button', { name: /Turn 1 1\/2 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  expect(screen.getByRole('button', { name: /Turn 2 2\/2 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
});

it('reapplies default turn state when a different eval is loaded', async () => {
  const user = userEvent.setup();
  const firstRun = runWithTwoTurns();
  const secondRun = {
    ...runWithTwoTurns(),
    evalId: firstRun.evalId + 1,
    evalName: 'second-eval',
    expectations: firstRun.expectations.map((expectation) => ({ ...expectation, passed: true })),
    comparisons: {}
  };
  const { rerender } = render(
    <ExpectationsPanel draft={firstRun.feedback} run={firstRun} updateDraft={() => undefined} />
  );

  await user.click(screen.getByRole('button', { name: /Turn 1 2\/2 expectations passed/i }));
  await user.click(screen.getByRole('button', { name: /Turn 2 1\/2 expectations passed/i }));

  rerender(<ExpectationsPanel draft={secondRun.feedback} run={secondRun} updateDraft={() => undefined} />);

  expect(screen.getByRole('button', { name: /Turn 1 2\/2 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.getByRole('button', { name: /Turn 2 2\/2 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
});

it('opens a passing turn by default when one of its expectations has feedback', () => {
  const run = runWithTwoTurns();
  const draft = {
    ...run.feedback,
    turns: [
      {
        expectations: [
          { comment: 'Already reviewed.', expectation_id: 'turn-1-a' },
          { comment: '', expectation_id: 'turn-1-b' }
        ],
        turn: 1
      },
      run.feedback.turns[1]!
    ]
  };

  render(<ExpectationsPanel draft={draft} run={run} updateDraft={() => undefined} />);

  expect(screen.getByRole('button', { name: /Turn 1 2\/2 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1').closest('.inline-feedback')).toHaveAttribute(
    'aria-hidden',
    'false'
  );
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toHaveValue('Already reviewed.');
});

it('keeps a passing turn closed when no feedback entry exists for it', () => {
  const run = {
    ...runWithTwoTurns(),
    expectations: [
      turnExpectation('turn-1-a', 'The response names the breaking surface.', true, 1),
      turnExpectation('turn-2-a', 'The response keeps the body actionable.', true, 2)
    ]
  };

  render(
    <ExpectationsPanel
      draft={{
        ...run.feedback,
        turns: [
          {
            expectations: [{ comment: '', expectation_id: 'turn-1-a' }],
            turn: 1
          }
        ]
      }}
      run={run}
      updateDraft={() => undefined}
    />
  );

  expect(screen.getByRole('button', { name: /Turn 2 1\/1 expectations passed/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
});

it('allows the overall expectations section to be collapsed', async () => {
  const user = userEvent.setup();
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(
    <ExpectationsPanel
      draft={{ ...run.feedback, overall: [{ comment: '', expectation_id: 'overall-one' }] }}
      run={{
        ...run,
        expectations: [
          {
            evidence: 'The response stayed within the global constraint.',
            id: 'overall-one',
            passed: true,
            scope: 'overall',
            text: 'The response follows the global instruction.'
          }
        ]
      }}
      updateDraft={() => undefined}
    />
  );

  const heading = screen.getByRole('button', { name: /Overall Expectations 1\/1 expectations passed/i });

  expect(heading).toHaveAttribute('aria-expanded', 'true');

  await user.click(heading);

  expect(heading).toHaveAttribute('aria-expanded', 'false');
  expect(
    screen.getByLabelText('Feedback for overall expectation 1').closest('.expectation-section-body')
  ).toHaveAttribute('hidden');
});

function runWithTwoTurns() {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  return {
    ...run,
    comparisons: {
      baseline: {
        ...run.comparisons.baseline!,
        expectations: [
          turnExpectation('baseline-turn-1-a', 'The response names the breaking surface.', true, 1),
          turnExpectation('baseline-turn-1-b', 'The response names the migration path.', false, 1),
          turnExpectation('baseline-turn-2-a', 'The response keeps the body actionable.', true, 2),
          turnExpectation('baseline-turn-2-b', 'The response keeps the subject concise.', true, 2)
        ]
      }
    },
    expectations: [
      turnExpectation('turn-1-a', 'The response names the breaking surface.', true, 1),
      turnExpectation('turn-1-b', 'The response names the migration path.', true, 1),
      turnExpectation('turn-2-a', 'The response keeps the body actionable.', true, 2),
      turnExpectation('turn-2-b', 'The response keeps the subject concise.', false, 2)
    ],
    feedback: {
      ...run.feedback,
      turns: [
        {
          expectations: [
            { comment: '', expectation_id: 'turn-1-a' },
            { comment: '', expectation_id: 'turn-1-b' }
          ],
          turn: 1
        },
        {
          expectations: [
            { comment: '', expectation_id: 'turn-2-a' },
            { comment: '', expectation_id: 'turn-2-b' }
          ],
          turn: 2
        }
      ]
    }
  };
}

function turnExpectation(id: string, text: string, passed: boolean, turn: number) {
  return {
    evidence: passed ? `Observed evidence for ${text}` : `Failure evidence for ${text}`,
    id,
    passed,
    scope: 'turn' as const,
    text,
    turn
  };
}

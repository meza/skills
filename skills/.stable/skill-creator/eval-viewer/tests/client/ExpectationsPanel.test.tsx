import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { ExpectationsPanel } from '../../src/client/components/ExpectationsPanel/ExpectationsPanel.js';
import { iterationView } from './appFixture.js';

const BREAKING_CHANGE_FEEDBACK_TOGGLE_PATTERN = /Toggle feedback for The response uses a breaking-change marker/i;
const FOOTER_FEEDBACK_TOGGLE_PATTERN = /Toggle feedback for Requires a footer/i;
const OVERALL_FULL_PASS_HEADING_PATTERN = /Overall Expectations 1\/1 expectations passed/i;
const TURN_ONE_FULL_PASS_HEADING_PATTERN = /Turn 1 1\/1 expectations passed/i;
const TURN_ONE_ONE_OF_TWO_PASS_HEADING_PATTERN = /Turn 1 1\/2 expectations passed/i;
const TURN_ONE_TWO_OF_TWO_PASS_HEADING_PATTERN = /Turn 1 2\/2 expectations passed/i;
const TURN_TWO_FULL_PASS_HEADING_PATTERN = /Turn 2 1\/1 expectations passed/i;
const TURN_TWO_ONE_OF_TWO_PASS_HEADING_PATTERN = /Turn 2 1\/2 expectations passed/i;
const TURN_TWO_TWO_OF_TWO_PASS_HEADING_PATTERN = /Turn 2 2\/2 expectations passed/i;
const TURN_ONE_BREAKING_SURFACE_FEEDBACK_TOGGLE_PATTERN =
  /Toggle feedback for The response names the breaking surface/i;

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

it('shows expectation status while keeping feedback editable', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  expect(screen.getByText('The response uses a breaking-change marker.')).toBeInTheDocument();
  expect(screen.getByText('Baseline: FAIL')).toBeInTheDocument();
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();
});

it('keeps passing expectation feedback collapsed until the card is toggled', async () => {
  const user = userEvent.setup();
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the expectations fixture.');
  }
  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  await user.click(screen.getByRole('button', { name: TURN_ONE_FULL_PASS_HEADING_PATTERN }));

  const feedback = screen.getByLabelText('Feedback for turn 1 expectation 1');
  const toggle = screen.getByRole('button', {
    name: BREAKING_CHANGE_FEEDBACK_TOGGLE_PATTERN
  });

  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(feedback).toHaveAttribute('tabIndex', '-1');

  await user.click(toggle);

  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(feedback).not.toHaveAttribute('tabIndex');

  await user.click(toggle);

  expect(toggle).toHaveAttribute('aria-expanded', 'false');
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
  expect(
    screen.getByRole('button', {
      name: BREAKING_CHANGE_FEEDBACK_TOGGLE_PATTERN
    })
  ).toHaveAttribute('aria-expanded', 'true');
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

  expect(
    screen.getByRole('button', {
      name: FOOTER_FEEDBACK_TOGGLE_PATTERN
    })
  ).toHaveAttribute('aria-expanded', 'true');
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

  expect(screen.getByRole('button', { name: TURN_ONE_TWO_OF_TWO_PASS_HEADING_PATTERN })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.getByRole('button', { name: TURN_TWO_ONE_OF_TWO_PASS_HEADING_PATTERN })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
});

it('persists turn open state while switching between skill and baseline results', async () => {
  const user = userEvent.setup();
  const run = runWithTwoTurns();

  render(<ExpectationsPanel draft={run.feedback} run={run} updateDraft={() => undefined} />);

  const turnOne = screen.getByRole('button', { name: TURN_ONE_TWO_OF_TWO_PASS_HEADING_PATTERN });
  const turnTwo = screen.getByRole('button', { name: TURN_TWO_ONE_OF_TWO_PASS_HEADING_PATTERN });

  await user.click(turnOne);
  await user.click(turnTwo);
  await user.click(screen.getByRole('button', { name: 'baseline' }));

  expect(screen.getByRole('button', { name: TURN_ONE_ONE_OF_TWO_PASS_HEADING_PATTERN })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  expect(screen.getByRole('button', { name: TURN_TWO_TWO_OF_TWO_PASS_HEADING_PATTERN })).toHaveAttribute(
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

  await user.click(screen.getByRole('button', { name: TURN_ONE_TWO_OF_TWO_PASS_HEADING_PATTERN }));
  await user.click(screen.getByRole('button', { name: TURN_TWO_ONE_OF_TWO_PASS_HEADING_PATTERN }));

  rerender(<ExpectationsPanel draft={secondRun.feedback} run={secondRun} updateDraft={() => undefined} />);

  expect(screen.getByRole('button', { name: TURN_ONE_TWO_OF_TWO_PASS_HEADING_PATTERN })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.getByRole('button', { name: TURN_TWO_TWO_OF_TWO_PASS_HEADING_PATTERN })).toHaveAttribute(
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

  expect(screen.getByRole('button', { name: TURN_ONE_TWO_OF_TWO_PASS_HEADING_PATTERN })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  expect(
    screen.getByRole('button', {
      name: TURN_ONE_BREAKING_SURFACE_FEEDBACK_TOGGLE_PATTERN
    })
  ).toHaveAttribute('aria-expanded', 'true');
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

  expect(screen.getByRole('button', { name: TURN_TWO_FULL_PASS_HEADING_PATTERN })).toHaveAttribute(
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

  const heading = screen.getByRole('button', { name: OVERALL_FULL_PASS_HEADING_PATTERN });

  expect(heading).toHaveAttribute('aria-expanded', 'true');

  await user.click(heading);

  expect(heading).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByLabelText('Feedback for overall expectation 1')).toHaveAttribute('tabIndex', '-1');
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

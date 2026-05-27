import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { ExpectationSection } from '../../src/client/components/ExpectationSection.js';
import type { ExpectationView, RunFeedbackView } from '../../src/shared/viewModel.js';

const passingExpectation: ExpectationView = {
  evidence: '',
  id: 'passing-expectation',
  passed: true,
  scope: 'turn',
  text: 'The response keeps the answer concise.',
  turn: 1
};

const failingExpectation: ExpectationView = {
  evidence: 'The response exceeded the requested length.',
  id: 'failing-expectation',
  passed: false,
  scope: 'turn',
  text: 'The response stays within the requested length.',
  turn: 1
};

const draft: RunFeedbackView = {
  comments: '',
  overall: [],
  turns: [{ expectations: [{ comment: '', expectation_id: passingExpectation.id }], turn: 1 }]
};

it('renders the prototype-style section heading with pass counts', () => {
  render(
    <ExpectationSection
      allowFeedback
      comparisonExpectations={[]}
      comparisonLabel="Baseline"
      defaultOpen
      draft={draft}
      expectations={[passingExpectation]}
      label="Turn 1"
      resultLabel="Run"
      updateDraft={() => undefined}
      variant="turn"
    />
  );

  const heading = screen.getByRole('button', { name: /Turn 1 1\/1 expectations passed/i });

  expect(heading).toHaveAttribute('aria-expanded', 'true');
  expect(heading.closest('.expectation-section')).toHaveClass('pass');
  expect(within(heading).getByText('expand_more')).toBeInTheDocument();
  expect(screen.getByText('The response keeps the answer concise.')).toBeInTheDocument();
});

it('collapses and expands expectation groups from the heading', async () => {
  const user = userEvent.setup();
  render(
    <ExpectationSection
      allowFeedback
      comparisonExpectations={[]}
      comparisonLabel="Baseline"
      defaultOpen={false}
      draft={draft}
      expectations={[passingExpectation]}
      label="Turn 2"
      resultLabel="Run"
      updateDraft={() => undefined}
      variant="turn"
    />
  );

  const heading = screen.getByRole('button', { name: /Turn 2 1\/1 expectations passed/i });
  const body = document.querySelector('.expectation-section-body');

  expect(heading).toHaveAttribute('aria-expanded', 'false');
  expect(body).toHaveAttribute('hidden');
  expect(within(heading).getByText('chevron_right')).toBeInTheDocument();

  await user.click(heading);

  expect(heading).toHaveAttribute('aria-expanded', 'true');
  expect(body).not.toHaveAttribute('hidden');
  expect(screen.getByText('The response keeps the answer concise.')).toBeInTheDocument();
});

it('marks a section as failing unless every expectation passes', () => {
  render(
    <ExpectationSection
      allowFeedback
      comparisonExpectations={[]}
      comparisonLabel="Baseline"
      defaultOpen={false}
      draft={{
        comments: '',
        overall: [],
        turns: [
          {
            expectations: [
              { comment: '', expectation_id: passingExpectation.id },
              { comment: '', expectation_id: failingExpectation.id }
            ],
            turn: 1
          }
        ]
      }}
      expectations={[passingExpectation, failingExpectation]}
      label="Turn 3"
      resultLabel="Run"
      updateDraft={() => undefined}
      variant="turn"
    />
  );

  const heading = screen.getByRole('button', { name: /Turn 3 1\/2 expectations passed/i });

  expect(heading.closest('.expectation-section')).toHaveClass('fail');
});

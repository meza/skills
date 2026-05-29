import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
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
      draft={draft}
      expectations={[passingExpectation]}
      isOpen
      label="Turn 1"
      onToggle={() => undefined}
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

it('requests a section toggle from the heading', async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  render(
    <ExpectationSection
      allowFeedback
      comparisonExpectations={[]}
      comparisonLabel="Baseline"
      draft={draft}
      expectations={[passingExpectation]}
      isOpen={false}
      label="Turn 2"
      onToggle={onToggle}
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

  expect(onToggle).toHaveBeenCalledOnce();
});

it('marks a section as failing unless every expectation passes', () => {
  render(
    <ExpectationSection
      allowFeedback
      comparisonExpectations={[]}
      comparisonLabel="Baseline"
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
      isOpen={false}
      label="Turn 3"
      onToggle={() => undefined}
      resultLabel="Run"
      updateDraft={() => undefined}
      variant="turn"
    />
  );

  const heading = screen.getByRole('button', { name: /Turn 3 1\/2 expectations passed/i });

  expect(heading.closest('.expectation-section')).toHaveClass('fail');
});

it('renders overall expectations without ids', () => {
  render(
    <ExpectationSection
      allowFeedback={false}
      comparisonExpectations={[]}
      comparisonLabel="Baseline"
      draft={{ comments: '', overall: [{ comment: '' }], turns: [] }}
      expectations={[
        {
          evidence: '',
          passed: true,
          scope: 'overall',
          text: 'The run satisfies the overall requirement.'
        }
      ]}
      isOpen
      label="Overall"
      onToggle={() => undefined}
      resultLabel="Run"
      updateDraft={() => undefined}
      variant="overall"
    />
  );

  expect(screen.getByText('The run satisfies the overall requirement.')).toBeInTheDocument();
});

it('renders turn expectations without ids', () => {
  render(
    <ExpectationSection
      allowFeedback={false}
      comparisonExpectations={[]}
      comparisonLabel="Baseline"
      draft={{ comments: '', overall: [], turns: [{ expectations: [{ comment: '' }], turn: 2 }] }}
      expectations={[
        {
          evidence: '',
          passed: true,
          scope: 'turn',
          text: 'The turn satisfies its requirement.',
          turn: 2
        }
      ]}
      isOpen
      label="Turn 2"
      onToggle={() => undefined}
      resultLabel="Run"
      updateDraft={() => undefined}
      variant="turn"
    />
  );

  expect(screen.getByText('The turn satisfies its requirement.')).toBeInTheDocument();
});

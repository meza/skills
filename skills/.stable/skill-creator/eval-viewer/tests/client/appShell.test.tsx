import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { emptyIterationView, iterationView } from './appFixture.js';
import { renderApp } from './renderApp.js';

it('renders run details, comparisons, artifacts, and feedback state', () => {
  renderApp();

  expect(screen.getByRole('heading', { name: /skill evaluation/i })).toBeInTheDocument();
  expect(screen.getByText('codex / gpt-5 / high')).toBeInTheDocument();
  expect(screen.getByText('Working Directory')).toBeInTheDocument();
  expect(screen.getByText('F:/workdirs/eval-1')).toBeInTheDocument();
  expect(screen.getByText('Provider UUID')).toBeInTheDocument();
  expect(screen.getByText('019e64c2-2d87-7a21-a12c-d569bab5c067')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getByText('Pass Rate')).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
  expect(screen.getByText('vs Baseline')).toBeInTheDocument();
  expect(screen.getByText('vs Last Iteration')).toBeInTheDocument();
  expect(screen.getAllByText('+100%')).toHaveLength(2);
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();
  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
  expect(screen.getByText('Raw JSON Output')).toBeInTheDocument();
  expect(screen.getByText('View All Artifacts')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('with_skill');
  expect(document.body).not.toHaveTextContent('without_skill');
});

it('renders fallback final responses and negative comparison deltas', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.comparisons.baseline = {
    runType: 'baseline',
    durationDelta: -2,
    expectations: [],
    finalResponse: 'better baseline',
    passRateDelta: -0.5,
    tokenDelta: -100
  };
  const firstTurn = run.turns[0];
  if (!firstTurn) {
    throw new Error('Expected a turn in the first run.');
  }
  run.turns[0] = {
    ...firstTurn,
    response: ''
  };

  renderApp({ initialIteration: view });

  expect(screen.getByText('-50%')).toBeInTheDocument();
  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
});

it('renders empty runs and fallback copy', () => {
  renderApp({ initialIteration: emptyIterationView() });

  expect(screen.getByText('No evaluation runs were found.')).toBeInTheDocument();

  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.executiveSummary = '';
  const firstExpectation = run.expectations[0];
  if (!firstExpectation) {
    throw new Error('Expected an expectation in the first run.');
  }
  run.expectations[0] = {
    ...firstExpectation,
    evidence: ''
  };
  renderApp({ initialIteration: view });
  expect(screen.getByText('No executive summary was provided.')).toBeInTheDocument();
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();
});

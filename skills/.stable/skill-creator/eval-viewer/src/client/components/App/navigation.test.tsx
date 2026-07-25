import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { iterationView } from './appFixture.js';
import { renderApp } from './renderApp.js';

const ALL_FILTER_BUTTON_PATTERN = /^all$/i;
const BREAKING_CHANGE_RUN_PATTERN = /breaking-change-returns-full-message-when-needed/i;
const EVALS_NAVIGATION_PATTERN = /evals/i;
const FAIL_FILTER_BUTTON_PATTERN = /^fail$/i;
const FIRST_FAILING_VISIBLE_EVAL_PATTERN = /first-failing-visible-eval/i;
const FIRST_PASSING_EVAL_PATTERN = /first-passing-eval/i;
const PASS_FILTER_BUTTON_PATTERN = /^pass$/i;
const PASSING_EVAL_PATTERN = /passing-eval/i;
const PASSING_HIDDEN_PENDING_EVAL_PATTERN = /passing-hidden-pending-eval/i;
const PARTIAL_PASS_RATE = 0.86;
const SECOND_PASSING_EVAL_PATTERN = /second-passing-eval/i;
const THIRD_VISIBLE_EVAL_PATTERN = /third-visible-eval/i;
const USER_VISIBLE_FIX_RUN_PATTERN = /user-visible-fix-avoids-code-narration/i;

it('filters failed runs by pass rate', async () => {
  const view = iterationView();
  const failedRun = view.runs[0];
  if (!failedRun) {
    throw new Error('Expected a second run in the test fixture.');
  }
  view.runs[0] = {
    ...failedRun,
    passRate: 0
  };
  view.runs.push({
    ...failedRun,
    evalId: 2,
    evalName: 'partial-pass-rate-eval',
    passRate: 0.5
  });

  const user = userEvent.setup();
  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: FAIL_FILTER_BUTTON_PATTERN }));

  const navigation = screen.getByRole('navigation', { name: EVALS_NAVIGATION_PATTERN });
  expect(within(navigation).getByText('breaking-change-returns-full-message-when-needed')).toBeInTheDocument();
  expect(within(navigation).getByText('partial-pass-rate-eval')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('with_skill');
  expect(document.body).not.toHaveTextContent('without_skill');
  expect(screen.queryByText('Artifact Issues')).not.toBeInTheDocument();
  expect(screen.queryByText('Missing grading.json')).not.toBeInTheDocument();
});

it('filters passing runs', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.issues = [];
  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: PASS_FILTER_BUTTON_PATTERN }));

  const navigation = screen.getByRole('navigation', { name: EVALS_NAVIGATION_PATTERN });
  expect(within(navigation).getByText('breaking-change-returns-full-message-when-needed')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('with_skill');
  expect(document.body).not.toHaveTextContent('without_skill');
});

it('defaults to failed runs when the iteration has failures', () => {
  const view = iterationView();
  const firstRun = view.runs[0];
  if (!firstRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  view.runs = [
    { ...firstRun, evalId: 1, evalName: 'first-failing-eval', passRate: 0.5 },
    { ...firstRun, evalId: 2, evalName: 'passing-eval', passRate: 1 }
  ];

  renderApp({ initialIteration: view });

  expect(screen.getByRole('button', { name: FAIL_FILTER_BUTTON_PATTERN })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading', { name: 'first-failing-eval' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: PASSING_EVAL_PATTERN })).not.toBeInTheDocument();
});

it('defaults to all runs when every eval passed', () => {
  const view = iterationView();
  const firstRun = view.runs[0];
  if (!firstRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  view.runs = [
    { ...firstRun, evalId: 1, evalName: 'first-passing-eval', passRate: 1 },
    { ...firstRun, evalId: 2, evalName: 'second-passing-eval', passRate: 1 }
  ];

  renderApp({ initialIteration: view });

  expect(screen.getByRole('button', { name: ALL_FILTER_BUTTON_PATTERN })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: FIRST_PASSING_EVAL_PATTERN })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SECOND_PASSING_EVAL_PATTERN })).toBeInTheDocument();
});

it('keeps a run selected when a filter has no matching runs', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const firstRun = view.runs[0];
  if (!firstRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  view.runs = [{ ...firstRun, evalId: 1, evalName: 'first-passing-eval', passRate: 1 }];

  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: FAIL_FILTER_BUTTON_PATTERN }));

  expect(screen.getByRole('heading', { name: 'first-passing-eval' })).toBeInTheDocument();
});

it('labels partial pass-rate runs as failed in navigation', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.passRate = PARTIAL_PASS_RATE;
  renderApp({ initialIteration: view });

  const navigation = screen.getByRole('navigation', { name: EVALS_NAVIGATION_PATTERN });
  const runLink = within(navigation).getByRole('button', {
    name: BREAKING_CHANGE_RUN_PATTERN
  });
  expect(within(runLink).getByText('fail')).toBeInTheDocument();
  expect(within(runLink).queryByText('success')).not.toBeInTheDocument();
});

it('sorts eval navigation by eval id ascending', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  view.runs = [
    { ...run, evalId: 3, evalName: 'third-eval' },
    { ...run, evalId: 1, evalName: 'first-eval' },
    { ...run, evalId: 2, evalName: 'second-eval' }
  ];
  renderApp({ initialIteration: view });

  const navigation = screen.getByRole('navigation', { name: EVALS_NAVIGATION_PATTERN });
  expect(
    within(navigation)
      .getAllByRole('button')
      .map((button) => button.textContent)
  ).toEqual(['first-evalsuccess', 'second-evalsuccess', 'third-evalsuccess']);
});

it('moves through runs with the prototype pager controls', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  view.runs.push({
    ...(view.runs[0] as (typeof view.runs)[number]),
    evalId: 2,
    evalName: 'user-visible-fix-avoids-code-narration',
    finalResponse: 'fix: prevent stale sessions'
  });
  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: 'Next eval' }));

  expect(screen.getByRole('heading', { name: USER_VISIBLE_FIX_RUN_PATTERN })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Previous eval' }));

  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Next eval' }));
  await user.click(screen.getByRole('button', { name: BREAKING_CHANGE_RUN_PATTERN }));

  expect(screen.getByRole('heading', { name: BREAKING_CHANGE_RUN_PATTERN })).toBeInTheDocument();
});

it('scrolls back to the top when the selected eval changes', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  view.runs.push({
    ...(view.runs[0] as (typeof view.runs)[number]),
    evalId: 2,
    evalName: 'user-visible-fix-avoids-code-narration'
  });
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  renderApp({ autosaveDelayMs: 50_000, initialIteration: view, saveFeedback: vi.fn(async () => ({ ok: true })) });
  scrollTo.mockClear();

  await user.click(screen.getByRole('button', { name: 'Save & Next' }));

  expect(screen.getByRole('heading', { name: USER_VISIBLE_FIX_RUN_PATTERN })).toBeInTheDocument();
  expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 0 });
});

it('keeps the current eval visible while the next eval transitions in', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  view.runs.push({
    ...(view.runs[0] as (typeof view.runs)[number]),
    evalId: 2,
    evalName: 'user-visible-fix-avoids-code-narration'
  });
  renderApp({
    autosaveDelayMs: 50_000,
    evalTransitionMs: 1_000,
    initialIteration: view,
    saveFeedback: vi.fn(async () => ({ ok: true }))
  });

  await user.click(screen.getByRole('button', { name: 'Save & Next' }));

  expect(screen.getByRole('heading', { name: BREAKING_CHANGE_RUN_PATTERN })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: USER_VISIBLE_FIX_RUN_PATTERN })).toHaveAttribute('aria-pressed', 'true');
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: USER_VISIBLE_FIX_RUN_PATTERN })).toBeInTheDocument();
  });
});

it('ignores current eval selections and lets a later selection replace an active transition', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const firstRun = view.runs[0] as (typeof view.runs)[number];
  view.runs.push(
    {
      ...firstRun,
      evalId: 2,
      evalName: 'user-visible-fix-avoids-code-narration'
    },
    {
      ...firstRun,
      evalId: 3,
      evalName: 'third-visible-eval'
    }
  );
  renderApp({
    autosaveDelayMs: 50_000,
    evalTransitionMs: 25,
    initialIteration: view,
    saveFeedback: vi.fn(async () => ({ ok: true }))
  });

  await user.click(screen.getByRole('button', { name: BREAKING_CHANGE_RUN_PATTERN }));

  await user.click(screen.getByRole('button', { name: 'Save & Next' }));
  await user.click(screen.getByRole('button', { name: THIRD_VISIBLE_EVAL_PATTERN }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: THIRD_VISIBLE_EVAL_PATTERN })).toBeInTheDocument();
  });
  expect(screen.queryByRole('heading', { name: USER_VISIBLE_FIX_RUN_PATTERN })).not.toBeInTheDocument();
});

it('falls back to the visible eval when a filter hides the pending nav highlight', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const firstRun = view.runs[0] as (typeof view.runs)[number];
  view.runs = [
    { ...firstRun, evalId: 1, evalName: 'first-failing-visible-eval', passRate: 0.5 },
    { ...firstRun, evalId: 2, evalName: 'passing-hidden-pending-eval', passRate: 1 }
  ];
  renderApp({
    autosaveDelayMs: 50_000,
    evalTransitionMs: 25,
    initialIteration: view,
    saveFeedback: vi.fn(async () => ({ ok: true }))
  });

  await user.click(screen.getByRole('button', { name: ALL_FILTER_BUTTON_PATTERN }));
  await user.click(screen.getByRole('button', { name: 'Save & Next' }));
  await user.click(screen.getByRole('button', { name: FAIL_FILTER_BUTTON_PATTERN }));

  expect(screen.getByRole('button', { name: FIRST_FAILING_VISIBLE_EVAL_PATTERN })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.queryByRole('button', { name: PASSING_HIDDEN_PENDING_EVAL_PATTERN })).not.toBeInTheDocument();
});

it('keeps the current run when a pager control has no target', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.comparisons = {};
  view.runs = [view.runs[0] as (typeof view.runs)[number]];
  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: 'Next eval' }));

  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
  expect(screen.getAllByText('N/A')).toHaveLength(2);
});

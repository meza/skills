import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { iterationView } from './appFixture.js';
import { renderApp } from './renderApp.js';

it('filters failed runs by pass rate', async () => {
  const view = iterationView();
  const failedRun = view.runs[0];
  if (!failedRun) {
    throw new Error('Expected a second run in the test fixture.');
  }
  view.runs[0] = {
    ...failedRun,
    passRate: 0,
    status: 'success'
  };
  view.runs.push({
    ...failedRun,
    evalId: 2,
    evalName: 'partial-pass-rate-eval',
    passRate: 0.5,
    status: 'success'
  });

  const user = userEvent.setup();
  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: /^fail$/i }));

  const navigation = screen.getByRole('navigation', { name: /evals/i });
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

  await user.click(screen.getByRole('button', { name: /^pass$/i }));

  const navigation = screen.getByRole('navigation', { name: /evals/i });
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

  expect(screen.getByRole('button', { name: /^fail$/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading', { name: 'first-failing-eval' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /passing-eval/i })).not.toBeInTheDocument();
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

  expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /first-passing-eval/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /second-passing-eval/i })).toBeInTheDocument();
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

  await user.click(screen.getByRole('button', { name: /^fail$/i }));

  expect(screen.getByRole('heading', { name: 'first-passing-eval' })).toBeInTheDocument();
});

it('labels partial pass-rate runs as failed in navigation', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.passRate = 0.86;
  run.status = 'success';
  renderApp({ initialIteration: view });

  const navigation = screen.getByRole('navigation', { name: /evals/i });
  const runLink = within(navigation).getByRole('button', {
    name: /breaking-change-returns-full-message-when-needed/i
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

  const navigation = screen.getByRole('navigation', { name: /evals/i });
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

  await user.click(screen.getByRole('button', { name: /chevron_right/i }));

  expect(screen.getByRole('heading', { name: /user-visible-fix-avoids-code-narration/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /chevron_left/i }));

  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /chevron_right/i }));
  await user.click(screen.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }));

  expect(
    screen.getByRole('heading', { name: /breaking-change-returns-full-message-when-needed/i })
  ).toBeInTheDocument();
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

  expect(screen.getByRole('heading', { name: /user-visible-fix-avoids-code-narration/i })).toBeInTheDocument();
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
    evalTransitionMs: 20,
    initialIteration: view,
    saveFeedback: vi.fn(async () => ({ ok: true }))
  });

  await user.click(screen.getByRole('button', { name: 'Save & Next' }));

  expect(
    screen.getByRole('heading', { name: /breaking-change-returns-full-message-when-needed/i })
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /user-visible-fix-avoids-code-narration/i })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(document.querySelector('.eval-detail')).toHaveClass('eval-detail-exiting');
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /user-visible-fix-avoids-code-narration/i })).toBeInTheDocument();
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

  await user.click(screen.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }));
  expect(document.querySelector('.eval-detail')).toHaveClass('eval-detail-idle');

  await user.click(screen.getByRole('button', { name: 'Save & Next' }));
  await user.click(screen.getByRole('button', { name: /third-visible-eval/i }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /third-visible-eval/i })).toBeInTheDocument();
  });
  expect(screen.queryByRole('heading', { name: /user-visible-fix-avoids-code-narration/i })).not.toBeInTheDocument();
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

  await user.click(screen.getByRole('button', { name: /^all$/i }));
  await user.click(screen.getByRole('button', { name: 'Save & Next' }));
  await user.click(screen.getByRole('button', { name: /^fail$/i }));

  expect(screen.getByRole('button', { name: /first-failing-visible-eval/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: /passing-hidden-pending-eval/i })).not.toBeInTheDocument();
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

  await user.click(screen.getByRole('button', { name: /chevron_right/i }));

  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
  expect(screen.getAllByText('N/A')).toHaveLength(2);
});

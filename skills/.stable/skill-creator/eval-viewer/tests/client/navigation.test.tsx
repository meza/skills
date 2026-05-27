import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { iterationView } from './appFixture.js';
import { renderApp } from './renderApp.js';

it('filters failed runs and shows artifact errors clearly', async () => {
  const view = iterationView();
  const failedRun = view.runs[0];
  if (!failedRun) {
    throw new Error('Expected a second run in the test fixture.');
  }
  view.runs[0] = {
    ...failedRun,
    issues: [
      {
        artifact: 'grading.json',
        message: 'Missing grading.json',
        severity: 'error',
        state: 'missing_grading'
      }
    ],
    passRate: 0,
    status: 'artifact_error'
  };
  view.runs.push({
    ...failedRun,
    evalId: 2,
    evalName: 'artifact-error-with-passing-grades',
    issues: [
      {
        artifact: 'raw_output.jsonl',
        message: 'Missing raw_output.jsonl',
        severity: 'error',
        state: 'missing_raw_output'
      }
    ],
    passRate: 1,
    status: 'artifact_error'
  });

  const user = userEvent.setup();
  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: /^fail$/i }));

  const navigation = screen.getByRole('navigation', { name: /runs/i });
  expect(within(navigation).getByText('breaking-change-returns-full-message-when-needed')).toBeInTheDocument();
  expect(within(navigation).getByText('artifact-error-with-passing-grades')).toBeInTheDocument();
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
  run.issues = [
    {
      artifact: 'timing.json',
      message: 'Timing was incomplete',
      severity: 'warning',
      state: 'missing_timing'
    }
  ];
  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: /^pass$/i }));

  const navigation = screen.getByRole('navigation', { name: /runs/i });
  expect(within(navigation).getByText('breaking-change-returns-full-message-when-needed')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('with_skill');
  expect(document.body).not.toHaveTextContent('without_skill');
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

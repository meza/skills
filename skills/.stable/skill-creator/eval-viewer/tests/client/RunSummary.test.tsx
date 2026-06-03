import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { RunSummary } from '../../src/client/components/RunSummary/RunSummary.js';
import { iterationView } from './appFixture.js';

it('renders eval identity, summary copy, metrics, and pager state', async () => {
  const user = userEvent.setup();
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the summary fixture.');
  }
  const summary = iterationView().summary;
  const selectRunAt = vi.fn();

  render(
    <RunSummary
      isRefreshingIterations={false}
      iterationStatus=''
      iterationSummary={summary}
      onIterationRefreshAfterSavingFeedback={async () => undefined}
      onIterationSelectAfterSavingFeedback={async () => undefined}
      reviewRunCount={2}
      run={run}
      selectedIndex={0}
      selectRunAt={selectRunAt}
    />
  );

  expect(screen.getByText('Eval ID: 1')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: run.evalName })).toBeInTheDocument();
  expect(screen.getByText('The run satisfies the eval.')).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
  expect(screen.getAllByText('+100%')).toHaveLength(2);

  expect(screen.getByRole('button', { name: 'Previous eval' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next eval' }));
  expect(selectRunAt).toHaveBeenCalledWith(1);
});

it('renders fallback summary and disables the final pager control', () => {
  const run = iterationView().runs[0];
  const summary = iterationView().summary;
  if (!run) {
    throw new Error('Expected a run for the summary fixture.');
  }

  render(
    <RunSummary
      isRefreshingIterations={false}
      iterationStatus=''
      iterationSummary={summary}
      onIterationRefreshAfterSavingFeedback={async () => undefined}
      onIterationSelectAfterSavingFeedback={async () => undefined}
      reviewRunCount={2}
      run={{ ...run, executiveSummary: '' }}
      selectedIndex={1}
      selectRunAt={vi.fn()}
    />
  );

  expect(screen.getByText('No executive summary was provided.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next eval' })).toBeDisabled();
});

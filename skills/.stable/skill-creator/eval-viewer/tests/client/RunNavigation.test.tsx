import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { RunNavigation } from '../../src/client/components/RunNavigation.js';
import { RunFilter } from '../../src/client/runFilters.js';
import { iterationView } from './appFixture.js';

const ALL_FILTER_BUTTON_PATTERN = /^all$/i;
const BREAKING_CHANGE_RUN_PATTERN = /breaking-change-returns-full-message-when-needed/i;
const FAIL_FILTER_BUTTON_PATTERN = /^fail$/i;
const PARTIAL_EVAL_RUN_PATTERN = /partial-eval/i;

it('renders filters, eval links, review statuses, and selection state', async () => {
  const user = userEvent.setup();
  const selectedRun = iterationView().runs[0];
  if (!selectedRun) {
    throw new Error('Expected a run for the navigation fixture.');
  }
  const failedRun = { ...selectedRun, evalId: 2, evalName: 'partial-eval', passRate: 0.75 };
  const onFilterChange = vi.fn();
  const onRunSelect = vi.fn();

  render(
    <RunNavigation
      filter={RunFilter.AllRuns}
      onFilterChange={onFilterChange}
      onRunSelect={onRunSelect}
      runs={[selectedRun, failedRun]}
      selectedRun={selectedRun}
    />
  );

  expect(screen.getByText('Platform')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: ALL_FILTER_BUTTON_PATTERN })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('navigation', { name: 'Evals' })).toBeInTheDocument();

  const selectedLink = screen.getByRole('button', { name: BREAKING_CHANGE_RUN_PATTERN });
  expect(selectedLink).toHaveAttribute('aria-pressed', 'true');
  expect(within(selectedLink).getByText('success')).toBeInTheDocument();

  const failedLink = screen.getByRole('button', { name: PARTIAL_EVAL_RUN_PATTERN });
  expect(within(failedLink).getByText('fail')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: FAIL_FILTER_BUTTON_PATTERN }));
  expect(onFilterChange).toHaveBeenCalledWith(RunFilter.FailingRuns);

  await user.click(failedLink);
  expect(onRunSelect).toHaveBeenCalledWith(failedRun);
});

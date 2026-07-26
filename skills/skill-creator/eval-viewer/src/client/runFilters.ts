import type { RunView } from '../shared/viewModel.js';

export enum RunFilter {
  AllRuns = 'all_runs',
  PassingRuns = 'passing_runs',
  FailingRuns = 'failing_runs'
}

export enum RunReviewStatus {
  SuccessfulRun = 'successful_run',
  FailedRun = 'failed_run'
}

export const REVIEW_FILTERS: RunFilter[] = [RunFilter.AllRuns, RunFilter.PassingRuns, RunFilter.FailingRuns];

const FILTER_ICONS: Record<RunFilter, string> = {
  [RunFilter.AllRuns]: 'list',
  [RunFilter.PassingRuns]: 'check_circle',
  [RunFilter.FailingRuns]: 'error'
};

const FILTER_LABELS: Record<RunFilter, string> = {
  [RunFilter.AllRuns]: 'all',
  [RunFilter.PassingRuns]: 'pass',
  [RunFilter.FailingRuns]: 'fail'
};

const FILTER_CLASS_NAMES: Record<RunFilter, string> = {
  [RunFilter.AllRuns]: 'filter-all',
  [RunFilter.PassingRuns]: 'filter-pass',
  [RunFilter.FailingRuns]: 'filter-fail'
};

const REVIEW_STATUS_LABELS: Record<RunReviewStatus, string> = {
  [RunReviewStatus.SuccessfulRun]: 'success',
  [RunReviewStatus.FailedRun]: 'fail'
};

const REVIEW_STATUS_CLASS_NAMES: Record<RunReviewStatus, string> = {
  [RunReviewStatus.SuccessfulRun]: 'pass',
  [RunReviewStatus.FailedRun]: 'fail'
};

export function filterIcon(filter: RunFilter): string {
  return FILTER_ICONS[filter];
}

export function filterLabel(filter: RunFilter): string {
  return FILTER_LABELS[filter];
}

export function filterClassName(filter: RunFilter): string {
  return FILTER_CLASS_NAMES[filter];
}

export function isFailingRun(run: RunView): boolean {
  return run.passRate < 1;
}

export function isPassingRun(run: RunView): boolean {
  return run.passRate === 1;
}

export function reviewStatusForRun(run: RunView): RunReviewStatus {
  return isPassingRun(run) ? RunReviewStatus.SuccessfulRun : RunReviewStatus.FailedRun;
}

export function reviewStatusLabel(status: RunReviewStatus): string {
  return REVIEW_STATUS_LABELS[status];
}

export function reviewStatusClassName(status: RunReviewStatus): string {
  return REVIEW_STATUS_CLASS_NAMES[status];
}

export function defaultReviewFilter(runs: RunView[]): RunFilter {
  return runs.some(isFailingRun) ? RunFilter.FailingRuns : RunFilter.AllRuns;
}

export function visibleReviewRuns(runs: RunView[], filter: RunFilter): RunView[] {
  if (filter === RunFilter.PassingRuns) {
    return runs.filter(isPassingRun);
  }
  if (filter === RunFilter.FailingRuns) {
    return runs.filter(isFailingRun);
  }
  return runs;
}

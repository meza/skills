import type { RunView } from '../shared/viewModel.js';

export type RunFilter = 'all' | 'pass' | 'fail';

export function filterIcon(filter: RunFilter): string {
  if (filter === 'pass') {
    return 'check_circle';
  }
  if (filter === 'fail') {
    return 'error';
  }
  return 'list';
}

export function isFailingRun(run: RunView): boolean {
  return run.passRate < 1;
}

export function isPassingRun(run: RunView): boolean {
  return run.passRate === 1;
}

export function reviewStatusLabel(run: RunView): 'fail' | 'success' {
  return run.passRate === 1 ? 'success' : 'fail';
}

export function defaultReviewFilter(runs: RunView[]): RunFilter {
  return runs.some(isFailingRun) ? 'fail' : 'all';
}

export function visibleReviewRuns(runs: RunView[], filter: RunFilter): RunView[] {
  if (filter === 'pass') {
    return runs.filter(isPassingRun);
  }
  if (filter === 'fail') {
    return runs.filter(isFailingRun);
  }
  return runs;
}

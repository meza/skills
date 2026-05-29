import type { IterationNumber } from '../shared/viewModel.js';

export function artifactHref(path: string | undefined, iterationNumber: IterationNumber): string {
  return path ? `/api/artifacts?iteration=${iterationNumber}&path=${encodeURIComponent(path)}` : '#';
}

export function displayWorkingDirectory(path: string): string {
  return path.replace(/[\\/](?:skill|baseline)(?=[\\/]|$)/gu, '');
}

export function formatDeltaPercent(value: number | undefined): string {
  if (value === undefined) {
    return 'N/A';
  }
  const percent = Math.round(value * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

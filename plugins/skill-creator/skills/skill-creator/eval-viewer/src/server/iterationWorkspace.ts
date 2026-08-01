import type { Dirent } from 'node:fs';
import type { IterationNumber } from '../shared/viewModel.js';
import { basename, dirname, join } from 'node:path';

const ITERATION_DIRECTORY_PATTERN = /^iteration-\d+$/;

/**
 * Owns the filesystem layout rule for evaluation workspace iterations.
 *
 * The viewer serves a workspace root containing `results/iteration-N` directories.
 * Callers should use this module instead of rebuilding that convention locally.
 */
export function resultsRootPath(workspaceRoot: string): string {
  return join(workspaceRoot, 'results');
}

/** Returns the root directory for one numbered iteration inside a workspace. */
export function iterationRootPath(workspaceRoot: string, iterationNumber: IterationNumber): string {
  return join(resultsRootPath(workspaceRoot), iterationDirectoryName(iterationNumber));
}

/** Returns the immediately previous numbered sibling iteration for an iteration root. */
export function previousIterationRootPath(iterationRoot: string): string {
  return join(dirname(iterationRoot), iterationDirectoryName(iterationNumberFromRoot(iterationRoot) - 1));
}

/** Returns the manifest path used to determine whether an iteration can be reviewed. */
export function iterationManifestPath(iterationRoot: string): string {
  return join(iterationRoot, 'run_manifest.json');
}

/** Formats an iteration number as the canonical `iteration-N` directory name. */
export function iterationDirectoryName(iterationNumber: IterationNumber): string {
  return `iteration-${iterationNumber}`;
}

/** Parses the iteration number from an iteration root path. */
export function iterationNumberFromRoot(iterationRoot: string): IterationNumber {
  return iterationNumberFromDirectoryName(basename(iterationRoot));
}

/** Parses a canonical `iteration-N` directory name or throws for non-iteration names. */
export function iterationNumberFromDirectoryName(directoryName: string): IterationNumber {
  if (!ITERATION_DIRECTORY_PATTERN.test(directoryName)) {
    throw new Error(`Invalid iteration directory name: ${directoryName}`);
  }
  return Number(directoryName.replace('iteration-', ''));
}

/** Filters directory entries down to canonical iteration directories. */
export function validIterationDirectoryEntries(entries: Dirent[]): Dirent[] {
  return entries.filter((entry) => entry.isDirectory() && ITERATION_DIRECTORY_PATTERN.test(entry.name));
}

/** Labels watched directories so notifier diagnostics can distinguish workspace roots from iteration roots. */
export function iterationDirectoryKind(directory: string, workspaceRoot: string): 'results' | 'iteration' {
  return directory === resultsRootPath(workspaceRoot) ? 'results' : 'iteration';
}

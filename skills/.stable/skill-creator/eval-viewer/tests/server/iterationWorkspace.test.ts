import { Dirent } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  iterationDirectoryKind,
  iterationDirectoryName,
  iterationManifestPath,
  iterationNumberFromDirectoryName,
  iterationNumberFromRoot,
  iterationRootPath,
  previousIterationRootPath,
  resultsRootPath,
  validIterationDirectoryEntries
} from '../../src/server/iterationWorkspace.js';

const SELECTED_ITERATION = 3;
const MULTI_DIGIT_ITERATION = 12;
const ROOT_PATH_ITERATION = 4;

describe('iteration workspace paths', () => {
  it('builds workspace result and iteration artifact paths from one layout rule', () => {
    const workspaceRoot = join('/memory', 'workspace');
    const iterationRoot = iterationRootPath(workspaceRoot, SELECTED_ITERATION);

    expect(resultsRootPath(workspaceRoot)).toBe(join(workspaceRoot, 'results'));
    expect(iterationDirectoryName(SELECTED_ITERATION)).toBe('iteration-3');
    expect(iterationRoot).toBe(join(workspaceRoot, 'results', 'iteration-3'));
    expect(iterationManifestPath(iterationRoot)).toBe(join(iterationRoot, 'run_manifest.json'));
    expect(previousIterationRootPath(iterationRoot)).toBe(join(workspaceRoot, 'results', 'iteration-2'));
  });

  it('parses only valid iteration directory names', () => {
    expect(iterationNumberFromDirectoryName('iteration-12')).toBe(MULTI_DIGIT_ITERATION);
    expect(iterationNumberFromRoot(join('/memory', 'workspace', 'results', 'iteration-4'))).toBe(ROOT_PATH_ITERATION);
    expect(() => iterationNumberFromDirectoryName('draft')).toThrow(/Invalid iteration directory name/);
  });

  it('filters directory entries through the shared iteration directory convention', () => {
    const entries = [
      dirent('iteration-1', true),
      dirent('iteration-x', true),
      dirent('iteration-2', false),
      dirent('notes', true)
    ];

    expect(validIterationDirectoryEntries(entries).map((entry) => entry.name)).toEqual(['iteration-1']);
  });

  it('classifies watched workspace directories without inspecting path suffixes', () => {
    const workspaceRoot = join('/memory', 'workspace');

    expect(iterationDirectoryKind(join(workspaceRoot, 'results'), workspaceRoot)).toBe('results');
    expect(iterationDirectoryKind(join(workspaceRoot, 'results', 'iteration-1'), workspaceRoot)).toBe('iteration');
  });
});

function dirent(name: string, isDirectory: boolean): Dirent {
  return {
    isDirectory: () => isDirectory,
    name
  } as Dirent;
}

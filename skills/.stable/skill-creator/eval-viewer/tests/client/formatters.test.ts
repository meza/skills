import { expect, it } from 'vitest';
import { runKey } from '../../src/client/feedbackDraft.js';
import { artifactHref } from '../../src/client/formatters.js';
import { CURRENT_ITERATION } from './appFixture.js';

it('formats missing artifact links as inert links', () => {
  expect(artifactHref(undefined, CURRENT_ITERATION)).toBe('#');
});

it('formats a missing run key as empty text', () => {
  expect(runKey(undefined)).toBe('');
});

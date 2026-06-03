import { expect, it } from 'vitest';
import { CURRENT_ITERATION } from './components/App/appFixture.js';
import { runKey } from './feedbackDraft.js';
import { artifactHref } from './formatters.js';

it('formats missing artifact links as inert links', () => {
  expect(artifactHref(undefined, CURRENT_ITERATION)).toBe('#');
});

it('formats a missing run key as empty text', () => {
  expect(runKey(undefined)).toBe('');
});

import type { ExpectationView, RunFeedbackView } from '../shared/viewModel.js';
import { expect, it } from 'vitest';
import { expectationComment } from './feedbackDraft.js';

it('uses an empty comment when an overall feedback draft entry is missing', () => {
  const expectation: ExpectationView = {
    evidence: '',
    id: 'overall-expectation',
    passed: true,
    scope: 'overall',
    text: 'Overall expectation'
  };
  const draft: RunFeedbackView = {
    comments: '',
    overall: [],
    turns: []
  };

  expect(expectationComment(draft, expectation, [expectation], 0)).toBe('');
});

import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import {
  iterationView,
  OVERALL_EXPECTATION_ONE_ID,
  OVERALL_EXPECTATION_TWO_ID,
  TURN_EXPECTATION_ID,
  TURN_ONE_SECOND_EXPECTATION_ID,
  TURN_TWO_EXPECTATION_ID
} from './appFixture.js';
import { renderApp } from './renderApp.js';

it('records reviewer feedback with expectation ids', async () => {
  const user = userEvent.setup();
  const saveFeedback = vi.fn(async () => ({
    comments: 'Ready for the next iteration.'
  }));
  renderApp({ saveFeedback });

  await user.type(screen.getByLabelText('Review comments'), 'Ready for the next iteration.');
  await user.type(screen.getByLabelText('Feedback for turn 1 expectation 1'), 'Expectation-level note.');
  await user.click(screen.getByRole('button', { name: /submit review & finalize/i }));

  expect(saveFeedback).toHaveBeenCalledWith({
    comments: 'Ready for the next iteration.',
    evalId: 1,
    overall: [],
    turns: [
      {
        expectations: [{ comment: 'Expectation-level note.', expectation_id: TURN_EXPECTATION_ID }],
        turn: 1
      }
    ]
  });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
});

it('records overall expectation feedback by grading order', async () => {
  const user = userEvent.setup();
  const saveFeedback = vi.fn(async () => ({ ok: true }));
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.expectations = [
    {
      evidence: 'The answer starts with feat!:',
      id: OVERALL_EXPECTATION_ONE_ID,
      passed: true,
      scope: 'overall',
      text: 'The response uses a breaking-change marker.'
    },
    {
      evidence: 'The answer explains the migration.',
      id: OVERALL_EXPECTATION_TWO_ID,
      passed: true,
      scope: 'overall',
      text: 'The response explains the breaking-change impact.'
    }
  ];
  run.feedback = {
    comments: '',
    overall: [
      { comment: '', expectation_id: OVERALL_EXPECTATION_ONE_ID },
      { comment: '', expectation_id: OVERALL_EXPECTATION_TWO_ID }
    ],
    turns: []
  };
  renderApp({ initialIteration: view, saveFeedback });

  await user.type(screen.getByLabelText('Feedback for overall expectation 2'), 'Overall expectation note.');
  await user.click(screen.getByRole('button', { name: /submit review & finalize/i }));

  expect(saveFeedback).toHaveBeenCalledWith({
    comments: '',
    evalId: 1,
    overall: [
      { comment: '', expectation_id: OVERALL_EXPECTATION_ONE_ID },
      { comment: 'Overall expectation note.', expectation_id: OVERALL_EXPECTATION_TWO_ID }
    ],
    turns: []
  });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
});

it('keeps turn expectation feedback aligned across turn and expectation positions', async () => {
  const user = userEvent.setup();
  const saveFeedback = vi.fn(async () => ({ ok: true }));
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.expectations = [
    {
      evidence: '',
      id: TURN_EXPECTATION_ID,
      passed: true,
      scope: 'turn',
      text: 'First turn expectation.',
      turn: 1
    },
    {
      evidence: '',
      id: TURN_ONE_SECOND_EXPECTATION_ID,
      passed: true,
      scope: 'turn',
      text: 'Second turn expectation.',
      turn: 1
    },
    {
      evidence: '',
      id: TURN_TWO_EXPECTATION_ID,
      passed: true,
      scope: 'turn',
      text: 'Third turn expectation.',
      turn: 2
    }
  ];
  run.feedback = {
    comments: '',
    overall: [],
    turns: []
  };
  renderApp({ initialIteration: view, saveFeedback });

  await user.type(screen.getByLabelText('Feedback for turn 1 expectation 2'), 'Second expectation note.');
  await user.type(screen.getByLabelText('Feedback for turn 2 expectation 1'), 'Later turn note.');
  await user.click(screen.getByRole('button', { name: /submit review & finalize/i }));

  expect(saveFeedback).toHaveBeenCalledWith({
    comments: '',
    evalId: 1,
    overall: [],
    turns: [
      {
        expectations: [
          { comment: '', expectation_id: TURN_EXPECTATION_ID },
          { comment: 'Second expectation note.', expectation_id: TURN_ONE_SECOND_EXPECTATION_ID }
        ],
        turn: 1
      },
      { expectations: [{ comment: 'Later turn note.', expectation_id: TURN_TWO_EXPECTATION_ID }], turn: 2 }
    ]
  });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
});

it('persists feedback through the default server API and reports failures', async () => {
  const user = userEvent.setup();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    .mockResolvedValueOnce(new Response('', { status: 500 }));
  vi.stubGlobal('fetch', fetcher);

  renderApp();

  await user.click(screen.getByRole('button', { name: /submit review & finalize/i }));

  expect(fetcher).toHaveBeenCalledWith('/api/feedback/1', {
    body: JSON.stringify({
      comments: '',
      overall: [],
      turns: [{ expectations: [{ comment: '', expectation_id: TURN_EXPECTATION_ID }], turn: 1 }]
    }),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'PUT'
  });
  expect(await screen.findByText('Saved')).toBeInTheDocument();

  await user.type(screen.getByLabelText('Review comments'), 'Needs another pass.');
  await user.click(screen.getByRole('button', { name: /submit review & finalize/i }));

  expect(await screen.findByText('Could not save feedback.')).toBeInTheDocument();
  vi.unstubAllGlobals();
});

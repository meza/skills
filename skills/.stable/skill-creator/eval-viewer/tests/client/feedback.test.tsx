import { fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import {
  CURRENT_ITERATION,
  iterationView,
  OLDER_ITERATION,
  OVERALL_EXPECTATION_ONE_ID,
  OVERALL_EXPECTATION_TWO_ID,
  TURN_EXPECTATION_ID,
  TURN_ONE_SECOND_EXPECTATION_ID,
  TURN_TWO_EXPECTATION_ID
} from './appFixture.js';
import { renderApp } from './renderApp.js';

const ALL_FILTER_BUTTON_PATTERN = /^all$/i;
const COMPLETE_FEEDBACK_BUTTON_PATTERN = /complete feedback for iteration/i;
const FAIL_FILTER_BUTTON_PATTERN = /^fail$/i;
const TURN_TWO_FULL_PASS_HEADING_PATTERN = /Turn 2 1\/1 expectations passed/i;

it('autosaves reviewer feedback with expectation ids', async () => {
  const saveFeedback = vi.fn(async () => ({
    comments: 'Ready for the next iteration.'
  }));
  renderApp({ autosaveDelayMs: 0, saveFeedback });

  fireEvent.change(screen.getByLabelText('Review comments'), {
    target: { value: 'Ready for the next iteration.' }
  });
  await waitFor(() => {
    expect(saveFeedback).toHaveBeenLastCalledWith(
      {
        comments: 'Ready for the next iteration.',
        evalId: 1,
        overall: [],
        turns: [{ expectations: [{ comment: '', expectation_id: TURN_EXPECTATION_ID }], turn: 1 }]
      },
      CURRENT_ITERATION
    );
  });
  fireEvent.change(screen.getByLabelText('Feedback for turn 1 expectation 1'), {
    target: { value: 'Expectation-level note.' }
  });

  await waitFor(() => {
    expect(saveFeedback).toHaveBeenLastCalledWith(
      {
        comments: 'Ready for the next iteration.',
        evalId: 1,
        overall: [],
        turns: [
          {
            expectations: [{ comment: 'Expectation-level note.', expectation_id: TURN_EXPECTATION_ID }],
            turn: 1
          }
        ]
      },
      CURRENT_ITERATION
    );
  });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
});

it('cancels pending autosaves when the app unmounts', () => {
  vi.useFakeTimers();
  const saveFeedback = vi.fn(async () => ({ ok: true }));
  const { unmount } = renderApp({ autosaveDelayMs: 50_000, saveFeedback });

  fireEvent.change(screen.getByLabelText('Review comments'), {
    target: { value: 'Draft that should not save after unmount.' }
  });
  unmount();
  vi.runOnlyPendingTimers();

  expect(saveFeedback).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('saves the latest draft after an in-flight autosave finishes', async () => {
  const user = userEvent.setup();
  let finishAutosave: (value: unknown) => void = () => undefined;
  const autosave = new Promise((resolve) => {
    finishAutosave = resolve;
  });
  const saveFeedback = vi.fn().mockReturnValueOnce(autosave).mockResolvedValue({ ok: true });
  renderApp({ autosaveDelayMs: 0, saveFeedback });

  fireEvent.change(screen.getByLabelText('Review comments'), {
    target: { value: 'Autosaved draft.' }
  });
  await waitFor(() => {
    expect(saveFeedback).toHaveBeenCalledTimes(1);
  });

  fireEvent.change(screen.getByLabelText('Review comments'), {
    target: { value: 'Manual draft.' }
  });
  await user.click(screen.getByRole('button', { name: COMPLETE_FEEDBACK_BUTTON_PATTERN }));
  expect(saveFeedback).toHaveBeenCalledTimes(1);

  finishAutosave({ ok: true });

  await waitFor(() => {
    expect(saveFeedback).toHaveBeenLastCalledWith(
      {
        comments: 'Manual draft.',
        evalId: 1,
        overall: [],
        turns: [{ expectations: [{ comment: '', expectation_id: TURN_EXPECTATION_ID }], turn: 1 }]
      },
      CURRENT_ITERATION
    );
  });
});

it('records overall expectation feedback by grading order', async () => {
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
  renderApp({ autosaveDelayMs: 0, initialIteration: view, saveFeedback });

  fireEvent.change(screen.getByLabelText('Feedback for overall expectation 2'), {
    target: { value: 'Overall expectation note.' }
  });

  await waitFor(() => {
    expect(saveFeedback).toHaveBeenLastCalledWith(
      {
        comments: '',
        evalId: 1,
        overall: [
          { comment: '', expectation_id: OVERALL_EXPECTATION_ONE_ID },
          { comment: 'Overall expectation note.', expectation_id: OVERALL_EXPECTATION_TWO_ID }
        ],
        turns: []
      },
      CURRENT_ITERATION
    );
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
  renderApp({ autosaveDelayMs: 0, initialIteration: view, saveFeedback });

  fireEvent.change(screen.getByLabelText('Feedback for turn 1 expectation 2'), {
    target: { value: 'Second expectation note.' }
  });
  await user.click(screen.getByRole('button', { name: TURN_TWO_FULL_PASS_HEADING_PATTERN }));
  fireEvent.change(screen.getByLabelText('Feedback for turn 2 expectation 1'), {
    target: { value: 'Later turn note.' }
  });

  await waitFor(() => {
    expect(saveFeedback).toHaveBeenLastCalledWith(
      {
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
      },
      CURRENT_ITERATION
    );
  });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
});

it('saves before advancing through the visible eval queue', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const firstRun = view.runs[0];
  if (!firstRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  view.runs.push({ ...firstRun, evalId: 2, evalName: 'second-visible-eval', passRate: 0.5 });
  const saveFeedback = vi.fn(async () => ({ ok: true }));
  renderApp({ autosaveDelayMs: 50_000, initialIteration: view, saveFeedback });

  await user.click(screen.getByRole('button', { name: ALL_FILTER_BUTTON_PATTERN }));
  fireEvent.change(screen.getByLabelText('Review comments'), {
    target: { value: 'Move through the queue.' }
  });
  await user.click(screen.getByRole('button', { name: 'Save & Next' }));

  expect(saveFeedback).toHaveBeenCalledWith(
    {
      comments: 'Move through the queue.',
      evalId: 1,
      overall: [],
      turns: [{ expectations: [{ comment: '', expectation_id: TURN_EXPECTATION_ID }], turn: 1 }]
    },
    CURRENT_ITERATION
  );
  expect(screen.getByRole('heading', { name: 'second-visible-eval' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Complete feedback for iteration' })).toBeInTheDocument();
});

it('moves to the previous visible eval after saving current feedback', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const firstRun = view.runs[0];
  if (!firstRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  view.runs.push({ ...firstRun, evalId: 2, evalName: 'second-visible-eval', passRate: 0.5 });
  const saveFeedback = vi.fn(async () => ({ ok: true }));
  renderApp({ autosaveDelayMs: 50_000, initialIteration: view, saveFeedback });

  await user.click(screen.getByRole('button', { name: ALL_FILTER_BUTTON_PATTERN }));
  await user.click(screen.getByRole('button', { name: 'Save & Next' }));
  fireEvent.change(screen.getByLabelText('Review comments'), {
    target: { value: 'Back-check this eval.' }
  });
  await user.click(screen.getByRole('button', { name: 'Previous' }));

  expect(saveFeedback).toHaveBeenLastCalledWith(
    {
      comments: 'Back-check this eval.',
      evalId: 2,
      overall: [],
      turns: [{ expectations: [{ comment: '', expectation_id: TURN_EXPECTATION_ID }], turn: 1 }]
    },
    CURRENT_ITERATION
  );
  expect(screen.getByRole('heading', { name: 'breaking-change-returns-full-message-when-needed' })).toBeInTheDocument();
});

it('saves feedback to the active selected iteration', async () => {
  const user = userEvent.setup();
  const selectedIteration = iterationView();
  selectedIteration.summary = {
    ...selectedIteration.summary,
    isLatest: false,
    iteration: OLDER_ITERATION
  };
  const loadIteration = vi.fn(async () => selectedIteration);
  const saveFeedback = vi.fn(async () => ({ ok: true }));
  renderApp({ autosaveDelayMs: 0, loadIteration, saveFeedback });

  await user.selectOptions(screen.getByLabelText('Iteration'), '3');
  fireEvent.change(screen.getByLabelText('Review comments'), {
    target: { value: 'Feedback for selected iteration.' }
  });

  await waitFor(() => {
    expect(saveFeedback).toHaveBeenLastCalledWith(
      {
        comments: 'Feedback for selected iteration.',
        evalId: 1,
        overall: [],
        turns: [{ expectations: [{ comment: '', expectation_id: TURN_EXPECTATION_ID }], turn: 1 }]
      },
      OLDER_ITERATION
    );
  });
});

it('uses the filtered nav visibility as the next queue', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const firstRun = view.runs[0];
  if (!firstRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  view.runs = [
    { ...firstRun, evalId: 1, evalName: 'first-failing-visible-eval', passRate: 0.5 },
    { ...firstRun, evalId: 2, evalName: 'passing-hidden-eval', passRate: 1 },
    { ...firstRun, evalId: 3, evalName: 'second-failing-visible-eval', passRate: 0.25 }
  ];
  renderApp({ autosaveDelayMs: 50_000, initialIteration: view, saveFeedback: vi.fn(async () => ({ ok: true })) });

  await user.click(screen.getByRole('button', { name: FAIL_FILTER_BUTTON_PATTERN }));
  await user.click(screen.getByRole('button', { name: 'Save & Next' }));

  expect(screen.getByRole('heading', { name: 'second-failing-visible-eval' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'passing-hidden-eval' })).not.toBeInTheDocument();
});

it('stays on the current eval when the save before navigation fails', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const firstRun = view.runs[0];
  if (!firstRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  view.runs.push({ ...firstRun, evalId: 2, evalName: 'second-visible-eval' });
  renderApp({
    autosaveDelayMs: 50_000,
    initialIteration: view,
    saveFeedback: vi.fn(() => Promise.reject(new Error('write failed')))
  });

  await user.click(screen.getByRole('button', { name: 'Save & Next' }));

  expect(screen.getByRole('heading', { name: 'breaking-change-returns-full-message-when-needed' })).toBeInTheDocument();
  expect(await screen.findByText('write failed')).toBeInTheDocument();
});

it('shows the default save error when the thrown value has no message', async () => {
  const user = userEvent.setup();
  renderApp({
    autosaveDelayMs: 50_000,
    saveFeedback: vi.fn(() => Promise.reject(''))
  });

  await user.click(screen.getByRole('button', { name: COMPLETE_FEEDBACK_BUTTON_PATTERN }));

  expect(await screen.findByText('Could not save feedback.')).toBeInTheDocument();
});

it('persists feedback through the default server API and reports failures', async () => {
  const user = userEvent.setup();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Invalid viewer_feedback.json' }), { status: 500 }));
  vi.stubGlobal('fetch', fetcher);

  renderApp({ autosaveDelayMs: 50_000 });

  await user.click(screen.getByRole('button', { name: COMPLETE_FEEDBACK_BUTTON_PATTERN }));

  expect(fetcher).toHaveBeenCalledWith('/api/feedback/1?iteration=4', {
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

  fireEvent.change(screen.getByLabelText('Review comments'), { target: { value: 'Needs another pass.' } });
  await user.click(screen.getByRole('button', { name: COMPLETE_FEEDBACK_BUTTON_PATTERN }));

  expect(
    await screen.findByText(
      'Could not save feedback: 500 from /api/feedback/1?iteration=4. Invalid viewer_feedback.json'
    )
  ).toBeInTheDocument();
  vi.unstubAllGlobals();
});

import type { IterationIndexView } from '../../src/shared/viewModel.js';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { iterationView } from './appFixture.js';
import { renderApp } from './renderApp.js';

function createFakeIterationEventSource() {
  const source = {
    close: vi.fn(),
    emit(index: IterationIndexView) {
      source.onmessage?.({ data: JSON.stringify(index) } as MessageEvent<string>);
    },
    onmessage: null as ((event: MessageEvent<string>) => void) | null
  };
  return source;
}

it('renders run details, comparisons, artifacts, and feedback state', () => {
  renderApp();

  expect(screen.getByRole('heading', { name: /skill evaluation/i })).toBeInTheDocument();
  expect(screen.getByText('codex / gpt-5 / high')).toBeInTheDocument();
  expect(screen.getByText('Working Directory')).toBeInTheDocument();
  expect(screen.getByText('F:/workdirs/eval-1')).toBeInTheDocument();
  expect(screen.getByText('Provider UUID')).toBeInTheDocument();
  expect(screen.getByText('019e64c2-2d87-7a21-a12c-d569bab5c067')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getByText('Pass Rate')).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
  expect(screen.getByText('vs Baseline')).toBeInTheDocument();
  expect(screen.getByText('vs Last Iteration')).toBeInTheDocument();
  expect(screen.getByLabelText('Iteration')).toHaveValue('4');
  expect(screen.getByRole('button', { name: /check for newer iteration/i })).toBeInTheDocument();
  expect(screen.getAllByText('+100%')).toHaveLength(2);
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();
  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
  expect(screen.getByText('Raw JSON Output')).toBeInTheDocument();
  expect(screen.getByText('View All Artifacts')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('with_skill');
  expect(document.body).not.toHaveTextContent('without_skill');
});

it('loads a selected older iteration from the iteration dropdown', async () => {
  const user = userEvent.setup();
  const saveFeedback = vi.fn(async () => ({ ok: true }));
  const olderIteration = iterationView();
  olderIteration.summary = {
    ...olderIteration.summary,
    isLatest: false,
    iteration: 3
  };
  const run = olderIteration.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.executiveSummary = 'Older iteration summary.';
  const loadIteration = vi.fn(async () => olderIteration);

  renderApp({ loadIteration, saveFeedback });

  await user.selectOptions(screen.getByLabelText('Iteration'), '3');

  await waitFor(() => {
    expect(screen.getByText('Older iteration summary.')).toBeInTheDocument();
  });
  expect(loadIteration).toHaveBeenCalledWith(3);
});

it('reports when a selected iteration fails to load', async () => {
  const user = userEvent.setup();
  const loadIteration = vi.fn(async () => {
    throw new Error('Could not load iteration 3.');
  });
  const saveFeedback = vi.fn(async () => ({ ok: true }));

  renderApp({ loadIteration, saveFeedback });

  await user.selectOptions(screen.getByLabelText('Iteration'), '3');

  expect(await screen.findByText('Could not load iteration 3.')).toBeInTheDocument();
  expect(screen.getByLabelText('Iteration')).toHaveValue('4');
});

it('lists iterations with the latest first', () => {
  renderApp();

  expect(screen.getByLabelText('Iteration')).toHaveValue('4');
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    'Latest: 4',
    'Iteration 3',
    'Iteration 2',
    'Iteration 1'
  ]);
});

it('saves feedback against the active iteration after switching iterations', async () => {
  const user = userEvent.setup();
  const olderIteration = iterationView();
  olderIteration.summary = {
    ...olderIteration.summary,
    isLatest: false,
    iteration: 3
  };
  const loadIteration = vi.fn(async () => olderIteration);
  const saveFeedback = vi.fn(async () => ({ ok: true }));

  renderApp({ loadIteration, saveFeedback });

  await user.selectOptions(screen.getByLabelText('Iteration'), '3');
  await waitFor(() => {
    expect(loadIteration).toHaveBeenCalledWith(3);
  });
  await user.type(screen.getByLabelText('Review comments'), 'Reviewed older iteration.');
  await user.click(screen.getByRole('button', { name: 'Complete feedback for iteration' }));

  await waitFor(() => {
    expect(saveFeedback).toHaveBeenLastCalledWith(expect.any(Object), 3);
  });
});

it('does not carry unsaved feedback drafts across iterations', async () => {
  const user = userEvent.setup();
  const olderIteration = iterationView();
  olderIteration.summary = {
    ...olderIteration.summary,
    isLatest: false,
    iteration: 3
  };
  const run = olderIteration.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.feedback = {
    ...run.feedback,
    comments: 'Existing iteration 3 feedback.'
  };
  const loadIteration = vi.fn(async () => olderIteration);
  const saveFeedback = vi.fn(async () => ({ ok: true }));

  renderApp({ loadIteration, saveFeedback });

  await user.type(screen.getByLabelText('Review comments'), 'Draft for iteration 4.');
  await user.selectOptions(screen.getByLabelText('Iteration'), '3');

  await waitFor(() => {
    expect(screen.getByLabelText('Review comments')).toHaveValue('Existing iteration 3 feedback.');
  });
});

it('refreshes to a newer latest iteration when one exists', async () => {
  const user = userEvent.setup();
  const saveFeedback = vi.fn(async () => ({ ok: true }));
  const newerIteration = iterationView();
  newerIteration.summary = {
    ...newerIteration.summary,
    availableIterations: [1, 2, 3, 4, 5],
    iteration: 5,
    latestIteration: 5
  };
  const run = newerIteration.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.executiveSummary = 'Newer iteration summary.';
  const loadIteration = vi.fn(async () => newerIteration);
  const loadIterationIndex = vi.fn(async () => ({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 }));

  renderApp({ loadIteration, loadIterationIndex, saveFeedback });

  await user.click(screen.getByRole('button', { name: /check for newer iteration/i }));

  await waitFor(() => {
    expect(screen.getByText('Newer iteration summary.')).toBeInTheDocument();
  });
  expect(loadIteration).toHaveBeenCalledWith(5);
});

it('reports when refresh finds a newer iteration that fails to load', async () => {
  const user = userEvent.setup();
  const loadIteration = vi.fn(async () => {
    throw new Error('Could not load latest iteration.');
  });
  const loadIterationIndex = vi.fn(async () => ({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 }));
  const saveFeedback = vi.fn(async () => ({ ok: true }));

  renderApp({ loadIteration, loadIterationIndex, saveFeedback });

  await user.click(screen.getByRole('button', { name: /check for newer iteration/i }));

  expect(await screen.findByText('Could not load latest iteration.')).toBeInTheDocument();
  expect(loadIteration).toHaveBeenCalledWith(5);
  expect(screen.getByLabelText('Iteration')).toHaveValue('4');
});

it('does not reload an iteration when selecting the already active iteration', async () => {
  const user = userEvent.setup();
  const loadIteration = vi.fn(async () => iterationView());
  const saveFeedback = vi.fn(async () => ({ ok: true }));

  renderApp({ loadIteration, saveFeedback });

  await user.selectOptions(screen.getByLabelText('Iteration'), '4');

  expect(loadIteration).not.toHaveBeenCalled();
  expect(saveFeedback).not.toHaveBeenCalled();
});

it('does not reload a selected iteration when saving the active run fails', async () => {
  const user = userEvent.setup();
  const loadIteration = vi.fn(async () => iterationView());
  const saveFeedback = vi.fn(async () => {
    throw new Error('write failed');
  });

  renderApp({ loadIteration, saveFeedback });

  await user.selectOptions(screen.getByLabelText('Iteration'), '3');

  await screen.findByText('write failed');
  expect(loadIteration).not.toHaveBeenCalled();
});

it('falls back to the lowest eval id when the selected eval is absent from the loaded iteration', async () => {
  const user = userEvent.setup();
  const loadedIteration = iterationView();
  const firstRun = loadedIteration.runs[0];
  if (!firstRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  loadedIteration.runs = [
    { ...firstRun, evalId: 3, evalName: 'higher-fallback-run' },
    { ...firstRun, evalId: 2, evalName: 'lowest-fallback-run' }
  ];
  loadedIteration.summary = {
    ...loadedIteration.summary,
    isLatest: false,
    iteration: 3
  };
  const loadIteration = vi.fn(async () => loadedIteration);
  const saveFeedback = vi.fn(async () => ({ ok: true }));

  renderApp({ loadIteration, saveFeedback });

  await user.selectOptions(screen.getByLabelText('Iteration'), '3');

  expect(await screen.findByRole('heading', { name: 'lowest-fallback-run' })).toBeInTheDocument();
});

it('does not refresh to a newer iteration when saving the active run fails', async () => {
  const user = userEvent.setup();
  const loadIteration = vi.fn(async () => iterationView());
  const loadIterationIndex = vi.fn(async () => ({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 }));
  const saveFeedback = vi.fn(async () => {
    throw new Error('write failed');
  });

  renderApp({ loadIteration, loadIterationIndex, saveFeedback });

  await user.click(screen.getByRole('button', { name: /check for newer iteration/i }));

  await screen.findByText('write failed');
  expect(loadIteration).not.toHaveBeenCalled();
});

it('reports when refresh finds no newer iteration', async () => {
  vi.useFakeTimers();

  renderApp({
    loadIterationIndex: vi.fn(async () => ({ iterations: [1, 2, 3, 4], latestIteration: 4 }))
  });

  fireEvent.click(screen.getByRole('button', { name: /check for newer iteration/i }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(screen.getByRole('status')).toHaveTextContent('No newer iteration found');
  await act(async () => {
    vi.advanceTimersByTime(3_200);
  });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  vi.useRealTimers();
});

it('prompts when the iteration event stream detects a newer iteration', () => {
  const source = createFakeIterationEventSource();

  renderApp({ createIterationEventSource: () => source });

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 });
  });

  expect(screen.getByRole('dialog', { name: 'New iteration available' })).toBeInTheDocument();
  expect(screen.getByText('Current')).toBeInTheDocument();
  expect(screen.getByText('Iteration 4')).toBeInTheDocument();
  expect(screen.getByText('Latest')).toBeInTheDocument();
  expect(screen.getByText('Iteration 5')).toBeInTheDocument();
});

it('keeps keyboard focus inside the new iteration prompt', async () => {
  const user = userEvent.setup();
  const source = createFakeIterationEventSource();

  renderApp({ createIterationEventSource: () => source });

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 });
  });

  const dialog = screen.getByRole('dialog', {
    description: 'Iteration 5 is ready. You are viewing iteration 4.',
    name: 'New iteration available'
  });
  const keepCurrent = screen.getByRole('button', { name: 'Keep current' });
  const viewLatest = screen.getByRole('button', { name: 'View latest' });

  expect(dialog).toBeInTheDocument();
  await waitFor(() => {
    expect(viewLatest).toHaveFocus();
  });

  await user.keyboard('{Shift>}{Tab}{/Shift}');
  expect(keepCurrent).toHaveFocus();

  await user.keyboard('{Shift>}{Tab}{/Shift}');
  expect(viewLatest).toHaveFocus();

  await user.keyboard('{Tab}');
  expect(keepCurrent).toHaveFocus();
});

it('dismisses the new iteration prompt from the keyboard', async () => {
  const user = userEvent.setup();
  const source = createFakeIterationEventSource();

  renderApp({ createIterationEventSource: () => source });

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 });
  });

  expect(screen.getByRole('dialog', { name: 'New iteration available' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'View latest' })).toHaveFocus();
  });

  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog', { name: 'New iteration available' })).not.toBeInTheDocument();
});

it('does not reopen a dismissed new iteration prompt for the same latest iteration', () => {
  const source = createFakeIterationEventSource();

  renderApp({ createIterationEventSource: () => source });

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Keep current' }));
  expect(screen.queryByRole('dialog', { name: 'New iteration available' })).not.toBeInTheDocument();

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 });
  });

  expect(screen.queryByRole('dialog', { name: 'New iteration available' })).not.toBeInTheDocument();
});

it('loads the latest iteration from the new iteration prompt', async () => {
  const source = createFakeIterationEventSource();
  const newerIteration = iterationView();
  newerIteration.summary = {
    ...newerIteration.summary,
    availableIterations: [1, 2, 3, 4, 5],
    iteration: 5,
    latestIteration: 5
  };
  const run = newerIteration.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.executiveSummary = 'Loaded from prompt.';
  const loadIteration = vi.fn(async () => newerIteration);
  const saveFeedback = vi.fn(async () => ({ ok: true }));

  renderApp({ createIterationEventSource: () => source, loadIteration, saveFeedback });

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 });
  });
  fireEvent.click(screen.getByRole('button', { name: 'View latest' }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(screen.getByText('Loaded from prompt.')).toBeInTheDocument();
  expect(loadIteration).toHaveBeenCalledWith(5);
});

it('keeps the new iteration prompt open when the latest iteration fails to load', async () => {
  const source = createFakeIterationEventSource();
  const loadIteration = vi.fn(async () => {
    throw new Error('Could not load prompted iteration.');
  });
  const saveFeedback = vi.fn(async () => ({ ok: true }));

  renderApp({ createIterationEventSource: () => source, loadIteration, saveFeedback });

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 });
  });
  fireEvent.click(screen.getByRole('button', { name: 'View latest' }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(screen.getByRole('dialog', { name: 'New iteration available' })).toBeInTheDocument();
  expect(screen.getByText('Could not load prompted iteration.')).toBeInTheDocument();
});

it('does not prompt when the iteration event stream reports no newer iteration', () => {
  const source = createFakeIterationEventSource();

  renderApp({ createIterationEventSource: () => source });

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4], latestIteration: 4 });
  });

  expect(screen.queryByRole('dialog', { name: 'New iteration available' })).not.toBeInTheDocument();
});

it('keeps the new iteration prompt open when saving before load fails', async () => {
  const source = createFakeIterationEventSource();
  const loadIteration = vi.fn(async () => iterationView());
  const saveFeedback = vi.fn(async () => {
    throw new Error('write failed');
  });

  renderApp({ createIterationEventSource: () => source, loadIteration, saveFeedback });

  act(() => {
    source.emit({ iterations: [1, 2, 3, 4, 5], latestIteration: 5 });
  });
  fireEvent.click(screen.getByRole('button', { name: 'View latest' }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(screen.getByRole('dialog', { name: 'New iteration available' })).toBeInTheDocument();
  expect(loadIteration).not.toHaveBeenCalled();
});

it('renders fallback final responses and negative comparison deltas', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.comparisons.baseline = {
    runType: 'baseline',
    durationDelta: -2,
    expectations: [],
    finalResponse: 'better baseline',
    passRateDelta: -0.5,
    tokenDelta: -100
  };
  const firstTurn = run.turns[0];
  if (!firstTurn) {
    throw new Error('Expected a turn in the first run.');
  }
  run.turns[0] = {
    ...firstTurn,
    response: ''
  };

  renderApp({ initialIteration: view });

  expect(screen.getByText('-50%')).toBeInTheDocument();
  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
});

it('renders fallback copy for missing run content', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.executiveSummary = '';
  const firstExpectation = run.expectations[0];
  if (!firstExpectation) {
    throw new Error('Expected an expectation in the first run.');
  }
  run.expectations[0] = {
    ...firstExpectation,
    evidence: ''
  };
  renderApp({ initialIteration: view });
  expect(screen.getByText('No executive summary was provided.')).toBeInTheDocument();
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();
});

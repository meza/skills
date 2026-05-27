import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App.js';
import type { IterationView } from '../../src/shared/viewModel.js';

const TURN_EXPECTATION_ID = '54a2c16d-1372-54bb-b939-547ebe82bf1e';
const OVERALL_EXPECTATION_ONE_ID = '10a375c5-12f4-5a15-b5bd-951f7d6204f1';
const OVERALL_EXPECTATION_TWO_ID = '6fcfb2db-03d1-5bd4-971e-8a10929a7de3';
const TURN_ONE_SECOND_EXPECTATION_ID = 'dc47174d-62a8-5820-bcb8-3a5cae2a10cb';
const TURN_TWO_EXPECTATION_ID = '38a7ce2c-0814-5e8b-8890-bc073e225d75';

describe('App', () => {
  it('renders run details, comparisons, artifacts, and feedback state', () => {
    render(<App initialIteration={iterationView()} />);

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
    expect(screen.getAllByText('+100%')).toHaveLength(2);
    expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();
    expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
    expect(screen.getByText('Raw JSON Output')).toBeInTheDocument();
    expect(screen.getByText('View All Artifacts')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('with_skill');
    expect(document.body).not.toHaveTextContent('without_skill');
  });

  it('switches the expectations breakdown between skill and baseline results', async () => {
    const user = userEvent.setup();
    render(<App initialIteration={iterationView()} />);

    expect(screen.getByRole('button', { name: 'skill' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1/1 requirements passed')).toBeInTheDocument();
    expect(screen.getAllByText(/PASS/)[0]).toHaveTextContent('Baseline: FAIL');
    expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'baseline' }));

    expect(screen.getByRole('button', { name: 'baseline' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('0/1 requirements passed')).toBeInTheDocument();
    expect(screen.getAllByText(/FAIL/)[0]).toHaveTextContent('Skill: PASS');
    expect(screen.getByText('Baseline Evidence')).toBeInTheDocument();
    expect(screen.getByText('The answer uses fix: and omits the breaking-change impact.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Feedback for turn 1 expectation 1')).not.toBeInTheDocument();
  });

  it('disables baseline expectation viewing when no baseline grading exists', () => {
    const view = iterationView();
    const run = view.runs[0];
    if (!run) {
      throw new Error('Expected a first run in the test fixture.');
    }
    run.comparisons = {};

    render(<App initialIteration={view} />);

    expect(screen.getByRole('button', { name: 'skill' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'baseline' })).toBeDisabled();
  });

  it('filters failed runs and shows artifact errors clearly', async () => {
    const view = iterationView();
    const failedRun = view.runs[0];
    if (!failedRun) {
      throw new Error('Expected a second run in the test fixture.');
    }
    view.runs[0] = {
      ...failedRun,
      issues: [
        {
          artifact: 'grading.json',
          message: 'Missing grading.json',
          severity: 'error',
          state: 'missing_grading'
        }
      ],
      passRate: 0,
      status: 'artifact_error'
    };
    view.runs.push({
      ...failedRun,
      evalId: 2,
      evalName: 'artifact-error-with-passing-grades',
      issues: [
        {
          artifact: 'raw_output.jsonl',
          message: 'Missing raw_output.jsonl',
          severity: 'error',
          state: 'missing_raw_output'
        }
      ],
      passRate: 1,
      status: 'artifact_error'
    });

    const user = userEvent.setup();
    render(<App initialIteration={view} />);

    await user.click(screen.getByRole('button', { name: /^fail$/i }));

    const navigation = screen.getByRole('navigation', { name: /runs/i });
    expect(within(navigation).getByText('breaking-change-returns-full-message-when-needed')).toBeInTheDocument();
    expect(within(navigation).getByText('artifact-error-with-passing-grades')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('with_skill');
    expect(document.body).not.toHaveTextContent('without_skill');
    expect(screen.queryByText('Artifact Issues')).not.toBeInTheDocument();
    expect(screen.queryByText('Missing grading.json')).not.toBeInTheDocument();
  });

  it('filters passing runs', async () => {
    const user = userEvent.setup();
    const view = iterationView();
    const run = view.runs[0];
    if (!run) {
      throw new Error('Expected a first run in the test fixture.');
    }
    run.issues = [
      {
        artifact: 'timing.json',
        message: 'Timing was incomplete',
        severity: 'warning',
        state: 'missing_timing'
      }
    ];
    render(<App initialIteration={view} />);

    await user.click(screen.getByRole('button', { name: /^pass$/i }));

    const navigation = screen.getByRole('navigation', { name: /runs/i });
    expect(within(navigation).getByText('breaking-change-returns-full-message-when-needed')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('with_skill');
    expect(document.body).not.toHaveTextContent('without_skill');
  });

  it('moves through runs with the prototype pager controls', async () => {
    const user = userEvent.setup();
    const view = iterationView();
    view.runs.push({
      ...(view.runs[0] as (typeof view.runs)[number]),
      evalId: 2,
      evalName: 'user-visible-fix-avoids-code-narration',
      finalResponse: 'fix: prevent stale sessions'
    });
    render(<App initialIteration={view} />);

    await user.click(screen.getByRole('button', { name: /chevron_right/i }));

    expect(screen.getByRole('heading', { name: /user-visible-fix-avoids-code-narration/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /chevron_left/i }));

    expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /chevron_right/i }));
    await user.click(screen.getByRole('button', { name: /breaking-change-returns-full-message-when-needed/i }));

    expect(
      screen.getByRole('heading', { name: /breaking-change-returns-full-message-when-needed/i })
    ).toBeInTheDocument();
  });

  it('keeps the current run when a pager control has no target', async () => {
    const user = userEvent.setup();
    const view = iterationView();
    const run = view.runs[0];
    if (!run) {
      throw new Error('Expected a first run in the test fixture.');
    }
    run.comparisons = {};
    view.runs = [view.runs[0] as (typeof view.runs)[number]];
    render(<App initialIteration={view} />);

    await user.click(screen.getByRole('button', { name: /chevron_right/i }));

    expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
    expect(screen.getAllByText('N/A')).toHaveLength(2);
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

    render(<App initialIteration={view} />);

    expect(screen.getByText('-50%')).toBeInTheDocument();
    expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
  });

  it('renders failed expectations and missing final responses', () => {
    const view = iterationView();
    const failedRun = view.runs[0];
    if (!failedRun) {
      throw new Error('Expected a first run in the test fixture.');
    }
    failedRun.expectations = [
      {
        evidence: 'The answer uses fix: and omits the breaking-change impact.',
        passed: false,
        scope: 'overall',
        text: 'Uses a breaking-change commit message when required'
      }
    ];
    failedRun.comparisons.baseline = {
      runType: 'baseline',
      durationDelta: 0,
      expectations: [
        {
          evidence: 'Baseline also missed the breaking-change impact.',
          passed: false,
          scope: 'overall',
          text: 'Uses a breaking-change commit message when required'
        }
      ],
      finalResponse: '',
      passRateDelta: 0,
      tokenDelta: 0
    };
    failedRun.finalResponse = '';
    failedRun.turns = [];

    render(<App initialIteration={view} />);

    expect(screen.getAllByText(/FAIL/).length).toBeGreaterThan(0);
    expect(screen.getByText('Baseline Evidence')).toBeInTheDocument();
    expect(screen.getByText('No response artifact was available.')).toBeInTheDocument();
  });

  it('shows explicit missing evidence copy for failed expectations', () => {
    const view = iterationView();
    const run = view.runs[0];
    if (!run) {
      throw new Error('Expected a first run in the test fixture.');
    }
    run.expectations = [
      {
        evidence: '',
        passed: false,
        scope: 'overall',
        text: 'Requires evidence to explain failure.'
      }
    ];

    render(<App initialIteration={view} />);

    expect(screen.getByText('No evidence was recorded for this expectation.')).toBeInTheDocument();
  });

  it('omits empty baseline evidence while keeping skill evidence', () => {
    const view = iterationView();
    const run = view.runs[0];
    if (!run) {
      throw new Error('Expected a first run in the test fixture.');
    }
    run.expectations = [
      {
        evidence: 'The response missed the required breaking-change footer.',
        passed: false,
        scope: 'overall',
        text: 'Requires the breaking-change footer.'
      }
    ];
    run.comparisons.baseline = {
      runType: 'baseline',
      durationDelta: 0,
      expectations: [],
      finalResponse: '',
      passRateDelta: 0,
      tokenDelta: 0
    };

    render(<App initialIteration={view} />);

    expect(screen.getByText('Run Evidence')).toBeInTheDocument();
    expect(screen.getByText('The response missed the required breaking-change footer.')).toBeInTheDocument();
    expect(screen.queryByText('Baseline Evidence')).not.toBeInTheDocument();
  });

  it('records reviewer feedback with expectation ids', async () => {
    const user = userEvent.setup();
    const saveFeedback = vi.fn(async () => ({
      comments: 'Ready for the next iteration.'
    }));
    render(<App initialIteration={iterationView()} saveFeedback={saveFeedback} />);

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
    render(<App initialIteration={view} saveFeedback={saveFeedback} />);

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
    render(<App initialIteration={view} saveFeedback={saveFeedback} />);

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

    render(<App initialIteration={iterationView()} />);

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

  it('renders empty runs and fallback copy', () => {
    render(
      <App
        initialIteration={{
          feedbackPath: 'viewer_feedback.json',
          runs: [],
          summary: {
            effort: 'default',
            iteration: 1,
            model: 'default',
            provider: 'codex',
            runCount: 0,
            skillName: 'empty-skill'
          }
        }}
      />
    );

    expect(screen.getByText('No evaluation runs were found.')).toBeInTheDocument();

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
    render(<App initialIteration={view} />);
    expect(screen.getByText('No executive summary was provided.')).toBeInTheDocument();
    expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();
  });
});

function iterationView(): IterationView {
  return {
    feedbackPath: 'F:/runs/viewer_feedback.json',
    runs: [
      {
        artifactPaths: {
          grading: 'F:/runs/eval-1/skill/grading.json',
          rawOutput: 'F:/runs/eval-1/skill/raw_output.jsonl',
          response: 'F:/runs/eval-1/skill/turn-1/outputs/response.md',
          runArtifacts: 'F:/runs/eval-1/skill/run_artifacts.json',
          timing: 'F:/runs/eval-1/skill/timing.json',
          transcript: 'F:/runs/eval-1/skill/turn-1/outputs/transcript.md'
        },
        comparisons: {
          previousIteration: {
            runType: 'skill',
            durationDelta: -6,
            expectations: [],
            finalResponse: 'chore: update auth config',
            passRateDelta: 1,
            tokenDelta: -200
          },
          baseline: {
            runType: 'baseline',
            durationDelta: 6,
            expectations: [
              {
                evidence: 'The answer uses fix: and omits the breaking-change impact.',
                id: '5e5bdcd1-eae8-5eed-aff2-2a3f3c262ebc',
                passed: false,
                scope: 'turn',
                text: 'The response uses a breaking-change marker.',
                turn: 1
              }
            ],
            finalResponse: 'fix: update auth signing',
            passRateDelta: 1,
            tokenDelta: 300
          }
        },
        runType: 'skill',
        durationSeconds: 24,
        evalId: 1,
        evalName: 'breaking-change-returns-full-message-when-needed',
        executiveSummary: 'The run satisfies the eval.',
        expectations: [
          {
            evidence: 'The answer starts with feat!:',
            id: TURN_EXPECTATION_ID,
            passed: true,
            scope: 'turn',
            text: 'The response uses a breaking-change marker.',
            turn: 1
          }
        ],
        finalResponse: 'feat!: support signing key rotation',
        feedback: {
          comments: '',
          overall: [],
          turns: [{ expectations: [{ comment: '', expectation_id: TURN_EXPECTATION_ID }], turn: 1 }]
        },
        issues: [],
        passRate: 1,
        providerSessionId: '019e64c2-2d87-7a21-a12c-d569bab5c067',
        status: 'success',
        tokenCount: 1200,
        turns: [
          {
            expectations: [
              {
                evidence: 'The answer starts with feat!:',
                id: TURN_EXPECTATION_ID,
                passed: true,
                scope: 'turn',
                text: 'The response uses a breaking-change marker.',
                turn: 1
              }
            ],
            prompt: 'Generate a commit message for the staged changes.',
            response: 'feat!: support signing key rotation',
            transcript: 'USER: Generate a commit message'
          }
        ],
        workingDirectory: 'F:/workdirs/eval-1/skill'
      },
      {
        artifactPaths: {
          grading: 'F:/runs/eval-1/baseline/grading.json',
          rawOutput: 'F:/runs/eval-1/baseline/raw_output.jsonl',
          response: 'F:/runs/eval-1/baseline/turn-1/outputs/response.md',
          runArtifacts: 'F:/runs/eval-1/baseline/run_artifacts.json',
          timing: 'F:/runs/eval-1/baseline/timing.json',
          transcript: 'F:/runs/eval-1/baseline/turn-1/outputs/transcript.md'
        },
        comparisons: {},
        runType: 'baseline',
        durationSeconds: 18,
        evalId: 1,
        evalName: 'breaking-change-returns-full-message-when-needed',
        executiveSummary: 'The run misses the main requirement.',
        expectations: [],
        finalResponse: 'fix: update auth signing',
        feedback: {
          comments: '',
          overall: [],
          turns: []
        },
        issues: [],
        passRate: 0,
        providerSessionId: '019e64c2-2d2f-7ff2-a16c-9359a2b2304c',
        status: 'success',
        tokenCount: 900,
        turns: [],
        userComments: '',
        workingDirectory: 'F:/workdirs/eval-1/baseline'
      }
    ],
    summary: {
      effort: 'high',
      iteration: 1,
      model: 'gpt-5',
      provider: 'codex',
      runCount: 2,
      skillName: 'conventional-commit-message'
    }
  };
}

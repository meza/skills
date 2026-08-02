import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { writeRichEvaluationWorkspace } from '../../tests/fixtures/richEvaluation.js';
import {
  SAMPLE_SKILL_EXPECTATION_ID,
  writeSampleIteration,
  writeSampleWorkspaceWithHistory
} from '../../tests/fixtures/sampleIteration.js';
import { fs, vol } from '../../tests/support/memfs.js';
import { validateArtifactSchema } from './artifactSchemas.js';
import { loadIteration, loadIterationIndex, saveFeedback } from './iterationRepository.js';

vi.mock('./artifactSchemas.js', async () => await import('../../tests/support/fakeArtifactSchemas.js'));

let root: string;
let iterationRoot: string;
const AGGREGATED_RESULTS_ERROR_PATTERN = /Invalid aggregated_results\.json/;
const DIRECT_ITERATION_ROOT_ERROR_PATTERN = /must contain results\/iteration-N artifacts/i;
const HALF_PASS_RATE = 0.5;
const GRADING_ERROR_PATTERN = /Invalid grading\.json/;
const ITERATION_ONE_MISSING_ERROR_PATTERN = /iteration-1 does not exist/;
const ITERATION_TWO_MISSING_ERROR_PATTERN = /iteration-2 does not exist/;
const ITERATION_NINE_MISSING_ERROR_PATTERN = /iteration-9 does not exist/;
const MISSING_RUN_ARTIFACTS_ERROR_PATTERN =
  /Missing (grading\.json|raw_output\.jsonl|timing\.json|response\.md|transcript\.md)/;
const MISSING_SCHEMA_ERROR_PATTERN = /Unknown artifact schema/;
const NO_REVIEWABLE_ITERATIONS_ERROR_PATTERN = /no reviewable results\/iteration-N artifacts/;
const NOT_A_DIRECTORY_ERROR_PATTERN = /not a directory/i;
const RESULTS_ARTIFACTS_ERROR_PATTERN = /results\/iteration-N artifacts/;
const RESULTS_PATH_NOT_DIRECTORY_ERROR_PATTERN = /results path is not a directory/i;
const RICH_SKILL_EXPECTATION_COUNT = 6;
const RUN_ARTIFACTS_ERROR_PATTERN = /Invalid run_artifacts\.json/;
const RUN_MANIFEST_ERROR_PATTERN = /Invalid run_manifest\.json/i;
const TIMING_ERROR_PATTERN = /Invalid timing\.json/;
const VIEWER_FEEDBACK_ERROR_PATTERN = /Invalid viewer_feedback\.json/;

beforeEach(async () => {
  vol.reset();
  root = join('/memory', 'current');
  iterationRoot = await writeSampleWorkspaceWithHistory(root);
});

it('loads an iteration from explicit evaluator artifacts with comparison data', async () => {
  const iteration = await loadIteration(root);

  expect(iteration.summary).toMatchObject({
    skillName: 'conventional-commit-message',
    provider: 'codex',
    model: 'gpt-5',
    effort: 'high',
    iteration: 1
  });
  expect(iteration.runs).toHaveLength(2);
  expect(iteration.runs[0]).toMatchObject({
    evalId: 1,
    evalName: 'breaking-change-returns-full-message-when-needed',
    runType: 'skill',
    passRate: 1,
    providerSessionId: '019e64c2-2d87-7a21-a12c-d569bab5c067',
    tokenCount: 1200,
    durationSeconds: 24,
    workingDirectory: join(iterationRoot, 'eval-1', 'skill', 'work')
  });
  expect(iteration.runs[0]?.artifactPaths.runArtifacts).toBe(
    join(iterationRoot, 'eval-1', 'skill', 'run_artifacts.json')
  );
  expect(iteration.runs[0]?.comparisons.baseline).toMatchObject({
    runType: 'baseline',
    passRateDelta: 1,
    tokenDelta: 300,
    durationDelta: 6
  });
  expect(iteration.runs[0]?.comparisons.previousIteration).toMatchObject({
    passRateDelta: 1,
    tokenDelta: -200,
    durationDelta: -6
  });
});

it('rejects direct iteration roots', async () => {
  await expect(loadIteration(iterationRoot)).rejects.toThrow(DIRECT_ITERATION_ROOT_ERROR_PATTERN);
});

it('uses iteration directory numbers instead of manifest iteration values when selecting latest', async () => {
  const workspaceRoot = join(root, 'workspace');
  const olderDirectoryNumber = 1;
  const latestDirectoryNumber = 3;
  const mismatchedOlderManifestIteration = 3;
  const mismatchedLatestManifestIteration = 5;
  await writeSampleIteration(join(workspaceRoot, 'results', `iteration-${olderDirectoryNumber}`), {
    iteration: mismatchedOlderManifestIteration
  });
  await writeSampleIteration(join(workspaceRoot, 'results', `iteration-${latestDirectoryNumber}`), {
    iteration: mismatchedLatestManifestIteration
  });

  const iteration = await loadIteration(workspaceRoot);

  expect(iteration.summary).toMatchObject({
    availableIterations: [olderDirectoryNumber, latestDirectoryNumber],
    isLatest: true,
    iteration: latestDirectoryNumber,
    latestIteration: latestDirectoryNumber
  });
  expect(iteration.summary.iteration).not.toBe(mismatchedLatestManifestIteration);
  expect(iteration.runs[0]?.artifactPaths.grading).toContain(`iteration-${latestDirectoryNumber}`);
});

it('loads a requested iteration from an evaluation workspace root', async () => {
  const workspaceRoot = join(root, 'selected-workspace');
  await writeSampleIteration(join(workspaceRoot, 'results', 'iteration-1'), { iteration: 1 });
  await writeSampleIteration(join(workspaceRoot, 'results', 'iteration-3'), { iteration: 3 });

  const iteration = await loadIteration(workspaceRoot, { iteration: 1 });

  expect(iteration.summary).toMatchObject({
    isLatest: false,
    iteration: 1,
    latestIteration: 3
  });
  expect(iteration.runs[0]?.artifactPaths.grading).toContain('iteration-1');
});

it('excludes a failed latest iteration and loads the previous reviewable iteration', async () => {
  const failedIterationRoot = join(root, 'results', 'iteration-2');
  await writeSampleIteration(failedIterationRoot, { iteration: 2 });
  const manifestPath = join(failedIterationRoot, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs[0].execution_status = 'grading_error';
  manifest.runs[0].error = 'grader returned invalid output';
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  await fs.promises.rm(join(failedIterationRoot, 'eval-1', 'skill', 'grading.json'));

  await expect(loadIterationIndex(root)).resolves.toEqual({
    iterations: [0, 1],
    latestIteration: 1
  });
  await expect(loadIteration(root)).resolves.toMatchObject({
    summary: { availableIterations: [0, 1], iteration: 1, latestIteration: 1 }
  });
  await expect(loadIteration(root, { iteration: 2 })).rejects.toThrow(ITERATION_TWO_MISSING_ERROR_PATTERN);
});

it('excludes an entire iteration when one of its runs failed', async () => {
  const failedIterationRoot = join(root, 'results', 'iteration-2');
  await writeSampleIteration(failedIterationRoot, { iteration: 2 });
  const manifestPath = join(failedIterationRoot, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs[1].execution_status = 'error';
  manifest.runs[1].error = 'provider failed';
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  await expect(loadIterationIndex(root)).resolves.toEqual({
    iterations: [0, 1],
    latestIteration: 1
  });
});

it('excludes an otherwise successful iteration when a grading result is missing', async () => {
  const ungradedIterationRoot = join(root, 'results', 'iteration-2');
  await writeSampleIteration(ungradedIterationRoot, { iteration: 2 });
  await fs.promises.rm(join(ungradedIterationRoot, 'eval-1', 'baseline', 'grading.json'));

  await expect(loadIterationIndex(root)).resolves.toEqual({
    iterations: [0, 1],
    latestIteration: 1
  });
});

it('rejects a requested iteration that does not exist', async () => {
  await expect(loadIteration(root, { iteration: 9 })).rejects.toThrow(ITERATION_NINE_MISSING_ERROR_PATTERN);
});

it('loads a representative workspace with comparisons, large counts, and failures', async () => {
  const workspaceRoot = join(root, 'rich-workspace');
  await writeRichEvaluationWorkspace(workspaceRoot);

  const iteration = await loadIteration(workspaceRoot);

  expect(iteration.summary).toMatchObject({
    effort: 'default',
    iteration: 3,
    model: 'gpt-5.5',
    provider: 'codex',
    runCount: 4,
    skillName: 'conventional-commit-message'
  });
  expect(iteration.runs.map((run) => run.evalName)).toEqual([
    'user-visible-fix-avoids-code-narration',
    'user-visible-fix-avoids-code-narration',
    'internal-refactor-stays-refactor',
    'breaking-change-returns-full-message-when-needed'
  ]);
  const internalRun = iteration.runs.find(
    (run) => run.evalName === 'internal-refactor-stays-refactor' && run.runType === 'skill'
  );
  const userVisibleRun = iteration.runs.find(
    (run) => run.evalName === 'user-visible-fix-avoids-code-narration' && run.runType === 'skill'
  );
  expect(internalRun?.expectations).toHaveLength(RICH_SKILL_EXPECTATION_COUNT);
  expect(internalRun?.turns).toHaveLength(2);
  expect(userVisibleRun?.comparisons.baseline).toMatchObject({
    runType: 'baseline',
    durationDelta: 0,
    passRateDelta: 0.5,
    tokenDelta: 24_840
  });
});

it('uses real grader turn results from recorded artifact paths', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({
      executive_summary: 'The run satisfied all turn expectations.',
      results: {
        overall_expectations: [],
        turns: [
          {
            turn: 1,
            expectations: [
              {
                id: SAMPLE_SKILL_EXPECTATION_ID,
                text: 'The transcript shows the agent inspected the staged git change set before composing the message.',
                passed: true,
                evidence: 'The transcript shows git status and git diff before the final response.'
              }
            ]
          }
        ]
      },
      summary: {
        passed: 1,
        failed: 0,
        total: 1,
        pass_rate: 1
      }
    }),
    'utf-8'
  );
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            eval_id: 1,
            turns: [
              {
                expectations: [
                  {
                    comment: 'Nested turn feedback.',
                    expectation_id: SAMPLE_SKILL_EXPECTATION_ID
                  }
                ],
                turn: 1
              }
            ],
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.expectations).toEqual([
    {
      evidence: 'The transcript shows git status and git diff before the final response.',
      id: SAMPLE_SKILL_EXPECTATION_ID,
      passed: true,
      scope: 'turn',
      text: 'The transcript shows the agent inspected the staged git change set before composing the message.',
      turn: 1
    }
  ]);
  expect(iteration.runs[0]?.turns[0]).toMatchObject({
    response: 'feat!: support signing key rotation',
    transcript: expect.stringContaining('ASSISTANT: feat!: support signing key rotation')
  });
  expect(iteration.runs[0]?.feedback.turns).toEqual([
    { expectations: [{ comment: 'Nested turn feedback.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 1 }
  ]);
  expect(iteration.runs[0]?.issues).toEqual([]);
});

it('recalculates the current pass rate from all verdicts and reports every inconsistent summary field', async () => {
  const gradingPath = join(iterationRoot, 'eval-1', 'skill', 'grading.json');
  const grading = JSON.parse(await fs.promises.readFile(gradingPath, 'utf-8'));
  grading.results.overall_expectations = [
    {
      evidence: 'The final response contains the required migration guidance.',
      id: '10a375c5-12f4-5a15-b5bd-951f7d6204f1',
      passed: false,
      text: 'The final response explains migration.'
    }
  ];
  grading.summary = { failed: 0, pass_rate: 1, passed: 2, total: 3 };
  await fs.promises.writeFile(gradingPath, `${JSON.stringify(grading, null, 2)}\n`, 'utf-8');

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.passRate).toBe(HALF_PASS_RATE);
  expect(iteration.runs[0]?.issues).toContainEqual({
    artifact: gradingPath,
    message:
      'Current grading summary fields (passed, failed, total, pass_rate) are inconsistent with expectation verdicts; the displayed score was recalculated.',
    severity: 'warning',
    state: 'inconsistent_grading_summary'
  });
});

it('recalculates baseline comparison scores and surfaces their inconsistent summaries on the skill run', async () => {
  const gradingPath = join(iterationRoot, 'eval-1', 'baseline', 'grading.json');
  const grading = JSON.parse(await fs.promises.readFile(gradingPath, 'utf-8'));
  grading.summary = { failed: 0, pass_rate: 1, passed: 1, total: 1 };
  await fs.promises.writeFile(gradingPath, `${JSON.stringify(grading, null, 2)}\n`, 'utf-8');

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.comparisons.baseline?.passRateDelta).toBe(1);
  expect(iteration.runs[0]?.issues).toContainEqual({
    artifact: gradingPath,
    message:
      'Baseline grading summary fields (passed, failed, pass_rate) are inconsistent with expectation verdicts; the displayed score was recalculated.',
    severity: 'warning',
    state: 'inconsistent_grading_summary'
  });
});

it('rejects missing required run artifacts', async () => {
  await fs.promises.rm(join(iterationRoot, 'eval-1', 'skill', 'grading.json'));
  await fs.promises.rm(join(iterationRoot, 'eval-1', 'skill', 'raw_output.jsonl'));
  await fs.promises.rm(join(iterationRoot, 'eval-1', 'skill', 'timing.json'));
  await fs.promises.rm(join(iterationRoot, 'eval-1', 'skill', 'turn-1', 'outputs', 'response.md'));
  await fs.promises.rm(join(iterationRoot, 'eval-1', 'skill', 'turn-1', 'outputs', 'transcript.md'));

  await expect(loadIteration(root, { availableIterations: [1] })).rejects.toThrow(MISSING_RUN_ARTIFACTS_ERROR_PATTERN);
});

it('rejects invalid grading artifacts', async () => {
  await fs.promises.writeFile(join(iterationRoot, 'eval-1', 'skill', 'grading.json'), '{', 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(GRADING_ERROR_PATTERN);
});

it('rejects invalid optional generated artifacts when they are present', async () => {
  await fs.promises.writeFile(join(iterationRoot, 'aggregated_results.json'), '{', 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(AGGREGATED_RESULTS_ERROR_PATTERN);
});

it('rejects unknown artifact schema names', async () => {
  await expect(validateArtifactSchema('missing.schema.json', {})).rejects.toThrow(MISSING_SCHEMA_ERROR_PATTERN);
});

it('rejects timing artifacts that do not match the schema', async () => {
  await fs.promises.writeFile(join(iterationRoot, 'eval-1', 'skill', 'timing.json'), JSON.stringify({}), 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(TIMING_ERROR_PATTERN);
});

it('writes viewer feedback without mutating evaluator artifacts', async () => {
  const gradingPath = join(iterationRoot, 'eval-1', 'skill', 'grading.json');
  const before = await fs.promises.readFile(gradingPath, 'utf-8');

  await saveFeedback(root, {
    evalId: 1,
    overall: [],
    comments: 'Looks correct, but add a stricter markdown assertion.',
    turns: [
      {
        expectations: [
          {
            comment: 'The first turn expectation is correctly supported.',
            expectation_id: SAMPLE_SKILL_EXPECTATION_ID
          }
        ],
        turn: 1
      }
    ]
  });

  expect(await fs.promises.readFile(gradingPath, 'utf-8')).toBe(before);
  const feedback = JSON.parse(await fs.promises.readFile(join(iterationRoot, 'viewer_feedback.json'), 'utf-8'));
  expect(feedback.reviews).toContainEqual(
    expect.objectContaining({
      comments: 'Looks correct, but add a stricter markdown assertion.',
      eval_id: 1,
      turns: [
        {
          expectations: [
            {
              comment: 'The first turn expectation is correctly supported.',
              expectation_id: SAMPLE_SKILL_EXPECTATION_ID
            }
          ],
          turn: 1
        }
      ]
    })
  );
  expect(JSON.stringify(feedback)).not.toContain('review_state');
  expect(JSON.stringify(feedback)).not.toContain('""');
  await expect(fs.promises.stat(join(iterationRoot, 'viewer_feedback.json'))).resolves.toBeTruthy();
});

it('writes only non-empty viewer feedback content', async () => {
  await saveFeedback(root, {
    comments: '  ',
    evalId: 1,
    overall: [
      { comment: '', expectation_id: '10a375c5-12f4-5a15-b5bd-951f7d6204f1' },
      { comment: '  Overall note.  ', expectation_id: '6fcfb2db-03d1-5bd4-971e-8a10929a7de3' }
    ],
    turns: [
      {
        expectations: [
          { comment: '', expectation_id: 'b708da13-cb1a-5d05-a046-6fc4de91ce56' },
          { comment: ' Turn note. ', expectation_id: SAMPLE_SKILL_EXPECTATION_ID },
          { comment: '', expectation_id: 'dc47174d-62a8-5820-bcb8-3a5cae2a10cb' }
        ],
        turn: 1
      },
      { expectations: [{ comment: '', expectation_id: '4c352857-a8b6-57da-acac-6c4d9ee91eee' }], turn: 2 }
    ]
  });

  const feedback = JSON.parse(await fs.promises.readFile(join(iterationRoot, 'viewer_feedback.json'), 'utf-8'));

  expect(feedback).toEqual({
    reviews: [
      {
        eval_id: 1,
        overall: [{ comment: 'Overall note.', expectation_id: '6fcfb2db-03d1-5bd4-971e-8a10929a7de3' }],
        turns: [{ expectations: [{ comment: 'Turn note.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 1 }],
        updated_at: expect.any(String)
      }
    ]
  });
  expect(JSON.stringify(feedback)).not.toContain('review_state');
  expect(JSON.stringify(feedback)).not.toContain('""');
});

it('does not write a review entry when all feedback fields are blank', async () => {
  await saveFeedback(root, {
    comments: '',
    evalId: 1,
    overall: [{ comment: '', expectation_id: 'blank-overall-expectation' }],
    turns: [{ expectations: [{ comment: '', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 1 }]
  });

  const feedback = JSON.parse(await fs.promises.readFile(join(iterationRoot, 'viewer_feedback.json'), 'utf-8'));

  expect(feedback).toEqual({ reviews: [] });
  expect(JSON.stringify(feedback)).not.toContain('""');
  expect(JSON.stringify(feedback)).not.toContain('review_state');
});

it('removes an existing review entry when saved feedback is cleared', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Old note.',
            eval_id: 1,
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  await saveFeedback(root, {
    comments: '',
    evalId: 1,
    overall: [],
    turns: []
  });

  const feedback = JSON.parse(await fs.promises.readFile(join(iterationRoot, 'viewer_feedback.json'), 'utf-8'));

  expect(feedback).toEqual({ reviews: [] });
});

it('rejects preserving an empty existing feedback review', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify({ reviews: [{ eval_id: 2, updated_at: '2026-05-26T12:00:00.000Z' }] }, null, 2)}\n`,
    'utf-8'
  );

  await expect(saveFeedback(root, { comments: 'New note.', evalId: 1, overall: [], turns: [] })).rejects.toThrow(
    VIEWER_FEEDBACK_ERROR_PATTERN
  );
});

it('preserves existing comment-only feedback reviews', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Old note.',
            eval_id: 2,
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  await saveFeedback(root, {
    comments: 'New note.',
    evalId: 1,
    overall: [],
    turns: []
  });

  const feedback = JSON.parse(await fs.promises.readFile(join(iterationRoot, 'viewer_feedback.json'), 'utf-8'));
  expect(feedback.reviews).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ comments: 'Old note.', eval_id: 2 }),
      expect.objectContaining({ comments: 'New note.', eval_id: 1 })
    ])
  );
});

it('preserves concurrent feedback saves for different evals', async () => {
  await Promise.all([
    saveFeedback(root, {
      comments: 'First eval note.',
      evalId: 1,
      overall: [],
      turns: []
    }),
    saveFeedback(root, {
      comments: 'Second eval note.',
      evalId: 2,
      overall: [],
      turns: []
    })
  ]);

  const feedback = JSON.parse(await fs.promises.readFile(join(iterationRoot, 'viewer_feedback.json'), 'utf-8'));
  expect(feedback.reviews).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ comments: 'First eval note.', eval_id: 1 }),
      expect.objectContaining({ comments: 'Second eval note.', eval_id: 2 })
    ])
  );
});

it('rejects preserving an invalid existing feedback turn', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Old note.',
            eval_id: 2,
            turns: [
              { expectations: [{ comment: 'Turn note.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 0 }
            ],
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  await expect(saveFeedback(root, { comments: 'New note.', evalId: 1, overall: [], turns: [] })).rejects.toThrow(
    VIEWER_FEEDBACK_ERROR_PATTERN
  );
});

it('rejects preserving invalid existing expectation feedback', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Old note.',
            eval_id: 2,
            overall: [{ comment: '', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }],
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  await expect(saveFeedback(root, { comments: 'New note.', evalId: 1, overall: [], turns: [] })).rejects.toThrow(
    VIEWER_FEEDBACK_ERROR_PATTERN
  );
});

it('loads viewer feedback keyed by eval_id', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Already reviewed.',
            eval_id: 1,
            overall: [{ comment: 'Existing first expectation note.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }],
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]).toMatchObject({
    feedback: {
      comments: 'Already reviewed.',
      overall: [],
      turns: [{ expectations: [{ comment: '', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 1 }]
    },
    userComments: 'Already reviewed.'
  });
});

it('loads expectation feedback by expectation id instead of array position', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            eval_id: 1,
            turns: [
              {
                expectations: [
                  {
                    comment: 'ID-matched note.',
                    expectation_id: SAMPLE_SKILL_EXPECTATION_ID
                  }
                ],
                turn: 1
              }
            ],
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.feedback.turns).toEqual([
    {
      expectations: [
        {
          comment: 'ID-matched note.',
          expectation_id: SAMPLE_SKILL_EXPECTATION_ID
        }
      ],
      turn: 1
    }
  ]);
});

it('loads overall expectation feedback by expectation id', async () => {
  const overallExpectationId = '10a375c5-12f4-5a15-b5bd-951f7d6204f1';
  await fs.promises.writeFile(
    join(iterationRoot, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({
      executive_summary: 'Overall grading summary.',
      results: {
        overall_expectations: [
          {
            evidence: 'Overall evidence.',
            id: overallExpectationId,
            passed: true,
            text: 'Overall expectation.'
          }
        ],
        turns: []
      },
      summary: { failed: 0, pass_rate: 1, passed: 1, total: 1 }
    }),
    'utf-8'
  );
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            eval_id: 1,
            overall: [{ comment: 'Overall ID note.', expectation_id: overallExpectationId }],
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.feedback.overall).toEqual([
    { comment: 'Overall ID note.', expectation_id: overallExpectationId }
  ]);
});

it('keeps overall expectation feedback empty when no review exists', async () => {
  const overallExpectationId = '12c08335-3aa6-57ef-9b2f-78f8164497cd';
  await fs.promises.writeFile(
    join(iterationRoot, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({
      executive_summary: 'Overall grading summary.',
      results: {
        overall_expectations: [
          {
            evidence: 'Overall evidence.',
            id: overallExpectationId,
            passed: true,
            text: 'Overall expectation.'
          }
        ],
        turns: []
      },
      summary: { failed: 0, pass_rate: 1, passed: 1, total: 1 }
    }),
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.feedback.overall).toEqual([{ comment: '', expectation_id: overallExpectationId }]);
});

it('rejects malformed eval ids in current feedback artifacts', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Malformed id note.',
            eval_id: 'not-a-number',
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  await expect(loadIteration(root)).rejects.toThrow(VIEWER_FEEDBACK_ERROR_PATTERN);
});

it('updates existing viewer feedback entries by eval_id', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Old note.',
            eval_id: 1,
            turns: [
              {
                expectations: [{ comment: 'Old expectation note.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }],
                turn: 1
              }
            ],
            updated_at: '2026-05-26T12:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  await saveFeedback(root, {
    comments: 'Updated note.',
    evalId: 1,
    overall: [],
    turns: [
      {
        expectations: [{ comment: 'Updated expectation note.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }],
        turn: 1
      }
    ]
  });

  const feedback = JSON.parse(await fs.promises.readFile(join(iterationRoot, 'viewer_feedback.json'), 'utf-8'));
  expect(feedback.reviews).toHaveLength(1);
  expect(feedback.reviews[0]).toMatchObject({
    comments: 'Updated note.',
    eval_id: 1,
    turns: [
      {
        expectations: [{ comment: 'Updated expectation note.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }],
        turn: 1
      }
    ]
  });
  expect(feedback.reviews[0]).not.toHaveProperty('overall');
  expect(feedback.reviews[0]).not.toHaveProperty('review_state');
});

it('rejects manifest artifacts that do not match the schema', async () => {
  const manifestPath = join(iterationRoot, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs[0].execution_status = 'queued';
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(RUN_MANIFEST_ERROR_PATTERN);
});

it('does not load iterations whose manifest records a failed run', async () => {
  const manifestPath = join(iterationRoot, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs = [manifest.runs[0]];
  manifest.runs[0].execution_status = 'error';
  manifest.runs[0].error = 'executor timed out';
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  await expect(loadIteration(root, { iteration: 1 })).rejects.toThrow(ITERATION_ONE_MISSING_ERROR_PATTERN);
});

it('rejects malformed turn artifact entries', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'eval-1', 'skill', 'run_artifacts.json'),
    JSON.stringify({ artifacts: { turns: [{}] } }),
    'utf-8'
  );

  await expect(loadIteration(root)).rejects.toThrow(RUN_ARTIFACTS_ERROR_PATTERN);
});

it('loads previous iteration comparisons from numbered iteration directories', async () => {
  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.comparisons.previousIteration).toMatchObject({
    runType: 'skill',
    passRateDelta: 1
  });
});

it('recalculates previous iteration comparison scores and surfaces inconsistent summaries', async () => {
  const gradingPath = join(root, 'results', 'iteration-0', 'eval-1', 'skill', 'grading.json');
  const grading = JSON.parse(await fs.promises.readFile(gradingPath, 'utf-8'));
  grading.summary = { failed: 0, pass_rate: 1, passed: 1, total: 1 };
  await fs.promises.writeFile(gradingPath, `${JSON.stringify(grading, null, 2)}\n`, 'utf-8');

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.comparisons.previousIteration?.passRateDelta).toBe(1);
  expect(iteration.runs[0]?.issues).toContainEqual({
    artifact: gradingPath,
    message:
      'Previous iteration grading summary fields (passed, failed, pass_rate) are inconsistent with expectation verdicts; the displayed score was recalculated.',
    severity: 'warning',
    state: 'inconsistent_grading_summary'
  });
});

it('surfaces malformed previous iteration comparison artifacts', async () => {
  await fs.promises.writeFile(join(root, 'results', 'iteration-0', 'eval-1', 'skill', 'grading.json'), '{', 'utf-8');

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.comparisons.previousIteration).toBeUndefined();
  expect(iteration.runs[0]?.issues).toContainEqual(
    expect.objectContaining({
      message: 'Invalid previous iteration comparison target',
      severity: 'warning',
      state: 'missing_comparison_target'
    })
  );
});

it('surfaces incomplete previous iteration comparison artifacts', async () => {
  await fs.promises.rm(join(root, 'results', 'iteration-0', 'eval-1', 'skill', 'turn-1', 'outputs', 'response.md'));

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.comparisons.previousIteration).toBeUndefined();
  expect(iteration.runs[0]?.issues).toContainEqual(
    expect.objectContaining({
      message: 'Missing previous iteration comparison target',
      severity: 'warning',
      state: 'missing_comparison_target'
    })
  );
});

it('rejects run artifacts without turn entries', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'eval-1', 'skill', 'run_artifacts.json'),
    JSON.stringify({ artifacts: {} }),
    'utf-8'
  );

  await expect(loadIteration(root)).rejects.toThrow(RUN_ARTIFACTS_ERROR_PATTERN);
});

it('recalculates an empty expectation set to a zero pass rate', async () => {
  const gradingPath = join(iterationRoot, 'eval-1', 'skill', 'grading.json');
  await fs.promises.writeFile(
    gradingPath,
    JSON.stringify({
      executive_summary: 'No expectations were graded.',
      results: { overall_expectations: [], turns: [] },
      summary: { failed: 0, pass_rate: 1, passed: 0, total: 0 }
    }),
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.expectations).toEqual([]);
  expect(iteration.runs[0]?.turns[0]?.expectations).toEqual([]);
  expect(iteration.runs[0]?.passRate).toBe(0);
  expect(iteration.runs[0]?.issues).toContainEqual({
    artifact: gradingPath,
    message:
      'Current grading summary fields (pass_rate) are inconsistent with expectation verdicts; the displayed score was recalculated.',
    severity: 'warning',
    state: 'inconsistent_grading_summary'
  });
});

it('rejects grader turn entries without expectation arrays', async () => {
  await fs.promises.writeFile(
    join(iterationRoot, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({
      executive_summary: 'Malformed turn.',
      results: {
        turns: [{ turn: 1 }]
      },
      summary: { failed: 0, pass_rate: 1, passed: 0, total: 0 }
    }),
    'utf-8'
  );

  await expect(loadIteration(root)).rejects.toThrow(GRADING_ERROR_PATTERN);
});

it('rejects omitted manifest statuses', async () => {
  const manifestPath = join(iterationRoot, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs = [manifest.runs[0]];
  delete manifest.runs[0].execution_status;
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(RUN_MANIFEST_ERROR_PATTERN);
});

it('rejects a workspace root that points at a file', async () => {
  const fileRoot = join(iterationRoot, 'run_manifest.json');

  await expect(loadIteration(fileRoot)).rejects.toThrow(NOT_A_DIRECTORY_ERROR_PATTERN);
});

it('rejects a workspace whose results path is a file', async () => {
  const workspaceRoot = join(root, 'workspace-with-file-results');
  await fs.promises.mkdir(workspaceRoot, { recursive: true });
  await fs.promises.writeFile(join(workspaceRoot, 'results'), 'not a directory', 'utf-8');

  await expect(loadIteration(workspaceRoot)).rejects.toThrow(RESULTS_PATH_NOT_DIRECTORY_ERROR_PATTERN);
});

it('rejects an empty iteration when the manifest has no run array', async () => {
  await fs.promises.writeFile(join(iterationRoot, 'run_manifest.json'), JSON.stringify({ iteration: 1 }), 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(RUN_MANIFEST_ERROR_PATTERN);
});

it('rejects an empty iteration supplied through a previously loaded index', async () => {
  const manifestPath = join(iterationRoot, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs = [];
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  await expect(loadIteration(root, { availableIterations: [1], iteration: 1 })).rejects.toThrow('no runs to review');
});

it('rejects a directory that is neither an iteration root nor an evaluation workspace', async () => {
  const unrelatedRoot = join(root, 'unrelated');
  await fs.promises.rm(unrelatedRoot, { force: true, recursive: true });
  await writeSampleIteration(join(unrelatedRoot, 'other', 'iteration-1'));
  await fs.promises.rm(join(unrelatedRoot, 'other'), { recursive: true });

  await expect(loadIteration(unrelatedRoot)).rejects.toThrow(RESULTS_ARTIFACTS_ERROR_PATTERN);
});

it('rejects an evaluation workspace when no reviewable iterations exist', async () => {
  const workspaceRoot = join(root, 'workspace-with-empty-results');
  await writeSampleIteration(join(workspaceRoot, 'results', 'draft'));
  await fs.promises.rm(join(workspaceRoot, 'results', 'draft'), { recursive: true });

  await expect(loadIteration(workspaceRoot)).rejects.toThrow(NO_REVIEWABLE_ITERATIONS_ERROR_PATTERN);
});

it('reports where failed or ungraded artifacts remain when no iteration is reviewable', async () => {
  const workspaceRoot = join(root, 'workspace-with-failed-results');
  const failedIterationRoot = join(workspaceRoot, 'results', 'iteration-1');
  await writeSampleIteration(failedIterationRoot, { iteration: 1 });
  const manifestPath = join(failedIterationRoot, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs[0].execution_status = 'grading_error';
  manifest.runs[0].error = 'grading failed';
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  await fs.promises.rm(join(failedIterationRoot, 'eval-1', 'skill', 'grading.json'));

  await expect(loadIteration(workspaceRoot)).rejects.toThrow(
    `no reviewable results/iteration-N artifacts; failed or ungraded iterations remain under ${join(workspaceRoot, 'results')}`
  );
});

it('ignores iteration directories without manifests', async () => {
  const workspaceRoot = join(root, 'workspace-with-missing-manifest');
  await writeSampleIteration(join(workspaceRoot, 'results', 'iteration-1'), { iteration: 1 });
  await fs.promises.mkdir(join(workspaceRoot, 'results', 'iteration-2'), { recursive: true });

  const iteration = await loadIteration(workspaceRoot);

  expect(iteration.summary.availableIterations).toEqual([1]);
});

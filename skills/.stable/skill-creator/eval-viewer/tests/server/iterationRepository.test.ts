import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { validateArtifactSchema } from '../../src/server/artifactSchemas.js';
import { loadIteration, saveFeedback } from '../../src/server/iterationRepository.js';
import { writeRichEvaluationWorkspace } from '../fixtures/richEvaluation.js';
import { SAMPLE_SKILL_EXPECTATION_ID, writeSampleIteration } from '../fixtures/sampleIteration.js';
import { fs, vol } from '../support/memfs.js';

vi.mock('../../src/server/artifactSchemas.js', async () => await import('./fakeArtifactSchemas.js'));

let root: string;

beforeEach(async () => {
  vol.reset();
  root = join('/memory', 'current');
  await writeSampleIteration(root);
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
    workingDirectory: join(root, 'eval-1', 'skill', 'work')
  });
  expect(iteration.runs[0]?.artifactPaths.runArtifacts).toBe(join(root, 'eval-1', 'skill', 'run_artifacts.json'));
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

it('loads the latest iteration when given an evaluation results workspace root', async () => {
  const workspaceRoot = join(root, 'workspace');
  await writeSampleIteration(join(workspaceRoot, 'results', 'iteration-1'), { iteration: 3 });
  await writeSampleIteration(join(workspaceRoot, 'results', 'iteration-3'), { iteration: 5 });

  const iteration = await loadIteration(workspaceRoot);

  expect(iteration.summary.iteration).toBe(5);
  expect(iteration.runs[0]?.artifactPaths.grading).toContain('iteration-3');
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
  expect(internalRun?.expectations).toHaveLength(6);
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
    join(root, 'eval-1', 'skill', 'grading.json'),
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
    join(root, 'viewer_feedback.json'),
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

it('rejects missing required run artifacts', async () => {
  await fs.promises.rm(join(root, 'eval-1', 'skill', 'grading.json'));
  await fs.promises.rm(join(root, 'eval-1', 'skill', 'raw_output.jsonl'));
  await fs.promises.rm(join(root, 'eval-1', 'skill', 'timing.json'));
  await fs.promises.rm(join(root, 'eval-1', 'skill', 'turn-1', 'outputs', 'response.md'));
  await fs.promises.rm(join(root, 'eval-1', 'skill', 'turn-1', 'outputs', 'transcript.md'));

  await expect(loadIteration(root)).rejects.toThrow(
    /Missing (grading\.json|raw_output\.jsonl|timing\.json|response\.md|transcript\.md)/
  );
});

it('rejects invalid grading artifacts', async () => {
  await fs.promises.writeFile(join(root, 'eval-1', 'skill', 'grading.json'), '{', 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(/Invalid grading\.json/);
});

it('rejects invalid optional generated artifacts when they are present', async () => {
  await fs.promises.writeFile(join(root, 'aggregated_results.json'), '{', 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(/Invalid aggregated_results\.json/);
});

it('rejects unknown artifact schema names', async () => {
  await expect(validateArtifactSchema('missing.schema.json', {})).rejects.toThrow(/Unknown artifact schema/);
});

it('rejects timing artifacts that do not match the schema', async () => {
  await fs.promises.writeFile(join(root, 'eval-1', 'skill', 'timing.json'), JSON.stringify({}), 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(/Invalid timing\.json/);
});

it('writes viewer feedback without mutating evaluator artifacts', async () => {
  const gradingPath = join(root, 'eval-1', 'skill', 'grading.json');
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
  const feedback = JSON.parse(await fs.promises.readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
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
  await expect(fs.promises.stat(join(root, 'viewer_feedback.json'))).resolves.toBeTruthy();
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

  const feedback = JSON.parse(await fs.promises.readFile(join(root, 'viewer_feedback.json'), 'utf-8'));

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

  const feedback = JSON.parse(await fs.promises.readFile(join(root, 'viewer_feedback.json'), 'utf-8'));

  expect(feedback).toEqual({ reviews: [] });
  expect(JSON.stringify(feedback)).not.toContain('""');
  expect(JSON.stringify(feedback)).not.toContain('review_state');
});

it('removes an existing review entry when saved feedback is cleared', async () => {
  await fs.promises.writeFile(
    join(root, 'viewer_feedback.json'),
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

  const feedback = JSON.parse(await fs.promises.readFile(join(root, 'viewer_feedback.json'), 'utf-8'));

  expect(feedback).toEqual({ reviews: [] });
});

it('rejects preserving an empty existing feedback review', async () => {
  await fs.promises.writeFile(
    join(root, 'viewer_feedback.json'),
    `${JSON.stringify({ reviews: [{ eval_id: 2, updated_at: '2026-05-26T12:00:00.000Z' }] }, null, 2)}\n`,
    'utf-8'
  );

  await expect(saveFeedback(root, { comments: 'New note.', evalId: 1, overall: [], turns: [] })).rejects.toThrow(
    /Invalid viewer_feedback\.json/
  );
});

it('preserves existing comment-only feedback reviews', async () => {
  await fs.promises.writeFile(
    join(root, 'viewer_feedback.json'),
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

  const feedback = JSON.parse(await fs.promises.readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
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

  const feedback = JSON.parse(await fs.promises.readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
  expect(feedback.reviews).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ comments: 'First eval note.', eval_id: 1 }),
      expect.objectContaining({ comments: 'Second eval note.', eval_id: 2 })
    ])
  );
});

it('rejects preserving an invalid existing feedback turn', async () => {
  await fs.promises.writeFile(
    join(root, 'viewer_feedback.json'),
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
    /Invalid viewer_feedback\.json/
  );
});

it('rejects preserving invalid existing expectation feedback', async () => {
  await fs.promises.writeFile(
    join(root, 'viewer_feedback.json'),
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
    /Invalid viewer_feedback\.json/
  );
});

it('loads viewer feedback keyed by eval_id', async () => {
  await fs.promises.writeFile(
    join(root, 'viewer_feedback.json'),
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
    join(root, 'viewer_feedback.json'),
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
    join(root, 'eval-1', 'skill', 'grading.json'),
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
    join(root, 'viewer_feedback.json'),
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
    join(root, 'eval-1', 'skill', 'grading.json'),
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
    join(root, 'viewer_feedback.json'),
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

  await expect(loadIteration(root)).rejects.toThrow(/Invalid viewer_feedback\.json/);
});

it('updates existing viewer feedback entries by eval_id', async () => {
  await fs.promises.writeFile(
    join(root, 'viewer_feedback.json'),
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

  const feedback = JSON.parse(await fs.promises.readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
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
  const manifestPath = join(root, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs[0].execution_status = 'queued';
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(/Invalid run_manifest\.json/);
});

it('loads runs without exposing execution status in the viewer model', async () => {
  const manifestPath = join(root, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs = [manifest.runs[0]];
  manifest.runs[0].execution_status = 'error';
  manifest.runs[0].error = 'executor timed out';
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]).not.toHaveProperty('status');
});

it('rejects malformed turn artifact entries', async () => {
  await fs.promises.writeFile(
    join(root, 'eval-1', 'skill', 'run_artifacts.json'),
    JSON.stringify({ artifacts: { turns: [{}] } }),
    'utf-8'
  );

  await expect(loadIteration(root)).rejects.toThrow(/Invalid run_artifacts\.json/);
});

it('loads previous iteration comparisons from numbered iteration directories', async () => {
  const iterationRoot = join(root, 'iteration-1');
  await writeSampleIteration(iterationRoot);
  await writeSampleIteration(join(root, 'iteration-0'));

  const iteration = await loadIteration(iterationRoot);

  expect(iteration.runs[0]?.comparisons.previousIteration).toMatchObject({
    runType: 'skill',
    passRateDelta: 0
  });
});

it('surfaces malformed previous iteration comparison artifacts', async () => {
  await fs.promises.writeFile(join(root, 'iteration-0', 'eval-1', 'skill', 'grading.json'), '{', 'utf-8');

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
  await fs.promises.rm(join(root, 'iteration-0', 'eval-1', 'skill', 'turn-1', 'outputs', 'response.md'));

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
    join(root, 'eval-1', 'skill', 'run_artifacts.json'),
    JSON.stringify({ artifacts: {} }),
    'utf-8'
  );

  await expect(loadIteration(root)).rejects.toThrow(/Invalid run_artifacts\.json/);
});

it('keeps expectations empty when grading has no expectation results', async () => {
  await fs.promises.writeFile(
    join(root, 'eval-1', 'skill', 'grading.json'),
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
});

it('rejects grader turn entries without expectation arrays', async () => {
  await fs.promises.writeFile(
    join(root, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({
      executive_summary: 'Malformed turn.',
      results: {
        turns: [{ turn: 1 }]
      },
      summary: { failed: 0, pass_rate: 1, passed: 0, total: 0 }
    }),
    'utf-8'
  );

  await expect(loadIteration(root)).rejects.toThrow(/Invalid grading\.json/);
});

it('rejects omitted manifest statuses', async () => {
  const manifestPath = join(root, 'run_manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  manifest.runs = [manifest.runs[0]];
  delete manifest.runs[0].execution_status;
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(/Invalid run_manifest\.json/);
});

it('rejects a result root that points at a file', async () => {
  const fileRoot = join(root, 'run_manifest.json');

  await expect(loadIteration(fileRoot)).rejects.toThrow(/not a directory/i);
});

it('rejects an empty iteration when the manifest has no run array', async () => {
  await fs.promises.writeFile(join(root, 'run_manifest.json'), JSON.stringify({ iteration: 1 }), 'utf-8');

  await expect(loadIteration(root)).rejects.toThrow(/Invalid run_manifest\.json/i);
});

it('rejects a directory that is neither an iteration root nor an evaluation workspace', async () => {
  const unrelatedRoot = join(root, 'unrelated');
  await fs.promises.rm(unrelatedRoot, { force: true, recursive: true });
  await writeSampleIteration(join(unrelatedRoot, 'other', 'iteration-1'));
  await fs.promises.rm(join(unrelatedRoot, 'other'), { recursive: true });

  await expect(loadIteration(unrelatedRoot)).rejects.toThrow(/run_manifest\.json/);
});

it('rejects an evaluation workspace when no iteration manifests exist', async () => {
  const workspaceRoot = join(root, 'workspace-with-empty-results');
  await writeSampleIteration(join(workspaceRoot, 'results', 'draft'));
  await fs.promises.rm(join(workspaceRoot, 'results', 'draft'), { recursive: true });

  await expect(loadIteration(workspaceRoot)).rejects.toThrow(/run_manifest\.json/);
});

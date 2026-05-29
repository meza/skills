import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { loadIteration, saveFeedback } from '../../src/server/iterationRepository.js';
import { writeRichEvaluationWorkspace } from '../fixtures/richEvaluation.js';
import { SAMPLE_SKILL_EXPECTATION_ID, writeSampleIteration } from '../fixtures/sampleIteration.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'eval-viewer-'));
  await writeSampleIteration(root);
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
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
    status: 'success',
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

it('loads a representative workspace with comparisons, large counts, failures, and artifact issues', async () => {
  const workspaceRoot = join(root, 'rich-workspace');
  await writeRichEvaluationWorkspace(workspaceRoot);

  const iteration = await loadIteration(workspaceRoot);

  expect(iteration.summary).toMatchObject({
    effort: 'default',
    iteration: 3,
    model: 'gpt-5.5',
    provider: 'codex',
    runCount: 5,
    skillName: 'conventional-commit-message'
  });
  expect(iteration.runs.map((run) => run.evalName)).toEqual([
    'user-visible-fix-avoids-code-narration',
    'user-visible-fix-avoids-code-narration',
    'internal-refactor-stays-refactor',
    'breaking-change-returns-full-message-when-needed',
    'missing-artifact-smoke'
  ]);
  const internalRun = iteration.runs.find(
    (run) => run.evalName === 'internal-refactor-stays-refactor' && run.runType === 'skill'
  );
  const userVisibleRun = iteration.runs.find(
    (run) => run.evalName === 'user-visible-fix-avoids-code-narration' && run.runType === 'skill'
  );
  const missingArtifactRun = iteration.runs.find((run) => run.evalName === 'missing-artifact-smoke');
  expect(internalRun?.expectations).toHaveLength(6);
  expect(internalRun?.turns).toHaveLength(2);
  expect(userVisibleRun?.comparisons.baseline).toMatchObject({
    runType: 'baseline',
    durationDelta: 0,
    passRateDelta: 0.5,
    tokenDelta: 24_840
  });
  expect(missingArtifactRun?.issues.map((issue) => issue.state)).toEqual(
    expect.arrayContaining([
      'failed_execution',
      'invalid_grading',
      'missing_raw_output',
      'missing_response',
      'missing_timing',
      'missing_transcript'
    ])
  );
});

it('uses real grader turn results and falls back when recorded artifact paths reference renamed iteration folders', async () => {
  await writeFile(
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
  await writeFile(
    join(root, 'eval-1', 'skill', 'run_artifacts.json'),
    JSON.stringify({
      artifacts: {
        turns: [
          {
            turn: 1,
            response_path: join(root, '..', 'iteration-5', 'eval-1', 'skill', 'turn-1', 'outputs', 'response.md'),
            transcript_path: join(root, '..', 'iteration-5', 'eval-1', 'skill', 'turn-1', 'outputs', 'transcript.md')
          }
        ]
      }
    }),
    'utf-8'
  );
  await writeFile(
    join(root, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            eval_id: 1,
            overall: [],
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
  expect(iteration.runs[0]?.issues.map((issue) => issue.state)).not.toContain('missing_response');
  expect(iteration.runs[0]?.issues.map((issue) => issue.state)).not.toContain('missing_transcript');
});

it('surfaces missing artifacts as run issues instead of hiding the run', async () => {
  await rm(join(root, 'eval-1', 'skill', 'grading.json'));
  await rm(join(root, 'eval-1', 'skill', 'raw_output.jsonl'));
  await rm(join(root, 'eval-1', 'skill', 'timing.json'));
  await rm(join(root, 'eval-1', 'skill', 'turn-1', 'outputs', 'response.md'));
  await rm(join(root, 'eval-1', 'skill', 'turn-1', 'outputs', 'transcript.md'));

  const iteration = await loadIteration(root);

  const run = iteration.runs.find((candidate) => candidate.runType === 'skill');
  expect(run?.issues.map((issue) => issue.state)).toEqual(
    expect.arrayContaining([
      'missing_grading',
      'missing_raw_output',
      'missing_response',
      'missing_timing',
      'missing_transcript'
    ])
  );
  expect(run?.status).toBe('artifact_error');
});

it('surfaces invalid grading and failed execution states', async () => {
  await writeFile(join(root, 'eval-1', 'skill', 'grading.json'), '{', 'utf-8');
  const manifestPath = join(root, 'run_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  manifest.runs[0].status = 'failed';
  manifest.runs[0].error = 'executor timed out';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  const iteration = await loadIteration(root);

  const run = iteration.runs.find((candidate) => candidate.runType === 'skill');
  expect(run?.issues).toContainEqual(
    expect.objectContaining({
      message: 'Invalid grading.json',
      state: 'invalid_grading'
    })
  );
  expect(run?.issues).toContainEqual(
    expect.objectContaining({
      message: 'executor timed out',
      state: 'failed_execution'
    })
  );
});

it('writes viewer feedback without mutating evaluator artifacts', async () => {
  const gradingPath = join(root, 'eval-1', 'skill', 'grading.json');
  const before = await readFile(gradingPath, 'utf-8');

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

  expect(await readFile(gradingPath, 'utf-8')).toBe(before);
  const feedback = JSON.parse(await readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
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
  await expect(stat(join(root, 'viewer_feedback.json'))).resolves.toBeTruthy();
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

  const feedback = JSON.parse(await readFile(join(root, 'viewer_feedback.json'), 'utf-8'));

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

  const feedback = JSON.parse(await readFile(join(root, 'viewer_feedback.json'), 'utf-8'));

  expect(feedback).toEqual({ reviews: [] });
  expect(JSON.stringify(feedback)).not.toContain('""');
  expect(JSON.stringify(feedback)).not.toContain('review_state');
});

it('removes an existing review entry when saved feedback is cleared', async () => {
  await writeFile(
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

  const feedback = JSON.parse(await readFile(join(root, 'viewer_feedback.json'), 'utf-8'));

  expect(feedback).toEqual({ reviews: [] });
});

it('loads viewer feedback keyed by eval_id', async () => {
  await writeFile(
    join(root, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Already reviewed.',
            eval_id: 1,
            overall: [{ comment: 'Existing first expectation note.' }],
            turns: [],
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
  await writeFile(
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
  await writeFile(
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
  await writeFile(
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
  await writeFile(
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

it('normalizes string eval ids from current feedback artifacts', async () => {
  await writeFile(
    join(root, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'String id note.',
            eval_id: '1',
            turns: [
              {
                expectations: [
                  {
                    comment: 'String id expectation note.',
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

  expect(iteration.runs[0]?.feedback.comments).toBe('String id note.');
  expect(iteration.runs[0]?.feedback.turns[0]?.expectations[0]).toEqual({
    comment: 'String id expectation note.',
    expectation_id: SAMPLE_SKILL_EXPECTATION_ID
  });
});

it('ignores malformed string eval ids in current feedback artifacts', async () => {
  await writeFile(
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

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.feedback.comments).toBe('');
});

it('updates existing viewer feedback entries by eval_id', async () => {
  await writeFile(
    join(root, 'viewer_feedback.json'),
    `${JSON.stringify(
      {
        reviews: [
          {
            comments: 'Old note.',
            eval_id: 1,
            overall: [],
            turns: [{ expectations: [{ comment: 'Old expectation note.' }], turn: 1 }],
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

  const feedback = JSON.parse(await readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
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

it('handles fallback metadata, missing comparisons, malformed turn artifacts, and unknown statuses', async () => {
  const manifestPath = join(root, 'run_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  delete manifest.skill_name;
  delete manifest.provider;
  delete manifest.model;
  delete manifest.effort;
  manifest.runs = [manifest.runs[0]];
  manifest.runs[0].status = 'queued';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  await writeFile(
    join(root, 'eval-1', 'skill', 'run_artifacts.json'),
    JSON.stringify({ artifacts: { turns: [{}] } }),
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.summary).toMatchObject({
    effort: 'high',
    model: 'gpt-5',
    provider: 'codex',
    skillName: 'conventional-commit-message'
  });
  expect(iteration.runs[0]?.comparisons.baseline).toBeUndefined();
  expect(iteration.runs[0]?.status).toBe('artifact_error');
  expect(iteration.runs[0]?.issues.map((issue) => issue.state)).toEqual(
    expect.arrayContaining(['missing_response', 'missing_transcript'])
  );
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
  await writeFile(join(root, 'iteration-0', 'eval-1', 'skill', 'grading.json'), '{', 'utf-8');

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
  await rm(join(root, 'iteration-0', 'eval-1', 'skill', 'turn-1', 'outputs', 'response.md'));

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

it('handles grading and metadata without expectation arrays', async () => {
  await writeFile(join(root, 'eval-1', 'eval_metadata.json'), JSON.stringify({ eval_id: 1 }), 'utf-8');
  await writeFile(
    join(root, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({ summary: { pass_rate: 1 }, eval_feedback: { overall: 'No expectations.' } }),
    'utf-8'
  );
  await writeFile(join(root, 'eval-1', 'skill', 'run_artifacts.json'), JSON.stringify({ artifacts: {} }), 'utf-8');

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.expectations).toEqual([]);
  expect(iteration.runs[0]?.artifactPaths.response).toBe('');
});

it('does not synthesize expectation rows from metadata when grading has no expectation results', async () => {
  await writeFile(
    join(root, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({ summary: { pass_rate: 0 } }),
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.expectations).toEqual([]);
  expect(iteration.runs[0]?.turns[0]?.expectations).toEqual([]);
  expect(iteration.runs[0]?.feedback.turns).toEqual([]);
});

it('keeps turn expectations empty when grading has no expectation results', async () => {
  await writeFile(join(root, 'eval-1', 'eval_metadata.json'), JSON.stringify({ eval_id: 1 }), 'utf-8');
  await writeFile(
    join(root, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({ summary: { pass_rate: 0 } }),
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.expectations).toEqual([]);
  expect(iteration.runs[0]?.turns[0]?.expectations).toEqual([]);
});

it('handles grader turn entries without expectation arrays', async () => {
  await writeFile(
    join(root, 'eval-1', 'skill', 'grading.json'),
    JSON.stringify({
      results: {
        turns: [{ turn: 1 }]
      },
      summary: { pass_rate: 1 }
    }),
    'utf-8'
  );

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.turns[0]?.expectations).toEqual([]);
});

it('treats omitted manifest statuses as success when artifacts are valid', async () => {
  const manifestPath = join(root, 'run_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  manifest.runs = [manifest.runs[0]];
  delete manifest.runs[0].status;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  const iteration = await loadIteration(root);

  expect(iteration.runs[0]?.status).toBe('success');
});

it('rejects a result root that points at a file', async () => {
  const fileRoot = join(root, 'run_manifest.json');

  await expect(loadIteration(fileRoot)).rejects.toThrow(/not a directory/i);
});

it('loads an empty iteration when the manifest has no run array', async () => {
  await writeFile(join(root, 'run_manifest.json'), JSON.stringify({ iteration: 1 }), 'utf-8');

  const iteration = await loadIteration(root);

  expect(iteration.runs).toEqual([]);
  expect(iteration.summary.runCount).toBe(0);
});

it('rejects a directory that is neither an iteration root nor an evaluation workspace', async () => {
  const unrelatedRoot = join(root, 'unrelated');
  await rm(unrelatedRoot, { force: true, recursive: true });
  await writeSampleIteration(join(unrelatedRoot, 'other', 'iteration-1'));
  await rm(join(unrelatedRoot, 'other'), { recursive: true });

  await expect(loadIteration(unrelatedRoot)).rejects.toThrow(/run_manifest\.json/);
});

it('rejects an evaluation workspace when no iteration manifests exist', async () => {
  const workspaceRoot = join(root, 'workspace-with-empty-results');
  await writeSampleIteration(join(workspaceRoot, 'results', 'draft'));
  await rm(join(workspaceRoot, 'results', 'draft'), { recursive: true });

  await expect(loadIteration(workspaceRoot)).rejects.toThrow(/run_manifest\.json/);
});

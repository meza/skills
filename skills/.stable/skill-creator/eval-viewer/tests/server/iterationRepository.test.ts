import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadIteration, saveFeedback } from '../../src/server/iterationRepository.js';
import { writeRichEvaluationWorkspace } from '../fixtures/richEvaluation.js';
import { writeSampleIteration } from '../fixtures/sampleIteration.js';

describe('iteration repository', () => {
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
      config: 'with_skill',
      status: 'success',
      passRate: 1,
      providerSessionId: '019e64c2-2d87-7a21-a12c-d569bab5c067',
      tokenCount: 1200,
      durationSeconds: 24,
      reviewState: 'not_reviewed',
      workingDirectory: join(root, 'eval-1', 'with_skill', 'work')
    });
    expect(iteration.runs[0]?.artifactPaths.runArtifacts).toBe(
      join(root, 'eval-1', 'with_skill', 'run_artifacts.json')
    );
    expect(iteration.runs[0]?.comparisons.withoutSkill).toMatchObject({
      config: 'without_skill',
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
      'internal-refactor-stays-refactor',
      'user-visible-fix-avoids-code-narration',
      'user-visible-fix-avoids-code-narration',
      'breaking-change-returns-full-message-when-needed',
      'missing-artifact-smoke'
    ]);
    expect(iteration.runs[0]?.expectations).toHaveLength(6);
    expect(iteration.runs[0]?.turns).toHaveLength(2);
    expect(iteration.runs[1]?.comparisons.withoutSkill).toMatchObject({
      config: 'without_skill',
      durationDelta: 0,
      passRateDelta: 0.5,
      tokenDelta: 24_840
    });
    expect(iteration.runs[3]?.issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        state: 'missing_comparison_target'
      })
    );
    expect(iteration.runs[4]?.issues.map((issue) => issue.state)).toEqual(
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
      join(root, 'eval-1', 'with_skill', 'grading.json'),
      JSON.stringify({
        executive_summary: 'The run satisfied all turn expectations.',
        results: {
          overall_expectations: [],
          turns: [
            {
              turn: 1,
              expectations: [
                {
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
      join(root, 'eval-1', 'with_skill', 'run_artifacts.json'),
      JSON.stringify({
        artifacts: {
          turns: [
            {
              turn: 1,
              response_path: join(
                root,
                '..',
                'iteration-5',
                'eval-1',
                'with_skill',
                'turn-1',
                'outputs',
                'response.md'
              ),
              transcript_path: join(
                root,
                '..',
                'iteration-5',
                'eval-1',
                'with_skill',
                'turn-1',
                'outputs',
                'transcript.md'
              )
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
              comments: '',
              eval_id: 1,
              overall: [],
              review_state: 'reviewed_with_comments',
              turns: [{ expectations: [{ comment: 'Nested turn feedback.' }], turn: 1 }],
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
      { expectations: [{ comment: 'Nested turn feedback.' }], turn: 1 }
    ]);
    expect(iteration.runs[0]?.issues.map((issue) => issue.state)).not.toContain('missing_response');
    expect(iteration.runs[0]?.issues.map((issue) => issue.state)).not.toContain('missing_transcript');
  });

  it('surfaces missing artifacts as run issues instead of hiding the run', async () => {
    await rm(join(root, 'eval-1', 'with_skill', 'grading.json'));
    await rm(join(root, 'eval-1', 'with_skill', 'raw_output.jsonl'));
    await rm(join(root, 'eval-1', 'with_skill', 'timing.json'));
    await rm(join(root, 'eval-1', 'with_skill', 'turn-1', 'outputs', 'response.md'));
    await rm(join(root, 'eval-1', 'with_skill', 'turn-1', 'outputs', 'transcript.md'));

    const iteration = await loadIteration(root);

    const run = iteration.runs.find((candidate) => candidate.config === 'with_skill');
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
    await writeFile(join(root, 'eval-1', 'with_skill', 'grading.json'), '{', 'utf-8');
    const manifestPath = join(root, 'run_manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    manifest.runs[0].status = 'failed';
    manifest.runs[0].error = 'executor timed out';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

    const iteration = await loadIteration(root);

    const run = iteration.runs.find((candidate) => candidate.config === 'with_skill');
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
    const gradingPath = join(root, 'eval-1', 'with_skill', 'grading.json');
    const before = await readFile(gradingPath, 'utf-8');

    await saveFeedback(root, {
      evalId: 1,
      overall: [],
      reviewState: 'reviewed_with_comments',
      comments: 'Looks correct, but add a stricter markdown assertion.',
      turns: [{ expectations: [{ comment: 'The first turn expectation is correctly supported.' }], turn: 1 }]
    });

    expect(await readFile(gradingPath, 'utf-8')).toBe(before);
    const feedback = JSON.parse(await readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
    expect(feedback.reviews).toContainEqual(
      expect.objectContaining({
        comments: 'Looks correct, but add a stricter markdown assertion.',
        eval_id: 1,
        review_state: 'reviewed_with_comments',
        turns: [{ expectations: [{ comment: 'The first turn expectation is correctly supported.' }], turn: 1 }]
      })
    );
    await expect(stat(join(root, 'viewer_feedback.json'))).resolves.toBeTruthy();
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
              review_state: 'reviewed_with_comments',
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
        overall: [{ comment: 'Existing first expectation note.' }],
        turns: []
      },
      reviewState: 'reviewed_with_comments',
      userComments: 'Already reviewed.'
    });
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
              review_state: 'not_reviewed',
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
      reviewState: 'reviewed_without_comments',
      turns: [{ expectations: [{ comment: 'Updated expectation note.' }], turn: 1 }]
    });

    const feedback = JSON.parse(await readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
    expect(feedback.reviews).toHaveLength(1);
    expect(feedback.reviews[0]).toMatchObject({
      comments: 'Updated note.',
      eval_id: 1,
      review_state: 'reviewed_without_comments',
      turns: [{ expectations: [{ comment: 'Updated expectation note.' }], turn: 1 }]
    });
  });

  it('loads legacy feedback maps without leaking config-qualified keys', async () => {
    await writeFile(
      join(root, 'viewer_feedback.json'),
      `${JSON.stringify(
        {
          reviews: {
            '1': {
              comments: 'Legacy note.',
              reviewState: 'unknown'
            }
          }
        },
        null,
        2
      )}\n`,
      'utf-8'
    );

    const iteration = await loadIteration(root);

    expect(iteration.runs[0]).toMatchObject({
      reviewState: 'not_reviewed',
      feedback: {
        comments: 'Legacy note.'
      },
      userComments: 'Legacy note.'
    });
  });

  it('normalizes string eval ids from legacy artifacts without writing strings back out', async () => {
    const manifestPath = join(root, 'run_manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    manifest.runs[0].eval_id = '1';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    await writeFile(
      join(root, 'viewer_feedback.json'),
      `${JSON.stringify(
        {
          reviews: [
            {
              comments: 'String id legacy note.',
              eval_id: '1',
              overall: [{ comment: 'Legacy overall note.' }],
              review_state: 'reviewed_with_comments',
              turns: [],
              updated_at: '2026-05-26T12:00:00.000Z'
            },
            {
              comments: 'Malformed legacy id note.',
              eval_id: 'not-a-number',
              overall: [],
              review_state: 'reviewed_with_comments',
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
    await saveFeedback(root, {
      comments: 'Numeric id update.',
      evalId: 1,
      overall: [{ comment: 'Updated note.' }],
      reviewState: 'reviewed_with_comments',
      turns: []
    });

    const feedback = JSON.parse(await readFile(join(root, 'viewer_feedback.json'), 'utf-8'));
    expect(iteration.runs[0]).toMatchObject({
      evalId: 1,
      feedback: {
        comments: 'String id legacy note.',
        overall: [{ comment: 'Legacy overall note.' }]
      }
    });
    expect(feedback.reviews).toHaveLength(2);
    expect(feedback.reviews[0]).toMatchObject({
      comments: 'Numeric id update.',
      eval_id: 1
    });
    expect(feedback.reviews[1]).toMatchObject({
      comments: 'Malformed legacy id note.',
      eval_id: 0
    });
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
      join(root, 'eval-1', 'with_skill', 'run_artifacts.json'),
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
    expect(iteration.runs[0]?.comparisons.withoutSkill).toBeUndefined();
    expect(iteration.runs[0]?.issues).toContainEqual(
      expect.objectContaining({
        artifact: 'without_skill',
        severity: 'warning',
        state: 'missing_comparison_target'
      })
    );
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
      config: 'with_skill',
      passRateDelta: 0
    });
  });

  it('handles grading and metadata without expectation arrays', async () => {
    await writeFile(join(root, 'eval-1', 'eval_metadata.json'), JSON.stringify({ eval_id: 1 }), 'utf-8');
    await writeFile(
      join(root, 'eval-1', 'with_skill', 'grading.json'),
      JSON.stringify({ summary: { pass_rate: 1 }, eval_feedback: { overall: 'No expectations.' } }),
      'utf-8'
    );
    await writeFile(
      join(root, 'eval-1', 'with_skill', 'run_artifacts.json'),
      JSON.stringify({ artifacts: {} }),
      'utf-8'
    );

    const iteration = await loadIteration(root);

    expect(iteration.runs[0]?.expectations).toEqual([]);
    expect(iteration.runs[0]?.artifactPaths.response).toBe('');
  });

  it('handles grader turn entries without expectation arrays', async () => {
    await writeFile(
      join(root, 'eval-1', 'with_skill', 'grading.json'),
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
});

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SAMPLE_SKILL_EXPECTATION_ID = '54a2c16d-1372-54bb-b939-547ebe82bf1e';
export const SAMPLE_BASELINE_EXPECTATION_ID = '5e5bdcd1-eae8-5eed-aff2-2a3f3c262ebc';

export async function writeSampleIteration(root: string, options: { iteration?: number } = {}): Promise<void> {
  await mkdir(join(root, 'eval-1', 'skill', 'turn-1', 'outputs'), {
    recursive: true
  });
  await mkdir(join(root, 'eval-1', 'baseline', 'turn-1', 'outputs'), {
    recursive: true
  });
  await mkdir(join(root, 'iteration-0', 'eval-1', 'skill', 'turn-1', 'outputs'), {
    recursive: true
  });

  await writeJson(join(root, 'run_manifest.json'), sampleManifest(root, options.iteration ?? 1));
  await writeJson(join(root, 'aggregated_results.json'), sampleAggregatedResults(root));
  await writeJson(join(root, 'eval-1', 'eval_metadata.json'), sampleEvalMetadata());
  await writeRun(root, 'eval-1', 'skill', {
    expectationId: SAMPLE_SKILL_EXPECTATION_ID,
    passed: true,
    evidence: 'The answer starts with feat!: and explains the migration.',
    response: 'feat!: support signing key rotation',
    totalTokens: 1200,
    duration: 24
  });
  await writeRun(root, 'eval-1', 'baseline', {
    expectationId: SAMPLE_BASELINE_EXPECTATION_ID,
    passed: false,
    evidence: 'The answer uses fix: and omits the breaking-change impact.',
    response: 'fix: update auth signing',
    totalTokens: 900,
    duration: 18
  });
  await writeRun(join(root, 'iteration-0'), 'eval-1', 'skill', {
    expectationId: SAMPLE_SKILL_EXPECTATION_ID,
    passed: false,
    evidence: 'Previous iteration used chore: and missed the breaking change.',
    response: 'chore: update auth config',
    totalTokens: 1400,
    duration: 30
  });
}

function sampleManifest(root: string, iteration: number) {
  return {
    skill_name: 'conventional-commit-message',
    eval_definitions_path: join(root, 'evals', 'evals.json'),
    iteration,
    provider: 'codex',
    model: 'gpt-5',
    effort: 'high',
    timestamp: '2026-05-25T10:00:00Z',
    total_elapsed_seconds: 42,
    runs: [
      {
        eval_id: 1,
        run_type: 'skill',
        session_id: '019e64c2-2d87-7a21-a12c-d569bab5c067',
        status: 'success',
        duration_ms: 24_000,
        total_tokens: 1200
      },
      {
        eval_id: 1,
        run_type: 'baseline',
        session_id: '019e64c2-2d2f-7ff2-a16c-9359a2b2304c',
        status: 'success',
        duration_ms: 18_000,
        total_tokens: 900
      }
    ]
  };
}

function sampleAggregatedResults(root: string) {
  return {
    metadata: {
      skill_name: 'conventional-commit-message',
      skill_path: join(root, 'skills', 'conventional-commit-message'),
      provider: 'codex',
      model: 'gpt-5',
      effort: 'high',
      timestamp: '2026-05-25T10:00:00Z'
    },
    graded_runs: [
      {
        eval_id: 1,
        eval_name: 'breaking-change-returns-full-message-when-needed',
        run_type: 'skill',
        result: { pass_rate: 1, passed: 1, failed: 0, total: 1, time_seconds: 24, tokens: 1200 },
        grading: {
          executive_summary: 'The run satisfies the eval.',
          results: {
            overall_expectations: [],
            turns: [
              {
                turn: 1,
                expectations: [
                  {
                    id: SAMPLE_SKILL_EXPECTATION_ID,
                    text: 'The response uses a breaking-change marker.',
                    passed: true,
                    evidence: 'The answer starts with feat!: and explains the migration.'
                  }
                ]
              }
            ]
          }
        }
      },
      {
        eval_id: 1,
        eval_name: 'breaking-change-returns-full-message-when-needed',
        run_type: 'baseline',
        result: { pass_rate: 0, passed: 0, failed: 1, total: 1, time_seconds: 18, tokens: 900 },
        grading: {
          executive_summary: 'The run misses the main requirement.',
          results: {
            overall_expectations: [],
            turns: [
              {
                turn: 1,
                expectations: [
                  {
                    id: SAMPLE_BASELINE_EXPECTATION_ID,
                    text: 'The response uses a breaking-change marker.',
                    passed: false,
                    evidence: 'The answer uses fix: and omits the breaking-change impact.'
                  }
                ]
              }
            ]
          }
        }
      }
    ],
    summary: {
      skill: {
        pass_rate: { mean: 1, stddev: 0, min: 1, max: 1 },
        time_seconds: { mean: 24, stddev: 0, min: 24, max: 24 },
        tokens: { mean: 1200, stddev: 0, min: 1200, max: 1200 }
      },
      baseline: {
        pass_rate: { mean: 0, stddev: 0, min: 0, max: 0 },
        time_seconds: { mean: 18, stddev: 0, min: 18, max: 18 },
        tokens: { mean: 900, stddev: 0, min: 900, max: 900 }
      }
    }
  };
}

function sampleEvalMetadata() {
  return {
    eval_id: 1,
    eval_name: 'breaking-change-returns-full-message-when-needed',
    turns: [
      {
        prompt: 'Generate a commit message for the staged changes.',
        expectations: ['The response uses a breaking-change marker.']
      }
    ]
  };
}

async function writeRun(
  root: string,
  evalDir: string,
  runType: string,
  run: {
    duration: number;
    evidence: string;
    expectationId: string;
    passed: boolean;
    response: string;
    totalTokens: number;
  }
): Promise<void> {
  const runTypeRoot = join(root, evalDir, runType);
  await mkdir(join(runTypeRoot, 'turn-1', 'outputs'), { recursive: true });
  await writeJson(join(runTypeRoot, 'run_artifacts.json'), {
    skill_name: 'conventional-commit-message',
    eval: {
      id: 1,
      eval_name: 'breaking-change-returns-full-message-when-needed',
      turns: [
        {
          prompt: 'Generate a commit message for the staged changes.',
          expectations: ['The response uses a breaking-change marker.']
        }
      ]
    },
    run_type: runType,
    artifacts: {
      results_dir_path: runTypeRoot,
      working_dir_path: join(runTypeRoot, 'work'),
      run_transcript_path: join(runTypeRoot, 'transcript.md'),
      raw_output_path: join(runTypeRoot, 'raw_output.jsonl'),
      timing_path: join(runTypeRoot, 'timing.json'),
      turns: [
        {
          turn: 1,
          response_path: join(runTypeRoot, 'turn-1', 'outputs', 'response.md'),
          transcript_path: join(runTypeRoot, 'turn-1', 'outputs', 'transcript.md')
        }
      ]
    },
    schema_path: join(runTypeRoot, 'grading_output_schema.json')
  });
  await writeJson(join(runTypeRoot, 'grading.json'), {
    executive_summary: run.passed ? 'The run satisfies the eval.' : 'The run misses the main requirement.',
    results: {
      overall_expectations: [],
      turns: [
        {
          turn: 1,
          expectations: [
            {
              id: run.expectationId,
              text: 'The response uses a breaking-change marker.',
              passed: run.passed,
              evidence: run.evidence
            }
          ]
        }
      ]
    },
    summary: {
      passed: run.passed ? 1 : 0,
      failed: run.passed ? 0 : 1,
      total: 1,
      pass_rate: run.passed ? 1 : 0
    }
  });
  await writeJson(join(runTypeRoot, 'timing.json'), {
    total_tokens: run.totalTokens,
    input_tokens: Math.floor(run.totalTokens / 2),
    output_tokens: Math.ceil(run.totalTokens / 2),
    duration_ms: run.duration * 1000,
    total_duration_seconds: run.duration,
    cost_usd: 0
  });
  await writeFile(join(runTypeRoot, 'raw_output.jsonl'), '{"type":"final"}\n', 'utf-8');
  await writeFile(join(runTypeRoot, 'turn-1', 'outputs', 'response.md'), run.response, 'utf-8');
  await writeFile(
    join(runTypeRoot, 'turn-1', 'outputs', 'transcript.md'),
    `USER: Generate a commit message\nASSISTANT: ${run.response}`,
    'utf-8'
  );
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

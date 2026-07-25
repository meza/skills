import type { IterationNumber } from '../../src/shared/viewModel.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SAMPLE_SKILL_EXPECTATION_ID = '54a2c16d-1372-54bb-b939-547ebe82bf1e';
export const SAMPLE_BASELINE_EXPECTATION_ID = '5e5bdcd1-eae8-5eed-aff2-2a3f3c262ebc';
const MILLISECONDS_PER_SECOND = 1000;

export async function writeSampleWorkspace(
  root: string,
  options: { iteration?: IterationNumber } = {}
): Promise<string> {
  const iteration = options.iteration ?? 1;
  const iterationRoot = join(root, 'results', `iteration-${iteration}`);
  await writeSampleIteration(iterationRoot, { iteration });
  return iterationRoot;
}

export async function writeSampleWorkspaceWithHistory(
  root: string,
  options: { iteration?: IterationNumber } = {}
): Promise<string> {
  const iteration = options.iteration ?? 1;
  const iterationRoot = await writeSampleWorkspace(root, { iteration });
  if (iteration > 0) {
    await writeSampleIteration(join(root, 'results', `iteration-${iteration - 1}`), {
      iteration: iteration - 1,
      scenario: 'previousIteration'
    });
  }
  return iterationRoot;
}

type SampleIterationScenario = 'currentIteration' | 'previousIteration';

export async function writeSampleIteration(
  root: string,
  options: { iteration?: IterationNumber; scenario?: SampleIterationScenario } = {}
): Promise<void> {
  const scenario = options.scenario ?? 'currentIteration';
  await mkdir(join(root, 'eval-1', 'skill', 'turn-1', 'outputs'), {
    recursive: true
  });
  await mkdir(join(root, 'eval-1', 'baseline', 'turn-1', 'outputs'), {
    recursive: true
  });

  await writeJson(join(root, 'run_manifest.json'), sampleManifest(root, options.iteration ?? 1));
  const skillResult = sampleSkillResult(scenario);
  await writeJson(join(root, 'aggregated_results.json'), sampleAggregatedResults(root, skillResult));
  await writeJson(join(root, 'eval-1', 'eval_metadata.json'), sampleEvalMetadata());
  await writeRun(root, 'eval-1', 'skill', {
    expectationId: SAMPLE_SKILL_EXPECTATION_ID,
    passed: skillResult.passed,
    evidence: skillResult.evidence,
    response: skillResult.response,
    totalTokens: skillResult.tokens,
    duration: skillResult.timeSeconds
  });
  await writeRun(root, 'eval-1', 'baseline', {
    expectationId: SAMPLE_BASELINE_EXPECTATION_ID,
    passed: false,
    evidence: 'The answer uses fix: and omits the breaking-change impact.',
    response: 'fix: update auth signing',
    totalTokens: 900,
    duration: 18
  });
}

function sampleManifest(root: string, iteration: IterationNumber) {
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
        execution_status: 'success',
        duration_ms: 24_000,
        total_tokens: 1200
      },
      {
        eval_id: 1,
        run_type: 'baseline',
        session_id: '019e64c2-2d2f-7ff2-a16c-9359a2b2304c',
        execution_status: 'success',
        duration_ms: 18_000,
        total_tokens: 900
      }
    ]
  };
}

function sampleAggregatedResults(root: string, skillResult: SampleSkillResult) {
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
        result: skillResult.result,
        grading: {
          executive_summary: skillResult.executiveSummary,
          results: {
            overall_expectations: [],
            turns: [
              {
                turn: 1,
                expectations: [
                  {
                    id: SAMPLE_SKILL_EXPECTATION_ID,
                    text: 'The response uses a breaking-change marker.',
                    passed: skillResult.passed,
                    evidence: skillResult.evidence
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
      skill: skillResult.summary,
      baseline: {
        pass_rate: { mean: 0, stddev: 0, min: 0, max: 0 },
        time_seconds: { mean: 18, stddev: 0, min: 18, max: 18 },
        tokens: { mean: 900, stddev: 0, min: 900, max: 900 }
      }
    }
  };
}

interface SampleSkillResult {
  evidence: string;
  executiveSummary: string;
  passed: boolean;
  response: string;
  result: {
    failed: number;
    pass_rate: number;
    passed: number;
    time_seconds: number;
    tokens: number;
    total: number;
  };
  summary: {
    pass_rate: ReturnType<typeof metricSummary>;
    time_seconds: ReturnType<typeof metricSummary>;
    tokens: ReturnType<typeof metricSummary>;
  };
  timeSeconds: number;
  tokens: number;
}

const sampleSkillResults: Record<SampleIterationScenario, SampleSkillResult> = {
  currentIteration: sampleSkillResult({
    evidence: 'The answer starts with feat!: and explains the migration.',
    executiveSummary: 'The run satisfies the eval.',
    passRate: 1,
    response: 'feat!: support signing key rotation',
    timeSeconds: 24,
    tokens: 1200
  }),
  previousIteration: sampleSkillResult({
    evidence: 'Previous iteration used chore: and missed the breaking change.',
    executiveSummary: 'The run misses the main requirement.',
    passRate: 0,
    response: 'chore: update auth config',
    timeSeconds: 30,
    tokens: 1400
  })
};

function sampleSkillResult(scenario: SampleIterationScenario): SampleSkillResult;
function sampleSkillResult({
  evidence,
  executiveSummary,
  passRate,
  response,
  timeSeconds,
  tokens
}: {
  evidence: string;
  executiveSummary: string;
  passRate: 0 | 1;
  response: string;
  timeSeconds: number;
  tokens: number;
}): SampleSkillResult;
function sampleSkillResult(
  input:
    | SampleIterationScenario
    | {
        evidence: string;
        executiveSummary: string;
        passRate: 0 | 1;
        response: string;
        timeSeconds: number;
        tokens: number;
      }
): SampleSkillResult {
  if (typeof input === 'string') {
    return sampleSkillResults[input];
  }
  return {
    evidence: input.evidence,
    executiveSummary: input.executiveSummary,
    passed: input.passRate === 1,
    response: input.response,
    result: {
      failed: input.passRate === 1 ? 0 : 1,
      pass_rate: input.passRate,
      passed: input.passRate,
      time_seconds: input.timeSeconds,
      tokens: input.tokens,
      total: 1
    },
    summary: {
      pass_rate: metricSummary(input.passRate),
      time_seconds: metricSummary(input.timeSeconds),
      tokens: metricSummary(input.tokens)
    },
    timeSeconds: input.timeSeconds,
    tokens: input.tokens
  };
}

function metricSummary(value: number) {
  return { max: value, mean: value, min: value, stddev: 0 };
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
    duration_ms: run.duration * MILLISECONDS_PER_SECOND,
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

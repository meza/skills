import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

  await writeJson(join(root, 'run_manifest.json'), {
    skill_name: 'conventional-commit-message',
    iteration: options.iteration ?? 1,
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
        duration_seconds: 24,
        total_tokens: 1200
      },
      {
        eval_id: 1,
        run_type: 'baseline',
        session_id: '019e64c2-2d2f-7ff2-a16c-9359a2b2304c',
        status: 'success',
        duration_seconds: 18,
        total_tokens: 900
      }
    ]
  });
  await writeJson(join(root, 'aggregated_results.json'), {
    metadata: {
      skill_name: 'conventional-commit-message',
      provider: 'codex',
      model: 'gpt-5',
      effort: 'high'
    },
    summary: {
      skill: { pass_rate: { mean: 1 }, time_seconds: { mean: 24 }, tokens: { mean: 1200 } },
      baseline: { pass_rate: { mean: 0 }, time_seconds: { mean: 18 }, tokens: { mean: 900 } }
    }
  });
  await writeJson(join(root, 'eval-1', 'eval_metadata.json'), {
    eval_id: 1,
    eval_name: 'breaking-change-returns-full-message-when-needed',
    outcome_expectations: ['Uses a breaking-change commit message when required'],
    turns: [
      {
        prompt: 'Generate a commit message for the staged changes.',
        expectations: ['The response uses a breaking-change marker.']
      }
    ]
  });
  await writeRun(root, 'eval-1', 'skill', {
    passed: true,
    evidence: 'The answer starts with feat!: and explains the migration.',
    response: 'feat!: support signing key rotation',
    totalTokens: 1200,
    duration: 24
  });
  await writeRun(root, 'eval-1', 'baseline', {
    passed: false,
    evidence: 'The answer uses fix: and omits the breaking-change impact.',
    response: 'fix: update auth signing',
    totalTokens: 900,
    duration: 18
  });
  await writeRun(join(root, 'iteration-0'), 'eval-1', 'skill', {
    passed: false,
    evidence: 'Previous iteration used chore: and missed the breaking change.',
    response: 'chore: update auth config',
    totalTokens: 1400,
    duration: 30
  });
}

async function writeRun(
  root: string,
  evalDir: string,
  runType: string,
  run: {
    duration: number;
    evidence: string;
    passed: boolean;
    response: string;
    totalTokens: number;
  }
): Promise<void> {
  const runTypeRoot = join(root, evalDir, runType);
  await mkdir(join(runTypeRoot, 'turn-1', 'outputs'), { recursive: true });
  await writeJson(join(runTypeRoot, 'run_artifacts.json'), {
    skill_name: 'conventional-commit-message',
    run_type: runType,
    artifacts: {
      results_dir_path: runTypeRoot,
      working_dir_path: join(runTypeRoot, 'work'),
      raw_output_path: join(runTypeRoot, 'raw_output.jsonl'),
      timing_path: join(runTypeRoot, 'timing.json'),
      turns: [
        {
          turn: 1,
          response_path: join(runTypeRoot, 'turn-1', 'outputs', 'response.md'),
          transcript_path: join(runTypeRoot, 'turn-1', 'outputs', 'transcript.md')
        }
      ]
    }
  });
  await writeJson(join(runTypeRoot, 'grading.json'), {
    expectations: [
      {
        text: 'The response uses a breaking-change marker.',
        passed: run.passed,
        evidence: run.evidence
      }
    ],
    summary: {
      passed: run.passed ? 1 : 0,
      failed: run.passed ? 0 : 1,
      total: 1,
      pass_rate: run.passed ? 1 : 0
    },
    eval_feedback: {
      suggestions: [],
      overall: run.passed ? 'The run satisfies the eval.' : 'The run misses the main requirement.'
    }
  });
  await writeJson(join(runTypeRoot, 'timing.json'), {
    total_tokens: run.totalTokens,
    total_duration_seconds: run.duration
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

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IterationNumber } from '../../src/shared/viewModel.js';

interface RichRun {
  duration: number;
  evalId: number;
  evalName: string;
  executiveSummary: string;
  expectations: RichExpectation[];
  finalResponse: string;
  sessionId?: string;
  runType: string;
  executionStatus?: string;
  totalTokens: number;
  turns: RichTurn[];
}

interface RichExpectation {
  evidence: string;
  id?: string;
  passed: boolean;
  scope: 'overall' | 'turn';
  text: string;
  turn?: number;
}

interface RichTurn {
  prompt: string;
  response: string;
  transcript: string;
}

export async function writeRichEvaluationWorkspace(workspaceRoot: string): Promise<string> {
  await rm(workspaceRoot, { force: true, recursive: true });
  const currentRoot = join(workspaceRoot, 'results', 'iteration-3');
  const previousRoot = join(workspaceRoot, 'results', 'iteration-2');
  await writeRichIteration(previousRoot, previousRuns(), 2);
  await writeRichIteration(currentRoot, currentRuns(), 3);
  return currentRoot;
}

async function writeRichIteration(root: string, runs: RichRun[], iteration: IterationNumber): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeJson(join(root, 'run_manifest.json'), {
    effort: 'default',
    eval_definitions_path: join(root, 'evals', 'evals.json'),
    iteration,
    model: 'gpt-5.5',
    provider: 'codex',
    runs: runs.map((run) => ({
      duration_ms: run.duration * 1000,
      eval_id: run.evalId,
      eval_name: run.evalName,
      run_type: run.runType,
      session_id: run.sessionId,
      execution_status: run.executionStatus ?? 'success',
      total_tokens: run.totalTokens
    })),
    skill_name: 'conventional-commit-message',
    timestamp: '2026-05-26T12:00:00Z',
    total_elapsed_seconds: runs.reduce((total, run) => total + run.duration, 0)
  });
  await writeJson(join(root, 'aggregated_results.json'), {
    metadata: {
      effort: 'default',
      model: 'gpt-5.5',
      provider: 'codex',
      skill_name: 'conventional-commit-message',
      skill_path: join(root, 'skills', 'conventional-commit-message'),
      timestamp: '2026-05-26T12:00:00Z'
    },
    graded_runs: runs.map((run) => ({
      eval_id: run.evalId,
      eval_name: run.evalName,
      run_type: run.runType,
      result: {
        pass_rate: run.expectations.filter((expectation) => expectation.passed).length / run.expectations.length,
        passed: run.expectations.filter((expectation) => expectation.passed).length,
        failed: run.expectations.filter((expectation) => !expectation.passed).length,
        total: run.expectations.length,
        time_seconds: run.duration,
        tokens: run.totalTokens
      },
      grading: {
        executive_summary: run.executiveSummary,
        results: gradingResults(run)
      }
    })),
    summary: {
      skill: {
        pass_rate: { mean: 0.82, stddev: 0, min: 0, max: 1 },
        time_seconds: { mean: 29.8, stddev: 0, min: 29.8, max: 29.8 },
        tokens: { mean: 118_450, stddev: 0, min: 118_450, max: 118_450 }
      },
      baseline: {
        pass_rate: { mean: 0.25, stddev: 0, min: 0.25, max: 0.25 },
        time_seconds: { mean: 21.4, stddev: 0, min: 21.4, max: 21.4 },
        tokens: { mean: 88_200, stddev: 0, min: 88_200, max: 88_200 }
      }
    }
  });

  const evals = new Map(runs.map((run) => [run.evalId, run]));
  for (const run of evals.values()) {
    await writeEvalMetadata(root, run);
  }
  for (const run of runs) {
    await writeRun(root, run);
  }
}

function currentRuns(): RichRun[] {
  return [
    richRun({
      evalId: 2,
      evalName: 'user-visible-fix-avoids-code-narration',
      expectations: [
        pass('The type is fix because the shipped behavior changes.', 1),
        pass('The subject describes the user-visible outcome.', 1),
        fail('The answer avoids implementation narration in the subject.', 1),
        pass('The final response keeps the format to one subject line.', 2)
      ],
      finalResponse: 'fix: prevent stale sessions from remaining active',
      sessionId: '019e64c2-4003-7e61-915d-6ae50d8ef8e3'
    }),
    richRun({
      runType: 'baseline',
      evalId: 2,
      evalName: 'user-visible-fix-avoids-code-narration',
      expectations: [
        fail('The type is fix because the shipped behavior changes.', 1),
        fail('The subject describes the user-visible outcome.', 1),
        fail('The answer avoids implementation narration in the subject.', 1),
        pass('The final response keeps the format to one subject line.', 2)
      ],
      finalResponse: 'refactor: update session validator',
      sessionId: '019e64c2-2d1c-7711-8713-279fb734a695',
      totalTokens: 88_219
    }),
    richRun({
      evalId: 1,
      evalName: 'internal-refactor-stays-refactor',
      expectations: [
        pass('The message classifies internal-only restructuring as refactor.', 1),
        pass('The subject avoids claiming a user-visible fix.', 1),
        pass('The answer inspects the staged diff before choosing the type.', 1),
        pass('The explanation does not invent public behavior.', 2),
        pass('The final output contains only the commit message.', 2),
        pass('The commit subject stays concise and conventional.', 2)
      ],
      finalResponse: 'refactor: centralize signing key lookup',
      sessionId: '019e64c2-2d87-7a21-a12c-d569bab5c067'
    }),
    richRun({
      evalId: 3,
      evalName: 'breaking-change-returns-full-message-when-needed',
      expectations: [
        pass('The response preserves the full breaking-change contract.'),
        pass('The subject communicates the public compatibility impact.'),
        pass('The body gives operators a clear migration path.'),
        pass('The final answer avoids burying the breaking change in prose.'),
        pass('The transcript shows the agent inspected the staged git change set before composing the message.', 1),
        pass('The response is a full Conventional Commit message with a subject and breaking-change body.', 1),
        pass('The subject starts with `feat` and marks the change as breaking with `!`.', 1),
        pass('The returned message includes a `BREAKING CHANGE:` explanation.', 1)
      ],
      finalResponse:
        'feat!: support HMAC signing key rotation\n\nBREAKING CHANGE: HMAC_SECRET is no longer supported. Configure HMAC_SIGNING_KEYS and HMAC_ACTIVE_KEY_ID before upgrading; legacy tokens without a key id are rejected.',
      sessionId: '019e64c2-2dda-7230-a74a-ab567ee30601',
      totalTokens: 150_605
    })
  ];
}

function previousRuns(): RichRun[] {
  return [
    richRun({
      evalId: 1,
      evalName: 'internal-refactor-stays-refactor',
      expectations: [pass('The answer inspects the staged diff before choosing the type.', 1)],
      finalResponse: 'chore: move signing helpers',
      sessionId: '019e64c3-3306-7091-9288-fe95e1797a5f',
      totalTokens: 151_200
    }),
    richRun({
      evalId: 2,
      evalName: 'user-visible-fix-avoids-code-narration',
      expectations: [fail('The subject describes the user-visible outcome.', 1)],
      finalResponse: 'refactor: update session cleanup',
      sessionId: '019e64c3-53b7-7f00-9d76-591071b67281',
      totalTokens: 95_000
    }),
    richRun({
      evalId: 3,
      evalName: 'breaking-change-returns-full-message-when-needed',
      expectations: [fail('The returned message includes a `BREAKING CHANGE:` explanation.', 1)],
      finalResponse: 'feat: support signing keys',
      sessionId: '019e64c3-78ec-74b1-9643-8adb77c22609',
      totalTokens: 111_000
    })
  ];
}

function richRun(
  overrides: Partial<RichRun> & Pick<RichRun, 'evalId' | 'evalName' | 'expectations' | 'finalResponse'>
): RichRun {
  const turns = [
    {
      prompt:
        'Generate the final commit message text for the current staged changes. Return only the final commit message text.',
      response: overrides.finalResponse,
      transcript: `USER: Generate the final commit message text.\nASSISTANT: ${overrides.finalResponse}`
    },
    {
      prompt: 'Confirm the chosen type still matches the staged surface.',
      response: overrides.finalResponse,
      transcript: `USER: Confirm the classification.\nASSISTANT: ${overrides.finalResponse}`
    }
  ];
  const runType = overrides.runType ?? 'skill';
  return {
    duration: 31,
    executiveSummary:
      'The run satisfies the relevant expectations and preserves the required Conventional Commit output contract.',
    executionStatus: 'success',
    totalTokens: 113_059,
    turns,
    ...overrides,
    runType,
    expectations: overrides.expectations.map((expectation, index) => ({
      ...expectation,
      id: expectation.id ?? richExpectationId(overrides.evalId, runType, index + 1)
    }))
  };
}

function richExpectationId(evalId: number, runType: string, index: number): string {
  const runTypePart = runType === 'baseline' ? 2 : 1;
  return `00000000-0000-5000-8000-${String(evalId).padStart(4, '0')}${String(runTypePart).padStart(4, '0')}${String(index).padStart(4, '0')}`;
}

function pass(text: string, turn?: number): RichExpectation {
  return {
    evidence: `Observed evidence for: ${text}`,
    passed: true,
    scope: turn ? 'turn' : 'overall',
    text,
    turn
  };
}

function fail(text: string, turn?: number): RichExpectation {
  return {
    evidence: `Failure evidence for: ${text}`,
    passed: false,
    scope: turn ? 'turn' : 'overall',
    text,
    turn
  };
}

async function writeEvalMetadata(root: string, run: RichRun): Promise<void> {
  await mkdir(join(root, `eval-${run.evalId}`), { recursive: true });
  await writeJson(join(root, `eval-${run.evalId}`, 'eval_metadata.json'), {
    eval_id: run.evalId,
    eval_name: run.evalName,
    turns: run.turns.map((turn, index) => ({
      expectations: run.expectations
        .filter((expectation) => expectation.scope === 'turn' && expectation.turn === index + 1)
        .map((expectation) => expectation.text),
      prompt: turn.prompt
    }))
  });
}

async function writeRun(root: string, run: RichRun): Promise<void> {
  const runTypeRoot = join(root, `eval-${run.evalId}`, run.runType);
  for (const [index] of run.turns.entries()) {
    await mkdir(join(runTypeRoot, `turn-${index + 1}`, 'outputs'), { recursive: true });
  }
  await writeJson(join(runTypeRoot, 'run_artifacts.json'), {
    eval: {
      id: run.evalId,
      eval_name: run.evalName,
      turns: run.turns.map((turn, index) => ({
        expectations: run.expectations
          .filter((expectation) => expectation.scope === 'turn' && expectation.turn === index + 1)
          .map((expectation) => expectation.text),
        prompt: turn.prompt
      }))
    },
    artifacts: {
      raw_output_path: join(runTypeRoot, 'raw_output.jsonl'),
      results_dir_path: runTypeRoot,
      run_transcript_path: join(runTypeRoot, 'transcript.md'),
      timing_path: join(runTypeRoot, 'timing.json'),
      turns: run.turns.map((_turn, index) => ({
        response_path: join(runTypeRoot, `turn-${index + 1}`, 'outputs', 'response.md'),
        transcript_path: join(runTypeRoot, `turn-${index + 1}`, 'outputs', 'transcript.md'),
        turn: index + 1
      })),
      working_dir_path: join(runTypeRoot, 'work')
    },
    run_type: run.runType,
    schema_path: join(runTypeRoot, 'grading_output_schema.json'),
    skill_name: 'conventional-commit-message'
  });
  await writeJson(join(runTypeRoot, 'grading.json'), {
    executive_summary: run.executiveSummary,
    results: gradingResults(run),
    summary: {
      failed: run.expectations.filter((expectation) => !expectation.passed).length,
      pass_rate: run.expectations.filter((expectation) => expectation.passed).length / run.expectations.length,
      passed: run.expectations.filter((expectation) => expectation.passed).length,
      total: run.expectations.length
    }
  });
  await writeJson(join(runTypeRoot, 'timing.json'), {
    cost_usd: 0,
    duration_ms: run.duration * 1000,
    input_tokens: Math.floor(run.totalTokens / 2),
    output_tokens: Math.ceil(run.totalTokens / 2),
    total_duration_seconds: run.duration,
    total_tokens: run.totalTokens
  });
  await writeFile(
    join(runTypeRoot, 'raw_output.jsonl'),
    JSON.stringify({ type: 'final', text: run.finalResponse }),
    'utf-8'
  );
  await Promise.all(
    run.turns.flatMap((turn, index) => [
      writeFile(join(runTypeRoot, `turn-${index + 1}`, 'outputs', 'response.md'), turn.response, 'utf-8'),
      writeFile(join(runTypeRoot, `turn-${index + 1}`, 'outputs', 'transcript.md'), turn.transcript, 'utf-8')
    ])
  );
}

function gradingResults(run: RichRun) {
  return {
    overall_expectations: run.expectations
      .filter((expectation) => expectation.scope === 'overall')
      .map(gradingExpectation),
    turns: run.turns.map((_turn, index) => ({
      expectations: run.expectations
        .filter((expectation) => expectation.scope === 'turn' && expectation.turn === index + 1)
        .map(gradingExpectation),
      turn: index + 1
    }))
  };
}

function gradingExpectation(expectation: RichExpectation) {
  return {
    evidence: expectation.evidence,
    id: expectation.id,
    passed: expectation.passed,
    text: expectation.text
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

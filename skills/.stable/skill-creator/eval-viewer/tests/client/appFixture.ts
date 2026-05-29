import type { IterationView, RunView } from '../../src/shared/viewModel.js';

export const TURN_EXPECTATION_ID = '54a2c16d-1372-54bb-b939-547ebe82bf1e';
export const OVERALL_EXPECTATION_ONE_ID = '10a375c5-12f4-5a15-b5bd-951f7d6204f1';
export const OVERALL_EXPECTATION_TWO_ID = '6fcfb2db-03d1-5bd4-971e-8a10929a7de3';
export const TURN_ONE_SECOND_EXPECTATION_ID = 'dc47174d-62a8-5820-bcb8-3a5cae2a10cb';
export const TURN_TWO_EXPECTATION_ID = '38a7ce2c-0814-5e8b-8890-bc073e225d75';

export function iterationView(): IterationView {
  return {
    feedbackPath: 'F:/runs/viewer_feedback.json',
    runs: [skillRunView(), baselineRunView()],
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

function skillRunView(): RunView {
  return {
    artifactPaths: skillArtifactPaths(),
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
    expectations: [passingTurnExpectation()],
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
        expectations: [passingTurnExpectation()],
        prompt: 'Generate a commit message for the staged changes.',
        response: 'feat!: support signing key rotation',
        transcript: 'USER: Generate a commit message'
      }
    ],
    workingDirectory: 'F:/workdirs/eval-1/skill'
  };
}

function baselineRunView(): RunView {
  return {
    artifactPaths: baselineArtifactPaths(),
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
  };
}

function passingTurnExpectation() {
  return {
    evidence: 'The answer starts with feat!:',
    id: TURN_EXPECTATION_ID,
    passed: true,
    scope: 'turn' as const,
    text: 'The response uses a breaking-change marker.',
    turn: 1
  };
}

function skillArtifactPaths() {
  return {
    grading: 'F:/runs/eval-1/skill/grading.json',
    rawOutput: 'F:/runs/eval-1/skill/raw_output.jsonl',
    response: 'F:/runs/eval-1/skill/turn-1/outputs/response.md',
    runArtifacts: 'F:/runs/eval-1/skill/run_artifacts.json',
    timing: 'F:/runs/eval-1/skill/timing.json',
    transcript: 'F:/runs/eval-1/skill/turn-1/outputs/transcript.md'
  };
}

function baselineArtifactPaths() {
  return {
    grading: 'F:/runs/eval-1/baseline/grading.json',
    rawOutput: 'F:/runs/eval-1/baseline/raw_output.jsonl',
    response: 'F:/runs/eval-1/baseline/turn-1/outputs/response.md',
    runArtifacts: 'F:/runs/eval-1/baseline/run_artifacts.json',
    timing: 'F:/runs/eval-1/baseline/timing.json',
    transcript: 'F:/runs/eval-1/baseline/turn-1/outputs/transcript.md'
  };
}

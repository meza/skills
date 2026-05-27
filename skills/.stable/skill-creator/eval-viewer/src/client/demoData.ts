import type { IterationView } from '../shared/viewModel.js';

export const demoIteration: IterationView = {
  feedbackPath: 'viewer_feedback.json',
  runs: [
    {
      artifactPaths: {
        grading: 'eval-1/skill/grading.json',
        rawOutput: 'eval-1/skill/raw_output.jsonl',
        response: 'eval-1/skill/turn-1/outputs/response.md',
        timing: 'eval-1/skill/timing.json',
        transcript: 'eval-1/skill/turn-1/outputs/transcript.md'
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
          expectations: [],
          finalResponse: 'fix: update auth signing',
          passRateDelta: 1,
          tokenDelta: 300
        }
      },
      runType: 'skill',
      durationSeconds: 24,
      evalId: 1,
      evalName: 'breaking-change-returns-full-message-when-needed',
      executiveSummary: 'The run satisfies the breaking-change expectation and explains the migration impact clearly.',
      expectations: [
        {
          evidence: 'The final answer starts with feat!: and names the signing key rotation.',
          passed: true,
          scope: 'overall',
          text: 'Uses a breaking-change commit message when required'
        }
      ],
      finalResponse: 'feat!: support signing key rotation',
      feedback: {
        comments: '',
        overall: [{ comment: '' }],
        turns: [{ expectations: [{ comment: '' }], turn: 1 }]
      },
      issues: [],
      passRate: 1,
      status: 'success',
      tokenCount: 1200,
      turns: [
        {
          expectations: [
            {
              evidence: 'The answer starts with feat!:',
              passed: true,
              scope: 'turn',
              text: 'The response uses a breaking-change marker.',
              turn: 1
            }
          ],
          prompt: 'Generate a commit message for the staged changes.',
          response: 'feat!: support signing key rotation',
          transcript: 'USER: Generate a commit message\nASSISTANT: feat!: support signing key rotation'
        }
      ]
    },
    {
      artifactPaths: {
        grading: 'eval-1/baseline/grading.json',
        rawOutput: 'eval-1/baseline/raw_output.jsonl',
        response: 'eval-1/baseline/turn-1/outputs/response.md',
        timing: 'eval-1/baseline/timing.json',
        transcript: 'eval-1/baseline/turn-1/outputs/transcript.md'
      },
      comparisons: {},
      runType: 'baseline',
      durationSeconds: 18,
      evalId: 1,
      evalName: 'breaking-change-returns-full-message-when-needed',
      executiveSummary: 'The run misses the main requirement.',
      expectations: [
        {
          evidence: 'The answer uses fix: and omits the breaking-change impact.',
          passed: false,
          scope: 'overall',
          text: 'Uses a breaking-change commit message when required'
        }
      ],
      finalResponse: 'fix: update auth signing',
      feedback: {
        comments: '',
        overall: [{ comment: '' }],
        turns: []
      },
      issues: [],
      passRate: 0,
      status: 'success',
      tokenCount: 900,
      turns: [
        {
          expectations: [],
          prompt: 'Generate a commit message for the staged changes.',
          response: 'fix: update auth signing',
          transcript: 'USER: Generate a commit message\nASSISTANT: fix: update auth signing'
        }
      ]
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

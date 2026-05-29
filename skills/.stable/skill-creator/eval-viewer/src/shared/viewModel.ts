export interface ArtifactIssue {
  artifact: string;
  message: string;
  severity: 'error' | 'warning';
  state: 'missing_comparison_target';
}

interface ExpectationViewBase {
  evidence: string;
  id: string;
  passed: boolean;
  text: string;
}

export interface OverallExpectationView extends ExpectationViewBase {
  scope: 'overall';
}

export interface TurnExpectationView extends ExpectationViewBase {
  scope: 'turn';
  turn: number;
}

export type ExpectationView = OverallExpectationView | TurnExpectationView;

export interface TurnView {
  expectations: ExpectationView[];
  prompt: string;
  response: string;
  transcript: string;
}

export interface RunComparisonView {
  durationDelta: number;
  expectations: ExpectationView[];
  finalResponse: string;
  passRateDelta: number;
  runType: string;
  tokenDelta: number;
}

export interface RunView {
  artifactPaths: {
    grading?: string;
    rawOutput?: string;
    response?: string;
    runArtifacts?: string;
    timing?: string;
    transcript?: string;
  };
  comparisons: {
    baseline?: RunComparisonView;
    previousIteration?: RunComparisonView;
  };
  durationSeconds: number;
  evalId: number;
  evalName: string;
  executiveSummary: string;
  expectations: ExpectationView[];
  finalResponse: string;
  issues: ArtifactIssue[];
  passRate: number;
  providerSessionId?: string;
  feedback: RunFeedbackView;
  runType: string;
  tokenCount: number;
  turns: TurnView[];
  userComments?: string;
  workingDirectory?: string;
}

export interface FeedbackExpectationView {
  comment: string;
  expectation_id: string;
}

export interface FeedbackTurnView {
  expectations: FeedbackExpectationView[];
  turn: number;
}

export interface RunFeedbackView {
  comments: string;
  overall: FeedbackExpectationView[];
  turns: FeedbackTurnView[];
}

export interface IterationView {
  feedbackPath: string;
  runs: RunView[];
  summary: {
    availableIterations: IterationNumber[];
    effort: string;
    isLatest: boolean;
    iteration: IterationNumber;
    latestIteration: IterationNumber;
    model: string;
    provider: string;
    runCount: number;
    skillName: string;
  };
}

export type IterationNumber = number;

export interface IterationIndexView {
  iterations: IterationNumber[];
  latestIteration: IterationNumber;
}

export interface FeedbackInput {
  comments: string;
  evalId: number;
  overall: FeedbackExpectationView[];
  turns: FeedbackTurnView[];
}

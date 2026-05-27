export type RunStatus = 'success' | 'failed' | 'exception' | 'artifact_error';

export interface ArtifactIssue {
  artifact: string;
  message: string;
  severity: 'error' | 'warning';
  state:
    | 'failed_execution'
    | 'invalid_grading'
    | 'missing_comparison_target'
    | 'missing_grading'
    | 'missing_raw_output'
    | 'missing_response'
    | 'missing_timing'
    | 'missing_transcript';
}

export interface ExpectationView {
  evidence: string;
  id?: string;
  passed: boolean;
  scope: 'overall' | 'turn';
  text: string;
  turn?: number;
}

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
  status: RunStatus;
  tokenCount: number;
  turns: TurnView[];
  userComments?: string;
  workingDirectory?: string;
}

export interface FeedbackExpectationView {
  comment: string;
  expectation_id?: string;
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
    effort: string;
    iteration: number;
    model: string;
    provider: string;
    runCount: number;
    skillName: string;
  };
}

export interface FeedbackInput {
  comments: string;
  evalId: number;
  overall: FeedbackExpectationView[];
  turns: FeedbackTurnView[];
}

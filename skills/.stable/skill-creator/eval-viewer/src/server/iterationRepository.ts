import { accessSync, constants, readFileSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type {
  ArtifactIssue,
  ExpectationView,
  FeedbackExpectationView,
  FeedbackInput,
  FeedbackTurnView,
  IterationView,
  ReviewState,
  RunComparisonView,
  RunFeedbackView,
  RunStatus,
  RunView,
  TurnView
} from '../shared/viewModel.js';

interface ManifestRun {
  config?: string;
  cost_usd?: number;
  duration_seconds?: number;
  error?: string;
  eval_id?: number | string;
  eval_name?: string;
  session_id?: string;
  status?: string;
  total_tokens?: number;
}

interface FeedbackArtifact {
  reviews: FeedbackReview[];
}

interface FeedbackReview {
  comments: string;
  eval_id: number;
  overall: FeedbackExpectationView[];
  review_state: ReviewState;
  turns: FeedbackTurnView[];
  updated_at: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function assertResultRoot(resultRoot: string): Promise<void> {
  try {
    const result = await stat(resultRoot);
    if (!result.isDirectory()) {
      throw new Error(`result root is not a directory: ${resultRoot}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not a directory')) {
      throw error;
    }
    throw new Error(`result root does not exist: ${resultRoot}`);
  }
}

export async function loadIteration(resultRoot: string): Promise<IterationView> {
  const resolvedRoot = await resolveResultRoot(resultRoot);
  const manifest = await readJson(join(resolvedRoot, 'run_manifest.json'));
  const aggregated = await readOptionalJson(join(resolvedRoot, 'aggregated_results.json'));
  const feedback = await readFeedback(resolvedRoot);
  const manifestRuns = Array.isArray(manifest.runs) ? (manifest.runs as ManifestRun[]) : [];
  const runs = await Promise.all(manifestRuns.map((run) => loadRun(resolvedRoot, run, feedback)));

  return {
    feedbackPath: feedbackPath(resolvedRoot),
    runs: addComparisons(runs, resolvedRoot),
    summary: {
      effort: textValue(manifest.effort ?? objectValue(aggregated?.metadata).effort, 'default'),
      iteration: numberValue(manifest.iteration, 0),
      model: textValue(manifest.model ?? objectValue(aggregated?.metadata).model, 'default'),
      provider: textValue(manifest.provider ?? objectValue(aggregated?.metadata).provider, 'unknown'),
      runCount: runs.length,
      skillName: textValue(manifest.skill_name ?? objectValue(aggregated?.metadata).skill_name, 'unknown skill')
    }
  };
}

export async function saveFeedback(resultRoot: string, feedback: FeedbackInput): Promise<FeedbackReview> {
  const resolvedRoot = await resolveResultRoot(resultRoot);
  const artifact = await readFeedback(resolvedRoot);
  const saved = {
    comments: feedback.comments,
    eval_id: feedback.evalId,
    overall: feedback.overall.map(feedbackExpectationFrom),
    review_state: feedback.reviewState,
    turns: feedback.turns.map((turn) => ({
      expectations: turn.expectations.map(feedbackExpectationFrom),
      turn: turn.turn
    })),
    updated_at: new Date().toISOString()
  };
  const existingIndex = artifact.reviews.findIndex((review) => review.eval_id === feedback.evalId);
  if (existingIndex >= 0) {
    artifact.reviews[existingIndex] = saved;
  } else {
    artifact.reviews.push(saved);
  }
  await writeFile(feedbackPath(resolvedRoot), `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
  return saved;
}

export async function readArtifactText(resultRoot: string, artifactPath: string): Promise<string> {
  const resolvedRoot = await resolveResultRoot(resultRoot);
  const root = resolve(resolvedRoot);
  const requested = resolve(artifactPath);
  const relativePath = relative(root, requested);
  if (relativePath.startsWith('..') || relativePath === '' || resolve(root, relativePath) !== requested) {
    throw new Error('Artifact path must be inside the result root.');
  }
  return readFile(requested, 'utf-8');
}

async function loadRun(resultRoot: string, manifestRun: ManifestRun, feedback: FeedbackArtifact): Promise<RunView> {
  const evalId = numberValue(manifestRun.eval_id, 0);
  const config = textValue(manifestRun.config, 'unknown');
  const evalDir = join(resultRoot, `eval-${evalId}`);
  const configDir = join(evalDir, config);
  const metadata = await readOptionalJson(join(evalDir, 'eval_metadata.json'));
  const gradingPath = join(configDir, 'grading.json');
  const timingPath = join(configDir, 'timing.json');
  const rawOutputPath = join(configDir, 'raw_output.jsonl');
  const artifactsPath = join(configDir, 'run_artifacts.json');
  const gradingResult = await readArtifactJson(gradingPath, 'grading.json', 'missing_grading', 'invalid_grading');
  const artifactsResult = await readArtifactJson(
    artifactsPath,
    'run_artifacts.json',
    'missing_response',
    'missing_response'
  );
  const timing = await readOptionalJson(timingPath);
  const artifactRoot = objectValue(artifactsResult.value?.artifacts);
  const metadataTurns = metadataTurnsFrom(metadata);
  const gradedTurns = gradedTurnExpectations(gradingResult.value);
  const turns = await loadTurns(metadataTurns, artifactRoot.turns, configDir, gradedTurns);
  const expectations = expectationsFrom(gradingResult.value, metadataTurns);
  const issues = [
    ...gradingResult.issues,
    ...missingFileIssue(rawOutputPath, 'raw_output.jsonl', 'missing_raw_output'),
    ...missingTimingIssue(timingPath, timing),
    ...turnIssues(turns),
    ...executionIssues(manifestRun)
  ];
  const review = feedback.reviews.find((candidate) => candidate.eval_id === evalId);
  const runFeedback = feedbackForExpectations(expectations, review);

  return {
    artifactPaths: {
      grading: gradingPath,
      rawOutput: rawOutputPath,
      response: firstTurnPath(artifactsResult.value, 'response_path', configDir),
      runArtifacts: artifactsPath,
      timing: timingPath,
      transcript: firstTurnPath(artifactsResult.value, 'transcript_path', configDir)
    },
    comparisons: {},
    config,
    durationSeconds: numberValue(timing?.total_duration_seconds ?? manifestRun.duration_seconds, 0),
    evalId,
    evalName: textValue(
      metadata?.eval_name ?? objectValue(metadata?.eval).eval_name ?? manifestRun.eval_name,
      `eval-${evalId}`
    ),
    executiveSummary: textValue(
      gradingResult.value?.executive_summary ?? objectValue(gradingResult.value?.eval_feedback).overall,
      ''
    ),
    expectations,
    finalResponse: turns.at(-1)?.response ?? '',
    issues,
    passRate: numberValue(objectValue(gradingResult.value?.summary).pass_rate, 0),
    providerSessionId: textValue(manifestRun.session_id, ''),
    feedback: runFeedback,
    reviewState: review?.review_state ?? 'not_reviewed',
    status: statusFor(manifestRun, issues),
    tokenCount: numberValue(timing?.total_tokens ?? manifestRun.total_tokens, 0),
    turns,
    userComments: runFeedback.comments,
    workingDirectory: textValue(artifactRoot.working_dir_path, '')
  };
}

async function loadTurns(
  metadataTurns: unknown,
  artifactTurns: unknown,
  configDir: string,
  gradedTurns: Map<number, ExpectationView[]>
): Promise<TurnView[]> {
  const turns = Array.isArray(artifactTurns) ? artifactTurns : [];
  const metadata = Array.isArray(metadataTurns) ? metadataTurns : [];
  return Promise.all(
    turns.map(async (turn, index) => {
      const turnRecord = objectValue(turn);
      const turnNumber = numberValue(turnRecord.turn, index + 1);
      const prompt = textValue(objectValue(metadata[index]).prompt, '');
      const responsePath = artifactPathWithFallback(
        textValue(turnRecord.response_path, ''),
        join(configDir, `turn-${turnNumber}`, 'outputs', 'response.md')
      );
      const transcriptPath = artifactPathWithFallback(
        textValue(turnRecord.transcript_path, ''),
        join(configDir, `turn-${turnNumber}`, 'outputs', 'transcript.md')
      );
      const response = await readOptionalText(responsePath);
      const transcript = await readOptionalText(transcriptPath);
      return {
        expectations: gradedTurns.get(turnNumber) ?? turnExpectations(metadata[index], turnNumber),
        prompt,
        response,
        transcript
      };
    })
  );
}

function addComparisons(runs: RunView[], resultRoot: string): RunView[] {
  return runs.map((run) => {
    const withoutSkillTarget = runs.find(
      (candidate) => candidate.evalId === run.evalId && candidate.config === 'without_skill'
    );
    const withoutSkill = run.config === 'with_skill' ? comparisonAgainst(run, withoutSkillTarget) : undefined;
    const comparisonIssues =
      run.config === 'with_skill' && !withoutSkillTarget
        ? [
            {
              artifact: 'without_skill',
              message: 'Missing without_skill comparison target.',
              severity: 'warning' as const,
              state: 'missing_comparison_target' as const
            }
          ]
        : [];
    return {
      ...run,
      comparisons: {
        previousIteration: previousIterationComparison(run, resultRoot),
        withoutSkill
      },
      issues: [...run.issues, ...comparisonIssues]
    };
  });
}

function comparisonAgainst(current: RunView, target: RunView | undefined): RunComparisonView | undefined {
  if (!target) {
    return undefined;
  }
  return {
    config: target.config,
    durationDelta: current.durationSeconds - target.durationSeconds,
    expectations: target.expectations,
    finalResponse: target.finalResponse,
    passRateDelta: current.passRate - target.passRate,
    tokenDelta: current.tokenCount - target.tokenCount
  };
}

function previousIterationComparison(current: RunView, resultRoot: string): RunComparisonView | undefined {
  const parent = dirname(resultRoot);
  const currentName = basename(resultRoot);
  const currentNumber = Number(currentName.replace('iteration-', ''));
  const previousRoot =
    Number.isFinite(currentNumber) && currentNumber > 0
      ? join(parent, `iteration-${currentNumber - 1}`)
      : join(resultRoot, 'iteration-0');
  const previousRun = previousRunCache(previousRoot, current.evalId, current.config);
  if (!previousRun) {
    return undefined;
  }
  return comparisonAgainst(current, previousRun);
}

function previousRunCache(previousRoot: string, evalId: number, config: string): RunView | undefined {
  const configDir = join(previousRoot, `eval-${evalId}`, config);
  try {
    const grading = readJsonSync(join(configDir, 'grading.json'));
    const timing = readJsonSync(join(configDir, 'timing.json'));
    const response = readTextSync(join(configDir, 'turn-1', 'outputs', 'response.md'));
    return {
      artifactPaths: {},
      comparisons: {},
      config,
      durationSeconds: numberValue(timing.total_duration_seconds, 0),
      evalId,
      evalName: `eval-${evalId}`,
      executiveSummary: '',
      expectations: [],
      finalResponse: response,
      feedback: emptyRunFeedback(),
      issues: [],
      passRate: numberValue(objectValue(grading.summary).pass_rate, 0),
      reviewState: 'not_reviewed',
      status: 'success',
      tokenCount: numberValue(timing.total_tokens, 0),
      turns: []
    };
  } catch {
    return undefined;
  }
}

function expectationsFrom(grading: Record<string, unknown> | undefined, metadataTurns: unknown): ExpectationView[] {
  const graded = Array.isArray(grading?.expectations) ? grading.expectations : [];
  const nestedResults = objectValue(grading?.results);
  const nestedOverall = Array.isArray(nestedResults.overall_expectations) ? nestedResults.overall_expectations : [];
  const overall = [...graded, ...nestedOverall].map((item) => expectationFrom(item, 'overall'));
  const turnResults = [...gradedTurnExpectations(grading).values()].flat();
  if (overall.length > 0 || turnResults.length > 0) {
    return [...overall, ...turnResults];
  }
  const metadata = Array.isArray(metadataTurns) ? metadataTurns : [];
  return [...overall, ...metadata.flatMap((turn, index) => turnExpectations(turn, index + 1))];
}

function gradedTurnExpectations(grading: Record<string, unknown> | undefined): Map<number, ExpectationView[]> {
  const result = new Map<number, ExpectationView[]>();
  const turns = objectValue(grading?.results).turns;
  if (!Array.isArray(turns)) {
    return result;
  }
  for (const turn of turns) {
    const turnRecord = objectValue(turn);
    const turnNumber = numberValue(turnRecord.turn, result.size + 1);
    const expectations = Array.isArray(turnRecord.expectations) ? turnRecord.expectations : [];
    result.set(
      turnNumber,
      expectations.map((expectation) => ({
        ...expectationFrom(expectation, 'turn'),
        turn: turnNumber
      }))
    );
  }
  return result;
}

function metadataTurnsFrom(metadata: Record<string, unknown> | undefined): unknown {
  const nestedEval = objectValue(metadata?.eval);
  return metadata?.turns ?? nestedEval.turns;
}

function turnExpectations(turn: unknown, turnNumber: number): ExpectationView[] {
  const expectations = Array.isArray((turn as Record<string, unknown> | undefined)?.expectations)
    ? ((turn as Record<string, unknown>).expectations as unknown[])
    : [];
  return expectations.map((text) => ({
    evidence: '',
    passed: false,
    scope: 'turn',
    text: textValue(text, ''),
    turn: turnNumber
  }));
}

function expectationFrom(item: unknown, scope: 'overall' | 'turn'): ExpectationView {
  const record = item as Record<string, unknown>;
  return {
    evidence: textValue(record.evidence, ''),
    passed: Boolean(record.passed),
    scope,
    text: textValue(record.text, '')
  };
}

async function readArtifactJson(
  path: string,
  artifact: string,
  missingState: ArtifactIssue['state'],
  invalidState: ArtifactIssue['state']
): Promise<{ issues: ArtifactIssue[]; value?: Record<string, unknown> }> {
  try {
    return { issues: [], value: await readJson(path) };
  } catch (error) {
    return {
      issues: [
        {
          artifact,
          message: error instanceof SyntaxError ? `Invalid ${artifact}` : `Missing ${artifact}`,
          severity: 'error',
          state: error instanceof SyntaxError ? invalidState : missingState
        }
      ]
    };
  }
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>;
}

async function readOptionalJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await readJson(path);
  } catch {
    return undefined;
  }
}

async function readOptionalText(path: string): Promise<string> {
  if (!path) {
    return '';
  }
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

function readJsonSync(path: string): Record<string, unknown> {
  return JSON.parse(readTextSync(path)) as Record<string, unknown>;
}

function readTextSync(path: string): string {
  return readFileSync(path, 'utf-8');
}

async function readFeedback(resultRoot: string): Promise<FeedbackArtifact> {
  const existing = await readOptionalJson(feedbackPath(resultRoot));
  const reviews = Array.isArray(existing?.reviews)
    ? existing.reviews.map((review) => feedbackReviewFrom(review))
    : Object.entries(objectValue(existing?.reviews)).map(([evalId, value]) =>
        feedbackReviewFrom(value, Number(evalId))
      );
  return {
    reviews
  };
}

function feedbackPath(resultRoot: string): string {
  return join(resultRoot, 'viewer_feedback.json');
}

function firstTurnPath(
  artifacts: Record<string, unknown> | undefined,
  key: 'response_path' | 'transcript_path',
  configDir: string
): string | undefined {
  const turns = objectValue(artifacts?.artifacts).turns;
  const firstTurn = Array.isArray(turns) ? objectValue(turns[0]) : {};
  const fallbackName = key === 'response_path' ? 'response.md' : 'transcript.md';
  return artifactPathWithFallback(
    textValue(firstTurn[key], ''),
    join(configDir, `turn-${numberValue(firstTurn.turn, 1)}`, 'outputs', fallbackName)
  );
}

function feedbackReviewFrom(value: unknown, fallbackEvalId = 0): FeedbackReview {
  const record = objectValue(value);
  return {
    comments: textValue(record.comments, ''),
    eval_id: numberValue(record.eval_id, fallbackEvalId),
    overall: feedbackExpectationsFrom(record.overall),
    review_state: reviewStateValue(record.review_state ?? record.reviewState),
    turns: feedbackTurnsFrom(record.turns),
    updated_at: textValue(record.updated_at ?? record.updatedAt, '')
  };
}

function feedbackForExpectations(expectations: ExpectationView[], review: FeedbackReview | undefined): RunFeedbackView {
  const overallExpectations = expectations.filter((expectation) => expectation.scope === 'overall');
  const turns = turnFeedbackShape(expectations);
  return {
    comments: review?.comments ?? '',
    overall: overallExpectations.map((_, index) => ({
      comment: review?.overall[index]?.comment ?? ''
    })),
    turns: turns.map((turn) => ({
      expectations: turn.expectations.map((_, index) => ({
        comment: review?.turns.find((candidate) => candidate.turn === turn.turn)?.expectations[index]?.comment ?? ''
      })),
      turn: turn.turn
    }))
  };
}

function turnFeedbackShape(expectations: ExpectationView[]): FeedbackTurnView[] {
  const turnMap = new Map<number, FeedbackExpectationView[]>();
  for (const expectation of expectations) {
    if (expectation.scope !== 'turn') {
      continue;
    }
    const turn = expectation.turn as number;
    turnMap.set(turn, [...(turnMap.get(turn) ?? []), { comment: '' }]);
  }
  return [...turnMap.entries()].map(([turn, expectationFeedback]) => ({
    expectations: expectationFeedback,
    turn
  }));
}

function emptyRunFeedback(): RunFeedbackView {
  return {
    comments: '',
    overall: [],
    turns: []
  };
}

function feedbackExpectationFrom(value: unknown): FeedbackExpectationView {
  const record = objectValue(value);
  return {
    comment: textValue(record.comment, '')
  };
}

function feedbackExpectationsFrom(value: unknown): FeedbackExpectationView[] {
  return Array.isArray(value) ? value.map(feedbackExpectationFrom) : [];
}

function feedbackTurnsFrom(value: unknown): FeedbackTurnView[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((turn, index) => {
    const record = objectValue(turn);
    return {
      expectations: feedbackExpectationsFrom(record.expectations),
      turn: numberValue(record.turn, index + 1)
    };
  });
}

function reviewStateValue(value: unknown): ReviewState {
  if (value === 'reviewed_with_comments' || value === 'reviewed_without_comments') {
    return value;
  }
  return 'not_reviewed';
}

function artifactPathWithFallback(recordedPath: string, fallbackPath: string): string {
  if (!recordedPath) {
    return '';
  }
  if (recordedPath && existsSync(recordedPath)) {
    return recordedPath;
  }
  return existsSync(fallbackPath) ? fallbackPath : recordedPath;
}

async function resolveResultRoot(resultRoot: string): Promise<string> {
  await assertResultRoot(resultRoot);
  if (existsSync(join(resultRoot, 'run_manifest.json'))) {
    return resultRoot;
  }
  const resultsRoot = join(resultRoot, 'results');
  if (!existsSync(resultsRoot)) {
    return resultRoot;
  }
  const entries = await readdir(resultsRoot, { withFileTypes: true });
  const iterationRoots = entries
    .filter((entry) => entry.isDirectory() && /^iteration-\d+$/.test(entry.name))
    .map((entry) => join(resultsRoot, entry.name))
    .filter((entryPath) => existsSync(join(entryPath, 'run_manifest.json')))
    .sort((left, right) => iterationNumber(right) - iterationNumber(left));
  return iterationRoots[0] ?? resultRoot;
}

function iterationNumber(path: string): number {
  return Number(basename(path).replace('iteration-', ''));
}

function statusFor(manifestRun: ManifestRun, issues: ArtifactIssue[]): RunStatus {
  if (issues.some((issue) => issue.severity === 'error')) {
    return 'artifact_error';
  }
  const status = manifestRun.status;
  if (status === 'failed' || status === 'exception' || status === 'success') {
    return status;
  }
  return 'success';
}

function executionIssues(manifestRun: ManifestRun): ArtifactIssue[] {
  if (manifestRun.status === 'success' || !manifestRun.status) {
    return [];
  }
  return [
    {
      artifact: 'run_manifest.json',
      message: textValue(manifestRun.error, `Execution status: ${manifestRun.status}`),
      severity: 'error',
      state: 'failed_execution'
    }
  ];
}

function missingFileIssue(path: string, artifact: string, state: ArtifactIssue['state']): ArtifactIssue[] {
  return existsSync(path)
    ? []
    : [
        {
          artifact,
          message: `Missing ${artifact}`,
          severity: 'error',
          state
        }
      ];
}

function missingTimingIssue(path: string, timing: unknown): ArtifactIssue[] {
  return timing ? [] : missingFileIssue(path, 'timing.json', 'missing_timing');
}

function turnIssues(turns: TurnView[]): ArtifactIssue[] {
  return turns.flatMap((turn) => {
    const issues: ArtifactIssue[] = [];
    if (!turn.response) {
      issues.push({
        artifact: 'response.md',
        message: 'Missing response.md',
        severity: 'error',
        state: 'missing_response'
      });
    }
    if (!turn.transcript) {
      issues.push({
        artifact: 'transcript.md',
        message: 'Missing transcript.md',
        severity: 'error',
        state: 'missing_transcript'
      });
    }
    return issues;
  });
}

function existsSync(path: string): boolean {
  try {
    accessSync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

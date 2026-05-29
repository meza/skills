import { accessSync, constants } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { feedbackTurnShape } from '../shared/feedbackModel.js';
import type {
  ArtifactIssue,
  ExpectationView,
  FeedbackExpectationView,
  FeedbackInput,
  FeedbackTurnView,
  IterationView,
  OverallExpectationView,
  RunComparisonView,
  RunFeedbackView,
  RunStatus,
  RunView,
  TurnExpectationView,
  TurnView
} from '../shared/viewModel.js';

interface ManifestRun {
  cost_usd?: number;
  duration_seconds?: number;
  error?: string;
  eval_id?: number | string;
  eval_name?: string;
  run_type?: string;
  session_id?: string;
  status?: string;
  total_tokens?: number;
}

interface FeedbackArtifact {
  reviews: FeedbackReview[];
}

interface FeedbackReview {
  comments?: string;
  eval_id: number;
  overall?: FeedbackExpectationView[];
  turns?: FeedbackTurnView[];
  updated_at: string;
}

interface RunFilePaths {
  artifacts: string;
  grading: string;
  rawOutput: string;
  timing: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Confirms that a requested eval result location can be used by the viewer.
 *
 * @param resultRoot - Local path supplied by the server startup flow or repository caller.
 */
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

/**
 * Builds the browser view model for the eval iteration a reviewer wants to inspect.
 *
 * @param resultRoot - Local eval result location chosen by the reviewer or server startup flow.
 */
export async function loadIteration(resultRoot: string): Promise<IterationView> {
  const resolvedRoot = await resolveResultRoot(resultRoot);
  const manifest = await readJson(join(resolvedRoot, 'run_manifest.json'));
  const aggregated = await readOptionalJson(join(resolvedRoot, 'aggregated_results.json'));
  const feedback = await readFeedback(resolvedRoot);
  const manifestRuns = Array.isArray(manifest.runs) ? (manifest.runs as ManifestRun[]) : [];
  const runs = await Promise.all(manifestRuns.map((run) => loadRun(resolvedRoot, run, feedback)));
  if (runs.length === 0) {
    throw new Error('Evaluation results contain no runs to review.');
  }

  return {
    feedbackPath: feedbackPath(resolvedRoot),
    runs: await loadComparisonsForRuns(runs, resolvedRoot),
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

/**
 * Persists a reviewer's feedback for one eval in the viewer-owned feedback artifact.
 *
 * @param resultRoot - Local eval result location that owns the feedback artifact.
 * @param feedback - Review notes and expectation comments submitted by the browser.
 */
export async function saveFeedback(resultRoot: string, feedback: FeedbackInput): Promise<FeedbackReview> {
  const resolvedRoot = await resolveResultRoot(resultRoot);
  const artifact = await readFeedback(resolvedRoot);
  const comments = feedback.comments.trim();
  const overall = filledFeedbackExpectations(feedback.overall);
  const turns = filledFeedbackTurns(feedback.turns);
  const saved: FeedbackReview = {
    eval_id: feedback.evalId,
    updated_at: new Date().toISOString()
  };
  if (comments) {
    saved.comments = comments;
  }
  if (overall.length > 0) {
    saved.overall = overall;
  }
  if (turns.length > 0) {
    saved.turns = turns;
  }
  const existingIndex = artifact.reviews.findIndex((review) => review.eval_id === feedback.evalId);
  if (!saved.comments && !saved.overall && !saved.turns) {
    if (existingIndex >= 0) {
      artifact.reviews.splice(existingIndex, 1);
    }
    await writeFile(feedbackPath(resolvedRoot), `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
    return saved;
  }
  if (existingIndex >= 0) {
    artifact.reviews[existingIndex] = saved;
  } else {
    artifact.reviews.push(saved);
  }
  await writeFile(feedbackPath(resolvedRoot), `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
  return saved;
}

/**
 * Reads an eval artifact so the browser can display its text content.
 *
 * @param resultRoot - Local eval result location that defines the readable artifact set.
 * @param artifactPath - Local artifact path requested by the browser.
 */
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
  const runType = textValue(manifestRun.run_type, 'unknown');
  const evalDir = join(resultRoot, `eval-${evalId}`);
  const runTypeDir = join(evalDir, runType);
  const filePaths = runFilePaths(runTypeDir);
  const { artifacts, grading, metadata, timing } = await readRunArtifacts(evalDir, filePaths);
  const artifactRoot = objectValue(artifacts.artifacts);
  const metadataTurns = metadataTurnsFrom(metadata);
  const gradedTurns = gradedTurnExpectations(grading);
  const turns = await loadTurns(metadataTurns, artifactRoot.turns, gradedTurns);
  if (turns.length === 0) {
    throw new Error('Missing response.md');
  }
  const expectations = expectationsFrom(grading);
  const issues: ArtifactIssue[] = [];
  const review = feedback.reviews.find((candidate) => candidate.eval_id === evalId);
  const runFeedback = feedbackForExpectations(expectations, review);

  return {
    artifactPaths: artifactPaths(artifactRoot, filePaths),
    comparisons: {},
    durationSeconds: numberValue(timing.total_duration_seconds ?? manifestRun.duration_seconds, 0),
    evalId,
    evalName: textValue(
      metadata?.eval_name ?? objectValue(metadata?.eval).eval_name ?? manifestRun.eval_name,
      `eval-${evalId}`
    ),
    executiveSummary: textValue(grading.executive_summary ?? objectValue(grading.eval_feedback).overall, ''),
    expectations,
    finalResponse: (turns[turns.length - 1] as TurnView).response,
    issues,
    passRate: numberValue(objectValue(grading.summary).pass_rate, 0),
    providerSessionId: textValue(manifestRun.session_id, ''),
    feedback: runFeedback,
    runType,
    status: statusFor(manifestRun),
    tokenCount: numberValue(timing.total_tokens ?? manifestRun.total_tokens, 0),
    turns,
    userComments: runFeedback.comments,
    workingDirectory: textValue(artifactRoot.working_dir_path, '')
  };
}

function runFilePaths(runTypeDir: string): RunFilePaths {
  return {
    artifacts: join(runTypeDir, 'run_artifacts.json'),
    grading: join(runTypeDir, 'grading.json'),
    rawOutput: join(runTypeDir, 'raw_output.jsonl'),
    timing: join(runTypeDir, 'timing.json')
  };
}

async function readRunArtifacts(
  evalDir: string,
  filePaths: RunFilePaths
): Promise<{
  artifacts: Record<string, unknown>;
  grading: Record<string, unknown>;
  metadata: Record<string, unknown> | undefined;
  timing: Record<string, unknown>;
}> {
  const [metadata, grading, artifacts, timing] = await Promise.all([
    readOptionalJson(join(evalDir, 'eval_metadata.json')),
    readRequiredJson(filePaths.grading, 'grading.json'),
    readRequiredJson(filePaths.artifacts, 'run_artifacts.json'),
    readRequiredJson(filePaths.timing, 'timing.json'),
    readRequiredText(filePaths.rawOutput, 'raw_output.jsonl')
  ]);

  return {
    artifacts,
    grading,
    metadata,
    timing
  };
}

function artifactPaths(artifactRoot: Record<string, unknown>, filePaths: RunFilePaths): RunView['artifactPaths'] {
  return {
    grading: filePaths.grading,
    rawOutput: filePaths.rawOutput,
    response: firstTurnPath(artifactRoot, 'response_path'),
    runArtifacts: filePaths.artifacts,
    timing: filePaths.timing,
    transcript: firstTurnPath(artifactRoot, 'transcript_path')
  };
}

async function loadTurns(
  metadataTurns: unknown,
  artifactTurns: unknown,
  gradedTurns: Map<number, TurnExpectationView[]>
): Promise<TurnView[]> {
  const turns = Array.isArray(artifactTurns) ? artifactTurns : [];
  const metadata = Array.isArray(metadataTurns) ? metadataTurns : [];
  return Promise.all(
    turns.map(async (turn, index) => {
      const turnRecord = objectValue(turn);
      const turnNumber = numberValue(turnRecord.turn, index + 1);
      const prompt = textValue(objectValue(metadata[index]).prompt, '');
      const responsePath = textValue(turnRecord.response_path, '');
      const transcriptPath = textValue(turnRecord.transcript_path, '');
      const response = await readRequiredText(responsePath, 'response.md');
      const transcript = await readRequiredText(transcriptPath, 'transcript.md');
      return {
        expectations: gradedTurns.get(turnNumber) ?? [],
        prompt,
        response,
        transcript
      };
    })
  );
}

async function loadComparisonsForRuns(runs: RunView[], resultRoot: string): Promise<RunView[]> {
  return Promise.all(
    runs.map(async (run) => {
      const previousIteration = await loadPreviousIterationComparison(run, resultRoot);
      const issues = previousIteration.issue ? [...run.issues, previousIteration.issue] : run.issues;
      const baselineTarget = runs.find(
        (candidate) => candidate.evalId === run.evalId && candidate.runType === 'baseline'
      );
      const baseline = run.runType === 'skill' ? comparisonAgainst(run, baselineTarget) : undefined;
      return {
        ...run,
        comparisons: {
          baseline,
          previousIteration: previousIteration.comparison
        },
        issues
      };
    })
  );
}

function comparisonAgainst(current: RunView, target: RunView | undefined): RunComparisonView | undefined {
  if (!target) {
    return undefined;
  }
  return {
    durationDelta: current.durationSeconds - target.durationSeconds,
    expectations: target.expectations,
    finalResponse: target.finalResponse,
    passRateDelta: current.passRate - target.passRate,
    runType: target.runType,
    tokenDelta: current.tokenCount - target.tokenCount
  };
}

async function loadPreviousIterationComparison(
  current: RunView,
  resultRoot: string
): Promise<{ comparison?: RunComparisonView; issue?: ArtifactIssue }> {
  const parent = dirname(resultRoot);
  const currentName = basename(resultRoot);
  const currentNumber = Number(currentName.replace('iteration-', ''));
  const previousRoot =
    Number.isFinite(currentNumber) && currentNumber > 0
      ? join(parent, `iteration-${currentNumber - 1}`)
      : join(resultRoot, 'iteration-0');
  const previousRun = await loadPreviousRunComparisonTarget(previousRoot, current.evalId, current.runType);
  if (!previousRun.run) {
    return previousRun.issue ? { issue: previousRun.issue } : {};
  }
  return {
    comparison: comparisonAgainst(current, previousRun.run)
  };
}

async function loadPreviousRunComparisonTarget(
  previousRoot: string,
  evalId: number,
  runType: string
): Promise<{ run?: RunView; issue?: ArtifactIssue }> {
  const runTypeDir = join(previousRoot, `eval-${evalId}`, runType);
  try {
    await stat(runTypeDir);
  } catch {
    return {};
  }
  try {
    const [grading, timing, response] = await Promise.all([
      readJson(join(runTypeDir, 'grading.json')),
      readJson(join(runTypeDir, 'timing.json')),
      readFile(join(runTypeDir, 'turn-1', 'outputs', 'response.md'), 'utf-8')
    ]);
    return {
      run: {
        artifactPaths: {},
        comparisons: {},
        durationSeconds: numberValue(timing.total_duration_seconds, 0),
        evalId,
        evalName: `eval-${evalId}`,
        executiveSummary: '',
        expectations: [],
        finalResponse: response,
        feedback: emptyRunFeedback(),
        issues: [],
        passRate: numberValue(objectValue(grading.summary).pass_rate, 0),
        runType,
        status: 'success',
        tokenCount: numberValue(timing.total_tokens, 0),
        turns: []
      }
    };
  } catch (error) {
    return {
      issue: {
        artifact: runTypeDir,
        message:
          error instanceof SyntaxError
            ? 'Invalid previous iteration comparison target'
            : 'Missing previous iteration comparison target',
        severity: 'warning',
        state: 'missing_comparison_target'
      }
    };
  }
}

function expectationsFrom(grading: Record<string, unknown> | undefined): ExpectationView[] {
  const nestedResults = objectValue(grading?.results);
  const nestedOverall = Array.isArray(nestedResults.overall_expectations) ? nestedResults.overall_expectations : [];
  const overall = nestedOverall.map(overallExpectationFrom);
  const turnResults = [...gradedTurnExpectations(grading).values()].flat();
  return [...overall, ...turnResults];
}

function gradedTurnExpectations(grading: Record<string, unknown> | undefined): Map<number, TurnExpectationView[]> {
  const result = new Map<number, TurnExpectationView[]>();
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
      expectations.map((expectation) => turnExpectationFrom(expectation, turnNumber))
    );
  }
  return result;
}

function metadataTurnsFrom(metadata: Record<string, unknown> | undefined): unknown {
  const nestedEval = objectValue(metadata?.eval);
  return metadata?.turns ?? nestedEval.turns;
}

function overallExpectationFrom(item: unknown): OverallExpectationView {
  const record = item as Record<string, unknown>;
  return {
    evidence: textValue(record.evidence, ''),
    id: textValue(record.id, ''),
    passed: Boolean(record.passed),
    scope: 'overall',
    text: textValue(record.text, '')
  };
}

function turnExpectationFrom(item: unknown, turn: number): TurnExpectationView {
  const record = item as Record<string, unknown>;
  return {
    evidence: textValue(record.evidence, ''),
    id: textValue(record.id, ''),
    passed: Boolean(record.passed),
    scope: 'turn',
    text: textValue(record.text, ''),
    turn
  };
}

async function readRequiredJson(path: string, artifact: string): Promise<Record<string, unknown>> {
  try {
    return await readJson(path);
  } catch (error) {
    throw new Error(error instanceof SyntaxError ? `Invalid ${artifact}` : `Missing ${artifact}`);
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

async function readRequiredText(path: string, artifact: string): Promise<string> {
  if (!path) {
    throw new Error(`Missing ${artifact}`);
  }
  try {
    return await readFile(path, 'utf-8');
  } catch {
    throw new Error(`Missing ${artifact}`);
  }
}

async function readFeedback(resultRoot: string): Promise<FeedbackArtifact> {
  const existing = await readOptionalJson(feedbackPath(resultRoot));
  const reviews = Array.isArray(existing?.reviews) ? existing.reviews.map((review) => feedbackReviewFrom(review)) : [];
  return {
    reviews
  };
}

function feedbackPath(resultRoot: string): string {
  return join(resultRoot, 'viewer_feedback.json');
}

function firstTurnPath(artifactRoot: Record<string, unknown>, key: 'response_path' | 'transcript_path'): string {
  const turns = artifactRoot.turns as unknown[];
  const firstTurn = objectValue(turns[0]);
  return textValue(firstTurn[key], '');
}

function feedbackReviewFrom(value: unknown): FeedbackReview {
  const record = objectValue(value);
  return {
    comments: textValue(record.comments, '') || undefined,
    eval_id: numberValue(record.eval_id, 0),
    overall: feedbackExpectationsFrom(record.overall),
    turns: feedbackTurnsFrom(record.turns),
    updated_at: textValue(record.updated_at, '')
  };
}

function feedbackForExpectations(expectations: ExpectationView[], review: FeedbackReview | undefined): RunFeedbackView {
  const overallExpectations = expectations.filter((expectation) => expectation.scope === 'overall');
  const turns = feedbackTurnShape(expectations);
  return {
    comments: review?.comments ?? '',
    overall: overallExpectations.map((expectation, index) =>
      feedbackForExpectation(expectation, review?.overall ?? [], index)
    ),
    turns: turns.map((turn) => ({
      expectations: turn.expectations.map((expectation, index) =>
        feedbackForExpectation(
          expectation,
          review?.turns?.find((candidate) => candidate.turn === turn.turn)?.expectations ?? [],
          index
        )
      ),
      turn: turn.turn
    }))
  };
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
    comment: textValue(record.comment, ''),
    expectation_id: textValue(record.expectation_id, '')
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

function feedbackForExpectation(
  expectation: ExpectationView | FeedbackExpectationView,
  feedback: FeedbackExpectationView[] | undefined,
  _expectationIndex: number
): FeedbackExpectationView {
  const expectationId = feedbackExpectationId(expectation);
  const matched = feedback?.find((candidate) => candidate.expectation_id === expectationId);
  return {
    comment: matched?.comment ?? '',
    expectation_id: expectationId
  };
}

function feedbackExpectationId(expectation: ExpectationView | FeedbackExpectationView): string {
  return 'comment' in expectation ? expectation.expectation_id : expectation.id;
}

function filledFeedbackExpectations(expectations: FeedbackExpectationView[]): FeedbackExpectationView[] {
  return expectations.flatMap((expectation) => {
    const comment = expectation.comment.trim();
    return comment && expectation.expectation_id
      ? [
          {
            comment,
            expectation_id: expectation.expectation_id
          }
        ]
      : [];
  });
}

function filledFeedbackTurns(turns: FeedbackTurnView[]): FeedbackTurnView[] {
  return turns.flatMap((turn) => {
    const expectations = filledFeedbackExpectations(turn.expectations);
    return expectations.length > 0 ? [{ expectations, turn: turn.turn }] : [];
  });
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

function statusFor(manifestRun: ManifestRun): RunStatus {
  const status = manifestRun.status;
  if (status === 'failed' || status === 'exception' || status === 'success') {
    return status;
  }
  return 'success';
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

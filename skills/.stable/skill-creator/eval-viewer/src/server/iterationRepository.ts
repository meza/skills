import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { feedbackTurnShape } from '../shared/feedbackModel.js';
import type {
  ArtifactIssue,
  ExpectationView,
  FeedbackExpectationView,
  FeedbackInput,
  FeedbackTurnView,
  IterationIndexView,
  IterationNumber,
  IterationView,
  OverallExpectationView,
  RunComparisonView,
  RunFeedbackView,
  RunView,
  TurnExpectationView,
  TurnView
} from '../shared/viewModel.js';
import { validateArtifactSchema } from './artifactSchemas.js';
import {
  iterationDirectoryName,
  iterationManifestPath,
  iterationNumberFromDirectoryName,
  iterationNumberFromRoot,
  iterationRootPath,
  previousIterationRootPath,
  resultsRootPath,
  validIterationDirectoryEntries
} from './iterationWorkspace.js';

interface ManifestRun {
  cost_usd?: number;
  duration_ms?: number;
  error?: string;
  eval_id: number;
  eval_name?: string;
  run_type: string;
  session_id?: string;
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

const feedbackWriteQueues = new Map<string, Promise<unknown>>();

interface RunFilePaths {
  artifacts: string;
  grading: string;
  rawOutput: string;
  timing: string;
}

interface IterationSelection {
  availableIterations: IterationNumber[];
  iterationNumber: IterationNumber;
  latestIteration: IterationNumber;
  root: string;
}

interface IterationSelectionOptions {
  availableIterations?: IterationNumber[];
  iteration?: IterationNumber;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

/**
 * Confirms that a requested eval workspace location can be used by the viewer.
 *
 * @param workspaceRoot - Local workspace path supplied by the server startup flow or repository caller.
 */
export async function assertWorkspaceRoot(workspaceRoot: string): Promise<void> {
  try {
    const result = await stat(workspaceRoot);
    if (!result.isDirectory()) {
      throw new Error(`evaluation workspace root is not a directory: ${workspaceRoot}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not a directory')) {
      throw error;
    }
    throw new Error(`evaluation workspace root does not exist: ${workspaceRoot}`);
  }
}

/**
 * Discovers the valid iteration directories available in an evaluation workspace.
 *
 * The returned list is sorted by iteration number. Direct `iteration-N` roots are not accepted;
 * callers must pass the workspace root that contains `results/iteration-N`.
 */
export async function loadIterationIndex(workspaceRoot: string): Promise<IterationIndexView> {
  const iterations = await discoverIterations(workspaceRoot);
  return {
    iterations,
    latestIteration: latestIterationFrom(iterations)
  };
}

/**
 * Builds the browser view model for the eval iteration a reviewer wants to inspect.
 *
 * @param workspaceRoot - Local eval workspace chosen by the reviewer or server startup flow.
 * @param options - Optional explicit iteration selection. Latest is used when omitted. Callers
 * that already loaded the iteration index can pass it to avoid a second workspace scan.
 */
export async function loadIteration(
  workspaceRoot: string,
  options: IterationSelectionOptions = {}
): Promise<IterationView> {
  const selection = await resolveIterationSelection(workspaceRoot, options);
  const iterationRoot = selection.root;
  const manifest = await readRequiredJson(join(iterationRoot, 'run_manifest.json'), 'run_manifest.json', {
    schemaName: 'run-manifest.schema.json'
  });
  await readOptionalJson(join(iterationRoot, 'aggregated_results.json'), {
    artifact: 'aggregated_results.json',
    schemaName: 'aggregated-results.schema.json'
  });
  const feedback = await readFeedback(iterationRoot);
  const manifestRuns = manifest.runs as ManifestRun[];
  const runs = await Promise.all(manifestRuns.map((run) => loadRun(iterationRoot, run, feedback)));
  if (runs.length === 0) {
    throw new Error('Evaluation results contain no runs to review.');
  }

  return {
    feedbackPath: feedbackPath(iterationRoot),
    runs: await loadComparisonsForRuns(runs, iterationRoot),
    summary: {
      availableIterations: selection.availableIterations,
      effort: textValue(manifest.effort, 'default'),
      isLatest: selection.iterationNumber === selection.latestIteration,
      iteration: selection.iterationNumber,
      latestIteration: selection.latestIteration,
      model: textValue(manifest.model, 'default'),
      provider: textValue(manifest.provider, 'unknown'),
      runCount: runs.length,
      skillName: textValue(manifest.skill_name, 'unknown skill')
    }
  };
}

/**
 * Persists a reviewer's feedback for one eval in the viewer-owned feedback artifact.
 *
 * @param workspaceRoot - Local eval workspace that contains the active iteration.
 * @param feedback - Review notes and expectation comments submitted by the browser.
 * @param options - Optional explicit iteration selection. Latest is used when omitted by repository callers.
 */
export async function saveFeedback(
  workspaceRoot: string,
  feedback: FeedbackInput,
  options: IterationSelectionOptions = {}
): Promise<FeedbackReview> {
  const iterationRoot = (await resolveIterationSelection(workspaceRoot, options)).root;
  return queueFeedbackWrite(iterationRoot, () => saveFeedbackNow(iterationRoot, feedback));
}

async function saveFeedbackNow(iterationRoot: string, feedback: FeedbackInput): Promise<FeedbackReview> {
  const artifact = await readFeedback(iterationRoot);
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
    await validateArtifactSchema('viewer-feedback.schema.json', artifact);
    await writeFile(feedbackPath(iterationRoot), `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
    return saved;
  }
  if (existingIndex >= 0) {
    artifact.reviews[existingIndex] = saved;
  } else {
    artifact.reviews.push(saved);
  }
  await validateArtifactSchema('viewer-feedback.schema.json', artifact);
  await writeFile(feedbackPath(iterationRoot), `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
  return saved;
}

async function queueFeedbackWrite<T>(iterationRoot: string, writeFeedback: () => Promise<T>): Promise<T> {
  const previousWrite = feedbackWriteQueues.get(iterationRoot) ?? Promise.resolve();
  const queuedWrite = previousWrite.then(writeFeedback, writeFeedback);
  feedbackWriteQueues.set(iterationRoot, queuedWrite);
  try {
    return await queuedWrite;
  } finally {
    if (feedbackWriteQueues.get(iterationRoot) === queuedWrite) {
      feedbackWriteQueues.delete(iterationRoot);
    }
  }
}

/**
 * Reads an eval artifact so the browser can display its text content.
 *
 * @param workspaceRoot - Local eval workspace that contains the active iteration.
 * @param artifactPath - Local artifact path requested by the browser.
 * @param options - Optional explicit iteration selection. Latest is used when omitted.
 */
export async function readArtifactText(
  workspaceRoot: string,
  artifactPath: string,
  options: IterationSelectionOptions = {}
): Promise<string> {
  const iterationRoot = (await resolveIterationSelection(workspaceRoot, options)).root;
  const root = resolve(iterationRoot);
  const requested = resolve(artifactPath);
  const relativePath = relative(root, requested);
  if (relativePath.startsWith('..') || relativePath === '' || resolve(root, relativePath) !== requested) {
    throw new Error('Artifact path must be inside the active iteration root.');
  }
  return readFile(requested, 'utf-8');
}

/** Raised when a requested iteration number is not present in the workspace. */
export class UnavailableIterationError extends Error {}

async function loadRun(iterationRoot: string, manifestRun: ManifestRun, feedback: FeedbackArtifact): Promise<RunView> {
  const evalId = manifestRun.eval_id;
  const runType = manifestRun.run_type;
  const evalDir = join(iterationRoot, `eval-${evalId}`);
  const runTypeDir = join(evalDir, runType);
  const filePaths = runFilePaths(runTypeDir);
  const { artifacts, grading, metadata, timing } = await readRunArtifacts(evalDir, filePaths);
  const artifactRoot = objectValue(artifacts.artifacts);
  const metadataTurns = metadataTurnsFrom(metadata);
  const gradedTurns = gradedTurnExpectations(grading);
  const turns = await loadTurns(metadataTurns, artifactRoot.turns as unknown[], gradedTurns);
  const expectations = expectationsFrom(grading);
  const issues: ArtifactIssue[] = [];
  const review = feedback.reviews.find((candidate) => candidate.eval_id === evalId);
  const runFeedback = feedbackForExpectations(expectations, review);

  return {
    artifactPaths: artifactPaths(artifactRoot, filePaths),
    comparisons: {},
    durationSeconds: numberValue(timing.total_duration_seconds, 0),
    evalId,
    evalName: textValue(metadata.eval_name, `eval-${evalId}`),
    executiveSummary: textValue(grading.executive_summary, ''),
    expectations,
    finalResponse: (turns[turns.length - 1] as TurnView).response,
    issues,
    passRate: numberValue(objectValue(grading.summary).pass_rate, 0),
    providerSessionId: textValue(manifestRun.session_id, ''),
    feedback: runFeedback,
    runType,
    tokenCount: numberValue(timing.total_tokens, 0),
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
  metadata: Record<string, unknown>;
  timing: Record<string, unknown>;
}> {
  const [metadata, grading, artifacts, timing] = await Promise.all([
    readRequiredJson(join(evalDir, 'eval_metadata.json'), 'eval_metadata.json', {
      schemaName: 'eval-metadata.schema.json'
    }),
    readRequiredJson(filePaths.grading, 'grading.json', { schemaName: 'grading.schema.json' }),
    readRequiredJson(filePaths.artifacts, 'run_artifacts.json', { schemaName: 'run-artifacts.schema.json' }),
    readRequiredJson(filePaths.timing, 'timing.json', { schemaName: 'timing.schema.json' }),
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
  metadataTurns: unknown[],
  artifactTurns: unknown[],
  gradedTurns: Map<number, TurnExpectationView[]>
): Promise<TurnView[]> {
  return Promise.all(
    artifactTurns.map(async (turn, index) => {
      const turnRecord = objectValue(turn);
      const turnNumber = numberValue(turnRecord.turn, index + 1);
      const prompt = textValue(objectValue(metadataTurns[index]).prompt, '');
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

async function loadComparisonsForRuns(runs: RunView[], iterationRoot: string): Promise<RunView[]> {
  const baselineByEvalId = new Map(runs.filter((run) => run.runType === 'baseline').map((run) => [run.evalId, run]));
  return Promise.all(
    runs.map(async (run) => {
      const previousIteration = await loadPreviousIterationComparison(run, iterationRoot);
      const issues = previousIteration.issue ? [...run.issues, previousIteration.issue] : run.issues;
      const baselineTarget = baselineByEvalId.get(run.evalId);
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
  iterationRoot: string
): Promise<{ comparison?: RunComparisonView; issue?: ArtifactIssue }> {
  const previousRoot = previousIterationRootPath(iterationRoot);
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
      readJson(join(runTypeDir, 'grading.json'), 'grading.schema.json'),
      readJson(join(runTypeDir, 'timing.json'), 'timing.schema.json'),
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
  const nestedOverall = nestedResults.overall_expectations as unknown[];
  const overall = nestedOverall.map(overallExpectationFrom);
  const turnResults = [...gradedTurnExpectations(grading).values()].flat();
  return [...overall, ...turnResults];
}

function gradedTurnExpectations(grading: Record<string, unknown> | undefined): Map<number, TurnExpectationView[]> {
  const result = new Map<number, TurnExpectationView[]>();
  const turns = objectValue(grading?.results).turns as unknown[];
  for (const turn of turns) {
    const turnRecord = objectValue(turn);
    const turnNumber = numberValue(turnRecord.turn, result.size + 1);
    const expectations = turnRecord.expectations as unknown[];
    result.set(
      turnNumber,
      expectations.map((expectation) => turnExpectationFrom(expectation, turnNumber))
    );
  }
  return result;
}

function metadataTurnsFrom(metadata: Record<string, unknown>): unknown[] {
  return metadata.turns as unknown[];
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

async function readRequiredJson(
  path: string,
  artifact: string,
  options?: { schemaName?: string }
): Promise<Record<string, unknown>> {
  try {
    return await readJson(path, options?.schemaName);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid ${artifact}`);
    }
    if (error instanceof ArtifactSchemaError) {
      throw new Error(`Invalid ${artifact}: ${error.message}`);
    }
    throw new Error(`Missing ${artifact}`);
  }
}

async function readJson(path: string, schemaName?: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>;
  if (schemaName) {
    try {
      await validateArtifactSchema(schemaName, value);
    } catch (error) {
      throw new ArtifactSchemaError((error as Error).message);
    }
  }
  return value;
}

async function readOptionalJson(
  path: string,
  options?: { artifact: string; schemaName: string }
): Promise<Record<string, unknown> | undefined> {
  try {
    return await readJson(path, options?.schemaName);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid ${options?.artifact}`);
    }
    if (error instanceof ArtifactSchemaError) {
      throw new Error(`Invalid ${options?.artifact}: ${error.message}`);
    }
    return undefined;
  }
}

async function readRequiredText(path: string, artifact: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    throw new Error(`Missing ${artifact}`);
  }
}

async function readFeedback(iterationRoot: string): Promise<FeedbackArtifact> {
  const existing = await readOptionalJson(feedbackPath(iterationRoot), {
    artifact: 'viewer_feedback.json',
    schemaName: 'viewer-feedback.schema.json'
  });
  const reviews = Array.isArray(existing?.reviews) ? existing.reviews.map((review) => feedbackReviewFrom(review)) : [];
  return {
    reviews
  };
}

function feedbackPath(iterationRoot: string): string {
  return join(iterationRoot, 'viewer_feedback.json');
}

function firstTurnPath(artifactRoot: Record<string, unknown>, key: 'response_path' | 'transcript_path'): string {
  const turns = artifactRoot.turns as unknown[];
  const firstTurn = objectValue(turns[0]);
  return textValue(firstTurn[key], '');
}

function feedbackReviewFrom(value: unknown): FeedbackReview {
  const record = objectValue(value);
  const review: FeedbackReview = {
    eval_id: numberValue(record.eval_id, 0),
    updated_at: textValue(record.updated_at, '')
  };
  const comments = textValue(record.comments, '');
  const overall = feedbackExpectationsFrom(record.overall);
  const turns = feedbackTurnsFrom(record.turns);
  if (comments) {
    review.comments = comments;
  }
  if (overall.length > 0) {
    review.overall = overall;
  }
  if (turns.length > 0) {
    review.turns = turns;
  }
  return review;
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

async function resolveIterationSelection(
  workspaceRoot: string,
  options: IterationSelectionOptions
): Promise<IterationSelection> {
  const availableIterations = options.availableIterations ?? (await discoverIterations(workspaceRoot));
  const latestIteration = latestIterationFrom(availableIterations);
  const iterationNumber = options.iteration ?? latestIteration;
  if (!availableIterations.includes(iterationNumber)) {
    throw new UnavailableIterationError(
      `${iterationDirectoryName(iterationNumber)} does not exist under evaluation workspace root: ${workspaceRoot}`
    );
  }
  return {
    availableIterations,
    iterationNumber,
    latestIteration,
    root: iterationRootPath(workspaceRoot, iterationNumber)
  };
}

async function discoverIterations(workspaceRoot: string): Promise<IterationNumber[]> {
  await assertWorkspaceRoot(workspaceRoot);
  const resultsRoot = resultsRootPath(workspaceRoot);
  let entries;
  try {
    const result = await stat(resultsRoot);
    if (!result.isDirectory()) {
      throw new Error(`evaluation workspace results path is not a directory: ${resultsRoot}`);
    }
    entries = await readdir(resultsRoot, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not a directory')) {
      throw error;
    }
    throw new Error(`evaluation workspace root must contain results/iteration-N artifacts: ${workspaceRoot}`);
  }
  const iterationCandidates = await Promise.all(
    validIterationDirectoryEntries(entries).map(async (entry) => ({
      hasManifest: await fileExists(iterationManifestPath(join(resultsRoot, entry.name))),
      iterationNumber: iterationNumberFromDirectoryName(entry.name)
    }))
  );
  const iterations = iterationCandidates
    .filter((candidate) => candidate.hasManifest)
    .map((candidate) => candidate.iterationNumber)
    .sort((left, right) => left - right);
  if (iterations.length === 0) {
    throw new Error(`evaluation workspace root contains no valid results/iteration-N artifacts: ${workspaceRoot}`);
  }
  return iterations;
}

function latestIterationFrom(iterations: IterationNumber[]): IterationNumber {
  return iterations[iterations.length - 1] as number;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function numberValue(value: unknown, _fallback: number): number {
  return value as number;
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

class ArtifactSchemaError extends Error {}

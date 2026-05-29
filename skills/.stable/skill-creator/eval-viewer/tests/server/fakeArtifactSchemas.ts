const knownSchemas = new Set([
  'aggregated-results.schema.json',
  'eval-metadata.schema.json',
  'grading.schema.json',
  'run-artifacts.schema.json',
  'run-manifest.schema.json',
  'timing.schema.json',
  'viewer-feedback.schema.json'
]);

export async function validateArtifactSchema(schemaName: string, artifact: unknown): Promise<void> {
  if (!knownSchemas.has(schemaName)) {
    throw new Error(`Unknown artifact schema: ${schemaName}`);
  }
  const value = record(artifact);
  switch (schemaName) {
    case 'eval-metadata.schema.json':
      requireArray(value.turns, schemaName);
      return;
    case 'grading.schema.json':
      validateGrading(value);
      return;
    case 'run-artifacts.schema.json':
      validateRunArtifacts(value);
      return;
    case 'run-manifest.schema.json':
      validateRunManifest(value);
      return;
    case 'timing.schema.json':
      validateTiming(value);
      return;
    case 'viewer-feedback.schema.json':
      validateViewerFeedback(value);
      return;
    default:
      return;
  }
}

function validateRunManifest(value: Record<string, unknown>): void {
  const runs = requireArray(value.runs, 'run-manifest.schema.json');
  requireString(value.skill_name, 'run-manifest.schema.json');
  requireString(value.eval_definitions_path, 'run-manifest.schema.json');
  requireString(value.provider, 'run-manifest.schema.json');
  requireString(value.model, 'run-manifest.schema.json');
  requireString(value.effort, 'run-manifest.schema.json');
  requireNumber(value.iteration, 'run-manifest.schema.json');
  requireString(value.timestamp, 'run-manifest.schema.json');
  requireNumber(value.total_elapsed_seconds, 'run-manifest.schema.json');
  for (const run of runs) {
    const runRecord = record(run);
    requireNumber(runRecord.eval_id, 'run-manifest.schema.json');
    requireEnum(runRecord.run_type, ['skill', 'baseline'], 'run-manifest.schema.json');
    requireEnum(
      runRecord.execution_status,
      ['success', 'timeout', 'error', 'grading_error', 'skipped', 'exception'],
      'run-manifest.schema.json'
    );
  }
}

function validateRunArtifacts(value: Record<string, unknown>): void {
  const artifacts = record(value.artifacts);
  const turns = requireArray(artifacts.turns, 'run-artifacts.schema.json');
  if (turns.length === 0) {
    throw invalid('run-artifacts.schema.json');
  }
  for (const turn of turns) {
    const turnRecord = record(turn);
    requireString(turnRecord.response_path, 'run-artifacts.schema.json');
    requireString(turnRecord.transcript_path, 'run-artifacts.schema.json');
  }
}

function validateGrading(value: Record<string, unknown>): void {
  requireString(value.executive_summary, 'grading.schema.json');
  const results = record(value.results);
  requireArray(results.overall_expectations, 'grading.schema.json');
  const turns = requireArray(results.turns, 'grading.schema.json');
  for (const turn of turns) {
    requireArray(record(turn).expectations, 'grading.schema.json');
  }
  const summary = record(value.summary);
  requireNumber(summary.pass_rate, 'grading.schema.json');
}

function validateTiming(value: Record<string, unknown>): void {
  requireNumber(value.total_tokens, 'timing.schema.json');
  requireNumber(value.total_duration_seconds, 'timing.schema.json');
}

function validateViewerFeedback(value: Record<string, unknown>): void {
  const reviews = requireArray(value.reviews, 'viewer-feedback.schema.json');
  for (const review of reviews) {
    validateFeedbackReview(record(review));
  }
}

function validateFeedbackReview(review: Record<string, unknown>): void {
  requireNumber(review.eval_id, 'viewer-feedback.schema.json');
  requireString(review.updated_at, 'viewer-feedback.schema.json');
  const hasComments = typeof review.comments === 'string' && review.comments.length > 0;
  const hasOverall = review.overall !== undefined;
  const hasTurns = review.turns !== undefined;
  if (!hasComments && !hasOverall && !hasTurns) {
    throw invalid('viewer-feedback.schema.json');
  }
  if (hasOverall) {
    validateExpectationFeedbackArray(review.overall, 'viewer-feedback.schema.json');
  }
  if (hasTurns) {
    validateFeedbackTurns(review.turns);
  }
}

function validateFeedbackTurns(value: unknown): void {
  const turns = requireArray(value, 'viewer-feedback.schema.json');
  if (turns.length === 0) {
    throw invalid('viewer-feedback.schema.json');
  }
  for (const turn of turns) {
    const turnRecord = record(turn);
    if (typeof turnRecord.turn !== 'number' || turnRecord.turn < 1) {
      throw invalid('viewer-feedback.schema.json');
    }
    validateExpectationFeedbackArray(turnRecord.expectations, 'viewer-feedback.schema.json');
  }
}

function validateExpectationFeedbackArray(value: unknown, schemaName: string): void {
  const expectations = requireArray(value, schemaName);
  if (expectations.length === 0) {
    throw invalid(schemaName);
  }
  for (const expectation of expectations) {
    const expectationRecord = record(expectation);
    requireString(expectationRecord.expectation_id, schemaName);
    requireString(expectationRecord.comment, schemaName);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('artifact');
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, schemaName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw invalid(schemaName);
  }
  return value;
}

function requireString(value: unknown, schemaName: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalid(schemaName);
  }
}

function requireNumber(value: unknown, schemaName: string): void {
  if (typeof value !== 'number') {
    throw invalid(schemaName);
  }
}

function requireEnum(value: unknown, allowedValues: string[], schemaName: string): void {
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    throw invalid(schemaName);
  }
}

function invalid(schemaName: string): Error {
  return new Error(`Artifact does not match ${schemaName}`);
}

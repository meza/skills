import { useMemo, useState } from 'react';
import type {
  ExpectationView,
  FeedbackInput,
  FeedbackTurnView,
  IterationView,
  ReviewState,
  RunFeedbackView,
  RunView
} from '../shared/viewModel.js';

type Filter = 'all' | 'pass' | 'fail';
type FeedbackDraft = RunFeedbackView;

export function App({
  initialIteration,
  saveFeedback = saveFeedbackToServer
}: {
  initialIteration: IterationView;
  saveFeedback?: (feedback: FeedbackInput) => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const reviewRuns = useMemo(
    () => initialIteration.runs.filter((run) => run.runType === 'skill'),
    [initialIteration.runs]
  );
  const [selectedKey, setSelectedKey] = useState(runKey(reviewRuns[0] ?? initialIteration.runs[0]));
  const visibleRuns = useMemo(
    () =>
      reviewRuns.filter((run) => {
        if (filter === 'pass') {
          return run.passRate === 1 && run.issues.every((issue) => issue.severity !== 'error');
        }
        if (filter === 'fail') {
          return run.passRate < 1 || run.issues.some((issue) => issue.severity === 'error');
        }
        return true;
      }),
    [filter, reviewRuns]
  );
  const selectedRun = visibleRuns.find((run) => runKey(run) === selectedKey) ?? visibleRuns[0] ?? reviewRuns[0];
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>({});
  const selectedIndex = Math.max(
    0,
    reviewRuns.findIndex((run) => runKey(run) === runKey(selectedRun))
  );

  if (!selectedRun) {
    return <main className="content empty-state">No evaluation runs were found.</main>;
  }

  function selectRunAt(offset: number) {
    setSelectedKey(runKey(reviewRuns[selectedIndex + offset]));
    setFilter('all');
  }

  const activeRun = selectedRun;
  const selectedRunKey = runKey(activeRun);
  const feedbackDraft = feedbackDrafts[selectedRunKey] ?? feedbackDraftFromRun(activeRun);

  function updateFeedbackDraft(updater: (draft: FeedbackDraft) => FeedbackDraft) {
    setFeedbackDrafts((current) => ({
      ...current,
      [selectedRunKey]: updater(current[selectedRunKey] ?? feedbackDraftFromRun(activeRun))
    }));
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>Skill Evaluation</h1>
        <p>{`${initialIteration.summary.provider} / ${initialIteration.summary.model} / ${initialIteration.summary.effort}`}</p>
      </header>
      <aside className="side-nav">
        <div className="brand-block">
          <span className="material-symbols-outlined brand-icon">list_alt</span>
          <div>
            <span className="eyebrow">Platform</span>
            <strong>Codex</strong>
          </div>
        </div>
        <div className="filter-label">Filters</div>
        <div className="filters" aria-label="Filters">
          {(['all', 'pass', 'fail'] as const).map((candidate) => (
            <button
              aria-pressed={filter === candidate}
              className={`filter-${candidate}`}
              key={candidate}
              onClick={() => setFilter(candidate)}
              type="button">
              <span className="material-symbols-outlined" aria-hidden="true">
                {filterIcon(candidate)}
              </span>
              <span>{candidate}</span>
            </button>
          ))}
        </div>
        <div className="filter-label">Runs</div>
        <nav aria-label="Runs" className="run-list">
          {visibleRuns.map((run) => (
            <button
              aria-pressed={runKey(run) === runKey(selectedRun)}
              className={run.passRate === 1 ? 'run-link pass' : 'run-link fail'}
              key={runKey(run)}
              onClick={() => setSelectedKey(runKey(run))}
              type="button">
              <span>{run.evalName}</span>
              <small>
                <i aria-hidden="true" />
                <span>{run.status}</span>
              </small>
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        <section className="run-header">
          <div>
            <span className="eyebrow">Run ID: {selectedRun.evalId}</span>
            <h2>{selectedRun.evalName}</h2>
          </div>
          <div className="run-pager">
            <button disabled={selectedIndex === 0} onClick={() => selectRunAt(-1)} type="button">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <span>
              <strong>{selectedIndex + 1}</strong> / {reviewRuns.length}
            </span>
            <button disabled={selectedIndex >= reviewRuns.length - 1} onClick={() => selectRunAt(1)} type="button">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </section>
        <section className="summary-card">
          <div className="card-title">
            <span className="material-symbols-outlined">auto_awesome</span>
            <h3>Executive Summary</h3>
          </div>
          <p>{selectedRun.executiveSummary || 'No executive summary was provided.'}</p>
          <div className="metric-grid">
            <Metric label="Pass Rate" tone="pass" value={formatPercent(selectedRun.passRate)} />
            <Metric
              label="vs Last Iteration"
              value={formatDeltaPercent(selectedRun.comparisons.previousIteration?.passRateDelta)}
            />
            <Metric
              label="vs Baseline"
              tone="primary"
              value={formatDeltaPercent(selectedRun.comparisons.baseline?.passRateDelta)}
            />
          </div>
        </section>
        <ExpectationsPanel draft={feedbackDraft} run={selectedRun} updateDraft={updateFeedbackDraft} />
        <FeedbackPanel
          draft={feedbackDraft}
          run={selectedRun}
          saveFeedback={saveFeedback}
          updateDraft={updateFeedbackDraft}
        />
        <TranscriptPanel run={selectedRun} skillName={initialIteration.summary.skillName} />
      </main>
    </div>
  );
}

function Metric({
  label,
  tone = 'muted',
  value
}: {
  label: string;
  tone?: 'muted' | 'pass' | 'primary';
  value: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function ExpectationsPanel({
  draft,
  run,
  updateDraft
}: {
  draft: FeedbackDraft;
  run: RunView;
  updateDraft: (updater: (draft: FeedbackDraft) => FeedbackDraft) => void;
}) {
  const overall = run.expectations.filter((expectation) => expectation.scope === 'overall');
  const turns = run.expectations.filter((expectation) => expectation.scope === 'turn');
  const passed = run.expectations.filter((expectation) => expectation.passed).length;
  return (
    <section className="expectations">
      <div className="section-heading">
        <div>
          <span className="material-symbols-outlined">verified</span>
          <h3>Expectations Breakdown</h3>
        </div>
        <span>
          {passed}/{run.expectations.length} requirements passed
        </span>
      </div>
      <ExpectationGroup
        draft={draft}
        expectations={overall}
        label="Overall Constraints"
        run={run}
        updateDraft={updateDraft}
      />
      <ExpectationGroup
        draft={draft}
        expectations={turns}
        label="Execution Turn Grading"
        run={run}
        updateDraft={updateDraft}
      />
    </section>
  );
}

function ExpectationGroup({
  draft,
  expectations,
  label,
  run,
  updateDraft
}: {
  draft: FeedbackDraft;
  expectations: ExpectationView[];
  label: string;
  run: RunView;
  updateDraft: (updater: (draft: FeedbackDraft) => FeedbackDraft) => void;
}) {
  if (expectations.length === 0) {
    return null;
  }
  return (
    <div className="expectation-group">
      <h4>{label}</h4>
      {expectations.map((expectation, index) => (
        <ExpectationCard
          comment={expectationComment(draft, expectation, expectations, index)}
          expectation={expectation}
          expectations={expectations}
          index={index}
          key={`${expectation.scope}-${expectation.turn ?? 0}-${expectation.text}`}
          run={run}
          updateDraft={updateDraft}
        />
      ))}
    </div>
  );
}

function ExpectationCard({
  comment,
  expectation,
  expectations,
  index,
  run,
  updateDraft
}: {
  comment: string;
  expectation: ExpectationView;
  expectations: ExpectationView[];
  index: number;
  run: RunView;
  updateDraft: (updater: (draft: FeedbackDraft) => FeedbackDraft) => void;
}) {
  const baseline = run.comparisons.baseline?.expectations.find((candidate) => candidate.text === expectation.text);
  const baselineStatus = expectationStatus(baseline);
  const showEvidence = !expectation.passed;
  const label =
    expectation.scope === 'overall'
      ? `Feedback for overall expectation ${index + 1}`
      : `Feedback for turn ${expectation.turn as number} expectation ${
          turnExpectationIndex(expectations, expectation, index) + 1
        }`;
  return (
    <article className={expectation.passed ? 'expectation pass' : 'expectation fail'}>
      <div className="expectation-main">
        <div className="status-icon">
          <span className="material-symbols-outlined">{expectation.passed ? 'check' : 'close'}</span>
        </div>
        <div>
          <h5>{expectation.scope === 'overall' ? expectation.text : expectation.text}</h5>
          {expectation.turn ? <p>Turn {expectation.turn}</p> : null}
        </div>
        <StatusBadge baseline={baseline} passed={expectation.passed} />
      </div>
      {showEvidence && (expectation.evidence || baseline?.evidence) && (
        <div className="evidence-grid">
          <EvidenceBlock label="Run Evidence" text={expectation.evidence} />
          <EvidenceBlock label="Baseline Evidence" muted text={baseline?.evidence ?? ''} />
        </div>
      )}
      {showEvidence && !expectation.evidence && !baseline?.evidence ? (
        <p className="empty-copy">No evidence was recorded for this expectation.</p>
      ) : null}
      <div className="inline-feedback">
        <span>
          {expectationStatus(expectation)} | Baseline: {baselineStatus}
        </span>
        <textarea
          aria-label={label}
          onChange={(event) => {
            const comment = event.currentTarget.value;
            updateDraft((draft) => updateExpectationComment(draft, expectation, expectations, index, comment));
          }}
          placeholder="Add feedback for this expectation..."
          value={comment}
        />
      </div>
    </article>
  );
}

function StatusBadge({ baseline, passed }: { baseline: ExpectationView | undefined; passed: boolean }) {
  return (
    <span className={passed ? 'status-badge pass' : 'status-badge fail'}>
      {passed ? 'PASS' : 'FAIL'} | <em>Baseline: {expectationStatus(baseline)}</em>
    </span>
  );
}

function expectationStatus(expectation: ExpectationView | undefined): string {
  if (!expectation) {
    return 'N/A';
  }
  return expectation.passed ? 'PASS' : 'FAIL';
}

function EvidenceBlock({ label, muted = false, text }: { label: string; muted?: boolean; text: string }) {
  if (!text) {
    return null;
  }
  return (
    <div className={muted ? 'evidence muted' : 'evidence'}>
      <span>{label}</span>
      <p>{text}</p>
    </div>
  );
}

function feedbackDraftFromRun(run: RunView): FeedbackDraft {
  const overallCount = run.expectations.filter((expectation) => expectation.scope === 'overall').length;
  const turnShape = turnFeedbackShape(run.expectations);
  return {
    comments: run.feedback.comments || run.userComments || '',
    overall: Array.from({ length: overallCount }, (_, index) => ({
      comment: run.feedback.overall[index]?.comment ?? ''
    })),
    turns: turnShape.map((turn) => ({
      expectations: turn.expectations.map((_, index) => ({
        comment:
          run.feedback.turns.find((candidate) => candidate.turn === turn.turn)?.expectations[index]?.comment ?? ''
      })),
      turn: turn.turn
    }))
  };
}

function turnFeedbackShape(expectations: ExpectationView[]): FeedbackTurnView[] {
  const turns = new Map<number, { comment: string }[]>();
  for (const expectation of expectations) {
    if (expectation.scope !== 'turn') {
      continue;
    }
    const turn = expectation.turn as number;
    turns.set(turn, [...(turns.get(turn) ?? []), { comment: '' }]);
  }
  return [...turns.entries()].map(([turn, expectationFeedback]) => ({
    expectations: expectationFeedback,
    turn
  }));
}

function expectationComment(
  draft: FeedbackDraft,
  expectation: ExpectationView,
  expectations: ExpectationView[],
  index: number
): string {
  if (expectation.scope === 'overall') {
    return draft.overall[index]!.comment;
  }
  const turn = expectation.turn as number;
  const feedbackTurn = draft.turns.find((candidate) => candidate.turn === turn) as FeedbackTurnView;
  return feedbackTurn.expectations[turnExpectationIndex(expectations, expectation, index)]!.comment;
}

function updateExpectationComment(
  draft: FeedbackDraft,
  expectation: ExpectationView,
  expectations: ExpectationView[],
  index: number,
  comment: string
): FeedbackDraft {
  if (expectation.scope === 'overall') {
    return {
      ...draft,
      overall: draft.overall.map((current, candidateIndex) => (candidateIndex === index ? { comment } : current))
    };
  }
  const turn = expectation.turn as number;
  const expectationIndex = turnExpectationIndex(expectations, expectation, index);
  return {
    ...draft,
    turns: draft.turns.map((candidate) =>
      candidate.turn === turn
        ? {
            ...candidate,
            expectations: candidate.expectations.map((current, candidateIndex) =>
              candidateIndex === expectationIndex ? { comment } : current
            )
          }
        : candidate
    )
  };
}

function turnExpectationIndex(expectations: ExpectationView[], expectation: ExpectationView, index: number): number {
  return (
    expectations
      .slice(0, index + 1)
      .filter((candidate) => candidate.scope === 'turn' && candidate.turn === expectation.turn).length - 1
  );
}

function hasFeedbackComments(draft: FeedbackDraft): boolean {
  return (
    draft.comments.trim().length > 0 ||
    draft.overall.some((expectation) => expectation.comment.trim().length > 0) ||
    draft.turns.some((turn) => turn.expectations.some((expectation) => expectation.comment.trim().length > 0))
  );
}

function FeedbackPanel({
  draft,
  run,
  saveFeedback,
  updateDraft
}: {
  draft: FeedbackDraft;
  run: RunView;
  saveFeedback: (feedback: FeedbackInput) => Promise<unknown>;
  updateDraft: (updater: (draft: FeedbackDraft) => FeedbackDraft) => void;
}) {
  const [reviewState, setReviewState] = useState<ReviewState>(run.reviewState);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const label = reviewLabel(saveState === 'saved' ? reviewState : run.reviewState);
  async function submitFeedback() {
    const nextReviewState = hasFeedbackComments(draft) ? 'reviewed_with_comments' : 'reviewed_without_comments';
    setReviewState(nextReviewState);
    setSaveState('saving');
    try {
      await saveFeedback({
        comments: draft.comments,
        evalId: run.evalId,
        overall: draft.overall,
        reviewState: nextReviewState,
        turns: draft.turns
      });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }
  return (
    <>
      <section className="feedback">
        <div>
          <div className="card-title">
            <span className="material-symbols-outlined">rate_review</span>
            <h3>Feedback</h3>
          </div>
          <span className="review-badge">{label}</span>
        </div>
        <textarea
          aria-label="Review comments"
          onChange={(event) => {
            const comments = event.currentTarget.value;
            updateDraft((current) => ({ ...current, comments }));
          }}
          placeholder="Add qualitative observations to help tune the scoring engine..."
          value={draft.comments}
        />
        {saveState === 'saved' ? <p className="save-message">Saved</p> : null}
        {saveState === 'error' ? <p className="save-message error">Could not save feedback.</p> : null}
      </section>
      <button className="finalize-button" disabled={saveState === 'saving'} onClick={submitFeedback} type="button">
        Submit Review &amp; Finalize
      </button>
    </>
  );
}

function TranscriptPanel({ run, skillName }: { run: RunView; skillName: string }) {
  return (
    <section className="history">
      <div className="history-main">
        <h3>Execution History</h3>
        {run.turns.length > 0 ? (
          run.turns.map((turn, index) => (
            <article className="turn" key={`${turn.prompt}-${index}`}>
              <div className="turn-divider">
                <span />
                <strong>Turn {index + 1}</strong>
                <span />
              </div>
              <div className="message prompt">
                <span className="material-symbols-outlined">person</span>
                <p>{turn.prompt}</p>
              </div>
              <div className="message response">
                <span className="material-symbols-outlined">bolt</span>
                <p>{turn.response || run.finalResponse}</p>
              </div>
              <details className="raw-context">
                <summary>Raw Execution Context</summary>
                <pre>{turn.transcript}</pre>
              </details>
            </article>
          ))
        ) : (
          <article className="turn">
            <div className="turn-divider">
              <span />
              <strong>Final Response</strong>
              <span />
            </div>
            <div className="message response">
              <span className="material-symbols-outlined">bolt</span>
              <p>{run.finalResponse || 'No response artifact was available.'}</p>
            </div>
          </article>
        )}
      </div>
      <aside className="metadata">
        <h3>Metadata</h3>
        <dl>
          {run.workingDirectory ? (
            <div>
              <dt>Working Directory</dt>
              <dd>{displayWorkingDirectory(run.workingDirectory)}</dd>
            </div>
          ) : null}
          {run.providerSessionId ? (
            <div>
              <dt>Provider UUID</dt>
              <dd>{run.providerSessionId}</dd>
            </div>
          ) : null}
        </dl>
        <div className="artifact-links">
          <a href={artifactHref(run.artifactPaths.rawOutput)}>Raw JSON Output</a>
          <a href={artifactHref(run.artifactPaths.runArtifacts)}>View All Artifacts</a>
        </div>
      </aside>
    </section>
  );
}

function runKey(run: RunView | undefined): string {
  return run ? `${run.evalId}:${run.runType}` : '';
}

function filterIcon(filter: Filter): string {
  if (filter === 'pass') {
    return 'check_circle';
  }
  if (filter === 'fail') {
    return 'error';
  }
  return 'list';
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDeltaPercent(value: number | undefined): string {
  if (value === undefined) {
    return 'N/A';
  }
  const percent = Math.round(value * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

function artifactHref(path: string | undefined): string {
  return path ? `/api/artifacts?path=${encodeURIComponent(path)}` : '#';
}

function displayWorkingDirectory(path: string): string {
  return path.replace(/[\\/](?:skill|baseline)(?=[\\/]|$)/gu, '');
}

function reviewLabel(reviewState: ReviewState): string {
  if (reviewState === 'reviewed_with_comments') {
    return 'Reviewed With Comments';
  }
  if (reviewState === 'reviewed_without_comments') {
    return 'Reviewed';
  }
  return 'Awaiting Review';
}

async function saveFeedbackToServer(feedback: FeedbackInput): Promise<unknown> {
  const response = await fetch(`/api/feedback/${feedback.evalId}`, {
    body: JSON.stringify({
      comments: feedback.comments,
      overall: feedback.overall,
      reviewState: feedback.reviewState,
      turns: feedback.turns
    }),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'PUT'
  });
  if (!response.ok) {
    throw new Error('Could not save feedback.');
  }
  return response.json();
}

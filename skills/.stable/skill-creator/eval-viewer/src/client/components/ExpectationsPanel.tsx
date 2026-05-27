import { useEffect, useRef, useState } from 'react';
import type { ExpectationView, RunFeedbackView, RunView } from '../../shared/viewModel.js';
import { expectationComment, type FeedbackDraftUpdater, updateExpectationComment } from '../feedbackDraft.js';

type ExpectationResultMode = 'skill' | 'baseline';

export function ExpectationsPanel({
  draft,
  run,
  updateDraft
}: {
  draft: RunFeedbackView;
  run: RunView;
  updateDraft: FeedbackDraftUpdater;
}) {
  const [requestedResultMode, setRequestedResultMode] = useState<ExpectationResultMode>('skill');
  const baselineExpectations = run.comparisons.baseline?.expectations ?? [];
  const canShowBaseline = baselineExpectations.length > 0;
  const resultMode = requestedResultMode === 'baseline' && canShowBaseline ? 'baseline' : 'skill';
  const displayedExpectations = resultMode === 'baseline' ? baselineExpectations : run.expectations;
  const comparisonExpectations = resultMode === 'baseline' ? run.expectations : baselineExpectations;
  const overall = displayedExpectations.filter((expectation) => expectation.scope === 'overall');
  const turns = displayedExpectations.filter((expectation) => expectation.scope === 'turn');
  const passed = displayedExpectations.filter((expectation) => expectation.passed).length;

  useEffect(() => {
    setRequestedResultMode('skill');
  }, [run.evalId]);

  return (
    <section className="expectations">
      <div className="section-heading">
        <div className="expectation-heading-main">
          <div>
            <span className="material-symbols-outlined">verified</span>
            <h3>Expectations Breakdown</h3>
          </div>
          <div aria-label="Expectation result source" className="result-toggle">
            {(['skill', 'baseline'] as const).map((mode) => (
              <button
                aria-pressed={resultMode === mode}
                disabled={mode === 'baseline' && !canShowBaseline}
                key={mode}
                onClick={() => setRequestedResultMode(mode)}
                type="button">
                {mode}
              </button>
            ))}
          </div>
        </div>
        <span>
          {passed}/{displayedExpectations.length} requirements passed
        </span>
      </div>
      <ExpectationGroup
        allowFeedback={resultMode === 'skill'}
        comparisonExpectations={comparisonExpectations}
        comparisonLabel={resultMode === 'baseline' ? 'Skill' : 'Baseline'}
        draft={draft}
        expectations={overall}
        label="Overall Constraints"
        resultLabel={resultMode === 'baseline' ? 'Baseline' : 'Run'}
        updateDraft={updateDraft}
      />
      <ExpectationGroup
        allowFeedback={resultMode === 'skill'}
        comparisonExpectations={comparisonExpectations}
        comparisonLabel={resultMode === 'baseline' ? 'Skill' : 'Baseline'}
        draft={draft}
        expectations={turns}
        label="Execution Turn Grading"
        resultLabel={resultMode === 'baseline' ? 'Baseline' : 'Run'}
        updateDraft={updateDraft}
      />
    </section>
  );
}

function ExpectationGroup({
  allowFeedback,
  comparisonExpectations,
  comparisonLabel,
  draft,
  expectations,
  label,
  resultLabel,
  updateDraft
}: {
  allowFeedback: boolean;
  comparisonExpectations: ExpectationView[];
  comparisonLabel: string;
  draft: RunFeedbackView;
  expectations: ExpectationView[];
  label: string;
  resultLabel: string;
  updateDraft: FeedbackDraftUpdater;
}) {
  if (expectations.length === 0) {
    return null;
  }
  return (
    <div className="expectation-group">
      <h4>{label}</h4>
      {expectations.map((expectation, index) => (
        <ExpectationCard
          allowFeedback={allowFeedback}
          comment={allowFeedback ? expectationComment(draft, expectation, expectations, index) : ''}
          comparisonExpectation={expectationComparison(comparisonExpectations, expectation)}
          comparisonLabel={comparisonLabel}
          expectation={expectation}
          expectations={expectations}
          index={index}
          key={expectation.id ?? `${expectation.scope}-${expectation.turn ?? 0}-${expectation.text}`}
          resultLabel={resultLabel}
          updateDraft={updateDraft}
        />
      ))}
    </div>
  );
}

function ExpectationCard({
  allowFeedback,
  comment,
  comparisonExpectation,
  comparisonLabel,
  expectation,
  expectations,
  index,
  resultLabel,
  updateDraft
}: {
  allowFeedback: boolean;
  comment: string;
  comparisonExpectation: ExpectationView | undefined;
  comparisonLabel: string;
  expectation: ExpectationView;
  expectations: ExpectationView[];
  index: number;
  resultLabel: string;
  updateDraft: FeedbackDraftUpdater;
}) {
  const comparisonStatus = expectationStatus(comparisonExpectation);
  const showEvidence = !expectation.passed;
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const label =
    expectation.scope === 'overall'
      ? `Feedback for overall expectation ${index + 1}`
      : `Feedback for turn ${expectation.turn as number} expectation ${
          turnExpectationIndex(expectations, expectation, index) + 1
        }`;
  useEffect(() => {
    const feedback = feedbackRef.current;
    if (feedback) {
      feedback.textContent = '';
    }
  }, []);

  return (
    <article className={expectation.passed ? 'expectation pass' : 'expectation fail'}>
      <div className="expectation-main">
        <div className="status-icon">
          <span className="material-symbols-outlined">{expectation.passed ? 'check' : 'close'}</span>
        </div>
        <div>
          <h5>{expectation.text}</h5>
          {expectation.turn ? <p>Turn {expectation.turn}</p> : null}
        </div>
        <StatusBadge comparison={comparisonExpectation} comparisonLabel={comparisonLabel} passed={expectation.passed} />
      </div>
      {showEvidence && (expectation.evidence || comparisonExpectation?.evidence) && (
        <div className="evidence-grid">
          <EvidenceBlock label={`${resultLabel} Evidence`} text={expectation.evidence} />
          <EvidenceBlock label={`${comparisonLabel} Evidence`} muted text={comparisonExpectation?.evidence ?? ''} />
        </div>
      )}
      {showEvidence && !expectation.evidence && !comparisonExpectation?.evidence ? (
        <p className="empty-copy">No evidence was recorded for this expectation.</p>
      ) : null}
      <div className="inline-feedback">
        <span>
          {expectationStatus(expectation)} | {comparisonLabel}: {comparisonStatus}
        </span>
        {allowFeedback ? (
          <textarea
            aria-label={label}
            onChange={(event) => {
              const nextComment = event.currentTarget.value;
              updateDraft((draft) => updateExpectationComment(draft, expectation, expectations, index, nextComment));
            }}
            placeholder="Add feedback for this expectation..."
            ref={feedbackRef}
            value={comment}
          />
        ) : null}
      </div>
    </article>
  );
}

function StatusBadge({
  comparison,
  comparisonLabel,
  passed
}: {
  comparison: ExpectationView | undefined;
  comparisonLabel: string;
  passed: boolean;
}) {
  return (
    <span className={passed ? 'status-badge pass' : 'status-badge fail'}>
      {passed ? 'PASS' : 'FAIL'} |{' '}
      <em>
        {comparisonLabel}: {expectationStatus(comparison)}
      </em>
    </span>
  );
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

function expectationComparison(
  comparisonExpectations: ExpectationView[],
  expectation: ExpectationView
): ExpectationView | undefined {
  return comparisonExpectations.find(
    (candidate) =>
      candidate.text === expectation.text &&
      candidate.scope === expectation.scope &&
      candidate.turn === expectation.turn
  );
}

function expectationStatus(expectation: ExpectationView | undefined): string {
  if (!expectation) {
    return 'N/A';
  }
  return expectation.passed ? 'PASS' : 'FAIL';
}

function turnExpectationIndex(expectations: ExpectationView[], expectation: ExpectationView, index: number): number {
  return (
    expectations
      .slice(0, index + 1)
      .filter((candidate) => candidate.scope === 'turn' && candidate.turn === expectation.turn).length - 1
  );
}

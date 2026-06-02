import type { ExpectationView, RunFeedbackView } from '../../shared/viewModel.js';
import { useEffect, useId, useRef, useState } from 'react';
import { turnExpectationIndex } from '../../shared/feedbackModel.js';
import { expectationComment, type FeedbackDraftUpdater, updateExpectationComment } from '../feedbackDraft.js';

export function ExpectationCard({
  allowFeedback,
  comparisonExpectation,
  comparisonLabel,
  draft,
  expectation,
  expectations,
  index,
  resultLabel,
  updateDraft
}: {
  allowFeedback: boolean;
  comparisonExpectation: ExpectationView | undefined;
  comparisonLabel: string;
  draft: RunFeedbackView;
  expectation: ExpectationView;
  expectations: ExpectationView[];
  index: number;
  resultLabel: string;
  updateDraft: FeedbackDraftUpdater;
}) {
  const comment = allowFeedback ? expectationComment(draft, expectation, expectations, index) : '';
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const feedbackId = useId();
  const feedbackStartsOpen = !expectation.passed || comment.trim().length > 0;
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(feedbackStartsOpen);
  const label =
    expectation.scope === 'overall'
      ? `Feedback for overall expectation ${index + 1}`
      : `Feedback for turn ${expectation.turn} expectation ${turnExpectationIndex(expectations, expectation, index) + 1}`;

  useEffect(() => {
    const feedback = feedbackRef.current;
    if (feedback) {
      feedback.textContent = '';
    }
  }, []);

  const toggleFeedback = () => {
    setIsFeedbackOpen((current) => !current);
  };

  const className = [
    'expectation',
    expectation.passed ? 'pass' : 'fail',
    allowFeedback ? 'feedback-enabled' : undefined
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      {allowFeedback ? (
        <button
          aria-controls={feedbackId}
          aria-expanded={isFeedbackOpen}
          aria-label={`Toggle feedback for ${expectation.text}`}
          className='expectation-toggle'
          onClick={toggleFeedback}
          type='button'>
          <ExpectationCardBody
            comparisonExpectation={comparisonExpectation}
            comparisonLabel={comparisonLabel}
            expectation={expectation}
            resultLabel={resultLabel}
          />
        </button>
      ) : (
        <ExpectationCardBody
          comparisonExpectation={comparisonExpectation}
          comparisonLabel={comparisonLabel}
          expectation={expectation}
          resultLabel={resultLabel}
        />
      )}
      {allowFeedback ? (
        <div aria-hidden={!isFeedbackOpen} className='inline-feedback' id={feedbackId}>
          <div className='feedback-input-frame'>
            <textarea
              aria-label={label}
              onChange={(event) => {
                const nextComment = event.currentTarget.value;
                updateDraft((draft) => updateExpectationComment(draft, expectation, expectations, index, nextComment));
              }}
              placeholder='Add feedback for this expectation...'
              ref={feedbackRef}
              tabIndex={isFeedbackOpen ? undefined : -1}
              value={comment}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ExpectationCardBody({
  comparisonExpectation,
  comparisonLabel,
  expectation,
  resultLabel
}: {
  comparisonExpectation: ExpectationView | undefined;
  comparisonLabel: string;
  expectation: ExpectationView;
  resultLabel: string;
}) {
  const showEvidence = !expectation.passed;
  const hasEvidence = Boolean(expectation.evidence || comparisonExpectation?.evidence);

  return (
    <>
      <div className='expectation-main'>
        <ExpectationCardHeader
          comparisonExpectation={comparisonExpectation}
          comparisonLabel={comparisonLabel}
          expectation={expectation}
        />
      </div>
      {showEvidence && hasEvidence ? (
        <div className='evidence-grid'>
          <EvidenceBlock label={`${resultLabel} Evidence`} text={expectation.evidence} />
          <EvidenceBlock label={`${comparisonLabel} Evidence`} muted text={comparisonExpectation?.evidence ?? ''} />
        </div>
      ) : null}
      {showEvidence && !hasEvidence ? (
        <p className='empty-copy'>No evidence was recorded for this expectation.</p>
      ) : null}
    </>
  );
}

function ExpectationCardHeader({
  comparisonExpectation,
  comparisonLabel,
  expectation
}: {
  comparisonExpectation: ExpectationView | undefined;
  comparisonLabel: string;
  expectation: ExpectationView;
}) {
  return (
    <>
      <div className='status-icon'>
        <span aria-hidden='true' className='material-symbols-outlined'>
          {expectation.passed ? 'check' : 'close'}
        </span>
      </div>
      <div>
        <p className='expectation-text'>{expectation.text}</p>
      </div>
      <StatusBadge comparison={comparisonExpectation} comparisonLabel={comparisonLabel} passed={expectation.passed} />
    </>
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

function expectationStatus(expectation: ExpectationView | undefined): string {
  if (!expectation) {
    return 'N/A';
  }
  return expectation.passed ? 'PASS' : 'FAIL';
}

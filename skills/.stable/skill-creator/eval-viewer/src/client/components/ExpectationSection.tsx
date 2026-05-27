import { useState } from 'react';
import type { ExpectationView, RunFeedbackView } from '../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../feedbackDraft.js';
import { ExpectationCard } from './ExpectationCard.js';

export function ExpectationSection({
  allowFeedback,
  comparisonExpectations,
  comparisonLabel,
  defaultOpen,
  draft,
  expectations,
  label,
  resultLabel,
  updateDraft,
  variant
}: {
  allowFeedback: boolean;
  comparisonExpectations: ExpectationView[];
  comparisonLabel: string;
  defaultOpen: boolean;
  draft: RunFeedbackView;
  expectations: ExpectationView[];
  label: string;
  resultLabel: string;
  updateDraft: FeedbackDraftUpdater;
  variant: 'overall' | 'turn';
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const passed = expectations.filter((expectation) => expectation.passed).length;
  const total = expectations.length;
  const status = passed === total ? 'pass' : 'fail';
  const headingId = `${variant}-${label.toLowerCase().replaceAll(/\s+/gu, '-')}-expectations`;

  if (total === 0) {
    return null;
  }

  return (
    <section className={`expectation-section ${status}`} data-state={isOpen ? 'open' : 'closed'} data-variant={variant}>
      <button
        aria-label={`${label} ${passed}/${total} expectations passed`}
        aria-controls={headingId}
        aria-expanded={isOpen}
        className="expectation-section-heading"
        onClick={() => setIsOpen((current) => !current)}
        type="button">
        <span aria-hidden="true" className="material-symbols-outlined">
          {isOpen ? 'expand_more' : 'chevron_right'}
        </span>
        <span className="expectation-section-title">{label}</span>
        <span className="expectation-section-count">
          {passed}/{total} expectations passed
        </span>
      </button>
      <div className="expectation-section-body" hidden={!isOpen} id={headingId}>
        {expectations.map((expectation, index) => (
          <ExpectationCard
            allowFeedback={allowFeedback}
            comparisonExpectation={expectationComparison(comparisonExpectations, expectation)}
            comparisonLabel={comparisonLabel}
            draft={draft}
            expectation={expectation}
            expectations={expectations}
            index={index}
            key={expectation.id ?? `${expectation.scope}-${expectation.turn ?? 0}-${expectation.text}`}
            resultLabel={resultLabel}
            updateDraft={updateDraft}
          />
        ))}
      </div>
    </section>
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

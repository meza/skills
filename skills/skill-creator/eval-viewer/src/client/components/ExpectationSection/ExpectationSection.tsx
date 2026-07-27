import type { ExpectationView, RunFeedbackView } from '../../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../../feedbackDraft.js';
import { ExpectationCard } from '../ExpectationCard/ExpectationCard.js';
import * as expectationSectionStyles from './ExpectationSection.module.css';

const { default: styles } = expectationSectionStyles;

export function ExpectationSection({
  allowFeedback,
  comparisonExpectations,
  comparisonLabel,
  draft,
  expectations,
  isOpen,
  label,
  onToggle,
  updateDraft,
  variant
}: {
  allowFeedback: boolean;
  comparisonExpectations: ExpectationView[];
  comparisonLabel: string;
  draft: RunFeedbackView;
  expectations: ExpectationView[];
  isOpen: boolean;
  label: string;
  onToggle: () => void;
  updateDraft: FeedbackDraftUpdater;
  variant: 'overall' | 'turn';
}) {
  const passed = expectations.filter((expectation) => expectation.passed).length;
  const total = expectations.length;
  const isPassing = passed === total;
  const status = isPassing ? 'pass' : 'fail';
  const headingId = `${variant}-${label.toLowerCase().replaceAll(/\s+/gu, '-')}-expectations`;

  if (total === 0) {
    return null;
  }

  return (
    <section
      className={[styles.section, isPassing ? undefined : styles.failing, 'expectation-section', status]
        .filter(Boolean)
        .join(' ')}
      data-state={isOpen ? 'open' : 'closed'}
      data-variant={variant}>
      <button
        aria-controls={headingId}
        aria-expanded={isOpen}
        aria-label={`${label} ${passed}/${total} expectations passed`}
        className={`${styles.heading} expectation-section-heading`}
        onClick={onToggle}
        type='button'>
        <span aria-hidden='true' className={`${styles.icon} material-symbols-outlined`}>
          {isOpen ? 'expand_more' : 'chevron_right'}
        </span>
        <span className={`${styles.title} expectation-section-title`}>{label}</span>
        <span className={`${styles.count} expectation-section-count`}>
          {passed}/{total} expectations passed
        </span>
      </button>
      <div className={`${styles.body} expectation-section-body`} hidden={!isOpen} id={headingId}>
        {expectations.map((expectation, index) => (
          <ExpectationCard
            allowFeedback={allowFeedback}
            comparisonExpectation={expectationComparison(comparisonExpectations, expectation)}
            comparisonLabel={comparisonLabel}
            draft={draft}
            expectation={expectation}
            expectations={expectations}
            index={index}
            key={expectation.id}
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
      (expectation.scope === 'overall' || (candidate.scope === 'turn' && candidate.turn === expectation.turn))
  );
}

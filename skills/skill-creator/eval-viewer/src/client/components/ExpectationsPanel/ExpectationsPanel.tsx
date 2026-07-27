import type { ExpectationView, RunFeedbackView, RunView } from '../../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../../feedbackDraft.js';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import { ExpectationSection } from '../ExpectationSection/ExpectationSection.js';
import * as styles from './ExpectationsPanel.module.css';

export type ExpectationResultMode = 'skill' | 'baseline';
interface SectionOpenState extends Record<string, boolean> {
  overall: boolean;
}

export function ExpectationsPanel({
  draft,
  onResultModeChange,
  run,
  resultMode: controlledResultMode,
  updateDraft
}: {
  draft: RunFeedbackView;
  onResultModeChange?: (resultMode: ExpectationResultMode) => void;
  run: RunView;
  resultMode?: ExpectationResultMode;
  updateDraft: FeedbackDraftUpdater;
}) {
  const [uncontrolledResultMode, setUncontrolledResultMode] = useState<ExpectationResultMode>('skill');
  const [sectionOpenState, setSectionOpenState] = useState<SectionOpenState>(() =>
    defaultSectionOpenState(run.expectations, draft)
  );
  const latestDraftRef = useRef(draft);
  latestDraftRef.current = draft;
  const baselineComparison = run.comparisons.baseline;
  const baselineExpectations = baselineComparison === undefined ? [] : baselineComparison.expectations;
  const canShowBaseline = baselineExpectations.length > 0;
  const requestedResultMode = controlledResultMode ?? uncontrolledResultMode;
  const resultMode = requestedResultMode === 'baseline' && canShowBaseline ? 'baseline' : 'skill';
  const displayedExpectations = resultMode === 'baseline' ? baselineExpectations : run.expectations;
  const comparisonExpectations = resultMode === 'baseline' ? run.expectations : baselineExpectations;
  const overall = displayedExpectations.filter((expectation) => expectation.scope === 'overall');
  const turns = turnExpectationGroups(displayedExpectations);
  const passed = displayedExpectations.filter((expectation) => expectation.passed).length;

  useEffect(() => {
    setUncontrolledResultMode('skill');
    onResultModeChange?.('skill');
    setSectionOpenState(defaultSectionOpenState(run.expectations, latestDraftRef.current));
  }, [onResultModeChange, run.expectations]);

  function requestResultMode(nextResultMode: ExpectationResultMode): void {
    setUncontrolledResultMode(nextResultMode);
    onResultModeChange?.(nextResultMode);
  }

  return (
    <section className={`${styles.panel} expectations`}>
      <div className={`${styles.heading} section-heading`}>
        <div className={`${styles.headingMain} expectation-heading-main`}>
          <div className={styles.titleGroup}>
            <span aria-hidden='true' className={`${styles.headingIcon} material-symbols-outlined`}>
              verified
            </span>
            <h3 className={styles.title}>Expectations Breakdown</h3>
          </div>
          <fieldset className={`${styles.resultToggle} result-toggle`}>
            <legend className='visually-hidden'>Expectation result source</legend>
            {(['skill', 'baseline'] as const).map((mode) => (
              <button
                aria-pressed={resultMode === mode}
                className={styles.resultButton}
                disabled={mode === 'baseline' && !canShowBaseline}
                key={mode}
                onClick={() => requestResultMode(mode)}
                type='button'>
                {mode}
              </button>
            ))}
          </fieldset>
        </div>
        <span className={styles.summary}>
          {passed}/{displayedExpectations.length} requirements passed
        </span>
      </div>
      <ExpectationSection
        allowFeedback={resultMode === 'skill'}
        comparisonExpectations={comparisonExpectations}
        comparisonLabel={resultMode === 'baseline' ? 'Skill' : 'Baseline'}
        draft={draft}
        expectations={overall}
        isOpen={sectionOpenState.overall}
        label='Overall Expectations'
        onToggle={() => toggleSectionOpenState(setSectionOpenState, 'overall')}
        updateDraft={updateDraft}
        variant='overall'
      />
      {turns.map((turn) => (
        <ExpectationSection
          allowFeedback={resultMode === 'skill'}
          comparisonExpectations={comparisonExpectations}
          comparisonLabel={resultMode === 'baseline' ? 'Skill' : 'Baseline'}
          draft={draft}
          expectations={turn.expectations}
          isOpen={sectionOpenState[turnSectionKey(turn.turn)] === true}
          key={turn.turn}
          label={`Turn ${turn.turn}`}
          onToggle={() => toggleSectionOpenState(setSectionOpenState, turnSectionKey(turn.turn))}
          updateDraft={updateDraft}
          variant='turn'
        />
      ))}
    </section>
  );
}

function toggleSectionOpenState(
  setSectionOpenState: Dispatch<SetStateAction<SectionOpenState>>,
  sectionKey: string
): void {
  setSectionOpenState((current) => ({ ...current, [sectionKey]: !current[sectionKey] }));
}

function turnExpectationGroups(
  expectations: ExpectationView[]
): Array<{ expectations: ExpectationView[]; turn: number }> {
  const turns = new Map<number, ExpectationView[]>();
  for (const expectation of expectations) {
    if (expectation.scope !== 'turn') {
      continue;
    }
    turns.set(expectation.turn, [...(turns.get(expectation.turn) ?? []), expectation]);
  }
  return [...turns.entries()].map(([turn, turnExpectations]) => ({ expectations: turnExpectations, turn }));
}

function defaultSectionOpenState(expectations: ExpectationView[], draft: RunFeedbackView): SectionOpenState {
  const state: SectionOpenState = { overall: true };
  for (const group of turnExpectationGroups(expectations)) {
    state[turnSectionKey(group.turn)] =
      group.expectations.some((expectation) => !expectation.passed) || turnHasFeedback(draft, group.turn);
  }
  return state;
}

function turnSectionKey(turn: number): string {
  return `turn:${turn}`;
}

function turnHasFeedback(draft: RunFeedbackView, turn: number): boolean {
  return draft.turns.some(
    (candidate) =>
      candidate.turn === turn && candidate.expectations.some((expectation) => expectation.comment.trim().length > 0)
  );
}

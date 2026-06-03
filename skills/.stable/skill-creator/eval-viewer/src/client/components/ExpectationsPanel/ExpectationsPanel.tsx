import type { ExpectationView, RunFeedbackView, RunView } from '../../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../../feedbackDraft.js';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import { ExpectationSection } from '../ExpectationSection.js';
import styles from './ExpectationsPanel.module.css';

type ExpectationResultMode = 'skill' | 'baseline';
interface SectionOpenState extends Record<string, boolean> {
  overall: boolean;
}

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
  const [sectionOpenState, setSectionOpenState] = useState<SectionOpenState>(() =>
    defaultSectionOpenState(run.expectations, draft)
  );
  const latestDraftRef = useRef(draft);
  latestDraftRef.current = draft;
  const baselineExpectations = run.comparisons.baseline?.expectations ?? [];
  const canShowBaseline = baselineExpectations.length > 0;
  const resultMode = requestedResultMode === 'baseline' && canShowBaseline ? 'baseline' : 'skill';
  const displayedExpectations = resultMode === 'baseline' ? baselineExpectations : run.expectations;
  const comparisonExpectations = resultMode === 'baseline' ? run.expectations : baselineExpectations;
  const overall = displayedExpectations.filter((expectation) => expectation.scope === 'overall');
  const turns = turnExpectationGroups(displayedExpectations);
  const passed = displayedExpectations.filter((expectation) => expectation.passed).length;

  useEffect(() => {
    setRequestedResultMode('skill');
    setSectionOpenState(defaultSectionOpenState(run.expectations, latestDraftRef.current));
  }, [run.expectations]);

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
                onClick={() => setRequestedResultMode(mode)}
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
        resultLabel={resultMode === 'baseline' ? 'Baseline' : 'Run'}
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
          resultLabel={resultMode === 'baseline' ? 'Baseline' : 'Run'}
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

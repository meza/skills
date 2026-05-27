import { useEffect, useState } from 'react';
import type { ExpectationView, RunFeedbackView, RunView } from '../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../feedbackDraft.js';
import { ExpectationSection } from './ExpectationSection.js';

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
  const turns = turnExpectationGroups(displayedExpectations);
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
      <ExpectationSection
        allowFeedback={resultMode === 'skill'}
        comparisonExpectations={comparisonExpectations}
        comparisonLabel={resultMode === 'baseline' ? 'Skill' : 'Baseline'}
        defaultOpen
        draft={draft}
        expectations={overall}
        label="Overall Expectations"
        resultLabel={resultMode === 'baseline' ? 'Baseline' : 'Run'}
        variant="overall"
        updateDraft={updateDraft}
      />
      {turns.map((turn, index) => (
        <ExpectationSection
          allowFeedback={resultMode === 'skill'}
          comparisonExpectations={comparisonExpectations}
          comparisonLabel={resultMode === 'baseline' ? 'Skill' : 'Baseline'}
          defaultOpen={index === 0}
          draft={draft}
          expectations={turn.expectations}
          key={turn.turn}
          label={`Turn ${turn.turn}`}
          resultLabel={resultMode === 'baseline' ? 'Baseline' : 'Run'}
          updateDraft={updateDraft}
          variant="turn"
        />
      ))}
    </section>
  );
}

function turnExpectationGroups(
  expectations: ExpectationView[]
): Array<{ expectations: ExpectationView[]; turn: number }> {
  const turns = new Map<number, ExpectationView[]>();
  for (const expectation of expectations) {
    if (expectation.scope !== 'turn' || expectation.turn === undefined) {
      continue;
    }
    turns.set(expectation.turn, [...(turns.get(expectation.turn) ?? []), expectation]);
  }
  return [...turns.entries()].map(([turn, turnExpectations]) => ({ expectations: turnExpectations, turn }));
}

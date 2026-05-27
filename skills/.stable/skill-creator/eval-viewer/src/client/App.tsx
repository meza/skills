import { useMemo, useState } from 'react';
import type { FeedbackInput, IterationView, RunFeedbackView } from '../shared/viewModel.js';
import { saveFeedbackToServer } from './api.js';
import { AppHeader } from './components/AppHeader.js';
import { ExpectationsPanel } from './components/ExpectationsPanel.js';
import { FeedbackPanel } from './components/FeedbackPanel.js';
import { RunNavigation } from './components/RunNavigation.js';
import { RunSummary } from './components/RunSummary.js';
import { TranscriptPanel } from './components/TranscriptPanel.js';
import { type FeedbackDraftUpdater, feedbackDraftFromRun, runKey } from './feedbackDraft.js';
import { type RunFilter, visibleReviewRuns } from './runFilters.js';

type FeedbackDraft = RunFeedbackView;

export function App({
  initialIteration,
  saveFeedback = saveFeedbackToServer
}: {
  initialIteration: IterationView;
  saveFeedback?: (feedback: FeedbackInput) => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<RunFilter>('all');
  const reviewRuns = useMemo(
    () => initialIteration.runs.filter((run) => run.runType === 'skill'),
    [initialIteration.runs]
  );
  const [selectedKey, setSelectedKey] = useState(runKey(reviewRuns[0] ?? initialIteration.runs[0]));
  const visibleRuns = useMemo(() => visibleReviewRuns(reviewRuns, filter), [filter, reviewRuns]);
  const selectedRun = visibleRuns.find((run) => runKey(run) === selectedKey) ?? visibleRuns[0] ?? reviewRuns[0];
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>({});
  const selectedIndex = Math.max(
    0,
    reviewRuns.findIndex((run) => runKey(run) === runKey(selectedRun))
  );

  if (!selectedRun) {
    return <main className="content empty-state">No evaluation runs were found.</main>;
  }

  const selectedRunKey = runKey(selectedRun);
  const feedbackDraft = feedbackDrafts[selectedRunKey] ?? feedbackDraftFromRun(selectedRun);

  function selectRun(runToSelect: typeof selectedRun) {
    setSelectedKey(runKey(runToSelect));
  }

  function selectRunAt(offset: number) {
    const targetRun = reviewRuns[selectedIndex + offset];
    setSelectedKey(runKey(targetRun));
    setFilter('all');
  }

  const updateFeedbackDraft: FeedbackDraftUpdater = (updater) => {
    setFeedbackDrafts((current) => ({
      ...current,
      [selectedRunKey]: updater(current[selectedRunKey] ?? feedbackDraftFromRun(selectedRun))
    }));
  };

  return (
    <div className="app-shell">
      <AppHeader summary={initialIteration.summary} />
      <div className="main-layout">
        <RunNavigation
          filter={filter}
          onFilterChange={setFilter}
          onRunSelect={selectRun}
          runs={visibleRuns}
          selectedRun={selectedRun}
        />
        <main className="content">
          <RunSummary
            reviewRunCount={reviewRuns.length}
            run={selectedRun}
            selectedIndex={selectedIndex}
            selectRunAt={selectRunAt}
          />
          <ExpectationsPanel draft={feedbackDraft} run={selectedRun} updateDraft={updateFeedbackDraft} />
          <FeedbackPanel
            draft={feedbackDraft}
            run={selectedRun}
            saveFeedback={saveFeedback}
            updateDraft={updateFeedbackDraft}
          />
          <TranscriptPanel run={selectedRun} />
        </main>
      </div>
    </div>
  );
}

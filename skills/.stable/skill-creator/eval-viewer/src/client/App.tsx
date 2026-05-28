import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeedbackInput, IterationView, RunFeedbackView, RunView } from '../shared/viewModel.js';
import { saveFeedbackToServer } from './api.js';
import { AppHeader } from './components/AppHeader.js';
import { ExpectationsPanel } from './components/ExpectationsPanel.js';
import { FeedbackPanel } from './components/FeedbackPanel.js';
import { RunNavigation } from './components/RunNavigation.js';
import { RunSummary } from './components/RunSummary.js';
import { TranscriptPanel } from './components/TranscriptPanel.js';
import { type FeedbackDraftUpdater, feedbackDraftFromRun, runKey } from './feedbackDraft.js';
import { defaultReviewFilter, type RunFilter, visibleReviewRuns } from './runFilters.js';

type FeedbackDraft = RunFeedbackView;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SaveStates = Record<string, SaveState>;
type EvalTransitionState = 'idle' | 'exiting' | 'entering';

const DEFAULT_EVAL_TRANSITION_MS = 160;

export function App({
  autosaveDelayMs = 600,
  evalTransitionMs = DEFAULT_EVAL_TRANSITION_MS,
  initialIteration,
  saveFeedback = saveFeedbackToServer
}: {
  autosaveDelayMs?: number;
  evalTransitionMs?: number;
  initialIteration: IterationView;
  saveFeedback?: (feedback: FeedbackInput) => Promise<unknown>;
}) {
  const reviewRuns = useMemo(
    () =>
      initialIteration.runs.filter((run) => run.runType === 'skill').sort((left, right) => left.evalId - right.evalId),
    [initialIteration.runs]
  );
  const [filter, setFilter] = useState<RunFilter>(() => defaultReviewFilter(reviewRuns));
  const [selectedKey, setSelectedKey] = useState(runKey(reviewRuns[0] ?? initialIteration.runs[0]));
  const visibleRuns = useMemo(() => visibleReviewRuns(reviewRuns, filter), [filter, reviewRuns]);
  const selectedRun = visibleRuns.find((run) => runKey(run) === selectedKey) ?? visibleRuns[0] ?? reviewRuns[0];
  const { highlightedKey, selectEvalKey, transitionState } = useEvalSelectionTransition({
    evalTransitionMs,
    selectedKey,
    setSelectedKey
  });
  const selectedIndex = Math.max(
    0,
    visibleRuns.findIndex((run) => runKey(run) === runKey(selectedRun))
  );

  if (!selectedRun) {
    return <main className="content empty-state">No evaluation runs were found.</main>;
  }

  const selectedRunKey = runKey(selectedRun);
  const highlightedRun = visibleRuns.find((run) => runKey(run) === highlightedKey) ?? selectedRun;
  const workflow = useFeedbackWorkflow({
    autosaveDelayMs,
    saveFeedback,
    selectEvalKey,
    selectedIndex,
    selectedRun,
    selectedRunKey,
    visibleRuns
  });
  const hasPreviousVisibleRun = selectedIndex > 0;
  const hasNextVisibleRun = selectedIndex < visibleRuns.length - 1;
  const primaryActionLabel = hasNextVisibleRun ? 'Save & Next' : 'Complete feedback for iteration';

  function selectRun(runToSelect: typeof selectedRun) {
    selectEvalKey(runKey(runToSelect));
  }

  function selectRunAt(offset: number) {
    const targetRun = visibleRuns[selectedIndex + offset];
    selectEvalKey(runKey(targetRun));
  }

  return (
    <div className="app-shell">
      <AppHeader summary={initialIteration.summary} />
      <div className="main-layout">
        <RunNavigation
          filter={filter}
          onFilterChange={setFilter}
          onRunSelect={selectRun}
          runs={visibleRuns}
          selectedRun={highlightedRun}
        />
        <main className="content">
          <div className={`eval-detail eval-detail-${transitionState}`} key={selectedRunKey}>
            <RunSummary
              reviewRunCount={visibleRuns.length}
              run={selectedRun}
              selectedIndex={selectedIndex}
              selectRunAt={selectRunAt}
            />
            <ExpectationsPanel
              draft={workflow.feedbackDraft}
              run={selectedRun}
              updateDraft={workflow.updateFeedbackDraft}
            />
            <FeedbackPanel
              draft={workflow.feedbackDraft}
              hasPrevious={hasPreviousVisibleRun}
              onPrevious={async () => {
                await workflow.moveToVisibleRun(-1);
              }}
              onPrimaryAction={async () => {
                if (hasNextVisibleRun) {
                  await workflow.moveToVisibleRun(1);
                  return;
                }
                await workflow.saveSelectedRun();
              }}
              primaryActionLabel={primaryActionLabel}
              saveState={workflow.saveState}
              updateDraft={workflow.updateFeedbackDraft}
            />
            <TranscriptPanel run={selectedRun} />
          </div>
        </main>
      </div>
    </div>
  );
}

function useFeedbackWorkflow({
  autosaveDelayMs,
  saveFeedback,
  selectEvalKey,
  selectedIndex,
  selectedRun,
  selectedRunKey,
  visibleRuns
}: {
  autosaveDelayMs: number;
  saveFeedback: (feedback: FeedbackInput) => Promise<unknown>;
  selectEvalKey: (key: string) => void;
  selectedIndex: number;
  selectedRun: RunView;
  selectedRunKey: string;
  visibleRuns: RunView[];
}) {
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>({});
  const [saveStates, setSaveStates] = useState<SaveStates>({});
  const feedbackDraftsRef = useRef<Record<string, FeedbackDraft>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const feedbackDraft = feedbackDrafts[selectedRunKey] ?? feedbackDraftFromRun(selectedRun);

  async function saveDraft(run: RunView, draft: FeedbackDraft): Promise<boolean> {
    const key = runKey(run);
    setSaveStates((current) => ({ ...current, [key]: 'saving' }));
    try {
      await saveFeedback(feedbackInput(run, draft));
      setSaveStates((current) => ({ ...current, [key]: 'saved' }));
      return true;
    } catch {
      setSaveStates((current) => ({ ...current, [key]: 'error' }));
      return false;
    }
  }

  function scheduleAutosave(run: RunView, draft: FeedbackDraft) {
    const key = runKey(run);
    clearTimeout(saveTimersRef.current[key]);
    saveTimersRef.current[key] = setTimeout(async () => {
      await saveDraft(run, draft);
    }, autosaveDelayMs);
  }

  async function saveSelectedRun(): Promise<boolean> {
    clearTimeout(saveTimersRef.current[selectedRunKey]);
    const draft = feedbackDraftsRef.current[selectedRunKey] ?? feedbackDraft;
    return saveDraft(selectedRun, draft);
  }

  async function moveToVisibleRun(offset: number) {
    const targetRun = visibleRuns[selectedIndex + offset];
    if (!targetRun || !(await saveSelectedRun())) {
      return;
    }
    selectEvalKey(runKey(targetRun));
  }

  const updateFeedbackDraft: FeedbackDraftUpdater = (updater) => {
    const currentDraft = feedbackDraftsRef.current[selectedRunKey] ?? feedbackDraftFromRun(selectedRun);
    const nextDraft = updater(currentDraft);
    feedbackDraftsRef.current = {
      ...feedbackDraftsRef.current,
      [selectedRunKey]: nextDraft
    };
    setFeedbackDrafts(feedbackDraftsRef.current);
    scheduleAutosave(selectedRun, nextDraft);
  };

  return {
    feedbackDraft,
    moveToVisibleRun,
    saveSelectedRun,
    saveState: saveStates[selectedRunKey] ?? 'idle',
    updateFeedbackDraft
  };
}

function useEvalSelectionTransition({
  evalTransitionMs,
  selectedKey,
  setSelectedKey
}: {
  evalTransitionMs: number;
  selectedKey: string;
  setSelectedKey: (key: string) => void;
}) {
  const [transitionState, setTransitionState] = useState<EvalTransitionState>('idle');
  const [highlightedKey, setHighlightedKey] = useState(selectedKey);
  const transitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      for (const timer of transitionTimersRef.current) {
        clearTimeout(timer);
      }
    },
    []
  );

  function clearTransitionTimers() {
    for (const timer of transitionTimersRef.current) {
      clearTimeout(timer);
    }
    transitionTimersRef.current = [];
  }

  function commitEvalKey(nextKey: string) {
    setSelectedKey(nextKey);
    window.scrollTo({ left: 0, top: 0 });
  }

  function selectEvalKey(nextKey: string) {
    if (!nextKey || nextKey === selectedKey) {
      return;
    }
    clearTransitionTimers();
    setHighlightedKey(nextKey);
    if (evalTransitionMs <= 0) {
      commitEvalKey(nextKey);
      setTransitionState('idle');
      return;
    }

    setTransitionState('exiting');
    const exitTimer = setTimeout(() => {
      commitEvalKey(nextKey);
      setTransitionState('entering');
      const enterTimer = setTimeout(() => {
        setTransitionState('idle');
      }, evalTransitionMs);
      transitionTimersRef.current = [enterTimer];
    }, evalTransitionMs);
    transitionTimersRef.current = [exitTimer];
  }

  return { highlightedKey, selectEvalKey, transitionState };
}

function feedbackInput(run: RunView, draft: FeedbackDraft): FeedbackInput {
  return {
    comments: draft.comments,
    evalId: run.evalId,
    overall: draft.overall,
    turns: draft.turns
  };
}

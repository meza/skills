import type {
  FeedbackInput,
  IterationIndexView,
  IterationNumber,
  IterationView,
  RunFeedbackView,
  RunView
} from '../shared/viewModel.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadIterationFromServer, loadIterationIndexFromServer, saveFeedbackToServer } from './api.js';
import { AppHeader } from './components/AppHeader.js';
import { ExpectationsPanel } from './components/ExpectationsPanel.js';
import { FeedbackPanel } from './components/FeedbackPanel.js';
import { NewIterationDialog } from './components/NewIterationDialog.js';
import { RunNavigation } from './components/RunNavigation.js';
import { RunSummary } from './components/RunSummary.js';
import { TranscriptPanel } from './components/TranscriptPanel.js';
import { type FeedbackDraftUpdater, feedbackDraftFromRun, runKey } from './feedbackDraft.js';
import { defaultReviewFilter, type RunFilter, visibleReviewRuns } from './runFilters.js';

type FeedbackDraft = RunFeedbackView;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SaveErrors = Record<string, string>;
type SaveStates = Record<string, SaveState>;
type EvalTransitionState = 'idle' | 'exiting' | 'entering';
export type IterationEventSource = {
  close: () => void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
};
type CreateIterationEventSource = () => IterationEventSource;
type LoadIteration = (iteration?: IterationNumber) => Promise<IterationView>;
type LoadIterationIndex = () => Promise<IterationIndexView>;
type SaveFeedback = (feedback: FeedbackInput, iteration: IterationNumber) => Promise<unknown>;
type FeedbackWorkflow = ReturnType<typeof useFeedbackWorkflow>;
type IterationControls = ReturnType<typeof useIterationControls>;

const DEFAULT_EVAL_TRANSITION_MS = 160;
const ITERATION_STATUS_VISIBLE_MS = 3_200;
const createDefaultIterationEventSource: CreateIterationEventSource = () => new EventSource('/api/iteration-events');

export function App({
  autosaveDelayMs = 600,
  createIterationEventSource = createDefaultIterationEventSource,
  evalTransitionMs = DEFAULT_EVAL_TRANSITION_MS,
  initialIteration,
  loadIteration = loadIterationFromServer,
  loadIterationIndex = loadIterationIndexFromServer,
  saveFeedback = saveFeedbackToServer
}: {
  autosaveDelayMs?: number;
  createIterationEventSource?: CreateIterationEventSource;
  evalTransitionMs?: number;
  initialIteration: IterationView;
  loadIteration?: LoadIteration;
  loadIterationIndex?: LoadIterationIndex;
  saveFeedback?: SaveFeedback;
}) {
  const [iterationView, setIterationView] = useState(initialIteration);
  const reviewRuns = useMemo(
    () => iterationView.runs.filter((run) => run.runType === 'skill').sort((left, right) => left.evalId - right.evalId),
    [iterationView.runs]
  );
  const [filter, setFilter] = useState<RunFilter>(() => defaultReviewFilter(reviewRuns));
  const [selectedKey, setSelectedKey] = useState(runKey(reviewRuns[0] as RunView));
  const visibleRuns = useMemo(() => visibleReviewRuns(reviewRuns, filter), [filter, reviewRuns]);
  const visibleRunFallback = (visibleRuns[0] ?? reviewRuns[0]) as RunView;
  const selectedRun = visibleRuns.find((run) => runKey(run) === selectedKey) ?? visibleRunFallback;
  const { highlightedKey, selectEvalKey, transitionState } = useEvalSelectionTransition({
    evalTransitionMs,
    selectedKey,
    setSelectedKey
  });
  const selectedIndex = Math.max(
    0,
    visibleRuns.findIndex((run) => runKey(run) === runKey(selectedRun))
  );
  const selectedRunKey = runKey(selectedRun);
  const highlightedRun = visibleRuns.find((run) => runKey(run) === highlightedKey) ?? selectedRun;
  const workflow = useFeedbackWorkflow({
    activeIteration: iterationView.summary.iteration,
    autosaveDelayMs,
    saveFeedback,
    selectEvalKey,
    selectedIndex,
    selectedRun,
    visibleRuns
  });
  const hasNextVisibleRun = selectedIndex < visibleRuns.length - 1;
  const primaryActionLabel = hasNextVisibleRun ? 'Save & Next' : 'Complete feedback for iteration';
  const iterationControls = useIterationControls({
    iterationView,
    createIterationEventSource,
    loadIteration,
    loadIterationIndex,
    saveSelectedRunBeforeIterationChange: workflow.saveSelectedRun,
    selectedEvalId: selectedRun.evalId,
    setIterationView,
    setSelectedKey
  });

  const selectRun = (runToSelect: RunView) => selectEvalKey(runKey(runToSelect));
  const selectRunAt = (offset: number) => {
    const targetRun = visibleRuns[selectedIndex + offset];
    selectEvalKey(runKey(targetRun));
  };

  return (
    <div className='app-shell'>
      <AppHeader summary={iterationView.summary} />
      <div className='main-layout'>
        <RunNavigation
          filter={filter}
          onFilterChange={setFilter}
          onRunSelect={selectRun}
          runs={visibleRuns}
          selectedRun={highlightedRun}
        />
        <main className='content'>
          <ReviewDetail
            hasNextVisibleRun={hasNextVisibleRun}
            iterationControls={iterationControls}
            iterationView={iterationView}
            primaryActionLabel={primaryActionLabel}
            selectedIndex={selectedIndex}
            selectedRun={selectedRun}
            selectedRunKey={selectedRunKey}
            selectRunAt={selectRunAt}
            transitionState={transitionState}
            visibleRuns={visibleRuns}
            workflow={workflow}
          />
        </main>
      </div>
      <NewIterationDialog
        currentIteration={iterationView.summary.iteration}
        latestIteration={iterationControls.pendingLatestIteration}
        onDismiss={iterationControls.dismissPendingLatestIteration}
        onViewLatest={iterationControls.loadPendingLatestIterationAfterSavingFeedback}
      />
    </div>
  );
}

function ReviewDetail({
  hasNextVisibleRun,
  iterationControls,
  iterationView,
  primaryActionLabel,
  selectedIndex,
  selectedRun,
  selectedRunKey,
  selectRunAt,
  transitionState,
  visibleRuns,
  workflow
}: {
  hasNextVisibleRun: boolean;
  iterationControls: IterationControls;
  iterationView: IterationView;
  primaryActionLabel: string;
  selectedIndex: number;
  selectedRun: RunView;
  selectedRunKey: string;
  selectRunAt: (offset: number) => void;
  transitionState: EvalTransitionState;
  visibleRuns: RunView[];
  workflow: FeedbackWorkflow;
}) {
  return (
    <div className={`eval-detail eval-detail-${transitionState}`} key={selectedRunKey}>
      <RunSummary
        isRefreshingIterations={iterationControls.isRefreshingIterations}
        iterationStatus={iterationControls.iterationStatus}
        iterationSummary={iterationView.summary}
        onIterationRefreshAfterSavingFeedback={iterationControls.refreshIterationsAfterSavingFeedback}
        onIterationSelectAfterSavingFeedback={iterationControls.selectIterationAfterSavingFeedback}
        reviewRunCount={visibleRuns.length}
        run={selectedRun}
        selectedIndex={selectedIndex}
        selectRunAt={selectRunAt}
      />
      <ExpectationsPanel draft={workflow.feedbackDraft} run={selectedRun} updateDraft={workflow.updateFeedbackDraft} />
      <FeedbackPanel
        draft={workflow.feedbackDraft}
        hasPrevious={selectedIndex > 0}
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
        saveError={workflow.saveError}
        saveState={workflow.saveState}
        updateDraft={workflow.updateFeedbackDraft}
      />
      <TranscriptPanel iteration={iterationView.summary.iteration} run={selectedRun} />
    </div>
  );
}

function useIterationControls({
  iterationView,
  createIterationEventSource,
  loadIteration,
  loadIterationIndex,
  saveSelectedRunBeforeIterationChange,
  selectedEvalId,
  setIterationView,
  setSelectedKey
}: {
  iterationView: IterationView;
  createIterationEventSource: CreateIterationEventSource;
  loadIteration: LoadIteration;
  loadIterationIndex: LoadIterationIndex;
  saveSelectedRunBeforeIterationChange: () => Promise<boolean>;
  selectedEvalId: number;
  setIterationView: (iteration: IterationView) => void;
  setSelectedKey: (key: string) => void;
}) {
  const [isRefreshingIterations, setIsRefreshingIterations] = useState(false);
  const status = useIterationStatus();
  const notification = usePendingIterationNotification({
    createIterationEventSource,
    latestIteration: iterationView.summary.latestIteration
  });
  const commitLoadedIteration = useLoadedIterationCommit({
    selectedEvalId,
    setIterationView,
    setSelectedKey,
    resetPendingLatestIteration: notification.resetPendingLatestIteration
  });

  async function selectIterationAfterSavingFeedback(iterationNumber: IterationNumber) {
    if (iterationNumber === iterationView.summary.iteration || !(await saveSelectedRunBeforeIterationChange())) {
      return;
    }
    await loadIterationWithStatus(iterationNumber);
  }

  async function refreshIterationsAfterSavingFeedback() {
    setIsRefreshingIterations(true);
    try {
      const index = await loadIterationIndex();
      if (index.latestIteration <= iterationView.summary.latestIteration) {
        status.showIterationStatus('No newer iteration found');
        return;
      }
      if (!(await saveSelectedRunBeforeIterationChange())) {
        return;
      }
      await loadIterationWithStatus(index.latestIteration);
    } finally {
      setIsRefreshingIterations(false);
    }
  }

  async function loadPendingLatestIterationAfterSavingFeedback() {
    if (notification.pendingLatestIteration === undefined || !(await saveSelectedRunBeforeIterationChange())) {
      return;
    }
    await loadIterationWithStatus(notification.pendingLatestIteration);
  }

  async function loadIterationWithStatus(iterationNumber: IterationNumber) {
    try {
      const nextIteration = await loadIteration(iterationNumber);
      commitLoadedIteration(nextIteration);
      status.clearIterationStatus();
    } catch (error) {
      status.showIterationStatus(errorMessage(error));
    }
  }

  return {
    isRefreshingIterations,
    iterationStatus: status.iterationStatus,
    dismissPendingLatestIteration: notification.dismissPendingLatestIteration,
    loadPendingLatestIterationAfterSavingFeedback,
    pendingLatestIteration: notification.pendingLatestIteration,
    refreshIterationsAfterSavingFeedback,
    selectIterationAfterSavingFeedback
  };
}

function useIterationStatus() {
  const [iterationStatus, setIterationStatus] = useState('');
  const iterationStatusTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearIterationStatusTimeout();
    },
    []
  );

  function showIterationStatus(message: string) {
    clearIterationStatusTimeout();
    setIterationStatus(message);
    iterationStatusTimeout.current = setTimeout(clearIterationStatus, ITERATION_STATUS_VISIBLE_MS);
  }

  function clearIterationStatus() {
    clearIterationStatusTimeout();
    setIterationStatus('');
  }

  function clearIterationStatusTimeout() {
    if (iterationStatusTimeout.current) {
      clearTimeout(iterationStatusTimeout.current);
      iterationStatusTimeout.current = undefined;
    }
  }

  return {
    clearIterationStatus,
    iterationStatus,
    showIterationStatus
  };
}

function usePendingIterationNotification({
  createIterationEventSource,
  latestIteration
}: {
  createIterationEventSource: CreateIterationEventSource;
  latestIteration: IterationNumber;
}) {
  const [dismissedLatestIteration, setDismissedLatestIteration] = useState<IterationNumber | undefined>(undefined);
  const [pendingLatestIteration, setPendingLatestIteration] = useState<IterationNumber | undefined>(undefined);

  useIterationEventStream({
    createIterationEventSource,
    dismissedLatestIteration,
    latestIteration,
    onNewLatestIteration: setPendingLatestIteration
  });

  function dismissPendingLatestIteration() {
    setDismissedLatestIteration(pendingLatestIteration);
    setPendingLatestIteration(undefined);
  }

  function resetPendingLatestIteration() {
    setDismissedLatestIteration(undefined);
    setPendingLatestIteration(undefined);
  }

  return {
    dismissPendingLatestIteration,
    pendingLatestIteration,
    resetPendingLatestIteration
  };
}

function useLoadedIterationCommit({
  selectedEvalId,
  setIterationView,
  setSelectedKey,
  resetPendingLatestIteration
}: {
  selectedEvalId: number;
  setIterationView: (iteration: IterationView) => void;
  setSelectedKey: (key: string) => void;
  resetPendingLatestIteration: () => void;
}) {
  return (nextIteration: IterationView) => {
    resetPendingLatestIteration();
    setIterationView(nextIteration);
    setSelectedKey(runKey(selectedRunAfterIterationLoad(nextIteration, selectedEvalId)));
  };
}

function selectedRunAfterIterationLoad(nextIteration: IterationView, selectedEvalId: number): RunView {
  const nextReviewRuns = nextIteration.runs
    .filter((run) => run.runType === 'skill')
    .sort((left, right) => left.evalId - right.evalId);
  return (nextReviewRuns.find((run) => run.evalId === selectedEvalId) ?? nextReviewRuns[0]) as RunView;
}

function useIterationEventStream({
  createIterationEventSource,
  dismissedLatestIteration,
  latestIteration,
  onNewLatestIteration
}: {
  createIterationEventSource: CreateIterationEventSource;
  dismissedLatestIteration: IterationNumber | undefined;
  latestIteration: IterationNumber;
  onNewLatestIteration: (iteration: IterationNumber) => void;
}) {
  const dismissedLatestIterationRef = useRef(dismissedLatestIteration);
  const latestIterationRef = useRef(latestIteration);

  useEffect(() => {
    dismissedLatestIterationRef.current = dismissedLatestIteration;
  }, [dismissedLatestIteration]);

  useEffect(() => {
    latestIterationRef.current = latestIteration;
  }, [latestIteration]);

  useEffect(() => {
    const source = createIterationEventSource();
    source.onmessage = (event) => {
      const index = JSON.parse(event.data) as IterationIndexView;
      if (
        index.latestIteration > latestIterationRef.current &&
        index.latestIteration !== dismissedLatestIterationRef.current
      ) {
        onNewLatestIteration(index.latestIteration);
      }
    };
    return () => {
      source.close();
    };
  }, [createIterationEventSource, onNewLatestIteration]);
}

function useFeedbackWorkflow({
  activeIteration,
  autosaveDelayMs,
  saveFeedback,
  selectEvalKey,
  selectedIndex,
  selectedRun,
  visibleRuns
}: {
  activeIteration: IterationNumber;
  autosaveDelayMs: number;
  saveFeedback: SaveFeedback;
  selectEvalKey: (key: string) => void;
  selectedIndex: number;
  selectedRun: RunView;
  visibleRuns: RunView[];
}) {
  const selectedFeedbackKey = feedbackKey(activeIteration, selectedRun);
  const draftStore = useFeedbackDraftStore(selectedFeedbackKey, selectedRun);
  const persistence = useFeedbackPersistence(saveFeedback);
  const autosave = useFeedbackAutosave(autosaveDelayMs, persistence.saveDraft);

  async function saveSelectedRun(): Promise<boolean> {
    autosave.clear(selectedFeedbackKey);
    const draft = draftStore.draftFor(selectedFeedbackKey);
    return persistence.saveDraft(selectedRun, draft, activeIteration);
  }

  async function moveToVisibleRun(offset: number) {
    const targetRun = visibleRuns[selectedIndex + offset];
    if (!targetRun || !(await saveSelectedRun())) {
      return;
    }
    selectEvalKey(runKey(targetRun));
  }

  const updateFeedbackDraft: FeedbackDraftUpdater = (updater) => {
    const currentDraft = draftStore.draftFor(selectedFeedbackKey);
    const nextDraft = updater(currentDraft);
    draftStore.updateDraft(selectedFeedbackKey, nextDraft);
    autosave.schedule(selectedRun, nextDraft, activeIteration);
  };

  return {
    feedbackDraft: draftStore.feedbackDraft,
    moveToVisibleRun,
    saveSelectedRun,
    saveError: persistence.saveErrorFor(selectedFeedbackKey),
    saveState: persistence.saveStateFor(selectedFeedbackKey),
    updateFeedbackDraft
  };
}

function useFeedbackDraftStore(selectedFeedbackKey: string, selectedRun: RunView) {
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>({});
  const feedbackDraftsRef = useRef<Record<string, FeedbackDraft>>({});
  const feedbackDraft = feedbackDrafts[selectedFeedbackKey] ?? feedbackDraftFromRun(selectedRun);

  function draftFor(key: string): FeedbackDraft {
    return feedbackDraftsRef.current[key] ?? feedbackDraft;
  }

  function updateDraft(key: string, draft: FeedbackDraft): void {
    feedbackDraftsRef.current = {
      ...feedbackDraftsRef.current,
      [key]: draft
    };
    setFeedbackDrafts(feedbackDraftsRef.current);
  }

  return {
    draftFor,
    feedbackDraft,
    updateDraft
  };
}

function useFeedbackPersistence(saveFeedback: SaveFeedback) {
  const [saveErrors, setSaveErrors] = useState<SaveErrors>({});
  const [saveStates, setSaveStates] = useState<SaveStates>({});
  const saveQueuesRef = useRef<Record<string, Promise<boolean>>>({});

  async function saveDraft(run: RunView, draft: FeedbackDraft, iterationNumber: IterationNumber): Promise<boolean> {
    const key = feedbackKey(iterationNumber, run);
    const previousSave = saveQueuesRef.current[key] ?? Promise.resolve(true);
    const queuedSave = previousSave.then(() => persistDraft(key, run, draft, iterationNumber));
    saveQueuesRef.current[key] = queuedSave;
    const saved = await queuedSave;
    if (saveQueuesRef.current[key] === queuedSave) {
      delete saveQueuesRef.current[key];
    }
    return saved;
  }

  function saveStateFor(key: string): SaveState {
    return saveStates[key] ?? 'idle';
  }

  function saveErrorFor(key: string): string {
    return saveErrors[key] ?? 'Could not save feedback.';
  }

  async function persistDraft(
    key: string,
    run: RunView,
    draft: FeedbackDraft,
    iterationNumber: IterationNumber
  ): Promise<boolean> {
    setSaveStates((current) => ({ ...current, [key]: 'saving' }));
    setSaveErrors((current) => ({ ...current, [key]: '' }));
    try {
      await saveFeedback(feedbackInput(run, draft), iterationNumber);
      setSaveStates((current) => ({ ...current, [key]: 'saved' }));
      return true;
    } catch (error) {
      setSaveErrors((current) => ({ ...current, [key]: errorMessage(error) }));
      setSaveStates((current) => ({ ...current, [key]: 'error' }));
      return false;
    }
  }

  return {
    saveErrorFor,
    saveDraft,
    saveStateFor
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : 'Could not save feedback.';
}

function useFeedbackAutosave(
  autosaveDelayMs: number,
  saveDraft: (run: RunView, draft: FeedbackDraft, iteration: IterationNumber) => Promise<boolean>
) {
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(
    () => () => {
      for (const timer of Object.values(saveTimersRef.current)) {
        clearTimeout(timer);
      }
    },
    []
  );

  function clear(key: string): void {
    clearTimeout(saveTimersRef.current[key]);
    delete saveTimersRef.current[key];
  }

  function schedule(run: RunView, draft: FeedbackDraft, iterationNumber: IterationNumber): void {
    const key = feedbackKey(iterationNumber, run);
    clear(key);
    saveTimersRef.current[key] = setTimeout(async () => {
      await saveDraft(run, draft, iterationNumber);
      delete saveTimersRef.current[key];
    }, autosaveDelayMs);
  }

  return {
    clear,
    schedule
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

function feedbackKey(iterationNumber: IterationNumber, run: RunView): string {
  return `${iterationNumber}:${runKey(run)}`;
}

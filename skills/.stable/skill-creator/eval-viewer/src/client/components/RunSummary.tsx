import type { IterationNumber, IterationView, RunView } from '../../shared/viewModel.js';
import { formatDeltaPercent, formatPercent } from '../formatters.js';
import { IterationControl } from './IterationControl.js';
import { Metric } from './Metric/Metric.js';

export function RunSummary({
  isRefreshingIterations,
  iterationStatus,
  iterationSummary,
  onIterationRefreshAfterSavingFeedback,
  onIterationSelectAfterSavingFeedback,
  reviewRunCount,
  run,
  selectedIndex,
  selectRunAt
}: {
  isRefreshingIterations: boolean;
  iterationStatus: string;
  iterationSummary: IterationView['summary'];
  onIterationRefreshAfterSavingFeedback: () => Promise<void>;
  onIterationSelectAfterSavingFeedback: (iteration: IterationNumber) => Promise<void>;
  reviewRunCount: number;
  run: RunView;
  selectedIndex: number;
  selectRunAt: (offset: number) => void;
}) {
  return (
    <>
      <section className='run-header'>
        <div>
          <div className='run-context-row'>
            <span className='eyebrow'>Eval ID: {run.evalId}</span>
            <IterationControl
              isRefreshing={isRefreshingIterations}
              onRefreshAfterSavingFeedback={onIterationRefreshAfterSavingFeedback}
              onSelectAfterSavingFeedback={onIterationSelectAfterSavingFeedback}
              status={iterationStatus}
              summary={iterationSummary}
            />
          </div>
          <h2>{run.evalName}</h2>
        </div>
        <div className='run-pager'>
          <button
            aria-label='Previous eval'
            disabled={selectedIndex === 0}
            onClick={() => selectRunAt(-1)}
            type='button'>
            <span aria-hidden='true' className='material-symbols-outlined'>
              chevron_left
            </span>
          </button>
          <span>
            <strong>{selectedIndex + 1}</strong> / {reviewRunCount}
          </span>
          <button
            aria-label='Next eval'
            disabled={selectedIndex >= reviewRunCount - 1}
            onClick={() => selectRunAt(1)}
            type='button'>
            <span aria-hidden='true' className='material-symbols-outlined'>
              chevron_right
            </span>
          </button>
        </div>
      </section>
      <section className='summary-card'>
        <div className='card-title'>
          <span aria-hidden='true' className='material-symbols-outlined'>
            auto_awesome
          </span>
          <h3>Executive Summary</h3>
        </div>
        <p>{run.executiveSummary || 'No executive summary was provided.'}</p>
        <div className='metric-grid'>
          <Metric label='Pass Rate' tone='pass' value={formatPercent(run.passRate)} />
          <Metric
            label='vs Last Iteration'
            value={formatDeltaPercent(run.comparisons.previousIteration?.passRateDelta)}
          />
          <Metric
            label='vs Baseline'
            tone='primary'
            value={formatDeltaPercent(run.comparisons.baseline?.passRateDelta)}
          />
        </div>
      </section>
    </>
  );
}

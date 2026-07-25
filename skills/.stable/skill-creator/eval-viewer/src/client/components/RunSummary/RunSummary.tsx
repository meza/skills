import type { IterationNumber, IterationView, RunView } from '../../../shared/viewModel.js';
import { formatDeltaPercent, formatPercent } from '../../formatters.js';
import { IterationControl } from '../IterationControl/IterationControl.js';
import { Metric } from '../Metric/Metric.js';
import styles from './RunSummary.module.css';

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
      <section className={`${styles.header} run-header`}>
        <div className={styles.heading}>
          <div className={`${styles.context} run-context-row`}>
            <span className='eyebrow'>Eval ID: {run.evalId}</span>
            <IterationControl
              isRefreshing={isRefreshingIterations}
              onRefreshAfterSavingFeedback={onIterationRefreshAfterSavingFeedback}
              onSelectAfterSavingFeedback={onIterationSelectAfterSavingFeedback}
              status={iterationStatus}
              summary={iterationSummary}
            />
          </div>
          <h2 className={styles.title}>{run.evalName}</h2>
        </div>
        <div className={`${styles.pager} run-pager`}>
          <button
            aria-label='Previous eval'
            className={styles.pagerButton}
            disabled={selectedIndex === 0}
            onClick={() => selectRunAt(-1)}
            type='button'>
            <span aria-hidden='true' className='material-symbols-outlined'>
              chevron_left
            </span>
          </button>
          <span className={styles.pagerCount}>
            <strong className={styles.pagerCurrent}>{selectedIndex + 1}</strong> / {reviewRunCount}
          </span>
          <button
            aria-label='Next eval'
            className={styles.pagerButton}
            disabled={selectedIndex >= reviewRunCount - 1}
            onClick={() => selectRunAt(1)}
            type='button'>
            <span aria-hidden='true' className='material-symbols-outlined'>
              chevron_right
            </span>
          </button>
        </div>
      </section>
      <section className={`${styles.summary} summary-card`}>
        <div className={styles.summaryHeading}>
          <span aria-hidden='true' className={`${styles.summaryIcon} material-symbols-outlined`}>
            auto_awesome
          </span>
          <h3 className={styles.summaryTitle}>Executive Summary</h3>
        </div>
        <p className={styles.summaryText}>{run.executiveSummary || 'No executive summary was provided.'}</p>
        <div className={`${styles.metrics} metric-grid`}>
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

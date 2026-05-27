import type { RunView } from '../../shared/viewModel.js';
import { formatDeltaPercent, formatPercent } from '../formatters.js';
import { Metric } from './Metric.js';

export function RunSummary({
  reviewRunCount,
  run,
  selectedIndex,
  selectRunAt
}: {
  reviewRunCount: number;
  run: RunView;
  selectedIndex: number;
  selectRunAt: (offset: number) => void;
}) {
  return (
    <>
      <section className="run-header">
        <div>
          <span className="eyebrow">Run ID: {run.evalId}</span>
          <h2>{run.evalName}</h2>
        </div>
        <div className="run-pager">
          <button disabled={selectedIndex === 0} onClick={() => selectRunAt(-1)} type="button">
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span>
            <strong>{selectedIndex + 1}</strong> / {reviewRunCount}
          </span>
          <button disabled={selectedIndex >= reviewRunCount - 1} onClick={() => selectRunAt(1)} type="button">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </section>
      <section className="summary-card">
        <div className="card-title">
          <span className="material-symbols-outlined">auto_awesome</span>
          <h3>Executive Summary</h3>
        </div>
        <p>{run.executiveSummary || 'No executive summary was provided.'}</p>
        <div className="metric-grid">
          <Metric label="Pass Rate" tone="pass" value={formatPercent(run.passRate)} />
          <Metric
            label="vs Last Iteration"
            value={formatDeltaPercent(run.comparisons.previousIteration?.passRateDelta)}
          />
          <Metric
            label="vs Baseline"
            tone="primary"
            value={formatDeltaPercent(run.comparisons.baseline?.passRateDelta)}
          />
        </div>
      </section>
    </>
  );
}

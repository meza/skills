import type { RunView } from '../../shared/viewModel.js';
import { runKey } from '../feedbackDraft.js';
import {
  filterClassName,
  filterIcon,
  filterLabel,
  REVIEW_FILTERS,
  type RunFilter,
  reviewStatusClassName,
  reviewStatusForRun,
  reviewStatusLabel
} from '../runFilters.js';

export function RunNavigation({
  filter,
  onFilterChange,
  onRunSelect,
  runs,
  selectedRun
}: {
  filter: RunFilter;
  onFilterChange: (filter: RunFilter) => void;
  onRunSelect: (run: RunView) => void;
  runs: RunView[];
  selectedRun: RunView;
}) {
  return (
    <aside className="side-nav">
      <div className="brand-block">
        <span aria-hidden="true" className="material-symbols-outlined brand-icon">
          list_alt
        </span>
        <div>
          <span className="eyebrow">Platform</span>
          <strong>Codex</strong>
        </div>
      </div>
      <div className="filter-label">Filters</div>
      <div className="filters" aria-label="Filters">
        {REVIEW_FILTERS.map((candidate) => (
          <button
            aria-pressed={filter === candidate}
            className={filterClassName(candidate)}
            key={candidate}
            onClick={() => onFilterChange(candidate)}
            type="button">
            <span className="material-symbols-outlined" aria-hidden="true">
              {filterIcon(candidate)}
            </span>
            <span>{filterLabel(candidate)}</span>
          </button>
        ))}
      </div>
      <div className="filter-label">Evals</div>
      <nav aria-label="Evals" className="run-list">
        {runs.map((run) => {
          const reviewStatus = reviewStatusForRun(run);
          return (
            <button
              aria-pressed={runKey(run) === runKey(selectedRun)}
              className={`run-link ${reviewStatusClassName(reviewStatus)}`}
              key={runKey(run)}
              onClick={() => onRunSelect(run)}
              type="button">
              <span>{run.evalName}</span>
              <small>
                <i aria-hidden="true" />
                <span>{reviewStatusLabel(reviewStatus)}</span>
              </small>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

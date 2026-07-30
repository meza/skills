import type { RunView } from '../../../shared/viewModel.js';
import { runKey } from '../../feedbackDraft.js';
import {
  filterClassName,
  filterIcon,
  filterLabel,
  REVIEW_FILTERS,
  type RunFilter,
  reviewStatusClassName,
  reviewStatusForRun,
  reviewStatusLabel
} from '../../runFilters.js';
import * as styles from './RunNavigation.module.css';

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
    <aside className={`${styles.navigation} side-nav`}>
      <div className={styles.brand}>
        <span aria-hidden='true' className={`${styles.brandIcon} material-symbols-outlined brand-icon`}>
          list_alt
        </span>
        <div>
          <span className={styles.brandLabel}>Platform</span>
          <strong className={styles.brandName}>Codex</strong>
        </div>
      </div>
      <fieldset className={`${styles.filterGroup} filters`}>
        <legend className={`${styles.filterLabel} filter-label`}>Filters</legend>
        {REVIEW_FILTERS.map((candidate) => {
          const hookClassName = filterClassName(candidate);
          let stateClassName: string | undefined;
          if (hookClassName === 'filter-pass') {
            stateClassName = styles.passingFilter;
          }
          if (hookClassName === 'filter-fail') {
            stateClassName = styles.failingFilter;
          }

          return (
            <button
              aria-pressed={filter === candidate}
              className={[styles.filterButton, stateClassName, hookClassName].join(' ')}
              key={candidate}
              onClick={() => onFilterChange(candidate)}
              type='button'>
              <span aria-hidden='true' className={`${styles.filterIcon} material-symbols-outlined`}>
                {filterIcon(candidate)}
              </span>
              <span>{filterLabel(candidate)}</span>
            </button>
          );
        })}
      </fieldset>
      <div className={`${styles.filterLabel} filter-label`}>Evals</div>
      <nav aria-label='Evals' className={`${styles.runList} run-list`}>
        {runs.map((run) => {
          const reviewStatus = reviewStatusForRun(run);
          const reviewStatusHookClassName = reviewStatusClassName(reviewStatus);
          const stateClassName = reviewStatusHookClassName === 'pass' ? styles.passingRun : undefined;

          return (
            <button
              aria-pressed={runKey(run) === runKey(selectedRun)}
              className={[styles.runButton, stateClassName, 'run-link', reviewStatusHookClassName].join(' ')}
              key={runKey(run)}
              onClick={() => onRunSelect(run)}
              type='button'>
              <span className={styles.runTitle}>{run.evalName}</span>
              <small className={styles.runMeta}>
                <i aria-hidden='true' className={styles.statusDot} />
                <span className={styles.statusLabel}>{reviewStatusLabel(reviewStatus)}</span>
              </small>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

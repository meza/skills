import type { ChangeEvent } from 'react';
import type { IterationNumber, IterationView } from '../../shared/viewModel.js';
import styles from './IterationControl.module.css';

export function IterationControl({
  isRefreshing,
  onRefreshAfterSavingFeedback,
  onSelectAfterSavingFeedback,
  status,
  summary
}: {
  isRefreshing: boolean;
  onRefreshAfterSavingFeedback: () => Promise<void>;
  onSelectAfterSavingFeedback: (iteration: IterationNumber) => Promise<void>;
  status: string;
  summary: IterationView['summary'];
}) {
  async function handleSelect(event: ChangeEvent<HTMLSelectElement>) {
    await onSelectAfterSavingFeedback(Number(event.target.value));
  }

  async function handleRefresh() {
    await onRefreshAfterSavingFeedback();
  }

  return (
    <div className={styles['iteration-control']}>
      <label className={styles['iteration-control__label']}>
        <span>Iteration</span>
        <select
          aria-label='Iteration'
          className={styles['iteration-control__select']}
          onChange={handleSelect}
          value={summary.iteration}>
          {summary.availableIterations
            .slice()
            .sort((left, right) => right - left)
            .map((iteration) => (
              <option key={iteration} value={iteration}>
                {iteration === summary.latestIteration ? `Latest: ${iteration}` : `Iteration ${iteration}`}
              </option>
            ))}
        </select>
      </label>
      <button
        aria-label='Check for newer iteration'
        className={styles['iteration-control__refresh']}
        disabled={isRefreshing}
        onClick={handleRefresh}
        title='Check for newer iteration'
        type='button'>
        <span aria-hidden='true' className='material-symbols-outlined'>
          refresh
        </span>
      </button>
      {status ? (
        <span aria-atomic='true' aria-live='polite' className={styles['iteration-control__status']} role='status'>
          {status}
        </span>
      ) : null}
    </div>
  );
}

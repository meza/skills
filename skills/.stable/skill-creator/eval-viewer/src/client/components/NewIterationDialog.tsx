import { type KeyboardEvent, useEffect, useRef } from 'react';
import type { IterationNumber } from '../../shared/viewModel.js';
import styles from './NewIterationDialog.module.css';

const focusableSelector = [
  'button:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function NewIterationDialog({
  currentIteration,
  latestIteration,
  onDismiss,
  onViewLatest
}: {
  currentIteration: IterationNumber;
  latestIteration: IterationNumber | undefined;
  onDismiss: () => void;
  onViewLatest: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const viewLatestButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (latestIteration !== undefined) {
      viewLatestButtonRef.current?.focus();
    }
  }, [latestIteration]);

  if (latestIteration === undefined) {
    return null;
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      onDismiss();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const dialog = dialogRef.current as HTMLElement;
    const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements.at(-1) as HTMLElement;
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div className={styles['new-iteration-dialog__backdrop']}>
      <section
        aria-describedby="new-iteration-dialog-description"
        aria-labelledby="new-iteration-dialog-title"
        aria-modal="true"
        className={styles['new-iteration-dialog']}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog">
        <div className={styles['new-iteration-dialog__icon']} aria-hidden="true">
          <span className="material-symbols-outlined">update</span>
        </div>
        <div className={styles['new-iteration-dialog__body']}>
          <h2 id="new-iteration-dialog-title">New iteration available</h2>
          <p className={styles['new-iteration-dialog__description']} id="new-iteration-dialog-description">
            Iteration {latestIteration} is ready. You are viewing iteration {currentIteration}.
          </p>
          <div className={styles['new-iteration-dialog__comparison']} aria-label="Iteration change">
            <div className={styles['new-iteration-dialog__iteration-card']}>
              <span>Current</span>
              <p>Iteration {currentIteration}</p>
            </div>
            <span className={styles['new-iteration-dialog__arrow']} aria-hidden="true">
              <span className="material-symbols-outlined">arrow_forward</span>
            </span>
            <div
              className={`${styles['new-iteration-dialog__iteration-card']} ${styles['new-iteration-dialog__iteration-card--latest']}`}>
              <span>Latest</span>
              <strong>Iteration {latestIteration}</strong>
            </div>
          </div>
        </div>
        <div className={styles['new-iteration-dialog__actions']}>
          <button className="secondary-button" onClick={onDismiss} type="button">
            Keep current
          </button>
          <button className="finalize-button" onClick={onViewLatest} ref={viewLatestButtonRef} type="button">
            View latest
          </button>
        </div>
      </section>
    </div>
  );
}

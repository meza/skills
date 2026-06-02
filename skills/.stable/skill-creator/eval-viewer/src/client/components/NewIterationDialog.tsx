import type { IterationNumber } from '../../shared/viewModel.js';
import { useEffect, useId, useRef } from 'react';
import styles from './NewIterationDialog.module.css';

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
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const viewLatestButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (latestIteration !== undefined) {
      viewLatestButtonRef.current?.focus();
    }
  }, [latestIteration]);

  useEffect(() => {
    const dialog = dialogRef.current as HTMLElement;
    if (latestIteration === undefined || !dialog) {
      return;
    }

    const handleDialogKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = focusableElementsIn(dialog);
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
    };

    dialog.addEventListener('keydown', handleDialogKeyDown);
    return () => dialog.removeEventListener('keydown', handleDialogKeyDown);
  }, [latestIteration, onDismiss]);

  if (latestIteration === undefined) {
    return null;
  }

  return (
    <div className={styles['new-iteration-dialog__backdrop']}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal='true'
        className={styles['new-iteration-dialog']}
        ref={dialogRef}
        role='dialog'>
        <div aria-hidden='true' className={styles['new-iteration-dialog__icon']}>
          <span className='material-symbols-outlined'>update</span>
        </div>
        <div className={styles['new-iteration-dialog__body']}>
          <h2 id={titleId}>New iteration available</h2>
          <p className={styles['new-iteration-dialog__description']} id={descriptionId}>
            Iteration {latestIteration} is ready. You are viewing iteration {currentIteration}.
          </p>
          <div className={styles['new-iteration-dialog__comparison']}>
            <div className={styles['new-iteration-dialog__iteration-card']}>
              <span>Current</span>
              <p>Iteration {currentIteration}</p>
            </div>
            <span aria-hidden='true' className={styles['new-iteration-dialog__arrow']}>
              <span className='material-symbols-outlined'>arrow_forward</span>
            </span>
            <div
              className={`${styles['new-iteration-dialog__iteration-card']} ${styles['new-iteration-dialog__iteration-card--latest']}`}>
              <span>Latest</span>
              <strong>Iteration {latestIteration}</strong>
            </div>
          </div>
        </div>
        <div className={styles['new-iteration-dialog__actions']}>
          <button className='secondary-button' onClick={onDismiss} type='button'>
            Keep current
          </button>
          <button className='finalize-button' onClick={onViewLatest} ref={viewLatestButtonRef} type='button'>
            View latest
          </button>
        </div>
      </section>
    </div>
  );
}

function focusableElementsIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter(isFocusableElement);
}

function isFocusableElement(element: HTMLElement): boolean {
  return element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true';
}

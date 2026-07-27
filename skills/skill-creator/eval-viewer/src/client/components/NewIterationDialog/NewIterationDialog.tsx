import type { IterationNumber } from '../../../shared/viewModel.js';
import { useEffect, useId, useRef } from 'react';
import { ActionButton } from '../ActionButton/ActionButton.js';
import * as newIterationDialogStyles from './NewIterationDialog.module.css';

const { default: styles } = newIterationDialogStyles;

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
    <div className={styles.backdrop}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal='true'
        className={styles.dialog}
        ref={dialogRef}
        role='dialog'>
        <div aria-hidden='true' className={styles.icon}>
          <span className='material-symbols-outlined'>update</span>
        </div>
        <div className={styles.body}>
          <h2 className={styles.title} id={titleId}>
            New iteration available
          </h2>
          <p className={styles.description} id={descriptionId}>
            Iteration {latestIteration} is ready. You are viewing iteration {currentIteration}.
          </p>
          <div className={styles.comparison}>
            <div className={styles.iterationCard}>
              <span className={styles.iterationLabel}>Current</span>
              <p className={styles.iterationValue}>Iteration {currentIteration}</p>
            </div>
            <span aria-hidden='true' className={styles.arrow}>
              <span className={`${styles.arrowIcon} material-symbols-outlined`}>arrow_forward</span>
            </span>
            <div className={`${styles.iterationCard} ${styles.latestIterationCard}`}>
              <span className={`${styles.iterationLabel} ${styles.latestIterationLabel}`}>Latest</span>
              <strong className={`${styles.iterationValue} ${styles.latestIterationValue}`}>
                Iteration {latestIteration}
              </strong>
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <ActionButton onClick={onDismiss} type='button' variant='secondary'>
            Keep current
          </ActionButton>
          <ActionButton onClick={onViewLatest} ref={viewLatestButtonRef} type='button' variant='primary'>
            View latest
          </ActionButton>
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

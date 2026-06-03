import { useEffect, useId, useRef } from 'react';
import styles from './NewIterationDialog.module.css';

export function ReviewCompleteDialog({ isOpen, onDismiss }: { isOpen: boolean; onDismiss: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const actionButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      actionButtonRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles['new-iteration-dialog__backdrop']}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal='true'
        className={styles['new-iteration-dialog']}
        role='dialog'>
        <div aria-hidden='true' className={styles['new-iteration-dialog__icon']}>
          <span className='material-symbols-outlined'>task_alt</span>
        </div>
        <div className={styles['new-iteration-dialog__body']}>
          <h2 id={titleId}>Review complete</h2>
          <p className={styles['new-iteration-dialog__completion-message']} id={descriptionId}>
            Tell your agent that you've finished with your review.
          </p>
        </div>
        <div className={styles['new-iteration-dialog__actions']}>
          <button
            className={`finalize-button ${styles['new-iteration-dialog__primary-action']}`}
            onClick={onDismiss}
            ref={actionButtonRef}
            type='button'>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

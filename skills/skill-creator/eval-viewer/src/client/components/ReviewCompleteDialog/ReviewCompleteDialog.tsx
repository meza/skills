import { useEffect, useId, useRef } from 'react';
import { ActionButton } from '../ActionButton/ActionButton.js';
import styles from './ReviewCompleteDialog.module.css';

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
    <div className={styles.backdrop}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal='true'
        className={styles.dialog}
        role='dialog'>
        <div aria-hidden='true' className={styles.icon}>
          <span className='material-symbols-outlined'>task_alt</span>
        </div>
        <div className={styles.body}>
          <h2 className={styles.title} id={titleId}>
            Review complete
          </h2>
          <p className={styles.completionMessage} id={descriptionId}>
            Tell your agent that you've finished with your review.
          </p>
        </div>
        <div className={styles.actions}>
          <ActionButton
            className={styles.primaryAction}
            onClick={onDismiss}
            ref={actionButtonRef}
            type='button'
            variant='primary'>
            Done
          </ActionButton>
        </div>
      </section>
    </div>
  );
}

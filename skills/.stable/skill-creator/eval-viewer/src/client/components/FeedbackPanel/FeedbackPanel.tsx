import type { RunFeedbackView } from '../../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../../feedbackDraft.js';
import styles from './FeedbackPanel.module.css';

export function FeedbackPanel({
  draft,
  hasPrevious,
  onPrevious,
  onPrimaryAction,
  primaryActionLabel,
  saveError,
  saveState,
  updateDraft
}: {
  draft: RunFeedbackView;
  hasPrevious: boolean;
  onPrevious: () => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
  saveError?: string;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  updateDraft: FeedbackDraftUpdater;
}) {
  return (
    <>
      <section className={`${styles.panel} feedback`}>
        <div className={`${styles.panelContent} ${styles.heading}`}>
          <div className={`${styles.titleGroup} card-title`}>
            <span aria-hidden='true' className={`${styles.icon} material-symbols-outlined`}>
              rate_review
            </span>
            <h3 className={styles.title}>Feedback</h3>
          </div>
        </div>
        <div className={`${styles.panelContent} ${styles.feedbackFrame} feedback-input-frame`}>
          <textarea
            aria-label='Review comments'
            className={styles.comments}
            onChange={(event) => {
              const comments = event.currentTarget.value;
              updateDraft((current) => ({ ...current, comments }));
            }}
            placeholder='Add qualitative observations to help tune the scoring engine...'
            value={draft.comments}
          />
        </div>
        {saveState === 'saved' ? (
          <p className={`${styles.panelContent} ${styles.saveMessage} save-message`} role='status'>
            Saved
          </p>
        ) : null}
        {saveState === 'error' ? (
          <p
            className={`${styles.panelContent} ${styles.saveMessage} ${styles.errorMessage} save-message error`}
            role='alert'>
            {saveError ?? 'Could not save feedback.'}
          </p>
        ) : null}
      </section>
      <div className={`${styles.actions} review-actions`}>
        <button
          className={`${styles.secondaryAction} secondary-button`}
          disabled={!hasPrevious || saveState === 'saving'}
          onClick={onPrevious}
          type='button'>
          Previous
        </button>
        <button
          className={`${styles.primaryAction} finalize-button`}
          disabled={saveState === 'saving'}
          onClick={onPrimaryAction}
          type='button'>
          {primaryActionLabel}
        </button>
      </div>
    </>
  );
}

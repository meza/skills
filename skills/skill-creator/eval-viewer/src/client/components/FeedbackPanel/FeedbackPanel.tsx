import type { RunFeedbackView } from '../../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../../feedbackDraft.js';
import { ActionButton } from '../ActionButton/ActionButton.js';
import * as feedbackPanelStyles from './FeedbackPanel.module.css';

const { default: styles } = feedbackPanelStyles;

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
        <ActionButton
          className={styles.secondaryAction}
          disabled={!hasPrevious || saveState === 'saving'}
          onClick={onPrevious}
          type='button'
          variant='secondary'>
          Previous
        </ActionButton>
        <ActionButton
          className={styles.primaryAction}
          disabled={saveState === 'saving'}
          onClick={onPrimaryAction}
          type='button'
          variant='primary'>
          {primaryActionLabel}
        </ActionButton>
      </div>
    </>
  );
}

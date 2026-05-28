import type { RunFeedbackView } from '../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../feedbackDraft.js';

export function FeedbackPanel({
  draft,
  hasPrevious,
  onPrevious,
  onPrimaryAction,
  primaryActionLabel,
  saveState,
  updateDraft
}: {
  draft: RunFeedbackView;
  hasPrevious: boolean;
  onPrevious: () => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  updateDraft: FeedbackDraftUpdater;
}) {
  return (
    <>
      <section className="feedback">
        <div>
          <div className="card-title">
            <span className="material-symbols-outlined">rate_review</span>
            <h3>Feedback</h3>
          </div>
        </div>
        <div className="feedback-input-frame">
          <textarea
            aria-label="Review comments"
            onChange={(event) => {
              const comments = event.currentTarget.value;
              updateDraft((current) => ({ ...current, comments }));
            }}
            placeholder="Add qualitative observations to help tune the scoring engine..."
            value={draft.comments}
          />
        </div>
        {saveState === 'saved' ? <p className="save-message">Saved</p> : null}
        {saveState === 'error' ? <p className="save-message error">Could not save feedback.</p> : null}
      </section>
      <div className="review-actions">
        <button
          className="secondary-button"
          disabled={!hasPrevious || saveState === 'saving'}
          onClick={onPrevious}
          type="button">
          Previous
        </button>
        <button className="finalize-button" disabled={saveState === 'saving'} onClick={onPrimaryAction} type="button">
          {primaryActionLabel}
        </button>
      </div>
    </>
  );
}

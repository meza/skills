import { useState } from 'react';
import type { FeedbackInput, RunFeedbackView, RunView } from '../../shared/viewModel.js';
import type { FeedbackDraftUpdater } from '../feedbackDraft.js';

export function FeedbackPanel({
  draft,
  run,
  saveFeedback,
  updateDraft
}: {
  draft: RunFeedbackView;
  run: RunView;
  saveFeedback: (feedback: FeedbackInput) => Promise<unknown>;
  updateDraft: FeedbackDraftUpdater;
}) {
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function submitFeedback() {
    setSaveState('saving');
    try {
      await saveFeedback({
        comments: draft.comments,
        evalId: run.evalId,
        overall: draft.overall,
        turns: draft.turns
      });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  return (
    <>
      <section className="feedback">
        <div>
          <div className="card-title">
            <span className="material-symbols-outlined">rate_review</span>
            <h3>Feedback</h3>
          </div>
        </div>
        <textarea
          aria-label="Review comments"
          onChange={(event) => {
            const comments = event.currentTarget.value;
            updateDraft((current) => ({ ...current, comments }));
          }}
          placeholder="Add qualitative observations to help tune the scoring engine..."
          value={draft.comments}
        />
        {saveState === 'saved' ? <p className="save-message">Saved</p> : null}
        {saveState === 'error' ? <p className="save-message error">Could not save feedback.</p> : null}
      </section>
      <button className="finalize-button" disabled={saveState === 'saving'} onClick={submitFeedback} type="button">
        Submit Review &amp; Finalize
      </button>
    </>
  );
}

import { feedbackTurnShape, turnExpectationIndex } from '../shared/feedbackModel.js';
import type { ExpectationView, FeedbackTurnView, RunFeedbackView, RunView } from '../shared/viewModel.js';

export type FeedbackDraftUpdater = (updater: (draft: RunFeedbackView) => RunFeedbackView) => void;

export function runKey(run: RunView | undefined): string {
  return run ? `${run.evalId}:${run.runType}` : '';
}

export function feedbackDraftFromRun(run: RunView): RunFeedbackView {
  const overallExpectations = run.expectations.filter((expectation) => expectation.scope === 'overall');
  const turnShape = feedbackTurnShape(run.expectations);
  return {
    comments: run.feedback.comments || run.userComments || '',
    overall: overallExpectations.map((expectation, index) => ({
      comment: feedbackComment(run.feedback.overall, expectation.id, index),
      expectation_id: expectation.id
    })),
    turns: turnShape.map((turn) => ({
      expectations: turn.expectations.map((expectation, index) => ({
        comment: feedbackComment(
          run.feedback.turns.find((candidate) => candidate.turn === turn.turn)?.expectations ?? [],
          expectation.expectation_id,
          index
        ),
        expectation_id: expectation.expectation_id
      })),
      turn: turn.turn
    }))
  };
}

export function expectationComment(
  draft: RunFeedbackView,
  expectation: ExpectationView,
  expectations: ExpectationView[],
  index: number
): string {
  if (expectation.scope === 'overall') {
    return draft.overall[index]!.comment;
  }
  const turn = expectation.turn;
  const feedbackTurn = draft.turns.find((candidate) => candidate.turn === turn) as FeedbackTurnView | undefined;
  return feedbackTurn?.expectations[turnExpectationIndex(expectations, expectation, index)]?.comment ?? '';
}

export function updateExpectationComment(
  draft: RunFeedbackView,
  expectation: ExpectationView,
  expectations: ExpectationView[],
  index: number,
  comment: string
): RunFeedbackView {
  if (expectation.scope === 'overall') {
    return {
      ...draft,
      overall: draft.overall.map((current, candidateIndex) =>
        candidateIndex === index ? { ...current, comment } : current
      )
    };
  }
  const turn = expectation.turn;
  const expectationIndex = turnExpectationIndex(expectations, expectation, index);
  return {
    ...draft,
    turns: draft.turns.map((candidate) =>
      candidate.turn === turn
        ? {
            ...candidate,
            expectations: candidate.expectations.map((current, candidateIndex) =>
              candidateIndex === expectationIndex ? { ...current, comment } : current
            )
          }
        : candidate
    )
  };
}

function feedbackComment(
  feedback: Array<{ comment: string; expectation_id: string }> | undefined,
  expectationId: string,
  _index: number
): string {
  return feedback?.find((candidate) => candidate.expectation_id === expectationId)?.comment ?? '';
}

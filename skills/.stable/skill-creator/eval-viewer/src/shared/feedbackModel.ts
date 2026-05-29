import type { ExpectationView, FeedbackTurnView, TurnExpectationView } from './viewModel.js';

export function feedbackTurnShape(expectations: ExpectationView[]): FeedbackTurnView[] {
  const turnMap = new Map<number, FeedbackTurnView['expectations']>();
  for (const expectation of expectations) {
    if (expectation.scope !== 'turn') {
      continue;
    }
    turnMap.set(expectation.turn, [
      ...(turnMap.get(expectation.turn) ?? []),
      { comment: '', expectation_id: expectation.id }
    ]);
  }
  return [...turnMap.entries()].map(([turn, expectationFeedback]) => ({
    expectations: expectationFeedback,
    turn
  }));
}

export function turnExpectationIndex(
  expectations: ExpectationView[],
  expectation: TurnExpectationView,
  index: number
): number {
  return (
    expectations
      .slice(0, index + 1)
      .filter((candidate) => candidate.scope === 'turn' && candidate.turn === expectation.turn).length - 1
  );
}

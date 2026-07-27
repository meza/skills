import type { ExpectationView, TurnExpectationView } from './viewModel.js';
import { expect, it } from 'vitest';
import { feedbackTurnShape, turnExpectationIndex } from './feedbackModel.js';

const FIRST_TURN_FIRST_EXPECTATION_INDEX = 1;
const SECOND_TURN_FIRST_EXPECTATION_INDEX = 2;
const FIRST_TURN_SECOND_EXPECTATION_INDEX = 3;

const expectations: ExpectationView[] = [
  {
    evidence: '',
    id: 'overall-one',
    passed: true,
    scope: 'overall',
    text: 'Overall expectation.'
  },
  {
    evidence: '',
    id: 'turn-one-first',
    passed: true,
    scope: 'turn',
    text: 'First turn one expectation.',
    turn: 1
  },
  {
    evidence: '',
    id: 'turn-two-first',
    passed: true,
    scope: 'turn',
    text: 'First turn two expectation.',
    turn: 2
  },
  {
    evidence: '',
    id: 'turn-one-second',
    passed: true,
    scope: 'turn',
    text: 'Second turn one expectation.',
    turn: 1
  }
];

it('groups turn feedback in expectation order while preserving turn buckets', () => {
  expect(feedbackTurnShape(expectations)).toEqual([
    {
      expectations: [
        { comment: '', expectation_id: 'turn-one-first' },
        { comment: '', expectation_id: 'turn-one-second' }
      ],
      turn: 1
    },
    {
      expectations: [{ comment: '', expectation_id: 'turn-two-first' }],
      turn: 2
    }
  ]);
});

it('finds an expectation ordinal within its own turn', () => {
  expect(
    turnExpectationIndex(
      expectations,
      expectations[FIRST_TURN_FIRST_EXPECTATION_INDEX] as TurnExpectationView,
      FIRST_TURN_FIRST_EXPECTATION_INDEX
    )
  ).toBe(0);
  expect(
    turnExpectationIndex(
      expectations,
      expectations[SECOND_TURN_FIRST_EXPECTATION_INDEX] as TurnExpectationView,
      SECOND_TURN_FIRST_EXPECTATION_INDEX
    )
  ).toBe(0);
  expect(
    turnExpectationIndex(
      expectations,
      expectations[FIRST_TURN_SECOND_EXPECTATION_INDEX] as TurnExpectationView,
      FIRST_TURN_SECOND_EXPECTATION_INDEX
    )
  ).toBe(1);
});

import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { iterationView } from './appFixture.js';
import { renderApp } from './renderApp.js';

const FAIL_STATUS_TEXT_PATTERN = /FAIL/;
const PASS_STATUS_TEXT_PATTERN = /PASS/;

it('switches the expectations breakdown between skill and baseline results', async () => {
  const user = userEvent.setup();
  renderApp();

  expect(screen.getByRole('button', { name: 'skill' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('1/1 requirements passed')).toBeInTheDocument();
  expect(screen.getAllByText(PASS_STATUS_TEXT_PATTERN)[0]).toHaveTextContent('Baseline: FAIL');
  expect(screen.getByLabelText('Feedback for turn 1 expectation 1')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'baseline' }));

  expect(screen.getByRole('button', { name: 'baseline' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('0/1 requirements passed')).toBeInTheDocument();
  expect(screen.getAllByText(FAIL_STATUS_TEXT_PATTERN)[0]).toHaveTextContent('Skill: PASS');
  expect(screen.getByText('Evidence')).toBeInTheDocument();
  expect(screen.getByText('The answer uses fix: and omits the breaking-change impact.')).toBeInTheDocument();
  expect(screen.queryByText('Baseline Evidence')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Feedback for turn 1 expectation 1')).not.toBeInTheDocument();
});

it('switches the execution history and metadata between skill and baseline results', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const skillRun = view.runs.find((run) => run.runType === 'skill');
  const baselineRun = view.runs.find((run) => run.runType === 'baseline');
  if (!skillRun || !baselineRun) {
    throw new Error('Expected skill and baseline runs in the test fixture.');
  }

  renderApp({ initialIteration: view });

  expect(screen.getByText(skillRun.providerSessionId as string)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Raw JSON Output' })).toHaveAttribute(
    'href',
    `/api/artifacts?iteration=4&path=${encodeURIComponent(skillRun.artifactPaths.rawOutput as string)}`
  );

  await user.click(screen.getByRole('button', { name: 'baseline' }));

  expect(screen.getByText('Final Response')).toBeInTheDocument();
  expect(screen.getByText(baselineRun.finalResponse)).toBeInTheDocument();
  expect(screen.getByText(baselineRun.providerSessionId as string)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Raw JSON Output' })).toHaveAttribute(
    'href',
    `/api/artifacts?iteration=4&path=${encodeURIComponent(baselineRun.artifactPaths.rawOutput as string)}`
  );

  await user.click(screen.getByRole('button', { name: 'skill' }));

  expect(screen.getByText(skillRun.providerSessionId as string)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Raw JSON Output' })).toHaveAttribute(
    'href',
    `/api/artifacts?iteration=4&path=${encodeURIComponent(skillRun.artifactPaths.rawOutput as string)}`
  );
});

it('keeps skill execution history when baseline artifact details are unavailable', async () => {
  const user = userEvent.setup();
  const view = iterationView();
  const skillRun = view.runs.find((run) => run.runType === 'skill');
  if (!skillRun) {
    throw new Error('Expected a skill run in the test fixture.');
  }
  view.runs = [skillRun];

  renderApp({ initialIteration: view });

  await user.click(screen.getByRole('button', { name: 'baseline' }));

  expect(screen.getByText(skillRun.providerSessionId as string)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Raw JSON Output' })).toHaveAttribute(
    'href',
    `/api/artifacts?iteration=4&path=${encodeURIComponent(skillRun.artifactPaths.rawOutput as string)}`
  );
});

it('disables baseline expectation viewing when no baseline grading exists', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.comparisons = {};

  renderApp({ initialIteration: view });

  expect(screen.getByRole('button', { name: 'skill' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'baseline' })).toBeDisabled();
});

it('renders failed expectations and missing final responses', () => {
  const view = iterationView();
  const failedRun = view.runs[0];
  if (!failedRun) {
    throw new Error('Expected a first run in the test fixture.');
  }
  failedRun.expectations = [
    {
      evidence: 'The answer uses fix: and omits the breaking-change impact.',
      id: 'failed-overall-expectation',
      passed: false,
      scope: 'overall',
      text: 'Uses a breaking-change commit message when required'
    }
  ];
  failedRun.comparisons.baseline = {
    runType: 'baseline',
    durationDelta: 0,
    expectations: [
      {
        evidence: 'Baseline also missed the breaking-change impact.',
        id: 'baseline-failed-overall-expectation',
        passed: false,
        scope: 'overall',
        text: 'Uses a breaking-change commit message when required'
      }
    ],
    finalResponse: '',
    passRateDelta: 0,
    tokenDelta: 0
  };
  failedRun.finalResponse = '';
  failedRun.turns = [];

  renderApp({ initialIteration: view });

  expect(screen.getAllByText(FAIL_STATUS_TEXT_PATTERN).length).toBeGreaterThan(0);
  expect(screen.getByText('Evidence')).toBeInTheDocument();
  expect(screen.getByText('No response artifact was available.')).toBeInTheDocument();
});

it('shows explicit missing evidence copy for failed expectations', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.expectations = [
    {
      evidence: '',
      id: 'missing-evidence-overall-expectation',
      passed: false,
      scope: 'overall',
      text: 'Requires evidence to explain failure.'
    }
  ];

  renderApp({ initialIteration: view });

  expect(screen.getByText('No evidence was recorded for this expectation.')).toBeInTheDocument();
});

it('omits empty baseline evidence while keeping skill evidence', () => {
  const view = iterationView();
  const run = view.runs[0];
  if (!run) {
    throw new Error('Expected a first run in the test fixture.');
  }
  run.expectations = [
    {
      evidence: 'The response missed the required breaking-change footer.',
      id: 'skill-evidence-overall-expectation',
      passed: false,
      scope: 'overall',
      text: 'Requires the breaking-change footer.'
    }
  ];
  run.comparisons.baseline = {
    runType: 'baseline',
    durationDelta: 0,
    expectations: [],
    finalResponse: '',
    passRateDelta: 0,
    tokenDelta: 0
  };

  renderApp({ initialIteration: view });

  expect(screen.getByText('Evidence')).toBeInTheDocument();
  expect(screen.getByText('The response missed the required breaking-change footer.')).toBeInTheDocument();
  expect(screen.queryByText('Baseline Evidence')).not.toBeInTheDocument();
  expect(screen.queryByText('Run Evidence')).not.toBeInTheDocument();
});

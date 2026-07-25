import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { iterationView } from '../App/appFixture.js';
import { TranscriptPanel } from './TranscriptPanel.js';

it('renders turn prompts, responses, transcripts, metadata, and artifact links', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the transcript fixture.');
  }

  render(<TranscriptPanel iteration={4} run={{ ...run, turns: [{ ...run.turns[0]!, response: '' }] }} />);

  expect(screen.getByRole('heading', { name: 'Execution History' })).toBeInTheDocument();
  expect(screen.getByText('Turn 1')).toBeInTheDocument();
  expect(screen.getByText('Generate a commit message for the staged changes.')).toBeInTheDocument();
  expect(screen.getByText('feat!: support signing key rotation')).toBeInTheDocument();
  expect(screen.getByText('USER: Generate a commit message')).toBeInTheDocument();
  expect(screen.getByText('F:/workdirs/eval-1')).toBeInTheDocument();
  expect(screen.getByText('019e64c2-2d87-7a21-a12c-d569bab5c067')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Raw JSON Output' })).toHaveAttribute(
    'href',
    `/api/artifacts?iteration=4&path=${encodeURIComponent(run.artifactPaths.rawOutput as string)}`
  );
});

it('renders final-response fallback when no turn history exists', () => {
  const run = iterationView().runs[0];
  if (!run) {
    throw new Error('Expected a run for the transcript fixture.');
  }

  render(
    <TranscriptPanel
      iteration={4}
      run={{ ...run, finalResponse: '', providerSessionId: '', turns: [], workingDirectory: '' }}
    />
  );

  expect(screen.getByText('Final Response')).toBeInTheDocument();
  expect(screen.getByText('No response artifact was available.')).toBeInTheDocument();
  expect(screen.queryByText('Working Directory')).not.toBeInTheDocument();
  expect(screen.queryByText('Provider UUID')).not.toBeInTheDocument();
});

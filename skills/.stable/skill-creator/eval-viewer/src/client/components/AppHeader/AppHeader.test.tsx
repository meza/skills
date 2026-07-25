import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { iterationView } from '../App/appFixture.js';
import { AppHeader } from './AppHeader.js';

it('renders the viewer title and execution context', () => {
  render(<AppHeader summary={iterationView().summary} />);

  expect(screen.getByRole('heading', { name: 'Skill Evaluation' })).toBeInTheDocument();
  expect(screen.getByText('codex / gpt-5 / high')).toBeInTheDocument();
});

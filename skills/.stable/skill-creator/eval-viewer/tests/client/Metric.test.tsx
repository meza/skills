import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Metric } from '../../src/client/components/Metric.js';

it('renders a muted metric by default', () => {
  render(<Metric label='vs Last Iteration' value='N/A' />);

  expect(screen.getByText('vs Last Iteration')).toBeInTheDocument();
  expect(screen.getByText('N/A')).toBeInTheDocument();
});

it('renders the requested metric tone', () => {
  render(<Metric label='Pass Rate' tone='pass' value='100%' />);

  expect(screen.getByText('Pass Rate')).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
});

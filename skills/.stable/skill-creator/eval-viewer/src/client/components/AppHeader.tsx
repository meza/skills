import type { IterationView } from '../../shared/viewModel.js';

export function AppHeader({ summary }: { summary: IterationView['summary'] }) {
  return (
    <header className="top-bar">
      <h1>Skill Evaluation</h1>
      <p>{`${summary.provider} / ${summary.model} / ${summary.effort}`}</p>
    </header>
  );
}

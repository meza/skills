import type { IterationView } from '../../../shared/viewModel.js';
import styles from './AppHeader.module.css';

export function AppHeader({ summary }: { summary: IterationView['summary'] }) {
  return (
    <header className={`${styles.header} top-bar`}>
      <h1 className={styles.title}>Skill Evaluation</h1>
      <p className={styles.metadata}>{`${summary.provider} / ${summary.model} / ${summary.effort}`}</p>
    </header>
  );
}

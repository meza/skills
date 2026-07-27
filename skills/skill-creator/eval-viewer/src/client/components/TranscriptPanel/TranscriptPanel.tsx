import type { IterationNumber, RunView } from '../../../shared/viewModel.js';
import { artifactHref, displayWorkingDirectory } from '../../formatters.js';
import * as transcriptPanelStyles from './TranscriptPanel.module.css';

const { default: styles } = transcriptPanelStyles;

export function TranscriptPanel({ iteration, run }: { iteration: IterationNumber; run: RunView }) {
  return (
    <section className={`${styles.panel} history`}>
      <div className={`${styles.main} history-main`}>
        <h3 className={styles.title}>Execution History</h3>
        {run.turns.length > 0 ? (
          run.turns.map((turn, index) => (
            <article className={`${styles.turn} turn`} key={turnKey(turn)}>
              <div className={`${styles.turnDivider} turn-divider`}>
                <span className={styles.turnDividerLine} />
                <strong className={styles.turnDividerLabel}>Turn {index + 1}</strong>
                <span className={styles.turnDividerLine} />
              </div>
              <div className={`${styles.message} message prompt`}>
                <span aria-hidden='true' className={`${styles.messageIcon} material-symbols-outlined`}>
                  person
                </span>
                <p className={styles.messageText}>{turn.prompt}</p>
              </div>
              <div className={`${styles.message} message response`}>
                <span
                  aria-hidden='true'
                  className={`${styles.messageIcon} ${styles.responseIcon} material-symbols-outlined`}>
                  bolt
                </span>
                <p className={`${styles.messageText} ${styles.responseText}`}>{turn.response || run.finalResponse}</p>
              </div>
              <details className={`${styles.rawContext} raw-context`}>
                <summary className={styles.rawContextSummary}>Raw Execution Context</summary>
                <pre className={styles.rawContextBody}>{turn.transcript}</pre>
              </details>
            </article>
          ))
        ) : (
          <article className={`${styles.turn} turn`}>
            <div className={`${styles.turnDivider} turn-divider`}>
              <span className={styles.turnDividerLine} />
              <strong className={styles.turnDividerLabel}>Final Response</strong>
              <span className={styles.turnDividerLine} />
            </div>
            <div className={`${styles.message} message response`}>
              <span
                aria-hidden='true'
                className={`${styles.messageIcon} ${styles.responseIcon} material-symbols-outlined`}>
                bolt
              </span>
              <p className={`${styles.messageText} ${styles.responseText}`}>
                {run.finalResponse || 'No response artifact was available.'}
              </p>
            </div>
          </article>
        )}
      </div>
      <aside className={`${styles.metadata} metadata`}>
        <h3 className={styles.title}>Metadata</h3>
        <dl className={styles.metadataList}>
          {run.workingDirectory ? (
            <div>
              <dt className={styles.metadataLabel}>Working Directory</dt>
              <dd className={styles.metadataValue}>{displayWorkingDirectory(run.workingDirectory)}</dd>
            </div>
          ) : null}
          {run.providerSessionId ? (
            <div>
              <dt className={styles.metadataLabel}>Provider UUID</dt>
              <dd className={styles.metadataValue}>{run.providerSessionId}</dd>
            </div>
          ) : null}
        </dl>
        <div className={`${styles.artifactLinks} artifact-links`}>
          <a className={styles.artifactLink} href={artifactHref(run.artifactPaths.rawOutput, iteration)}>
            Raw JSON Output
          </a>
          <a
            className={`${styles.artifactLink} ${styles.runArtifactsLink}`}
            href={artifactHref(run.artifactPaths.runArtifacts, iteration)}>
            View All Artifacts
          </a>
        </div>
      </aside>
    </section>
  );
}

function turnKey(turn: RunView['turns'][number]): string {
  return [turn.prompt, turn.response, turn.transcript].join('\n');
}

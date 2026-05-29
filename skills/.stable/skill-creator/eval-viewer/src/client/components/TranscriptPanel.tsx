import type { RunView } from '../../shared/viewModel.js';
import { artifactHref, displayWorkingDirectory } from '../formatters.js';

export function TranscriptPanel({ run }: { run: RunView }) {
  return (
    <section className="history">
      <div className="history-main">
        <h3>Execution History</h3>
        {run.turns.length > 0 ? (
          run.turns.map((turn, index) => (
            <article className="turn" key={`${turn.prompt}-${index}`}>
              <div className="turn-divider">
                <span />
                <strong>Turn {index + 1}</strong>
                <span />
              </div>
              <div className="message prompt">
                <span aria-hidden="true" className="material-symbols-outlined">
                  person
                </span>
                <p>{turn.prompt}</p>
              </div>
              <div className="message response">
                <span aria-hidden="true" className="material-symbols-outlined">
                  bolt
                </span>
                <p>{turn.response || run.finalResponse}</p>
              </div>
              <details className="raw-context">
                <summary>Raw Execution Context</summary>
                <pre>{turn.transcript}</pre>
              </details>
            </article>
          ))
        ) : (
          <article className="turn">
            <div className="turn-divider">
              <span />
              <strong>Final Response</strong>
              <span />
            </div>
            <div className="message response">
              <span aria-hidden="true" className="material-symbols-outlined">
                bolt
              </span>
              <p>{run.finalResponse || 'No response artifact was available.'}</p>
            </div>
          </article>
        )}
      </div>
      <aside className="metadata">
        <h3>Metadata</h3>
        <dl>
          {run.workingDirectory ? (
            <div>
              <dt>Working Directory</dt>
              <dd>{displayWorkingDirectory(run.workingDirectory)}</dd>
            </div>
          ) : null}
          {run.providerSessionId ? (
            <div>
              <dt>Provider UUID</dt>
              <dd>{run.providerSessionId}</dd>
            </div>
          ) : null}
        </dl>
        <div className="artifact-links">
          <a href={artifactHref(run.artifactPaths.rawOutput)}>Raw JSON Output</a>
          <a href={artifactHref(run.artifactPaths.runArtifacts)}>View All Artifacts</a>
        </div>
      </aside>
    </section>
  );
}

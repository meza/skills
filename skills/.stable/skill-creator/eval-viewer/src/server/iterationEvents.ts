import type { IterationIndexView } from '../shared/viewModel.js';
import { type FSWatcher, watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { loadIteration, loadIterationIndex } from './iterationRepository.js';
import {
  iterationDirectoryKind,
  iterationNumberFromDirectoryName,
  iterationRootPath,
  resultsRootPath,
  validIterationDirectoryEntries
} from './iterationWorkspace.js';

type IterationEventSink = (index: IterationIndexView) => void;
export interface IterationEventLogger {
  error: (value: Record<string, unknown>, message: string) => void;
  info: (value: Record<string, unknown>, message: string) => void;
  warn: (value: Record<string, unknown>, message: string) => void;
}

/**
 * Watches an evaluation workspace and publishes iteration index updates to subscribers.
 *
 * The hub only broadcasts an update after the newest iteration can be loaded, so the
 * browser is not prompted to open a partially written `iteration-N` directory.
 */
export async function createIterationEventHub(workspaceRoot: string, logger: IterationEventLogger) {
  const hub = new IterationEventHub(workspaceRoot, logger);
  await hub.start();
  return hub;
}

class IterationEventHub {
  private readonly clients = new Set<IterationEventSink>();
  private latestIteration = 0;
  private readonly pendingChecks = new Set<ReturnType<typeof setTimeout>>();
  private readonly watchedDirectories = new Set<string>();
  private readonly watchers: FSWatcher[] = [];
  private isChecking = false;
  private needsFollowUpCheck = false;

  constructor(
    private readonly workspaceRoot: string,
    private readonly logger: IterationEventLogger
  ) {}

  async start() {
    const index = await loadIterationIndex(this.workspaceRoot);
    this.latestIteration = index.latestIteration;
    this.watchDirectory(resultsRootPath(this.workspaceRoot));
    await this.watchIterationDirectories();
    this.logger.info(
      {
        iterations: index.iterations,
        latestIteration: index.latestIteration
      },
      'iteration_notifier_started'
    );
  }

  subscribe(send: IterationEventSink) {
    this.clients.add(send);
    return () => {
      this.clients.delete(send);
    };
  }

  close() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers.length = 0;
    for (const check of this.pendingChecks) {
      clearTimeout(check);
    }
    this.pendingChecks.clear();
    this.watchedDirectories.clear();
    this.clients.clear();
  }

  private scheduleIterationChecks(_directory: string, eventType: string, filename: string | Buffer | null) {
    this.logger.info(
      {
        eventType,
        filename: filename?.toString() ?? null,
        latestIteration: this.latestIteration
      },
      'iteration_notifier_fs_event'
    );
    this.runIterationCheck('immediate');
    // New iteration directories may be created before run_manifest.json is visible.
    // The delayed checks re-read the workspace after that short write window.
    for (const delayMs of [250, 1000]) {
      const check = setTimeout(() => {
        this.pendingChecks.delete(check);
        this.runIterationCheck(`delayed-${delayMs}ms`);
      }, delayMs);
      this.pendingChecks.add(check);
    }
  }

  private runIterationCheck(trigger: string) {
    if (this.isChecking) {
      this.needsFollowUpCheck = true;
      return;
    }
    const check = this.checkForLatestIteration(trigger);
    check.catch((error: unknown) => {
      this.logger.error(
        {
          error: errorMessage(error),
          trigger
        },
        'iteration_notifier_check_failed'
      );
    });
  }

  private async checkForLatestIteration(trigger: string) {
    this.isChecking = true;
    try {
      await this.watchIterationDirectories();
      const index = await this.loadReadyIterationIndex();
      this.logger.info(
        {
          discoveredLatestIteration: index.latestIteration,
          knownLatestIteration: this.latestIteration,
          trigger
        },
        'iteration_notifier_checked'
      );
      if (index.latestIteration <= this.latestIteration) {
        return;
      }
      this.latestIteration = index.latestIteration;
      this.logger.info(
        {
          iterations: index.iterations,
          latestIteration: index.latestIteration,
          subscribers: this.clients.size,
          trigger
        },
        'iteration_notifier_new_iteration_detected'
      );
      this.broadcast(index);
    } finally {
      this.isChecking = false;
      if (this.needsFollowUpCheck) {
        this.needsFollowUpCheck = false;
        this.runIterationCheck('follow-up');
      }
    }
  }

  private async loadReadyIterationIndex() {
    const index = await loadIterationIndex(this.workspaceRoot);
    await loadIteration(this.workspaceRoot, {
      availableIterations: index.iterations,
      iteration: index.latestIteration
    });
    return index;
  }

  private broadcast(index: IterationIndexView) {
    for (const send of this.clients) {
      send(index);
    }
  }

  private watchDirectory(directory: string) {
    if (this.watchedDirectories.has(directory)) {
      return;
    }
    try {
      const watcher = watch(directory, (eventType, filename) =>
        this.scheduleIterationChecks(directory, eventType, filename)
      );
      this.watchers.push(watcher);
      this.watchedDirectories.add(directory);
    } catch (error) {
      this.logger.warn(
        {
          directoryKind: iterationDirectoryKind(directory, this.workspaceRoot),
          error: errorMessage(error)
        },
        'iteration_notifier_watch_failed'
      );
    }
  }

  private async watchIterationDirectories() {
    const resultsRoot = resultsRootPath(this.workspaceRoot);
    const entries = await readdir(resultsRoot, { withFileTypes: true });
    for (const entry of validIterationDirectoryEntries(entries)) {
      this.watchDirectory(iterationRootPath(this.workspaceRoot, iterationNumberFromDirectoryName(entry.name)));
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

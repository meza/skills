import { watch } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { createIterationEventHub } from '../../src/server/iterationEvents.js';
import { writeSampleIteration, writeSampleWorkspaceWithHistory } from '../fixtures/sampleIteration.js';
import { vol } from '../support/memfs.js';

vi.mock('../../src/server/artifactSchemas.js', async () => await import('./fakeArtifactSchemas.js'));

const logger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
};

beforeEach(() => {
  vol.reset();
  vi.mocked(watch).mockClear();
  vi.mocked(watch).mockImplementation(() => ({ close: vi.fn() }) as never);
  logger.error.mockClear();
  logger.info.mockClear();
  logger.warn.mockClear();
});

it('emits when a watched filesystem change reveals a newer iteration', async () => {
  const root = join('/memory', 'events');
  await writeSampleWorkspaceWithHistory(root);
  await mkdir(join(root, 'results', 'notes'));
  const hub = await createIterationEventHub(root, logger);
  const send = vi.fn();
  const unsubscribe = hub.subscribe(send);
  const resultsWatcherCallback = firstWatcherCallback();

  await writeSampleIteration(join(root, 'results', 'iteration-2'), { iteration: 2 });
  resultsWatcherCallback('rename', 'iteration-2');

  await vi.waitFor(() => {
    expect(send).toHaveBeenCalledWith({
      iterations: [0, 1, 2],
      latestIteration: 2
    });
  });
  expect(logger.info).toHaveBeenCalledWith(
    expect.objectContaining({ latestIteration: 2 }),
    'iteration_notifier_new_iteration_detected'
  );

  unsubscribe();
  await writeSampleIteration(join(root, 'results', 'iteration-3'), { iteration: 3 });
  resultsWatcherCallback('rename', 'iteration-3');
  await waitForNotifierCheck({ discoveredLatestIteration: 3, trigger: 'immediate' });
  expect(send).toHaveBeenCalledTimes(1);

  hub.close();
  for (const result of vi.mocked(watch).mock.results) {
    expect(result.value.close).toHaveBeenCalled();
  }
});

it('does not emit when a filesystem change leaves the latest iteration unchanged', async () => {
  const root = join('/memory', 'same-latest');
  await writeSampleWorkspaceWithHistory(root);
  const hub = await createIterationEventHub(root, logger);
  const send = vi.fn();
  hub.subscribe(send);
  const resultsWatcherCallback = firstWatcherCallback();

  resultsWatcherCallback('change', 'run_manifest.json');

  await waitForNotifierCheck({ discoveredLatestIteration: 1, knownLatestIteration: 1 });
  expect(send).not.toHaveBeenCalled();
  resultsWatcherCallback('rename', null);
  await waitForNotifierLog({ filename: null }, 'iteration_notifier_fs_event');
  hub.close();
});

it('rechecks after a filesystem event so newly visible iteration directories are watched', async () => {
  vi.useFakeTimers();
  const root = join('/memory', 'delayed-directory');
  await writeSampleWorkspaceWithHistory(root, { iteration: 1 });
  const hub = await createIterationEventHub(root, logger);
  const send = vi.fn();
  hub.subscribe(send);
  const resultsWatcherCallback = firstWatcherCallback();

  resultsWatcherCallback('rename', 'iteration-2');
  await writeSampleIteration(join(root, 'results', 'iteration-2'), { iteration: 2 });
  await vi.advanceTimersByTimeAsync(250);

  await vi.waitFor(() => {
    expect(send).toHaveBeenCalledWith({
      iterations: [0, 1, 2],
      latestIteration: 2
    });
  });
  hub.close();
  vi.useRealTimers();
});

it('logs refresh failures without emitting or rejecting from filesystem callbacks', async () => {
  const root = join('/memory', 'failed-check');
  await writeSampleWorkspaceWithHistory(root, { iteration: 1 });
  const hub = await createIterationEventHub(root, logger);
  const send = vi.fn();
  hub.subscribe(send);
  const resultsWatcherCallback = firstWatcherCallback();
  await writeFile(join(root, 'results', 'iteration-1', 'aggregated_results.json'), '{', 'utf-8');

  resultsWatcherCallback('change', 'aggregated_results.json');

  await vi.waitFor(() => {
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'immediate' }),
      'iteration_notifier_check_failed'
    );
  });
  expect(send).not.toHaveBeenCalled();
  hub.close();
});

it('does not announce a newer iteration until the iteration can be loaded', async () => {
  const root = join('/memory', 'partial-iteration');
  await writeSampleWorkspaceWithHistory(root, { iteration: 1 });
  const hub = await createIterationEventHub(root, logger);
  const send = vi.fn();
  hub.subscribe(send);
  const resultsWatcherCallback = firstWatcherCallback();
  const nextIterationRoot = join(root, 'results', 'iteration-2');
  await mkdir(nextIterationRoot, { recursive: true });
  await writeFile(join(nextIterationRoot, 'run_manifest.json'), '{"runs":[]}', 'utf-8');

  resultsWatcherCallback('rename', 'iteration-2');
  await vi.waitFor(() => {
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'immediate' }),
      'iteration_notifier_check_failed'
    );
  });
  expect(send).not.toHaveBeenCalled();

  await writeSampleIteration(nextIterationRoot, { iteration: 2 });
  resultsWatcherCallback('change', 'run_manifest.json');
  await vi.waitFor(() => {
    expect(send).toHaveBeenCalledWith({
      iterations: [0, 1, 2],
      latestIteration: 2
    });
  });
  hub.close();
});

it('runs one follow-up check when filesystem events arrive during an active check', async () => {
  const root = join('/memory', 'follow-up-check');
  await writeSampleWorkspaceWithHistory(root, { iteration: 1 });
  const hub = await createIterationEventHub(root, logger);
  const send = vi.fn();
  hub.subscribe(send);
  const resultsWatcherCallback = firstWatcherCallback();

  await writeSampleIteration(join(root, 'results', 'iteration-2'), { iteration: 2 });
  resultsWatcherCallback('rename', 'iteration-2');
  resultsWatcherCallback('change', 'run_manifest.json');

  await vi.waitFor(() => {
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ discoveredLatestIteration: 2, trigger: 'follow-up' }),
      'iteration_notifier_checked'
    );
  });
  expect(send).toHaveBeenCalledWith({
    iterations: [0, 1, 2],
    latestIteration: 2
  });
  hub.close();
});

it('logs watcher startup failures and keeps the hub usable', async () => {
  vi.mocked(watch).mockImplementation(() => {
    throw new Error('watch unavailable');
  });
  const root = join('/memory', 'watch-failure');
  await writeSampleWorkspaceWithHistory(root);

  const hub = await createIterationEventHub(root, logger);
  const unsubscribe = hub.subscribe(vi.fn());

  expect(logger.warn).toHaveBeenCalledWith(
    expect.objectContaining({ directoryKind: 'results', error: 'watch unavailable' }),
    'iteration_notifier_watch_failed'
  );
  unsubscribe();
  hub.close();
});

it('formats non-error watcher failures in the notifier log', async () => {
  vi.mocked(watch).mockImplementation(() => {
    throw 'watch unavailable';
  });
  const root = join('/memory', 'string-watch-failure');
  await writeSampleWorkspaceWithHistory(root);

  const hub = await createIterationEventHub(root, logger);

  expect(logger.warn).toHaveBeenCalledWith(
    expect.objectContaining({ error: 'watch unavailable' }),
    'iteration_notifier_watch_failed'
  );
  hub.close();
});

async function waitForNotifierCheck(expected: Record<string, unknown>) {
  await waitForNotifierLog(expected, 'iteration_notifier_checked');
}

async function waitForNotifierLog(expected: Record<string, unknown>, message: string) {
  await vi.waitFor(() => {
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining(expected), message);
  });
}

function firstWatcherCallback(): Exclude<Parameters<typeof watch>[1], undefined> {
  const callback = vi.mocked(watch).mock.calls[0]?.[1];
  if (callback === undefined) {
    throw new Error('Expected fs.watch to register before simulating a filesystem event.');
  }
  return callback as Exclude<Parameters<typeof watch>[1], undefined>;
}

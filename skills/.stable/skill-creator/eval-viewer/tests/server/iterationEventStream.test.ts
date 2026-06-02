import type { IterationIndexView } from '../../src/shared/viewModel.js';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { openIterationEventStream } from '../../src/server/buildServer.js';

it('streams the current iteration index and future index events until the client closes the response', async () => {
  const raw = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    writeHead: ReturnType<typeof vi.fn>;
  };
  raw.write = vi.fn();
  raw.writeHead = vi.fn();
  const unsubscribe = vi.fn();
  const stream = {
    subscribe: vi.fn((send: (index: IterationIndexView) => void) => {
      send({ iterations: [1, 2], latestIteration: 2 });
      return unsubscribe;
    })
  };
  const reply = {
    hijack: vi.fn(),
    raw
  };

  await openIterationEventStream(reply as never, stream, async () => ({ iterations: [1], latestIteration: 1 }));
  raw.emit('close');

  expect(reply.hijack).toHaveBeenCalled();
  expect(raw.writeHead).toHaveBeenCalledWith(200, {
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream'
  });
  expect(raw.write).toHaveBeenCalledWith('\n');
  expect(raw.write).toHaveBeenCalledWith('data: {"iterations":[1],"latestIteration":1}\n\n');
  expect(raw.write).toHaveBeenCalledWith('data: {"iterations":[1,2],"latestIteration":2}\n\n');
  expect(unsubscribe).toHaveBeenCalled();
});

it('writes future events directly after the initial iteration index is sent', async () => {
  const raw = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    writeHead: ReturnType<typeof vi.fn>;
  };
  raw.write = vi.fn();
  raw.writeHead = vi.fn();
  let sendUpdate: ((index: IterationIndexView) => void) | undefined;
  const stream = {
    subscribe: vi.fn((send: (index: IterationIndexView) => void) => {
      sendUpdate = send;
      return vi.fn();
    })
  };
  const reply = {
    hijack: vi.fn(),
    raw
  };

  await openIterationEventStream(reply as never, stream, async () => ({ iterations: [1], latestIteration: 1 }));
  sendUpdate?.({ iterations: [1, 2], latestIteration: 2 });

  expect(raw.write).toHaveBeenCalledWith('data: {"iterations":[1],"latestIteration":1}\n\n');
  expect(raw.write).toHaveBeenCalledWith('data: {"iterations":[1,2],"latestIteration":2}\n\n');
});

it('does not replay a queued event that is older than the initial snapshot', async () => {
  const raw = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    writeHead: ReturnType<typeof vi.fn>;
  };
  raw.write = vi.fn();
  raw.writeHead = vi.fn();
  const stream = {
    subscribe: vi.fn((send: (index: IterationIndexView) => void) => {
      send({ iterations: [1], latestIteration: 1 });
      return vi.fn();
    })
  };
  const reply = {
    hijack: vi.fn(),
    raw
  };

  await openIterationEventStream(reply as never, stream, async () => ({ iterations: [1, 2], latestIteration: 2 }));

  expect(raw.write).toHaveBeenCalledTimes(2);
  expect(raw.write).toHaveBeenCalledWith('data: {"iterations":[1,2],"latestIteration":2}\n\n');
  expect(raw.write).not.toHaveBeenCalledWith('data: {"iterations":[1],"latestIteration":1}\n\n');
});

it('unsubscribes when the initial iteration index cannot be loaded', async () => {
  const raw = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    writeHead: ReturnType<typeof vi.fn>;
  };
  raw.write = vi.fn();
  raw.writeHead = vi.fn();
  const unsubscribe = vi.fn();
  const stream = {
    subscribe: vi.fn(() => unsubscribe)
  };
  const reply = {
    hijack: vi.fn(),
    raw
  };

  await expect(
    openIterationEventStream(reply as never, stream, async () => {
      throw new Error('workspace unavailable');
    })
  ).rejects.toThrow('workspace unavailable');

  expect(unsubscribe).toHaveBeenCalledWith();
});

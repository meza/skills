import type { FeedbackInput, IterationIndexView, IterationNumber } from '../shared/viewModel.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createIterationEventHub } from './iterationEvents.js';
import {
  assertWorkspaceRoot,
  loadIteration,
  loadIterationIndex,
  readArtifactText,
  saveFeedback,
  UnavailableIterationError
} from './iterationRepository.js';

type FastifyServerOptions = Fastify.FastifyServerOptions;
interface IterationEventStream {
  subscribe: (send: (index: IterationIndexView) => void) => () => void;
}
type LoadIterationEventIndex = () => Promise<IterationIndexView>;

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

export interface ServerOptions {
  /** Log file path passed to Fastify's Pino-backed file logger. */
  logFilePath?: string;
  /** Optional Fastify-compatible logger instance, used by tests that assert audit records. */
  loggerInstance?: FastifyServerOptions['loggerInstance'];
  /** Local eval workspace location that the server presents to the browser. */
  workspaceRoot: string;
  /** Built client asset directory to serve when tests or scripts provide one. */
  staticRoot?: string;
}

export function fastifyLoggerOptions(logFilePath: string | undefined): FastifyServerOptions['logger'] {
  return logFilePath ? { file: logFilePath, level: 'info' } : false;
}

/**
 * Creates the local HTTP server used by the browser-based eval review UI.
 *
 * @param options - Server inputs that identify the local artifacts and client assets to expose.
 */
export async function buildServer(options: ServerOptions) {
  await assertWorkspaceRoot(options.workspaceRoot);
  await loadIteration(options.workspaceRoot);
  const server = Fastify(
    options.loggerInstance
      ? { loggerInstance: options.loggerInstance }
      : { logger: fastifyLoggerOptions(options.logFilePath) }
  );
  const iterationEvents = await createIterationEventHub(options.workspaceRoot, server.log);
  server.addHook('onClose', () => {
    iterationEvents.close();
  });
  server.setErrorHandler((error, _request, reply) => {
    const message = (error as Error).message;
    if (isBadRequestError(error)) {
      return reply.code(HTTP_STATUS_BAD_REQUEST).send({ error: message });
    }
    if (error instanceof UnavailableIterationError) {
      return reply.code(HTTP_STATUS_NOT_FOUND).send({ error: message });
    }
    return reply.send(error);
  });

  registerApiRoutes(server, options, iterationEvents);
  server.register(fastifyStatic, {
    root: options.staticRoot ?? join(dirname(fileURLToPath(import.meta.url)), '../../dist')
  });

  return server;
}

function registerApiRoutes(server: FastifyInstance, options: ServerOptions, iterationEvents: IterationEventStream) {
  server.get('/api/iterations', async () => loadIterationIndex(options.workspaceRoot));
  server.get('/api/iteration-events', createIterationEventRoute(options.workspaceRoot, iterationEvents));
  server.get<{ Querystring: { iteration?: string } }>('/api/iteration', async (request) =>
    loadIteration(options.workspaceRoot, { iteration: optionalIterationNumber(request.query.iteration) })
  );
  server.get<{ Params: { evalId: string; runType: string }; Querystring: { iteration?: string } }>(
    '/api/runs/:evalId/:runType',
    async (request, reply) => {
      const iteration = await loadIteration(options.workspaceRoot, {
        iteration: optionalIterationNumber(request.query.iteration)
      });
      const run = iteration.runs.find(
        (candidate) =>
          candidate.evalId === Number(request.params.evalId) && candidate.runType === request.params.runType
      );
      if (!run) {
        return reply.code(HTTP_STATUS_NOT_FOUND).send({ error: 'Run not found.' });
      }
      return reply.send(run);
    }
  );
  server.get<{ Querystring: { iteration?: string; path?: string } }>('/api/artifacts', async (request, reply) => {
    if (!request.query.path) {
      return reply.code(HTTP_STATUS_BAD_REQUEST).send({ error: 'Artifact path is required.' });
    }
    try {
      const iteration = optionalIterationNumber(request.query.iteration);
      const artifact = await readArtifactText(options.workspaceRoot, request.query.path, {
        iteration
      });
      request.log.info(
        {
          artifactPath: request.query.path,
          iteration,
          workspaceRoot: options.workspaceRoot
        },
        'artifact_read_succeeded'
      );
      return reply.type('text/plain').send(artifact);
    } catch (error) {
      const message = (error as Error).message;
      const statusCode = artifactErrorStatusCode(error);
      request.log.warn(
        { artifactPath: request.query.path, error: message, workspaceRoot: options.workspaceRoot, statusCode },
        'artifact_read_failed'
      );
      return reply.code(statusCode).send({ error: message });
    }
  });
  server.put<{
    Body: Pick<Partial<FeedbackInput>, 'comments' | 'overall' | 'turns'>;
    Params: { evalId: string };
    Querystring: { iteration?: string };
  }>('/api/feedback/:evalId', async (request, reply) => {
    const feedback: FeedbackInput = {
      comments: request.body.comments ?? '',
      evalId: Number(request.params.evalId),
      overall: request.body.overall ?? [],
      turns: request.body.turns ?? []
    };
    try {
      const iteration = requiredIterationNumber(request.query.iteration);
      const saved = await saveFeedback(options.workspaceRoot, feedback, { iteration });
      request.log.info(
        {
          evalId: feedback.evalId,
          iteration,
          workspaceRoot: options.workspaceRoot
        },
        'feedback_saved'
      );
      return reply.send(saved);
    } catch (error) {
      const message = (error as Error).message;
      if (isBadRequestError(error)) {
        return reply.code(HTTP_STATUS_BAD_REQUEST).send({ error: message });
      }
      if (error instanceof UnavailableIterationError) {
        return reply.code(HTTP_STATUS_NOT_FOUND).send({ error: message });
      }
      request.log.error(
        { error: message, evalId: feedback.evalId, workspaceRoot: options.workspaceRoot },
        'feedback_save_failed'
      );
      return reply.code(HTTP_STATUS_INTERNAL_SERVER_ERROR).send({ error: message });
    }
  });
}

/**
 * Creates the Fastify handler for the iteration server-sent event endpoint.
 *
 * The handler is separate from server construction so tests can exercise the
 * streaming route contract without depending on a never-ending injected HTTP
 * response.
 */
export function createIterationEventRoute(workspaceRoot: string, iterationEvents: IterationEventStream) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    await openIterationEventStream(reply, iterationEvents, () => loadIterationIndex(workspaceRoot));
  };
}

/**
 * Opens a server-sent event response that announces newly discovered iterations.
 *
 * The caller owns the Fastify route lifecycle. This function hijacks the reply,
 * subscribes the raw response to iteration index updates, and unsubscribes when
 * the client closes the connection.
 */
export async function openIterationEventStream(
  reply: FastifyReply,
  iterationEvents: IterationEventStream,
  loadInitialIndex: LoadIterationEventIndex
) {
  reply.hijack();
  reply.raw.writeHead(HTTP_STATUS_OK, {
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream'
  });
  reply.raw.write('\n');
  const queuedIndexes: IterationIndexView[] = [];
  let writeIndex = (index: IterationIndexView): void => {
    queuedIndexes.push(index);
  };
  const unsubscribe = iterationEvents.subscribe((index) => writeIndex(index));
  reply.raw.on('close', unsubscribe);
  let initialIndex: IterationIndexView;
  try {
    initialIndex = await loadInitialIndex();
  } catch (error) {
    unsubscribe();
    throw error;
  }
  writeIterationEvent(reply, initialIndex);
  writeIndex = (index) => writeIterationEvent(reply, index);
  for (const index of queuedIndexes) {
    if (index.latestIteration > initialIndex.latestIteration) {
      writeIterationEvent(reply, index);
    }
  }
}

function writeIterationEvent(reply: FastifyReply, index: IterationIndexView): void {
  reply.raw.write(`data: ${JSON.stringify(index)}\n\n`);
}

function optionalIterationNumber(iteration: string | undefined): IterationNumber | undefined {
  if (iteration === undefined) {
    return undefined;
  }
  return parseIterationNumber(iteration);
}

function requiredIterationNumber(iteration: string | undefined): IterationNumber {
  if (iteration === undefined) {
    throw new Error('iteration query parameter is required.');
  }
  return parseIterationNumber(iteration);
}

function parseIterationNumber(iteration: string): IterationNumber {
  const value = Number(iteration);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('iteration must be a non-negative integer.');
  }
  return value;
}

function isBadRequestError(error: unknown): boolean {
  const message = (error as Error).message;
  return (
    message === 'iteration must be a non-negative integer.' || message === 'iteration query parameter is required.'
  );
}

function artifactErrorStatusCode(
  error: unknown
): typeof HTTP_STATUS_BAD_REQUEST | typeof HTTP_STATUS_FORBIDDEN | typeof HTTP_STATUS_NOT_FOUND {
  if (isBadRequestError(error)) {
    return HTTP_STATUS_BAD_REQUEST;
  }
  const message = (error as Error).message;
  if (message.includes('inside the active iteration root')) {
    return HTTP_STATUS_FORBIDDEN;
  }
  return HTTP_STATUS_NOT_FOUND;
}

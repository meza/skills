import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { FeedbackInput } from '../shared/viewModel.js';
import { assertResultRoot, loadIteration, readArtifactText, saveFeedback } from './iterationRepository.js';

export interface ServerOptions {
  /** Log file path passed to Fastify's Pino-backed file logger. */
  logFilePath?: string;
  /** Local eval result location that the server presents to the browser. */
  resultRoot: string;
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
  await assertResultRoot(options.resultRoot);
  await loadIteration(options.resultRoot);
  const server = Fastify({ logger: fastifyLoggerOptions(options.logFilePath) });

  server.get('/api/iteration', async () => loadIteration(options.resultRoot));
  server.get<{ Params: { evalId: string; runType: string } }>('/api/runs/:evalId/:runType', async (request, reply) => {
    const iteration = await loadIteration(options.resultRoot);
    const run = iteration.runs.find(
      (candidate) => candidate.evalId === Number(request.params.evalId) && candidate.runType === request.params.runType
    );
    if (!run) {
      return reply.code(404).send({ error: 'Run not found.' });
    }
    return reply.send(run);
  });
  server.get<{ Querystring: { path?: string } }>('/api/artifacts', async (request, reply) => {
    if (!request.query.path) {
      return reply.code(400).send({ error: 'Artifact path is required.' });
    }
    try {
      const artifact = await readArtifactText(options.resultRoot, request.query.path);
      return reply.type('text/plain').send(artifact);
    } catch (error) {
      const message = (error as Error).message;
      const statusCode = message.includes('inside the result root') ? 403 : 404;
      request.log.warn(
        { artifactPath: request.query.path, error: message, resultRoot: options.resultRoot, statusCode },
        'artifact_read_failed'
      );
      return reply.code(statusCode).send({ error: message });
    }
  });
  server.put<{
    Body: Pick<Partial<FeedbackInput>, 'comments' | 'overall' | 'turns'>;
    Params: { evalId: string };
  }>('/api/feedback/:evalId', async (request, reply) => {
    const feedback: FeedbackInput = {
      comments: request.body.comments ?? '',
      evalId: Number(request.params.evalId),
      overall: request.body.overall ?? [],
      turns: request.body.turns ?? []
    };
    try {
      const saved = await saveFeedback(options.resultRoot, feedback);
      return reply.send(saved);
    } catch (error) {
      const message = (error as Error).message;
      request.log.error(
        { error: message, evalId: feedback.evalId, resultRoot: options.resultRoot },
        'feedback_save_failed'
      );
      return reply.code(500).send({ error: message });
    }
  });

  server.register(fastifyStatic, {
    root: options.staticRoot ?? join(dirname(fileURLToPath(import.meta.url)), '../../dist')
  });

  return server;
}

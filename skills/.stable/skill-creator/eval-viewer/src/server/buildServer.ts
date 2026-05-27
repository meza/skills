import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FeedbackInput } from '../shared/viewModel.js';
import { assertResultRoot, loadIteration, readArtifactText, saveFeedback } from './iterationRepository.js';

export interface ServerOptions {
  resultRoot: string;
  staticRoot?: string;
}

export async function buildServer(options: ServerOptions) {
  await assertResultRoot(options.resultRoot);
  const server = Fastify({ logger: false });

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
    const saved = await saveFeedback(options.resultRoot, feedback);
    return reply.send(saved);
  });

  server.register(fastifyStatic, {
    root: options.staticRoot ?? join(dirname(fileURLToPath(import.meta.url)), '../../dist')
  });

  return server;
}

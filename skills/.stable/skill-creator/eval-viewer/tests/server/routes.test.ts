import { watch } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  buildServer,
  createIterationEventRoute,
  fastifyLoggerOptions,
  openIterationEventStream
} from '../../src/server/buildServer.js';
import {
  SAMPLE_SKILL_EXPECTATION_ID,
  writeSampleIteration,
  writeSampleWorkspaceWithHistory
} from '../fixtures/sampleIteration.js';
import { fs, vol } from '../support/memfs.js';

vi.mock('../../src/server/artifactSchemas.js', async () => await import('./fakeArtifactSchemas.js'));

let root: string;
let iterationRoot: string;

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const MISSING_WORKSPACE_ROOT_ERROR_PATTERN = /evaluation workspace root does not exist/i;
const NO_RUNS_TO_REVIEW_ERROR_PATTERN = /no runs to review/i;

function createAuditLogger() {
  const logger = {
    child: vi.fn(() => logger),
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    info: vi.fn(),
    level: 'info',
    silent: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn()
  };
  return logger;
}

beforeEach(async () => {
  vol.reset();
  root = join('/memory', 'current');
  iterationRoot = await writeSampleWorkspaceWithHistory(root);
});

it('returns the current iteration through the JSON API', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({ method: 'GET', url: '/api/iteration' });

  expect(response.statusCode).toBe(HTTP_STATUS_OK);
  expect(response.json()).toMatchObject({
    summary: {
      skillName: 'conventional-commit-message'
    }
  });
  await server.close();
});

it('returns the available iterations through the JSON API', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({ method: 'GET', url: '/api/iterations' });

  expect(response.statusCode).toBe(HTTP_STATUS_OK);
  expect(response.json()).toEqual({
    iterations: [0, 1],
    latestIteration: 1
  });
  await server.close();
});

it('opens the iteration event stream with an initial event and live updates', async () => {
  const writtenChunks: string[] = [];
  let subscribedSink: ((index: { iterations: number[]; latestIteration: number }) => void) | undefined;
  let closeHandler: (() => void) | undefined;
  const unsubscribe = vi.fn();
  const reply = {
    hijack: vi.fn(),
    raw: {
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandler = handler;
        }
      }),
      write: vi.fn((chunk: string) => {
        writtenChunks.push(chunk);
      }),
      writeHead: vi.fn()
    }
  };

  await openIterationEventStream(
    reply as never,
    {
      subscribe: vi.fn((send) => {
        subscribedSink = send;
        return unsubscribe;
      })
    },
    async () => ({ iterations: [0, 1], latestIteration: 1 })
  );
  subscribedSink?.({ iterations: [0, 1, 2], latestIteration: 2 });
  closeHandler?.();

  expect(reply.hijack).toHaveBeenCalled();
  expect(reply.raw.writeHead).toHaveBeenCalledWith(
    HTTP_STATUS_OK,
    expect.objectContaining({ 'Content-Type': 'text/event-stream' })
  );
  expect(writtenChunks).toEqual([
    '\n',
    'data: {"iterations":[0,1],"latestIteration":1}\n\n',
    'data: {"iterations":[0,1,2],"latestIteration":2}\n\n'
  ]);
  expect(unsubscribe).toHaveBeenCalled();
});

it('routes iteration event stream requests to the workspace stream handler', async () => {
  const writtenChunks: string[] = [];
  const reply = {
    hijack: vi.fn(),
    raw: {
      on: vi.fn(),
      write: vi.fn((chunk: string) => {
        writtenChunks.push(chunk);
      }),
      writeHead: vi.fn()
    }
  };
  const handler = createIterationEventRoute(root, { subscribe: vi.fn(() => vi.fn()) });

  await handler({} as never, reply as never);

  expect(reply.raw.writeHead).toHaveBeenCalledWith(
    HTTP_STATUS_OK,
    expect.objectContaining({ 'Content-Type': 'text/event-stream' })
  );
  expect(writtenChunks).toContain('data: {"iterations":[0,1],"latestIteration":1}\n\n');
});

it('serves the API when iteration filesystem watching is unavailable', async () => {
  vi.mocked(watch).mockImplementation(() => {
    throw new Error('watch unavailable');
  });
  const server = await buildServer({ workspaceRoot: root });
  try {
    const response = await server.inject({ method: 'GET', url: '/api/iteration' });

    expect(response.statusCode).toBe(HTTP_STATUS_OK);
  } finally {
    await server.close();
    vi.mocked(watch).mockImplementation(() => ({ close: vi.fn() }) as never);
  }
});

it('rejects invalid iteration query parameters', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({ method: 'GET', url: '/api/iteration?iteration=abc' });

  expect(response.statusCode).toBe(HTTP_STATUS_BAD_REQUEST);
  expect(response.json()).toMatchObject({
    error: 'iteration must be a non-negative integer.'
  });
  await server.close();
});

it('returns a clear not-found error when a requested iteration is unavailable', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({ method: 'GET', url: '/api/iteration?iteration=9' });

  expect(response.statusCode).toBe(HTTP_STATUS_NOT_FOUND);
  expect(response.json()).toMatchObject({
    error: expect.stringContaining('iteration-9 does not exist')
  });
  await server.close();
});

it('keeps corrupted iteration artifacts on the server error path', async () => {
  const server = await buildServer({ workspaceRoot: root });
  await fs.promises.writeFile(join(root, 'results', 'iteration-1', 'aggregated_results.json'), '{', 'utf-8');

  const response = await server.inject({ method: 'GET', url: '/api/iteration?iteration=1' });

  expect(response.statusCode).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
  expect(response.json()).toMatchObject({
    error: 'Internal Server Error'
  });
  await server.close();
});

it('configures Fastify file logging when a log file path is provided', () => {
  expect(fastifyLoggerOptions('/cwd/eval-viewer.log')).toEqual({
    file: '/cwd/eval-viewer.log',
    level: 'info'
  });
  expect(fastifyLoggerOptions(undefined)).toBe(false);
});

it('returns an individual run through the JSON API', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({
    method: 'GET',
    url: '/api/runs/1/skill'
  });
  const missing = await server.inject({
    method: 'GET',
    url: '/api/runs/9/skill'
  });

  expect(response.statusCode).toBe(HTTP_STATUS_OK);
  expect(response.json()).toMatchObject({
    runType: 'skill',
    evalId: 1
  });
  expect(missing.statusCode).toBe(HTTP_STATUS_NOT_FOUND);
  await server.close();
});

it('returns a clear not-found error when a requested run iteration is unavailable', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({
    method: 'GET',
    url: '/api/runs/1/skill?iteration=9'
  });

  expect(response.statusCode).toBe(HTTP_STATUS_NOT_FOUND);
  expect(response.json()).toMatchObject({
    error: expect.stringContaining('iteration-9 does not exist')
  });
  await server.close();
});

it('rejects startup when the workspace root is missing', async () => {
  await expect(buildServer({ workspaceRoot: join(root, 'missing') })).rejects.toThrow(
    MISSING_WORKSPACE_ROOT_ERROR_PATTERN
  );
});

it('rejects startup when the workspace root has no runs to review', async () => {
  const emptyRoot = join(root, 'empty');
  const emptyIterationRoot = join(emptyRoot, 'results', 'iteration-1');
  await fs.promises.mkdir(emptyIterationRoot, { recursive: true });
  await fs.promises.writeFile(
    join(emptyIterationRoot, 'run_manifest.json'),
    JSON.stringify({
      effort: 'high',
      eval_definitions_path: join(emptyIterationRoot, 'evals', 'evals.json'),
      iteration: 1,
      model: 'gpt-5',
      provider: 'codex',
      runs: [],
      skill_name: 'empty',
      timestamp: '2026-05-25T10:00:00Z',
      total_elapsed_seconds: 0
    }),
    'utf-8'
  );

  await expect(buildServer({ workspaceRoot: emptyRoot })).rejects.toThrow(NO_RUNS_TO_REVIEW_ERROR_PATTERN);
});

it('saves feedback through the JSON API', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1?iteration=1',
    payload: {
      comments: '',
      overall: [],
      turns: [{ expectations: [{ comment: 'Turn feedback.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 1 }]
    }
  });

  expect(response.statusCode).toBe(HTTP_STATUS_OK);
  expect(response.json()).toMatchObject({
    turns: [{ expectations: [{ comment: 'Turn feedback.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 1 }]
  });
  expect(response.json()).not.toHaveProperty('review_state');
  await server.close();
});

it('records an audit log when feedback is saved through the JSON API', async () => {
  const logger = createAuditLogger();
  const server = await buildServer({ loggerInstance: logger, workspaceRoot: root });

  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1?iteration=1',
    payload: {
      comments: 'Audited feedback.',
      overall: [],
      turns: []
    }
  });

  expect(response.statusCode).toBe(HTTP_STATUS_OK);
  expect(logger.info).toHaveBeenCalledWith(
    expect.objectContaining({
      evalId: 1,
      iteration: 1,
      workspaceRoot: root
    }),
    'feedback_saved'
  );
  await server.close();
});

it('saves feedback to the requested active iteration through the JSON API', async () => {
  await writeSampleIteration(join(root, 'results', 'iteration-2'), { iteration: 2 });
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1?iteration=1',
    payload: {
      comments: 'Selected iteration feedback.',
      overall: [],
      turns: []
    }
  });

  expect(response.statusCode).toBe(HTTP_STATUS_OK);
  await expect(
    fs.promises.readFile(join(root, 'results', 'iteration-1', 'viewer_feedback.json'), 'utf-8')
  ).resolves.toContain('Selected iteration feedback.');
  await expect(
    fs.promises.readFile(join(root, 'results', 'iteration-2', 'viewer_feedback.json'), 'utf-8')
  ).rejects.toMatchObject({ code: 'ENOENT' });
  await server.close();
});

it('defaults omitted feedback fields through the JSON API', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1?iteration=1',
    payload: {}
  });

  expect(response.statusCode).toBe(HTTP_STATUS_OK);
  expect(response.json()).toMatchObject({
    eval_id: 1,
    updated_at: expect.any(String)
  });
  expect(response.json()).not.toHaveProperty('comments');
  expect(response.json()).not.toHaveProperty('overall');
  expect(response.json()).not.toHaveProperty('turns');
  expect(response.json()).not.toHaveProperty('review_state');
  await server.close();
});

it('requires an explicit feedback iteration through the JSON API', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1',
    payload: {}
  });

  expect(response.statusCode).toBe(HTTP_STATUS_BAD_REQUEST);
  expect(response.json()).toEqual({ error: 'iteration query parameter is required.' });
  await server.close();
});

it('returns a clear not-found error when a feedback iteration is unavailable', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1?iteration=9',
    payload: {}
  });

  expect(response.statusCode).toBe(HTTP_STATUS_NOT_FOUND);
  expect(response.json()).toMatchObject({
    error: expect.stringContaining('iteration-9 does not exist')
  });
  await server.close();
});

it('rejects malformed feedback iteration query parameters', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1?iteration=abc',
    payload: {}
  });

  expect(response.statusCode).toBe(HTTP_STATUS_BAD_REQUEST);
  expect(response.json()).toEqual({ error: 'iteration must be a non-negative integer.' });
  await server.close();
});

it('returns feedback save failures as JSON errors', async () => {
  const logger = createAuditLogger();
  const server = await buildServer({ loggerInstance: logger, workspaceRoot: root });

  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1?iteration=1',
    payload: {
      turns: 'invalid'
    }
  });

  expect(response.statusCode).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
  expect(response.json()).toEqual({ error: 'turns.flatMap is not a function' });
  expect(logger.error).toHaveBeenCalledWith(
    expect.objectContaining({
      error: 'turns.flatMap is not a function',
      evalId: 1,
      workspaceRoot: root
    }),
    'feedback_save_failed'
  );
  await server.close();
});

it('serves artifact text only from inside the active iteration root', async () => {
  const logger = createAuditLogger();
  const server = await buildServer({ loggerInstance: logger, workspaceRoot: root });
  const artifactPath = join(iterationRoot, 'eval-1', 'skill', 'raw_output.jsonl');

  const response = await server.inject({
    method: 'GET',
    url: `/api/artifacts?iteration=1&path=${encodeURIComponent(artifactPath)}`
  });
  const rejected = await server.inject({
    method: 'GET',
    url: `/api/artifacts?iteration=1&path=${encodeURIComponent(join(root, '..', 'outside.txt'))}`
  });

  expect(response.statusCode).toBe(HTTP_STATUS_OK);
  expect(response.body).toContain('"type":"final"');
  expect(rejected.statusCode).toBe(HTTP_STATUS_FORBIDDEN);
  expect(logger.info).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactPath,
      iteration: 1,
      workspaceRoot: root
    }),
    'artifact_read_succeeded'
  );
  expect(logger.warn).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactPath: join(root, '..', 'outside.txt'),
      statusCode: HTTP_STATUS_FORBIDDEN,
      workspaceRoot: root
    }),
    'artifact_read_failed'
  );
  await server.close();
});

it('returns a clear not-found error when an artifact iteration is unavailable', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const artifactPath = join(iterationRoot, 'eval-1', 'skill', 'raw_output.jsonl');
  const response = await server.inject({
    method: 'GET',
    url: `/api/artifacts?iteration=9&path=${encodeURIComponent(artifactPath)}`
  });

  expect(response.statusCode).toBe(HTTP_STATUS_NOT_FOUND);
  expect(response.json()).toMatchObject({
    error: expect.stringContaining('iteration-9 does not exist')
  });
  await server.close();
});

it('rejects malformed artifact iteration query parameters', async () => {
  const server = await buildServer({ workspaceRoot: root });
  const artifactPath = join(iterationRoot, 'eval-1', 'skill', 'raw_output.jsonl');
  const response = await server.inject({
    method: 'GET',
    url: `/api/artifacts?iteration=abc&path=${encodeURIComponent(artifactPath)}`
  });

  expect(response.statusCode).toBe(HTTP_STATUS_BAD_REQUEST);
  expect(response.json()).toEqual({ error: 'iteration must be a non-negative integer.' });
  await server.close();
});

it('reports missing artifact query parameters and missing files', async () => {
  const server = await buildServer({ workspaceRoot: root });

  const missingPath = await server.inject({ method: 'GET', url: '/api/artifacts' });
  const missingFile = await server.inject({
    method: 'GET',
    url: `/api/artifacts?iteration=1&path=${encodeURIComponent(join(iterationRoot, 'missing.txt'))}`
  });

  expect(missingPath.statusCode).toBe(HTTP_STATUS_BAD_REQUEST);
  expect(missingFile.statusCode).toBe(HTTP_STATUS_NOT_FOUND);
  await server.close();
});

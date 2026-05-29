import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { buildServer } from '../../src/server/buildServer.js';
import { SAMPLE_SKILL_EXPECTATION_ID, writeSampleIteration } from '../fixtures/sampleIteration.js';
import { fs, vol } from '../support/memfs.js';

vi.mock('../../src/server/artifactSchemas.js', async () => await import('./fakeArtifactSchemas.js'));

let root: string;

beforeEach(async () => {
  vol.reset();
  root = join('/memory', 'current');
  await writeSampleIteration(root);
});

it('returns the current iteration through the JSON API', async () => {
  const server = await buildServer({ resultRoot: root });
  const response = await server.inject({ method: 'GET', url: '/api/iteration' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    summary: {
      skillName: 'conventional-commit-message'
    }
  });
  await server.close();
});

it('returns an individual run through the JSON API', async () => {
  const server = await buildServer({ resultRoot: root });
  const response = await server.inject({
    method: 'GET',
    url: '/api/runs/1/skill'
  });
  const missing = await server.inject({
    method: 'GET',
    url: '/api/runs/9/skill'
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    runType: 'skill',
    evalId: 1
  });
  expect(missing.statusCode).toBe(404);
  await server.close();
});

it('rejects startup when the result root is missing', async () => {
  await expect(buildServer({ resultRoot: join(root, 'missing') })).rejects.toThrow(/result root does not exist/i);
});

it('rejects startup when the result root has no runs to review', async () => {
  const emptyRoot = join(root, 'empty');
  await fs.promises.mkdir(emptyRoot, { recursive: true });
  await fs.promises.writeFile(
    join(emptyRoot, 'run_manifest.json'),
    JSON.stringify({
      effort: 'high',
      eval_definitions_path: join(emptyRoot, 'evals', 'evals.json'),
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

  await expect(buildServer({ resultRoot: emptyRoot })).rejects.toThrow(/no runs to review/i);
});

it('saves feedback through the JSON API', async () => {
  const server = await buildServer({ resultRoot: root });
  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1',
    payload: {
      comments: '',
      overall: [],
      turns: [{ expectations: [{ comment: 'Turn feedback.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 1 }]
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    turns: [{ expectations: [{ comment: 'Turn feedback.', expectation_id: SAMPLE_SKILL_EXPECTATION_ID }], turn: 1 }]
  });
  expect(response.json()).not.toHaveProperty('review_state');
  await server.close();
});

it('defaults omitted feedback fields through the JSON API', async () => {
  const server = await buildServer({ resultRoot: root });
  const response = await server.inject({
    method: 'PUT',
    url: '/api/feedback/1',
    payload: {}
  });

  expect(response.statusCode).toBe(200);
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

it('serves artifact text only from inside the result root', async () => {
  const server = await buildServer({ resultRoot: root });
  const artifactPath = join(root, 'eval-1', 'skill', 'raw_output.jsonl');

  const response = await server.inject({
    method: 'GET',
    url: `/api/artifacts?path=${encodeURIComponent(artifactPath)}`
  });
  const rejected = await server.inject({
    method: 'GET',
    url: `/api/artifacts?path=${encodeURIComponent(join(root, '..', 'outside.txt'))}`
  });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('"type":"final"');
  expect(rejected.statusCode).toBe(403);
  await server.close();
});

it('reports missing artifact query parameters and missing files', async () => {
  const server = await buildServer({ resultRoot: root });

  const missingPath = await server.inject({ method: 'GET', url: '/api/artifacts' });
  const missingFile = await server.inject({
    method: 'GET',
    url: `/api/artifacts?path=${encodeURIComponent(join(root, 'missing.txt'))}`
  });

  expect(missingPath.statusCode).toBe(400);
  expect(missingFile.statusCode).toBe(404);
  await server.close();
});

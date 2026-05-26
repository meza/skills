import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server/buildServer.js';
import { writeSampleIteration } from '../fixtures/sampleIteration.js';

describe('viewer server routes', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'eval-viewer-'));
    await writeSampleIteration(root);
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
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
      url: '/api/runs/1/with_skill'
    });
    const missing = await server.inject({
      method: 'GET',
      url: '/api/runs/9/with_skill'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      config: 'with_skill',
      evalId: 1
    });
    expect(missing.statusCode).toBe(404);
    await server.close();
  });

  it('rejects startup when the result root is missing', async () => {
    await expect(buildServer({ resultRoot: join(root, 'missing') })).rejects.toThrow(/result root does not exist/i);
  });

  it('serves built client assets from nested asset paths', async () => {
    const staticRoot = join(root, 'static');
    await mkdir(join(staticRoot, 'assets'), { recursive: true });
    await writeFile(join(staticRoot, 'index.html'), '<div id="root"></div>', 'utf-8');
    await writeFile(join(staticRoot, 'assets', 'index-test.js'), 'console.log("viewer");', 'utf-8');
    const server = await buildServer({ resultRoot: root, staticRoot });

    const index = await server.inject({ method: 'GET', url: '/' });
    const asset = await server.inject({ method: 'GET', url: '/assets/index-test.js' });

    expect(index.statusCode).toBe(200);
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain('viewer');
    await server.close();
  });

  it('saves feedback through the JSON API', async () => {
    const server = await buildServer({ resultRoot: root });
    const response = await server.inject({
      method: 'PUT',
      url: '/api/feedback/1',
      payload: {
        comments: '',
        overall: [],
        turns: [{ expectations: [{ comment: 'Turn feedback.' }], turn: 1 }],
        reviewState: 'reviewed_without_comments'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      review_state: 'reviewed_without_comments',
      turns: [{ expectations: [{ comment: 'Turn feedback.' }], turn: 1 }]
    });
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
      comments: '',
      review_state: 'not_reviewed'
    });
    await server.close();
  });

  it('serves artifact text only from inside the result root', async () => {
    const server = await buildServer({ resultRoot: root });
    const artifactPath = join(root, 'eval-1', 'with_skill', 'raw_output.jsonl');

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
});

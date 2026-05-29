import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server/buildServer.js';
import { writeSampleIteration } from '../fixtures/sampleIteration.js';

type OpenApiDocument = {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
};

type OpenApiOperation = {
  responses: Record<string, unknown>;
};

const documentedRoutes: {
  method: 'GET' | 'PUT';
  openApiPath: string;
  serverPath: string;
}[] = [
  { method: 'GET', openApiPath: '/api/artifacts', serverPath: '/api/artifacts' },
  { method: 'GET', openApiPath: '/api/iteration', serverPath: '/api/iteration' },
  { method: 'GET', openApiPath: '/api/runs/{evalId}/{runType}', serverPath: '/api/runs/:evalId/:runType' },
  { method: 'PUT', openApiPath: '/api/feedback/{evalId}', serverPath: '/api/feedback/:evalId' }
];

async function readOpenApi(): Promise<OpenApiDocument> {
  return JSON.parse(await readFile(join(process.cwd(), 'openapi.json'), 'utf-8')) as OpenApiDocument;
}

describe('OpenAPI contract', () => {
  it('documents exactly the implemented JSON and artifact routes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eval-viewer-openapi-'));
    await writeSampleIteration(root);
    const server = await buildServer({ resultRoot: root });
    const openapi = await readOpenApi();
    const routes = Object.entries(openapi.paths).flatMap(([path, operations]) =>
      Object.keys(operations).map((method) => ({ method, path }))
    );

    try {
      expect(openapi.openapi).toBe('3.1.0');
      expect(
        routes.toSorted((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`))
      ).toEqual(
        documentedRoutes
          .map((route) => ({ method: route.method.toLowerCase(), path: route.openApiPath }))
          .toSorted((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`))
      );
      for (const route of documentedRoutes) {
        expect(server.hasRoute({ method: route.method, url: route.serverPath })).toBe(true);
      }
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  });

  it('documents the expected status codes for local artifact and feedback behavior', async () => {
    const openapi = await readOpenApi();

    expect(Object.keys(openapi.paths['/api/artifacts']?.get?.responses ?? {})).toEqual(['200', '400', '403', '404']);
    expect(Object.keys(openapi.paths['/api/feedback/{evalId}']?.put?.responses ?? {})).toEqual(['200']);
    expect(Object.keys(openapi.paths['/api/runs/{evalId}/{runType}']?.get?.responses ?? {})).toEqual(['200', '404']);
  });
});

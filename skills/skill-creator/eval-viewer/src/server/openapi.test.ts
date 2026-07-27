import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import openapiJson from '../../openapi.json' with { type: 'json' };
import { writeSampleWorkspace } from '../../tests/fixtures/sampleIteration.js';
import { vol } from '../../tests/support/memfs.js';
import { buildServer } from './buildServer.js';

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>> & {
    '/api/artifacts': { get: OpenApiOperation };
    '/api/feedback/{evalId}': { put: OpenApiOperation };
    '/api/runs/{evalId}/{runType}': { get: OpenApiOperation };
  };
}

interface OpenApiOperation {
  responses: Record<string, unknown>;
}

const documentedRoutes: {
  method: 'GET' | 'PUT';
  openApiPath: string;
  serverPath: string;
}[] = [
  { method: 'GET', openApiPath: '/api/artifacts', serverPath: '/api/artifacts' },
  { method: 'GET', openApiPath: '/api/iteration', serverPath: '/api/iteration' },
  { method: 'GET', openApiPath: '/api/iteration-events', serverPath: '/api/iteration-events' },
  { method: 'GET', openApiPath: '/api/iterations', serverPath: '/api/iterations' },
  { method: 'GET', openApiPath: '/api/runs/{evalId}/{runType}', serverPath: '/api/runs/:evalId/:runType' },
  { method: 'PUT', openApiPath: '/api/feedback/{evalId}', serverPath: '/api/feedback/:evalId' }
];

vi.mock('./artifactSchemas.js', async () => await import('../../tests/support/fakeArtifactSchemas.js'));

const openapi = openapiJson as OpenApiDocument;

describe('OpenAPI contract', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('documents exactly the implemented JSON and artifact routes', async () => {
    const root = join('/memory', 'openapi-current');
    await writeSampleWorkspace(root);
    const server = await buildServer({ workspaceRoot: root });
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
    }
  });

  it('documents the expected status codes for local artifact and feedback behavior', () => {
    expect(Object.keys(openapi.paths['/api/artifacts'].get.responses)).toEqual(['200', '400', '403', '404']);
    expect(Object.keys(openapi.paths['/api/feedback/{evalId}'].put.responses)).toEqual(['200', '400', '404']);
    expect(Object.keys(openapi.paths['/api/runs/{evalId}/{runType}'].get.responses)).toEqual(['200', '400', '404']);
  });
});

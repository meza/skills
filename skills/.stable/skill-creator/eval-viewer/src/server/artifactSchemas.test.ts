import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, it, vi } from 'vitest';
import { fs, vol } from '../../tests/support/memfs.js';
import { validateArtifactSchema } from './artifactSchemas.js';

const schemaRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../schemas');
const schemaIdPrefix = 'https://agent-skills.local/skill-creator/';
const ARTIFACT_SCHEMA_ERROR_PATTERN = /Artifact does not match viewer-feedback\.schema\.json/;
const MISSING_SCHEMA_ERROR_PATTERN = /Unknown artifact schema: missing\.schema\.json/;

beforeEach(async () => {
  vol.reset();
  await fs.promises.mkdir(join(schemaRoot, 'ignored-directory'), { recursive: true });
  await fs.promises.writeFile(join(schemaRoot, 'notes.txt'), 'not a schema', 'utf-8');
  await fs.promises.writeFile(
    join(schemaRoot, 'viewer-feedback.schema.json'),
    JSON.stringify({
      $id: `${schemaIdPrefix}viewer-feedback.schema.json`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
      properties: {
        reviews: {
          type: 'array'
        }
      },
      required: ['reviews'],
      type: 'object'
    }),
    'utf-8'
  );
});

it('validates artifacts against schemas loaded from the configured schema root', async () => {
  await expect(validateArtifactSchema('viewer-feedback.schema.json', { reviews: [] })).resolves.toBeUndefined();
});

it('rejects artifacts that do not match a known schema', async () => {
  await expect(validateArtifactSchema('viewer-feedback.schema.json', { reviews: 'invalid' })).rejects.toThrow(
    ARTIFACT_SCHEMA_ERROR_PATTERN
  );
});

it('rejects schema names that are not present in the schema root', async () => {
  await expect(validateArtifactSchema('missing.schema.json', {})).rejects.toThrow(MISSING_SCHEMA_ERROR_PATTERN);
});

it('reports schema failures when the validator omits error details', async () => {
  vi.resetModules();
  vi.doMock('ajv/dist/2020.js', () => ({
    Ajv2020: class {
      addFormat() {
        return undefined;
      }

      addSchema() {
        return undefined;
      }

      getSchema() {
        return Object.assign(() => false, { errors: undefined });
      }
    }
  }));
  const { validateArtifactSchema: validateWithMissingErrors } = await import('./artifactSchemas.js');

  await expect(validateWithMissingErrors('viewer-feedback.schema.json', { reviews: [] })).rejects.toThrow(
    'Artifact does not match viewer-feedback.schema.json: '
  );

  vi.doUnmock('ajv/dist/2020.js');
  vi.resetModules();
});

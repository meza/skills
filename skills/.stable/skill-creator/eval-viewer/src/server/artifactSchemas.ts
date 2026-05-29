import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';

const schemaRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../schemas');
const schemaIdPrefix = 'https://agent-skills.local/skill-creator/';

let validators: Promise<Map<string, ValidateFunction>> | undefined;

export async function validateArtifactSchema(schemaName: string, artifact: unknown): Promise<void> {
  const validator = (await schemaValidators()).get(schemaName);
  if (!validator) {
    throw new Error(`Unknown artifact schema: ${schemaName}`);
  }
  if (!validator(artifact)) {
    const details = validator.errors!.map((error) => `${error.instancePath} ${error.message}`).join('; ');
    throw new Error(`Artifact does not match ${schemaName}: ${details}`);
  }
}

async function schemaValidators(): Promise<Map<string, ValidateFunction>> {
  validators ??= loadSchemaValidators();
  return validators;
}

async function loadSchemaValidators(): Promise<Map<string, ValidateFunction>> {
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const schemas = await readSchemas();
  for (const schema of schemas.values()) {
    ajv.addSchema(schema as AnySchema);
  }
  return new Map(
    [...schemas.keys()].map((name) => [name, ajv.getSchema(`${schemaIdPrefix}${name}`) as ValidateFunction])
  );
}

async function readSchemas(): Promise<Map<string, unknown>> {
  const entries = await readdir(schemaRoot, { withFileTypes: true });
  const schemaFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.schema.json'));
  const schemas = await Promise.all(
    schemaFiles.map(async (entry) => {
      const schema = JSON.parse(await readFile(join(schemaRoot, entry.name), 'utf-8')) as unknown;
      return [basename(entry.name), schema] as const;
    })
  );
  return new Map(schemas);
}

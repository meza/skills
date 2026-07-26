#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sharedDir = dirname(fileURLToPath(import.meta.url))
const findingKeys = [
  'symptom_id',
  'severity',
  'confidence',
  'scope',
  'summary',
  'evidence',
  'rationale',
]

function fail(message) {
  throw new Error(message)
}

function readText(path, label) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`)
  }
}

function readJson(path, label) {
  const source = readText(path, label)
  try {
    return JSON.parse(source)
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`)
  }
}

function parseCsv(source) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let quotedFieldClosed = false

  const finishField = () => {
    row.push(field)
    field = ''
    quotedFieldClosed = false
  }
  const finishRow = () => {
    finishField()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (inQuotes) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        inQuotes = false
        quotedFieldClosed = true
      } else {
        field += character
      }
      continue
    }

    if (quotedFieldClosed && ![',', '\r', '\n'].includes(character)) {
      fail('symptom catalogue has characters after a closing quote')
    }
    if (character === '"') {
      if (field.length > 0) fail('symptom catalogue has a quote inside an unquoted field')
      inQuotes = true
    } else if (character === ',') {
      finishField()
    } else if (character === '\n') {
      finishRow()
    } else if (character === '\r') {
      if (source[index + 1] === '\n') index += 1
      finishRow()
    } else {
      field += character
    }
  }

  if (inQuotes) fail('symptom catalogue has an unterminated quoted field')
  if (field.length > 0 || row.length > 0 || quotedFieldClosed) finishRow()
  return rows
}

function assertArtifactSchema(schema) {
  const required = [...findingKeys].sort()
  if (schema?.type !== 'object' || schema.additionalProperties !== false) {
    fail('output schema must describe an object with additionalProperties disabled')
  }
  if (!Array.isArray(schema.required) || [...schema.required].sort().join() !== required.join()) {
    fail('output schema required fields do not match the investigator result contract')
  }
  if (!schema.properties || Object.keys(schema.properties).sort().join() !== required.join()) {
    fail('output schema properties do not match the investigator result contract')
  }
  if (schema.properties.severity.type !== 'integer' || schema.properties.severity.minimum !== 0 || schema.properties.severity.maximum !== 5) {
    fail('output schema severity contract must be an integer from 0 through 5')
  }
  for (const field of ['symptom_id', 'summary', 'rationale']) {
    if (schema.properties[field].type !== 'string') {
      fail(`output schema ${field} contract must be a string`)
    }
  }
  if (schema.properties.confidence.type !== 'string' || schema.properties.confidence.enum?.join() !== 'low,medium,high') {
    fail('output schema confidence enum is invalid')
  }
  if (schema.properties.scope.type !== 'string' || schema.properties.scope.enum?.join() !== 'local,cross_cutting,systemic') {
    fail('output schema scope enum is invalid')
  }
  if (schema.properties.evidence.type !== 'array' || schema.properties.evidence.items?.type !== 'string') {
    fail('output schema evidence contract must be an array of strings')
  }
}

/**
 * Parses and validates the repository-owned review artifacts.
 *
 * Verification parses RFC-4180 CSV including quoted multiline fields, enforces unique safe
 * symptom IDs, checks the instruction-template tokens, and checks the result schema used by
 * investigators. It performs no network access and throws on corrupt or incompatible input.
 */
export function verifyArtifacts() {
  const csv = readText(join(sharedDir, 'code_review_symptoms.csv'), 'symptom catalogue').replace(/^\uFEFF/, '')
  const table = parseCsv(csv)
  const header = table.shift()
  if (!header || header.join() !== 'id,name,description,details') {
    fail('symptom catalogue header must be id,name,description,details')
  }

  const symptoms = []
  const seenIds = new Set()
  for (const [index, row] of table.entries()) {
    if (row.length === 1 && row[0] === '') continue
    if (row.length !== header.length) fail(`symptom catalogue row ${index + 2} has ${row.length} fields; expected ${header.length}`)
    const [id, name, description, details] = row
    if (!/^SYM-\d{3}$/.test(id)) fail(`symptom catalogue row ${index + 2} has an unsafe id: ${id}`)
    if (seenIds.has(id)) fail(`symptom catalogue contains duplicate id: ${id}`)
    if (![name, description, details].every(value => typeof value === 'string' && value.trim())) {
      fail(`symptom catalogue row ${index + 2} has an empty required field`)
    }
    seenIds.add(id)
    symptoms.push({ id, name, description, details })
  }
  if (symptoms.length === 0) fail('symptom catalogue contains no symptoms')

  const template = readText(join(sharedDir, 'instruction_template.md'), 'instruction template')
  for (const token of ['{name}', '{description}', '{details}', '{scope}']) {
    if (!template.includes(token)) fail(`instruction template is missing ${token}`)
  }

  const schema = readJson(join(sharedDir, 'code_review_output_schema.json'), 'output schema')
  assertArtifactSchema(schema)
  return { symptoms, template, schema }
}

function renderBrief(template, symptom, scope) {
  const rendered = template
    .replaceAll('{name}', symptom.name)
    .replaceAll('{description}', symptom.description)
    .replaceAll('{details}', symptom.details)
    .replaceAll('{scope}', scope)
  return `${rendered.trimEnd()}\n\n## Output identity\n\nUse this exact symptom_id: ${symptom.id}\n`
}

function resolveWorkspace(rawWorkspace) {
  const workspace = resolve(rawWorkspace ?? process.cwd())
  if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
    fail(`workspace is not an existing directory: ${workspace}`)
  }
  return workspace
}

function reviewPaths(workspace) {
  const tmpDir = resolve(workspace, '.tmp')
  const reviewDir = resolve(tmpDir, 'review-swarm')
  if (reviewDir !== join(tmpDir, 'review-swarm') || relative(workspace, reviewDir).startsWith('..')) {
    fail(`refusing unsafe review directory: ${reviewDir}`)
  }
  return {
    tmpDir,
    reviewDir,
    briefsDir: join(reviewDir, 'briefs'),
    resultsDir: join(reviewDir, 'results'),
    auditPath: join(tmpDir, 'code_review_results.json'),
  }
}

function cleanReviewDirectory(paths) {
  if (existsSync(paths.reviewDir)) {
    if (lstatSync(paths.reviewDir).isSymbolicLink()) {
      fail(`refusing to clean a symbolic link: ${paths.reviewDir}`)
    }
    rmSync(paths.reviewDir, { recursive: true })
  }
  mkdirSync(paths.briefsDir, { recursive: true })
  mkdirSync(paths.resultsDir, { recursive: true })
}

/**
 * Prepares a workspace for one review run and returns absolute paths plus catalogue order.
 *
 * Preparation verifies all artifacts before touching output, removes only the resolved
 * `<workspace>/.tmp/review-swarm` directory, then renders one scope-filled brief per symptom.
 * Existing files elsewhere in `<workspace>/.tmp` are preserved. The workspace must exist.
 */
export function prepareReview({ workspace: rawWorkspace, scope }) {
  if (typeof scope !== 'string' || !scope.trim()) fail('prepare requires a non-empty --scope')
  const verified = verifyArtifacts()
  const workspace = resolveWorkspace(rawWorkspace)
  const paths = reviewPaths(workspace)
  cleanReviewDirectory(paths)

  for (const symptom of verified.symptoms) {
    const brief = renderBrief(verified.template, symptom, scope.trim())
    writeFileSync(join(paths.briefsDir, `${symptom.id}.md`), brief, 'utf8')
  }

  return {
    ok: true,
    symptomCount: verified.symptoms.length,
    symptoms: verified.symptoms.map(({ id, name }) => ({ id, name })),
    briefsDir: paths.briefsDir,
    resultsDir: paths.resultsDir,
    schemaPath: join(sharedDir, 'code_review_output_schema.json'),
    schema: verified.schema,
  }
}

function validateFinding(finding, expectedSymptomId) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) fail('investigator result must be a JSON object')
  const actualKeys = Object.keys(finding)
  const unexpected = actualKeys.filter(key => !findingKeys.includes(key))
  const missing = findingKeys.filter(key => !actualKeys.includes(key))
  if (unexpected.length) fail(`investigator result has unexpected field(s): ${unexpected.join(', ')}`)
  if (missing.length) fail(`investigator result is missing field(s): ${missing.join(', ')}`)
  if (finding.symptom_id !== expectedSymptomId) {
    fail(`investigator result symptom_id must be ${expectedSymptomId}; got ${JSON.stringify(finding.symptom_id)}`)
  }
  if (!Number.isInteger(finding.severity) || finding.severity < 0 || finding.severity > 5) {
    fail('investigator result severity must be an integer from 0 through 5')
  }
  if (!['low', 'medium', 'high'].includes(finding.confidence)) {
    fail('investigator result confidence must be low, medium, or high')
  }
  if (!['local', 'cross_cutting', 'systemic'].includes(finding.scope)) {
    fail('investigator result scope must be local, cross_cutting, or systemic')
  }
  for (const field of ['summary', 'rationale']) {
    if (typeof finding[field] !== 'string') fail(`investigator result ${field} must be a string`)
  }
  if (!Array.isArray(finding.evidence) || !finding.evidence.every(item => typeof item === 'string')) {
    fail('investigator result evidence must be an array of strings')
  }
  return finding
}

function readFinding(path, expectedSymptomId) {
  const finding = readJson(path, `investigator result ${expectedSymptomId}`)
  return validateFinding(finding, expectedSymptomId)
}

/**
 * Validates complete investigator coverage and writes the ordered raw audit file.
 *
 * Every catalogue ID must have one `<workspace>/.tmp/review-swarm/results/<id>.json` file.
 * Results are validated against the closed schema and ID-to-filename contract. On success,
 * the ordered array is written after full validation at
 * `<workspace>/.tmp/code_review_results.json`; on validation failure, no new audit file is written.
 */
export function aggregateResults({ workspace: rawWorkspace }) {
  const { symptoms } = verifyArtifacts()
  const workspace = resolveWorkspace(rawWorkspace)
  const paths = reviewPaths(workspace)
  const findings = []

  for (const { id } of symptoms) {
    const resultPath = join(paths.resultsDir, `${id}.json`)
    if (!existsSync(resultPath) || !statSync(resultPath).isFile()) {
      fail(`missing investigator result: ${resultPath}`)
    }
    findings.push(readFinding(resultPath, id))
  }

  const flagged = findings.filter(({ severity }) => severity > 0).length
  const coverage = {
    symptoms_reviewed: findings.length,
    flagged,
    clean: findings.length - flagged,
  }
  mkdirSync(paths.tmpDir, { recursive: true })
  const pendingAuditPath = `${paths.auditPath}.tmp`
  writeFileSync(pendingAuditPath, `${JSON.stringify(findings, null, 2)}\n`, 'utf8')
  rmSync(paths.auditPath, { force: true })
  renameSync(pendingAuditPath, paths.auditPath)
  return { ok: true, coverage, auditPath: paths.auditPath }
}

function parseOptions(rawArgs) {
  const options = {}
  for (let index = 0; index < rawArgs.length; index += 1) {
    const option = rawArgs[index]
    if (!option.startsWith('--')) fail(`unexpected argument: ${option}`)
    const name = option.slice(2)
    if (!['workspace', 'scope', 'scope-file', 'file', 'symptom-id'].includes(name)) fail(`unknown option: ${option}`)
    if (name in options) fail(`duplicate option: ${option}`)
    const value = rawArgs[index + 1]
    if (value === undefined || value.startsWith('--')) fail(`${option} requires a value`)
    options[name] = value
    index += 1
  }
  return options
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function runCli() {
  const [command, ...rawArgs] = process.argv.slice(2)
  const options = parseOptions(rawArgs)
  if (command === 'verify') {
    if (Object.keys(options).length) fail('verify does not accept options')
    const { symptoms } = verifyArtifacts()
    printJson({ ok: true, symptomCount: symptoms.length })
  } else if (command === 'prepare') {
    if (options.file || options['symptom-id']) fail('prepare accepts only --workspace, --scope, and --scope-file')
    if (options.scope && options['scope-file']) fail('prepare accepts either --scope or --scope-file, not both')
    const scope = options['scope-file']
      ? readFileSync(resolve(options['scope-file']), 'utf8')
      : options.scope
    printJson(prepareReview({ workspace: options.workspace, scope }))
  } else if (command === 'validate-result') {
    if (!options.file || !options['symptom-id'] || options.workspace || options.scope || options['scope-file']) {
      fail('validate-result requires --file and --symptom-id')
    }
    const resultPath = isAbsolute(options.file) ? options.file : resolve(options.file)
    printJson({ ok: true, result: readFinding(resultPath, options['symptom-id']) })
  } else if (command === 'aggregate') {
    if (options.scope || options['scope-file'] || options.file || options['symptom-id']) fail('aggregate accepts only --workspace')
    printJson(aggregateResults({ workspace: options.workspace }))
  } else {
    fail('usage: review-swarm.mjs <verify|prepare|validate-result|aggregate> [options]')
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runCli()
  } catch (error) {
    process.stderr.write(`review-swarm: ${error.message}\n`)
    process.exitCode = 1
  }
}

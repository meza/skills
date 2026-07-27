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
const groupResultKeys = ['group_id', 'findings']
const templateTokens = ['{name}', '{description}', '{details}', '{symptom_blocks}', '{scope}']

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
      fail('a catalogue field has characters after a closing quote')
    }
    if (character === '"') {
      if (field.length > 0) fail('a catalogue field has a quote inside an unquoted field')
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

  if (inQuotes) fail('a catalogue field has an unterminated quoted field')
  if (field.length > 0 || row.length > 0 || quotedFieldClosed) finishRow()
  return rows
}

function readCatalogue(fileName, label, expectedHeader) {
  const source = readText(join(sharedDir, fileName), label).replace(/^\uFEFF/, '')
  const table = parseCsv(source)
  const header = table.shift()
  if (!header || header.join() !== expectedHeader) fail(`${label} header must be ${expectedHeader}`)
  return table.filter(row => !(row.length === 1 && row[0] === ''))
}

/**
 * Parses one group's `symptoms` field into the symptoms that group must report.
 *
 * Each line is `SYM-### | name | description`. The group row is authoritative for its own
 * symptoms, so the definitions travel with the group that reviews them.
 */
function parseGroupSymptoms(groupId, field, claimedBy) {
  const symptoms = []
  for (const line of field.split('\n')) {
    const entry = line.trim()
    if (!entry) continue
    const parts = entry.split('|').map(part => part.trim())
    if (parts.length !== 3) {
      fail(`group ${groupId} symptom entry must be "SYM-### | name | description"; got ${JSON.stringify(entry)}`)
    }
    const [id, name, description] = parts
    if (!/^SYM-\d{3}$/.test(id)) fail(`group ${groupId} has an unsafe symptom id: ${id}`)
    if (!name || !description) fail(`group ${groupId} symptom ${id} is missing a name or description`)
    const owner = claimedBy.get(id)
    if (owner) fail(`symptom ${id} is defined by both ${owner} and ${groupId}`)
    claimedBy.set(id, groupId)
    symptoms.push({ id, name, description })
  }
  if (symptoms.length === 0) fail(`group ${groupId} defines no symptoms`)
  return symptoms
}

/**
 * Parses the grouped review catalogue, the single authoritative artifact for this plugin.
 *
 * One row is one area of inquiry: its combined lens, plus the definition of every symptom that
 * area must report. A symptom claimed by two groups fails here, so the ids stay unique across the
 * catalogue and every finding remains attributable to exactly one area.
 */
function parseGroups() {
  const rows = readCatalogue(
    'code_review_symptom_groups.csv',
    'group catalogue',
    'id,name,description,details,symptoms',
  )
  const groups = []
  const seenIds = new Set()
  const claimedBy = new Map()

  for (const [index, row] of rows.entries()) {
    if (row.length !== 5) fail(`group catalogue row ${index + 2} has ${row.length} fields; expected 5`)
    const [id, name, description, details, symptomField] = row
    if (!/^GRP-\d{2}$/.test(id)) fail(`group catalogue row ${index + 2} has an unsafe id: ${id}`)
    if (seenIds.has(id)) fail(`group catalogue contains duplicate id: ${id}`)
    if (![name, description, details, symptomField].every(value => typeof value === 'string' && value.trim())) {
      fail(`group catalogue row ${index + 2} has an empty required field`)
    }

    const symptoms = parseGroupSymptoms(id, symptomField, claimedBy)
    seenIds.add(id)
    groups.push({ id, name, description, details, symptoms, symptomIds: symptoms.map(symptom => symptom.id) })
  }

  if (groups.length === 0) fail('group catalogue contains no groups')
  return groups
}

function assertRowSchema(schema) {
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
 * Composes the closed group-result schema for one group from the single row contract.
 *
 * The exact member count is encoded as both bounds so an investigator cannot satisfy the
 * schema while dropping or duplicating a lens.
 */
export function groupResultSchema(group, rowSchema) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...groupResultKeys],
    properties: {
      group_id: {
        type: 'string',
        const: group.id,
        description: `The group being reviewed. Must be exactly ${group.id}.`,
      },
      findings: {
        type: 'array',
        minItems: group.symptomIds.length,
        maxItems: group.symptomIds.length,
        description:
          `Exactly one finding per symptom in this group, in any order, using these symptom ids: ` +
          `${group.symptomIds.join(', ')}. Report clean symptoms with severity 0 rather than omitting them.`,
        items: rowSchema,
      },
    },
  }
}

/**
 * Parses and validates the repository-owned review artifacts.
 *
 * Verification parses RFC-4180 CSV including quoted multiline fields, enforces unique safe group
 * and symptom IDs across the catalogue, checks the group-brief template tokens, and checks the row
 * schema used inside every group result. It performs no network access and throws on corrupt or
 * incompatible input.
 */
export function verifyArtifacts() {
  const groups = parseGroups()
  const symptoms = groups.flatMap(group => group.symptoms)

  const template = readText(join(sharedDir, 'group_instruction_template.md'), 'group instruction template')
  for (const token of templateTokens) {
    if (!template.includes(token)) fail(`group instruction template is missing ${token}`)
  }

  const rowSchema = readJson(join(sharedDir, 'code_review_output_schema.json'), 'output schema')
  assertRowSchema(rowSchema)
  return { symptoms, groups, template, rowSchema }
}

function renderSymptomBlock(symptom) {
  return `- ${symptom.id} - ${symptom.name}: ${symptom.description}`
}

function renderGroupBrief(template, group, scope) {
  const rendered = template
    .replaceAll('{name}', `${group.id} - ${group.name}`)
    .replaceAll('{description}', group.description)
    .replaceAll('{details}', group.details)
    .replaceAll('{symptom_blocks}', group.symptoms.map(renderSymptomBlock).join('\n\n'))
    .replaceAll('{scope}', scope)
  return (
    `${rendered.trimEnd()}\n\n## Output identity\n\n` +
    `Use this exact group_id: ${group.id}\n\n` +
    `Return exactly ${group.symptomIds.length} findings, one for each of these symptom ids:\n` +
    `${group.symptomIds.map(id => `- ${id}`).join('\n')}\n`
  )
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
  const reviewDir = resolve(tmpDir, 'review-swarm-fast')
  if (reviewDir !== join(tmpDir, 'review-swarm-fast') || relative(workspace, reviewDir).startsWith('..')) {
    fail(`refusing unsafe review directory: ${reviewDir}`)
  }
  return {
    tmpDir,
    reviewDir,
    briefsDir: join(reviewDir, 'briefs'),
    resultsDir: join(reviewDir, 'results'),
    schemasDir: join(reviewDir, 'schemas'),
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
  mkdirSync(paths.schemasDir, { recursive: true })
}

/**
 * Prepares a workspace for one grouped review run and returns absolute paths plus group order.
 *
 * Preparation verifies all artifacts before touching output, removes only the resolved
 * `<workspace>/.tmp/review-swarm-fast` directory, then renders one scope-filled brief and one
 * closed result schema per group. Existing files elsewhere in `<workspace>/.tmp` are preserved.
 */
export function prepareReview({ workspace: rawWorkspace, scope }) {
  if (typeof scope !== 'string' || !scope.trim()) fail('prepare requires a non-empty --scope')
  const verified = verifyArtifacts()
  const workspace = resolveWorkspace(rawWorkspace)
  const paths = reviewPaths(workspace)
  cleanReviewDirectory(paths)

  for (const group of verified.groups) {
    const brief = renderGroupBrief(verified.template, group, scope.trim())
    writeFileSync(join(paths.briefsDir, `${group.id}.md`), brief, 'utf8')
    const schema = groupResultSchema(group, verified.rowSchema)
    writeFileSync(join(paths.schemasDir, `${group.id}.json`), `${JSON.stringify(schema, null, 2)}\n`, 'utf8')
  }

  return {
    ok: true,
    symptomCount: verified.symptoms.length,
    groupCount: verified.groups.length,
    groups: verified.groups.map(({ id, name, symptomIds }) => ({ id, name, symptomIds })),
    briefsDir: paths.briefsDir,
    resultsDir: paths.resultsDir,
    schemasDir: paths.schemasDir,
    rowSchema: verified.rowSchema,
  }
}

function validateFinding(finding, label) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) fail(`${label} must be a JSON object`)
  const actualKeys = Object.keys(finding)
  const unexpected = actualKeys.filter(key => !findingKeys.includes(key))
  const missing = findingKeys.filter(key => !actualKeys.includes(key))
  if (unexpected.length) fail(`${label} has unexpected field(s): ${unexpected.join(', ')}`)
  if (missing.length) fail(`${label} is missing field(s): ${missing.join(', ')}`)
  if (!Number.isInteger(finding.severity) || finding.severity < 0 || finding.severity > 5) {
    fail(`${label} severity must be an integer from 0 through 5`)
  }
  if (!['low', 'medium', 'high'].includes(finding.confidence)) {
    fail(`${label} confidence must be low, medium, or high`)
  }
  if (!['local', 'cross_cutting', 'systemic'].includes(finding.scope)) {
    fail(`${label} scope must be local, cross_cutting, or systemic`)
  }
  for (const field of ['summary', 'rationale']) {
    if (typeof finding[field] !== 'string') fail(`${label} ${field} must be a string`)
  }
  if (!Array.isArray(finding.evidence) || !finding.evidence.every(item => typeof item === 'string')) {
    fail(`${label} evidence must be an array of strings`)
  }
  return finding
}

/**
 * Validates one group result against its group's exact symptom membership.
 *
 * A result is valid only when it carries the expected group id and exactly one well-formed
 * finding per member symptom. Missing, duplicated, and foreign symptom ids are all rejected,
 * which is what keeps grouped investigation as accountable as one-agent-per-symptom.
 */
export function validateGroupResult(result, group) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail('group result must be a JSON object')
  const unexpected = Object.keys(result).filter(key => !groupResultKeys.includes(key))
  if (unexpected.length) fail(`group result has unexpected field(s): ${unexpected.join(', ')}`)
  if (result.group_id !== group.id) {
    fail(`group result group_id must be ${group.id}; got ${JSON.stringify(result.group_id)}`)
  }
  if (!Array.isArray(result.findings)) fail(`group result ${group.id} findings must be an array`)

  const seen = new Set()
  for (const finding of result.findings) {
    const symptomId = finding && typeof finding === 'object' ? finding.symptom_id : undefined
    validateFinding(finding, `group result ${group.id} finding ${JSON.stringify(symptomId ?? null)}`)
    if (typeof symptomId !== 'string') fail(`group result ${group.id} has a finding without a symptom_id string`)
    if (!group.symptomIds.includes(symptomId)) {
      fail(`group result ${group.id} reports ${symptomId}, which does not belong to this group`)
    }
    if (seen.has(symptomId)) fail(`group result ${group.id} reports ${symptomId} more than once`)
    seen.add(symptomId)
  }

  const missing = group.symptomIds.filter(symptomId => !seen.has(symptomId))
  if (missing.length) fail(`group result ${group.id} is missing finding(s) for: ${missing.join(', ')}`)
  return result
}

function readGroupResult(path, group) {
  const result = readJson(path, `group result ${group.id}`)
  return validateGroupResult(result, group)
}

/**
 * Validates complete group coverage and writes the ordered raw audit file.
 *
 * Every group must have one `<workspace>/.tmp/review-swarm-fast/results/<group-id>.json` file
 * holding one finding per symptom that group defines. Findings are flattened into ascending
 * symptom-id order so the audit reads as one review rather than nine. On success the ordered
 * array is written after full validation at `<workspace>/.tmp/code_review_results.json`; on
 * validation failure, no new audit file is written.
 */
export function aggregateResults({ workspace: rawWorkspace }) {
  const { symptoms, groups } = verifyArtifacts()
  const workspace = resolveWorkspace(rawWorkspace)
  const paths = reviewPaths(workspace)
  const findingsBySymptom = new Map()

  for (const group of groups) {
    const resultPath = join(paths.resultsDir, `${group.id}.json`)
    if (!existsSync(resultPath) || !statSync(resultPath).isFile()) {
      fail(`missing group result: ${resultPath}`)
    }
    for (const finding of readGroupResult(resultPath, group).findings) {
      findingsBySymptom.set(finding.symptom_id, finding)
    }
  }

  const findings = [...symptoms]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(symptom => {
      const finding = findingsBySymptom.get(symptom.id)
      if (!finding) fail(`no finding was produced for ${symptom.id}`)
      return finding
    })

  const flagged = findings.filter(({ severity }) => severity > 0).length
  const coverage = {
    symptoms_reviewed: findings.length,
    groups_reviewed: groups.length,
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
    if (!['workspace', 'scope', 'scope-file', 'file', 'group-id'].includes(name)) fail(`unknown option: ${option}`)
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
    const { symptoms, groups } = verifyArtifacts()
    printJson({
      ok: true,
      symptomCount: symptoms.length,
      groupCount: groups.length,
      groups: groups.map(({ id, symptomIds }) => ({ id, symptomCount: symptomIds.length })),
    })
  } else if (command === 'prepare') {
    if (options.file || options['group-id']) fail('prepare accepts only --workspace, --scope, and --scope-file')
    if (options.scope && options['scope-file']) fail('prepare accepts either --scope or --scope-file, not both')
    const scope = options['scope-file']
      ? readFileSync(resolve(options['scope-file']), 'utf8')
      : options.scope
    printJson(prepareReview({ workspace: options.workspace, scope }))
  } else if (command === 'validate-result') {
    if (!options.file || !options['group-id'] || options.workspace || options.scope || options['scope-file']) {
      fail('validate-result requires --file and --group-id')
    }
    const { groups } = verifyArtifacts()
    const group = groups.find(candidate => candidate.id === options['group-id'])
    if (!group) fail(`unknown group id: ${options['group-id']}`)
    const resultPath = isAbsolute(options.file) ? options.file : resolve(options.file)
    printJson({ ok: true, result: readGroupResult(resultPath, group) })
  } else if (command === 'aggregate') {
    if (options.scope || options['scope-file'] || options.file || options['group-id']) fail('aggregate accepts only --workspace')
    printJson(aggregateResults({ workspace: options.workspace }))
  } else {
    fail('usage: review-swarm-fast.mjs <verify|prepare|validate-result|aggregate> [options]')
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runCli()
  } catch (error) {
    process.stderr.write(`review-swarm-fast: ${error.message}\n`)
    process.exitCode = 1
  }
}

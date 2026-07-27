import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { groupResultSchema, validateGroupResult, verifyArtifacts } from './review-swarm-fast.mjs'

const sharedDir = dirname(fileURLToPath(import.meta.url))
const helperPath = join(sharedDir, 'review-swarm-fast.mjs')

function runHelper(args, workspace) {
  return spawnSync(process.execPath, [helperPath, ...args], {
    cwd: workspace,
    encoding: 'utf8',
  })
}

function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'review-swarm-fast-test-'))
}

function parseSuccess(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

function validFinding(symptomId) {
  return {
    symptom_id: symptomId,
    severity: 0,
    confidence: 'high',
    scope: 'local',
    summary: 'No issue found for this symptom.',
    evidence: [],
    rationale: 'The submitted change does not exhibit this symptom.',
  }
}

function validGroupResult(group) {
  return {
    group_id: group.id,
    findings: group.symptomIds.map(validFinding),
  }
}

function prepare(workspace, scope = 'Review only the controlled test diff.') {
  return parseSuccess(runHelper(['prepare', '--workspace', workspace, '--scope', scope], workspace))
}

test('verify accepts the repository-owned artifact set', () => {
  const workspace = createWorkspace()
  try {
    const verified = parseSuccess(runHelper(['verify'], workspace))
    assert.equal(verified.ok, true)
    assert.equal(verified.symptomCount, 84)
    assert.equal(verified.groupCount, 9)
    const grouped = verified.groups.reduce((total, group) => total + group.symptomCount, 0)
    assert.equal(grouped, verified.symptomCount)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('the grouped catalogue defines every symptom exactly once', () => {
  const { symptoms, groups } = verifyArtifacts()
  const ids = groups.flatMap(group => group.symptomIds)

  assert.equal(ids.length, symptoms.length)
  assert.equal(new Set(ids).size, ids.length, 'no symptom may be defined by two groups')
  for (const group of groups) {
    assert.match(group.id, /^GRP-\d{2}$/)
    assert.ok(group.symptomIds.length > 0, `${group.id} must define at least one symptom`)
    assert.ok(group.description.trim() && group.details.trim(), `${group.id} must carry its own lens`)
    for (const symptom of group.symptoms) {
      assert.match(symptom.id, /^SYM-\d{3}$/)
      assert.ok(symptom.name.trim(), `${symptom.id} must have a name`)
      assert.ok(symptom.description.trim(), `${symptom.id} must have a description`)
    }
  }
})

test('the plugin owns exactly one review catalogue', () => {
  const entries = readdirSync(sharedDir).sort()
  assert.deepEqual(entries.filter(entry => entry.endsWith('.csv')), ['code_review_symptom_groups.csv'])
})

test('the composed group schema forces one finding per member symptom', () => {
  const { groups, rowSchema } = verifyArtifacts()
  for (const group of groups) {
    const schema = groupResultSchema(group, rowSchema)
    assert.equal(schema.additionalProperties, false)
    assert.deepEqual(schema.required, ['group_id', 'findings'])
    assert.equal(schema.properties.group_id.const, group.id)
    assert.equal(schema.properties.findings.minItems, group.symptomIds.length)
    assert.equal(schema.properties.findings.maxItems, group.symptomIds.length)
    assert.equal(schema.properties.findings.items, rowSchema)
  }
})

test('prepare renders one brief and one schema per group and contains cleanup', () => {
  const workspace = createWorkspace()
  try {
    const reviewTmp = join(workspace, '.tmp', 'review-swarm-fast')
    const unrelated = join(workspace, '.tmp', 'keep.txt')
    const scopePath = join(reviewTmp, 'scope.txt')
    mkdirSync(reviewTmp, { recursive: true })
    writeFileSync(join(reviewTmp, 'stale.txt'), 'stale')
    writeFileSync(scopePath, 'Review only the controlled test diff.')
    writeFileSync(unrelated, 'keep')

    const prepared = parseSuccess(runHelper([
      'prepare',
      '--workspace', workspace,
      '--scope-file', scopePath,
    ], workspace))

    assert.equal(prepared.symptomCount, 84)
    assert.equal(prepared.groupCount, 9)
    assert.equal(prepared.groups.length, 9)
    assert.equal(prepared.rowSchema.additionalProperties, false)
    assert.equal(readFileSync(unrelated, 'utf8'), 'keep')
    assert.throws(() => readFileSync(join(reviewTmp, 'stale.txt'), 'utf8'))

    for (const group of prepared.groups) {
      const brief = readFileSync(join(prepared.briefsDir, `${group.id}.md`), 'utf8')
      assert.match(brief, /Review only the controlled test diff\./)
      assert.doesNotMatch(brief, /\{(?:name|description|details|symptom_blocks|scope)\}/)
      assert.match(brief, new RegExp(`Use this exact group_id: ${group.id}`))
      // The area definition is what makes the brief a lens rather than a list of symptoms.
      const definition = verifyArtifacts().groups.find(candidate => candidate.id === group.id)
      assert.ok(brief.includes(definition.description), `${group.id} brief must carry its area description`)
      assert.ok(brief.includes(definition.details), `${group.id} brief must carry its area details`)
      for (const symptom of definition.symptoms) {
        assert.ok(
          brief.includes(`${symptom.id} - ${symptom.name}: ${symptom.description}`),
          `${group.id} brief must define ${symptom.id}`,
        )
      }

      const schema = JSON.parse(readFileSync(join(prepared.schemasDir, `${group.id}.json`), 'utf8'))
      assert.equal(schema.properties.findings.minItems, group.symptomIds.length)
      assert.equal(schema.properties.findings.maxItems, group.symptomIds.length)
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('verify rejects a brief template that has lost a required token', () => {
  const workspace = createWorkspace()
  try {
    // The helper resolves its artifacts next to itself, so a copied shared directory is the way to
    // prove tampering is rejected rather than merely documented.
    const copiedShared = join(workspace, 'shared')
    mkdirSync(copiedShared, { recursive: true })
    for (const artifact of [
      'review-swarm-fast.mjs',
      'code_review_symptom_groups.csv',
      'group_instruction_template.md',
      'code_review_output_schema.json',
    ]) {
      copyFileSync(join(sharedDir, artifact), join(copiedShared, artifact))
    }
    const copiedHelper = join(copiedShared, 'review-swarm-fast.mjs')
    const runCopiedHelper = () => spawnSync(process.execPath, [copiedHelper, 'verify'], { cwd: workspace, encoding: 'utf8' })

    assert.equal(runCopiedHelper().status, 0, 'the untouched copy must verify')

    const templatePath = join(copiedShared, 'group_instruction_template.md')
    const template = readFileSync(templatePath, 'utf8')
    assert.ok(template.includes('{details}'))
    writeFileSync(templatePath, template.replace('{details}', 'the area details'))

    const failed = runCopiedHelper()
    assert.notEqual(failed.status, 0)
    assert.match(failed.stderr, /missing \{details\}/i)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('prepare rejects an empty scope', () => {
  const workspace = createWorkspace()
  try {
    const failed = runHelper(['prepare', '--workspace', workspace, '--scope', '   '], workspace)
    assert.notEqual(failed.status, 0)
    assert.match(failed.stderr, /non-empty --scope/i)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('group result validation holds every member symptom accountable', async (t) => {
  const { groups } = verifyArtifacts()
  const group = groups[0]
  const other = groups[1]
  const foreignSymptomId = other.symptomIds[0]

  await t.test('accepts one well-formed finding per member symptom', () => {
    assert.doesNotThrow(() => validateGroupResult(validGroupResult(group), group))
  })

  const cases = [
    ['missing member', result => ({ ...result, findings: result.findings.slice(1) }), /missing finding/i],
    ['duplicated member', result => ({
      ...result,
      findings: [...result.findings.slice(1), validFinding(group.symptomIds[1])],
    }), /more than once/i],
    ['foreign symptom', result => ({
      ...result,
      findings: [...result.findings.slice(1), validFinding(foreignSymptomId)],
    }), /does not belong to this group/i],
    ['wrong group id', result => ({ ...result, group_id: other.id }), /group_id must be/i],
    ['unexpected top-level field', result => ({ ...result, notes: 'extra' }), /unexpected field/i],
    ['findings not an array', result => ({ ...result, findings: {} }), /must be an array/i],
    ['invalid severity', result => ({
      ...result,
      findings: [{ ...result.findings[0], severity: 6 }, ...result.findings.slice(1)],
    }), /severity/i],
    ['invalid confidence', result => ({
      ...result,
      findings: [{ ...result.findings[0], confidence: 'certain' }, ...result.findings.slice(1)],
    }), /confidence/i],
    ['unexpected finding field', result => ({
      ...result,
      findings: [{ ...result.findings[0], extra: true }, ...result.findings.slice(1)],
    }), /unexpected field/i],
  ]

  for (const [name, mutate, expectedError] of cases) {
    await t.test(name, () => {
      assert.throws(() => validateGroupResult(mutate(validGroupResult(group)), group), expectedError)
    })
  }
})

test('validate-result checks one group result against its group', () => {
  const workspace = createWorkspace()
  try {
    const prepared = prepare(workspace)
    const group = verifyArtifacts().groups[0]
    const resultPath = join(prepared.resultsDir, `${group.id}.json`)
    writeFileSync(resultPath, `${JSON.stringify(validGroupResult(group))}\n`)

    const validated = parseSuccess(runHelper([
      'validate-result',
      '--file', resultPath,
      '--group-id', group.id,
    ], workspace))
    assert.equal(validated.ok, true)
    assert.equal(validated.result.findings.length, group.symptomIds.length)

    const unknownGroup = runHelper(['validate-result', '--file', resultPath, '--group-id', 'GRP-99'], workspace)
    assert.notEqual(unknownGroup.status, 0)
    assert.match(unknownGroup.stderr, /unknown group id/i)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('aggregate flattens group results into symptom-id order and rejects broken coverage', async (t) => {
  const workspace = createWorkspace()
  try {
    const prepared = prepare(workspace)
    const { symptoms, groups } = verifyArtifacts()
    for (const group of groups) {
      writeFileSync(join(prepared.resultsDir, `${group.id}.json`), `${JSON.stringify(validGroupResult(group))}\n`)
    }

    const aggregate = () => runHelper(['aggregate', '--workspace', workspace], workspace)
    const firstGroup = groups[0]
    const firstResultPath = join(prepared.resultsDir, `${firstGroup.id}.json`)

    const successful = parseSuccess(aggregate())
    assert.deepEqual(successful.coverage, {
      symptoms_reviewed: 84,
      groups_reviewed: 9,
      flagged: 0,
      clean: 84,
    })
    const audit = JSON.parse(readFileSync(successful.auditPath, 'utf8'))
    assert.equal(audit.length, 84)
    const expectedOrder = symptoms.map(({ id }) => id).sort()
    assert.deepEqual(audit.map(({ symptom_id }) => symptom_id), expectedOrder, 'audit must read in symptom-id order')
    const auditBefore = readFileSync(successful.auditPath, 'utf8')

    const cases = [
      ['missing group result', null, /missing group result/i],
      ['malformed JSON', '{', /valid JSON/i],
      ['dropped member symptom', { ...validGroupResult(firstGroup), findings: validGroupResult(firstGroup).findings.slice(1) }, /missing finding/i],
      ['mismatched group id', { ...validGroupResult(firstGroup), group_id: 'GRP-99' }, /group_id must be/i],
      ['invalid severity', {
        ...validGroupResult(firstGroup),
        findings: validGroupResult(firstGroup).findings.map((finding, index) => (index === 0 ? { ...finding, severity: 6 } : finding)),
      }, /severity/i],
    ]

    for (const [name, replacement, expectedError] of cases) {
      await t.test(name, () => {
        if (replacement === null) {
          rmSync(firstResultPath)
        } else if (typeof replacement === 'string') {
          writeFileSync(firstResultPath, replacement)
        } else {
          writeFileSync(firstResultPath, JSON.stringify(replacement))
        }

        const failed = aggregate()
        assert.notEqual(failed.status, 0)
        assert.match(failed.stderr, expectedError)
        assert.equal(readFileSync(successful.auditPath, 'utf8'), auditBefore, 'a failed run must not rewrite the audit file')
        writeFileSync(firstResultPath, `${JSON.stringify(validGroupResult(firstGroup))}\n`)
      })
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('aggregate counts flagged findings across groups', () => {
  const workspace = createWorkspace()
  try {
    const prepared = prepare(workspace)
    const { groups } = verifyArtifacts()
    for (const [index, group] of groups.entries()) {
      const result = validGroupResult(group)
      if (index < 2) {
        result.findings[0] = {
          ...result.findings[0],
          severity: 3,
          summary: 'A serious defect for this symptom.',
          evidence: ['file.ts:1'],
          rationale: 'The evidence directly contradicts the symptom definition.',
        }
      }
      writeFileSync(join(prepared.resultsDir, `${group.id}.json`), `${JSON.stringify(result)}\n`)
    }

    const successful = parseSuccess(runHelper(['aggregate', '--workspace', workspace], workspace))
    assert.deepEqual(successful.coverage, {
      symptoms_reviewed: 84,
      groups_reviewed: 9,
      flagged: 2,
      clean: 82,
    })
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('runtime files contain no artifact download implementation', () => {
  const runtimePaths = [
    resolve(sharedDir, 'review-swarm-fast.mjs'),
    resolve(sharedDir, '..', 'claude', 'workflows', 'review-swarm-fast.js'),
    resolve(sharedDir, '..', 'claude', 'scripts', 'install-workflow.js'),
  ]

  for (const runtimePath of runtimePaths) {
    const source = readFileSync(runtimePath, 'utf8')
    assert.doesNotMatch(source, /raw\.githubusercontent\.com/)
    assert.doesNotMatch(source, /\bfetch\s*\(/)
  }
})

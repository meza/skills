import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sharedDir = dirname(fileURLToPath(import.meta.url))
const helperPath = join(sharedDir, 'review-swarm.mjs')

function runHelper(args, workspace) {
  return spawnSync(process.execPath, [helperPath, ...args], {
    cwd: workspace,
    encoding: 'utf8',
  })
}

function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'review-swarm-test-'))
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

test('verify accepts the repository-owned artifact set', () => {
  const workspace = createWorkspace()
  try {
    const verified = parseSuccess(runHelper(['verify'], workspace))
    assert.equal(verified.ok, true)
    assert.equal(verified.symptomCount, 84)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('prepare parses RFC-4180 content, renders every brief, and contains cleanup', () => {
  const workspace = createWorkspace()
  try {
    const reviewTmp = join(workspace, '.tmp', 'review-swarm')
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
    assert.equal(prepared.schema.additionalProperties, false)
    assert.equal(new Set(prepared.symptoms.map(({ id }) => id)).size, 84)
    assert.equal(readFileSync(unrelated, 'utf8'), 'keep')
    assert.match(readFileSync(join(prepared.briefsDir, 'SYM-001.md'), 'utf8'), /Review only the controlled test diff\./)
    assert.doesNotMatch(readFileSync(join(prepared.briefsDir, 'SYM-001.md'), 'utf8'), /\{(?:name|description|details|scope)\}/)
    assert.throws(() => readFileSync(join(reviewTmp, 'stale.txt'), 'utf8'))
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('aggregate writes catalogue-ordered findings and rejects incomplete or invalid results', async (t) => {
  const workspace = createWorkspace()
  try {
    const prepared = parseSuccess(runHelper([
      'prepare',
      '--workspace', workspace,
      '--scope', 'Review only the controlled test diff.',
    ], workspace))

    for (const { id } of prepared.symptoms) {
      writeFileSync(join(prepared.resultsDir, `${id}.json`), `${JSON.stringify(validFinding(id))}\n`)
    }

    const aggregate = () => runHelper(['aggregate', '--workspace', workspace], workspace)
    const firstId = prepared.symptoms[0].id
    const firstResultPath = join(prepared.resultsDir, `${firstId}.json`)

    const successful = parseSuccess(aggregate())
    assert.deepEqual(successful.coverage, { symptoms_reviewed: 84, flagged: 0, clean: 84 })
    const audit = JSON.parse(readFileSync(successful.auditPath, 'utf8'))
    assert.equal(audit.length, 84)
    assert.deepEqual(audit.map(({ symptom_id }) => symptom_id), prepared.symptoms.map(({ id }) => id))

    const cases = [
      ['missing result', null, /missing investigator result/i],
      ['symptom id mismatch', { ...validFinding(firstId), symptom_id: 'SYM-999' }, /symptom_id/i],
      ['malformed JSON', '{', /valid JSON/i],
      ['invalid severity', { ...validFinding(firstId), severity: 6 }, /severity/i],
      ['invalid enum', { ...validFinding(firstId), confidence: 'certain' }, /confidence/i],
      ['unexpected field', { ...validFinding(firstId), extra: true }, /unexpected field/i],
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
        writeFileSync(firstResultPath, `${JSON.stringify(validFinding(firstId))}\n`)
      })
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('runtime files contain no artifact download implementation', () => {
  const runtimePaths = [
    resolve(sharedDir, 'review-swarm.mjs'),
    resolve(sharedDir, '..', 'claude', 'workflows', 'review-swarm.js'),
    resolve(sharedDir, '..', 'claude', 'scripts', 'install-workflow.js'),
  ]

  for (const runtimePath of runtimePaths) {
    const source = readFileSync(runtimePath, 'utf8')
    assert.doesNotMatch(source, /raw\.githubusercontent\.com/)
    assert.doesNotMatch(source, /\bfetch\s*\(/)
  }
})

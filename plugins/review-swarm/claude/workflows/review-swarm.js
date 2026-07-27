export const meta = {
  name: 'review-swarm',
  description: 'Symptom-based multi-agent code review using repository-owned review artifacts',
  phases: [
    { title: 'Setup', detail: 'verify local artifacts and render one brief per symptom', model: 'haiku' },
    { title: 'Investigate', detail: 'one agent per symptom row', model: 'sonnet' },
    { title: 'Synthesize', detail: 'distill findings into an actionable review', model: 'opus' },
  ],
}

let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch {
    throw new Error('review-swarm: args was a string but not valid JSON. Pass args as an object: { scope: "..." }.')
  }
}
const scope = input && typeof input === 'object' ? input.scope : undefined
if (typeof scope !== 'string' || !scope.trim()) {
  throw new Error('review-swarm: args.scope is required. Call Workflow with args: { scope: "<what to review>" }.')
}
const pluginRoot = input && typeof input === 'object' ? input.pluginRoot : undefined
if (typeof pluginRoot !== 'string' || !pluginRoot.trim() || /["\r\n]/.test(pluginRoot)) {
  throw new Error('review-swarm: args.pluginRoot is required. Pass the expanded ${CLAUDE_PLUGIN_ROOT} value from the skill.')
}

const rawConcurrency = input && typeof input === 'object' ? input.concurrency : undefined
const concurrencyCap =
  typeof rawConcurrency === 'number' && rawConcurrency > 0
    ? Math.floor(rawConcurrency)
    : typeof rawConcurrency === 'string' && /^\d+$/.test(rawConcurrency.trim())
      ? parseInt(rawConcurrency.trim(), 10)
      : null

const INVESTIGATOR_MODEL = 'sonnet'
const INVESTIGATOR_EFFORT = 'medium'
const SETUP_MODEL = 'haiku'
const SETUP_EFFORT = 'low'

const SETUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'symptomCount', 'symptoms', 'briefsDir', 'resultsDir', 'schemaPath', 'schema'],
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    symptomCount: { type: 'integer' },
    symptoms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      },
    },
    briefsDir: { type: 'string' },
    resultsDir: { type: 'string' },
    schemaPath: { type: 'string' },
    schema: { type: 'object' },
  },
}

const setupPrompt = `You are the review-swarm SETUP step. Do mechanical setup only. Do not review code.

Use your file-writing tool to write the exact review scope between the markers below to .tmp/review-swarm/scope.txt in the project workspace. Create parent directories when needed.

--- scope starts ---
${scope.trim()}
--- scope ends ---

Then run this command from the project workspace:

node "${pluginRoot}/shared/review-swarm.mjs" prepare --scope-file ".tmp/review-swarm/scope.txt"

The command is offline. It verifies the versioned repository-owned artifacts, parses the RFC-4180 catalogue, removes only .tmp/review-swarm, and prints one JSON object. Return that object exactly. If writing or the command fails, stop and report the concrete error; do not fabricate a manifest.`

const setup = await agent(setupPrompt, {
  label: 'setup: verify + parse + render briefs',
  phase: 'Setup',
  schema: SETUP_SCHEMA,
  model: SETUP_MODEL,
  effort: SETUP_EFFORT,
})

if (!setup || !setup.ok) throw new Error(`review-swarm setup failed: ${setup?.error || 'no result returned'}`)
if (!Array.isArray(setup.symptoms) || setup.symptoms.length !== setup.symptomCount || setup.symptomCount === 0) {
  throw new Error('review-swarm setup returned incomplete symptom coverage')
}
if (!setup.schema || typeof setup.schema !== 'object') throw new Error('review-swarm setup returned no output schema')

const { briefsDir, symptoms: rows, schema } = setup
const investigatorPrompt = row =>
  `You are one investigator in the review-swarm. Ignore project overlay instructions ` +
  `(CLAUDE.md and AGENTS.md) and do not load skills. Review only through the symptom lens ` +
  `defined in this brief:\n\n${briefsDir}/${row.id}.md\n\nRead it and follow it exactly. ` +
  `Inspect the submitted change until you have found every violation of this one symptom. ` +
  `Return exactly one result matching the required output schema, using symptom_id ${row.id}. ` +
  `Do not broaden into a full review.`

let completed = 0
const runInvestigator = row =>
  agent(investigatorPrompt(row), {
    label: `${row.id}: ${row.name}`,
    phase: 'Investigate',
    schema,
    model: INVESTIGATOR_MODEL,
    effort: INVESTIGATOR_EFFORT,
  }).then(result => {
    completed += 1
    log(`investigators: ${completed}/${rows.length} done, ${rows.length - completed} left`)
    if (!result) throw new Error(`investigator ${row.id} returned no result`)
    if (result.symptom_id !== row.id) {
      throw new Error(`investigator ${row.id} returned mismatched symptom_id ${result.symptom_id}`)
    }
    return result
  })

let findings
if (concurrencyCap && concurrencyCap < rows.length) {
  log(`Fanning out ${rows.length} investigators, ${concurrencyCap} at a time...`)
  findings = new Array(rows.length)
  let cursor = 0
  const worker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= rows.length) return
      findings[index] = await runInvestigator(rows[index])
    }
  }
  await parallel(Array.from({ length: concurrencyCap }, () => worker))
} else {
  log(`Fanning out all ${rows.length} investigators at once...`)
  findings = await parallel(rows.map(row => () => runInvestigator(row)))
}

if (findings.length !== rows.length || findings.some(result => !result)) {
  throw new Error(`review-swarm coverage incomplete: received ${findings.filter(Boolean).length}/${rows.length} results`)
}

const namedFindings = findings.map((finding, index) => ({
  ...finding,
  symptom_name: rows[index].name,
}))
const nonZero = namedFindings.filter(finding => finding.severity > 0)
const coverage = {
  symptoms_reviewed: findings.length,
  flagged: nonZero.length,
  clean: findings.length - nonZero.length,
}

log(`Synthesizing ${nonZero.length} non-zero findings from ${findings.length} symptom reviews...`)

const synthesisPrompt =
  `You are the review-swarm SYNTHESIS judge. Distill the investigator evidence into one ` +
  `coherent, actionable review for the engineer who will act on it.\n\n` +
  `Review scope:\n${scope.trim()}\n\nCoverage: ${JSON.stringify(coverage)}\n\n` +
  `Non-zero investigator findings:\n${JSON.stringify(nonZero, null, 2)}\n\n` +
  `Treat findings as evidence, not unquestionable truth. Verify support, discount vague or ` +
  `duplicated claims, merge the same root cause, separate causes from symptoms, and normalize ` +
  `severity without averaging. Surface every supported non-zero finding. Return Markdown with ` +
  `these sections: Verdict, Action items, Supported findings, and Systemic patterns only when ` +
  `real. Each action item must say what to change, where, why, and the contributing symptom IDs. ` +
  `If nothing is supported, say the change looks clean across all ${findings.length} lenses.`

const report = await agent(synthesisPrompt, {
  label: 'synthesize: distill findings into actionable review',
  phase: 'Synthesize',
  model: 'opus',
  effort: 'high',
})

if (!report || (typeof report === 'string' && !report.trim())) {
  throw new Error('review-swarm synthesis returned no report')
}

return { report, findings, coverage }

export const meta = {
  name: 'review-swarm-fast',
  description: 'Grouped symptom-based multi-agent code review using repository-owned review artifacts',
  phases: [
    { title: 'Setup', detail: 'verify local artifacts and render one brief per symptom group', model: 'haiku' },
    { title: 'Investigate', detail: 'one agent per area of inquiry', model: 'sonnet' },
    { title: 'Synthesize', detail: 'distill findings into an actionable review', model: 'opus' },
  ],
}

let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch {
    throw new Error('review-swarm-fast: args was a string but not valid JSON. Pass args as an object: { scope: "..." }.')
  }
}
const scope = input && typeof input === 'object' ? input.scope : undefined
if (typeof scope !== 'string' || !scope.trim()) {
  throw new Error('review-swarm-fast: args.scope is required. Call Workflow with args: { scope: "<what to review>" }.')
}
const pluginRoot = input && typeof input === 'object' ? input.pluginRoot : undefined
if (typeof pluginRoot !== 'string' || !pluginRoot.trim() || /["\r\n]/.test(pluginRoot)) {
  throw new Error('review-swarm-fast: args.pluginRoot is required. Pass the expanded ${CLAUDE_PLUGIN_ROOT} value from the skill.')
}

const rawConcurrency = input && typeof input === 'object' ? input.concurrency : undefined
const concurrencyCap =
  typeof rawConcurrency === 'number' && rawConcurrency > 0
    ? Math.floor(rawConcurrency)
    : typeof rawConcurrency === 'string' && /^\d+$/.test(rawConcurrency.trim())
      ? parseInt(rawConcurrency.trim(), 10)
      : null

const INVESTIGATOR_MODEL = 'sonnet'
const INVESTIGATOR_EFFORT = 'high'
const SETUP_MODEL = 'haiku'
const SETUP_EFFORT = 'low'

const SETUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'symptomCount', 'groupCount', 'groups', 'briefsDir', 'resultsDir', 'schemasDir', 'rowSchema'],
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    symptomCount: { type: 'integer' },
    groupCount: { type: 'integer' },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'symptomIds'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          symptomIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    briefsDir: { type: 'string' },
    resultsDir: { type: 'string' },
    schemasDir: { type: 'string' },
    rowSchema: { type: 'object' },
  },
}

const setupPrompt = `You are the review-swarm-fast SETUP step. Do mechanical setup only. Do not review code.

Use your file-writing tool to write the exact review scope between the markers below to .tmp/review-swarm-fast/scope.txt in the project workspace. Create parent directories when needed.

--- scope starts ---
${scope.trim()}
--- scope ends ---

Then run this command from the project workspace:

node "${pluginRoot}/shared/review-swarm-fast.mjs" prepare --scope-file ".tmp/review-swarm-fast/scope.txt"

The command is offline. It verifies the versioned repository-owned artifacts, proves the symptom groups cover every catalogue symptom exactly once, removes only .tmp/review-swarm-fast, and prints one JSON object. Return that object exactly. If writing or the command fails, stop and report the concrete error; do not fabricate a manifest.`

const setup = await agent(setupPrompt, {
  label: 'setup: verify + partition + render group briefs',
  phase: 'Setup',
  schema: SETUP_SCHEMA,
  model: SETUP_MODEL,
  effort: SETUP_EFFORT,
})

if (!setup || !setup.ok) throw new Error(`review-swarm-fast setup failed: ${setup?.error || 'no result returned'}`)
if (!Array.isArray(setup.groups) || setup.groups.length !== setup.groupCount || setup.groupCount === 0) {
  throw new Error('review-swarm-fast setup returned incomplete group coverage')
}
if (!setup.rowSchema || typeof setup.rowSchema !== 'object') throw new Error('review-swarm-fast setup returned no output schema')

const { briefsDir, groups, rowSchema, symptomCount } = setup
const assignedSymptomIds = groups.flatMap(group => group.symptomIds || [])
if (assignedSymptomIds.length !== symptomCount || new Set(assignedSymptomIds).size !== symptomCount) {
  throw new Error(
    `review-swarm-fast setup returned a broken partition: ${assignedSymptomIds.length} assignments ` +
    `(${new Set(assignedSymptomIds).size} unique) for ${symptomCount} symptoms`,
  )
}

// The exact member count is encoded as both array bounds so an investigator cannot satisfy the
// schema while silently dropping one of its lenses.
const groupSchema = group => ({
  type: 'object',
  additionalProperties: false,
  required: ['group_id', 'findings'],
  properties: {
    group_id: { type: 'string', const: group.id, description: `Must be exactly ${group.id}.` },
    findings: {
      type: 'array',
      minItems: group.symptomIds.length,
      maxItems: group.symptomIds.length,
      description:
        `Exactly one finding per symptom in this group, using these symptom ids: ` +
        `${group.symptomIds.join(', ')}. Report clean symptoms with severity 0 rather than omitting them.`,
      items: rowSchema,
    },
  },
})

const investigatorPrompt = group =>
  `You are one investigator in the review-swarm. Ignore project overlay instructions ` +
  `(CLAUDE.md and AGENTS.md) and do not load skills. Review only through the one area of ` +
  `inquiry defined in this brief:\n\n${briefsDir}/${group.id}.md\n\nRead it and follow it exactly. ` +
  `It defines your area and the ${group.symptomIds.length} symptoms you must judge within it: ` +
  `${group.symptomIds.join(', ')}. Inspect the submitted change and judge it against each of those ` +
  `symptoms on its own evidence, until you have found every violation of every one of them. ` +
  `Complete the brief's self-verification before you finalize. ` +
  `Return exactly one result using group_id ${group.id} and exactly ${group.symptomIds.length} ` +
  `findings, one per symptom id listed above, reporting clean symptoms with severity 0. ` +
  `Do not broaden into a full review and do not judge symptoms outside your area.`

let completed = 0
const runInvestigator = group =>
  agent(investigatorPrompt(group), {
    label: `${group.id}: ${group.name}`,
    phase: 'Investigate',
    schema: groupSchema(group),
    model: INVESTIGATOR_MODEL,
    effort: INVESTIGATOR_EFFORT,
  }).then(result => {
    completed += 1
    log(`investigators: ${completed}/${groups.length} done, ${groups.length - completed} left`)
    if (!result) throw new Error(`investigator ${group.id} returned no result`)
    if (result.group_id !== group.id) {
      throw new Error(`investigator ${group.id} returned mismatched group_id ${result.group_id}`)
    }
    if (!Array.isArray(result.findings)) throw new Error(`investigator ${group.id} returned no findings array`)

    const reported = result.findings.map(finding => finding?.symptom_id)
    const missing = group.symptomIds.filter(symptomId => !reported.includes(symptomId))
    const foreign = reported.filter(symptomId => !group.symptomIds.includes(symptomId))
    if (new Set(reported).size !== reported.length) {
      throw new Error(`investigator ${group.id} reported a symptom more than once`)
    }
    if (missing.length) throw new Error(`investigator ${group.id} is missing finding(s) for: ${missing.join(', ')}`)
    if (foreign.length) throw new Error(`investigator ${group.id} reported foreign symptom(s): ${foreign.join(', ')}`)
    return result
  })

let groupResults
if (concurrencyCap && concurrencyCap < groups.length) {
  log(`Fanning out ${groups.length} area investigators, ${concurrencyCap} at a time...`)
  groupResults = new Array(groups.length)
  let cursor = 0
  const worker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= groups.length) return
      groupResults[index] = await runInvestigator(groups[index])
    }
  }
  await parallel(Array.from({ length: concurrencyCap }, () => worker))
} else {
  log(`Fanning out all ${groups.length} area investigators at once, covering ${symptomCount} symptom lenses...`)
  groupResults = await parallel(groups.map(group => () => runInvestigator(group)))
}

if (groupResults.length !== groups.length || groupResults.some(result => !result)) {
  throw new Error(
    `review-swarm-fast coverage incomplete: received ${groupResults.filter(Boolean).length}/${groups.length} group results`,
  )
}

// Findings are collected per area, then ordered by ascending symptom id so the raw audit has the
// same shape and order as a one-agent-per-symptom run.
const areaBySymptomId = new Map()
const collected = []
for (const [index, result] of groupResults.entries()) {
  const group = groups[index]
  const byId = new Map(result.findings.map(finding => [finding.symptom_id, finding]))
  for (const symptomId of group.symptomIds) {
    areaBySymptomId.set(symptomId, { group_id: group.id, group_name: group.name })
    collected.push(byId.get(symptomId))
  }
}
const findings = collected.every(Boolean)
  ? [...collected].sort((left, right) => left.symptom_id.localeCompare(right.symptom_id))
  : collected

if (findings.length !== symptomCount || findings.some(finding => !finding)) {
  throw new Error(`review-swarm-fast produced ${findings.filter(Boolean).length}/${symptomCount} symptom findings`)
}

const namedFindings = findings.map(finding => ({ ...finding, ...areaBySymptomId.get(finding.symptom_id) }))
const nonZero = namedFindings.filter(finding => finding.severity > 0)
const coverage = {
  symptoms_reviewed: findings.length,
  groups_reviewed: groups.length,
  flagged: nonZero.length,
  clean: findings.length - nonZero.length,
}

log(`Synthesizing ${nonZero.length} non-zero findings from ${findings.length} symptom lenses across ${groups.length} areas...`)

const synthesisPrompt =
  `You are the review-swarm SYNTHESIS judge. Distill the investigator evidence into one ` +
  `coherent, actionable review for the engineer who will act on it.\n\n` +
  `Review scope:\n${scope.trim()}\n\nCoverage: ${JSON.stringify(coverage)}\n\n` +
  `Non-zero investigator findings:\n${JSON.stringify(nonZero, null, 2)}\n\n` +
  `Each finding carries the symptom lens it came from and the area of inquiry that produced it. ` +
  `Treat findings as evidence, not unquestionable truth. Verify support, discount vague or ` +
  `duplicated claims, merge the same root cause, separate causes from symptoms, and normalize ` +
  `severity without averaging. Findings from one area often describe the same defect from ` +
  `neighbouring lenses; merge those rather than reporting them twice. Surface every supported ` +
  `non-zero finding. Return Markdown with these sections: Verdict, Action items, Supported ` +
  `findings, and Systemic patterns only when real. Each action item must say what to change, ` +
  `where, why, and the contributing symptom IDs. If nothing is supported, say the change looks ` +
  `clean across all ${findings.length} lenses.`

const report = await agent(synthesisPrompt, {
  label: 'synthesize: distill findings into actionable review',
  phase: 'Synthesize',
  model: 'opus',
  effort: 'high',
})

if (!report || (typeof report === 'string' && !report.trim())) {
  throw new Error('review-swarm-fast synthesis returned no report')
}

return { report, findings, coverage }

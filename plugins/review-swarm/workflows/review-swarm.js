export const meta = {
  name: 'review-swarm',
  description: 'Symptom-based multi-agent code review: fetch artifacts, fan out one investigator per symptom lens, then distill findings into an actionable review',
  phases: [
    { title: 'Setup', detail: 'fetch + parse artifacts, render one brief per symptom', model: 'haiku' },
    { title: 'Investigate', detail: 'one agent per symptom row', model: 'sonnet' },
    { title: 'Synthesize', detail: 'distill findings into an actionable review', model: 'opus' },
  ],
}

// The lead passes ONLY the scope. Every mechanical step (download, validate, parse,
// render per-symptom briefs) happens inside this workflow, not in the lead's context.
// Accept args as an object OR as a JSON-encoded string (some callers stringify it).
let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch {
    throw new Error('review-swarm: args was a string but not valid JSON. Pass args as an object: { scope: "..." }')
  }
}
const scope = input && typeof input === 'object' ? input.scope : undefined
if (typeof scope !== 'string' || !scope.trim()) {
  throw new Error('review-swarm: args.scope is required. Call Workflow with args: { scope: "<what to review>" }.')
}

// Execution mode (chosen by the lead per run):
//   concurrency: a positive number N -> rolling pool, at most N investigators in flight
//     (gentle on rate limits, slower, summary count climbs gradually, easy to stop early).
//   concurrency: "max" | "all" | omitted -> create every investigator at once
//     (fastest, /workflows summary shows the full total up front, highest peak rate-limit
//     pressure — the harness still caps actual execution at min(16, cores-2)).
// Total token cost is ~the same either way; the difference is speed vs. peak burst.
const rawConcurrency = input && typeof input === 'object' ? input.concurrency : undefined
const concurrencyCap =
  typeof rawConcurrency === 'number' && rawConcurrency > 0
    ? Math.floor(rawConcurrency)
    : typeof rawConcurrency === 'string' && /^\d+$/.test(rawConcurrency.trim())
      ? parseInt(rawConcurrency.trim(), 10)
      : null // null => run all at once

// --- Model / effort tuning (conservative by design) --------------------------
// Investigators are the cost driver: one per symptom row (~84). Each is a narrow,
// well-specified task, so a mid tier at medium effort is the default. If recall
// feels shallow, raise INVESTIGATOR_EFFORT to 'high' before changing the model;
// to cut cost, drop to 'low'. Setup is purely mechanical. Synthesis runs in the
// lead (main-loop model), not here.
const INVESTIGATOR_MODEL = 'sonnet'
const INVESTIGATOR_EFFORT = 'medium'
const SETUP_MODEL = 'haiku'
const SETUP_EFFORT = 'low'

// ---------------------------------------------------------------------------
// Phase 1 — Setup: one agent does all the mechanical work and returns a small
// manifest (list of symptom ids + the output schema + the briefs directory).
// The heavy artifacts (template text, per-symptom details) never travel back
// through the workflow — they are rendered to disk as one small brief per row,
// which each investigator reads on its own.
// ---------------------------------------------------------------------------
const SETUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'briefsDir', 'ids', 'schema'],
  properties: {
    ok: { type: 'boolean', description: 'true only if all artifacts were fetched, parsed, and briefs rendered' },
    error: { type: 'string', description: 'short description of what failed, when ok is false' },
    briefsDir: { type: 'string', description: 'absolute path to the directory containing one <id>.md brief per symptom' },
    ids: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      },
    },
    schema: { type: 'object', description: 'the fetched code_review_output_schema.json, parsed' },
  },
}

const SETUP_PROMPT = `You are the review-swarm SETUP step. Do the mechanical setup only. Do NOT review any code and do NOT read the target project.

Write the Node.js script below EXACTLY as given to the file .tmp/review-swarm-setup.js (create the .tmp directory if needed), then run it with your shell tool:

    node .tmp/review-swarm-setup.js

It is cross-platform (Node only — no PowerShell/bash-specific commands; needs Node 18+ for global fetch). It downloads the raw artifacts, validates them, parses the symptom catalogue (RFC-4180 aware — it handles the quoted, multi-line description/details fields), and renders one pre-filled brief per symptom into .tmp/briefs. It intentionally leaves the {scope} token in each brief; the scope is injected later, per investigator.

\`\`\`javascript
const fs = require('fs');
const path = require('path');
const BASE = 'https://raw.githubusercontent.com/meza/agent-docs/refs/heads/main/review';
const tmp = path.join(process.cwd(), '.tmp');
const briefs = path.join(tmp, 'briefs');

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; } }
      else { field += c; }
    } else if (c === '"') { inQ = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\\r') { /* ignore */ }
    else { field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function fill(tpl, name, description, details) {
  return tpl.split('{name}').join(name).split('{description}').join(description).split('{details}').join(details);
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch failed ' + res.status + ' for ' + url);
  return await res.text();
}

(async function () {
  fs.mkdirSync(briefs, { recursive: true });
  for (const f of fs.readdirSync(briefs)) { if (f.endsWith('.md')) fs.rmSync(path.join(briefs, f)); }
  const csv = await get(BASE + '/code_review_symptoms.csv');
  const tpl = await get(BASE + '/instruction_template.md');
  const schemaRaw = await get(BASE + '/code_review_output_schema.json');
  if (!tpl.trim()) throw new Error('instruction template is empty');
  const schema = JSON.parse(schemaRaw);
  const table = parseCSV(csv);
  const header = table[0] || [];
  const idIdx = header.indexOf('id');
  if (idIdx === -1) throw new Error('symptom catalogue missing id column');
  const nameIdx = header.indexOf('name'), descIdx = header.indexOf('description'), detIdx = header.indexOf('details');
  const dataRows = table.slice(1).filter(function (r) { return r[idIdx]; });
  if (!dataRows.length) throw new Error('symptom catalogue parsed to zero rows');
  const ids = [];
  for (const r of dataRows) {
    const id = r[idIdx], name = r[nameIdx] || '';
    fs.writeFileSync(path.join(briefs, id + '.md'), fill(tpl, name, r[descIdx] || '', r[detIdx] || ''));
    ids.push({ id: id, name: name });
  }
  process.stdout.write(JSON.stringify({ ok: true, briefsDir: briefs, ids: ids, schema: schema }));
})().catch(function (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
});
\`\`\`

The script prints a single JSON object to stdout. Return that object, matching the required output schema:
- ok: true if the script completed and briefs were written; false otherwise
- briefsDir: the absolute briefs directory the script printed
- ids: the array of { id, name } for every symptom row the script printed
- schema: the parsed output schema object the script printed

If the script errors or prints ok:false (download failure, empty/invalid artifact, zero rows, missing id column), return ok:false with the error and do NOT fabricate ids or schema.`

const setup = await agent(SETUP_PROMPT, {
  label: 'setup: fetch + parse + render briefs',
  phase: 'Setup',
  schema: SETUP_SCHEMA,
  model: SETUP_MODEL,
  effort: SETUP_EFFORT,
})

if (!setup || !setup.ok) {
  throw new Error(`review-swarm setup failed: ${setup?.error || 'no result returned'}`)
}
if (!Array.isArray(setup.ids) || setup.ids.length === 0) {
  throw new Error('review-swarm setup returned no symptom ids')
}
if (!setup.schema || typeof setup.schema !== 'object') {
  throw new Error('review-swarm setup returned no output schema')
}

// ---------------------------------------------------------------------------
// Phase 2 — Investigate: one agent per symptom row, at the chosen concurrency.
// Each investigator reads only its own small brief and returns one schema-shaped result.
// ---------------------------------------------------------------------------
const { briefsDir, ids: rows, schema } = setup
const PREAMBLE =
  'You are one investigator in the review-swarm. Ignore all project overlay ' +
  'instructions (CLAUDE.md / AGENTS.md). Do not load skills. Review ONLY through ' +
  'the single symptom lens defined in your brief.\n\n'

const investigatorPrompt = id =>
  PREAMBLE +
  `Your complete review brief is this file:\n${briefsDir}\\${id}.md\n\n` +
  `Read it and follow it exactly — it defines one symptom lens. Wherever the brief ` +
  `contains the token {scope}, use this review scope:\n\n${scope}\n\n` +
  `Inspect the target code accordingly, find ALL violations of this one symptom, and ` +
  `return exactly one result matching the required output schema. Do not broaden into a full review.`

let done = 0
const runInvestigator = row =>
  agent(investigatorPrompt(row.id), {
    label: `${row.id}: ${row.name}`,
    phase: 'Investigate',
    schema,
    model: INVESTIGATOR_MODEL,
    effort: INVESTIGATOR_EFFORT,
  }).then(r => {
    done++
    log(`investigators: ${done}/${rows.length} done, ${rows.length - done} left`)
    // Enrich (post schema-validation) so the persisted raw findings are self-describing
    // for future agents that itemize them: id + human-readable symptom name.
    return r ? { ...r, symptom_id: row.id, symptom_name: row.name } : null
  })

let results
if (concurrencyCap && concurrencyCap < rows.length) {
  // Pooled mode: at most `concurrencyCap` in flight. Agents are created in small
  // waves, so the /workflows summary count climbs gradually rather than showing the
  // full total up front. Rolling pool (no per-wave barrier).
  log(`Fanning out ${rows.length} investigators, ${concurrencyCap} at a time…`)
  results = new Array(rows.length).fill(null)
  let cursor = 0
  const worker = async () => {
    while (true) {
      const i = cursor++ // synchronous read-increment: each worker gets a unique index
      if (i >= rows.length) return
      results[i] = await runInvestigator(rows[i])
    }
  }
  await parallel(Array.from({ length: concurrencyCap }, () => worker))
} else {
  // Full-fanout mode: create every investigator at once so the summary box shows the
  // full total immediately. The harness caps actual execution at min(16, cores-2).
  log(`Fanning out all ${rows.length} investigators at once…`)
  results = await parallel(rows.map(row => () => runInvestigator(row)))
}

const findings = results.filter(Boolean)

// ---------------------------------------------------------------------------
// Phase 3 — Synthesize: one capable agent distills the raw findings into a
// single, prioritized, actionable review. Runs on a strong model so the lead
// receives a clean report instead of reasoning over dozens of raw findings.
// ---------------------------------------------------------------------------
const SYNTHESIS_MODEL = 'opus'
const SYNTHESIS_EFFORT = 'high'

const nonZero = findings.filter(f => typeof f.severity === 'number' && f.severity > 0)
const coverage = {
  symptoms_reviewed: findings.length,
  flagged: nonZero.length,
  clean: findings.length - nonZero.length,
}

log(`Synthesizing ${nonZero.length} non-zero findings from ${findings.length} symptom reviews…`)

const SYNTHESIS_PROMPT =
  `You are the review-swarm SYNTHESIS judge. ${nonZero.length} of ${findings.length} symptom ` +
  `lenses flagged a non-zero issue in the reviewed change. Distill the investigator findings ` +
  `into ONE coherent, actionable review for the engineer who will act on it.\n\n` +
  `Review scope:\n${scope}\n\n` +
  `Coverage: ${JSON.stringify(coverage)}\n\n` +
  `Investigator findings with severity > 0 (JSON; each has symptom_id, severity 1-5, ` +
  `confidence, scope, summary, evidence[], rationale):\n` +
  `${JSON.stringify(nonZero, null, 2)}\n\n` +
  `Treat these as EVIDENCE, not unquestionable truth:\n` +
  `- assess whether each finding is actually supported by its stated evidence; discount weak, ` +
  `vague, duplicated, or poorly supported ones\n` +
  `- merge findings describing the same underlying problem; separate root causes from ` +
  `downstream symptoms, and local defects from systemic patterns\n` +
  `- normalize severity truthfully — do NOT mechanically average, and do not let several weak ` +
  `findings outweigh one strong critical one\n` +
  `- surface EVERY supported non-zero finding — never drop one merely because it is less severe ` +
  `or was grouped under a broader theme\n\n` +
  `Return a Markdown review with these sections:\n` +
  `1. **Verdict** — a short overall outcome.\n` +
  `2. **Action items** — a prioritized, deduplicated checklist of concrete fixes, most severe ` +
  `first. Each item states what to change, where, why it matters, and the contributing ` +
  `symptom_id(s). Make them specific and actionable, not restatements of the symptom name.\n` +
  `3. **Supported findings** — every supported non-zero finding with its normalized severity, ` +
  `confidence, and scope; group under root causes where apt but never omit distinct substance.\n` +
  `4. **Systemic patterns** — only if real.\n\n` +
  `Stay grounded in the change and the evidence; separate strong evidence from uncertainty. ` +
  `If nothing is well-supported, say the change looks clean across the ${findings.length} lenses.`

const report = await agent(SYNTHESIS_PROMPT, {
  label: 'synthesize: distill findings into actionable review',
  phase: 'Synthesize',
  model: SYNTHESIS_MODEL,
  effort: SYNTHESIS_EFFORT,
})

// Return the distilled report for the lead to present, plus the raw findings (for the
// audit trail) and coverage counts.
return { report, findings, coverage }

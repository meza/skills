import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../..')
const checker = join(repoRoot, '.github/scripts/check-plugins.mjs')

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'skill-layout-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, content = '') => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  for (const path of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
    write(path, readFileSync(join(repoRoot, path)))
  }
  for (const name of ['review-swarm', 'review-swarm-fast', 'skill-creator']) {
    for (const file of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'package.json']) {
      const path = `plugins/${name}/${file}`
      write(path, readFileSync(join(repoRoot, path)))
    }
    if (name === 'skill-creator') {
      write(`plugins/${name}/skills/skill-creator/eval-viewer/dist/index.html`)
      write(`plugins/${name}/skills/skill-creator/eval-viewer/dist/server/main.js`)
      continue
    }
    for (const file of [
      `claude/skills/${name}/SKILL.md`, 'claude/hooks/hooks.json',
      'claude/scripts/install-workflow.js', `claude/workflows/${name}.js`,
      `codex/skills/${name}/SKILL.md`, 'shared/code_review_output_schema.json',
      `shared/${name}.mjs`,
      ...(name === 'review-swarm'
        ? ['shared/code_review_symptoms.csv', 'shared/instruction_template.md']
        : ['shared/code_review_symptom_groups.csv', 'shared/group_instruction_template.md']),
    ]) write(`plugins/${name}/${file}`)
  }
  write('skills/example/SKILL.md', '---\nname: example\ndescription: Example skill\n---\n')
  return { root, write }
}

function check(root) {
  const result = spawnSync(process.execPath, [checker, root], { encoding: 'utf8' })
  assert.equal(result.error, undefined)
  return { status: result.status, output: result.stdout + result.stderr }
}

test('accepts direct standalone skills alongside retained plugin runtimes', t => {
  const { root } = fixture(t)
  const result = check(root)
  assert.equal(result.status, 0, result.output)
})

test('rejects a nested skill instead of a direct SKILL.md', t => {
  const { root, write } = fixture(t)
  rmSync(join(root, 'skills/example/SKILL.md'))
  write('skills/example/skills/example/SKILL.md', '---\nname: example\n---\n')
  const result = check(root)
  assert.equal(result.status, 1)
  assert.match(result.output, /standalone skill must contain a direct SKILL.md/)
})

test('rejects missing or mismatched frontmatter names', t => {
  const { root, write } = fixture(t)
  for (const content of ['# Example\n', '---\nname: another\n---\n']) {
    write('skills/example/SKILL.md', content)
    const result = check(root)
    assert.equal(result.status, 1)
    assert.match(result.output, /frontmatter name must match its directory/)
  }
})

test('rejects plugin and release wrappers in standalone skill roots', t => {
  const { root, write } = fixture(t)
  for (const path of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'package.json', '.releaserc.cjs']) {
    write(`skills/example/${path}`, '{}')
  }
  const result = check(root)
  assert.equal(result.status, 1)
  for (const wrapper of ['.claude-plugin', '.codex-plugin', 'package.json', '.releaserc.cjs']) {
    assert.ok(result.output.includes(`must not contain plugin wrapper ${wrapper}`), result.output)
  }
})

test('rejects an obsolete plugin directory for a standalone skill', t => {
  const { root, write } = fixture(t)
  write('plugins/example/.claude-plugin/plugin.json', '{}')
  const result = check(root)
  assert.equal(result.status, 1)
  assert.match(result.output, /standalone skill must not retain a plugins\/ wrapper/)
})

test('rejects a standalone skill listed in plugin marketplaces', t => {
  const { root, write } = fixture(t)
  for (const [path, host] of [
    ['.claude-plugin/marketplace.json', 'claude'],
    ['.agents/plugins/marketplace.json', 'codex'],
  ]) {
    const marketplace = JSON.parse(readFileSync(join(root, path), 'utf8'))
    const entry = structuredClone(marketplace.plugins[0])
    entry.name = 'example'
    entry.source = host === 'claude' ? './skills/example' : { source: 'local', path: './skills/example' }
    marketplace.plugins.push(entry)
    write(path, JSON.stringify(marketplace))
    write(`skills/example/.${host}-plugin/plugin.json`, JSON.stringify({
      name: 'example', version: '1.0.0', description: 'Example',
    }))
  }
  const result = check(root)
  assert.equal(result.status, 1)
  assert.match(result.output, /standalone skill must not be listed in a plugin marketplace/)
})

test('continues to reject retained plugin version and runtime regressions', t => {
  const { root, write } = fixture(t)
  const path = 'plugins/review-swarm/.codex-plugin/plugin.json'
  const manifest = JSON.parse(readFileSync(join(root, path), 'utf8'))
  write(path, JSON.stringify({ ...manifest, version: '99.0.0' }))
  rmSync(join(root, 'plugins/review-swarm/shared/code_review_symptoms.csv'))
  const result = check(root)
  assert.equal(result.status, 1)
  assert.match(result.output, /Claude and Codex manifest versions must match exactly/)
  assert.match(result.output, /review-swarm is missing shared\/code_review_symptoms.csv/)
})

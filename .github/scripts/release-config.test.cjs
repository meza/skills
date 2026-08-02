'use strict'

const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')
const test = require('node:test')

const componentConfig = require('../../.release-plugin.cjs')
const marketplaceConfig = require('../../.releaserc.cjs')
const marketplaceRules = require('../../.release-marketplace-rules.cjs')
const releasePackage = require('../../package.json')

const repoRoot = resolve(__dirname, '../..')

function replacementConfig(config, pluginName) {
  const plugin = config.plugins.find(entry => Array.isArray(entry) && entry[0] === pluginName)
  assert.ok(plugin, `${pluginName} must be configured`)
  return plugin[1]
}

function assertSingleReplacement(replacement, filePath) {
  const content = readFileSync(filePath, 'utf8')
  const pattern = new RegExp(replacement.from, 'gm')
  assert.equal([...content.matchAll(pattern)].length, 1, `${filePath} must match once`)

  const nextVersion = '9.8.7'
  const output = content.replace(
    pattern,
    replacement.to.replace('${nextRelease.version}', nextVersion)
  )
  assert.equal(JSON.parse(output).version ?? JSON.parse(output).metadata?.version, nextVersion)
}

function loadCheckConfig(path) {
  const previous = process.env.SEMANTIC_RELEASE_CHECK
  process.env.SEMANTIC_RELEASE_CHECK = '1'
  delete require.cache[require.resolve(path)]
  const config = require(path)
  delete require.cache[require.resolve(path)]
  if (previous === undefined) delete process.env.SEMANTIC_RELEASE_CHECK
  else process.env.SEMANTIC_RELEASE_CHECK = previous
  return config
}

test('component replacement rules own exactly one host version each', () => {
  const replacements = replacementConfig(
    componentConfig,
    'semantic-release-replace-plugin'
  ).replacements

  for (const plugin of readdirSync(join(repoRoot, 'plugins'), { withFileTypes: true })) {
    if (!plugin.isDirectory()) continue
    const pluginRoot = join(repoRoot, 'plugins', plugin.name)
    for (const replacement of replacements) {
      assertSingleReplacement(replacement, join(pluginRoot, replacement.files[0]))
    }
  }
})

test('component replacement count detects an accidental second version field', () => {
  const [replacement] = replacementConfig(
    componentConfig,
    'semantic-release-replace-plugin'
  ).replacements
  const pattern = new RegExp(replacement.from, 'gm')
  const malformed = '{"version":"1.0.0","nested":{"version":"2.0.0"}}'

  assert.equal([...malformed.matchAll(pattern)].length, 2)
})

test('marketplace replacement targets only metadata.version', () => {
  const [replacement] = replacementConfig(
    marketplaceConfig,
    'semantic-release-replace-plugin'
  ).replacements

  assertSingleReplacement(
    replacement,
    join(repoRoot, '.claude-plugin', 'marketplace.json')
  )
})

test('marketplace releases only for generated plugin release commits', () => {
  assert.deepEqual(marketplaceRules, [
    { type: 'chore', scope: 'plugin-release', release: 'patch' },
    { breaking: true, release: false },
    { revert: true, release: false },
    { type: 'feat', release: false },
    { type: 'fix', release: false },
    { type: 'perf', release: false },
    { type: 'FEAT', release: false },
    { type: 'FIX', release: false },
  ])
})

test('pending release checks direct maintainers to the npm command', () => {
  for (const config of [
    loadCheckConfig('../../.release-plugin.cjs'),
    loadCheckConfig('../../.releaserc.cjs'),
  ]) {
    const exec = replacementConfig(config, '@semantic-release/exec')
    assert.match(exec.verifyReleaseCmd, /Run: npm run release/)
    assert.doesNotMatch(exec.verifyReleaseCmd, /pre-push --release/)
  }
})

test('root package owns only the pinned release toolchain', () => {
  assert.equal(releasePackage.private, true)
  assert.equal(releasePackage.packageManager, 'npm@11.16.0')
  assert.deepEqual(releasePackage.engines, { node: '24.18.0' })
  assert.deepEqual(releasePackage.scripts, {
    release: 'node scripts/release.cjs',
  })
  assert.equal('workspaces' in releasePackage, false)
  assert.equal('version' in releasePackage, false)
  assert.deepEqual(releasePackage.devDependencies, {
    '@semantic-release/changelog': '7.0.0',
    '@semantic-release/commit-analyzer': '13.0.1',
    '@semantic-release/exec': '7.1.0',
    '@semantic-release/git': '11.0.1',
    '@semantic-release/release-notes-generator': '14.1.1',
    'semantic-release': '25.0.8',
    'semantic-release-monorepo': '8.0.2',
    'semantic-release-replace-plugin': '1.2.7',
  })
})

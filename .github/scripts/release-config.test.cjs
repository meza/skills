'use strict'

const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')
const test = require('node:test')

const componentConfig = require('../../.release-plugin.cjs')
const marketplaceConfig = require('../../.releaserc.cjs')
const marketplaceRules = require('../../.release-marketplace-rules.cjs')

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

#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const repoRoot = resolve(process.argv[2] ?? '.')
const errors = []
const fail = message => errors.push(message)
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${label}: cannot read or parse JSON (${error.message})`)
    return null
  }
}

function validateManifest(entryName, sourcePath, manifestDirectory, label) {
  if (sourcePath === './' || sourcePath === '.') {
    fail(`${label}: source must not be the repository root`)
    return null
  }
  if (typeof sourcePath !== 'string' || !sourcePath.startsWith('./')) {
    fail(`${label}: source path must start with "./"`)
    return null
  }

  const pluginDirectory = join(repoRoot, sourcePath)
  if (!existsSync(pluginDirectory) || !statSync(pluginDirectory).isDirectory()) {
    fail(`${label}: source does not resolve to a directory: ${sourcePath}`)
    return null
  }

  const manifestPath = join(pluginDirectory, manifestDirectory, 'plugin.json')
  if (!existsSync(manifestPath)) {
    fail(`${label}: missing ${manifestDirectory}/plugin.json`)
    return null
  }
  const manifest = readJson(manifestPath, `${label} manifest`)
  if (!manifest) return null

  if (manifest.name !== entryName) fail(`${label}: manifest name must match marketplace name`)
  if (manifest.name !== basename(sourcePath)) fail(`${label}: manifest name must match source directory name`)
  if (!semver.test(manifest.version ?? '')) fail(`${label}: manifest version must be valid semver`)
  if (typeof manifest.description !== 'string' || !manifest.description.trim()) {
    fail(`${label}: manifest description is required`)
  }
  return { manifest, pluginDirectory, sourcePath }
}

function validateClaudeMarketplace() {
  const marketplace = readJson(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'Claude marketplace')
  if (!marketplace) return new Map()
  if (!semver.test(marketplace.metadata?.version ?? '')) {
    fail('Claude marketplace: metadata.version must be valid semver')
  }
  if (!Array.isArray(marketplace.plugins)) {
    fail('Claude marketplace: plugins must be an array')
    return new Map()
  }

  const entries = new Map()
  for (const [index, entry] of marketplace.plugins.entries()) {
    const label = `Claude plugins[${index}]${entry?.name ? ` (${entry.name})` : ''}`
    if (!entry?.name) {
      fail(`${label}: name is required`)
      continue
    }
    if (entries.has(entry.name)) fail(`${label}: duplicate plugin name`)
    if ('strict' in entry || 'skills' in entry || 'version' in entry) {
      fail(`${label}: component paths and version belong in plugin.json`)
    }
    const validated = validateManifest(entry.name, entry.source, '.claude-plugin', label)
    if (validated) entries.set(entry.name, validated)
  }
  return entries
}

function validateCodexMarketplace() {
  const marketplace = readJson(join(repoRoot, '.agents', 'plugins', 'marketplace.json'), 'Codex marketplace')
  if (!marketplace) return new Map()
  if (!Array.isArray(marketplace.plugins)) {
    fail('Codex marketplace: plugins must be an array')
    return new Map()
  }

  const entries = new Map()
  const installationPolicies = new Set(['NOT_AVAILABLE', 'AVAILABLE', 'INSTALLED_BY_DEFAULT'])
  const authenticationPolicies = new Set(['ON_INSTALL', 'ON_USE'])

  for (const [index, entry] of marketplace.plugins.entries()) {
    const label = `Codex plugins[${index}]${entry?.name ? ` (${entry.name})` : ''}`
    if (!entry?.name) {
      fail(`${label}: name is required`)
      continue
    }
    if (entries.has(entry.name)) fail(`${label}: duplicate plugin name`)
    if (entry.source?.source !== 'local' || typeof entry.source?.path !== 'string') {
      fail(`${label}: source must be a local path object`)
      continue
    }
    if (!installationPolicies.has(entry.policy?.installation)) {
      fail(`${label}: invalid or missing policy.installation`)
    }
    if (!authenticationPolicies.has(entry.policy?.authentication)) {
      fail(`${label}: invalid or missing policy.authentication`)
    }
    if (typeof entry.category !== 'string' || !entry.category.trim()) {
      fail(`${label}: category is required`)
    }

    const validated = validateManifest(entry.name, entry.source.path, '.codex-plugin', label)
    if (validated) entries.set(entry.name, validated)
  }
  return entries
}

function validateReviewSwarm(claudeEntries, codexEntries) {
  const claude = claudeEntries.get('review-swarm')
  const codex = codexEntries.get('review-swarm')
  if (!claude) fail('review-swarm must be listed in the Claude marketplace')
  if (!codex) fail('review-swarm must be listed in the Codex marketplace')
  if (!claude || !codex) return

  if (claude.sourcePath !== './plugins/review-swarm' || codex.sourcePath !== './plugins/review-swarm') {
    fail('review-swarm marketplace entries must share ./plugins/review-swarm')
  }
  if (claude.manifest.version !== codex.manifest.version) {
    fail('review-swarm Claude and Codex manifest versions must match')
  }
  if (claude.manifest.skills !== './claude/skills/' || claude.manifest.hooks !== './claude/hooks/hooks.json') {
    fail('review-swarm Claude manifest must use explicit ./claude component paths')
  }
  if (codex.manifest.skills !== './codex/skills/') {
    fail('review-swarm Codex manifest must use explicit ./codex/skills/')
  }
  if ('hooks' in codex.manifest) fail('review-swarm Codex manifest must not declare hooks')

  const pluginDirectory = claude.pluginDirectory
  for (const forbidden of ['skills', 'hooks']) {
    if (existsSync(join(pluginDirectory, forbidden))) {
      fail(`review-swarm must not contain a root-level ${forbidden}/ directory`)
    }
  }
  for (const required of [
    'claude/skills/review-swarm/SKILL.md',
    'claude/hooks/hooks.json',
    'claude/scripts/install-workflow.js',
    'claude/workflows/review-swarm.js',
    'codex/skills/review-swarm/SKILL.md',
    'shared/code_review_symptoms.csv',
    'shared/instruction_template.md',
    'shared/code_review_output_schema.json',
    'shared/review-swarm.mjs',
  ]) {
    if (!existsSync(join(pluginDirectory, required))) fail(`review-swarm is missing ${required}`)
  }
}

const claudeEntries = validateClaudeMarketplace()
const codexEntries = validateCodexMarketplace()
validateReviewSwarm(claudeEntries, codexEntries)

if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n`)
  for (const error of errors) console.error(`  - ${error}`)
  console.error('')
  process.exit(1)
}

console.log('plugin invariants passed')

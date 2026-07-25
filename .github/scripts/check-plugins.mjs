#!/usr/bin/env node
// Marketplace invariants that `claude plugin validate` does not cover.
//
// Verified against CLI 2.1.104: pointing the validator at a marketplace root does NOT
// recurse into each plugin's plugin.json, and does NOT check that a plugin `source`
// resolves to a directory that exists. A marketplace listing a plugin with a wrong name,
// a non-semver version, and a source pointing at nothing passes with exit 0. This script
// covers that gap; the workflow runs the CLI too, for schema errors we don't re-implement.

import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'

const repoRoot = resolve(process.argv[2] ?? '.')
const errors = []
const fail = (msg) => errors.push(msg)

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    fail(`${label}: cannot read/parse (${e.message})`)
    return null
  }
}

const marketplacePath = join(repoRoot, '.claude-plugin', 'marketplace.json')
const marketplace = readJson(marketplacePath, '.claude-plugin/marketplace.json')

// SemVer core (major.minor.patch) with optional pre-release/build. The plugin cache is
// keyed by this exact string, so it must be filesystem-clean and unambiguous.
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/

if (marketplace) {
  if (!Array.isArray(marketplace.plugins)) {
    fail('marketplace.json: "plugins" must be an array')
  } else {
    const seen = new Set()

    for (const [i, entry] of marketplace.plugins.entries()) {
      const at = `plugins[${i}]${entry?.name ? ` (${entry.name})` : ''}`

      if (!entry?.name) {
        fail(`${at}: missing "name"`)
        continue
      }
      if (seen.has(entry.name)) fail(`${at}: duplicate plugin name`)
      seen.add(entry.name)

      // Regression guards. These are the exact shapes this restructure removed: a
      // root source copies the whole repo into every user's cache, and strict/skills
      // exist only to let the entry stand in for a missing plugin.json.
      if (entry.source === './' || entry.source === '.') {
        fail(`${at}: source "${entry.source}" is the repo root — every install would copy the entire repo. Point it at the plugin's own directory.`)
        continue
      }
      if ('strict' in entry) fail(`${at}: remove "strict" — the plugin's own plugin.json is the manifest`)
      if ('skills' in entry) fail(`${at}: remove "skills" — rely on the plugin's own directory layout`)
      if ('version' in entry) fail(`${at}: remove "version" — plugin.json owns the version, so two sources cannot drift`)

      if (typeof entry.source !== 'string' || !entry.source.startsWith('./')) {
        fail(`${at}: source must be a relative path starting with "./" (got ${JSON.stringify(entry.source)})`)
        continue
      }

      const pluginDir = join(repoRoot, entry.source)
      if (!existsSync(pluginDir) || !statSync(pluginDir).isDirectory()) {
        fail(`${at}: source "${entry.source}" does not exist`)
        continue
      }

      const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json')
      if (!existsSync(manifestPath)) {
        fail(`${at}: missing ${entry.source}/.claude-plugin/plugin.json`)
        continue
      }

      const manifest = readJson(manifestPath, `${at} plugin.json`)
      if (!manifest) continue

      if (manifest.name !== entry.name) {
        fail(`${at}: plugin.json name "${manifest.name}" != marketplace entry name "${entry.name}"`)
      }
      if (manifest.name !== basename(entry.source)) {
        fail(`${at}: plugin.json name "${manifest.name}" != directory name "${basename(entry.source)}"`)
      }
      if (!manifest.version) {
        fail(`${at}: plugin.json has no "version" — without it the plugin keys on the repo commit SHA, so every unrelated commit re-downloads it`)
      } else if (!SEMVER.test(manifest.version)) {
        fail(`${at}: plugin.json version "${manifest.version}" is not valid semver`)
      }
      if (!manifest.description) fail(`${at}: plugin.json has no "description"`)
    }
  }
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n`)
  for (const e of errors) console.error(`  ✘ ${e}`)
  console.error('')
  process.exit(1)
}

console.log('✔ plugin invariants passed')

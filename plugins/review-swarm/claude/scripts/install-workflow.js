#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

try {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..')
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const source = path.join(pluginRoot, 'claude', 'workflows', 'review-swarm.js')
  const destinationDirectory = path.join(configDir, 'workflows')
  const destination = path.join(destinationDirectory, 'review-swarm.js')
  const sourceContent = fs.readFileSync(source, 'utf8')

  let installedContent = null
  try {
    installedContent = fs.readFileSync(destination, 'utf8')
  } catch {
    // A missing destination is the normal first-install state.
  }

  if (installedContent !== sourceContent) {
    fs.mkdirSync(destinationDirectory, { recursive: true })
    fs.writeFileSync(destination, sourceContent)
    process.stderr.write(`[review-swarm] installed workflow -> ${destination}\n`)
  }
} catch (error) {
  // Session startup remains usable because the skill can invoke the bundled path directly.
  process.stderr.write(`[review-swarm] workflow install skipped: ${error && error.message}\n`)
}

process.exit(0)

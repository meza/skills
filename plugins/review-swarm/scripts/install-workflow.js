#!/usr/bin/env node
// SessionStart hook: install the bundled review-swarm workflow into the user's canonical
// workflows directory (~/.claude/workflows/) so it registers by name and shows in /workflows.
//
// This makes `Workflow({ name: "review-swarm" })` resolve. It is idempotent (only rewrites
// when the content differs, so it stays fresh across plugin updates) and non-fatal: if
// anything goes wrong the session still starts, and the skill can fall back to launching the
// bundled workflow directly via scriptPath.
//
// CLAUDE_PLUGIN_ROOT is exported to hook processes by Claude Code. CLAUDE_CONFIG_DIR, when
// set, relocates ~/.claude — honor it so the workflow lands where Claude actually looks.

const fs = require('fs')
const os = require('os')
const path = require('path')

try {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..')
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')

  const src = path.join(pluginRoot, 'workflows', 'review-swarm.js')
  const destDir = path.join(configDir, 'workflows')
  const dest = path.join(destDir, 'review-swarm.js')

  const srcContent = fs.readFileSync(src, 'utf8')
  let current = null
  try {
    current = fs.readFileSync(dest, 'utf8')
  } catch {
    /* dest missing — will create */
  }

  if (current !== srcContent) {
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(dest, srcContent)
    process.stderr.write(`[review-swarm] installed workflow -> ${dest}\n`)
  }
} catch (e) {
  // Never block the session; the skill's scriptPath fallback still works.
  process.stderr.write(`[review-swarm] workflow install skipped: ${e && e.message}\n`)
}

process.exit(0)

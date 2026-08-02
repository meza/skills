'use strict'

const { existsSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const INTERNAL_PUSH = 'SEMANTIC_RELEASE_INTERNAL_PUSH'
const repoRoot = resolve(__dirname, '..')

function semanticReleaseExecutable(root, platform) {
  const name = platform === 'win32' ? 'semantic-release.cmd' : 'semantic-release'
  return join(root, 'node_modules', '.bin', name)
}

function pluginDirectories(root) {
  const pluginsRoot = join(root, 'plugins')

  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(pluginsRoot, entry.name))
    .filter(directory => existsSync(join(directory, '.releaserc.cjs')))
    .sort()
}

function runSemanticRelease(spawn, executable, cwd, args, env, platform, reportError) {
  const windows = platform === 'win32'
  const command = windows ? env.ComSpec || 'cmd.exe' : executable
  const commandArgs = windows
    ? ['/d', '/s', '/c', `call "${executable}" ${args.join(' ')}`]
    : args
  const result = spawn(command, commandArgs, {
    cwd,
    env,
    stdio: 'inherit',
    shell: false,
    windowsVerbatimArguments: windows,
  })

  if (result.error) {
    reportError(`Unable to run ${executable}: ${result.error.message}`)
    return 1
  }

  return result.status ?? 1
}

function runReleases({
  args,
  env,
  platform = process.platform,
  spawn = spawnSync,
  root = repoRoot,
  reportError = console.error,
}) {
  const executable = semanticReleaseExecutable(root, platform)
  if (!existsSync(executable)) {
    reportError('Release toolchain is missing. Run npm ci from the repository root.')
    return 1
  }

  for (const directory of pluginDirectories(root)) {
    const status = runSemanticRelease(
      spawn,
      executable,
      directory,
      args,
      env,
      platform,
      reportError
    )
    if (status !== 0) return status
  }

  return runSemanticRelease(
    spawn,
    executable,
    root,
    args,
    env,
    platform,
    reportError
  )
}

/**
 * Checks every component for a pending release without changing repository state.
 * Components run sequentially and the aggregate marketplace check runs last.
 */
function checkReleases({ env = process.env, ...options } = {}) {
  return runReleases({
    ...options,
    args: ['--dry-run', '--no-ci'],
    env: { ...env, SEMANTIC_RELEASE_CHECK: '1' },
  })
}

/**
 * Publishes every pending component release before publishing the marketplace.
 * Child pushes carry a guard so the pre-push hook does not recurse.
 */
function publishReleases({ env = process.env, ...options } = {}) {
  return runReleases({
    ...options,
    args: ['--no-ci'],
    env: { ...env, [INTERNAL_PUSH]: '1' },
  })
}

if (require.main === module) process.exitCode = publishReleases()

module.exports = {
  INTERNAL_PUSH,
  checkReleases,
  pluginDirectories,
  publishReleases,
  semanticReleaseExecutable,
}

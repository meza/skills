'use strict'

const assert = require('node:assert/strict')
const {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs')
const { tmpdir } = require('node:os')
const { basename, join } = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const {
  INTERNAL_PUSH,
  checkReleases,
  pluginDirectories,
  publishReleases,
  semanticReleaseExecutable,
} = require('./release.cjs')

const repoRoot = require('node:path').resolve(__dirname, '..')

test('selects the repository-local semantic-release shim', () => {
  assert.equal(
    semanticReleaseExecutable(repoRoot, 'win32'),
    join(repoRoot, 'node_modules', '.bin', 'semantic-release.cmd')
  )
  assert.equal(
    semanticReleaseExecutable(repoRoot, 'linux'),
    join(repoRoot, 'node_modules', '.bin', 'semantic-release')
  )
  assert.equal(
    semanticReleaseExecutable(repoRoot, 'darwin'),
    join(repoRoot, 'node_modules', '.bin', 'semantic-release')
  )
})

test('native platform dispatch publishes components in order', t => {
  const root = mkdtempSync(join(tmpdir(), 'semantic release script-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const scripts = join(root, 'scripts')
  const bin = join(root, 'node_modules', '.bin')
  const log = join(root, 'calls.ndjson')
  const stub = join(bin, 'stub.cjs')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(bin, { recursive: true })
  for (const name of ['zeta', 'alpha']) {
    const directory = join(root, 'plugins', name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, '.releaserc.cjs'), '')
  }
  copyFileSync(join(__dirname, 'release.cjs'), join(scripts, 'release.cjs'))
  writeFileSync(
    stub,
    "const fs = require('node:fs'); fs.appendFileSync(process.env.SEMANTIC_RELEASE_TEST_LOG, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2), guard: process.env.SEMANTIC_RELEASE_INTERNAL_PUSH }) + '\\n')\n"
  )

  if (process.platform === 'win32') {
    writeFileSync(
      join(bin, 'semantic-release.cmd'),
      '@echo off\r\n"%SEMANTIC_RELEASE_TEST_NODE%" "%SEMANTIC_RELEASE_TEST_STUB%" %*\r\n'
    )
  } else {
    const executable = join(bin, 'semantic-release')
    writeFileSync(
      executable,
      `#!${process.execPath}\nrequire(${JSON.stringify(stub)})\n`
    )
    chmodSync(executable, 0o755)
  }

  const result = spawnSync(process.execPath, [join(scripts, 'release.cjs')], {
    cwd: root,
    env: {
      ...process.env,
      SEMANTIC_RELEASE_TEST_LOG: log,
      SEMANTIC_RELEASE_TEST_NODE: process.execPath,
      SEMANTIC_RELEASE_TEST_STUB: stub,
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(calls.map(call => basename(call.cwd)), ['alpha', 'zeta', basename(root)])
  assert.ok(calls.every(call => call.argv.join(' ') === '--no-ci'))
  assert.ok(calls.every(call => call.guard === '1'))
})

test('discovers configured components in stable order', () => {
  assert.deepEqual(
    pluginDirectories(repoRoot).map(directory => basename(directory)),
    [
      'addressing-code-review-findings',
      'conventional-commit-message',
      'fixing-linter-violations',
      'review-swarm',
      'review-swarm-fast',
      'skill-creator',
    ]
  )
})

test('checks every component before the marketplace', () => {
  const calls = []
  const spawn = (executable, args, options) => {
    calls.push({ executable, args, options })
    return { status: 0 }
  }

  assert.equal(checkReleases({ env: {}, platform: 'linux', root: repoRoot, spawn }), 0)
  assert.equal(calls.length, 7)
  assert.deepEqual(calls.slice(0, 6).map(call => basename(call.options.cwd)), [
    'addressing-code-review-findings',
    'conventional-commit-message',
    'fixing-linter-violations',
    'review-swarm',
    'review-swarm-fast',
    'skill-creator',
  ])
  assert.equal(calls[6].options.cwd, repoRoot)
  assert.ok(calls.every(call => call.args.includes('--dry-run')))
  assert.ok(calls.every(call => call.options.env.SEMANTIC_RELEASE_CHECK === '1'))
  assert.ok(calls.every(call => call.options.shell === false))
})

test('publishes with a recursion guard and runs the marketplace last', () => {
  const calls = []
  const spawn = (executable, args, options) => {
    calls.push({ executable, args, options })
    return { status: 0 }
  }

  assert.equal(
    publishReleases({ env: {}, platform: 'win32', root: repoRoot, spawn }),
    0
  )
  assert.equal(calls.length, 7)
  assert.ok(calls.every(call => call.executable === 'cmd.exe'))
  assert.ok(calls.every(call => call.args[3].includes('semantic-release.cmd')))
  assert.ok(calls.every(call => !call.args[3].includes('--dry-run')))
  assert.ok(calls.every(call => call.options.env[INTERNAL_PUSH] === '1'))
  assert.ok(calls.every(call => call.options.shell === false))
  assert.ok(calls.every(call => call.options.windowsVerbatimArguments === true))
  assert.equal(calls[6].options.cwd, repoRoot)
})

test('reports how to install a missing release toolchain', () => {
  const root = mkdtempSync(join(tmpdir(), 'semantic-release-missing-'))
  try {
    mkdirSync(join(root, 'plugins'), { recursive: true })
    let called = false
    const errors = []
    const status = checkReleases({
      env: {},
      platform: 'linux',
      root,
      spawn: () => {
        called = true
        return { status: 0 }
      },
      reportError: message => errors.push(message),
    })

    assert.equal(status, 1)
    assert.equal(called, false)
    assert.deepEqual(errors, [
      'Release toolchain is missing. Run npm ci from the repository root.',
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('stops at the first failed component and propagates its status', () => {
  let calls = 0
  const status = checkReleases({
    env: {},
    root: repoRoot,
    spawn: () => {
      calls += 1
      return { status: calls === 2 ? 7 : 0 }
    },
  })

  assert.equal(status, 7)
  assert.equal(calls, 2)
})

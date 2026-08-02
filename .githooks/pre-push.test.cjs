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
const { basename, delimiter, join } = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const {
  INTERNAL_PUSH,
  pluginDirectories,
  run,
  semanticReleaseExecutable,
} = require('./pre-push')

const repoRoot = require('node:path').resolve(__dirname, '..')

test('selects the platform semantic-release shim', () => {
  assert.equal(semanticReleaseExecutable('win32'), 'semantic-release.cmd')
  assert.equal(semanticReleaseExecutable('linux'), 'semantic-release')
  assert.equal(semanticReleaseExecutable('darwin'), 'semantic-release')
})

test('native platform dispatch executes a stub in component order', t => {
  const root = mkdtempSync(join(tmpdir(), 'semantic-release-hook-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const hooks = join(root, '.githooks')
  const bin = join(root, 'bin')
  const log = join(root, 'calls.ndjson')
  const stub = join(bin, 'stub.cjs')
  mkdirSync(hooks, { recursive: true })
  mkdirSync(bin, { recursive: true })
  for (const name of ['zeta', 'alpha']) {
    const directory = join(root, 'plugins', name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, '.releaserc.cjs'), '')
  }
  copyFileSync(join(__dirname, 'pre-push'), join(hooks, 'pre-push'))
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

  const result = spawnSync(process.execPath, [join(hooks, 'pre-push'), '--release'], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
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
      'conventional-commit-message',
      'review-swarm',
      'review-swarm-fast',
      'skill-creator',
    ]
  )
})

test('dry-run checks every component before the marketplace', () => {
  const calls = []
  const spawn = (executable, args, options) => {
    calls.push({ executable, args, options })
    return { status: 0 }
  }

  assert.equal(run({ env: {}, platform: 'linux', root: repoRoot, spawn }), 0)
  assert.equal(calls.length, 5)
  assert.deepEqual(calls.slice(0, 4).map(call => basename(call.options.cwd)), [
    'conventional-commit-message',
    'review-swarm',
    'review-swarm-fast',
    'skill-creator',
  ])
  assert.equal(calls[4].options.cwd, repoRoot)
  assert.ok(calls.every(call => call.args.includes('--dry-run')))
  assert.ok(calls.every(call => call.options.shell === false))
})

test('release mode guards nested pushes and runs the marketplace last', () => {
  const calls = []
  const spawn = (executable, args, options) => {
    calls.push({ executable, args, options })
    return { status: 0 }
  }

  assert.equal(
    run({
      argv: ['--release'],
      env: {},
      platform: 'win32',
      root: repoRoot,
      spawn,
    }),
    0
  )
  assert.equal(calls.length, 5)
  assert.ok(calls.every(call => call.executable === 'cmd.exe'))
  assert.ok(calls.every(call => call.args[3].startsWith('semantic-release.cmd ')))
  assert.ok(calls.every(call => !call.args[3].includes('--dry-run')))
  assert.ok(calls.every(call => call.options.env[INTERNAL_PUSH] === '1'))
  assert.ok(calls.every(call => call.options.shell === false))
  assert.equal(calls[4].options.cwd, repoRoot)
})

test('the recursion guard exits without invoking semantic-release', () => {
  let called = false
  const status = run({
    env: { [INTERNAL_PUSH]: '1' },
    root: repoRoot,
    spawn: () => {
      called = true
      return { status: 0 }
    },
  })

  assert.equal(status, 0)
  assert.equal(called, false)
})

test('stops at the first failed component and propagates its status', () => {
  let calls = 0
  const status = run({
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

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { INTERNAL_PUSH } = require('../scripts/release.cjs')
const { run } = require('./pre-push')

test('ordinary pushes delegate to the release check', () => {
  const env = { EXAMPLE: 'value' }
  let received

  assert.equal(run({ env, check: options => { received = options; return 7 } }), 7)
  assert.deepEqual(received, { env })
})

test('semantic-release pushes skip the release check', () => {
  let called = false
  const status = run({
    env: { [INTERNAL_PUSH]: '1' },
    check: () => {
      called = true
      return 0
    },
  })

  assert.equal(status, 0)
  assert.equal(called, false)
})

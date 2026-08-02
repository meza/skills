'use strict'

module.exports = [
  { type: 'chore', scope: 'plugin-release', release: 'patch' },
  { breaking: true, release: false },
  { revert: true, release: false },
  { type: 'feat', release: false },
  { type: 'fix', release: false },
  { type: 'perf', release: false },
  { type: 'FEAT', release: false },
  { type: 'FIX', release: false },
]

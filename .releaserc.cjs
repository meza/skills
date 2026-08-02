'use strict'

const releaseRules = require('./.release-marketplace-rules.cjs')
const check = process.env.SEMANTIC_RELEASE_CHECK === '1'

const analyzer = ['@semantic-release/commit-analyzer', { releaseRules }]
const checkPlugins = [
  analyzer,
  [
    '@semantic-release/exec',
    {
      verifyReleaseCmd:
        'node -e "console.error(\'A marketplace release is pending. Run: npm run release\'); process.exit(1)"',
    },
  ],
]

module.exports = {
  branches: ['main'],
  tagFormat: 'marketplace-v${version}',
  plugins: check ? checkPlugins : [
    analyzer,
    [
      'semantic-release-replace-plugin',
      {
        replacements: [
          {
            files: ['.claude-plugin/marketplace.json'],
            from:
              '("metadata"\\s*:\\s*\\{\\s*"description"\\s*:\\s*"[^"]*"\\s*,\\s*"version"\\s*:\\s*")[^"]+(")',
            to: '$1${nextRelease.version}$2',
            countMatches: true,
            results: [
              {
                file: '.claude-plugin/marketplace.json',
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
            ],
          },
        ],
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['.claude-plugin/marketplace.json'],
        message: 'chore(marketplace-release): ${nextRelease.version} [skip ci]',
      },
    ],
  ],
}

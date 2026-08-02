'use strict'

const check = process.env.SEMANTIC_RELEASE_CHECK === '1'

const checkPlugins = [
  '@semantic-release/commit-analyzer',
  [
    '@semantic-release/exec',
    {
      verifyReleaseCmd:
        'node -e "console.error(\'A release is pending. Run: node .githooks/pre-push --release\'); process.exit(1)"',
    },
  ],
]

module.exports = {
  extends: 'semantic-release-monorepo',
  branches: ['main'],
  plugins: check ? checkPlugins : [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      'semantic-release-replace-plugin',
      {
        replacements: [
          {
            files: ['.claude-plugin/plugin.json'],
            from: '("version"\\s*:\\s*")[^"]+(")',
            to: '$1${nextRelease.version}$2',
            countMatches: true,
            results: [
              {
                file: '.claude-plugin/plugin.json',
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
            ],
          },
          {
            files: ['.codex-plugin/plugin.json'],
            from: '("version"\\s*:\\s*")[^"]+(")',
            to: '$1${nextRelease.version}$2',
            countMatches: true,
            results: [
              {
                file: '.codex-plugin/plugin.json',
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
        assets: [
          '.claude-plugin/plugin.json',
          '.codex-plugin/plugin.json',
          'CHANGELOG.md',
        ],
        message:
          'chore(plugin-release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
}

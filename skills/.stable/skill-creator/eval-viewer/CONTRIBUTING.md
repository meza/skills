# Contributing

Work from the `eval-viewer` directory:

```bash
cd skills/.stable/skill-creator/eval-viewer
```

## Install Tools

Install the Node dependencies declared by the viewer project:

```bash
npm install
```

The viewer uses Node tooling for its own maintenance. The Python evaluator
tooling in the parent `skill-creator` directory does not replace these checks.

## Mandatory Local Verification

Before handing off viewer changes, run Biome in automatic fix mode, run the full
test suite, run full coverage, and run the Playwright visual test suite:

```bash
npm run biome:fix
npm run test
npm run coverage
npm run test:visual
```

Always run these commands against the whole viewer project. Do not narrow Biome,
Vitest, coverage, or Playwright verification to individual files, components, or
subpackages when doing local verification.

Biome, Vitest, coverage, and Playwright must report no violations or failures.
Any formatting change, lint violation, test failure, visual regression, or
coverage failure is part of the current work and must be handled on the spot,
even when it appears tangential to the change that exposed it.

Biome must use the `@meza/biome` rule package. Suppressions for Biome are
reserved for the absolute last resort and must be approved before they are
applied.

## Test Coverage

Coverage must always be measured across the whole viewer project:

```bash
npm run coverage
```

The viewer requires 100% meaningful coverage. Do not run or report narrowed
coverage for individual files, components, modules, or packages.

Unit and component behaviour should be covered with Vitest. Browser-level
interaction and visual correctness should be covered with Playwright.

## Change Workflow

For viewer changes, add or update tests first, then run the mandatory local
verification commands above.

Keep server behaviour covered through API and file-contract tests. Keep frontend
behaviour covered through component tests and Playwright tests that exercise the
rendered application against representative evaluation artifacts.

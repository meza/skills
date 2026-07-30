# Contributing

Work from the `eval-viewer` directory:

```bash
cd plugins/skill-creator/skills/skill-creator/eval-viewer
```

## Install Tools

Install the Node dependencies declared by the viewer project:

```bash
npm install
```

The viewer uses Node tooling for its own maintenance. The Python evaluator
tooling in the parent `skill-creator` directory does not replace these checks.

## Mandatory Local Verification

Before handing off viewer changes, run Biome in automatic fix mode, run
Stylelint across the client styles, run the full test suite, run full coverage,
and run the Playwright visual test suite:

```bash
npm run validate
npm run test:visual
```

Do not run individual parts of these commands for actual verification.

Always run these commands against the whole viewer project. Do not narrow Biome,
Stylelint, Vitest, coverage, or Playwright verification to individual files,
components, or subpackages when doing local verification.

Biome, Stylelint, Vitest, coverage, and Playwright must report no violations or
failures. Any formatting change, lint violation, test failure, visual
regression, or coverage failure is part of the current work and must be handled
on the spot, even when it appears tangential to the change that exposed it.

When a new visual screenshot is generated, it must be carefully reviewed and inspected for correctness, consistency with the rest of the application, and visual appeal and common css failure modes.

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

### Visual coverage

Playwright visual tests must cover all states of the application.

## Updating playwright snapshots

Before you update snapshots, make sure that the failures aren't due to a change in the application.
It is always more likely that they've caught a bug in the application than the screenshots being flaky.

### Command to use

The ONLY command to update Playwright snapshots is:

```bash
npm run test:visual:update
```

This might take a while, so be patient.

The `:local` and `:docker` variants of the command are purely internal helpers. They are not to be called directly.

## CSS Authoring

The viewer uses CSS Modules for component styles. A component that needs
component-specific styling must own that styling in a colocated
`*.module.css` file. Do not add component selectors to a shared global
stylesheet.

CSS Module class names must use BEM-ish architecture without the enforced selector format. The block name should match the component
or a stable domain concept owned by that component. Elements and modifiers
should describe structure and state without depending on generated CSS Module
hashes:

```css
.run-summary {
  /* Block styles */

  &__metric {
    /* Element styles */
  }

  &--compact {
    /* Modifier styles */
  }
}
```

Use native CSS nesting where it improves readability. Keep nesting shallow and
local to the block being styled. Do not use nesting to recreate broad descendant
selector chains across component boundaries.

Shared design decisions belong in native CSS custom properties. Colors,
typography, spacing, radii, borders, shadows, transition timings, and similar
cross-cutting values must be defined as tokens and consumed through `var(...)`.
Component modules may introduce local custom properties only when the value is
private to that component and does not represent a reusable design decision.

Stylelint enforces CSS validity across client styles and BEM class names in
`*.module.css` files. Browserslist defines the supported browser target for CSS
compatibility tooling, and PostCSS runs through Vite with `postcss-preset-env`.

Global styles are reserved for application-wide concerns: font loading, design
tokens, base element defaults, resets, and layout rules that genuinely cross
component ownership boundaries. A global selector must not reach into a
component's private structure.

## Change Workflow

For viewer changes, add or update tests first, then run the mandatory local
verification commands above.

Keep server behaviour covered through API and file-contract tests. Keep frontend
behaviour covered through component tests and Playwright tests that exercise the
rendered application against representative evaluation artifacts.

## Critical

- Always run the package.json scripts for their respective tasks. Do not invent or run custom scripts and commands to accomplish the same thing.
- Some targets might take a long time to run. That is not a sign of a problem. Wait longer.

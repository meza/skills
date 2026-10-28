---
name: web-accessibility
description: Apply WCAG 2.2 when creating, changing, testing, or reviewing web content and interfaces. Use for accessibility work involving non-text content, media, semantic HTML, visual presentation, keyboard and pointer input, timing, motion, navigation, forms, authentication, errors, names, roles, states, status messages, conformance, or accessibility claims.
---

# Web Accessibility

Apply every WCAG 2.2 success criterion that is in scope for the requested content and conformance level.

## Establish requirements before choosing techniques

Treat WCAG success criteria and conformance requirements as normative. Treat Understanding documents, WCAG techniques, WAI tutorials, APG patterns, and examples as informative guidance. Never turn one informative technique or convention into the only permitted implementation.

Read [requirements-and-evidence.md](references/requirements-and-evidence.md) for every task. Read [criterion-index.md](references/criterion-index.md) to identify all potentially applicable criteria and their owning references. If no conformance target is supplied, report criteria by level and do not claim conformance.

Use the HTML Living Standard and ARIA in HTML for markup conformance. Use HTML Accessibility API Mappings to understand expected platform exposure. Use APG for custom widgets only when native HTML does not supply the required semantics and interaction.

## Load only applicable topic references

- Read [alternatives-and-media.md](references/alternatives-and-media.md) for images, icons, SVG, canvas, charts, CAPTCHA, audio, video, captions, transcripts, and audio description.
- Read [structure-and-presentation.md](references/structure-and-presentation.md) for semantics, relationships, reading order, orientation, input purpose, colour, contrast, resizing, reflow, text spacing, hover content, tables, landmarks, headings, and lists.
- Read [keyboard-timing-and-motion.md](references/keyboard-timing-and-motion.md) for keyboard access, traps, shortcuts, time limits, moving or updating content, interruptions, flashing, and animation.
- Read [navigation-and-input.md](references/navigation-and-input.md) for bypass mechanisms, titles, focus order and appearance, links, page location, pointer gestures, cancellation, motion input, dragging, and target size.
- Read [readable-and-predictable.md](references/readable-and-predictable.md) for language, definitions, reading level, pronunciation, context changes, consistent navigation, identification, and help placement.
- Read [forms-errors-and-authentication.md](references/forms-errors-and-authentication.md) for labels, instructions, validation, error correction, sensitive submissions, redundant entry, and accessible authentication.
- Read [compatibility-and-status.md](references/compatibility-and-status.md) for custom controls, names, roles, values, states, properties, and status messages.
- Read [conformance-and-claims.md](references/conformance-and-claims.md) when evaluating full-page conformance, conforming alternate versions, accessibility support, non-interference, claims, or partial-conformance statements.

Load every topic reference selected by the criterion index. Do not load unrelated references merely because the task concerns a web application.

## Inspect the complete user experience

1. Inspect the rendered page, relevant responsive variations, states, and complete process.
2. Identify applicable criteria before selecting an implementation or test technique.
3. Prefer native platform features that already supply required semantics and behaviour.
4. Verify observable behaviour with relevant input methods and the browser's accessibility tree.
5. Distinguish source-confirmed failures from runtime uncertainty and advisory improvements.

Static source review can prove some failures. It cannot prove full WCAG conformance or accessibility support.

## Report findings precisely

For each finding, state the user impact, criterion and level, observed evidence, conditions or exceptions, remediation options, and verification needed. Separate confirmed failures, passes within a stated test scope, needs-testing findings, and advisory improvements.

# Requirements and evidence

Read this reference for every task that uses the web-accessibility skill.

## Preserve source authority

Apply this authority order:

1. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) success criteria and conformance requirements define normative requirements.
2. The HTML Living Standard and ARIA in HTML define conforming markup and permitted ARIA use.
3. HTML Accessibility API Mappings describe expected accessibility-platform exposure.
4. Understanding documents, WCAG techniques, WAI tutorials, and APG patterns are informative.

Determine whether the success criterion is satisfied. Passing or failing a published technique is evidence, not the normative test, because another accessibility-supported technique may satisfy the same criterion.

## Establish the conformance target

Do not infer a target level. A page must satisfy every criterion at the supplied level and below, or provide a conforming alternate version at that level:

- Level A requires every Level A criterion.
- Level AA requires every Level A and Level AA criterion.
- Level AAA requires every Level A, Level AA, and Level AAA criterion.

WCAG discourages requiring Level AAA for an entire site because some content cannot satisfy every AAA criterion. Still evaluate individual AAA criteria when the target or task includes them.

Conformance applies only to full pages and all automatically presented responsive variations. Complete processes, accessibility-supported technology, non-interference, and conforming alternate versions can change the result. Read [conformance-and-claims.md](conformance-and-claims.md) whenever evaluating or stating conformance, drafting a claim, or considering partial conformance.

Do not claim page, process, or product conformance from a component review or a clean automated scan.

### Auditstage's accepted Reflow gap

The web application and the administration application support desktop widths only. For them, 1.4.10 Reflow is out of scope: do not test it, raise it as a finding, or ask for or record evidence at 320 CSS pixels, 256 CSS pixels high, 400 percent zoom, or any phone or tablet width. Because Reflow is a Level AA criterion, never claim Level AA or higher conformance for those surfaces; state Reflow as a known, accepted exclusion wherever their conformance is reported.

## Preserve applicability and exceptions

Evaluate a criterion only when its trigger exists, but inspect enough context to establish that trigger. Preserve every normative condition and exception. Do not convert an exception into the default implementation.

Use `must` only for an applicable normative requirement, a necessary condition of the selected conforming implementation, or an explicit user/project requirement. Label optional risk reduction and usability improvements as advisory.

## Classify evidence

- **Failure:** evidence demonstrates that an applicable criterion is not satisfied.
- **Pass:** the stated test scope satisfies the criterion using an accessibility-supported implementation.
- **Needs testing:** available evidence cannot determine behaviour or support.
- **Not applicable:** the criterion trigger is absent from the inspected scope.
- **Advisory:** the recommendation is not necessary to satisfy the cited criterion.

Record the conformance target, page or component scope, relevant state and viewport, input method, the browser whose accessibility tree was read, and observed result. Treat untested conditions as unknown. The absence of a detected failure is not proof of conformance.

## Infer screen-reader output from the accessibility tree

A screen reader can announce only what the browser exposes in its accessibility tree, so take screen-reader evidence from that tree, never from a screen reader. Read the tree in Chromium. A Chrome DevTools Protocol `Accessibility.getFullAXTree` dump shows each node's role, name, description, and state. Playwright's aria snapshots and its accessible-name and accessible-description assertions compute those values in page script rather than reading the tree, so they suit regression tests but are not tree evidence.

For a live-region announcement, show that the region is in the tree with the role or politeness the message needs before its content changes, and that the message then appears inside it.

## Use primary references

- [WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/)
- [Understanding WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/)
- [WCAG 2.2 techniques](https://www.w3.org/WAI/WCAG22/Techniques/)
- [HTML Living Standard](https://html.spec.whatwg.org/)
- [ARIA in HTML](https://www.w3.org/TR/html-aria/)
- [HTML Accessibility API Mappings](https://www.w3.org/TR/html-aam-1.0/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

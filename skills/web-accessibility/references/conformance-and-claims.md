# Conformance and claims

Load this reference for full-page conformance, conforming alternate versions, complete processes, accessibility support, non-interference, conformance claims, and statements of partial conformance. Apply [WCAG 2.2 section 5](https://www.w3.org/TR/WCAG22/#conformance) as the normative source.

## Conformance requirements

All five requirements must be satisfied for a web page to conform:

1. **Conformance level:** the page satisfies all success criteria at Level A, Levels A and AA, or Levels A, AA, and AAA respectively, or a conforming alternate version at the claimed level is provided.
2. **Full pages:** conformance cannot exclude part of a page. Alternatives directly obtainable from the page are part of it. Every automatically presented responsive variation must conform or have a conforming alternate version.
3. **Complete processes:** when a page is one step in a sequence required to complete an activity, every page in that process must conform at the specified level or better.
4. **Accessibility-supported uses:** rely only on accessibility-supported uses of technology. Information or functionality supplied through a use that is not accessibility supported must also be available through an accessibility-supported use.
5. **Non-interference:** technology used in a non-accessibility-supported or non-conforming way must not block access to the rest of the page. The page must continue to meet the conformance requirements when any unrelied-upon technology is turned on, turned off, or unsupported by a user agent. All page content, including content not relied upon, must satisfy 1.4.2 Audio Control, 2.1.2 No Keyboard Trap, 2.2.2 Pause, Stop, Hide, and 2.3.1 Three Flashes or Below Threshold.

A conforming alternate version must conform at the designated level, provide all the same information and functionality in the same human language, and be as up to date as the nonconforming content. At least one of these reachability conditions must also hold: the conforming version is reachable from the nonconforming page through an accessibility-supported mechanism; the nonconforming version can be reached only from the conforming version; or the nonconforming version can be reached only from a conforming page that also provides a mechanism to reach the conforming version. Do not describe a loosely related accessible page as a conforming alternate version.

## Conformance claims

Claims are optional. A claim may cover one page, a series of pages, or multiple related pages, but conformance itself remains page-based. When a claim is made, include:

- the claim date;
- the title, version, and URI: "Web Content Accessibility Guidelines 2.2 at https://www.w3.org/TR/WCAG22/";
- the satisfied level: A, AA, or AAA;
- a concise description of the covered pages, including whether subdomains are included; and
- the web content technologies relied upon.

A conformance logo is a claim and requires the same information. Treat success criteria beyond the claimed level, unrelied-upon technologies, tested user agents and assistive technologies, accessibility characteristics, extra accessibility measures, and machine-readable metadata as optional claim components.

## Partial-conformance statements

A statement of partial conformance is not a conformance claim: it states that the page does not conform but would do so under the stated condition. Preserve WCAG's prescribed form and conditions rather than paraphrasing it into a claim.

For later-added uncontrolled third-party content, use only one of WCAG 5.4's routes:

- determine conformance from best knowledge while monitoring and correcting or removing nonconforming contributed content within two business days; no claim is possible when monitoring or correction is impossible; or
- state that the page does not conform but would conform at level X if identified parts from uncontrolled sources were removed. Those parts must be outside the author's control and described so users can identify them.

Under WCAG 5.5, a language statement may say that the page does not conform but would conform at level X if accessibility support existed for the identified language or languages. Use this only when missing accessibility support for those languages is the reason for nonconformance.

## Verification

Inspect the complete claimed page set, responsive variations, alternate-version relationships, process boundaries, relied-upon technologies, and all three non-interference states. Check every required claim field and verify that any partial-conformance statement uses the applicable WCAG pathway and does not imply actual conformance.

# Structure and presentation

Load this reference for programmatic structure, content order, orientation, input purpose, colour, contrast, resizing, reflow, spacing, hover content, and semantic HTML.

- [Adaptable structure](#adaptable-structure)
- [Distinguishable presentation](#distinguishable-presentation)
- [Semantic HTML guidance](#semantic-html-guidance)
- [Verification](#verification)

## Adaptable structure

### 1.3.1 Info and Relationships (A)

Make information, structure, and relationships conveyed through presentation programmatically determinable or available in text. Use native headings, lists, tables, labels, groups, landmarks, and other semantics when they express the visible relationship. Styling alone does not establish the relationship.

For tables, use `th` for row or column headers and `td` for data. Native inference can be sufficient for simple headers; use `scope`, row/column groups, or `headers` and `id` where the actual structure requires explicit associations. Use `caption` only when the table needs that visible identifying title, and use `thead`, `tbody`, or `tfoot` only for corresponding row groups.

Use `fieldset` and `legend` when related controls need shared group context, especially radio buttons and checkboxes whose individual labels are insufficient. Do not require a fieldset for every visual group.

### 1.3.2 Meaningful Sequence (A)

When presentation order affects meaning, make a correct reading sequence programmatically determinable. Inspect DOM order, accessibility-tree order, CSS reordering, dialogs, responsive layouts, and injected content. More than one sequence can be correct.

### 1.3.3 Sensory Characteristics (A)

Do not make instructions depend only on shape, colour, size, visual location, orientation, or sound. Sensory references may supplement a name or other non-sensory identification.

### 1.3.4 Orientation (AA)

Do not restrict content to portrait or landscape unless a particular display orientation is essential. Device posture, application preference, and easier layout are not automatically essential.

### 1.3.5 Identify Input Purpose (AA)

For fields collecting information about the user, programmatically identify purposes covered by WCAG's Input Purposes for User Interface Components when the technology supports doing so. In HTML, use the correct `autocomplete` tokens; do not invent tokens or apply them to unrelated fields.

### 1.3.6 Identify Purpose (AAA)

In markup languages, make the purpose of user-interface components, icons, and regions programmatically determinable when they implement the purposes covered by WCAG's referenced vocabularies.

## Distinguishable presentation

### 1.4.1 Use of Color (A)

Do not use colour as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing an element. Provide text, shape, pattern, position with explicit identification, or another visual cue.

### 1.4.2 Audio Control (A)

If audio plays automatically for more than three seconds, provide a mechanism to pause or stop it, or control its volume independently from the overall system volume. This criterion applies to all page content under non-interference.

### 1.4.3 Contrast (Minimum) (AA)

Provide at least 4.5:1 contrast for normal text and 3:1 for large-scale text. Large-scale means at least 18 point regular or 14 point bold, or an equivalent size for Chinese, Japanese, and Korean (CJK) fonts. Inactive controls, pure decoration, content not visible to anyone, text or images of text that are part of a picture containing significant other visual content, and logotypes have the criterion's stated exceptions.

### 1.4.4 Resize Text (AA)

Allow text, except captions and images of text, to resize to 200 percent without assistive technology and without loss of content or functionality.

### 1.4.5 Images of Text (AA)

Use real text rather than images of text when the technology can achieve the presentation, except when the image is customizable to the user's requirements or that presentation is essential. Logotypes are essential under the criterion's definition.

### 1.4.6 Contrast (Enhanced) (AAA)

Provide at least 7:1 contrast for normal text and 4.5:1 for large-scale text, with the same inactive-control, pure-decoration, not-visible, significant-picture-content, and logotype exceptions as 1.4.3.

### 1.4.7 Low or No Background Audio (AAA)

For prerecorded audio-only content that is primarily speech, is not an audio CAPTCHA or audio logo, and is not vocalization intended mainly as musical expression, provide no background sounds, allow them to be turned off, or keep them at least 20 dB below foreground speech except for occasional one- or two-second sounds.

### 1.4.8 Visual Presentation (AAA)

For blocks of text, provide mechanisms that let users select foreground and background colours, limit width to 80 characters or glyphs (40 for CJK), avoid full justification, set line spacing to at least 1.5 within paragraphs and paragraph spacing to at least 1.5 times larger than the line spacing, and resize text to 200 percent without horizontal scrolling in a full-screen window.

### 1.4.9 Images of Text (No Exception) (AAA)

Use images of text only for pure decoration or when the particular presentation is essential. Customizability does not provide the additional exception available at AA.

### 1.4.10 Reflow (AA)

Present content without loss of information or functionality and without two-dimensional scrolling at a width equivalent to 320 CSS pixels for vertical scrolling content, or a height equivalent to 256 CSS pixels for horizontal scrolling content. Parts requiring two-dimensional layout for usage or meaning are excepted, not entire pages containing such a part.

Auditstage excludes this criterion for its desktop-only surfaces; [Auditstage's accepted Reflow gap](requirements-and-evidence.md#auditstages-accepted-reflow-gap) defines the scope.

### 1.4.11 Non-text Contrast (AA)

Provide at least 3:1 contrast against adjacent colours for visual information needed to identify user-interface components and states, and for graphical objects needed to understand content. Apply the inactive, unmodified user-agent, and essential-presentation exceptions exactly.

### 1.4.12 Text Spacing (AA)

In content implemented using markup languages that support these text style properties, setting line height to at least 1.5 times font size, spacing following paragraphs to at least 2 times font size, letter spacing to at least 0.12 times font size, and word spacing to at least 0.16 times font size, while changing no other style property, must not cause loss of content or functionality. Human languages and scripts need satisfy only the properties used by that language and script combination.

### 1.4.13 Content on Hover or Focus (AA)

When receiving and then removing pointer hover or keyboard focus triggers additional content to become visible and then hidden, make it dismissible without moving hover or focus, hoverable when pointer hover can trigger it, and persistent until the trigger is removed, the user dismisses it, or it is no longer valid. Dismissibility is excepted when the additional content communicates an input error or does not obscure or replace other content. The criterion does not apply when the visual presentation of the additional content is controlled by the user agent and not modified by the author.

## Semantic HTML guidance

Choose heading levels from the rendered hierarchy rather than visual size. WCAG does not require exactly one `h1`, forbid every numerical level skip by itself, or require the page title inside `main`.

Use `section` for a thematic grouping, normally with a heading. Naming it creates a region landmark; do that only when landmark navigation benefits. Use `article` when content is independently meaningful, `aside` for tangential content, and `address` for contact information for the nearest article or document owner.

Use `ol` when order matters, `ul` for an unordered group, and `dl` for name-value or term-description groups. Use native semantics from meaning, not visual pattern alone.

Do not put meaningful text or relationships exclusively in CSS generated content. Verify generated and hidden content in supported accessibility APIs.

## Verification

Inspect DOM and accessibility-tree relationships, reading order, headings, landmarks, tables, form grouping, and names. Test both orientations, 200 percent text resize, the reflow viewports where Reflow is in scope, user text-spacing overrides, forced colours where relevant, every state against contrast requirements, and all hover/focus content with pointer and keyboard.

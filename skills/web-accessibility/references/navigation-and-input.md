# Navigation and input

Load this reference for bypass mechanisms, page titles, focus, links, headings, page location, pointer gestures, cancellation, motion input, dragging, and target size.

- [Navigation and focus](#navigation-and-focus)
- [Pointer and alternative input](#pointer-and-alternative-input)
- [Native interaction guidance](#native-interaction-guidance)
- [Verification](#verification)

## Navigation and focus

### 2.4.1 Bypass Blocks (A)

Provide a mechanism to bypass blocks repeated across multiple pages. Skip links, structural headings, landmarks, and other accessibility-supported mechanisms can satisfy the criterion. Do not require a skip link when another mechanism satisfies it.

### 2.4.2 Page Titled (A)

Give each web page a title that describes its topic or purpose. Update the title for client-side views when they constitute distinct web pages under WCAG's definition.

### 2.4.3 Focus Order (A)

When sequential focus navigation affects meaning or operation, keep focusable components in an order that preserves both. Evaluate DOM order, positive `tabindex`, dialogs, popovers, route changes, injected content, and responsive variants.

### 2.4.4 Link Purpose (In Context) (A)

Make each link's purpose determinable from its link text alone or from the link text together with its programmatically determined context, except where the purpose would be ambiguous to users generally.

### 2.4.5 Multiple Ways (AA)

Provide more than one way to locate a page within a set of pages, except when the page is a step in or result of a process. Site navigation, search, a sitemap, table of contents, and links from related pages are possible techniques.

### 2.4.6 Headings and Labels (AA)

Use headings and labels that describe their topic or purpose. The criterion requires descriptiveness when headings or labels are present; it does not require headings or labels in every possible location.

### 2.4.7 Focus Visible (AA)

Ensure that each keyboard-operable user interface has a mode in which the keyboard focus indicator is visible. Do not remove the user-agent outline without an effective replacement.

### 2.4.8 Location (AAA)

Provide information about the user's location within a set of web pages.

### 2.4.9 Link Purpose (Link Only) (AAA)

Make each link's purpose identifiable from the link text alone, except where the purpose would be ambiguous to users generally.

### 2.4.10 Section Headings (AAA)

Use section headings to organize content. This criterion concerns content sections, not every user-interface control.

### 2.4.11 Focus Not Obscured (Minimum) (AA)

When a component receives keyboard focus, ensure it is not entirely hidden by author-created content. Check sticky headers and footers, banners, drawers, cookie notices, and overlapping dialogs.

### 2.4.12 Focus Not Obscured (Enhanced) (AAA)

When a component receives keyboard focus, ensure no part of it is hidden by author-created content.

### 2.4.13 Focus Appearance (AAA)

Provide a focus indicator whose visible area is at least as large as a two-CSS-pixel-thick perimeter of the unfocused component or sub-component and whose changed pixels have at least 3:1 contrast between focused and unfocused states. Apply both exceptions: an indicator determined by the user agent that the author cannot adjust, or an indicator and background colour that the author has not modified.

## Pointer and alternative input

### 2.5.1 Pointer Gestures (A)

For functionality using multipoint or path-based gestures, provide operation through a single pointer without a path-based gesture unless the complex gesture is essential.

### 2.5.2 Pointer Cancellation (A)

For single-pointer functionality, at least one is true: the down-event executes no part of the function; completion occurs on the up-event with a way to abort before completion or undo after completion; the up-event reverses the preceding down-event outcome; or completing the function on the down-event is essential.

### 2.5.3 Label in Name (A)

For controls with labels containing text or images of text, make the accessible name contain the visible label text. Advisory: WCAG notes that placing the visible label text at the start of the accessible name is a best practice.

### 2.5.4 Motion Actuation (A)

For functionality operated by device or user motion, also provide user-interface controls and let users disable motion activation, except when motion operates through an accessibility-supported interface or is essential.

### 2.5.5 Target Size (Enhanced) (AAA)

Make pointer targets at least 44 by 44 CSS pixels, except when an equivalent control on the same page is itself at least 44 by 44 CSS pixels, the target is inline within text, its size is user-agent-controlled and unmodified by the author, or its particular presentation is essential to the information conveyed.

### 2.5.6 Concurrent Input Mechanisms (AAA)

Do not restrict use of input modalities available on the platform except where restriction is essential, needed for content security, or required to respect user settings.

### 2.5.7 Dragging Movements (AA)

For author-controlled functionality that uses dragging, provide a single-pointer alternative that does not require dragging unless dragging is essential. User-agent-controlled functionality not modified by the author is outside this requirement.

### 2.5.8 Target Size (Minimum) (AA)

Make pointer targets at least 24 by 24 CSS pixels, or space smaller targets so a 24-CSS-pixel-diameter circle centred on each bounding box does not intersect another target or another undersized target's circle. Apply the equivalent-control, inline or line-height-constrained, user-agent-controlled, and essential-or-legally-required presentation exceptions exactly.

## Native interaction guidance

Use anchors with `href` for navigation and buttons for actions. Do not make generic elements interactive when native controls supply required semantics, keyboard behaviour, and focusability.

Use `details` and `summary` for simple disclosure when their behaviour fits. The Popover API supplies display and dismissal infrastructure but does not implement menu, listbox, grid, or other composite-widget keyboard patterns.

For modal dialogs, preserve keyboard operation and meaningful focus order within the active context, prevent background interaction, provide an accessible name, and return focus coherently. Treat APG dialog behaviour as informative pattern guidance rather than an additional WCAG criterion.

## Verification

Test complete journeys with keyboard, mouse, touch, stylus, speech input, switch input, and device motion when applicable. Measure focus indicator area and contrast, target size and spacing, and focus obstruction at every responsive state. Verify link purpose in its permitted context and every alternative to gestures, dragging, and motion.

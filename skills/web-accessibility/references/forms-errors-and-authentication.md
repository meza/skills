# Forms, errors, and authentication

Load this reference for labels, instructions, validation, error correction, sensitive submissions, redundant entry, and accessible authentication.

Apply relevant structure, keyboard, focus, pointer, contrast, timing, predictability, and compatibility criteria from their owning references in addition to the criteria below.

## Input assistance

### 3.3.1 Error Identification (A)

When an input error is detected automatically, identify the item in error and describe the error in text. Colour, icons, or position can supplement but not replace textual identification.

### 3.3.2 Labels or Instructions (A)

Provide labels or instructions when content requires user input. Make purpose, expected format, constraints, required state, and group context available when users need them. A visible native `label` is normally the most robust technique for labelable fields, but WCAG does not require that one element for every conforming control.

Do not use placeholder text as the only persistent label or instruction. Associate hints and errors programmatically when their relationship is not otherwise determinable. Space-separate multiple IDs in ARIA ID-reference lists.

### 3.3.3 Error Suggestion (AA)

When an input error is detected automatically and a correction is known, suggest the correction unless doing so would jeopardize security or the purpose of the content.

### 3.3.4 Error Prevention (Legal, Financial, Data) (AA)

For pages that cause legal commitments or financial transactions, modify or delete user-controllable data in storage, or submit test responses, provide at least one safeguard: make submissions reversible, check input and allow correction, or let users review, confirm, and correct information before finalizing.

### 3.3.5 Help (AAA)

Provide context-sensitive help.

### 3.3.6 Error Prevention (All) (AAA)

For every page requiring information submission, provide at least one safeguard: reversibility, input checking with correction opportunity, or review/confirmation with correction opportunity.

### 3.3.7 Redundant Entry (A)

When information previously entered by or provided to the user must be entered again in the same process, auto-populate it or make it available for selection. Re-entry is allowed when essential, required for security, or the previous information is no longer valid.

### 3.3.8 Accessible Authentication (Minimum) (AA)

Do not require a cognitive-function test at any authentication step unless the step provides an alternative method that avoids such a test, a mechanism that assists completion, object recognition, or identification of non-text content the user supplied to the site.

Password-manager support and copy/paste are informative examples of mechanisms that can assist users with cognitive-function tests; they are not the only conforming methods. Verify the selected authentication step against the criterion's alternatives and exceptions. Do not treat remembering or transcribing a password or one-time code as accessible merely because it is familiar.

### 3.3.9 Accessible Authentication (Enhanced) (AAA)

Do not require a cognitive-function test at any authentication step unless an alternative method avoids it or a mechanism assists completion. The object-recognition and user-provided-content exceptions available at AA do not apply.

## Form semantics and behaviour

Give every control an accessible name. Ensure the accessible name contains its visible label. Use valid `autocomplete` tokens when 1.3.5 applies.

Use `fieldset` and `legend` when controls require shared context. Communicate required and invalid states both programmatically and visibly. Use `aria-invalid` when a field is known to be invalid; use `aria-describedby` or another supported relationship for relevant instructions and errors.

Do not unexpectedly change context on focus or input. Preserve entered data where possible; data preservation is advisory unless losing it causes a criterion to fail. Use an error summary and deliberate focus movement when needed to make errors perceivable and operable, treating those as techniques rather than universal requirements.

## Verification

Submit empty, malformed, boundary, and valid values. Inspect names, descriptions, group context, required and invalid states, error identification, suggestions, review and reversal, data persistence, redundant-entry behaviour, timeout recovery, password-manager/paste support, and every authentication exception relied upon.

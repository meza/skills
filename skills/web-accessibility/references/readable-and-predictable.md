# Readable and predictable content

Load this reference for language, definitions, reading level, pronunciation, context changes, consistent navigation, identification, and help placement.

## Readable content

### 3.1.1 Language of Page (A)

Make the default human language of each page programmatically determinable. In HTML, use a valid `lang` value on the root `html` element.

### 3.1.2 Language of Parts (AA)

Make the human language of each passage or phrase programmatically determinable when it differs from the page default. Proper names, technical terms, words of indeterminate language, and words or phrases that have become part of the surrounding vernacular are excepted.

### 3.1.3 Unusual Words (AAA)

Provide a mechanism for identifying definitions of words or phrases used in an unusual or restricted way, including idioms and jargon.

### 3.1.4 Abbreviations (AAA)

Provide a mechanism for identifying the expanded form or meaning of abbreviations.

### 3.1.5 Reading Level (AAA)

When text requires reading ability more advanced than the lower-secondary level after proper names and titles are removed, provide supplemental content or an alternative version that does not require that advanced reading ability.

### 3.1.6 Pronunciation (AAA)

Provide a mechanism for identifying pronunciation when a word's meaning is ambiguous without it.

## Predictable behaviour

### 3.2.1 On Focus (A)

Do not initiate a change of context merely because a component receives focus.

### 3.2.2 On Input (A)

Do not automatically change context when a user changes a control's setting unless the user was advised of that behaviour before using it.

### 3.2.3 Consistent Navigation (AA)

When navigation mechanisms repeat across pages in a set, present them in the same relative order unless the user initiates a change.

### 3.2.4 Consistent Identification (AA)

Identify components with the same functionality consistently across a set of pages. Consistency concerns purpose, not necessarily identical visual presentation or wording without regard to context.

### 3.2.5 Change on Request (AAA)

Initiate changes of context only on user request, or provide a mechanism to turn off automatic changes.

### 3.2.6 Consistent Help (A)

When any listed help mechanism repeats across pages in a set, keep it in the same order relative to other page content unless the user initiates a change. The covered mechanisms are human contact details, a human contact mechanism, a self-help option, and a fully automated contact mechanism.

## Verification

Inspect programmatic language for the page and every differing passage. Exercise focus and value changes without activating controls. Compare repeated navigation, component identification, and help placement across the complete page set. Evaluate definitions, abbreviations, reading level, and pronunciation with the actual content and intended audience rather than markup presence alone.

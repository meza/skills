# Engineer Skill: Editing Rules

These rules apply every time SKILL.md is edited. They survive context compaction.

## Core principles

Add reasoning, not patches. When a behavior needs to change, find the principle behind it and express that principle. Do not patch specific examples or reverse-engineer assertions. The skill must work in situations the assertions do not cover.

Optimize for generalization. Assertions test specific behaviors as proxies for general principles. The general principle is what matters. Optimize for that, not for the assertion text.

Review the full document before editing. Coherence, clarity, and ambiguity across the whole document matter more than any single paragraph. A sentence that is clear in isolation can contradict something elsewhere.

## Prose rules (strictly enforced everywhere in SKILL.md)

No smart punctuation. No punctuation-driven prose. No compound sentences. Ever.

Smart punctuation includes:
- Em dashes and en dashes
- Curly double quotes and curly single quotes
- Typographic ellipses

Punctuation-driven prose includes:
- Semicolons joining independent clauses
- Colons used as dramatic pauses before a short landing phrase
- Any sentence where splitting at the punctuation produces clearer writing

Compound sentences joined by logical connectors ("and", "but", "or") are fine. Those are words doing structural work. The prohibition is punctuation doing structural work that words should do.

## Structural rules

Do not optimize for specific assertions. The assertions are test cases for general behavior, not specifications for what to say.

Scope guidance explicitly. If a rule applies only in some contexts, say so. Unscoped rules get applied everywhere and create contradictions.

Resolve contradictions. If two paragraphs give conflicting instructions for the same scenario, fix the conflict by adding context or scoping. Do not remove one and leave the other unqualified.

Prioritize reasoning over rule-stating. An agent that understands why a rule exists can apply it to novel situations. An agent that only knows the rule will fail at the edges.

## Known tensions to watch

The skill has three areas where past edits created internal contradictions:

1. The hard gate ("one sentence asking for the codebase, nothing else") and the "briefly frame factors before asking" guidance. These contradict each other for existing-system questions. The resolution: "briefly frame factors" applies only to greenfield decisions where no codebase exists. For existing-system questions, the codebase answers all the factor questions. Factor-naming before reading is noise.

2. The hard gate and the symptom-restatement guidance. The restatement guidance says do not go straight to asking without acknowledging. For bug investigations, restating the symptom is a checkpoint. For feature requests and design questions on existing systems, there is no symptom to restate. The one-sentence ask is correct there.

3. The "present options" guidance and the "get the codebase first" rule. Presenting options before reading the codebase is presenting an abstract menu. The options are only meaningful after reading. This tension is mostly resolved in the current text but watch for it when editing the Collaborative Exploration section.

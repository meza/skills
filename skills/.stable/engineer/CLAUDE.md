We're working on the engineer skill in ./

Read the ./README.md and take it very seriously!

Also pay attention and avoid encoding biases in the instructions based on knowing the assertations and grading.
The skill must behave in any scenario it finds itself in. Encoing it for a specific setting is not helpful.

CRITICAL:

STRICTLY No smart punctuation. No punctuation-driven prose. No compound sentences. Ever. Do not attempt to circumvent this rule with `--` or `;` or other type of compound sentences.
Not in your responses, not in your output, not in the files you edit.

## Fixtures

For the engineer evaluations, the fixtures' origin is here in the `engineer-evaluation-fixtures` folder. If you need to adjust the fixtures, you need to do that here, and then commit + push.

## Skill-creator

Our skill creator skill is set up for multi-turn evaluations, and using our fixtures in a reusable way. Do NOT edit the fixtures in the engineer skill itself. Use the `engineer-evaluation-fixtures` folder instead.

## Operating Rules

- Do NOT optimize to pass the evals. Optimize for general guidance so that the skill can be applicable in all environments
- Do NOT use examplars. Examplars weaken the above goal

## How to Change the Skill

Read the entire SKILL.md before making any edit. A sentence that looks like the right place to patch may not be the problem. The issue might be structural. Two sections might contradict each other. The flow of reasoning might lead the reader to the wrong conclusion before they reach the qualifying paragraph.

Adding a qualifier to one sentence is the smallest possible change. Sometimes it is the right one. Often it is not. When a behavior persists across iterations despite local edits, the cause is usually in how ideas are organized or how sections relate to each other. The right change might be reordering paragraphs, rewriting a section's framing, or removing text that gives the agent an escape hatch it should not have.

Review the document as a whole. Identify where the reasoning breaks down. Make the change that fixes the reasoning, not just the symptom.

## Skill Writing Style: Perspective-Setting, Not Imperative Commands

The SKILL.md must use perspective-setting rather than imperative commands. This is the single most important writing rule for the skill.

The problem with imperative commands ("Do X", "Never do Y", "Always Z") is that the agent treats them as a rulebook to comply with. It narrates its compliance ("According to the skill...", "Following the skill's guidance..."). It follows the letter of the rules but misses the spirit when edge cases appear. It enters rule-following mode instead of thinking mode.

The fix is to explain why a senior engineer thinks a certain way. The agent then adopts the reasoning rather than following orders. It internalizes the perspective instead of citing the rules.

Bad (imperative command):
"Do not produce implementation code before reading the codebase."

Good (perspective-setting):
"A senior engineer who writes code before reading the codebase is guessing. The codebase already contains patterns, constraints, and context that determine what the right solution looks like. Reading first is not a ritual. It is how you avoid building something that conflicts with what already exists."

The imperative version creates a checkbox. The perspective version creates understanding. An agent that understands WHY will apply the principle correctly in novel situations that no rule anticipated.

# Writing Declarative Skills

A declarative skill is not a checklist.

A declarative skill teaches the model how to inhabit a role, practice, or discipline. It gives the model a world to reason inside. When the skill is written well, the right behavior feels like the natural consequence of that world.

This is theatre of the mind.

The skill should create a clear internal scene: what matters, what is at stake, what can go wrong, what trade-offs exist, and what kind of judgment is needed. The model should not merely know what to do. It should understand why that behavior belongs to the role.

The goal is not obedience. The goal is coherent judgment.

## Core Design Goal: Coherence

The primary design goal of a skill is coherence.

A coherent skill gives the model one stable line of thought. Its purpose, values, boundaries, reasoning discipline, and output discipline all reinforce the same idea.

Coherence means the skill can be followed without contradiction, hidden prioritization, invented authority, or constant clarification from the original author.

A coherent skill answers these questions:

* What is this skill trying to protect or advance?
* What failures matter most?
* What trade-offs are acceptable?
* What trade-offs are not acceptable?
* What authority does the skill have?
* What authority does it not have?
* How should uncertainty be handled?
* What should the output make visible?

Adding more rules does not create coherence. Making priorities explicit does.

A skill becomes brittle when the model has to guess which instruction matters most. It becomes strong when the model can derive the right behavior from the skill's internal logic.

## Theatre of the Mind

Theatre of the mind means writing the skill as a lived reality rather than an external procedure.

Do not begin by telling the model what buttons to press. Begin by creating the world the model is operating in.

Describe the pressure of the role. Describe what breaks when the role fails. Describe the constraints it must respect. Describe the kind of judgment the role depends on.

The skill should make the model feel the shape of the work.

A good declarative skill says, in effect:

This is the world you are in.
This is what matters here.
This is what failure looks like.
This is what good judgment protects.
This is where your authority ends.
This is how you stay honest under uncertainty.

Once that world is clear, behavior can follow from it.

If a behavior cannot be derived from the world model, the world model is incomplete. Do not patch that gap by adding isolated rules. Revise the world model until the behavior becomes the natural outcome.

## Ethos Before Rules

Rules are useful, but they are not the foundation of a skill.

A skill built mostly from "you must", "you should", and "you do" teaches compliance before judgment. That may work in narrow, predictable situations, but it fails when the model encounters ambiguity, conflict, or novelty.

Ethos comes first.

The skill must explain what the role exists to protect or advance. It must explain why failure matters. It must make the value hierarchy visible.

Once the ethos is clear, rules become smaller and rarer. They act as guardrails, not as the engine of the skill.

The model should not follow a rule because the document shouted loudly enough. It should follow the rule because the rule is obviously necessary inside the world the skill has created.

## Declarative Drafting

The first draft of a skill should be written as a world model, not as an action list.

Write in causal prose. Show how behavior emerges from purpose, pressure, constraints, and trade-offs.

The draft should describe:

* the reality the skill operates inside
* the risks and failure modes that matter
* the values that govern trade-offs
* the limits of the skill's authority
* the discipline required under uncertainty
* the kind of output that makes work reviewable

The draft should not start with a long list of commands.

When drafting, keep asking whether each expected behavior has a reason to exist inside the world model. If it does not, the skill is not yet coherent.

Do not solve incoherence by adding more instructions. Move upstream. Clarify purpose, values, boundaries, and consequences.

## Operating Procedures

Operating procedures are allowed, but they should be rare.

A procedure belongs in a declarative skill only when it prevents a known failure mode that cannot be reliably handled through judgment alone.

Procedures are appropriate for things like drift, context rot, authority confusion, unsafe autonomy, or irreversible action.

When a procedure is necessary, label it clearly as an operating procedure. Keep it small. Explain why each step exists. The reason matters more than the sequence.

A procedure without rationale teaches ritual. A procedure with rationale teaches disciplined judgment.

## Voice and Inhabitation

A skill is meant to be inhabited.

For that reason, skills usually work best in second person. Second person lets the model step into the reasoning stance directly.

Writing about "the practitioner" can make the skill feel observational. It can encourage the model to describe good practice from the outside instead of performing it from the inside.

Use "you" unless there is a specific reason not to.

If second person feels too broad or too authoritative, the problem is usually not the pronoun. The problem is that the skill's scope, authority, or limits are underspecified.

Do not fix weak boundaries by distancing the voice. Fix the boundaries.

## Reasoning Under Uncertainty

A good skill explains how to behave when information is missing, ambiguous, or contradictory.

It should require visible separation between facts, assumptions, and unknowns. It should make conservative behavior natural when the stakes are high or the authority is unclear.

Uncertainty should not be hidden behind confident prose.

A skill fails when it encourages the model to sound certain without evidence. It succeeds when it teaches the model to remain useful while making uncertainty visible.

## Boundaries and Authority

A declarative skill must make authority explicit.

The model needs to know what the skill allows, what it does not allow, and when it must stop, ask, escalate, or narrow its output.

Boundaries should not feel like arbitrary restrictions. They should follow from the skill's purpose and failure modes.

A boundary is strong when the model understands what harm it prevents.

Weak boundaries create overreach. Overreach often looks helpful at first. It becomes dangerous when the model starts making decisions it was never authorized to make.

## Output Discipline

A skill should describe what good output makes visible.

Output is not only a formatting concern. It is part of the reasoning discipline.

A good output contract helps reviewers see:

* what was decided
* what was assumed
* what remains unresolved
* what evidence or rationale supports the result
* where the limits of confidence are
* what trade-offs were made

The output should expose the model's useful judgment without pretending to reveal private reasoning.

Reviewability is part of safety. If the user cannot see what the model relied on, they cannot meaningfully evaluate the result.

## Bad Declarative Skills

Bad skills often look thorough at first.

They may contain long lists of rules, strong imperative language, polished sections, and many warnings. But under pressure, they collapse because they never established a coherent world model.

Common failure patterns include:

* rules without rationale
* commands without value hierarchy
* mixed agent and skill identities
* vague authority
* persona language that expands scope
* success criteria that require guesswork
* examples that narrow the skill by accident
* procedures that exist because the writer did not resolve the underlying reasoning

These skills often produce compliance theatre. The model appears to follow instructions, but cannot adapt intelligently when the situation changes.

## Recovering From Bad Patterns

When a skill starts to become a pile of rules, stop adding rules.

Move upstream.

Clarify the purpose. Clarify the values. Clarify the constraints. Clarify what failure looks like. Clarify what authority the skill has and does not have.

Replace procedural guidance with reasoning guidance where possible.

Remove sections that cannot be justified by the ethos of the skill.

If recovery would require guessing the user's intent, surface the ambiguity and explain the consequence of each likely interpretation.

The goal is not to preserve the draft. The goal is to preserve coherence.

## Examples and Anchoring

Examples can be useful, but they are dangerous in skill writing.

Examples anchor behavior. They invite imitation. They can cause the model to match the example instead of following the principle.

A declarative skill should usually avoid examples unless the user explicitly needs exact formats, commands, or technical patterns.

When an example seems necessary, first extract the principle it was meant to teach. Write that principle directly. Make it work across domains.

Only include the example if the principle is still not usable without it.

Examples should remain subordinate to the rule. They should never become the hidden definition of the skill.

## Final Reconciliation

Before a skill is finalized, reconcile it as a whole.

Check that the mission, ethos, boundaries, reasoning discipline, procedures, and output contract all reinforce the same value hierarchy.

Look for contradiction. Look for silent priority conflicts. Look for places where the model would need to guess. Look for rules that do not follow from the world model.

If a section does not belong to the same theatre of the mind, revise or remove it.

A declarative skill is finished when the model can inhabit it as a coherent reasoning stance.

It should know what world it is in, what matters there, what it is allowed to do, what it must protect, how to reason under pressure, and how to make its work reviewable.

That is the point of writing declaratively.

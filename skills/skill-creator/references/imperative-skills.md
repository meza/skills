# Writing Imperative Skills

An imperative skill is a process instruction set.

It exists for work where the correct behavior depends on following known steps, respecting fixed order, preserving constraints, and producing predictable results.

However, imperative skills should not be the first choice for deterministic work.

If a process is deterministic, repeatable, and easy to express in code, it should usually be implemented as an executable script instead of an agent instruction set.

LLM agents are non-deterministic. They can skip, reinterpret, reorder, overgeneralize, or misapply instructions, even when the instructions are written clearly. This makes them a poor execution substrate for work that can be handled by ordinary code.

Use code when the workflow can be expressed as:

* fixed transformations
* schema validation
* file rewriting
* mechanical checks
* format conversion
* sorting or grouping
* deterministic classification
* repeatable calculations
* rule-based acceptance checks
* command orchestration with clear inputs and outputs

In those cases, the right artifact is usually a script, CLI tool, test, linter, validator, migration, formatter, or CI step.

An imperative skill is appropriate when the process has definite steps, but still requires reasoning that is hard to express cleanly in simple code. It is also appropriate when the workflow involves judgment, interpretation, ambiguity management, user-facing explanation, or tool use that cannot be fully automated.

The question is not "can the agent follow these steps?"

The question is "should an agent be responsible for these steps at all?"

## Core Design Goal: Reliability

The primary design goal of an imperative skill is reliability.

Reliability means the same type of request produces the same disciplined workflow each time.

Because LLM agents are not deterministic, reliability must be treated as a constraint, not an assumption. The skill should reduce ambiguity, expose decisions, and make validation explicit.

The model should not improvise the process unless the skill explicitly allows it. It should not silently skip steps because they feel unnecessary. It should not reorder stages when order matters. It should not replace required checks with confidence.

A reliable imperative skill makes execution visible and repeatable.

It reduces drift by making the workflow explicit.

But if repeatability is the main requirement and the process can be scripted, use code instead.

## When to Use Imperative Skills

Use an imperative skill when a process needs structure, but cannot be fully reduced to deterministic execution.

Imperative skills are useful for workflows that combine fixed steps with reasoning, such as:

* review procedures that require judgment
* handoff processes that require interpretation
* validation workflows where failures need explanation
* document production with structured but context-sensitive decisions
* incident response where the path depends on live evidence
* migration planning where steps are known but risks need assessment
* operational workflows where the agent must decide what information is missing
* multi-tool workflows where results must be interpreted between steps

These are situations where the process matters, but simple code would either be brittle, too narrow, or unable to handle the reasoning required.

Do not use an imperative skill merely because a process has steps.

If those steps are deterministic and scriptable, write the script.

## When Not to Use Imperative Skills

Do not use an imperative skill for work that should be automated directly.

Avoid imperative skills for:

* purely mechanical transformations
* deterministic file edits
* schema checks
* formatting enforcement
* sorting
* counting
* parsing
* static rule validation
* repeatable command sequences
* build or release checks that can run in CI
* anything where identical input should always produce identical output

For these cases, agent instructions are the wrong layer.

The skill may still describe when to run the script, how to interpret its result, or how to recover from failure. But the deterministic work itself should live in executable code.

This keeps the agent responsible for reasoning and communication, while code handles deterministic execution.

## Imperative Does Not Mean Thoughtless

An imperative skill should not turn the model into a blind executor.

The model still needs to understand why the process exists, where it can fail, and when it must stop.

The difference is that reasoning supports the process. It does not replace it.

A good imperative skill explains the purpose of the workflow before giving the steps. This prevents mechanical compliance when the process encounters an edge case.

The model should know:

* what the process is protecting
* what failure looks like
* which steps are mandatory
* which steps are conditional
* which steps are flexible
* which decisions require user confirmation
* which parts should be delegated to code instead of performed by the agent

Imperative skills fail when they become empty ritual. They also fail when they assign deterministic machine work to a non-deterministic model.

They succeed when each required action has a clear function and the agent is only responsible for the parts that benefit from agentic reasoning.

## Structure of an Imperative Skill

An imperative skill should usually contain the following sections.

## Purpose

Start by explaining what the workflow is for.

The purpose should be short and concrete. It should define the outcome the process exists to produce.

The purpose is not a brand statement. It is the reason the workflow exists.

## Applicability

Define when the skill should be used.

The model needs to know the trigger conditions. It should understand which requests fall inside the workflow and which requests do not.

Applicability should also say when the workflow should be replaced by executable code.

A workflow used in the wrong situation creates false confidence. An agent used where a script belongs creates avoidable nondeterminism.

## Required Inputs

List the information, files, permissions, context, or assumptions needed before the workflow can begin.

Make clear which inputs are mandatory and which are optional.

If mandatory inputs are missing, the skill should say whether the model must ask for them, infer them, search for them, or proceed with a clearly labeled assumption.

Do not let the model guess silently.

## Preconditions

Preconditions are facts that must be true before execution.

They are not ordinary inputs. They are gates.

If a precondition fails, the workflow must not proceed as if nothing happened.

The skill should define what happens when a precondition is not met. That may mean stopping, asking for clarification, switching workflows, escalating, producing a partial result with limits clearly stated, or recommending that the workflow be implemented as code.

## Workflow

The workflow is the core of the imperative skill.

Write the steps in the order they must be performed.

Each step should describe one action or decision point.

For each step, make clear:

* what the model does
* what information it uses
* what output or state change the step produces
* what check confirms the step is complete
* what happens if the step cannot be completed
* whether the step is agent reasoning or deterministic execution

Avoid vague steps such as "handle the issue" or "review the content". Say what handling or reviewing means inside this process.

If a step is deterministic, consider whether it should be a script instead of a model instruction.

If a step has branches, write the branch conditions explicitly.

## Decision Points

Imperative workflows often contain decisions.

A decision point should identify:

* the condition being evaluated
* the allowed outcomes
* the action attached to each outcome
* whether the model may decide or must ask the user
* whether the decision could be replaced by deterministic code

Do not hide decisions inside prose.

Hidden decisions cause silent prioritization and inconsistent execution.

If a decision is high-risk, irreversible, permission-sensitive, or outside the model's authority, the workflow should require confirmation before proceeding.

## Validation

Every imperative skill needs validation.

Validation describes how the model checks that the workflow was followed correctly and that the result satisfies the required conditions.

Validation should not be an afterthought. It is part of the workflow.

Validation may include:

* checking required sections are present
* checking no forbidden action occurred
* checking output matches the requested format
* checking assumptions are labeled
* checking inputs were preserved
* checking order was respected
* checking unresolved issues are visible
* checking whether deterministic validation should be performed by a script

A workflow without validation relies on the model's confidence. That is not enough.

Where possible, validation should be executable. A test, schema, linter, parser, or script is more reliable than asking the model to inspect its own work.

## Error Handling

Imperative skills should describe what happens when something goes wrong.

The model should not invent recovery behavior in the moment.

Define recovery paths for likely failures:

* missing input
* contradictory input
* invalid format
* failed validation
* insufficient authority
* impossible instruction
* tool or file access failure
* user instruction conflicting with the workflow
* deterministic step that should be scripted but has no script available

Error handling should be conservative. The model should preserve work already completed, make the failure visible, and avoid pretending the workflow succeeded.

## Stop Conditions

A good imperative skill defines when the model must stop.

Stop conditions protect against unsafe continuation.

The model should stop when continuing would require unauthorized action, hidden assumptions, irreversible changes, violation of the workflow's purpose, or pretending that non-deterministic execution is equivalent to scripted execution.

Stopping is not failure. It is part of process discipline.

When the workflow stops early, the output should explain:

* where it stopped
* why it stopped
* what was completed
* what remains unresolved
* what is needed to continue
* whether a script or deterministic tool should be created instead

## Output Contract

An imperative skill should define the required output.

The output contract should make the result reviewable.

It should specify the expected structure, required sections, formatting constraints, and any information that must be included.

The output should usually expose:

* what was done
* what inputs were used
* what checks were performed
* what assumptions were made
* what could not be completed
* what the final result is
* which parts were deterministic and which required reasoning

If the workflow transforms content, the output contract should say whether to preserve structure, preserve wording, normalize style, produce a diff, produce a final artifact, or summarize changes.

If deterministic scripts were used, the output should say which ones were run and what they reported.

## Mandatory vs Optional Steps

Imperative skills must distinguish mandatory steps from optional ones.

If every step sounds equally important, the model will eventually guess.

Mandatory steps are required for correctness. They must not be skipped.

Optional steps improve quality but are not required in every case.

Conditional steps apply only when their condition is met.

The skill should label these differences clearly.

It should also label which steps are better handled by code when code is available.

## Order and Dependency

If order matters, say so.

Some workflows require strict sequencing. Others allow parallel or flexible ordering.

The model should know the difference.

When one step depends on another, make the dependency explicit.

A step should not rely on information that has not yet been collected, checked, produced, or validated.

If a dependency can be enforced by a script, schema, or test, prefer that over relying on the model to remember it.

## Authority and Escalation

Imperative skills often touch actions that may exceed the model's authority.

The skill must define what the model may do directly and what requires user approval.

This is especially important for workflows involving:

* sending messages
* modifying files
* deleting content
* changing configuration
* making commitments
* creating public output
* making irreversible decisions
* acting on behalf of a person or organization

The model should not treat procedural clarity as permission.

A workflow can say exactly how to perform an action while still requiring approval before the action is taken.

## Relationship to Code

Imperative skills should treat executable code as the preferred substrate for deterministic work.

Code is better than agent instruction when the task needs repeatability, auditability, identical results, or enforcement.

The skill should push deterministic steps downward into scripts, tests, schemas, validators, or CI checks whenever possible.

The agent's job is then to:

* decide whether the workflow applies
* gather the required inputs
* run or request the deterministic tool
* interpret the result
* explain failures
* handle ambiguity
* escalate when authority is unclear
* produce a reviewable final output

This separation keeps each part of the system honest.

Code handles what must be exact.

The agent handles what requires judgment.

## Writing Style

Imperative skills should use clear command language.

Use direct verbs.

Use numbered steps when order matters.

Use bullets for inputs, checks, branches, and output requirements.

Avoid decorative prose.

Avoid long philosophical sections.

The writing should make execution easy.

However, do not remove all rationale. The model needs enough context to understand why each step exists and what failure it prevents.

The best imperative skills are concise but not context-free.

They are also honest about where agent instructions are the wrong tool.

## Bad Imperative Skills

Bad imperative skills often fail in one of three ways.

The first failure mode is vagueness. The document claims to define a process, but the steps are too broad to execute consistently.

The second failure mode is over-specification. The document contains so many rules that the model cannot tell which ones matter, which order they belong in, or how to recover when they conflict.

The third failure mode is using an agent where code belongs. The workflow describes deterministic work, but asks a non-deterministic model to perform it by instruction instead of implementing it as an executable script.

Common problems include:

* unclear trigger conditions
* missing required inputs
* steps with no completion check
* hidden decision points
* no error handling
* no stop conditions
* unclear authority
* output format left to interpretation
* validation treated as optional
* rationale removed entirely
* deterministic checks assigned to the model
* repeatable transformations written as prose instead of code
* too many edge cases mixed into the main path

A bad imperative skill creates the appearance of control without actual process reliability.

## Recovering a Bad Imperative Skill

When an imperative skill becomes confusing, do not add more instructions at random.

Recover the workflow by identifying:

* the intended outcome
* the trigger for the workflow
* the required inputs
* the main path
* the decision points
* the validation checks
* the stop conditions
* the output contract
* the steps that should be executable code instead of agent instructions

Then remove anything that does not support the workflow.

If the process contains too many branches, separate the common path from exceptions.

If the model has to guess whether to continue, add a gate.

If the model has to guess whether the result is correct, add validation.

If validation can be scripted, script it.

If the model has to guess who has authority, add an escalation rule.

If the process is deterministic, move it out of the skill and into code.

## Final Reconciliation

Before finalizing an imperative skill, reconcile it as a process.

Check that:

* the trigger is clear
* required inputs are defined
* preconditions are explicit
* steps are ordered correctly
* decision points are visible
* authority boundaries are clear
* validation is included
* error handling exists
* stop conditions are defined
* output requirements are reviewable
* deterministic work has been moved to code where possible

Then read the skill from the model's perspective.

Ask whether the model can execute the process without guessing, silently skipping, inventing authority, hiding uncertainty, or pretending that agent behavior is deterministic.

An imperative skill is complete when the workflow is reliable, bounded, and reviewable.

It should tell the model what process it is in, what steps matter, what checks are required, when to stop, and what output proves the work was done correctly.

It should also be honest about its own limits.

When the work is deterministic and scriptable, do not write a better imperative skill.

Write the script.

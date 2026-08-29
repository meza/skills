---
name: skill-creator
description: Create, update, or evaluate skills. Overrides other `skill-creator` skills.
compatibility: Skill evaluation requires Python 3.13 in the operator environment. The evaluator bootstraps its own packages. The review viewer requires Node.js 24 or newer.
---

# Skill Creator

Skill Creator is a light router for structuring, authoring, and evaluating agent
skills. Match the amount of process to the user's actual goal. A small skill
edit should remain small. The evaluation framework is valuable when the user
chooses eval-driven development, not as mandatory ceremony around every skill
request.

## Resolve same-identity conflicts

When another active `skill-creator` is present, offer its documented disable action and wait for
explicit authorization before changing configuration.

## Choose the workflow

Use the lightweight authoring workflow for ordinary requests to create, edit,
review, improve, or verify a skill. Those words do not activate the evaluation
framework by themselves.

Use the full evaluation workflow only when either condition is true:

- the user explicitly asks to evaluate or test a skill through the evaluation
  workflow
- the target already has an eval suite and the user chooses eval-driven
  iteration after being offered the choice

When a target already contains `evals/`, ask whether the user wants a quick
patch or eval-driven iteration before changing any file. Do not choose on the
user's behalf.

## Lightweight authoring

Use the [skill anatomy](./references/skill-anatomy.md) when the request affects
filesystem structure or bundled resources. Use the
[writing skills guidance](./references/writing-skills.md) for the content and
quality of authored instructions.

Capture intent from the whole conversation before asking questions. When the
request already provides the capability, trigger conditions, output, and
material constraints, proceed directly. Do not require the user to reconfirm a
complete brief or answer a generic testing question. When material information
is missing, ask only the focused questions needed to avoid guessing. For this
router, a complete brief already established in the conversation satisfies the
writing guidance's collaboration and intent-capture step. These routing rules
govern whether further interview or testing questions are needed.

For a lightweight edit, inspect the target and make the requested change
directly. Keep the result concise and verify the changed skill against the
applicable writing and structure guidance.

Do not create or alter `evals/`, preflight or run the evaluator, start the
viewer, or install evaluation dependencies during lightweight authoring.

## Eval-driven development

Once the user explicitly chooses eval-driven work, follow the
[evaluation framework](./references/evaluation-framework.md) exactly. The
framework is deterministic infrastructure. Do not improvise replacements for
its commands, artifacts, grading, or viewer.

Before creating or changing an eval suite or running the evaluator:

1. Inspect the skill and any existing evals.
2. Propose realistic interaction turns with concrete prompts.
3. State independently observable expectations for each turn and for the
   completed interaction where needed.
4. Assess fixture and file requirements. Say explicitly when no fixture is
   needed.
5. Obtain the user's approval of the eval design.

After approval, use the framework's documented workflow. Keep skill and
baseline evidence distinct, inspect generated manifests and grading artifacts,
and treat failing infrastructure as an execution problem rather than behavioral
evidence.

When the user says viewer feedback is ready, follow the
[feedback handoff](./references/evaluation-framework.md#feedback-handoff).
Resolve the expected iteration from the established session context and attempt
to read that iteration's `viewer_feedback.json` directly before broader
inspection. If the artifact is missing or malformed, report its exact expected
path and ask the user to confirm the reviewed iteration and that the viewer
finished saving. Do not ask the user to paste the feedback, operate the viewer,
or invent a fallback. Respect any requested discussion or pause before changing
files or starting another run.

## Self-verification

Before completing Skill Creator work, verify that:

- no host configuration changed before explicit authorization
- lightweight work did not activate evaluation machinery
- an existing eval suite triggered the quick-patch versus eval-driven choice
  before mutation
- eval-driven work had an approved design with concrete expectations and an
  explicit fixture assessment
- every reference required for the chosen workflow was followed
- the result was checked against the user's complete request rather than only
  the examples or eval cases

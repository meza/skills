---
name: skill-creator
description: MUST USE when creating, modifying, or reviewing agent skills, and when a user says skill-eval viewer feedback was submitted or a review is complete. Provides a structured framework for iteratively developing and evaluating agent skills, guidance on structuring and authoring skills, and a repeatable workflow for developing skills through an eval-driven framework.
compatibility: Skill evaluation requires Python 3.13 in the operator environment. The evaluator bootstraps its own packages. The review viewer requires Node.js 24 or newer.
---

# Skill Creator

The skill creator skill is made up of 3 main components, and this file is only the router, pointing to the relevant documentation for each component:

1. how to structure skills on the filesystem
2. how to write effective skills in collaboration with the user
3. a framework for developing skills in a test-driven way

Depending on your current goal, you will need to use one or more of these components.
The links below take you to the relevant documentation for each component. These are your authoritative resources for how to structure, write, and develop skills. You must read and follow the guidance in these documents when creating, modifying, or reviewing agent skills.

## Structuring Skills

Agent skills have a very specific structure on the filesystem. This structure is designed to be easy to understand, navigate, and use for both humans and machines. The structure also supports progressive disclosure of information, which helps keep the most important information in context while allowing access to more detailed information as needed.

Follow the [anatomy of a skill documentation](./references/skill-anatomy.md) for detailed guidance on how to structure skills on the filesystem.

## Writing Skills

Writing effective skills is a collaborative process that involves understanding the user's needs, goals, and constraints, and then crafting a skill that meets those needs in a way that is useful, relevant, and aligned with the user's intentions. This process often involves capturing the user's intent, asking clarifying questions, researching best practices, and iterating on the skill based on feedback.

Follow the [writing skills documentation](./references/writing-skills.md) for detailed guidance on how to write effective skills in collaboration with the user.

## Developing Skills

The evaluation framework provides a repeatable workflow for developing skills through eval-driven iteration. The workflow runs realistic prompts against a skill, compares runs with and without that skill, grades the outputs, aggregates results, and opens a viewer for human review.

The evaluation framework is a set of deterministic scripts for running, comparing and viewing evals.
There is no room for improvisation in this workflow: you must follow the rules and use the scripts as they are defined. This ensures that skill evals are consistent, comparable, and reviewable.

To use the evaluation framework, follow the [evaluation framework documentation](./references/evaluation-framework.md).

When the user says they submitted feedback, finished the review, or otherwise
signals that viewer feedback is ready, treat it as a workflow transition. Follow
the [feedback handoff](./references/evaluation-framework.md#feedback-handoff)
before changing the skill, changing evals, or starting another evaluator run.

The operator environment and the provider environment are separate boundaries.
Run `evaluate_skill.py` from the operator agent's host shell. Do not run it from
inside an eval fixture, generated work directory, skill run, baseline run, or
grading session. The operator resolves Python 3.13 and host permissions. The
evaluator owns its isolated package environment below the external run root.

Do not improvise a virtual environment or manually install evaluator packages.
Follow the operator preflight and acquisition ladder in the evaluation framework.

### Iterating on Skills

When you're working on skill evaluation results, you must avoid optimizing for the eval results themselves. The goal of the evaluation framework is to provide feedback on how well the skill is working in realistic scenarios, not to create a skill that performs well on a specific set of evals. To avoid optimizing for eval results, you should:

1. Focus on the feedback from the evals rather than the scores. Look for patterns in the feedback that indicate where the skill is falling short and use that to guide your revisions.
2. Avoid making changes that are only designed to improve the eval scores. Instead, focus on making changes that improve the overall quality and usefulness of the skill, even if they don't directly impact the eval scores.
3. Review and adjust the entire skill based on the feedback, rather than just tweaking specific parts that are underperforming in the evals. This helps ensure that you're improving the skill as a whole rather than just optimizing for the evals.
4. Remember that the evals are just one source of feedback and should be considered alongside other factors such as user feedback, real-world performance, and alignment with the user's goals and intentions.

## Self-Verification

Before completing Skill Creator work, verify that:

1. You read every reference required for the work you performed.
2. Any evaluator command runs from the operator host, not a provider session.
3. Python and host permissions were verified rather than assumed.
4. No tool, Python runtime, package, or permission expansion occurred without the required user authority.
5. The skill, documentation, and tests agree about the supported workflow.
6. Any completed feedback handoff used the saved artifact directly and respected the user's authorization boundary.

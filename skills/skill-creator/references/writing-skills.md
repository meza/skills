# Writing Skills

## Collaborative Authoring

When writing skills, you should collaborate closely with the user to understand their needs, goals, and constraints. This collaboration is essential for creating skills that are useful, relevant, and aligned with the user's intentions.

DO NOT JUMP INTO WRITING THE SKILL IMMEDIATELY. Start by having a conversation with the user to capture their intent and gather information. This will help you create a skill that truly meets their needs.

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first — the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps, and should confirm before proceeding to the next step.

1. What should this skill enable the agent to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out.

Check available MCPs - if useful for research (searching docs, finding similar skills, looking up best practices), research in parallel via subagents if available, otherwise inline. Come prepared with context to reduce burden on the user.

## Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier
- **description**: When to trigger, what it does. This is the primary triggering mechanism - include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Note: skills can "undertrigger" -- not getting used when they would be useful. To combat this, please make the skill descriptions a little bit "pushy". So for instance, instead of "How to build a simple fast dashboard to display internal company data.", you might write "How to build a simple fast dashboard to display internal company data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the rest of the skill :)**

### Skill body guidelines

The skill body is the agent's entry point to the skill's unique value.
Depending on the size of the information encoded in the skill, this is either where you write it all (if it's less than 500 lines) or where you write the router to the rest of the information (if it's more than 500 lines). In either case, the body should be focused on communicating the unique value of the skill and how to use it, not on general background information that the agent can find elsewhere.

#### Style constraint

No smart punctuation. No punctuation-driven prose.

#### Imperative vs Declarative

Before you start writing the body of the skill, ask yourself: is this something I can write as a set of instructions (imperative) or do I need to describe it more generally (declarative)?

- **Imperative**: Use when the skill can be broken down into a clear sequence of steps. This is often the case for skills that involve a specific workflow, process, or set of actions. For example, "How to set up a CI/CD pipeline for a Node.js application" can be written as a series of steps.
- **Declarative**: Use when the skill is more about principles, best practices, or guidelines that don't fit into a linear sequence. For example, "How to write effective commit messages" might be better as a set of guidelines rather than a step-by-step process.

This decision will guide the structure of the skill body and how you present the information.

As a general rule of thumb, if you find yourself writing a lot of "if this, then do that" statements, or if the skill involves a lot of decision points, it might be better to go with a declarative style. If the skill can be easily followed as a recipe, an imperative style might be more effective.

Reasoning agents work better with declarative instructions in _most_ cases, so unless the skill is very procedural, it's often better to go with a declarative style. But use your judgment based on the specific skill and the user's needs.

Follow the [imperative skills](./references/imperative-skills.md) guidelines for imperative style.
Follow the [declarative skills](./references/declarative-skills.md) guidelines for the declarative style.

#### Link context for progressive disclosure

With progressive disclosure, the goal is to not overwhelm the agent with too much information at once, while still providing access to all the necessary information. When linking to additional resources, be clear about what the resource is and when to use it. For example, "For more detailed instructions on setting up the CI/CD pipeline, see `references/ci-cd-setup.md`."
Make sure to include enough context around the link so the agent understands why it's there and what it contains, without needing to open it immediately. This way, the agent can decide when to access that information based on the situation.

#### Self-Verification at the end

Regardless of the style you choose, include a section on self-verification at the end of the skill body. This should provide guidance to the agent on how to check its work after using the skill.
The self-verification section should mostly be an imperative checklist of things to verify after using the skill. This is crucial for helping the agent catch mistakes and ensure that it's using the skill correctly.

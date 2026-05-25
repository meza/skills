---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, update an existing skill, run evals to test a skill, or benchmark skill performance with variance analysis.
---

# Skill Creator

A skill for creating new skills and iteratively improving them.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run them via `evaluate_skill.py`
- Help the user evaluate the results both qualitatively and quantitatively
  - While the runs happen in the background, draft some quantitative evals if there aren't any (if there are some, you can either use as is or modify if you feel something needs to change about them). Then explain them to the user (or if they already existed, explain the ones that already exist)
  - Use `serve_viewer.py` to show the user the results for them to look at, and also let them look at the quantitative metrics
- Rewrite the skill based on feedback from the user's evaluation of the results (and also if there are any glaring flaws that become apparent from the quantitative benchmarks)
- Repeat until you're satisfied
- Expand the test set and try again at larger scale

Your job when using this skill is to figure out where the user is in this process and then jump in and help them progress through these stages. So for instance, maybe they're like "I want to make a skill for X". You can help narrow down what they mean, write a draft, write the test cases, figure out how they want to evaluate, run all the prompts, and repeat.

On the other hand, maybe they already have a draft of the skill. In this case you can go straight to the eval/iterate part of the loop.

Of course, you should always be flexible and if the user is like "I don't need to run a bunch of evaluations, just vibe with me", you can do that instead.

## Communicating with the user

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. There is a broader trend now where coding agents are inspiring plumbers to open up their terminals, parents and grandparents to google "how to install npm". On the other hand, the bulk of users are probably fairly computer-literate.

So please pay attention to context cues to understand how to phrase your communication! In the default case, just to give you some idea:

- "evaluation" and "benchmark" are borderline, but OK
- for "JSON" and "assertion" you want to see serious cues from the user that they know what those things are before using them without explaining them

It's OK to briefly explain terms if you're in doubt, and feel free to clarify terms with a short definition if you're unsure if the user will get it.

---

## Creating a skill

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first — the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps, and should confirm before proceeding to the next step.

1. What should this skill enable the agent to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out.

Check available MCPs - if useful for research (searching docs, finding similar skills, looking up best practices), research in parallel via subagents if available, otherwise inline. Come prepared with context to reduce burden on the user.

### Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier
- **description**: When to trigger, what it does. This is the primary triggering mechanism - include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Note: skills can "undertrigger" -- not getting used when they would be useful. To combat this, please make the skill descriptions a little bit "pushy". So for instance, instead of "How to build a simple fast dashboard to display internal company data.", you might write "How to build a simple fast dashboard to display internal company data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the rest of the skill :)**

### Skill Writing Guide

#### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
```

#### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) - Always in context (~100 words)
2. **SKILL.md body** - In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** - As needed (unlimited, scripts can execute without loading)

These word counts are approximate and you can feel free to go longer if needed.

**Key patterns:**
- Keep SKILL.md under 500 lines; if you're approaching this limit, add an additional layer of hierarchy along with clear pointers about where the model using the skill should go next to follow up.
- Reference files clearly from SKILL.md with guidance on when to read them
- For large reference files (>300 lines), include a table of contents

**Domain organization**: When a skill supports multiple domains/frameworks, organize by variant:
```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```
The agent reads only the relevant reference file.

#### Principle of Lack of Surprise

This goes without saying, but skills must not contain malware, exploit code, or any content that could compromise system security. A skill's contents should not surprise the user in their intent if described. Don't go along with requests to create misleading skills or skills designed to facilitate unauthorized access, data exfiltration, or other malicious activities. Things like a "roleplay as an XYZ" are OK though.

#### Writing Patterns

Prefer using the imperative form in instructions.

**Defining output formats** - You can do it like this:
```markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

**Examples pattern** - It's useful to include examples. You can format them like this (but if "Input" and "Output" are in the examples you might want to deviate a little):
```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### Writing Style

Try to explain to the model why things are important in lieu of heavy-handed musty MUSTs. Use theory of mind and try to make the skill general and not super-narrow to specific examples. Start by writing a draft and then look at it with fresh eyes and improve it.

### Test Cases

After writing the skill draft, come up with 2-3 realistic test prompts — the kind of thing a real user would actually say. Share them with the user: [you don't have to use this exact language] "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?" Then run them.

Save test cases to `evals/evals.json`. Don't write expectations yet — just the prompts. You'll draft expectations in the next step while the runs are in progress.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "eval_name": "descriptive-name-here",
      "turns": [
        {"prompt": "User's task prompt", "expectations": []}
      ],
      "files": []
    }
  ]
}
```

See `references/schemas.md` for the full schema (including the `expectations` field, which you'll add later).

## Running and evaluating test cases

This section is one continuous sequence — don't stop partway through. Do NOT use `/skill-test` or any other testing skill.

Put results in `<cwd>/<skill-name>-workspace/`, under the current working directory rather than adjacent to the skill directory. Organize results by iteration (`iteration-1/`, `iteration-2/`, etc.). Within each iteration, create one directory per eval using its numeric ID from evals.json: `eval-1/`, `eval-2/`, etc. Create directories as you go.

#### Directory layout reference

Every iteration must follow this exact structure. The viewer, aggregation script, and grader all depend on these paths. Deviating from this layout will cause silent failures.

Every eval uses the same layout. A one-turn eval just has `turn-1/`.

```
iteration-N/
└── eval-<ID>/
    ├── eval_metadata.json          # turns[{prompt, expectations}], eval_id, eval_name
    ├── with_skill/
    │   ├── turn-1/
    │   │   └── outputs/
    │   │       ├── response.md     # extracted post-run from agent output file
    │   │       └── transcript.md   # extracted post-run from agent output file
    │   ├── turn-2/                 # if the eval has more turns
    │   │   └── outputs/
    │   │       ├── response.md
    │   │       └── transcript.md
    │   ├── outputs/                # any files the agent modified
    │   ├── grading.json
    │   └── timing.json
    └── without_skill/
        ├── turn-1/...
        ├── turn-2/...
        ├── outputs/
        ├── grading.json
        └── timing.json
```

Key placement rules:
- **eval_metadata.json**: at the eval directory level (parent of config dirs). The viewer checks `run_dir/eval_metadata.json` and `run_dir.parent/eval_metadata.json`. Placing it at the eval level means both with_skill and without_skill runs share the same metadata.
- **grading.json**: at the config directory level (sibling to `outputs/`). The grader saves to `{outputs_dir}/../grading.json`. The viewer and aggregation script both look for it here.
- **timing.json**: at the config directory level.
- **Eval directory names**: use the numeric ID from evals.json prefixed with `eval-` (e.g., `eval-1/`, `eval-2/`). Put the human-readable name in `eval_name` inside eval_metadata.json. The aggregation script requires the `eval-` prefix.

### Step 1: Run evals through the orchestrator

Call `evaluate_skill.py`. Do not call `prepare_fixture.py` or `run_skill_evals.py` directly. Those modules are internal application code used by the orchestrator.

```bash
python <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort>
```

Use optional filters only when the user asks to limit the run:

```bash
python <skill-creator-path>/scripts/evaluate_skill.py \
  --skill-path <path-to-skill> \
  --run-root <path-to-run-root> \
  --provider <claude|codex> \
  --model <model-id> \
  --effort <effort> \
  --eval-ids 1,3 \
  --config with_skill
```

`--config` accepts only `with_skill` or `without_skill`. If omitted, both configurations run. `--eval-ids` is a comma-separated list of eval IDs from `evals/evals.json`.

**Run root (required):** This is the base directory where the orchestrator stages fixtures, creates a unique prepared run root, and writes results. Keep it under the current working directory so eval artifacts stay contained to the session. Each invocation creates a fresh child directory named like `<skill>-eval-runs-xxxxxxx/`.

Run `evaluate_skill.py` in the background because it takes a while. Use a second terminal, your shell's background-job support, or any equivalent launcher available in your environment.

**How it works:** The orchestrator prepares isolated run directories in memory, then starts each eval run as its own provider CLI process in one of those prepared directories. For `with_skill` runs, the prepared directory contains the skill in the provider-specific discovery folder. For `without_skill` runs, the prepared directory does not contain the skill. The prompts are otherwise identical.

Multi-turn evals use `--session-id` for turn 1 and `--resume` for subsequent turns. Each turn's prompt is piped via stdin to avoid shell escaping issues.

**What it produces:** The full iteration directory structure, ready for grading:

- `eval_metadata.json` for each eval
- `turn-N/outputs/response.md` and `turn-N/outputs/transcript.md` for every turn
- `timing.json` with tokens, duration, and cost
- `raw_output.jsonl` with the full `stream-json` transcript for debugging
- `run_manifest.json` summarizing all runs (status, timing, costs)
- `progress.json` with live progress (updates after each run completes)

The result iteration lives under `<prepared-run-root>/results/iteration-1/`. The command output includes the prepared run root and run manifest summary.

**Fixture sources:** `evals/evals.json` can define a top-level `fixture_repo` and optional `fixture_ref` so eval fixtures come from a shared repository at a pinned commit, tag, or branch. If you already have a local pinned checkout, use `fixture_base_path` instead.

**Baseline notes:**
- **Creating a new skill**: the `without_skill` directory has no skill at all. True baseline.
- **Improving an existing skill**: snapshot the old version before editing (`cp -r <skill-path> <workspace>/skill-snapshot/`). Pass the snapshot path as `--skill-path` to build baseline directories containing the old version.

### Step 2: Monitor progress and draft expectations

After launching the script in the background, do two things in parallel:

**Monitor progress.** Start the progress poller in the background:
```bash
python <skill-creator-path>/scripts/poll_progress.py \
  <workspace>/iteration-<N>/progress.json --interval 30
```
Run this in the background using whatever process-launching mechanism your environment supports. It prints a status line each time a run completes and exits when all runs are done. Do not use `sleep` commands to poll manually. If runs are failing, investigate early rather than waiting for the full batch to finish.

**Draft expectations.** Use the time productively. Draft quantitative expectations for each test case and explain them to the user. If expectations already exist in `evals/evals.json`, review them and explain what they check.

Good expectations are objectively verifiable and have descriptive names. They should read clearly in the benchmark viewer so someone glancing at the results immediately understands what each one checks. Subjective skills (writing style, design quality) are better evaluated qualitatively. Do not force expectations onto things that need human judgment.

Update the `eval_metadata.json` files and `evals/evals.json` with the expectations. Each expectation goes inside the turn object it applies to. Explain to the user what they will see in the viewer.

### Step 3: Grade, then aggregate and launch the viewer

Once `evaluate_skill.py` finishes, spawn grader subagents for each run. One grader per run (not one for the whole batch). You can spawn all graders in parallel.

The graders are not optional bookkeeping. They are the primary qualitative review pass for the loop, and they exist in part to save your context window. Do not start reading transcripts and outputs run-by-run to form your own qualitative judgments before the graders do. That defeats the point of parallel grading and burns context on work the graders are already supposed to do. Before the graders finish, your job is orchestration: confirm the expected files exist, launch graders, and fix pipeline breakage if something is missing or obviously malformed. Do not substitute your own intermediary review for the graders' review.

1. **Grade each run** — each grader reads `agents/grader.md` and follows ALL steps including Step 6 (Critique the Evals). The grader saves results to `{outputs_dir}/../grading.json`, which places it at the config directory level (e.g., `eval-1/with_skill/grading.json`). See the directory layout reference above. The grading.json must include ALL fields from the grader spec: `expectations` (with `text`, `passed`, `evidence`), `summary` (with `passed`, `failed`, `total`, `pass_rate`), and `eval_feedback` (with `suggestions` and `overall`). The `eval_feedback` field powers the "AI Summary" panel in the viewer. Without it the panel is empty and the user sees no qualitative observations. The grader must always include eval_feedback with substantive analysis of what worked, what didn't, and what the expectations missed. For expectations that can be checked programmatically, write and run a script rather than eyeballing it.

   For multi-turn evals, pass the grader both the response.md and transcript.md for each turn. These are extracted post-run from the agent's output file. The transcript is what makes process assertions ("agent read the codebase before responding") verifiable. Without it the grader can only see what the agent said, not what it did.

   After each grader finishes, validate its artifact before you move on:
   ```bash
   python <skill-creator-path>/scripts/validate_grading.py <run-dir>/grading.json
   ```
   If validation fails, treat that grader run as incomplete. Re-run or fix it before aggregating. Do not let malformed grading output flow downstream into benchmark generation or the viewer.

**Wait for every grader to finish before continuing.** Aggregating with incomplete grading data produces wrong benchmark numbers. Do not aggregate, analyze, or launch the viewer until all graders have reported back. Do not "fill the gap" by reading raw outputs yourself and narrating provisional conclusions to the user. If you need to inspect something before then, keep it strictly to debugging why a run or grader failed to produce the required artifacts.

2. **Aggregate into benchmark** — run the aggregation script:
   ```bash
   python <skill-creator-path>/scripts/aggregate_benchmark.py <workspace>/iteration-N --skill-name <name>
   ```
   This produces `benchmark.json` and `benchmark.md` with pass_rate, time, and tokens for each configuration, with mean and stddev and the delta. If generating benchmark.json manually, see `references/schemas.md` for the exact schema the viewer expects.
Put each with_skill version before its baseline counterpart.

3. **Do an analyst pass** — read the benchmark data and surface patterns the aggregate stats might hide. See `agents/analyzer.md` (the "Analyzing Benchmark Results" section) for what to look for — things like assertions that always pass regardless of skill (non-discriminating), high-variance evals (possibly flaky), and time/token tradeoffs. Write the observations into the `notes` array in `benchmark.json`. Include both positive findings (what the skill does well) and patterns worth investigating. These notes appear in the viewer's Benchmark tab under "Analysis Notes".

4. **Launch the viewer** with both qualitative outputs and quantitative data:
   ```bash
   python <skill-creator-path>/scripts/serve_viewer.py start \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json
   ```
   For iteration 2+, also pass `--previous-workspace <workspace>/iteration-<N-1>`.

   The only flags are: `--port`, `--skill-name`, `--previous-workspace`, `--benchmark`, `--static`, `--open`, `--no-open`. Do not invent flags that are not listed here. If unsure, run `serve_viewer.py start --help`.

   The script backgrounds the server, writes a PID file, and health-checks the port before reporting success. There is no need for `nohup`, `&`, or PID capture.

   The script defaults to opening the viewer in the user's browser for local interactive sessions, and defaults to `--no-open` over SSH. Use `--open` or `--no-open` explicitly if you need to override that behavior. On the first run of a session, ask the user whether they want the browser opened automatically, then use `--open` or `--no-open` to honor that preference for the rest of the session.

   **Cowork / headless environments:** If there is no display, use `--static <output_path>` to write a standalone HTML file instead of starting a server. Add `--no-open` if you want to make that intent explicit. Feedback will be downloaded as a `feedback.json` file when the user clicks "Submit All Reviews". After download, copy `feedback.json` into the workspace directory for the next iteration to pick up.

Note: please use `serve_viewer.py` to create the viewer; there's no need to write custom HTML.

5. **Present a debrief to the user.** After the viewer is live, your final message should be a substantive summary the user can discuss with you before opening the viewer. Build this debrief from the graders' `grading.json` outputs, the aggregated benchmark, and the analyst notes. Do not replace that synthesis with a fresh top-to-bottom manual review of every transcript unless you are drilling into a specific discrepancy the graders surfaced. Include:
   - The headline numbers (with_skill vs without_skill pass rates and the delta)
   - What worked well (evals where the skill clearly helped)
   - What did not work (evals that failed or regressed)
   - Patterns you noticed in the transcripts (e.g. the skill caused agents to waste time on something unproductive, or agents ignored a key instruction)
   - Concrete next steps you would recommend (specific edits to the skill, new test cases to add, expectations to revise)
   - The viewer URL and a note to leave feedback there when ready

   This debrief is the most important output of the grading step. The viewer is for detailed inspection. The debrief is for the conversation. Put it last so the user sees it immediately.

### What the user sees in the viewer

The "Outputs" tab shows one test case at a time:
- **Prompt**: the task that was given
- **Output**: the files the skill produced, rendered inline where possible
- **Previous Output** (iteration 2+): collapsed section showing last iteration's output
- **Formal Grades** (if grading was run): collapsed section showing assertion pass/fail
- **Feedback**: a textbox that auto-saves as they type
- **Previous Feedback** (iteration 2+): their comments from last time, shown below the textbox

The "Benchmark" tab shows the stats summary: pass rates, timing, and token usage for each configuration, with per-eval breakdowns and analyst observations.

Navigation is via prev/next buttons or arrow keys. When done, they click "Submit All Reviews" which saves all feedback to `feedback.json`.

### Step 4: Read the feedback

When the user tells you they're done, read `feedback.json`:

```json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..."},
    {"run_id": "eval-2-with_skill", "feedback": "perfect, love this", "timestamp": "..."}
  ],
  "status": "complete"
}
```

Empty feedback means the user thought it was fine. Focus your improvements on the test cases where the user had specific complaints.

After reading the feedback, stop the viewer server immediately:

```bash
python <skill-creator-path>/scripts/serve_viewer.py stop
```

The viewer is only needed while the user is reviewing. Once you have the feedback, shut it down before moving on.

---

## Improving the skill

This is the heart of the loop. You've run the test cases, the user has reviewed the results, and now you need to make the skill better based on their feedback.

### How to think about improvements

1. **Generalize from the feedback.** The big picture thing that's happening here is that we're trying to create skills that can be used a million times (maybe literally, maybe even more who knows) across many different prompts. Here you and the user are iterating on only a few examples over and over again because it helps move faster. The user knows these examples in and out and it's quick for them to assess new outputs. But if the skill you and the user are codeveloping works only for those examples, it's useless. Rather than put in fiddly overfitty changes, or oppressively constrictive MUSTs, if there's some stubborn issue, you might try branching out and using different metaphors, or recommending different patterns of working. It's relatively cheap to try and maybe you'll land on something great.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Make sure to read the transcripts, not just the final outputs — if it looks like the skill is making the model waste a bunch of time doing things that are unproductive, you can try getting rid of the parts of the skill that are making it do that and seeing what happens.

3. **Explain the why.** Try hard to explain the **why** behind everything you're asking the model to do. Today's LLMs are *smart*. They have good theory of mind and when given a good harness can go beyond rote instructions and really make things happen. Even if the feedback from the user is terse or frustrated, try to actually understand the task and why the user is writing what they wrote, and what they actually wrote, and then transmit this understanding into the instructions. If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures, that's a yellow flag — if possible, reframe and explain the reasoning so that the model understands why the thing you're asking for is important. That's a more humane, powerful, and effective approach.

4. **Look for repeated work across test cases.** Read the transcripts from the test runs and notice if the subagents all independently wrote similar helper scripts or took the same multi-step approach to something. If all 3 test cases resulted in the subagent writing a `create_docx.py` or a `build_chart.py`, that's a strong signal the skill should bundle that script. Write it once, put it in `scripts/`, and tell the skill to use it. This saves every future invocation from reinventing the wheel.

5. **Read the whole document before patching a sentence.** When a behavior persists across iterations despite local edits, the problem is usually structural rather than textual. Two sections might contradict each other. The reasoning flow might lead the reader to the wrong conclusion before they reach the qualifying paragraph. A sentence earlier in the document might give the agent an escape hatch that no amount of qualifying later can close. The right fix might be reordering paragraphs, rewriting a section's framing, or removing text entirely. Adding a qualifier to one sentence is the smallest possible change and often not the most effective one.

6. **Every behavior is fixable through skill text.** Never conclude that a stubborn behavior is "model-level" or "unfixable variance." That conclusion is always wrong and stops you from finding the actual fix. When a behavior persists across many iterations, the skill has a structural gap. The gap might be positional: the guidance exists but is too far from the decision point where the agent acts. The gap might be tonal: perspective-setting explains the reasoning but the agent needs a confident absolute to anchor it. The gap might be a missing tie-in: the principle lives in one section but the agent violates it while processing a different section. Trace the agent's reasoning flow through the document and find where it diverges from the intended behavior. The fix is always there. Finding it is the job.

7. **Place the gate at the door.** When the agent consistently ignores guidance in section A while executing behavior from section B, the fix is to put the check in section B. The agent processes the skill as it works. A principle stated in an analysis section has no weight when the agent is deep in an implementation section. Repeating the critical check at the exact point where the agent is about to act is not redundancy. It is how the principle survives the transition between thinking modes. If a behavior needs to be caught before the first tool call, the check belongs right before the step that produces tool calls.

8. **Hybrid: confident absolute first, reasoning after.** Pure perspective-setting explains why a principle matters. Pure imperatives create checkbox compliance. The combination that works: state the absolute confidently in one sentence, then explain why it matters. The agent internalizes the reasoning AND has a concrete anchor to check its output against. When perspective-setting alone does not change a behavior, adding one direct sentence before the explanation often does. The same content in a different order can produce a completely different outcome.

This task is pretty important (we are trying to create billions a year in economic value here!) and your thinking time is not the blocker; take your time and really mull things over. I'd suggest writing a draft revision and then looking at it anew and making improvements. Really do your best to get into the head of the user and understand what they want and need.

### The iteration loop

After improving the skill:

1. Apply your improvements to the skill
2. Run `evaluate_skill.py` again. The orchestrator creates a fresh run tree every time so there is no risk of contamination from previous iterations. If you're creating a new skill, the baseline is always `without_skill` (no skill) -- that stays the same across iterations. If you're improving an existing skill, use your judgment on what makes sense as the baseline: the original version the user came in with, or the previous iteration.
3. Launch the reviewer with `--previous-workspace` pointing at the previous iteration
4. Wait for the user to review and tell you they're done
5. Read the new feedback, improve again, repeat

Keep going until:
- The user says they're happy
- The feedback is all empty (everything looks good)
- You're not making meaningful progress

---

## Advanced: Blind comparison

For situations where you want a more rigorous comparison between two versions of a skill (e.g., the user asks "is the new version actually better?"), there's a blind comparison system. Read `agents/comparator.md` and `agents/analyzer.md` for the details. The basic idea is: give two outputs to an independent agent without telling it which is which, and let it judge quality. Then analyze why the winner won.

This is optional, requires subagents, and most users won't need it. The human review loop is usually sufficient.

---

## Claude.ai-specific instructions

In Claude.ai, the core workflow is the same (draft → test → review → improve → repeat), but because Claude.ai doesn't have subagents, some mechanics change. Here's what to adapt:

**Running test cases**: No subagents means no parallel execution. For each test case, read the skill's SKILL.md, then follow its instructions to accomplish the test prompt yourself. Do them one at a time. This is less rigorous than independent subagents (you wrote the skill and you're also running it, so you have full context), but it's a useful sanity check — and the human review step compensates. Skip the `without_skill` baseline runs — just use the skill to complete the task as requested.

**Reviewing results**: If you can't open a browser (e.g., Claude.ai's VM has no display, or you're on a remote server), skip the eval viewer entirely. Instead, present results directly in the conversation. Mirror the same qualitative review the viewer would normally support: show the prompt, show the output, and ask for feedback inline. If the output is a file the user needs to see (like a .docx or .xlsx), save it to the filesystem and tell them where it is so they can download and inspect it. There is no `feedback.json` in this mode, so treat the user's inline comments as the review record for the next iteration.

**Benchmarking**: Skip the quantitative benchmarking — it relies on baseline comparisons which aren't meaningful without subagents. Focus on qualitative feedback from the user.

**The iteration loop**: Same as before — improve the skill, rerun the test cases, ask for feedback — just without the eval viewer in the middle. You can still organize results into iteration directories on the filesystem if you have one.

**Blind comparison**: Requires subagents. Skip it.

---

## Cowork-Specific Instructions

If you're in Cowork, the main things to know are:

- You have subagents, so the main workflow (spawn test cases in parallel, run baselines, grade, etc.) all works. (However, if you run into severe problems with timeouts, it's OK to run the test prompts in series rather than parallel.)
- You don't have a browser or display, so when generating the eval viewer, use `--no-open` with `--static <output_path>` to write a standalone HTML file instead of starting a server. Then proffer a link that the user can click to open the HTML in their browser.
- For whatever reason, the Cowork setup seems to disincline the agent from generating the eval viewer after running the tests, so just to reiterate: whether you're in Cowork or in another interactive coding runtime, after running tests, you should always generate the eval viewer for the human to look at examples before revising the skill yourself and trying to make corrections, using `serve_viewer.py` (not writing your own boutique html code). Sorry in advance but I'm gonna go all caps here: GENERATE THE EVAL VIEWER *BEFORE* evaluating inputs yourself. You want to get them in front of the human ASAP!
- Feedback works differently: since there's no running server, the viewer's "Submit All Reviews" button will download `feedback.json` as a file. Copy that file into the workspace directory so the next iteration can pick it up, then read it from there. You may have to request access first.
- Because you are using static output rather than a running server, there is no viewer process to stop after review.

## Reference files

The agents/ directory contains instructions for specialized subagents. Read them when you need to spawn the relevant subagent.

- `agents/grader.md` — How to evaluate assertions against outputs
- `agents/comparator.md` — How to do blind A/B comparison between two outputs
- `agents/analyzer.md` — How to analyze why one version beat another

The references/ directory has additional documentation:
- `references/schemas.md` — JSON structures for evals.json, grading.json, etc.

---

Repeating one more time the core loop here for emphasis:

- Figure out what the skill is about
- Draft or edit the skill
- Run the test prompts via `evaluate_skill.py`
- With the user, evaluate the outputs:
  - Create benchmark.json and run `serve_viewer.py` to help the user review them
- Run quantitative evals
- Repeat until you and the user are satisfied

Please add steps to your TodoList, if you have such a thing, to make sure you don't forget. If you're in Cowork, please specifically put "Create evals JSON and run `serve_viewer.py` so human can review test cases" in your TodoList to make sure it happens.

Good luck!

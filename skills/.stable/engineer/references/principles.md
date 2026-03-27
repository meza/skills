# Engineering Principles — Detail Reference

Read specific sections of this file when a task requires the relevant depth. You don't need to read
all of it upfront.

---

## Table of Contents

1. [Owned Complexity Bias](#owned-complexity-bias)
2. [Technical Debt Management](#technical-debt-management)
3. [Dependency & Upgrade Guidance](#dependency--upgrade-guidance)
4. [CI/CD & Deployment Readiness](#cicd--deployment-readiness)
5. [Governance & Scope Control](#governance--scope-control)
6. [Workarounds & Deviations](#workarounds--deviations)
7. [Documentation Standards](#documentation-standards)

---

## Owned Complexity Bias

The project already contains patterns and abstractions that exist for a reason. Those choices encode
hard-learned decisions about correctness, edge cases, performance, and consistency. Reusing them is
not stylistic preference. It is how the project stays stable as it grows.

**Why duplication is dangerous:** When you duplicate an existing pattern, you create two similar but
not identical behaviors. That duplication expands the surface area that must be tested, maintained,
and explained. It also creates inconsistency for users, because the same conceptual action behaves
differently depending on where it is invoked. Those inconsistencies become bugs, support load, and
future refactors.

**The dependency-first check:**

Before introducing any new general-purpose helper, abstraction, or plumbing that is not directly
required by the product behavior:

1. Look in the **language stdlib** — does this exist already?
2. Look in the **existing codebase** — is there a function or module that does this?
3. Look for a **well-maintained third-party dependency** — is there a tested, community-maintained
   solution?
4. Only if all three come up empty: build bespoke, and record why reuse was insufficient in the
   DesignSummary and Delivery Note.

**The cost of complexity:** Every new abstraction has a carrying cost. It must be understood,
tested, documented, and maintained in perpetuity. The simplest solution is not always the quickest
to write, but it is almost always the cheapest to own.

---

## Technical Debt Management

Technical debt is real work. Make it visible and manageable rather than accumulating it silently.

**Before creating a debt entry:** Consult `docs/technical-debt.md` (if it exists) to avoid
duplicate entries and understand existing debt context.

**When to create an entry:**

- You are about to introduce a known compromise to meet a deadline
- You discover existing debt while working in an area
- You convert a TODO comment into a tracked item

Convert TODOs into entries in `docs/technical-debt.md` rather than leaving them in code. TODOs in
code are invisible to planning. Tracked debt entries are not.

**Scope discipline:** Avoid refactoring outside the current task scope. Fold small, low-risk
refactors into the current task only when:

- The scope is agreed with the user
- The risk is genuinely low (no behavior change, high test coverage)
- The benefit is clear and immediate

Remove debt entries when completed and reference them in the Delivery Note.

---

## Dependency & Upgrade Guidance

**For new dependencies:**

- Verify the dependency is well-maintained (recent commits, active issue tracker, good download
  counts)
- Check for known CVEs before adding
- Record why an existing dependency or stdlib function was insufficient

**For major version upgrades:**

Include in the Delivery Note:
- Migration steps taken
- Tests run against the new version
- Performance benchmarks if relevant
- Rollback instructions (how to pin back to the previous version)

**For dependency CI:** Enable dependency automation (Dependabot / Renovate) and ensure CI runs
mapped invariant tests for dependency PRs. A dependency bump that breaks invariant tests should
fail CI, not slip through.

---

## CI/CD & Deployment Readiness

Keep changes incremental and testable across expected environments.

**Before shipping:**

- Validate behavior in the environments the code will actually run in (local, staging, production
  config differences)
- Include build metadata (commit hash, timestamp) in deployable artifacts where useful for
  debugging
- Document environment-specific notes in the Delivery Note

**Infrastructure as code:** Provide Dockerfiles or IaC only when the task or project explicitly
requests them. Do not add infrastructure complexity as a side effect of a feature task.

**Rollback:** Every Delivery Note for a production-impacting change should include a rollback
strategy. Even a simple "revert the commit and redeploy" is sufficient.

---

## Governance & Scope Control

**Scope creep detection:** If work grows beyond the original scope, stop and produce a short
proposal containing:

- What expanded and why
- Impact on timeline and risk
- Rollback strategy if the expansion is rejected
- A request for explicit approval before proceeding

**Drift detection:** If you notice you are touching many unrelated files or performing broad test
rewrites that were not part of the original task, that is a signal to stop and escalate. Broad
changes made without explicit approval are risky and hard to review.

**The approval bar:** The bar for proceeding without approval should be proportional to the
reversibility and blast radius of the change. Small, local, easily-reversible changes can proceed
on judgement. Broad, coupled, hard-to-reverse changes require explicit approval.

---

## Workarounds & Deviations

**Default: improve the base, don't layer workarounds.**

When a refactor would improve correctness, robustness, or simplicity — even if it requires
widespread call-site changes. Treat it as the recommended path. If the scope is broad, pause and
request approval, but do not replace the refactor with added systems or process complexity just to
avoid touching more files.

**When a workaround is unavoidable** (deadline, external constraint, dependency limitation):

Record in the Delivery Note:
- **What**: the deviation from the standard approach
- **Why**: the constraint that forced it
- **Risks**: what could go wrong as a result
- **Mitigation**: steps taken or planned to reduce the risk
- **Revisit timeframe**: when this should be properly fixed

Prefer the safest, most reversible option when uncertain. A workaround that can be removed cleanly
later is better than one that becomes load-bearing.

**Deviations from coding standards** are allowed only when justified. Record them the same way.

---

## Documentation Standards

**When a task is complete**, update relevant `docs/` files to reflect changes. Code that isn't
documented is only half-shipped. The next engineer (or your future self) will need to understand
what changed and why.

**Public APIs**: use docblocks. They are the contract between your code and its callers.

**Tests as documentation**: write test names that describe behavior, not implementation. A test
named `rejects token after run is closed` tells a reader more than `tokenTest3`.

**Delivery Note as audit trail**: the Delivery Note is the
primary audit trail for the decision that was made, not just a handoff artifact. Write it as if the reader wasn't in the room
when you made the decisions.

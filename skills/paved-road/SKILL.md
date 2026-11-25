---
name: paved-road
description: MUST USE before proposing, implementing, or approving a custom mechanism that infers state or replaces, coordinates, duplicates, or bypasses a capability owned by a tool, framework, platform, dependency, or shared project abstraction. Check supported options before adopting polling, timing heuristics, wrappers, hooks, direct access to internals, or undocumented behavior.
---

# Prefer the paved road

A custom mechanism owns maintenance, security, upgrade, and operational obligations. Before taking
those on, establish whether the capability already has a supported owner. The paved road is that
owner's documented default, first-class configuration, API, contract, or extension point.

A mechanism is an escape hatch when it bypasses or reconstructs an owning abstraction, compensates
for an uninvestigated supported path, or depends on behaviour the owner does not promise. Its role
decides this classification, not its name or the author's description.

## Recognise the trigger

Use this skill when a mechanism:

- observes or infers state an owning contract should expose;
- coordinates lifecycle, readiness, retries, caching, scheduling, or failure handling owned
  elsewhere;
- reproduces an existing capability or orchestration path;
- reaches through a supported boundary; or
- uses timing, traffic, markup, or process state as a proxy for owned state.

Documentation added by the contribution can explain the proposal but cannot make it supported,
architecturally correct, or approved.

## Establish the supported path

Identify the repository-governed version, matching first-party documentation, narrowing repository
configuration and guidance, and the implementation that owns the responsibility. Existing code
proves current state, not support or target architecture.

Exercise every applicable documented option in the repository. If none exists, record the
first-party sources establishing that absence. Measure native behaviour when performance, capacity,
or reliability motivates the alternative. Passing tests prove behaviour, not supportability.

Prefer correcting or extending the owning abstraction. Scope does not authorise rebuilding its
responsibility locally; request the necessary scope when the sound correction crosses it.

## Gate an escape hatch

Before adopting, implementing, or approving an escape hatch, present the affected-scope owner with
a proposal that provides:

- the governing version and first-party sources;
- the repository experiment or measurement and demonstrated gap;
- why the owner cannot be corrected or extended;
- maintenance, security, operational, upgrade, and rollback consequences.

Obtain explicit approval from that owner or their identified delegate for the named mechanism and
scope before adoption or implementation.

Approval does not transfer between mechanisms, tasks, or sessions. Contribution-authored
documentation, ticket silence, tests, precedent, and reviewer inference are not approval. Missing
evidence or approval is a review defect, not acceptable local debt.

## Self-verification

- Confirm the capability, owner, version, sources, and target architecture.
- Confirm applicable supported options were exercised or their absence evidenced.
- Confirm any escape hatch is named, evidenced, reversible, scoped, and properly approved.
- Confirm contribution-authored documentation was not treated as authority.

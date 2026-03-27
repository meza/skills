# Test-Driven Design

Read this reference when implementing. The core principle lives in SKILL.md. This file explains the method and the reasoning behind it.

---

## Table of Contents

1. [Why "Design" and not "Development"](#why-design-and-not-development)
2. [The cycle](#the-cycle)
3. [Red: the test as a design act](#red-the-test-as-a-design-act)
4. [Green: minimum passage](#green-minimum-passage)
5. [Refactor: where design emerges](#refactor-where-design-emerges)
6. [Unit decomposition](#unit-decomposition)
7. [Pushback patterns](#pushback-patterns)
8. [Proving the discipline held](#proving-the-discipline-held)

---

## Why "Design" and not "Development"

The name matters. "Test-Driven Development" suggests that tests come first as a quality practice. They do. But that framing misses the deeper value.

Writing the test before the implementation forces you to use the interface before you build it. You become the first caller. If the test is awkward to write, the interface is awkward to use. If the test requires elaborate setup, the unit has too many dependencies. If the assertion is hard to express, the behavior is unclear.

The test is a design tool. It tells you whether the shape of what you are about to build is right before you have invested effort building it. Changing an interface after writing one test is cheap. Changing it after writing the implementation and wiring it into three other modules is expensive.

This is why the test comes first. Not because testing is important (it is). Because the act of writing the test reveals the design.

## The cycle

Each unit of work follows three phases. Red. Green. Refactor. Each phase has a specific purpose. Skipping or reordering them defeats the point.

The cycle repeats per unit. Not per feature. A feature is made of units. Each unit gets its own cycle. The cycles build on each other in dependency order. The first unit has no dependencies. Each subsequent unit can depend on units already delivered.

## Red: the test as a design act

Write a test that describes the behavior you want. Run it. It fails. That failure is the signal that the test is actually testing something.

Before you can reach a behavioral failure, the test must be able to run. A missing module, an unresolved import, or a nonexistent type will prevent execution. That error is a structural problem, not a red phase. Resolve it with the minimum change that lets the test execute: create the empty module, add the type stub, wire the import. Then run again. The behavioral failure is the red phase. The structural fix is plumbing. Conflating the two loses the design signal.

This distinction matters in practice because a structural error tells you nothing about the design. A behavioral failure tells you exactly what the unit must do.

The test expresses three things at once:

**What the caller provides.** The test's setup and invocation show the inputs. This is the contract from the caller's perspective. If the setup is complex, the unit is asking too much of its callers. Simplify the interface.

**What the unit promises.** The assertion shows the expected output or side effect. This is the contract from the unit's perspective. If the assertion is hard to express, the unit's responsibility is unclear. Split it.

**What the unit's name means.** The test description is a sentence in natural language that says what the unit does. If that sentence is hard to write clearly, the unit is doing more than one thing.

A good red phase produces a test you can read as a specification. Someone who has never seen the implementation can read the test and understand exactly what the unit does, what it takes, and what it returns.

### Atomic tests

Each test asserts one behavior. Not one function. One behavior. A function might have several behaviors: the happy path, the error case, the boundary condition. Each gets its own test.

Atomic tests serve the design in two ways. First, they force you to enumerate the behaviors before you implement. This enumeration is the specification. Second, when a test fails later, it tells you exactly which behavior broke. A test that asserts five things at once tells you only that something is wrong.

Write the test names as declarative sentences. "rejects expired tokens" is a specification. "test token validation" is a label. The sentence form forces clarity about what the test is actually checking.

### What the test is not

The test is not a formality you write to satisfy a coverage metric. A test written to cover lines rather than to specify behavior adds maintenance cost without design value. If you catch yourself writing a test because a line is uncovered rather than because a behavior needs specifying, stop. Ask whether the uncovered line represents a behavior that matters. If yes, write a test for that behavior. If no, the line might be dead code.

## Green: minimum passage

Write the smallest amount of code that makes the test pass. Nothing more.

This constraint matters for design. When you write only what the test demands, you avoid speculative code. Every line exists because a test required it. There is no unused infrastructure. No "while I am here" additions. No anticipated requirements that may never arrive.

The same temptation exists in the red phase. You can see all the behaviors the unit needs. You want to write all the tests at once and then implement. Resist. Write one test. Run it. Implement. Run it again. Then write the next test. Writing all tests first is batch specification. It commits to the full interface before the first implementation has validated any of it. If the first green phase reveals the interface needs to change, every pre-written test needs updating.

The temptation during green is to write the full solution. You can see the final shape. You know what the next three tests will need. Resist. Write what this test needs. The next test will ask for the next thing. If the final shape is right, you will arrive at it test by test. If the final shape is wrong, you will discover that sooner because each test is a checkpoint.

Minimum passage also reveals over-specification in the test. If you can make the test pass with a trivially wrong implementation (returning a hardcoded value, for instance), the test is not specific enough. Add another test that forces the real implementation. This interplay between test and code is triangulation. Each test eliminates a class of wrong implementations until only the correct one remains.

## Refactor: where design emerges

The tests are green. The behavior is correct. Now ask the design question: is this the right shape?

Green tests make refactoring safe. You can change the internal structure freely because the tests will catch any behavioral regression. This safety is why refactoring lives inside the cycle rather than at the end of the feature. Deferring refactoring until "later" means refactoring without the safety net of comprehensive, granular tests. Or more likely, not refactoring at all.

Questions to ask after each green:

- Is there a name that obscures intent? A function called `process` or `handle` almost always hides what it actually does. Rename it to what it means.
- Is there a shape that would be clearer extracted or inlined? A helper that is called once and adds a layer of indirection might be clearer inlined. Three lines that appear in two places might be clearer as a named function.
- Does a duplication reveal itself now that this unit exists? Duplication that was invisible before the code existed becomes visible once two units share a pattern. This is the moment to extract it. Not before. Premature extraction creates abstractions that do not fit. Post-hoc extraction creates abstractions shaped by actual use.
- Does the test itself need improving? Tests are code. They accumulate design debt too. A test with excessive setup might be telling you the interface changed and the test did not keep up.

If you find something worth changing, change it. Run the tests again. If the design is already sound, say so explicitly. Name what you examined and why you judged it sound. The refactor phase is not optional. It has two valid outcomes: a design improvement or a reasoned judgment that none is needed. Silence is not an outcome.

## Unit decomposition

The order of units matters. Start with the unit that has the fewest dependencies. It is the easiest to test in isolation and the hardest to get wrong. Each subsequent unit can build on the ones already delivered.

Decomposition is itself a design act. How you break the feature into units determines the module boundaries, the dependency graph, and the test surface. A feature decomposed into units aligned with responsibilities produces a clean architecture. A feature decomposed into units aligned with UI screens or data flow steps produces a tangled one.

The decomposition should be visible in the delivery. Each unit is a checkpoint: a failing test, a passing implementation, and a refactor decision. The team can review unit by unit rather than absorbing the entire feature at once.

## Pushback patterns

Teams sometimes ask to defer tests. The most common form: "Write the implementation now. We will add tests in a follow-up PR once we confirm it works in staging."

This breaks the cycle in a way that cannot be repaired later. Retrofitted tests have no red phase. You cannot know whether they would have caught a regression because they were never run against code that did not yet exist. The test passes. Was the behavior always correct? Or does the test simply describe whatever the implementation happens to do? Without the red phase, there is no way to tell.

The response to "tests later" is not refusal. It is a counter-proposal. Lay out the TDD sequence: which test you would write first, what it would assert, what the minimum implementation would look like. Show that the test-first approach is not slower. It is the same work in a different order with a stronger guarantee.

The same applies to "implement everything, then add tests." The result is the same: tests that describe the implementation rather than specifying the behavior. The only way a test can prove it would catch a regression is by failing before the implementation exists.

## Proving the discipline held

Claiming TDD in prose is not proof. Running the tests is. The test runner output from each phase is how you demonstrate the discipline held.

Show the red output. Show the green output after implementation. Show the green output after refactoring. Each transition is evidence that the cycle was followed.

Run tests with coverage enabled. Do not pass flags that disable coverage reporting.

Coverage is a design completeness tool. After going green on a unit, the coverage output shows you which code paths exist without a corresponding behavioral test. An uncovered branch means one of two things: the branch is dead code and should be removed, or it represents a behavior you have not yet specified and need a test for. Both are design signals. Passing `--no-coverage` or equivalent flags suppresses those signals and removes the tool that would tell you which behaviors still need specifying. A green suite without coverage is a suite that cannot show you what it is missing.

## What 100% coverage is and is not

100% line and branch coverage on your new code is the target. Not the stretch goal. The target. If every behavior went through a red-green cycle, every line of new code was demanded by a test. 100% is the natural outcome of following the method. Anything below it means either you wrote code that no test demanded or you skipped a behavior that the code handles.

100% does not mean the code is correct. It means every path was exercised at least once with at least one example. That is the minimum confidence bar. A single example per path catches the obvious structural bugs. It does not catch subtle edge cases. More tests add more confidence. But below 100% there are paths that were not exercised even once. That is a gap in the design, not a metric shortfall.

100% also does not mean you need to chase coverage in code that someone else wrote. Scope the target to your own delivery. The code you added or modified should be fully covered. Existing uncovered code is a separate concern and a separate conversation with the team. Going off to plug coverage gaps in unrelated modules is scope creep that slows down the current delivery without the team asking for it.

## How to verify your lines are covered

The coverage report shows uncovered line numbers per file. After the green run, read that column for every file you touched. Cross-reference against the lines you wrote or modified. If any of your lines appear in the uncovered list, write a test that exercises that path and run again.

Overall project coverage will be low when existing code lacks tests. That number is irrelevant. The only question is whether your lines are covered. A file at 41% overall coverage can still have 100% coverage on the lines you added. The uncovered line numbers tell you exactly which lines are missing tests. Read them. If none of them are yours, you are done. If any of them are yours, you are not.

When reporting coverage in the Delivery Note, name your files and state which lines are yours and whether they are covered. Do not report the project-wide percentage as your coverage number. That conflates your work with someone else's gaps.

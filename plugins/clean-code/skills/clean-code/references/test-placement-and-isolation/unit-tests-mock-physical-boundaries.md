# Unit tests mock physical boundaries

Unit tests avoid real filesystem, network, database, clock, process, and environment access unless the physical boundary itself is the behavior under test.

Unit tests should keep physical I/O out of the feedback loop by default.
The preferred shape is to isolate the unit from operating system and infrastructure boundaries through interfaces, adapters, mocks, fakes, or in-memory substitutes.
Strong signs include mocked filesystem clients, in-memory repositories, injected environment readers, injected clocks, explicit fake process runners, and tests that can run in parallel without touching shared physical state.
Weak signs include casual OS tmpfile usage, real path assumptions, real environment variable dependence, real subprocess calls, real sockets, real databases, sleeps, and tests that fail because of machine state rather than product behavior.
Physical I/O is acceptable only when the test is explicitly proving filesystem, OS, process, or infrastructure semantics that cannot be represented faithfully by a fake.
This symptom matters because unit tests should provide immediate behavior feedback without environmental cost or flakiness.
Review should ask whether the physical boundary is genuinely the subject of the test. If not, the boundary should be mocked or the test should be reclassified as integration.


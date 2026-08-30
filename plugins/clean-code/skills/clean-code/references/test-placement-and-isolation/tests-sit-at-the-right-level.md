# Tests sit at the right level

Behavior is verified at the cheapest test layer that can provide trustworthy evidence, rather than pushed unnecessarily into broad slow tests.

Good test suites use each layer for the kind of risk it is best suited to reduce.
Unit tests should carry small deterministic behavior checks, integration tests should prove real boundaries and wiring, end-to-end tests should protect critical journeys, and smoke tests should decide whether a build or environment is healthy enough to continue.
Strong signs include business rules covered close to the logic, infrastructure assumptions covered at integration boundaries, only high-value journeys covered end to end, and smoke checks that stay broad and shallow.
Weak signs include exhaustive UI tests for logic that could be covered cheaply, unit tests that fake away the boundary they claim to verify, broad tests used because lower-level seams are missing, and test suites whose cost grows faster than the confidence they provide.
This symptom matters because misplaced tests create either false confidence or excessive maintenance cost.
Review should ask whether the test proves the intended risk at the narrowest reliable layer.


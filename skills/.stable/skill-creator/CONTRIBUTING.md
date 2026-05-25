# Contributing

Work from the `skill-creator` directory:

```bash
cd skills/.stable/skill-creator
```

## Install Test Tools

Install the maintainer test dependencies into the active Python environment:

```bash
python -m pip install -r requirements.txt
```

These dependencies are for local maintenance and test execution. They are not bundled runtime requirements for the skill itself.

## Mandatory Local Verification

Before handing off changes, run Black in automatic fix mode, run Flake8 across the full maintained Python surface, run the full test suite, and run coverage for the entire `scripts` package:

```bash
python -m black scripts tests
python -m flake8 scripts tests
python -m pytest
python -m pytest --cov=scripts --cov-report=term-missing
```

Always run these commands against the whole `scripts` and `tests` folders. Do not narrow Black, Flake8, pytest, or coverage to individual files, modules, or subpackages when doing local verification.

Black, Flake8, and pytest must report no violations or failures. Any formatting change, lint violation, test failure, or coverage failure is part of the current work and must be handled on the spot, even when it appears tangential to the change that exposed it. Suppressions for Black or Flake8 are reserved for the absolute last resort and must be approved before they are applied.

## Run Tests

Run the full test suite:

```bash
python -m pytest
```

Run one test file:

```bash
python -m pytest tests/test_prepare_fixture.py
```

## Run Coverage

Run coverage for the entire scripts package:

```bash
python -m pytest --cov=scripts --cov-report=term-missing
```

Coverage must always be measured against the whole `scripts` package. Do not run or report narrowed coverage for individual files, modules, or subpackages.

## Change Workflow

For script changes, add or update tests first, then run the mandatory local verification commands above.

Keep eval-running behavior covered through Python APIs and contract tests. Tests should call the application classes directly unless they are specifically testing the top-level `evaluate_skill.py` CLI boundary.

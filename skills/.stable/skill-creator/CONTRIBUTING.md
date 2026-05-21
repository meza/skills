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

Run pytest with coverage:

```bash
python -m pytest --cov=scripts.prepare_fixture --cov-report=term-missing
```

Coverage only includes code imported or executed inside the pytest process. Tests that launch scripts in subprocesses validate CLI behavior, but they do not contribute coverage for the parent pytest process.

## Change Workflow

For script changes, add or update tests first, then run the focused test file and the full suite.

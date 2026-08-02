import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from scripts.evaluate import runtime_bootstrap


class RuntimeBootstrapTests(unittest.TestCase):
    def test_validate_python_version_accepts_declared_minor(self):
        runtime_bootstrap.validate_python_version((3, 13, 7))

    def test_validate_python_version_rejects_other_minors(self):
        with self.assertRaisesRegex(
            runtime_bootstrap.RuntimeBootstrapError,
            "Python 3.13 is required",
        ):
            runtime_bootstrap.validate_python_version((3, 12, 10))

    def test_runtime_fingerprint_covers_runtime_and_platform(self):
        first = runtime_bootstrap.runtime_fingerprint(
            b"psutil==7.2.2\n",
            python_version=(3, 13, 1),
            cache_tag="cpython-313",
            platform_name="win32",
            machine="AMD64",
        )
        second = runtime_bootstrap.runtime_fingerprint(
            b"psutil==7.2.2\n",
            python_version=(3, 13, 2),
            cache_tag="cpython-313",
            platform_name="win32",
            machine="AMD64",
        )

        self.assertNotEqual(first, second)
        self.assertEqual(len(first), 16)

    def test_virtualenv_python_uses_platform_layout(self):
        root = Path("runtime with spaces")

        self.assertEqual(
            runtime_bootstrap.virtualenv_python(root, "win32"),
            root / "Scripts" / "python.exe",
        )
        self.assertEqual(
            runtime_bootstrap.virtualenv_python(root, "linux"),
            root / "bin" / "python",
        )

    def test_parse_run_root_supports_both_argument_forms(self):
        self.assertEqual(
            runtime_bootstrap.parse_run_root(["--run-root", "run root"]),
            Path("run root").resolve(),
        )
        self.assertEqual(
            runtime_bootstrap.parse_run_root(["--run-root=other root"]),
            Path("other root").resolve(),
        )

    def test_requirements_are_exactly_pinned(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "runtime-requirements.txt"
            path.write_text(
                "jsonschema==4.26.0\npsutil==7.2.2\n",
                encoding="utf-8",
            )

            requirements = runtime_bootstrap.read_locked_requirements(path)

        self.assertEqual(
            requirements,
            {"jsonschema": "4.26.0", "psutil": "7.2.2"},
        )

    def test_requirements_reject_unpinned_entries(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "runtime-requirements.txt"
            path.write_text("jsonschema>=4\n", encoding="utf-8")

            with self.assertRaisesRegex(
                runtime_bootstrap.RuntimeBootstrapError,
                "exactly pinned",
            ):
                runtime_bootstrap.read_locked_requirements(path)

    def test_checked_in_runtime_lock_is_exact_and_complete(self):
        requirements = runtime_bootstrap.read_locked_requirements(
            runtime_bootstrap.RUNTIME_REQUIREMENTS_PATH
        )

        self.assertEqual(
            set(requirements),
            {
                "attrs",
                "jsonschema",
                "jsonschema-specifications",
                "psutil",
                "referencing",
                "rpds-py",
            },
        )

    def test_current_environment_requires_matching_versions(self):
        versions = {"jsonschema": "4.26.0", "psutil": "7.2.2"}

        self.assertTrue(
            runtime_bootstrap.current_environment_is_compatible(
                versions,
                version_reader=versions.__getitem__,
            )
        )
        self.assertFalse(
            runtime_bootstrap.current_environment_is_compatible(
                versions,
                version_reader=lambda _name: "0.0.0",
            )
        )

    def test_cache_root_uses_skill_creator_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_root = runtime_bootstrap.default_cache_root(
                environ={"XDG_CACHE_HOME": temp_dir},
                platform_name="linux",
            )

        self.assertEqual(cache_root, Path(temp_dir) / "skill-creator")

    def test_remove_owned_tree_rejects_paths_outside_runtime_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            runtime_root = base / "runtime"
            runtime_root.mkdir()
            outside = base / "outside"
            outside.mkdir()

            with self.assertRaisesRegex(
                runtime_bootstrap.RuntimeBootstrapError,
                "outside the managed runtime directory",
            ):
                runtime_bootstrap.remove_owned_tree(outside, runtime_root)

            self.assertTrue(outside.exists())

    def test_build_runtime_reports_venv_failure_and_removes_partial_tree(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            runtime_root = base / "runtime"
            runtime_root.mkdir()
            build_root = runtime_root / ".build-test"
            requirements = base / "runtime-requirements.txt"
            requirements.write_text("psutil==7.2.2\n", encoding="utf-8")

            def fail_venv(*_args, **_kwargs):
                build_root.mkdir()
                raise OSError("subprocess blocked")

            with (
                mock.patch.object(runtime_bootstrap.subprocess, "run", fail_venv),
                self.assertRaisesRegex(
                    runtime_bootstrap.RuntimeBootstrapError,
                    "could not create its isolated Python environment",
                ),
            ):
                runtime_bootstrap.build_runtime_environment(
                    build_root=build_root,
                    runtime_root=runtime_root,
                    requirements_path=requirements,
                    fingerprint="fingerprint",
                    cache_root=base / "cache",
                    platform_name="win32",
                )

            self.assertFalse(build_root.exists())

    def test_environment_ready_checks_marker_and_installed_versions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            python = root / "Scripts" / "python.exe"
            python.parent.mkdir()
            python.touch()
            (root / runtime_bootstrap.COMPLETION_MARKER).write_text(
                json.dumps({"fingerprint": "expected"}),
                encoding="utf-8",
            )

            completed = mock.Mock(returncode=0)
            with mock.patch.object(
                runtime_bootstrap.subprocess,
                "run",
                return_value=completed,
            ) as run:
                ready = runtime_bootstrap.environment_is_ready(
                    root,
                    fingerprint="expected",
                    requirements={"psutil": "7.2.2"},
                    platform_name="win32",
                )

        self.assertTrue(ready)
        self.assertEqual(run.call_args.args[0][0], str(python))

    def test_ready_runtime_is_reused_without_building(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            requirements_path = base / "runtime-requirements.txt"
            content = b"psutil==7.2.2\n"
            requirements_path.write_bytes(content)
            fingerprint = runtime_bootstrap.runtime_fingerprint(
                content,
                python_version=(3, 13, 1),
                cache_tag="cpython-313",
                platform_name="win32",
                machine="AMD64",
            )
            target = base / "runs" / ".skill-creator" / "runtime" / fingerprint
            python = runtime_bootstrap.virtualenv_python(target, "win32")
            python.parent.mkdir(parents=True)
            python.touch()
            build = mock.Mock()

            result = runtime_bootstrap.ensure_runtime_environment(
                run_root=base / "runs",
                requirements_path=requirements_path,
                cache_root=base / "cache",
                python_version=(3, 13, 1),
                cache_tag="cpython-313",
                platform_name="win32",
                machine="AMD64",
                build_environment=build,
                readiness_check=lambda root, **_kwargs: root == target,
            )

        self.assertEqual(result, python)
        build.assert_not_called()

    def test_corrupt_runtime_is_replaced_after_staging_succeeds(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            requirements_path = base / "runtime-requirements.txt"
            content = b"psutil==7.2.2\n"
            requirements_path.write_bytes(content)
            run_root = base / "runs"
            fingerprint = runtime_bootstrap.runtime_fingerprint(
                content,
                python_version=(3, 13, 1),
                cache_tag="cpython-313",
                platform_name="win32",
                machine="AMD64",
            )
            target = run_root / ".skill-creator" / "runtime" / fingerprint
            target.mkdir(parents=True)
            (target / "corrupt.txt").write_text("corrupt", encoding="utf-8")

            def fake_build(build_root, fingerprint, platform_name, **_kwargs):
                python = runtime_bootstrap.virtualenv_python(
                    build_root,
                    platform_name,
                )
                python.parent.mkdir(parents=True)
                python.touch()
                (build_root / runtime_bootstrap.COMPLETION_MARKER).write_text(
                    json.dumps({"fingerprint": fingerprint}),
                    encoding="utf-8",
                )

            def fake_ready(root, fingerprint, platform_name, **_kwargs):
                marker = root / runtime_bootstrap.COMPLETION_MARKER
                return (
                    marker.is_file()
                    and runtime_bootstrap.virtualenv_python(
                        root,
                        platform_name,
                    ).is_file()
                    and json.loads(marker.read_text(encoding="utf-8"))["fingerprint"]
                    == fingerprint
                )

            result = runtime_bootstrap.ensure_runtime_environment(
                run_root=run_root,
                requirements_path=requirements_path,
                cache_root=base / "cache",
                python_version=(3, 13, 1),
                cache_tag="cpython-313",
                platform_name="win32",
                machine="AMD64",
                build_environment=fake_build,
                readiness_check=fake_ready,
            )

            self.assertEqual(
                result,
                runtime_bootstrap.virtualenv_python(target, "win32"),
            )
            self.assertFalse((target / "corrupt.txt").exists())
            self.assertEqual(
                list(target.parent.glob(".corrupt-*")),
                [],
            )

    def test_interrupted_build_removes_unpublished_environment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            requirements_path = base / "runtime-requirements.txt"
            requirements_path.write_text("psutil==7.2.2\n", encoding="utf-8")
            run_root = base / "runs"

            def interrupt_build(**_kwargs):
                raise KeyboardInterrupt

            with self.assertRaises(KeyboardInterrupt):
                runtime_bootstrap.ensure_runtime_environment(
                    run_root=run_root,
                    requirements_path=requirements_path,
                    cache_root=base / "cache",
                    python_version=(3, 13, 1),
                    cache_tag="cpython-313",
                    platform_name="win32",
                    machine="AMD64",
                    build_environment=interrupt_build,
                    readiness_check=lambda _root, **_kwargs: False,
                )

            runtime_root = run_root / ".skill-creator" / "runtime"
            self.assertEqual(list(runtime_root.glob(".build-*")), [])

    def test_concurrent_environment_creation_publishes_one_runtime(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            requirements_path = base / "runtime-requirements.txt"
            requirements_path.write_text("psutil==7.2.2\n", encoding="utf-8")
            run_root = base / "run root"
            barrier = threading.Barrier(2)

            def fake_build(
                build_root,
                runtime_root,
                requirements_path,
                fingerprint,
                cache_root,
                platform_name,
            ):
                del runtime_root, requirements_path, cache_root
                python = runtime_bootstrap.virtualenv_python(
                    build_root,
                    platform_name,
                )
                python.parent.mkdir(parents=True)
                python.touch()
                (build_root / runtime_bootstrap.COMPLETION_MARKER).write_text(
                    json.dumps({"fingerprint": fingerprint}),
                    encoding="utf-8",
                )
                barrier.wait()

            def fake_ready(root, fingerprint, requirements, platform_name):
                del requirements
                marker = root / runtime_bootstrap.COMPLETION_MARKER
                if not marker.is_file():
                    return False
                return (
                    json.loads(marker.read_text(encoding="utf-8"))["fingerprint"]
                    == fingerprint
                    and runtime_bootstrap.virtualenv_python(
                        root,
                        platform_name,
                    ).is_file()
                )

            results = []
            errors = []

            def ensure():
                try:
                    results.append(
                        runtime_bootstrap.ensure_runtime_environment(
                            run_root=run_root,
                            requirements_path=requirements_path,
                            cache_root=base / "cache",
                            python_version=(3, 13, 1),
                            cache_tag="cpython-313",
                            platform_name="win32",
                            machine="AMD64",
                            build_environment=fake_build,
                            readiness_check=fake_ready,
                        )
                    )
                except BaseException as error:
                    errors.append(error)

            threads = [threading.Thread(target=ensure) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0], results[1])

    def test_preflight_returns_managed_python_when_dependencies_are_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            run_root = Path(temp_dir) / "runs"
            managed_python = Path(temp_dir) / "runtime" / "python.exe"
            argv = ["--run-root", str(run_root), "--provider", "codex"]

            with (
                mock.patch.object(
                    runtime_bootstrap,
                    "validate_python_version",
                ),
                mock.patch.object(
                    runtime_bootstrap,
                    "validate_run_root_is_not_in_git_workspace",
                ),
                mock.patch.object(
                    runtime_bootstrap,
                    "read_locked_requirements",
                    return_value={"psutil": "7.2.2"},
                ),
                mock.patch.object(
                    runtime_bootstrap,
                    "current_environment_is_compatible",
                    return_value=False,
                ),
                mock.patch.object(
                    runtime_bootstrap,
                    "ensure_runtime_environment",
                    return_value=managed_python,
                ),
            ):
                result = runtime_bootstrap.prepare_evaluator_runtime(argv)

        self.assertEqual(result, managed_python)


if __name__ == "__main__":
    unittest.main()

"""Coordinate prepared eval execution and write run-level artifacts."""

import json
import sys
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from .eval_definitions import write_eval_metadata
from .eval_job import kill_active_processes, run_single_job

if TYPE_CHECKING:
    from .prepare_fixture import PreparedEval


@dataclass(frozen=True)
class EvalRunOptions:
    """Execution options shared by every job in one eval run."""

    eval_definitions_path: Path
    workspace: Path
    iteration: int
    provider_name: str
    model: str | None
    effort: str | None
    max_parallel: int
    timeout: int
    total_timeout: int | None
    run_types: list[str]
    run_root: Path
    grading_job_factory: Callable | None = None


@dataclass(frozen=True)
class EvalJobSpec:
    """Resolved inputs needed to run one eval/run-type pair."""

    eval_def: dict
    run_type: str
    run_dir: str
    fixture_path: str | None

    @property
    def eval_id(self) -> int:
        return self.eval_def["id"]


@dataclass
class EvalProgress:
    """Track completed job summaries and write progress snapshots."""

    path: Path
    start_time: float
    total_jobs: int
    summaries: list[dict] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def record(self, summary: dict) -> None:
        with self.lock:
            self.summaries.append(summary)
            self.write()

    def write(self) -> None:
        elapsed = time.time() - self.start_time
        completed = len(self.summaries)
        succeeded = sum(
            1 for summary in self.summaries if summary.get("status") == "success"
        )
        failed = completed - succeeded
        cost_so_far = sum(summary.get("cost_usd", 0) for summary in self.summaries)
        progress = {
            "total": self.total_jobs,
            "completed": completed,
            "succeeded": succeeded,
            "failed": failed,
            "running": self.total_jobs - completed,
            "elapsed_seconds": round(elapsed, 1),
            "cost_usd": round(cost_so_far, 6),
            "completed_runs": [
                f"eval-{summary.get('eval_id')}/{summary.get('run_type')}: "
                f"{summary.get('status')}"
                for summary in self.summaries
            ],
        }
        self.path.write_text(json.dumps(progress, indent=2), encoding="utf-8")


@dataclass
class EvalRun:
    """Run all selected eval/run-type pairs for one iteration."""

    options: EvalRunOptions
    provider: object
    evals_data: dict
    evals_list: list[dict]
    prepared_evals: list["PreparedEval"]

    def run(self) -> dict:
        print(
            f"Running {len(self.evals_list)} evals from "
            f"{self.options.eval_definitions_path}"
        )
        print(f"Provider: {self.options.provider_name}")
        print(f"Using prepared run root {self.options.run_root}")

        iteration_dir = self.options.workspace / f"iteration-{self.options.iteration}"
        iteration_dir.mkdir(parents=True, exist_ok=True)
        write_eval_metadata(iteration_dir, self.evals_list)

        jobs = self.build_jobs()
        self.print_launch_summary(len(jobs))

        start_time = time.time()
        summaries = self.run_jobs(jobs, iteration_dir, start_time)
        manifest = self.write_run_manifest(iteration_dir, start_time, summaries)
        self.print_final_summary(len(jobs), start_time, summaries, iteration_dir)
        return manifest

    @property
    def skill_name(self) -> str:
        return self.evals_data.get(
            "skill_name", self.options.eval_definitions_path.stem
        )

    def build_jobs(self) -> list[EvalJobSpec]:
        jobs = []
        prepared_by_eval_id = {
            str(entry.eval_id): entry for entry in self.prepared_evals
        }
        for eval_def in self.evals_list:
            eval_id = str(eval_def["id"])
            prepared_eval = prepared_by_eval_id.get(eval_id)
            for run_type in self.options.run_types:
                job = self.job_for_run_type(
                    eval_def,
                    run_type,
                    prepared_eval,
                )
                if job is not None:
                    jobs.append(job)
        return jobs

    def job_for_run_type(
        self,
        eval_def: dict,
        run_type: str,
        prepared_eval: "PreparedEval | None",
    ) -> EvalJobSpec | None:
        run_dir = self.run_dir_for_run_type(prepared_eval, run_type)
        if not run_dir:
            print(
                "Warning: no run directory for "
                f"eval {eval_def['id']} run type {run_type}",
                file=sys.stderr,
            )
            return None

        fixture_path = self.fixture_path_for_run_type(prepared_eval, run_type)
        return EvalJobSpec(eval_def, run_type, run_dir, fixture_path)

    def run_dir_for_run_type(
        self, prepared_eval: "PreparedEval | None", run_type: str
    ) -> str | None:
        if prepared_eval is None:
            return None
        if run_type == "skill":
            return str(prepared_eval.skill_run_path)
        if run_type == "baseline":
            return str(prepared_eval.baseline_run_path)
        return None

    def fixture_path_for_run_type(
        self, prepared_eval: "PreparedEval", run_type: str
    ) -> str | None:
        if run_type == "skill":
            fixture_path = prepared_eval.skill_fixture_path
        else:
            fixture_path = prepared_eval.baseline_fixture_path
        return str(fixture_path) if fixture_path else None

    def print_launch_summary(self, total_jobs: int) -> None:
        print(
            f"Launching {total_jobs} runs "
            f"({len(self.evals_list)} evals x {len(self.options.run_types)} run types: "
            f"{', '.join(self.options.run_types)})"
        )
        print(
            f"Max parallel: {self.options.max_parallel}, "
            f"timeout per turn: {self.options.timeout}s"
        )
        if self.options.total_timeout:
            print(f"Total timeout: {self.options.total_timeout}s")
        print()

    def run_jobs(
        self,
        jobs: list[EvalJobSpec],
        iteration_dir: Path,
        start_time: float,
    ) -> list[dict]:
        deadline = (
            start_time + self.options.total_timeout
            if self.options.total_timeout
            else None
        )
        progress = EvalProgress(
            iteration_dir / "progress.json",
            start_time,
            len(jobs),
        )
        progress.write()

        executor = ThreadPoolExecutor(max_workers=self.options.max_parallel)
        try:
            futures = self.submit_jobs(executor, jobs, iteration_dir, deadline)
            for future in as_completed(futures):
                job = futures[future]
                progress.record(self.future_summary(future, job))
        except BaseException:
            kill_active_processes()
            executor.shutdown(wait=False, cancel_futures=True)
            raise
        else:
            executor.shutdown(wait=True)

        return progress.summaries

    def submit_jobs(
        self,
        executor: ThreadPoolExecutor,
        jobs: list[EvalJobSpec],
        iteration_dir: Path,
        deadline: float | None,
    ) -> dict:
        futures = {}
        for job in jobs:
            future = executor.submit(
                run_single_job,
                job.eval_def,
                job.run_type,
                job.run_dir,
                job.fixture_path,
                iteration_dir,
                self.provider,
                self.options.model,
                self.options.effort,
                self.options.timeout,
                deadline,
                self.options.grading_job_factory,
            )
            futures[future] = job
        return futures

    def future_summary(self, future, job: EvalJobSpec) -> dict:
        try:
            return future.result()
        except Exception as error:
            return self.exception_summary(job.eval_id, job.run_type, error)

    def exception_summary(self, eval_id: int, run_type: str, error: Exception) -> dict:
        print(f"  [{run_type}] eval-{eval_id} EXCEPTION: {error}", file=sys.stderr)
        return {
            "eval_id": eval_id,
            "run_type": run_type,
            "status": "exception",
            "error": str(error),
        }

    def write_run_manifest(
        self,
        iteration_dir: Path,
        start_time: float,
        summaries: list[dict],
    ) -> dict:
        manifest = {
            "skill_name": self.skill_name,
            "eval_definitions_path": str(self.options.eval_definitions_path),
            "iteration": self.options.iteration,
            "provider": self.options.provider_name,
            "model": self.options.model or "default",
            "effort": self.options.effort or "default",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "total_elapsed_seconds": round(time.time() - start_time, 1),
            "runs": summaries,
        }
        manifest_path = iteration_dir / "run_manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    def print_final_summary(
        self,
        total_jobs: int,
        start_time: float,
        summaries: list[dict],
        iteration_dir: Path,
    ) -> None:
        elapsed = time.time() - start_time
        succeeded = sum(
            1 for summary in summaries if summary.get("status") == "success"
        )
        failed = total_jobs - succeeded
        total_cost = sum(summary.get("cost_usd", 0) for summary in summaries)

        print()
        print(f"Done. {succeeded}/{total_jobs} runs succeeded in {elapsed:.0f}s")
        if failed:
            self.print_failed_runs(summaries)
        print(f"  Total cost: ${total_cost:.4f}")
        print(f"  Results: {iteration_dir}")
        print(f"  Manifest: {iteration_dir / 'run_manifest.json'}")

    def print_failed_runs(self, summaries: list[dict]) -> None:
        print("  failed runs:")
        for summary in summaries:
            if summary.get("status") == "success":
                continue
            error = summary.get("error", summary.get("status"))
            print(f"    eval-{summary['eval_id']} [{summary['run_type']}]: {error}")

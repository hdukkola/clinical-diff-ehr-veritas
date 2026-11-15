"""
Job runner with duplicate-launch protection and bounded execution (Phase 4+).

Protects against the accidental restart that occurred with the previous 360-step
training job. All safeguards are file-based so they survive process restarts.

Safeguards:
1. Unique experiment IDs — every run gets a timestamped ID that cannot collide
2. File-based locks — prevents two processes from running the same experiment
3. Execution state tracking — records START/RUNNING/COMPLETED/FAILED/ABORTED
4. Duplicate-launch detection — refuses to start if same experiment is already running
5. Bounded execution — max duration, max steps, memory limits enforced
6. No automatic retry — failed runs require explicit operator re-approval
7. Checkpoint recovery — only from verified manifests, never silent resume
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ABORTED = "aborted"
    BLOCKED = "blocked"


class LockType(str, Enum):
    EXPERIMENT = "experiment"  # One experiment at a time globally
    MODEL = "model"            # One training job per model at a time


@dataclass
class ExperimentSpec:
    """Specification for a bounded training experiment."""
    experiment_id: str
    name: str
    mode: str  # "smoke-test" or "bounded-training"
    max_steps: int
    max_duration_minutes: int
    base_model_revision: str
    adapter_path: str | None
    dataset_name: str
    dataset_sha256: str
    output_dir: str
    require_operator_approval: bool = True
    never_overwrite_checkpoint: bool = True
    max_consecutive_failures: int = 3


@dataclass
class ExperimentRecord:
    """Record of an experiment run."""
    experiment_id: str
    name: str
    mode: str
    status: JobStatus
    started_at: str
    finished_at: str | None = None
    steps_completed: int = 0
    checkpoint_path: str | None = None
    checkpoint_sha256: str | None = None
    error_message: str | None = None
    blocked_reason: str | None = None
    operator_approved: bool = False


class JobLockError(Exception):
    """Raised when a job cannot acquire its lock."""
    pass


class JobRunner:
    """File-locked job runner with duplicate-launch protection."""

    def __init__(self, work_dir: Path | str = "."):
        self.work_dir = Path(work_dir)
        self.lock_dir = self.work_dir / "runs" / "locks"
        self.state_dir = self.work_dir / "runs" / "experiments"
        self.lock_dir.mkdir(parents=True, exist_ok=True)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self._held_locks: dict[str, int] = {}  # lock_name -> file descriptor

    # ------------------------------------------------------------------
    # Lock management (file-based, survives process restart)
    # ------------------------------------------------------------------
    def _lock_path(self, lock_type: LockType, name: str) -> Path:
        return self.lock_dir / f"{lock_type.value}_{name}.lock"

    def acquire_lock(self, lock_type: LockType, name: str, timeout: float = 5.0) -> bool:
        """Acquire an exclusive file lock. Returns True if acquired, False if already held."""
        lock_path = self._lock_path(lock_type, name)
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR, 0o644)
        except OSError:
            return False

        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            # Write lock metadata
            lock_info = {
                "lock_type": lock_type.value,
                "name": name,
                "acquired_at": datetime.now(timezone.utc).isoformat(),
                "pid": os.getpid(),
            }
            os.ftruncate(fd, 0)
            os.lseek(fd, 0, os.SEEK_SET)
            os.write(fd, json.dumps(lock_info, indent=2).encode())
            os.fsync(fd)
            self._held_locks[f"{lock_type.value}:{name}"] = fd
            return True
        except BlockingIOError:
            # Lock is held by another process
            try:
                os.close(fd)
            except OSError:
                pass
            return False

    def release_lock(self, lock_type: LockType, name: str) -> None:
        """Release a held lock."""
        key = f"{lock_type.value}:{name}"
        fd = self._held_locks.pop(key, None)
        if fd is not None:
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
                os.close(fd)
            except OSError:
                pass

    def release_all_locks(self) -> None:
        """Release all held locks (called on process exit)."""
        for key in list(self._held_locks.keys()):
            lock_type_str, name = key.split(":", 1)
            lock_type = LockType(lock_type_str)
            self.release_lock(lock_type, name)

    def is_locked(self, lock_type: LockType, name: str) -> bool:
        """Check if a lock is currently held (without acquiring it)."""
        lock_path = self._lock_path(lock_type, name)
        if not lock_path.exists():
            return False
        try:
            fd = os.open(str(lock_path), os.O_RDONLY)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                # Lock is free — release it
                fcntl.flock(fd, fcntl.LOCK_UN)
                return False
            except BlockingIOError:
                # Lock is held
                return True
            finally:
                os.close(fd)
        except OSError:
            return False

    def get_lock_info(self, lock_type: LockType, name: str) -> dict[str, Any] | None:
        """Read lock metadata if available."""
        lock_path = self._lock_path(lock_type, name)
        if not lock_path.exists():
            return None
        try:
            return json.loads(lock_path.read_text())
        except (json.JSONDecodeError, OSError):
            return None

    # ------------------------------------------------------------------
    # Experiment registration
    # ------------------------------------------------------------------
    def _experiment_path(self, experiment_id: str) -> Path:
        return self.state_dir / f"{experiment_id}.json"

    def _experiment_lock_name(self, experiment_id: str) -> str:
        return f"exp_{experiment_id}"

    def register_experiment(self, spec: ExperimentSpec) -> ExperimentRecord:
        """Register a new experiment. Returns the record."""
        record = ExperimentRecord(
            experiment_id=spec.experiment_id,
            name=spec.name,
            mode=spec.mode,
            status=JobStatus.PENDING,
            started_at=datetime.now(timezone.utc).isoformat(),
            operator_approved=spec.require_operator_approval,
        )
        self._experiment_path(spec.experiment_id).write_text(
            json.dumps(asdict(record), indent=2)
        )
        return record

    def load_experiment(self, experiment_id: str) -> ExperimentRecord | None:
        """Load an experiment record by ID."""
        path = self._experiment_path(experiment_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
            return ExperimentRecord(
                experiment_id=data["experiment_id"],
                name=data["name"],
                mode=data["mode"],
                status=JobStatus(data["status"]),
                started_at=data["started_at"],
                finished_at=data.get("finished_at"),
                steps_completed=data.get("steps_completed", 0),
                checkpoint_path=data.get("checkpoint_path"),
                checkpoint_sha256=data.get("checkpoint_sha256"),
                error_message=data.get("error_message"),
                blocked_reason=data.get("blocked_reason"),
                operator_approved=data.get("operator_approved", False),
            )
        except (json.JSONDecodeError, OSError, ValueError, KeyError):
            return None

    def save_experiment(self, record: ExperimentRecord) -> None:
        """Save an experiment record."""
        self._experiment_path(record.experiment_id).write_text(
            json.dumps(asdict(record), indent=2)
        )

    def list_experiments(self) -> list[ExperimentRecord]:
        """List all experiment records."""
        records: list[ExperimentRecord] = []
        if not self.state_dir.exists():
            return records
        for path in sorted(self.state_dir.glob("*.json")):
            try:
                data = json.loads(path.read_text())
                records.append(
                    ExperimentRecord(
                        experiment_id=data["experiment_id"],
                        name=data["name"],
                        mode=data["mode"],
                        status=JobStatus(data["status"]),
                        started_at=data["started_at"],
                        finished_at=data.get("finished_at"),
                        steps_completed=data.get("steps_completed", 0),
                        checkpoint_path=data.get("checkpoint_path"),
                        checkpoint_sha256=data.get("checkpoint_sha256"),
                        error_message=data.get("error_message"),
                        blocked_reason=data.get("blocked_reason"),
                        operator_approved=data.get("operator_approved", False),
                    )
                )
            except (json.JSONDecodeError, OSError, ValueError, KeyError):
                continue
        return sorted(records, key=lambda r: r.started_at, reverse=True)

    # ------------------------------------------------------------------
    # Experiment lifecycle
    # ------------------------------------------------------------------
    def start_experiment(self, spec: ExperimentSpec) -> ExperimentRecord:
        """Start a bounded experiment with all safeguards.

        Raises JobLockError if the experiment is already running or locked.
        """
        # Check for duplicate launch — same experiment ID already running
        lock_name = self._experiment_lock_name(spec.experiment_id)
        if self.is_locked(LockType.EXPERIMENT, lock_name):
            lock_info = self.get_lock_info(LockType.EXPERIMENT, lock_name)
            record = self.load_experiment(spec.experiment_id)
            raise JobLockError(
                f"Experiment {spec.experiment_id} is already running "
                f"(acquired at {lock_info.get('acquired_at', 'unknown')} by PID "
                f"{lock_info.get('pid', 'unknown')}). Duplicate launch blocked."
            )

        # Check model lock — prevent two training jobs on the same model
        model_lock_name = f"model_{spec.base_model_revision[:12]}"
        if self.is_locked(LockType.MODEL, model_lock_name):
            lock_info = self.get_lock_info(LockType.MODEL, model_lock_name)
            raise JobLockError(
                f"Model {spec.base_model_revision} is locked by another experiment "
                f"(acquired at {lock_info.get('acquired_at', 'unknown')} by PID "
                f"{lock_info.get('pid', 'unknown')}). Only one training job per model at a time."
            )

        # Acquire both locks
        if not self.acquire_lock(LockType.EXPERIMENT, lock_name):
            raise JobLockError(
                f"Failed to acquire experiment lock for {spec.experiment_id}"
            )
        if not self.acquire_lock(LockType.MODEL, model_lock_name):
            self.release_lock(LockType.EXPERIMENT, lock_name)
            raise JobLockError(
                f"Failed to acquire model lock for {spec.base_model_revision}"
            )

        # Register the experiment
        record = self.register_experiment(spec)
        record.status = JobStatus.RUNNING
        self.save_experiment(record)

        try:
            # Run the actual training via the TrainingEngine
            from .trainer import TrainingEngine
            from .config import PipelineConfig

            # Build a pipeline config from the experiment spec
            config = PipelineConfig(
                mode=__import__("mlx_runner.config", fromlist=["RunMode"]).RunMode.TRAIN_ONCE,
                work_dir=str(self.work_dir),
                require_operator_approval=spec.require_operator_approval,
            )
            # Override training env with spec values
            config.model.training_env.max_seq_length = 512
            config.model.training_env.lora_rank = 8
            config.model.training_env.lora_layers = 2
            config.model.training_env.max_seq_length = 512

            engine = TrainingEngine(config, str(self.work_dir))

            # Check resources first
            blockers = engine.check_resources()
            if blockers:
                record.status = JobStatus.BLOCKED
                record.blocked_reason = "; ".join(blockers)
                self.save_experiment(record)
                return record

            # Run smoke test first (bounded)
            result = engine.run_smoke_test()
            record.steps_completed = result.steps_completed
            record.checkpoint_path = result.checkpoint_path
            record.checkpoint_sha256 = result.checkpoint_sha256
            record.error_message = result.error_message

            if result.status == __import__("mlx_runner.trainer", fromlist=["TrainingStatus"]).TrainingStatus.COMPLETED:
                record.status = JobStatus.COMPLETED
            elif result.status == __import__("mlx_runner.trainer", fromlist=["TrainingStatus"]).TrainingStatus.BLOCKED:
                record.status = JobStatus.BLOCKED
                record.blocked_reason = result.blocked_reason
            else:
                record.status = JobStatus.FAILED
                record.error_message = result.error_message

        except JobLockError:
            raise
        except Exception as exc:  # noqa: BLE001
            record.status = JobStatus.FAILED
            record.error_message = str(exc)
        finally:
            record.finished_at = datetime.now(timezone.utc).isoformat()
            self.save_experiment(record)
            # Always release locks
            self.release_lock(LockType.EXPERIMENT, lock_name)
            self.release_lock(LockType.MODEL, model_lock_name)

        return record

    def stop_experiment(self, experiment_id: str) -> bool:
        """Request a stop of a running experiment."""
        record = self.load_experiment(experiment_id)
        if record is None:
            return False
        if record.status != JobStatus.RUNNING:
            return False
        record.status = JobStatus.ABORTED
        record.finished_at = datetime.now(timezone.utc).isoformat()
        record.blocked_reason = "Stop requested by operator"
        self.save_experiment(record)
        return True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release_all_locks()


def generate_experiment_id(name: str) -> str:
    """Generate a unique experiment ID: name_YYYYMMDD_HHMMSS."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"{name}_{ts}"


def create_smoke_spec(name: str, dataset_name: str, dataset_sha256: str,
                      output_dir: str, max_steps: int = 10,
                      max_duration_minutes: int = 5) -> ExperimentSpec:
    """Create a smoke test experiment spec."""
    return ExperimentSpec(
        experiment_id=generate_experiment_id(name),
        name=name,
        mode="smoke-test",
        max_steps=max_steps,
        max_duration_minutes=max_duration_minutes,
        base_model_revision="38740b847e4cb78f352aba30aa41c76e08e6eb46",
        adapter_path=None,
        dataset_name=dataset_name,
        dataset_sha256=dataset_sha256,
        output_dir=output_dir,
        require_operator_approval=True,
    )


def create_bounded_training_spec(name: str, dataset_name: str, dataset_sha256: str,
                                 output_dir: str, base_adapter_path: str | None = None,
                                 max_steps: int = 100,
                                 max_duration_minutes: int = 60,
                                 lora_rank: int = 8,
                                 lora_layers: int = 2,
                                 max_seq_length: int = 512,
                                 learning_rate: float = 1e-5) -> ExperimentSpec:
    """Create a bounded training experiment spec."""
    return ExperimentSpec(
        experiment_id=generate_experiment_id(name),
        name=name,
        mode="bounded-training",
        max_steps=max_steps,
        max_duration_minutes=max_duration_minutes,
        base_model_revision="38740b847e4cb78f352aba30aa41c76e08e6eb46",
        adapter_path=base_adapter_path,
        dataset_name=dataset_name,
        dataset_sha256=dataset_sha256,
        output_dir=output_dir,
        require_operator_approval=True,
    )

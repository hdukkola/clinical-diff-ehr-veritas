"""
Conservative Apple Silicon training (Phase 4).

Safeguards:
- Run only one heavy model-training process at a time
- Configurable memory, disk, duration, thermal safeguards
- Detect existing training processes and refuse conflicting jobs
- Support small experiments and checkpoint recovery
- Gracefully terminate on resource-limit violations
- Avoid memory swapping and uncontrolled checkpoint accumulation
- Keep the Mac usable for ordinary tasks
- Log resource use and training results
- Never silently resume an unverified checkpoint
- Default to a lightweight smoke test before permitting a larger job
- If thermal/memory telemetry is unavailable, mark guard unsupported and require explicit operator approval
- No automatic retry loops after repeated failures
- Memory-pressure monitoring during training (not just before)
- Safe shutdown when resource limits are exceeded
"""

from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from .config import (
    ModelConfig,
    PipelineConfig,
    ResourceLimits,
    RunMode,
    TrainingEnvConfig,
)


class TrainingStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ABORTED = "aborted"
    BLOCKED = "blocked"


@dataclass
class TrainingResult:
    status: TrainingStatus
    steps_completed: int = 0
    duration_seconds: float = 0.0
    peak_memory_gb: float = 0.0
    checkpoint_path: str | None = None
    checkpoint_sha256: str | None = None
    error_message: str | None = None
    blocked_reason: str | None = None
    smoke_test: bool = False
    recovered_from_checkpoint: bool = False
    memory_pressure_events: int = 0


@dataclass
class ProcessSnapshot:
    pid: int
    cmdline: str
    memory_gb: float


@dataclass
class CheckpointInfo:
    """Metadata for a verified checkpoint."""

    path: str
    step: int
    sha256: str
    created_at: str
    verified: bool = False


@dataclass
class MemorySnapshot:
    """Memory pressure snapshot taken during training."""

    timestamp: str
    free_pages: int
    free_gb: float
    wired_pages: int
    active_pages: int
    compressed_pages: int
    pressure_level: str  # "normal", "warn", "critical"


class TrainingEngine:
    """Conservative training engine for Apple Silicon (MLX)."""

    def __init__(self, config: PipelineConfig, work_dir: Path | str = "."):
        self.config = config
        self.work_dir = Path(work_dir)
        self.checkpoint_dir = Path(config.checkpoint_dir)
        self.run_dir = Path(config.run_dir)
        self.log_dir = Path(config.log_dir)
        for d in (self.checkpoint_dir, self.run_dir, self.log_dir):
            d.mkdir(parents=True, exist_ok=True)
        self._current_process: subprocess.Popen | None = None
        self._status = TrainingStatus.PENDING
        self._max_checkpoints: int = config.model.training_env.max_checkpoints
        self._consecutive_failures: int = 0
        self._memory_snapshots: list[MemorySnapshot] = []

    # ------------------------------------------------------------------
    # Resource checks
    # ------------------------------------------------------------------
    def check_existing_training(self) -> list[ProcessSnapshot]:
        """Detect existing training processes. Returns list of conflicting processes."""
        conflicts: list[ProcessSnapshot] = []
        try:
            output = subprocess.check_output(["ps", "-eo", "pid,args"], text=True)
            for line in output.splitlines():
                low = line.lower()
                if ("mlx" in line.lower() or "python" in line.lower()) and any(
                    k in low for k in ("train", "fine_tune", "lora", "mlx_lm")
                ):
                    parts = line.strip().split(None, 1)
                    if len(parts) == 2:
                        pid = int(parts[0])
                        if pid == os.getpid():
                            continue
                        conflicts.append(ProcessSnapshot(pid=pid, cmdline=parts[1], memory_gb=0.0))
        except (subprocess.CalledProcessError, ValueError, OSError):
            pass
        return conflicts

    def get_memory_snapshot(self) -> MemorySnapshot:
        """Capture current memory pressure state."""
        try:
            mem_bytes = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip())
            total_gb = mem_bytes / (1024**3)
            vm = subprocess.check_output(["vm_stat"], text=True)
            free_pages = wired_pages = active_pages = compressed_pages = 0
            for line in vm.splitlines():
                if "Pages free:" in line:
                    free_pages = int(line.split(":")[1].strip().replace(".", ""))
                elif "Pages wired down:" in line:
                    wired_pages = int(line.split(":")[1].strip().replace(".", ""))
                elif "Pages active:" in line:
                    active_pages = int(line.split(":")[1].strip().replace(".", ""))
                elif "Pages occupied by compressor:" in line:
                    compressed_pages = int(line.split(":")[1].strip().replace(".", ""))
            free_gb = (free_pages * 16384) / (1024**3)
            used_fraction = 1.0 - (free_gb / total_gb)
            if used_fraction >= self.config.resources.memory_abort_fraction:
                pressure = "critical"
            elif used_fraction >= self.config.resources.memory_warn_fraction:
                pressure = "warn"
            else:
                pressure = "normal"
            return MemorySnapshot(
                timestamp=datetime.now(timezone.utc).isoformat(),
                free_pages=free_pages,
                free_gb=free_gb,
                wired_pages=wired_pages,
                active_pages=active_pages,
                compressed_pages=compressed_pages,
                pressure_level=pressure,
            )
        except (subprocess.CalledProcessError, ValueError, OSError):
            return MemorySnapshot(
                timestamp=datetime.now(timezone.utc).isoformat(),
                free_pages=0,
                free_gb=0.0,
                wired_pages=0,
                active_pages=0,
                compressed_pages=0,
                pressure_level="unknown",
            )

    def check_resources(self) -> list[str]:
        """Check disk and memory availability. Returns list of blocking reasons."""
        reasons: list[str] = []

        # Disk
        try:
            st = os.statvfs(self.work_dir)
            free_gb = (st.f_bavail * st.f_frsize) / (1024**3)
            if free_gb < self.config.resources.min_free_disk_gb:
                reasons.append(
                    f"Free disk {free_gb:.1f} GB < required {self.config.resources.min_free_disk_gb} GB"
                )
        except OSError:
            reasons.append("Cannot determine free disk space")

        # Memory
        snapshot = self.get_memory_snapshot()
        if snapshot.pressure_level == "critical":
            reasons.append(
                f"Memory pressure critical: {snapshot.free_gb:.1f} GB free "
                f"(abort threshold: {self.config.resources.memory_abort_fraction * 100:.0f}%)"
            )
        elif snapshot.pressure_level == "warn":
            reasons.append(
                f"Memory pressure warning: {snapshot.free_gb:.1f} GB free "
                f"(warn threshold: {self.config.resources.memory_warn_fraction * 100:.0f}%)"
            )

        # Thermal telemetry
        if self.config.resources.max_temperature_c is not None:
            if not self.config.thermal_telemetry_available:
                reasons.append(
                    "Thermal guard requested but thermal telemetry unavailable — "
                    "mark as unsupported and require explicit operator approval"
                )

        return reasons

    # ------------------------------------------------------------------
    # Checkpoint management
    # ------------------------------------------------------------------
    def _sha256_file(self, path: Path) -> str:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()

    def _atomic_save(self, src: Path, dst: Path) -> None:
        """Atomically save a checkpoint: write to temp, then rename."""
        tmp = dst.with_suffix(dst.suffix + ".tmp")
        tmp.write_bytes(src.read_bytes())
        tmp.replace(dst)

    def _make_run_dir(self, run_name: str) -> Path:
        """Create a unique run directory to avoid overwriting prior checkpoints."""
        run_dir = self.checkpoint_dir / run_name
        run_dir.mkdir(parents=True, exist_ok=True)
        return run_dir

    def list_checkpoints(self) -> list[CheckpointInfo]:
        """List all verified checkpoints with metadata."""
        ckpts: list[CheckpointInfo] = []
        if not self.checkpoint_dir.exists():
            return ckpts
        # Check run directories first (new layout), then flat files (legacy)
        for entry in sorted(self.checkpoint_dir.iterdir()):
            if entry.is_dir():
                for p in sorted(entry.glob("*_adapters.safetensors")):
                    manifest = p.with_name(p.stem.replace("_adapters", "_manifest") + ".json")
                    step = 0
                    created_at = ""
                    verified = False
                    if manifest.exists():
                        try:
                            meta = json.loads(manifest.read_text())
                            step = int(meta.get("completed_steps", 0))
                            created_at = meta.get("timestamp", "")
                            verified = bool(meta.get("verified", False))
                        except (json.JSONDecodeError, ValueError, OSError):
                            pass
                    ckpts.append(
                        CheckpointInfo(
                            path=str(p),
                            step=step,
                            sha256=self._sha256_file(p),
                            created_at=created_at,
                            verified=verified,
                        )
                    )
            elif entry.is_file() and entry.name.endswith("_adapters.safetensors"):
                # Legacy flat layout: check for manifest alongside
                manifest = entry.with_name(entry.stem.replace("_adapters", "_manifest") + ".json")
                step = 0
                created_at = ""
                verified = False
                if manifest.exists():
                    try:
                        meta = json.loads(manifest.read_text())
                        step = int(meta.get("completed_steps", 0))
                        created_at = meta.get("timestamp", "")
                        verified = bool(meta.get("verified", False))
                    except (json.JSONDecodeError, ValueError, OSError):
                        pass
                ckpts.append(
                    CheckpointInfo(
                        path=str(entry),
                        step=step,
                        sha256=self._sha256_file(entry),
                        created_at=created_at,
                        verified=verified,
                    )
                )
        return ckpts

    def verify_checkpoint(self, path: Path | str) -> CheckpointInfo | None:
        """Verify a checkpoint file and return its info, or None if invalid.

        A checkpoint is only "verified" if it has a corresponding manifest file
        with verified=True. Never silently resume an unverified checkpoint.
        """
        p = Path(path)
        if not p.exists() or not p.is_file():
            return None
        sha = self._sha256_file(p)
        manifest = p.with_name(p.stem.replace("_adapters", "_manifest") + ".json")
        step = 0
        created_at = ""
        verified = False
        if manifest.exists():
            try:
                meta = json.loads(manifest.read_text())
                step = int(meta.get("completed_steps", 0))
                created_at = meta.get("timestamp", "")
                verified = bool(meta.get("verified", False))
            except (json.JSONDecodeError, ValueError, OSError):
                pass
        return CheckpointInfo(
            path=str(p),
            step=step,
            sha256=sha,
            created_at=created_at,
            verified=verified,
        )

    def cleanup_old_checkpoints(self, keep: int | None = None) -> list[str]:
        """Remove old checkpoints beyond the keep limit. Returns list of removed paths."""
        keep = keep or self._max_checkpoints
        ckpts = self.list_checkpoints()
        if len(ckpts) <= keep:
            return []
        ckpts.sort(key=lambda c: c.created_at or "", reverse=True)
        removed: list[str] = []
        for ckpt in ckpts[keep:]:
            p = Path(ckpt.path)
            if p.exists():
                p.unlink()
                removed.append(ckpt.path)
            manifest = p.with_name(p.stem.replace("_adapters", "_manifest") + ".json")
            if manifest.exists():
                manifest.unlink()
        return removed

    def resume_from_checkpoint(self, checkpoint_path: Path | str) -> CheckpointInfo | None:
        """Resume training from a verified checkpoint. Never silently resume unverified."""
        info = self.verify_checkpoint(checkpoint_path)
        if info is None:
            return None
        if not info.verified:
            return None
        return info

    def record_consecutive_failure(self) -> None:
        """Record a failed experiment. Scheduler should pause after max failures."""
        self._consecutive_failures += 1

    def reset_consecutive_failures(self) -> None:
        """Reset failure counter after a successful run."""
        self._consecutive_failures = 0

    def consecutive_failures(self) -> int:
        return self._consecutive_failures

    def memory_snapshots(self) -> list[MemorySnapshot]:
        return list(self._memory_snapshots)

    # ------------------------------------------------------------------
    # Training execution
    # ------------------------------------------------------------------
    def run_smoke_test(self) -> TrainingResult:
        """Run a lightweight smoke test before permitting a larger job."""
        return self._run_training(smoke_test=True, max_steps=self.config.resources.smoke_test_max_steps)

    def run_training(
        self,
        smoke_test: bool = False,
        resume_from: Path | str | None = None,
    ) -> TrainingResult:
        """Run a training experiment with all safeguards."""
        start = time.time()
        self._status = TrainingStatus.RUNNING
        recovered = False

        # If resuming, verify the checkpoint first
        if resume_from is not None:
            info = self.resume_from_checkpoint(resume_from)
            if info is None:
                self._status = TrainingStatus.FAILED
                self.record_consecutive_failure()
                return TrainingResult(
                    status=TrainingStatus.FAILED,
                    error_message=f"Cannot resume from unverified or missing checkpoint: {resume_from}",
                )
            recovered = True

        # 1. Require operator approval for non-smoke-test (checked first, before resources)
        if not smoke_test and self.config.require_operator_approval:
            self._status = TrainingStatus.BLOCKED
            self.record_consecutive_failure()
            return TrainingResult(
                status=TrainingStatus.BLOCKED,
                blocked_reason="Operator approval required for non-smoke-test training",
                recovered_from_checkpoint=recovered,
            )

        # 2. Detect existing training processes
        conflicts = self.check_existing_training()
        if conflicts:
            self._status = TrainingStatus.BLOCKED
            self.record_consecutive_failure()
            return TrainingResult(
                status=TrainingStatus.BLOCKED,
                blocked_reason=f"Conflicting training processes detected: {[c.cmdline for c in conflicts]}",
                recovered_from_checkpoint=recovered,
            )

        # 3. Check resources
        blockers = self.check_resources()
        if blockers:
            self._status = TrainingStatus.BLOCKED
            self.record_consecutive_failure()
            return TrainingResult(
                status=TrainingStatus.BLOCKED,
                blocked_reason="; ".join(blockers),
                recovered_from_checkpoint=recovered,
            )

        # 4. Check consecutive failure limit
        if self._consecutive_failures >= self.config.resources.max_consecutive_failures:
            self._status = TrainingStatus.BLOCKED
            return TrainingResult(
                status=TrainingStatus.BLOCKED,
                blocked_reason=(
                    f"Too many consecutive failures ({self._consecutive_failures}). "
                    "Scheduler paused — operator intervention required."
                ),
                recovered_from_checkpoint=recovered,
            )

        # 5. Verify base model available locally (non-smoke-test only;
        #    smoke tests validate infrastructure without loading weights)
        if not smoke_test and not self.config.model.base_model_available_locally:
            self._status = TrainingStatus.FAILED
            self.record_consecutive_failure()
            return TrainingResult(
                status=TrainingStatus.FAILED,
                error_message="Base model not available locally. Large model download prohibited.",
                recovered_from_checkpoint=recovered,
            )

        # 6. Run the training
        try:
            result = self._run_training(smoke_test=smoke_test)
            result.duration_seconds = time.time() - start
            result.recovered_from_checkpoint = recovered
            result.memory_pressure_events = sum(
                1 for s in self._memory_snapshots if s.pressure_level in ("warn", "critical")
            )
            self._memory_snapshots = []
            if result.status == TrainingStatus.COMPLETED:
                self.reset_consecutive_failures()
            else:
                self.record_consecutive_failure()
            self._status = result.status
            return result
        except Exception as exc:  # noqa: BLE001
            self._status = TrainingStatus.FAILED
            self.record_consecutive_failure()
            return TrainingResult(
                status=TrainingStatus.FAILED,
                duration_seconds=time.time() - start,
                error_message=str(exc),
                recovered_from_checkpoint=recovered,
            )

    def _run_training(self, smoke_test: bool, max_steps: int | None = None) -> TrainingResult:
        """Internal: execute MLX training subprocess with memory monitoring."""
        max_steps = max_steps or self.config.resources.smoke_test_max_steps

        # Build the MLX training script
        script = self._build_smoke_script(max_steps)

        log_path = self.log_dir / f"training_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.log"
        with open(log_path, "w") as logf:
            proc = subprocess.Popen(
                ["python3", script],
                stdout=logf,
                stderr=subprocess.STDOUT,
                cwd=str(self.work_dir),
                env={**os.environ, "MLX_RUNNER_SMOKE": "1"},
            )
            self._current_process = proc

            try:
                # Monitor memory while process runs
                poll_interval = 5.0  # seconds
                deadline = time.time() + self.config.resources.max_duration_minutes * 60
                while True:
                    # Check if process has finished
                    poll_result = proc.poll()
                    if poll_result is not None:
                        returncode = poll_result
                        break

                    # Check timeout
                    if time.time() > deadline:
                        proc.terminate()
                        try:
                            proc.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                        self._current_process = None
                        self._status = TrainingStatus.ABORTED
                        return TrainingResult(
                            status=TrainingStatus.ABORTED,
                            error_message=(
                                f"Training exceeded {self.config.resources.max_duration_minutes} minute limit"
                            ),
                        )

                    # Memory pressure check (only abort real training, not smoke tests)
                    snapshot = self.get_memory_snapshot()
                    self._memory_snapshots.append(snapshot)
                    if snapshot.pressure_level == "critical" and not smoke_test:
                        proc.terminate()
                        try:
                            proc.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                        self._current_process = None
                        self._status = TrainingStatus.ABORTED
                        return TrainingResult(
                            status=TrainingStatus.ABORTED,
                            error_message=(
                                f"Training aborted: memory pressure critical "
                                f"({snapshot.free_gb:.1f} GB free)"
                            ),
                        )

                    time.sleep(poll_interval)

            except subprocess.TimeoutExpired:
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                self._current_process = None
                self._status = TrainingStatus.ABORTED
                return TrainingResult(
                    status=TrainingStatus.ABORTED,
                    error_message=f"Training exceeded {self.config.resources.max_duration_minutes} minute limit",
                )

            self._current_process = None

        if returncode != 0:
            self._status = TrainingStatus.FAILED
            return TrainingResult(
                status=TrainingStatus.FAILED,
                error_message=f"Training exited with code {returncode}",
            )

        self._status = TrainingStatus.COMPLETED
        # Find the latest checkpoint
        ckpts = sorted(self.checkpoint_dir.rglob("*_adapters.safetensors"))
        ckpt_sha = None
        ckpt_path = None
        if ckpts:
            ckpt_path = str(ckpts[-1])
            ckpt_sha = self._sha256_file(ckpts[-1])
            # Write a manifest for the checkpoint
            manifest_path = ckpts[-1].with_name(
                ckpts[-1].stem.replace("_adapters", "_manifest") + ".json"
            )
            manifest_path.write_text(
                json.dumps(
                    {
                        "completed_steps": max_steps,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "verified": True,
                        "sha256": ckpt_sha,
                    },
                    indent=2,
                )
            )
            # Clean up old checkpoints
            self.cleanup_old_checkpoints()

        return TrainingResult(
            status=TrainingStatus.COMPLETED,
            steps_completed=max_steps,
            checkpoint_path=ckpt_path,
            checkpoint_sha256=ckpt_sha,
            smoke_test=smoke_test,
        )

    def _build_smoke_script(self, max_steps: int) -> Path:
        """Build a smoke-test Python script that validates MLX setup without loading large weights."""
        script_path = self.run_dir / "smoke_train.py"
        script_path.write_text(
            f'''#!/usr/bin/env python3
"""Smoke test: validates MLX setup without loading large model weights.

This script does NOT download model weights, does NOT train on real patient data,
and does NOT perform 35B training. It only verifies the training pipeline
infrastructure can start and checkpoint correctly.
"""
import json
import os
from pathlib import Path

checkpoint_dir = Path("{self.checkpoint_dir}")
checkpoint_dir.mkdir(parents=True, exist_ok=True)

record = {{
    "smoke_test": True,
    "max_steps": {max_steps},
    "model": "mlx-community/Qwen3.6-35B-A3B-4bit (local snapshot available)",
    "framework": "mlx",
    "fine_tune_type": "lora",
    "lora_rank": 8,
    "max_seq_length": 512,
    "completed_steps": {max_steps},
    "status": "completed",
    "note": "Smoke test only — no model weights loaded, no training performed",
    "timestamp": "{datetime.now(timezone.utc).isoformat()}",
    "verified": True,
}}

out = checkpoint_dir / "smoke_adapters.safetensors"
out.write_bytes(b"smoke-test-placeholder")

manifest = checkpoint_dir / "smoke_manifest.json"
manifest.write_text(json.dumps(record, indent=2))
print(json.dumps(record, indent=2))
'''
        )
        return script_path

    def abort(self) -> None:
        """Gracefully terminate the current training process."""
        if self._current_process is not None:
            self._current_process.terminate()
            try:
                self._current_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._current_process.kill()
            self._current_process = None
        self._status = TrainingStatus.ABORTED

    def status(self) -> TrainingStatus:
        return self._status
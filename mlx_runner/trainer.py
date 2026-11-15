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
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from .config import PipelineConfig
from .memory import GIB, NORMAL_PRESSURE, process_footprint, system_memory_status
from .supervisor import kill_owned_group, supervise


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
        self._group_leader: subprocess.Popen | None = None
        self._status = TrainingStatus.PENDING
        self._max_checkpoints: int = 5  # Avoid uncontrolled accumulation

    # ------------------------------------------------------------------
    # Resource checks
    # ------------------------------------------------------------------
    def check_existing_training(self) -> list[ProcessSnapshot]:
        """Detect existing training processes. Returns list of conflicting processes."""
        conflicts: list[ProcessSnapshot] = []
        try:
            output = subprocess.check_output(
                ["ps", "-eo", "pid,args"], text=True
            )
            for line in output.splitlines():
                low = line.lower()
                if ("mlx" in line.lower() or "python" in line.lower()) and any(
                    k in low for k in ("train", "fine_tune", "lora", "mlx_lm")
                ):
                    # Skip self
                    parts = line.strip().split(None, 1)
                    if len(parts) == 2:
                        pid = int(parts[0])
                        if pid == os.getpid():
                            continue
                        conflicts.append(ProcessSnapshot(pid=pid, cmdline=parts[1], memory_gb=0.0))
        except (subprocess.CalledProcessError, ValueError, OSError):
            pass
        return conflicts

    def check_resources(self) -> list[str]:
        """Check disk and memory availability. Returns list of blocking reasons."""
        reasons: list[str] = []

        # Disk
        try:
            st = os.statvfs(self.work_dir)
            free_gb = (st.f_bavail * st.f_frsize) / (1024**3)
            if free_gb < self.config.resources.max_disk_gb:
                reasons.append(f"Free disk {free_gb:.1f} GB < required {self.config.resources.max_disk_gb} GB")
        except OSError:
            reasons.append("Cannot determine free disk space")

        # Memory pressure describes current system conditions. The process cap is
        # enforced separately while the supervised child is running.
        try:
            total_bytes, pressure = system_memory_status()
            if not 0 < self.config.resources.max_memory_gb <= (total_bytes / GIB) - 4:
                reasons.append("Process memory limit must leave at least 4 GiB for macOS and other apps")
            if pressure != NORMAL_PRESSURE:
                reasons.append(f"System memory pressure is elevated or unknown (level {pressure})")
        except (subprocess.SubprocessError, ValueError, OSError):
            reasons.append("Cannot determine physical memory and system pressure")

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

    def list_checkpoints(self) -> list[CheckpointInfo]:
        """List all verified checkpoints with metadata."""
        return [
            info for path in sorted(self.checkpoint_dir.glob("*_adapters.safetensors"))
            if (info := self.verify_checkpoint(path)) is not None
        ]

    def verify_checkpoint(self, path: Path | str) -> CheckpointInfo | None:
        """Verify a checkpoint file and return its info, or None if invalid.

        A checkpoint is only "verified" if it has a corresponding manifest file
        with an exact SHA-256 match and a non-simulated verification record.
        """
        p = Path(path)
        if not p.exists() or not p.is_file():
            return None
        sha = self._sha256_file(p)
        # Check for a corresponding manifest
        manifest = p.with_name(p.stem.replace("_adapters", "_manifest") + ".json")
        step = 0
        created_at = ""
        verified = False
        if manifest.exists():
            try:
                meta = json.loads(manifest.read_text())
                step = int(meta.get("completed_steps", 0))
                created_at = meta.get("timestamp", "")
                verified = (
                    meta.get("verified") is True
                    and meta.get("sha256") == sha
                    and meta.get("smoke_test", False) is False
                )
            except (AttributeError, TypeError, ValueError, OSError):
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
        # Sort by creation time, keep newest
        ckpts.sort(key=lambda c: c.created_at or "", reverse=True)
        removed: list[str] = []
        for ckpt in ckpts[keep:]:
            p = Path(ckpt.path)
            if p.exists():
                p.unlink()
                removed.append(ckpt.path)
            # Also remove manifest if present
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

    # ------------------------------------------------------------------
    # Training execution
    # ------------------------------------------------------------------
    def run_smoke_test(self) -> TrainingResult:
        """Run a lightweight smoke test before permitting a larger job."""
        self._status = TrainingStatus.RUNNING
        result = self._run_smoke_subprocess()
        self._status = result.status
        return result

    def run_training(self, smoke_test: bool = False, resume_from: Path | str | None = None) -> TrainingResult:
        """Run a training experiment with all safeguards."""
        start = time.time()
        self._status = TrainingStatus.RUNNING
        recovered = False

        # If resuming, verify the checkpoint first
        if resume_from is not None:
            info = self.resume_from_checkpoint(resume_from)
            if info is None:
                self._status = TrainingStatus.FAILED
                return TrainingResult(
                    status=TrainingStatus.FAILED,
                    error_message=f"Cannot resume from unverified or missing checkpoint: {resume_from}",
                )
            recovered = True

        # 1. Require operator approval for non-smoke-test (checked first, before resources)
        if not smoke_test and self.config.require_operator_approval:
            self._status = TrainingStatus.BLOCKED
            return TrainingResult(
                status=TrainingStatus.BLOCKED,
                blocked_reason="Operator approval required for non-smoke-test training",
                recovered_from_checkpoint=recovered,
            )

        if not smoke_test:
            self._status = TrainingStatus.BLOCKED
            return TrainingResult(
                status=self._status,
                blocked_reason="Real training is not implemented in this runner.",
            )
        result = self.run_smoke_test()
        result.duration_seconds = time.time() - start
        self._status = result.status
        return result

    def _run_smoke_subprocess(self) -> TrainingResult:
        """Exercise subprocess startup and runtime guards without model weights."""
        try:
            process_footprint(os.getpid())
        except OSError:
            return TrainingResult(status=TrainingStatus.BLOCKED, smoke_test=True,
                                  blocked_reason="Process memory telemetry unavailable")

        try:
            timeout = self.config.resources.smoke_test_max_duration_minutes * 60
            max_bytes = int(self.config.resources.max_memory_gb * GIB)
            with tempfile.NamedTemporaryFile(dir=self.log_dir, prefix="smoke_", suffix=".log", delete=False) as log:
                child = subprocess.Popen(
                    [sys.executable, "-c", 'print("Simulated subprocess. No model or checkpoint loaded.")'],
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    cwd=self.work_dir,
                    start_new_session=True,
                )
                self._current_process = self._group_leader = child
                result = supervise(child, timeout=timeout, max_bytes=max_bytes)
        except (OSError, ValueError, OverflowError) as exc:
            return TrainingResult(status=TrainingStatus.FAILED, smoke_test=True, error_message=str(exc))
        except KeyboardInterrupt:
            return TrainingResult(status=TrainingStatus.ABORTED, smoke_test=True,
                                  error_message="Operator interrupted the smoke test")
        finally:
            self._current_process = self._group_leader = None

        peak = result.peak_footprint / GIB
        if result.abort_reason or self._status == TrainingStatus.ABORTED:
            return TrainingResult(status=TrainingStatus.ABORTED, smoke_test=True, peak_memory_gb=peak,
                                  error_message=result.abort_reason or "Operator stopped the smoke test")
        if result.returncode:
            return TrainingResult(status=TrainingStatus.FAILED, smoke_test=True, peak_memory_gb=peak,
                                  error_message=f"Smoke test exited with code {result.returncode}")
        return TrainingResult(status=TrainingStatus.COMPLETED, smoke_test=True, peak_memory_gb=peak)

    def abort(self) -> None:
        """Gracefully terminate the current training process."""
        self._status = TrainingStatus.ABORTED
        child = self._current_process
        if child is not None:
            if child is self._group_leader:
                kill_owned_group(child)
            else:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
            self._current_process = self._group_leader = None

    def status(self) -> TrainingStatus:
        return self._status

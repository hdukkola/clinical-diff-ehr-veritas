"""Monitor an owned, foreground subprocess with a wall time and memory bound."""

from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Callable
import math
import os
import signal
import subprocess
import time

from .memory import process_footprint


@dataclass(frozen=True)
class ProcessResult:
    returncode: int
    peak_footprint: int
    abort_reason: str | None = None


def kill_owned_group(child: subprocess.Popen) -> None:
    """Stop the process group created by a launch with start_new_session=True."""
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait()


def supervise(child: subprocess.Popen, *, timeout: float, max_bytes: int,
              check_host: Callable[[], str | None] | None = None) -> ProcessResult:
    """Stop an owned group at an observed limit or if telemetry stops responding."""
    if not math.isfinite(timeout) or timeout <= 0 or max_bytes <= 0:
        kill_owned_group(child)
        raise ValueError("Supervised process limits must be positive and finite")

    deadline = time.monotonic() + timeout
    next_host_check = time.monotonic() + 1
    peak = 0
    reason = None
    try:
        while child.poll() is None:
            now = time.monotonic()
            remaining = deadline - now
            if remaining <= 0:
                reason = "Wall time limit reached"
                break
            try:
                footprint = process_footprint(child.pid)
            except OSError:
                # The process can exit between poll() and the OS measurement.
                if child.poll() is None:
                    reason = "Process memory telemetry unavailable"
                break
            peak = max(peak, footprint)
            if footprint >= max_bytes:
                reason = f"Physical footprint reached the {max_bytes}-byte limit"
                break
            if check_host and now >= next_host_check:
                reason = check_host()
                if reason:
                    break
                next_host_check = now + 1
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    reason = "Wall time limit reached"
                    break
            try:
                child.wait(timeout=min(0.1, remaining))
            except subprocess.TimeoutExpired:
                continue
    except BaseException:
        kill_owned_group(child)
        raise

    if reason:
        kill_owned_group(child)
    return ProcessResult(child.returncode, peak, abort_reason=reason)

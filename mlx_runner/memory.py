"""Memory telemetry for local Apple silicon experiments."""

from __future__ import annotations

import ctypes
from functools import lru_cache
import os
import subprocess

GIB = 1024**3
NORMAL_PRESSURE = 1


# RUSAGE_INFO_V0 in the macOS SDK's sys/resource.h.
class _ProcessUsage(ctypes.Structure):
    _fields_ = [
        ("uuid", ctypes.c_uint8 * 16),
        ("user_time", ctypes.c_uint64),
        ("system_time", ctypes.c_uint64),
        ("package_idle_wakeups", ctypes.c_uint64),
        ("interrupt_wakeups", ctypes.c_uint64),
        ("pageins", ctypes.c_uint64),
        ("wired_size", ctypes.c_uint64),
        ("resident_size", ctypes.c_uint64),
        ("physical_footprint", ctypes.c_uint64),
        ("start_time", ctypes.c_uint64),
        ("exit_time", ctypes.c_uint64),
    ]


@lru_cache(maxsize=1)
def _read_process_usage():
    system = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
    read = system.proc_pid_rusage
    read.argtypes = (ctypes.c_int, ctypes.c_int, ctypes.c_void_p)
    read.restype = ctypes.c_int
    return read


def process_footprint(pid: int) -> int:
    """Return the macOS physical footprint in bytes or fail if telemetry is unavailable."""
    data = _ProcessUsage()
    if _read_process_usage()(pid, 0, ctypes.byref(data)) != 0:
        errno = ctypes.get_errno()
        raise OSError(errno, os.strerror(errno))
    if data.physical_footprint <= 0:
        raise OSError("Process physical footprint is unavailable")
    return data.physical_footprint


def system_memory_status() -> tuple[int, int]:
    """Return physical memory in bytes and the current macOS pressure level."""
    result = subprocess.run(
        ["/usr/sbin/sysctl", "-n", "hw.memsize", "kern.memorystatus_vm_pressure_level"],
        check=True,
        capture_output=True,
        text=True,
        timeout=2,
    )
    memory, pressure = map(int, result.stdout.split())
    return memory, pressure

"""Check or launch exactly one approved local QLoRA experiment."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

from .memory import GIB, NORMAL_PRESSURE, process_footprint, system_memory_status
from .prepare_foreground import build_plan, digest
from .supervisor import supervise

PARENT_GUARD = """
import os
import subprocess
import sys

fd = int(sys.argv[1])
guard = 'import os,signal,sys; os.read(int(sys.argv[1]),1); os.killpg(os.getpgrp(),signal.SIGKILL)'
subprocess.Popen([sys.executable, '-I', '-c', guard, str(fd)], pass_fds=(fd,))
os.close(fd)
"""

WORKER = """
import json
from pathlib import Path
from types import SimpleNamespace
import mlx.core as mx
from mlx_lm import load
from mlx_lm.lora import train_model
from mlx_lm.tuner.datasets import load_dataset
import numpy as np

plan = json.loads(Path("approved-plan.json").read_text())
args = SimpleNamespace(**plan["effective_settings"])
args.data = str(Path("inputs").resolve())
bounds = plan["resource_limits"]
mx.set_memory_limit(bounds["mlx_memory_guideline_bytes"])
mx.set_cache_limit(bounds["mlx_cache_bytes"])
np.random.seed(args.seed)
model, tokenizer = load(args.model, tokenizer_config={"trust_remote_code": False})
training, validation, _ = load_dataset(args, tokenizer)
train_model(args, model, training, validation)
"""


def verified_plan(path: Path, approved_digest: str | None) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    if approved_digest is not None and sha256(raw).hexdigest() != approved_digest:
        raise ValueError("Approval does not match this plan's SHA-256")
    plan = json.loads(raw)
    settings = plan["effective_settings"]
    current = build_plan(Path(settings["model"]), Path(settings["data"]),
                         Path(plan["evaluation"]["bundle"]), path)
    if current != plan:
        raise ValueError("The plan differs from the pinned local configuration")
    return plan, raw


def host_issue(path: Path, limits: dict) -> str | None:
    try:
        physical_bytes, pressure = system_memory_status()
        free = shutil.disk_usage(path).free
    except (OSError, ValueError, subprocess.SubprocessError):
        return "Cannot read local memory pressure or output-disk availability"
    if pressure != NORMAL_PRESSURE:
        return f"macOS memory pressure is elevated or unknown (level {pressure})"
    if physical_bytes - limits["child_footprint_bytes"] < 4 * GIB:
        return "The footprint threshold leaves insufficient memory for macOS"
    if free < limits["min_free_disk_bytes"]:
        return "Available output-disk space fell below the plan's reserve"
    return None


def check_other_trainers() -> None:
    processes = subprocess.run(["/bin/ps", "-ax", "-o", "command="], check=True,
                               capture_output=True, text=True, timeout=2)
    if re.search(r"(?:^|[ /])mlx_lm(?:\.lora\b|\s+lora\b)", processes.stdout, re.MULTILINE):
        raise RuntimeError("An existing MLX LoRA command is running")


def stage_inputs(plan: dict, directory: Path) -> None:
    inputs = directory / "inputs"
    inputs.mkdir()
    source = Path(plan["effective_settings"]["data"])
    for split, facts in plan["data"]["splits"].items():
        name = split + ".jsonl"
        raw = (source / name).read_bytes()
        if sha256(raw).hexdigest() != facts["sha256"]:
            raise ValueError(f"Input changed before staging: {name}")
        (inputs / name).write_bytes(raw)


def verify_outputs(adapter: Path, settings: dict) -> dict:
    from safetensors import safe_open

    expected = [adapter / f"{step:07d}_adapters.safetensors"
                for step in range(settings["save_every"], settings["iters"] + 1, settings["save_every"])]
    final = adapter / "adapters.safetensors"
    hashes = {}
    for path in [*expected, final]:
        with safe_open(str(path), framework="np") as weights:
            if not list(weights.keys()):
                raise ValueError(f"No tensors in {path.name}")
        hashes[path.name] = digest(path)
    if expected and hashes[expected[-1].name] != hashes[final.name]:
        raise ValueError("Final adapter differs from the last planned checkpoint")
    return hashes


@contextmanager
def start_worker(directory: Path, log):
    read_fd, write_fd = os.pipe()
    env = {**os.environ, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_DATASETS_OFFLINE": "1"}
    try:
        try:
            child = subprocess.Popen(
                [sys.executable, "-I", "-u", "-c", PARENT_GUARD + WORKER, str(read_fd)],
                cwd=directory, env=env, start_new_session=True, pass_fds=(read_fd,),
                stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            )
        finally:
            os.close(read_fd)
        yield child
    finally:
        os.close(write_fd)


def launch(plan: dict, raw: bytes, path: Path) -> dict:
    lock_dir = Path.home() / "Library/Caches/ClinicalDiff"
    lock_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    limits = plan["resource_limits"]
    with (lock_dir / "foreground.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError("A foreground Clinical Diff trainer already owns the run lock") from exc
        issue = host_issue(path.parent, limits)
        if issue:
            raise RuntimeError(issue)
        process_footprint(os.getpid())
        check_other_trainers()
        directory = path.with_suffix("")
        directory.mkdir(mode=0o700)
        record = {"status": "failed", "plan_sha256": sha256(raw).hexdigest()}
        try:
            (directory / "approved-plan.json").write_bytes(raw)
            stage_inputs(plan, directory)
            with (directory / "train.log").open("wb") as log:
                with start_worker(directory, log) as child:
                    result = supervise(child, timeout=limits["wall_seconds"],
                                       max_bytes=limits["child_footprint_bytes"],
                                       check_host=lambda: host_issue(directory, limits))
            record.update(returncode=result.returncode, peak_sampled_footprint_bytes=result.peak_footprint)
            if result.abort_reason:
                record.update(status="aborted", reason=result.abort_reason)
            elif result.returncode:
                record.update(reason="MLX worker failed. See train.log.")
            else:
                record.update(adapter_sha256=verify_outputs(directory / "adapter", plan["effective_settings"]))
                record["status"] = "completed"
        except KeyboardInterrupt:
            record.update(status="aborted", reason="Interrupted by operator")
        except Exception as exc:
            record.update(reason=str(exc))
        finally:
            record_path = directory / "result.tmp"
            record_path.write_text(json.dumps(record, indent=2) + "\n")
            record_path.replace(directory / "result.json")
        return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=lambda value: Path(value).expanduser().resolve())
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Verify locally without launching training")
    mode.add_argument("--approve-plan", metavar="SHA256", help="Explicit authorization for this plan")
    args = parser.parse_args()
    try:
        plan, raw = verified_plan(args.plan, args.approve_plan)
        if args.check:
            issue = host_issue(args.plan.parent, plan["resource_limits"])
            if issue:
                raise RuntimeError(issue)
            process_footprint(os.getpid())
            print(json.dumps({"status": "verified", "plan_sha256": sha256(raw).hexdigest()}))
            return 0
        record = launch(plan, raw, args.plan)
        print(json.dumps(record, indent=2))
        return 0 if record["status"] == "completed" else 1
    except (KeyError, OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f"Foreground run refused: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

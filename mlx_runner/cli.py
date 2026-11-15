"""
CLI entry point for the Safe ML Experiment Runner.

Modes:
- dry-run: validate everything without inference or training
- evaluate-only: evaluate existing saved results or explicitly approved checkpoints
- train-once: execute one approved bounded experiment (requires --approve-training)
- scheduled: run the approved workflow periodically (dry-run + evaluate-only only)

Controls:
- status: show current scheduler status
- pause: pause the scheduler (no new training jobs)
- resume: resume the scheduler
- stop: stop safely (pause + disable, prevents additional jobs)
- disable: disable scheduled training entirely
- enable: re-enable scheduled training
- dashboard: generate local HTML or CLI dashboard
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from .config import PipelineConfig, RunMode
from .dashboard import Dashboard
from .scheduler import ExperimentScheduler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Safe ML Experiment Runner — Clinical Diff EHR Veritas"
    )
    parser.add_argument(
        "--mode",
        choices=[m.value for m in RunMode],
        default="dry-run",
        help="Execution mode (default: dry-run)",
    )
    parser.add_argument(
        "--approve-training",
        action="store_true",
        help="Explicitly approve a bounded training experiment (required for train-once)",
    )
    parser.add_argument(
        "--work-dir",
        default=".",
        help="Working directory (default: current directory)",
    )
    parser.add_argument(
        "--dashboard",
        action="store_true",
        help="Generate local HTML dashboard",
    )
    parser.add_argument(
        "--cli-dashboard",
        action="store_true",
        help="Print CLI text dashboard",
    )
    # Phase 9 controls
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show current scheduler status",
    )
    parser.add_argument(
        "--pause",
        action="store_true",
        help="Pause the scheduler (no new training jobs)",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume the scheduler (allows new training jobs subject to gates)",
    )
    parser.add_argument(
        "--stop",
        action="store_true",
        help="Stop safely (pause + disable, prevents additional jobs)",
    )
    parser.add_argument(
        "--disable",
        action="store_true",
        help="Disable scheduled training entirely",
    )
    parser.add_argument(
        "--enable",
        action="store_true",
        help="Re-enable scheduled training",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    config = PipelineConfig(mode=RunMode(args.mode), work_dir=args.work_dir)

    # Dry-run-only guard: never train in dry-run mode
    if args.mode == RunMode.DRY_RUN.value:
        config.dry_run_only = True

    scheduler = ExperimentScheduler(config, args.work_dir)
    dashboard = Dashboard(args.work_dir)

    # Phase 9 controls (executed before mode dispatch)
    if args.status:
        status = scheduler.get_status()
        print(json.dumps({
            "mode": status.mode,
            "paused": status.paused,
            "disabled": status.disabled,
            "last_run": status.last_run,
            "total_experiments": status.total_experiments,
            "consecutive_failures": status.consecutive_failures,
            "last_status": status.last_status,
            "last_rejection_reason": status.last_rejection_reason,
            "ingestible_datasets": status.ingestible_datasets,
            "blocked_datasets": status.blocked_datasets,
        }, indent=2))
        return 0

    if args.pause:
        print(scheduler.pause())
        return 0

    if args.resume:
        print(scheduler.resume())
        return 0

    if args.stop:
        print(scheduler.stop_safely())
        return 0

    if args.disable:
        print(scheduler.disable())
        return 0

    if args.enable:
        print(scheduler.enable())
        return 0

    # Dashboard generation (independent of execution mode)
    if args.dashboard:
        html_path = dashboard.generate_html(output_path=Path(args.work_dir) / "dashboard.html")
        print(f"HTML dashboard written to {html_path}")
    if args.cli_dashboard:
        print(dashboard.generate_cli())

    # If only dashboard flags were given, exit after generating dashboards
    if args.dashboard or args.cli_dashboard:
        return 0

    if args.mode == RunMode.DRY_RUN.value:
        result = scheduler.run_dry_run()
        print(json_summary(result))
        if result["status"] == "blocked":
            print("\nDRY RUN BLOCKED — issues must be resolved before training/evaluation.")
            return 1
        print("\nDRY RUN PASSED — safe to proceed to evaluate-only or train-once.")
        return 0

    elif args.mode == RunMode.EVALUATE_ONLY.value:
        result = scheduler.run_evaluate_only()
        print(json_summary(result))
        return 0

    elif args.mode == RunMode.TRAIN_ONCE.value:
        if not args.approve_training:
            print("ERROR: train-once requires --approve-training (explicit operator approval).")
            print("Unattended training is not permitted.")
            return 1
        result = scheduler.run_train_once(operator_approved=True)
        print(json_summary(result))
        if result["status"] != "completed":
            return 1
        return 0

    elif args.mode == RunMode.SCHEDULED.value:
        result = scheduler.run_scheduled()
        print(json_summary(result))
        if result["status"] == "blocked":
            return 1
        return 0

    return 0


def json_summary(result: dict) -> str:
    import json as _json

    return _json.dumps(result, indent=2)


if __name__ == "__main__":
    sys.exit(main())
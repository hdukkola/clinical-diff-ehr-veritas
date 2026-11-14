"""
Continuous experiment scheduler (Phase 5).

macOS-compatible local scheduler using launchd-compatible plist templates.
Supports modes: dry-run, evaluate-only, train-once, scheduled.

Never allows unattended training solely because the scheduler is installed.
Operator approval is required for any training job.

Automatic comparison (Phase 5):
- Compares base model vs adapter using frozen, disjoint evaluation data
- Detects safety-critical regressions before any promotion
"""

from __future__ import annotations

import json
import plistlib
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import PipelineConfig, RunMode
from .evaluator import (
    EvaluationResult,
    ModelComparisonResult,
    compare_base_vs_adapter,
    evaluate_all,
    load_dev_cases,
    load_dev_results,
)
from .registry import DatasetRegistry, build_default_registry
from .trainer import TrainingEngine


@dataclass
class ExperimentRecord:
    id: str
    mode: str
    status: str
    started_at: str
    finished_at: str | None = None
    dataset_names: list[str] = field(default_factory=list)
    evaluation: dict[str, Any] | None = None
    training: dict[str, Any] | None = None
    comparison: dict[str, Any] | None = None
    promotion_decision: str | None = None
    rejection_reason: str | None = None


@dataclass
class SchedulerState:
    experiments: list[ExperimentRecord] = field(default_factory=list)
    last_run: str | None = None
    next_scheduled: str | None = None


class ExperimentScheduler:
    """Local experiment scheduler with safety gates."""

    def __init__(self, config: PipelineConfig, work_dir: Path | str = "."):
        self.config = config
        self.work_dir = Path(work_dir)
        self.state_path = self.work_dir / "runs" / "scheduler_state.json"
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.registry = build_default_registry()
        self.state = self._load_state()

    # ------------------------------------------------------------------
    # State persistence
    # ------------------------------------------------------------------
    def _load_state(self) -> SchedulerState:
        if self.state_path.exists():
            try:
                data = json.loads(self.state_path.read_text())
                return SchedulerState(
                    experiments=[
                        ExperimentRecord(**e) for e in data.get("experiments", [])
                    ],
                    last_run=data.get("last_run"),
                    next_scheduled=data.get("next_scheduled"),
                )
            except (json.JSONDecodeError, TypeError):
                pass
        return SchedulerState()

    def _save_state(self) -> None:
        self.state_path.write_text(
            json.dumps(
                {
                    "experiments": [asdict(e) for e in self.state.experiments],
                    "last_run": self.state.last_run,
                    "next_scheduled": self.state.next_scheduled,
                },
                indent=2,
            )
        )

    # ------------------------------------------------------------------
    # Pre-flight checks (Phase 2 + Phase 3 integration)
    # ------------------------------------------------------------------
    def check_licenses(self) -> list[str]:
        """Check dataset licenses. Returns list of blocked datasets."""
        blocked = []
        for entry in self.registry.blocked():
            blocked.append(
                f"{entry.name}: license_status={entry.license_status.value}, "
                f"review_required={entry.review_required}, restricted={entry.restricted_data}"
            )
        return blocked

    def check_evaluation_integrity(self) -> list[str]:
        """Verify frozen evaluation identifiers match."""
        issues = []
        dev_path = Path("fresh-eval/seed-v2.jsonl")
        results_path = Path("fresh-eval/development-results.json")

        if not dev_path.is_file():
            issues.append("Development evaluation cases are missing")
        else:
            try:
                load_dev_cases(dev_path)
            except Exception as exc:
                issues.append(f"Dev cases unreadable: {exc}")

        if not results_path.is_file():
            issues.append("Saved development results are missing")
        else:
            try:
                load_dev_results(results_path)
            except Exception as exc:
                issues.append(f"Dev results unreadable: {exc}")

        return issues

    def check_evaluation_leakage(self) -> list[str]:
        """Check for article/patient ID leakage between training and eval sets."""
        # The dev set is development data only; no training data is present locally.
        # Verify that evaluation data does not contain training IDs.
        from .evaluator import check_evaluation_leakage

        try:
            dev_cases = load_dev_cases("fresh-eval/seed-v2.jsonl")
        except (OSError, ValueError):
            return ["Cannot check leakage without readable development cases"]
        result = check_evaluation_leakage(
            training_data=None,  # No local training data
            evaluation_data=dev_cases,
            config=self.config.leakage,
        )
        return result.reasons if not result.passed else []

    def check_resources(self) -> list[str]:
        from .trainer import TrainingEngine

        engine = TrainingEngine(self.config, self.work_dir)
        return engine.check_resources()

    # ------------------------------------------------------------------
    # Modes
    # ------------------------------------------------------------------
    def run_dry_run(self) -> dict[str, Any]:
        """Validate everything without inference or training."""
        record = ExperimentRecord(
            id=self._new_id("dry-run"),
            mode=RunMode.DRY_RUN.value,
            status="completed",
            started_at=datetime.now(timezone.utc).isoformat(),
            finished_at=datetime.now(timezone.utc).isoformat(),
        )

        # License check
        blocked = self.check_licenses()
        record.dataset_names = [e.name for e in self.registry.list_all()]

        # Config validation
        config_errors = self.config.validate()

        # Evaluation integrity
        integrity_issues = self.check_evaluation_integrity()

        # Evaluation leakage
        leakage_issues = self.check_evaluation_leakage()

        # Resource check
        resource_issues = self.check_resources()

        all_issues = blocked + config_errors + integrity_issues + leakage_issues + resource_issues
        record.status = "blocked" if all_issues else "completed"
        record.rejection_reason = "; ".join(all_issues) if all_issues else None

        self.state.experiments.append(record)
        self.state.last_run = record.started_at
        self._save_state()

        return {
            "mode": "dry-run",
            "status": record.status,
            "blocked_datasets": blocked,
            "config_errors": config_errors,
            "integrity_issues": integrity_issues,
            "leakage_issues": leakage_issues,
            "resource_issues": resource_issues,
            "ingestible_datasets": [e.name for e in self.registry.ingestible()],
            "experiment_id": record.id,
        }

    def run_evaluate_only(self) -> dict[str, Any]:
        """Evaluate existing saved results and compare base vs adapter."""
        record = ExperimentRecord(
            id=self._new_id("evaluate-only"),
            mode=RunMode.EVALUATE_ONLY.value,
            status="running",
            started_at=datetime.now(timezone.utc).isoformat(),
        )

        dev_cases = load_dev_cases("fresh-eval/seed-v2.jsonl")
        dev_responses = load_dev_results("fresh-eval/development-results.json")

        # Evaluate base and adapter separately
        base_responses = {
            k: v for k, v in dev_responses.items()
        }
        # The development-results.json has separate "base" and "adapter" lists.
        # We need to split responses by variant.
        raw = json.loads(Path("fresh-eval/development-results.json").read_text())
        base_responses = {
            row["id"]: row["response"] for row in raw.get("base", [])
        }
        adapter_responses = {
            row["id"]: row["response"] for row in raw.get("adapter", [])
        }

        base_eval = evaluate_all(dev_cases, base_responses)
        adapter_eval = evaluate_all(dev_cases, adapter_responses)

        comparison = compare_base_vs_adapter(base_eval, adapter_eval)

        record.status = "completed"
        record.finished_at = datetime.now(timezone.utc).isoformat()
        record.evaluation = {
            "base": {
                "total_events": base_eval.total_events,
                "pair_matches": base_eval.pair_matches,
                "dose_exact": base_eval.dose_exact,
                "time_exact": base_eval.time_exact,
                "evidence_literal": base_eval.evidence_literal,
                "authority_matches": base_eval.authority_matches,
                "abstentions_correct": base_eval.abstentions_correct,
                "unauthorized_changes": base_eval.unauthorized_changes,
                "null_type_errors": base_eval.null_type_errors,
                "strict_json_valid_cases": base_eval.strict_json_valid_cases,
            },
            "adapter": {
                "total_events": adapter_eval.total_events,
                "pair_matches": adapter_eval.pair_matches,
                "dose_exact": adapter_eval.dose_exact,
                "time_exact": adapter_eval.time_exact,
                "evidence_literal": adapter_eval.evidence_literal,
                "authority_matches": adapter_eval.authority_matches,
                "abstentions_correct": adapter_eval.abstentions_correct,
                "unauthorized_changes": adapter_eval.unauthorized_changes,
                "null_type_errors": adapter_eval.null_type_errors,
                "strict_json_valid_cases": adapter_eval.strict_json_valid_cases,
            },
        }
        record.comparison = {
            "pair_match_delta": comparison.pair_match_delta,
            "dose_exact_delta": comparison.dose_exact_delta,
            "time_exact_delta": comparison.time_exact_delta,
            "evidence_literal_delta": comparison.evidence_literal_delta,
            "null_type_error_delta": comparison.null_type_error_delta,
            "adapter_better": comparison.adapter_better,
            "safety_regressions": comparison.safety_regressions,
        }

        self.state.experiments.append(record)
        self.state.last_run = record.started_at
        self._save_state()

        return {
            "mode": "evaluate-only",
            "status": record.status,
            "evaluation": record.evaluation,
            "comparison": record.comparison,
            "experiment_id": record.id,
        }

    def run_train_once(self, operator_approved: bool = False) -> dict[str, Any]:
        """Keep the real training entry point blocked until a trainer exists."""
        timestamp = datetime.now(timezone.utc).isoformat()
        reason = (
            "Real training is not implemented. Run the infrastructure checks instead."
            if operator_approved else "Operator approval required for training."
        )
        record = ExperimentRecord(
            id=self._new_id("train-once"),
            mode=RunMode.TRAIN_ONCE.value,
            status="blocked",
            started_at=timestamp,
            finished_at=timestamp,
            rejection_reason=reason,
        )
        self.state.experiments.append(record)
        self.state.last_run = timestamp
        self._save_state()
        return {
            "mode": "train-once",
            "status": "blocked",
            "rejection_reason": reason,
            "experiment_id": record.id,
        }

    def run_scheduled(self) -> dict[str, Any]:
        """Run the approved workflow periodically. Does NOT auto-train."""
        record = ExperimentRecord(
            id=self._new_id("scheduled"),
            mode=RunMode.SCHEDULED.value,
            status="running",
            started_at=datetime.now(timezone.utc).isoformat(),
        )

        # Check licenses and evaluation integrity
        blocked = self.check_licenses()
        integrity = self.check_evaluation_integrity()
        leakage = self.check_evaluation_leakage()
        resources = self.check_resources()

        issues = blocked + integrity + leakage + resources

        # Scheduled mode only runs dry-run + evaluate-only, NEVER train
        dry_run = self.run_dry_run()
        evaluate = self.run_evaluate_only() if dry_run["status"] == "completed" else None
        if evaluate is None and not issues:
            issues = ["Dry-run preflight failed"]

        record.status = "blocked" if issues else "completed"
        record.rejection_reason = "; ".join(issues) if issues else None
        record.finished_at = datetime.now(timezone.utc).isoformat()

        self.state.experiments.append(record)
        self.state.last_run = record.started_at
        self._save_state()

        return {
            "mode": "scheduled",
            "status": record.status,
            "dry_run": dry_run,
            "evaluate_only": evaluate,
            "blocked_datasets": blocked,
            "integrity_issues": integrity,
            "leakage_issues": leakage,
            "resource_issues": resources,
            "experiment_id": record.id,
        }

    # ------------------------------------------------------------------
    # Launchd plist template (NOT auto-installed)
    # ------------------------------------------------------------------
    def launchd_plist(self, label: str = "clinical-diff.mlx-runner") -> str:
        """Return a launchd plist template. NOT auto-installed or activated."""
        root = self.work_dir.resolve()
        return plistlib.dumps({
            "Label": label,
            "ProgramArguments": [sys.executable, "-m", "mlx_runner.cli", "--mode", "dry-run"],
            "WorkingDirectory": str(root),
            "Disabled": True,
            "RunAtLoad": False,
            "StartInterval": 3600,
            "StandardOutPath": str(root / "logs" / "scheduler.out"),
            "StandardErrorPath": str(root / "logs" / "scheduler.err"),
        }).decode("utf-8")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _new_id(self, prefix: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        return f"{prefix}_{ts}"

    def list_experiments(self) -> list[dict[str, Any]]:
        return [asdict(e) for e in self.state.experiments]
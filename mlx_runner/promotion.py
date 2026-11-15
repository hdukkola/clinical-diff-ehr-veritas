"""
Model promotion gate (Phase 6).

A newly trained adapter must not replace the current version automatically.
Requires:
- Improved primary extraction performance
- No regression on safety-critical categories
- Valid structured-output behavior
- Correct abstention and source-authority handling
- Reproducible evaluation artifacts
- Human approval before model promotion

No model may be labeled clinically validated or production-ready based on
synthetic testing alone.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class PromotionDecision:
    approved: bool
    model_id: str
    baseline_metrics: dict[str, float]
    candidate_metrics: dict[str, float]
    metric_deltas: dict[str, float]
    safety_regressions: list[str]
    structured_output_valid: bool
    abstention_correct: bool
    authority_handling_correct: bool
    reproducible_artifacts: bool
    human_approval: bool
    reason: str
    decided_at: str


@dataclass
class PromotionRecord:
    decision: PromotionDecision
    artifacts: list[str] = field(default_factory=list)


class PromotionGate:
    """Gate that controls whether a trained adapter may be promoted."""

    def __init__(self, work_dir: Path | str = "."):
        self.work_dir = Path(work_dir)
        self.records_path = self.work_dir / "runs" / "promotion_records.json"
        self.records_path.parent.mkdir(parents=True, exist_ok=True)

    def evaluate(
        self,
        candidate_model_id: str,
        baseline: dict[str, float],
        candidate: dict[str, float],
        structured_output_valid: bool,
        abstention_correct: bool,
        authority_handling_correct: bool,
        reproducible_artifacts: bool,
        human_approved: bool,
        artifacts: list[str] | None = None,
    ) -> PromotionDecision:
        """Evaluate whether a candidate adapter may be promoted."""

        # Compute metric deltas (candidate - baseline)
        deltas: dict[str, float] = {}
        all_keys = set(baseline.keys()) | set(candidate.keys())
        for k in all_keys:
            b = baseline.get(k, 0.0)
            c = candidate.get(k, 0.0)
            deltas[k] = round(c - b, 4)

        # Check safety regressions
        safety_categories = ["unauthorized_changes", "null_type_errors", "abstention_correct"]
        safety_regressions: list[str] = []
        for cat in safety_categories:
            if cat in ("abstention_correct",):
                # Higher is better
                if candidate.get(cat, 1.0) < baseline.get(cat, 1.0):
                    safety_regressions.append(f"{cat} decreased from {baseline.get(cat)} to {candidate.get(cat)}")
            else:
                # Lower is better
                if candidate.get(cat, 0.0) > baseline.get(cat, 0.0):
                    safety_regressions.append(f"{cat} increased from {baseline.get(cat)} to {candidate.get(cat)}")

        # Primary extraction performance: pair_matches / dose_exact / time_exact
        primary_improved = (
            candidate.get("pair_matches", 0) >= baseline.get("pair_matches", 0)
            and candidate.get("dose_exact", 0) >= baseline.get("dose_exact", 0)
            and candidate.get("time_exact", 0) >= baseline.get("time_exact", 0)
        )

        # All gates must pass
        reasons: list[str] = []
        if not primary_improved:
            reasons.append("Primary extraction performance did not improve")
        if safety_regressions:
            reasons.append(f"Safety regressions detected: {'; '.join(safety_regressions)}")
        if not structured_output_valid:
            reasons.append("Structured-output behavior invalid")
        if not abstention_correct:
            reasons.append("Abstention handling incorrect")
        if not authority_handling_correct:
            reasons.append("Source-authority handling incorrect")
        if not reproducible_artifacts:
            reasons.append("Evaluation artifacts not reproducible")
        if not human_approved:
            reasons.append("Human approval not provided")

        approved = len(reasons) == 0

        decision = PromotionDecision(
            approved=approved,
            model_id=candidate_model_id,
            baseline_metrics=baseline,
            candidate_metrics=candidate,
            metric_deltas=deltas,
            safety_regressions=safety_regressions,
            structured_output_valid=structured_output_valid,
            abstention_correct=abstention_correct,
            authority_handling_correct=authority_handling_correct,
            reproducible_artifacts=reproducible_artifacts,
            human_approval=human_approved,
            reason="; ".join(reasons) if reasons else "All promotion gates passed",
            decided_at=datetime.now(timezone.utc).isoformat(),
        )

        record = PromotionRecord(decision=decision, artifacts=artifacts or [])
        self._save_record(record)

        return decision

    def _save_record(self, record: "PromotionRecord") -> None:
        records = []
        if self.records_path.exists():
            try:
                records = json.loads(self.records_path.read_text())
            except json.JSONDecodeError:
                records = []
        records.append(
            {
                "decision": asdict(record.decision),
                "artifacts": record.artifacts,
            }
        )
        self.records_path.write_text(json.dumps(records, indent=2))

    def list_records(self) -> list[dict[str, Any]]:
        if self.records_path.exists():
            try:
                return json.loads(self.records_path.read_text())
            except json.JSONDecodeError:
                return []
        return []
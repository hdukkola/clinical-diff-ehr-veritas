"""
Annotation-review workflow for medication-event labels.

Provides human-review gating for candidate training examples. Keeps blind
evaluation cases separate from training data. Tracks review status,
annotator assignments, and review notes.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from .dataset_expansion import (
    AnnotationStatus,
    CandidateExample,
    MedicationEvent,
    example_to_dict,
    load_examples_jsonl,
    write_examples_jsonl,
)


class ReviewDecision(str, Enum):
    APPROVE = "approve"          # Label is correct as-is
    REJECT = "reject"            # Label is incorrect; do not use for training
    EDIT = "edit"                # Label needs modification; re-review after edit
    ABSTAIN = "abstain"          # Example should be abstained (no training signal)
    EXCLUDE_FROM_TRAINING = "exclude_from_training"  # Keep for eval only, not training


@dataclass
class ReviewRecord:
    """A single human review decision on a candidate example."""
    example_id: str
    reviewer: str
    decision: ReviewDecision
    reviewed_at: str
    notes: str | None = None
    edited_events: list[dict] | None = None  # Full event list if decision == EDIT
    review_round: int = 1


@dataclass
class ReviewSession:
    """A batch of examples assigned to a reviewer for annotation."""
    session_id: str
    reviewer: str
    example_ids: list[str]
    started_at: str
    completed_at: str | None = None
    decisions: dict[str, ReviewRecord] = field(default_factory=dict)


class AnnotationWorkflow:
    """Manages the annotation-review workflow for medication-event candidates."""

    def __init__(self, work_dir: Path | str = "data/training/annotations"):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.examples_dir = self.work_dir / "examples"
        self.reviews_dir = self.work_dir / "reviews"
        self.sessions_dir = self.work_dir / "sessions"
        self.blind_eval_dir = self.work_dir / "blind_eval"
        for d in (self.examples_dir, self.reviews_dir, self.sessions_dir, self.blind_eval_dir):
            d.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Example intake
    # ------------------------------------------------------------------
    def import_candidates(self, examples: list[CandidateExample], source_file: str | None = None) -> list[str]:
        """Import candidate examples into the annotation workflow.
        Returns list of example IDs."""
        ids: list[str] = []
        for ex in examples:
            ex_path = self.examples_dir / f"{ex.example_id}.json"
            ex_path.write_text(json.dumps(example_to_dict(ex), indent=2))
            ids.append(ex.example_id)
        return ids

    def load_candidate(self, example_id: str) -> CandidateExample | None:
        """Load a single candidate example by ID."""
        path = self.examples_dir / f"{example_id}.json"
        if not path.exists():
            return None
        return load_examples_jsonl(path)[0]

    # ------------------------------------------------------------------
    # Review session management
    # ------------------------------------------------------------------
    def create_session(self, reviewer: str, example_ids: list[str]) -> ReviewSession:
        """Create a new review session for a reviewer."""
        session_id = f"session_{reviewer}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        session = ReviewSession(
            session_id=session_id,
            reviewer=reviewer,
            example_ids=list(example_ids),
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        self.sessions_dir / f"{session_id}.json"
        self._save_session(session)
        return session

    def _save_session(self, session: ReviewSession) -> None:
        path = self.sessions_dir / f"{session.session_id}.json"
        path.write_text(json.dumps(asdict(session), indent=2))

    def get_session(self, session_id: str) -> ReviewSession | None:
        path = self.sessions_dir / f"{session_id}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        return ReviewSession(**data)

    def list_sessions(self, reviewer: str | None = None) -> list[ReviewSession]:
        sessions: list[ReviewSession] = []
        if not self.sessions_dir.exists():
            return sessions
        for path in sorted(self.sessions_dir.glob("*.json")):
            data = json.loads(path.read_text())
            session = ReviewSession(**data)
            if reviewer is None or session.reviewer == reviewer:
                sessions.append(session)
        return sorted(sessions, key=lambda s: s.started_at, reverse=True)

    # ------------------------------------------------------------------
    # Review decisions
    # ------------------------------------------------------------------
    def record_decision(
        self,
        example_id: str,
        reviewer: str,
        decision: ReviewDecision,
        notes: str | None = None,
        edited_events: list[dict] | None = None,
        review_round: int = 1,
    ) -> ReviewRecord:
        """Record a human review decision on a candidate example."""
        record = ReviewRecord(
            example_id=example_id,
            reviewer=reviewer,
            decision=decision,
            reviewed_at=datetime.now(timezone.utc).isoformat(),
            notes=notes,
            edited_events=edited_events,
            review_round=review_round,
        )
        self.reviews_dir / f"{example_id}_{review_round}.json"
        (self.reviews_dir / f"{example_id}_{review_round}.json").write_text(
            json.dumps(asdict(record), indent=2)
        )

        # Update the candidate example's annotation status
        ex_path = self.examples_dir / f"{example_id}.json"
        if ex_path.exists():
            ex = load_examples_jsonl(ex_path)[0]
            ex.annotation_status = (
                AnnotationStatus.HUMAN_REVIEWED
                if decision in (ReviewDecision.APPROVE, ReviewDecision.EDIT, ReviewDecision.ABSTAIN)
                else AnnotationStatus.UNREVIEWED
            )
            if edited_events:
                # Reconstruct events from edited dicts
                from .dataset_expansion import MedicationEvent, ActionType, AuthorityType, EvidenceStatus, RelativeTime, EvidenceSpan
                new_events = []
                for ev_data in edited_events:
                    time_obj = None
                    if ev_data.get("time"):
                        time_obj = RelativeTime(
                            expression=ev_data["time"]["expression"],
                            is_relative=ev_data["time"].get("is_relative", True),
                        )
                    evidence_obj = None
                    if ev_data.get("evidence"):
                        ed = ev_data["evidence"]
                        evidence_obj = EvidenceSpan(
                            text=ed["text"],
                            start_char=ed["start_char"],
                            end_char=ed["end_char"],
                            source_text="",
                        )
                    new_events.append(
                        MedicationEvent(
                            event_id=ev_data["event_id"],
                            medication_name=ev_data["medication_name"],
                            action=ActionType(ev_data["action"]),
                            dose=ev_data.get("dose"),
                            unit=ev_data.get("unit"),
                            route=ev_data.get("route"),
                            frequency=ev_data.get("frequency"),
                            duration=ev_data.get("duration"),
                            time=time_obj,
                            authority=AuthorityType(ev_data.get("authority", "clinician_authorized")),
                            evidence=evidence_obj,
                            evidence_status=EvidenceStatus(ev_data.get("evidence_status", "literal_span")),
                            uncertainty=ev_data.get("uncertainty"),
                            abstention_reason=ev_data.get("abstention_reason"),
                            source_id=ev_data.get("source_id"),
                            source_url=ev_data.get("source_url"),
                            source_license=ev_data.get("source_license"),
                            notes=ev_data.get("notes"),
                        )
                    )
                ex.events = new_events
            ex.reviewer = reviewer
            ex.reviewed_at = record.reviewed_at
            ex.review_notes = notes
            write_examples_jsonl([ex], ex_path)

        # Also record in session if applicable
        for session_path in self.sessions_dir.glob("*.json"):
            session_data = json.loads(session_path.read_text())
            if example_id in session_data.get("example_ids", []) and session_data.get("reviewer") == reviewer:
                session_data.setdefault("decisions", {})[example_id] = asdict(record)
                session_path.write_text(json.dumps(session_data, indent=2))
                break

        return record

    def get_decision(self, example_id: str, review_round: int = 1) -> ReviewRecord | None:
        path = self.reviews_dir / f"{example_id}_{review_round}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        return ReviewRecord(**data)

    def list_decisions(self, reviewer: str | None = None) -> list[ReviewRecord]:
        records: list[ReviewRecord] = []
        if not self.reviews_dir.exists():
            return records
        for path in sorted(self.reviews_dir.glob("*.json")):
            data = json.loads(path.read_text())
            record = ReviewRecord(**data)
            if reviewer is None or record.reviewer == reviewer:
                records.append(record)
        return sorted(records, key=lambda r: r.reviewed_at, reverse=True)

    # ------------------------------------------------------------------
    # Blind evaluation set separation
    # ------------------------------------------------------------------
    def set_aside_blind_eval(self, example_ids: list[str], eval_set_name: str) -> None:
        """Move examples to the blind evaluation directory (not for training)."""
        eval_dir = self.blind_eval_dir / eval_set_name
        eval_dir.mkdir(parents=True, exist_ok=True)
        for ex_id in example_ids:
            src = self.examples_dir / f"{ex_id}.json"
            if src.exists():
                ex = load_examples_jsonl(src)[0]
                ex.annotation_status = AnnotationStatus.HUMAN_REVIEWED  # Blind eval labels are trusted
                write_examples_jsonl([ex], eval_dir / f"{ex_id}.json")
                src.unlink()

    def get_blind_eval_examples(self, eval_set_name: str) -> list[CandidateExample]:
        """Load all examples from a blind evaluation set."""
        eval_dir = self.blind_eval_dir / eval_set_name
        if not eval_dir.exists():
            return []
        examples: list[CandidateExample] = []
        for path in sorted(eval_dir.glob("*.json")):
            examples.extend(load_examples_jsonl(path))
        return examples

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    def workflow_summary(self) -> dict[str, Any]:
        """Return a summary of the annotation workflow state."""
        total_candidates = len(list(self.examples_dir.glob("*.json"))) if self.examples_dir.exists() else 0
        total_reviews = len(list(self.reviews_dir.glob("*.json"))) if self.reviews_dir.exists() else 0
        total_sessions = len(list(self.sessions_dir.glob("*.json"))) if self.sessions_dir.exists() else 0

        decision_counts: dict[str, int] = {}
        for record in self.list_decisions():
            decision_counts[record.decision.value] = decision_counts.get(record.decision.value, 0) + 1

        annotation_counts: dict[str, int] = {}
        if self.examples_dir.exists():
            for path in self.examples_dir.glob("*.json"):
                ex = load_examples_jsonl(path)[0]
                annotation_counts[ex.annotation_status.value] = annotation_counts.get(ex.annotation_status.value, 0) + 1

        return {
            "total_candidates": total_candidates,
            "total_reviews": total_reviews,
            "total_sessions": total_sessions,
            "decision_distribution": decision_counts,
            "annotation_distribution": annotation_counts,
            "unreviewed_count": annotation_counts.get("unreviewed", 0),
            "human_reviewed_count": annotation_counts.get("human_reviewed", 0),
            "blind_eval_sets": [d.name for d in self.blind_eval_dir.iterdir()] if self.blind_eval_dir.exists() else [],
        }

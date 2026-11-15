"""
Dataset expansion pipeline for medication-event extraction training.

Creates annotation-ready candidate examples covering:
- START, STOP, RESTART, TAPER, DOSE_CHANGE actions
- Dose, unit, route, frequency
- Temporal references (relative and absolute)
- Patient-reported vs clinician-authorized events
- Contradictions, corrections, uncertainty
- Evidence spans and abstention

All examples are synthetic and clearly labeled as unreviewed. No clinician-reviewed
truth is claimed. Sources are referenced by their upstream license and URL.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any


class ActionType(str, Enum):
    START = "start"
    STOP = "stop"
    RESTART = "restart"
    TAPER = "taper"
    DOSE_CHANGE = "dose_change"


class AuthorityType(str, Enum):
    PATIENT_REPORTED = "patient_reported"
    CLINICIAN_AUTHORIZED = "clinician_authorized"
    HISTORICAL = "historical"


class EvidenceStatus(str, Enum):
    LITERAL_SPAN = "literal_span"       # Evidence is a literal substring of source text
    PARAPHRASED = "paraphrased"         # Evidence is paraphrased from source
    MISSING = "missing"                 # Evidence not present in source text
    CONTRADICTORY = "contradictory"     # Multiple sources contradict


class AnnotationStatus(str, Enum):
    UNREVIEWED = "unreviewed"           # Model-generated or heuristic, not human-verified
    HUMAN_REVIEWED = "human_reviewed"   # Verified by human clinician
    REVIEW_IN_PROGRESS = "review_in_progress"


@dataclass
class EvidenceSpan:
    """A literal span from the source text supporting a medication event."""
    text: str
    start_char: int
    end_char: int
    source_text: str  # Full source note for context


@dataclass
class RelativeTime:
    """A relative or absolute time reference."""
    expression: str  # e.g., "day +20", "nightly", "on admission", "2026-10-15"
    is_relative: bool  # True for "day +20", "nightly"; False for "2026-10-15", "on admission"


@dataclass
class MedicationEvent:
    """A single medication-event annotation candidate."""
    event_id: str
    medication_name: str
    action: ActionType
    dose: str | None = None
    unit: str | None = None
    route: str | None = None
    frequency: str | None = None
    duration: str | None = None
    time: RelativeTime | None = None
    authority: AuthorityType = AuthorityType.CLINICIAN_AUTHORIZED
    evidence: EvidenceSpan | None = None
    evidence_status: EvidenceStatus = EvidenceStatus.LITERAL_SPAN
    uncertainty: str | None = None  # e.g., "possibly", "likely", "uncertain"
    abstention_reason: str | None = None  # Why the model should abstain
    annotation_status: AnnotationStatus = AnnotationStatus.UNREVIEWED
    annotator: str | None = None
    reviewed_at: str | None = None
    source_id: str | None = None  # Original article/note ID
    source_url: str | None = None
    source_license: str | None = None
    source_title: str | None = None
    notes: str | None = None


@dataclass
class CandidateExample:
    """A complete training example: input note + expected structured output."""
    example_id: str
    note_text: str
    source_id: str
    source_url: str | None
    source_license: str | None
    source_title: str | None
    events: list[MedicationEvent]
    excluded_medications: list[str] = field(default_factory=list)  # Medications explicitly NOT to act on
    annotation_status: AnnotationStatus = AnnotationStatus.UNREVIEWED
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    reviewer: str | None = None
    reviewed_at: str | None = None
    review_notes: str | None = None


def sha256_string(text: str) -> str:
    """Compute SHA-256 of a string."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def generate_example_id() -> str:
    """Generate a unique example ID."""
    return f"cand_{uuid.uuid4().hex[:12]}"


def make_evidence_span(text: str, source_text: str) -> EvidenceSpan | None:
    """Create an evidence span if the text is a literal substring of source_text."""
    start = source_text.find(text)
    if start == -1:
        return None
    return EvidenceSpan(
        text=text,
        start_char=start,
        end_char=start + len(text),
        source_text=source_text,
    )


def example_to_dict(example: CandidateExample) -> dict[str, Any]:
    """Serialize a CandidateExample to a dict for JSONL output."""
    events_out = []
    for ev in example.events:
        ev_dict: dict[str, Any] = {
            "event_id": ev.event_id,
            "medication_name": ev.medication_name,
            "action": ev.action.value,
            "authority": ev.authority.value,
            "evidence_status": ev.evidence_status.value,
            "annotation_status": ev.annotation_status.value,
            "source_id": ev.source_id,
            "source_url": ev.source_url,
            "source_license": ev.source_license,
        }
        if ev.dose is not None:
            ev_dict["dose"] = ev.dose
        if ev.unit is not None:
            ev_dict["unit"] = ev.unit
        if ev.route is not None:
            ev_dict["route"] = ev.route
        if ev.frequency is not None:
            ev_dict["frequency"] = ev.frequency
        if ev.duration is not None:
            ev_dict["duration"] = ev.duration
        if ev.time is not None:
            ev_dict["time"] = {
                "expression": ev.time.expression,
                "is_relative": ev.time.is_relative,
            }
        if ev.evidence is not None:
            ev_dict["evidence"] = {
                "text": ev.evidence.text,
                "start_char": ev.evidence.start_char,
                "end_char": ev.evidence.end_char,
            }
        if ev.uncertainty is not None:
            ev_dict["uncertainty"] = ev.uncertainty
        if ev.abstention_reason is not None:
            ev_dict["abstention_reason"] = ev.abstention_reason
        if ev.annotator is not None:
            ev_dict["annotator"] = ev.annotator
        if ev.reviewed_at is not None:
            ev_dict["reviewed_at"] = ev.reviewed_at
        if ev.notes is not None:
            ev_dict["notes"] = ev.notes
        events_out.append(ev_dict)

    return {
        "example_id": example.example_id,
        "note_text": example.note_text,
        "source_id": example.source_id,
        "source_url": example.source_url,
        "source_license": example.source_license,
        "source_title": example.source_title,
        "events": events_out,
        "excluded_medications": example.excluded_medications,
        "annotation_status": example.annotation_status.value,
        "created_at": example.created_at,
        "reviewer": example.reviewer,
        "reviewed_at": example.reviewed_at,
        "review_notes": example.review_notes,
    }


def write_examples_jsonl(examples: list[CandidateExample], path: Path | str) -> None:
    """Write candidate examples to a JSONL file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for ex in examples:
            f.write(json.dumps(example_to_dict(ex)) + "\n")


def load_examples_jsonl(path: Path | str) -> list[CandidateExample]:
    """Load candidate examples from a JSONL file."""
    examples: list[CandidateExample] = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            events = []
            for ev_data in data.get("events", []):
                time_data = ev_data.get("time")
                time_obj = None
                if time_data:
                    time_obj = RelativeTime(
                        expression=time_data["expression"],
                        is_relative=time_data.get("is_relative", True),
                    )
                evidence_data = ev_data.get("evidence")
                evidence_obj = None
                if evidence_data:
                    evidence_obj = EvidenceSpan(
                        text=evidence_data["text"],
                        start_char=evidence_data["start_char"],
                        end_char=evidence_data["end_char"],
                        source_text="",  # Not stored in JSONL; reconstructed at review
                    )
                events.append(
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
                        annotation_status=AnnotationStatus(ev_data.get("annotation_status", "unreviewed")),
                        annotator=ev_data.get("annotator"),
                        reviewed_at=ev_data.get("reviewed_at"),
                        source_id=ev_data.get("source_id"),
                        source_url=ev_data.get("source_url"),
                        source_license=ev_data.get("source_license"),
                        notes=ev_data.get("notes"),
                    )
                )
            examples.append(
                CandidateExample(
                    example_id=data["example_id"],
                    note_text=data["note_text"],
                    source_id=data["source_id"],
                    source_url=data.get("source_url"),
                    source_license=data.get("source_license"),
                    source_title=data.get("source_title"),
                    events=events,
                    excluded_medications=data.get("excluded_medications", []),
                    annotation_status=AnnotationStatus(data.get("annotation_status", "unreviewed")),
                    created_at=data.get("created_at", datetime.now(timezone.utc).isoformat()),
                    reviewer=data.get("reviewer"),
                    reviewed_at=data.get("reviewed_at"),
                    review_notes=data.get("review_notes"),
                )
            )
    return examples


class DatasetExpansionPipeline:
    """Pipeline for creating annotation-ready medication-event examples."""

    def __init__(self, output_dir: Path | str = "data/training/candidates"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.examples: list[CandidateExample] = []

    def add_example(self, example: CandidateExample) -> None:
        """Add a candidate example to the pipeline."""
        self.examples.append(example)

    def write_jsonl(self, filename: str = "candidates.jsonl") -> Path:
        """Write all examples to a JSONL file."""
        path = self.output_dir / filename
        write_examples_jsonl(self.examples, path)
        return path

    def summary(self) -> dict[str, Any]:
        """Return a summary of the dataset."""
        action_counts: dict[str, int] = {}
        authority_counts: dict[str, int] = {}
        evidence_counts: dict[str, int] = {}
        annotation_counts: dict[str, int] = {}

        for ex in self.examples:
            for ev in ex.events:
                action_counts[ev.action.value] = action_counts.get(ev.action.value, 0) + 1
                authority_counts[ev.authority.value] = authority_counts.get(ev.authority.value, 0) + 1
                evidence_counts[ev.evidence_status.value] = evidence_counts.get(ev.evidence_status.value, 0) + 1
            annotation_counts[ex.annotation_status.value] = annotation_counts.get(ex.annotation_status.value, 0) + 1

        return {
            "total_examples": len(self.examples),
            "total_events": sum(len(ex.events) for ex in self.examples),
            "action_distribution": action_counts,
            "authority_distribution": authority_counts,
            "evidence_distribution": evidence_counts,
            "annotation_distribution": annotation_counts,
            "unreviewed_count": annotation_counts.get("unreviewed", 0),
            "human_reviewed_count": annotation_counts.get("human_reviewed", 0),
        }


def create_synthetic_example(
    example_id: str,
    note_text: str,
    source_id: str,
    source_url: str | None,
    source_license: str,
    source_title: str,
    events: list[dict[str, Any]],
    excluded_medications: list[str] | None = None,
) -> CandidateExample:
    """Helper to create a CandidateExample from dict-form event specs."""
    ev_objs = []
    for ev_spec in events:
        time_obj = None
        time_spec = ev_spec.get("time")
        if time_spec:
            if isinstance(time_spec, str):
                time_obj = RelativeTime(expression=time_spec, is_relative=True)
            elif isinstance(time_spec, dict):
                time_obj = RelativeTime(
                    expression=time_spec["expression"],
                    is_relative=time_spec.get("is_relative", True),
                )
        evidence_obj = None
        if ev_spec.get("evidence_text") and ev_spec.get("evidence_start") is not None:
            evidence_obj = EvidenceSpan(
                text=ev_spec["evidence_text"],
                start_char=ev_spec["evidence_start"],
                end_char=ev_spec["evidence_end"],
                source_text=note_text,
            )
        ev_objs.append(
            MedicationEvent(
                event_id=ev_spec["event_id"],
                medication_name=ev_spec["medication_name"],
                action=ActionType(ev_spec["action"]),
                dose=ev_spec.get("dose"),
                unit=ev_spec.get("unit"),
                route=ev_spec.get("route"),
                frequency=ev_spec.get("frequency"),
                duration=ev_spec.get("duration"),
                time=time_obj,
                authority=AuthorityType(ev_spec.get("authority", "clinician_authorized")),
                evidence=evidence_obj,
                evidence_status=EvidenceStatus(ev_spec.get("evidence_status", "literal_span")),
                uncertainty=ev_spec.get("uncertainty"),
                abstention_reason=ev_spec.get("abstention_reason"),
                source_id=source_id,
                source_url=source_url,
                source_license=source_license,
                notes=ev_spec.get("notes"),
            )
        )
    return CandidateExample(
        example_id=example_id,
        note_text=note_text,
        source_id=source_id,
        source_url=source_url,
        source_license=source_license,
        source_title=source_title,
        events=ev_objs,
        excluded_medications=excluded_medications or [],
    )

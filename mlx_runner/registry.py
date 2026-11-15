"""
Dataset licensing and provenance gate (Phase 2).

Maintains a machine-readable registry of datasets with licensing, synthetic/real
classification, split assignment, exclusion lists, and restriction flags.
Blocks datasets with unresolved commercial rights, missing provenance,
incompatible licenses, or credentialed DUAs from automated ingestion.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .config import DEFAULT_CONFIG, DatasetClass, DatasetEntry, LicenseStatus


class DatasetRegistry:
    """Registry of datasets with provenance and licensing gates."""

    def __init__(self, entries: list[DatasetEntry] | None = None):
        self._entries: dict[str, DatasetEntry] = {}
        if entries is not None:
            for e in entries:
                self.register(e)

    def register(self, entry: DatasetEntry) -> None:
        self._entries[entry.name] = entry

    def get(self, name: str) -> DatasetEntry | None:
        return self._entries.get(name)

    def list_all(self) -> list[DatasetEntry]:
        return list(self._entries.values())

    def ingestible(self) -> list[DatasetEntry]:
        """Return datasets that pass the licensing/provenance gate."""
        return [e for e in self._entries.values() if e.is_ingestible()]

    def blocked(self) -> list[DatasetEntry]:
        """Return datasets blocked from ingestion."""
        return [e for e in self._entries.values() if not e.is_ingestible()]

    def to_dict(self) -> dict[str, Any]:
        return {
            name: {
                "source_url": e.source_url,
                "revision": e.revision,
                "sha256": e.sha256,
                "license": e.license,
                "license_status": e.license_status.value,
                "dataset_class": e.dataset_class.value,
                "permitted_use": e.permitted_use,
                "annotation_quality": e.annotation_quality,
                "label_provenance": e.label_provenance,
                "split_assignment": e.split_assignment,
                "exclusion_list": e.exclusion_list,
                "restricted_data": e.restricted_data,
                "cloud_processing": e.cloud_processing,
                "review_required": e.review_required,
                "is_ingestible": e.is_ingestible(),
                "notes": e.notes,
            }
            for name, e in self._entries.items()
        }


def build_default_registry() -> DatasetRegistry:
    """Build the default registry from the research audit (docs/research/SOURCE_AUDIT.md).

    Only datasets verified from official sources are included. Sources marked
    REVIEW REQUIRED are flagged but not auto-approved.
    """
    entries = [
        DatasetEntry(
            name="synthetic-hospital",
            source_url="https://github.com/sparkcpark/synthetic_hospital",
            revision="main",
            license="MIT",
            license_status=LicenseStatus.APPROVED,
            dataset_class=DatasetClass.SYNTHETIC,
            permitted_use="Benchmarking clinical AI agents; not for clinical use",
            annotation_quality="Physician-validated; ground truth derived from graph",
            label_provenance="Graph-derived deterministic labels; imaging-indication LLM-authored",
            split_assignment={"public": "200 patients", "heldout": "268 patients", "train": "800 patients"},
            restricted_data=False,
            cloud_processing=False,
            review_required=False,
            notes="benchmark_v1.3.db (88 MB) committed to repo. Public split for evaluation; train for training; heldout must not be trained on.",
        ),
        DatasetEntry(
            name="medtempo-bench",
            source_url="https://huggingface.co/datasets/mirobody/MedTEMPO-Bench",
            revision="batch 202610",
            license="CC BY 4.0",
            license_status=LicenseStatus.REVIEW_REQUIRED,
            dataset_class=DatasetClass.SYNTHETIC,
            permitted_use="Benchmarking AI agents on longitudinal medication reconciliation",
            annotation_quality="Truth derived from fact layer; LLM reviewer only, no clinician review",
            label_provenance="Fact layer; ground truth WITHHELD for active leaderboard batch",
            split_assignment={"test": "200 items / 1,000 scoring units"},
            restricted_data=False,
            cloud_processing=False,
            review_required=True,
            notes="Ground truth withheld while batch 202610 is active leaderboard set. Not self-contained for held-out evaluation.",
        ),
        DatasetEntry(
            name="aci-bench",
            source_url="https://github.com/wyim/aci-bench",
            revision="main",
            license="CC BY 4.0",
            license_status=LicenseStatus.REVIEW_REQUIRED,
            dataset_class=DatasetClass.REAL,
            permitted_use="Benchmarking automatic visit note generation (ambient clinical intelligence)",
            annotation_quality="Real clinical encounters; ASR speaker-tag noise (uncorrected)",
            label_provenance="Real doctor-patient conversations + clinical notes",
            split_assignment={"TRAIN": "67", "VALID": "20", "TEST1": "40", "TEST2": "40", "TEST3": "40"},
            restricted_data=False,
            cloud_processing=False,
            review_required=True,
            notes="Data hosted on figshare, not GitHub; requires separate download. Real (not simulated/scripted) conversations.",
        ),
        DatasetEntry(
            name="mts-dialog",
            source_url="https://github.com/abachaa/MTS-Dialog",
            revision="main",
            license="CC BY 4.0",
            license_status=LicenseStatus.REVIEW_REQUIRED,
            dataset_class=DatasetClass.MIXED,
            permitted_use="Clinical note generation from doctor-patient encounters; summarization evaluation",
            annotation_quality="Real encounters (main); augmented portion has no human annotation",
            label_provenance="Real doctor-patient conversations (main 2,401 pairs); synthetic augmented (3.6k back-translated)",
            split_assignment={"train": "1,201", "validation": "100", "test": "400 (2 sets of 200)"},
            restricted_data=False,
            cloud_processing=False,
            review_required=True,
            notes="Mixed: main dataset is real (not simulated/scripted); augmented 3.6k pairs via back-translation are model-generated and should be excluded from clinical evaluation.",
        ),
        DatasetEntry(
            name="pmc-open-access",
            source_url="https://pmc.ncbi.nlm.nih.gov/tools/openftlist/",
            revision="page last modified 2026-08-24",
            license="Varies per article",
            license_status=LicenseStatus.REVIEW_REQUIRED,
            dataset_class=DatasetClass.REAL,
            permitted_use="Text mining and reuse per per-article license",
            annotation_quality="Published, peer-reviewed content (varies by journal)",
            label_provenance="Published articles",
            restricted_data=False,
            cloud_processing=False,
            review_required=True,
            notes="Per-article license terms must be checked individually. Automated retrieval restricted to 4 sanctioned services.",
        ),
        DatasetEntry(
            name="cadecv2",
            source_url="https://researchdata.edu.au/cadecv2/3378660/",
            revision="v4",
            license="CC BY 4.0",
            license_status=LicenseStatus.REVIEW_REQUIRED,
            dataset_class=DatasetClass.REAL,
            permitted_use="Information extraction, NER, adverse drug reaction detection from patient reports",
            annotation_quality="Annotated for ADEs",
            label_provenance="Patient-reported posts from medical forums",
            split_assignment={},
            restricted_data=False,
            cloud_processing=False,
            review_required=True,
            notes="DOI 10.25919/3v5b-k950. Review upstream forum terms for the actual records before reuse.",
        ),
        DatasetEntry(
            name="pubmedqa",
            source_url="https://pubmedqa.github.io/",
            revision="unconfirmed",
            license="unconfirmed",
            license_status=LicenseStatus.REVIEW_REQUIRED,
            dataset_class=DatasetClass.REAL,
            permitted_use="Biomedical research QA (yes/no/maybe)",
            annotation_quality="1k expert-labeled; rest unlabeled or artificially generated",
            label_provenance="Research questions from PubMed abstracts",
            split_assignment={"expert_labeled": "1k", "unlabeled": "61.2k", "artificially_generated": "211.3k"},
            restricted_data=False,
            cloud_processing=False,
            review_required=True,
            notes="License not stated on homepage; split details not on homepage; confirm via GitHub repo.",
        ),
        DatasetEntry(
            name="fresh-eval-dev",
            source_url="internal",
            revision="HEAD",
            license="internal",
            license_status=LicenseStatus.APPROVED,
            dataset_class=DatasetClass.SYNTHETIC,
            permitted_use="Development regression only — NOT a blind clinical test",
            annotation_quality="Inspected during development",
            label_provenance="Paraphrased shortened published case excerpts (PMC13402246, PMC8025526)",
            split_assignment={"dev": "2 cases, 9 events"},
            restricted_data=False,
            cloud_processing=False,
            review_required=False,
            notes="CC BY 4.0 published case excerpts, paraphrased and shortened. Development data only.",
        ),
    ]

    registry = DatasetRegistry(entries)
    return registry


def sha256_file(path: Path | str) -> str:
    """Compute SHA-256 of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_dataset_integrity(entry: DatasetEntry, local_path: Path | str) -> bool:
    """Verify a local dataset file matches its recorded SHA-256."""
    if entry.sha256 is None:
        return False
    return sha256_file(local_path) == entry.sha256
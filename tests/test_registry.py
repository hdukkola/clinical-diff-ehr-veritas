"""
Tests for the dataset registry and licensing/provenance gate (Phase 2).
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.registry import build_default_registry, DatasetEntry, LicenseStatus, DatasetClass


class TestDatasetRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = build_default_registry()

    def test_registry_has_expected_datasets(self):
        names = {e.name for e in self.registry.list_all()}
        self.assertIn("synthetic-hospital", names)
        self.assertIn("medtempo-bench", names)
        self.assertIn("aci-bench", names)
        self.assertIn("mts-dialog", names)
        self.assertIn("fresh-eval-dev", names)

    def test_ingestible_datasets(self):
        ingestible = {e.name for e in self.registry.ingestible()}
        self.assertIn("synthetic-hospital", ingestible)
        self.assertIn("fresh-eval-dev", ingestible)
        # MedTEMPO, ACI-Bench, MTS-Dialog, PMC, PubMedQA are review-required
        self.assertNotIn("medtempo-bench", ingestible)
        self.assertNotIn("aci-bench", ingestible)
        self.assertNotIn("mts-dialog", ingestible)

    def test_blocked_datasets(self):
        blocked = {e.name for e in self.registry.blocked()}
        self.assertIn("medtempo-bench", blocked)
        self.assertIn("aci-bench", blocked)
        self.assertIn("mts-dialog", blocked)
        self.assertIn("pubmedqa", blocked)

    def test_synthetic_hospital_ingestible(self):
        entry = self.registry.get("synthetic-hospital")
        self.assertIsNotNone(entry)
        self.assertEqual(entry.license_status, LicenseStatus.APPROVED)
        self.assertEqual(entry.dataset_class, DatasetClass.SYNTHETIC)
        self.assertTrue(entry.is_ingestible())

    def test_medtempo_blocked(self):
        entry = self.registry.get("medtempo-bench")
        self.assertIsNotNone(entry)
        self.assertEqual(entry.license_status, LicenseStatus.REVIEW_REQUIRED)
        self.assertTrue(entry.review_required)
        self.assertFalse(entry.is_ingestible())

    def test_aci_bench_real_not_simulated(self):
        """ACI-Bench is real doctor-patient conversations, not simulated/scripted."""
        entry = self.registry.get("aci-bench")
        self.assertIsNotNone(entry)
        self.assertEqual(entry.dataset_class, DatasetClass.REAL)
        self.assertIn("real", entry.notes.lower())

    def test_mts_dialog_mixed(self):
        """MTS-Dialog is mixed: real main + synthetic augmented."""
        entry = self.registry.get("mts-dialog")
        self.assertIsNotNone(entry)
        self.assertEqual(entry.dataset_class, DatasetClass.MIXED)
        self.assertTrue(entry.review_required)
        self.assertFalse(entry.is_ingestible())

    def test_dataset_entry_to_dict(self):
        entry = DatasetEntry(
            name="test-ds",
            source_url="https://example.com",
            revision="main",
            license="MIT",
            license_status=LicenseStatus.APPROVED,
            dataset_class=DatasetClass.SYNTHETIC,
        )
        d = entry.__dict__
        self.assertEqual(d["name"], "test-ds")
        self.assertTrue(entry.is_ingestible())


if __name__ == "__main__":
    unittest.main()
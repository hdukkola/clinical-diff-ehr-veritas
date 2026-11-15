"""
Tests for the model promotion gate (Phase 6).

Covers: promotion gates, human approval, safety regressions, structured output.
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.promotion import PromotionGate


class TestPromotionGate(unittest.TestCase):
    def setUp(self):
        self.gate = PromotionGate(work_dir=".")
        # Clear any persisted records from prior test runs
        if self.gate.records_path.exists():
            self.gate.records_path.unlink()

    def tearDown(self):
        if self.gate.records_path.exists():
            self.gate.records_path.unlink()

    def test_approve_when_all_gates_pass(self):
        baseline = {"pair_matches": 5, "dose_exact": 4, "time_exact": 5, "unauthorized_changes": 0, "null_type_errors": 0, "abstention_correct": 5}
        candidate = {"pair_matches": 6, "dose_exact": 5, "time_exact": 5, "unauthorized_changes": 0, "null_type_errors": 0, "abstention_correct": 5}
        decision = self.gate.evaluate(
            candidate_model_id="adapter-v2",
            baseline=baseline,
            candidate=candidate,
            structured_output_valid=True,
            abstention_correct=True,
            authority_handling_correct=True,
            reproducible_artifacts=True,
            human_approved=True,
        )
        self.assertTrue(decision.approved)
        self.assertEqual(decision.reason, "All promotion gates passed")

    def test_reject_when_no_human_approval(self):
        baseline = {"pair_matches": 5, "dose_exact": 4, "time_exact": 5}
        candidate = {"pair_matches": 6, "dose_exact": 5, "time_exact": 5}
        decision = self.gate.evaluate(
            candidate_model_id="adapter-v2",
            baseline=baseline,
            candidate=candidate,
            structured_output_valid=True,
            abstention_correct=True,
            authority_handling_correct=True,
            reproducible_artifacts=True,
            human_approved=False,
        )
        self.assertFalse(decision.approved)
        self.assertIn("Human approval", decision.reason)

    def test_reject_when_primary_not_improved(self):
        baseline = {"pair_matches": 6, "dose_exact": 5, "time_exact": 5}
        candidate = {"pair_matches": 5, "dose_exact": 4, "time_exact": 5}
        decision = self.gate.evaluate(
            candidate_model_id="adapter-v2",
            baseline=baseline,
            candidate=candidate,
            structured_output_valid=True,
            abstention_correct=True,
            authority_handling_correct=True,
            reproducible_artifacts=True,
            human_approved=True,
        )
        self.assertFalse(decision.approved)
        self.assertIn("Primary extraction performance", decision.reason)

    def test_reject_when_safety_regression(self):
        baseline = {"pair_matches": 5, "unauthorized_changes": 0, "null_type_errors": 0, "abstention_correct": 5}
        candidate = {"pair_matches": 6, "unauthorized_changes": 2, "null_type_errors": 0, "abstention_correct": 5}
        decision = self.gate.evaluate(
            candidate_model_id="adapter-v2",
            baseline=baseline,
            candidate=candidate,
            structured_output_valid=True,
            abstention_correct=True,
            authority_handling_correct=True,
            reproducible_artifacts=True,
            human_approved=True,
        )
        self.assertFalse(decision.approved)
        self.assertIn("Safety regressions", decision.reason)

    def test_reject_when_structured_output_invalid(self):
        baseline = {"pair_matches": 5}
        candidate = {"pair_matches": 6}
        decision = self.gate.evaluate(
            candidate_model_id="adapter-v2",
            baseline=baseline,
            candidate=candidate,
            structured_output_valid=False,
            abstention_correct=True,
            authority_handling_correct=True,
            reproducible_artifacts=True,
            human_approved=True,
        )
        self.assertFalse(decision.approved)
        self.assertIn("Structured-output behavior invalid", decision.reason)

    def test_reject_when_abstention_incorrect(self):
        baseline = {"pair_matches": 5, "abstention_correct": 5}
        candidate = {"pair_matches": 6, "abstention_correct": 3}
        decision = self.gate.evaluate(
            candidate_model_id="adapter-v2",
            baseline=baseline,
            candidate=candidate,
            structured_output_valid=True,
            abstention_correct=False,
            authority_handling_correct=True,
            reproducible_artifacts=True,
            human_approved=True,
        )
        self.assertFalse(decision.approved)
        self.assertIn("Abstention handling", decision.reason)

    def test_record_persisted(self):
        baseline = {"pair_matches": 5}
        candidate = {"pair_matches": 6}
        decision = self.gate.evaluate(
            candidate_model_id="adapter-v2",
            baseline=baseline,
            candidate=candidate,
            structured_output_valid=True,
            abstention_correct=True,
            authority_handling_correct=True,
            reproducible_artifacts=True,
            human_approved=True,
        )
        records = self.gate.list_records()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["decision"]["model_id"], "adapter-v2")
        self.assertEqual(records[0]["decision"]["approved"], True)


if __name__ == "__main__":
    unittest.main()
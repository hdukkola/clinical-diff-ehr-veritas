"""
Tests for base vs adapter comparison (Phase 5).

Covers: metric deltas, safety regression detection, adapter_better flag.
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.evaluator import (
    EvaluationResult,
    compare_base_vs_adapter,
)


def _make_result(**overrides) -> EvaluationResult:
    base = {
        "cases": [],
        "total_events": 10,
        "pair_matches": 6,
        "dose_exact": 5,
        "time_exact": 5,
        "evidence_literal": 7,
        "authority_matches": 10,
        "abstentions_correct": 8,
        "unauthorized_changes": 1,
        "null_type_errors": 2,
        "strict_json_valid_cases": 2,
    }
    base.update(overrides)
    return EvaluationResult(**base)


class TestBaseVsAdapterComparison(unittest.TestCase):
    def test_adapter_better_when_all_metrics_improve(self):
        base = _make_result(pair_matches=6, dose_exact=5, time_exact=5,
                            evidence_literal=7, null_type_errors=2,
                            unauthorized_changes=1, abstentions_correct=8)
        adapter = _make_result(pair_matches=8, dose_exact=7, time_exact=7,
                               evidence_literal=9, null_type_errors=1,
                               unauthorized_changes=0, abstentions_correct=9)
        comparison = compare_base_vs_adapter(base, adapter)
        self.assertTrue(comparison.adapter_better)
        self.assertEqual(comparison.pair_match_delta, 2)
        self.assertEqual(comparison.dose_exact_delta, 2)
        self.assertEqual(comparison.time_exact_delta, 2)
        self.assertEqual(comparison.evidence_literal_delta, 2)
        self.assertEqual(comparison.null_type_error_delta, -1)
        self.assertEqual(comparison.safety_regressions, [])

    def test_adapter_not_better_when_primary_decreases(self):
        base = _make_result(pair_matches=8, dose_exact=7, time_exact=7)
        adapter = _make_result(pair_matches=6, dose_exact=5, time_exact=5)
        comparison = compare_base_vs_adapter(base, adapter)
        self.assertFalse(comparison.adapter_better)
        self.assertEqual(comparison.pair_match_delta, -2)

    def test_safety_regression_on_unauthorized_changes(self):
        base = _make_result(unauthorized_changes=0)
        adapter = _make_result(unauthorized_changes=3)
        comparison = compare_base_vs_adapter(base, adapter)
        self.assertTrue(any("unauthorized_changes" in r for r in comparison.safety_regressions))

    def test_safety_regression_on_null_type_errors(self):
        base = _make_result(null_type_errors=0)
        adapter = _make_result(null_type_errors=4)
        comparison = compare_base_vs_adapter(base, adapter)
        self.assertTrue(any("null_type_errors" in r for r in comparison.safety_regressions))

    def test_safety_regression_on_abstention(self):
        base = _make_result(abstentions_correct=8)
        adapter = _make_result(abstentions_correct=3)
        comparison = compare_base_vs_adapter(base, adapter)
        self.assertTrue(any("abstentions_correct" in r for r in comparison.safety_regressions))

    def test_no_safety_regression_when_metrics_equal(self):
        base = _make_result(unauthorized_changes=1, null_type_errors=2, abstentions_correct=8)
        adapter = _make_result(unauthorized_changes=1, null_type_errors=2, abstentions_correct=8)
        comparison = compare_base_vs_adapter(base, adapter)
        self.assertEqual(comparison.safety_regressions, [])


if __name__ == "__main__":
    unittest.main()
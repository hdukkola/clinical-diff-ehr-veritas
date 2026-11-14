#!/usr/bin/env python3
"""Regression tests for rescore_medication_events.py (fresh-eval handoff copy).

Runs the rescorer, loads its output, and asserts the verified comparison
matches the independently inspected ground truth (original evaluate_seed.py
outputs, field-audit.json, and relative-time-rescore.json).  Also exercises
the diagnostic parser and helper functions directly.

Discoverable via both:
    python3 -m unittest discover -s fresh-eval -p 'test_*.py' -v
    python3 fresh-eval/test_rescore.py
"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import rescore_medication_events as R  # noqa: E402

OUT = ROOT / "rescore-results.json"


def run_rescorer():
    subprocess.run([sys.executable, str(ROOT / "rescore_medication_events.py")], check=True)
    return json.loads(OUT.read_text())


class TestParserModes(unittest.TestCase):
    def test_strict(self):
        events, strict_flag, mode = R.diagnostic_parse('[{"a": 1}]')
        self.assertTrue(strict_flag)
        self.assertEqual(mode, "strict")
        self.assertEqual(events, [{"a": 1}])

    def test_fenced(self):
        events, strict_flag, mode = R.diagnostic_parse('```json\n[{"a": 1}]\n```')
        self.assertFalse(strict_flag)
        self.assertEqual(mode, "fenced_json")
        self.assertEqual(events, [{"a": 1}])

    def test_concatenated(self):
        events, strict_flag, mode = R.diagnostic_parse('{"a": 1}{"a": 2}')
        self.assertFalse(strict_flag)
        self.assertEqual(mode, "concatenated_objects")
        self.assertEqual(events, [{"a": 1}, {"a": 2}])

    def test_unparseable(self):
        events, strict_flag, _ = R.diagnostic_parse("not json at all")
        self.assertFalse(strict_flag)
        self.assertEqual(events, [])


class TestHelpers(unittest.TestCase):
    def test_norm_dose(self):
        self.assertIsNone(R.norm_dose(None))
        self.assertEqual(R.norm_dose("  0.5   mg/kg "), "0.5 mg/kg")

    def test_norm_time(self):
        self.assertEqual(R.norm_time("At a later consultation"), "at a later consultation")

    def test_signature(self):
        self.assertEqual(
            R.signature({"medication": "  Tacrolimus ", "action": "STOP"}),
            ("tacrolimus", "stop"),
        )

    def test_evidence_reference_ok(self):
        self.assertTrue(R.evidence_reference_ok("they stopped agomelatine", "x", "stop"))
        self.assertTrue(R.evidence_reference_ok("was already taking escitalopram", "x", "continue"))

    def test_check_missing_values(self):
        self.assertEqual(
            R.check_missing_values([{"medication": "m", "dose": "null"}]),
            [{"medication": "m", "field": "dose", "value": "null"}],
        )


class TestRescoreTotals(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = run_rescorer()
        cls.base = cls.out["variant_totals"]["base"]
        cls.adapter = cls.out["variant_totals"]["adapter"]

    def test_strict_and_parseable_schema(self):
        # Cross-check against original evaluate_seed.py + field-audit.json.
        self.assertEqual(self.base["strict_json_valid"], 0)
        self.assertEqual(self.base["strict_schema"], 0)
        self.assertEqual(self.adapter["strict_schema"], 0)
        self.assertEqual(self.base["parseable_schema"], 2)
        self.assertEqual(self.adapter["parseable_schema"], 2)

    def test_pairs(self):
        for v in (self.base, self.adapter):
            self.assertEqual(v["event_pairs_matched"], 9)
            self.assertEqual(v["event_pairs_expected"], 9)
            self.assertEqual(v["event_pairs_missed"], 0)
            self.assertEqual(v["event_pairs_extra"], 0)
            self.assertEqual(v["pair_f1"], 1.0)

    def test_dose(self):
        self.assertEqual(self.base["dose_exact"], 7)
        self.assertEqual(self.base["dose_amount_unit_agree_with_frequency"], 1)
        self.assertEqual(self.adapter["dose_exact"], 5)
        self.assertEqual(self.adapter["dose_amount_unit_agree_with_frequency"], 1)

    def test_time(self):
        # Base: 9 exact (signature-aligned). Adapter: 9 exact after relative-time
        # fix, but only 7 match the current label because it writes string "null".
        self.assertEqual(self.base["time_exact"], 9)
        self.assertEqual(self.base["time_exact_strict_vs_label"], 9)
        self.assertEqual(self.adapter["time_exact"], 9)
        self.assertEqual(self.adapter["time_exact_strict_vs_label"], 7)

    def test_timing_discrepancy_is_explained(self):
        """9/9 vs 7/9 timing: the 2-event gap is string 'null' vs JSON null.

        Base reorders PMC8025526 (continuation first), but time is matched by
        (medication, action) signature, not position, so base still scores 9/9.
        Adapter emits the string "null" for two unspecified times, which the
        scorer treats as an extra/mismatched value against the label's null.
        """
        adapter_case = next(r for r in self.out["per_case"]["adapter"] if r["id"] == "PMC8025526")
        # Exactly two adapter times are the literal string "null".
        string_null_times = [
            d for d in adapter_case["missing_values"]["details"] if d["field"] == "time"
        ]
        self.assertEqual(len(string_null_times), 2)
        # And the adapter's per-case time_exact (3) exceeds strict_vs_label (1) by 2.
        self.assertEqual(adapter_case["time"]["exact"], 3)
        self.assertEqual(adapter_case["time"]["strict_vs_label"], 1)
        # Base per-case: exact == strict_vs_label (no string-null gap).
        base_case = next(r for r in self.out["per_case"]["base"] if r["id"] == "PMC8025526")
        self.assertEqual(base_case["time"]["exact"], 3)
        self.assertEqual(base_case["time"]["strict_vs_label"], 3)

    def test_evidence(self):
        self.assertEqual(self.base["evidence_literal"], 9)
        self.assertEqual(self.adapter["evidence_literal"], 9)
        self.assertEqual(self.base["evidence_resolvable_action"], 4)
        self.assertEqual(self.adapter["evidence_resolvable_action"], 6)
        self.assertEqual(self.base["evidence_nonliteral"], 0)
        self.assertEqual(self.adapter["evidence_nonliteral"], 0)

    def test_missing_values(self):
        self.assertEqual(self.base["string_null_fields"], 0)
        self.assertEqual(self.adapter["string_null_fields"], 3)

    def test_relative_time_rescore_cross_check(self):
        rt = json.loads((ROOT / "relative-time-rescore.json").read_text())
        self.assertEqual(
            self.adapter["time_exact_strict_vs_label"],
            rt["adapter"]["exact_times_after_diagnostic_parsing"],
        )
        self.assertEqual(
            self.base["time_exact"],
            rt["base"]["exact_times_after_diagnostic_parsing"],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
"""
Tests for the frozen evaluation suite (Phase 3).

Covers: strict JSON, medication/action pairs, dose, time, evidence literal,
null type handling, abstention, unauthorized changes.
"""

import unittest
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.evaluator import (
    evaluate_case,
    evaluate_all,
    _diagnostic_parse,
    _norm,
)


class TestDiagnosticParse(unittest.TestCase):
    def test_strict_json(self):
        objs, strict, mode = _diagnostic_parse('[{"a": 1}]')
        self.assertTrue(strict)
        self.assertEqual(mode, "strict")
        self.assertEqual(objs, [{"a": 1}])

    def test_fenced_json(self):
        objs, strict, mode = _diagnostic_parse('```json\n[{"a": 1}]\n```')
        self.assertFalse(strict)
        self.assertEqual(mode, "fenced_json")
        self.assertEqual(objs, [{"a": 1}])

    def test_concatenated_objects(self):
        objs, strict, mode = _diagnostic_parse('{"a": 1}{"a": 2}')
        self.assertFalse(strict)
        self.assertEqual(mode, "concatenated_objects")
        self.assertEqual(objs, [{"a": 1}, {"a": 2}])

    def test_invalid_json(self):
        objs, strict, mode = _diagnostic_parse("not json")
        self.assertFalse(strict)
        self.assertEqual(objs, [])


class TestNorm(unittest.TestCase):
    def test_none(self):
        self.assertIsNone(_norm(None))

    def test_string_null(self):
        self.assertEqual(_norm("null"), "STRING_NULL")
        self.assertEqual(_norm("  NULL  "), "STRING_NULL")

    def test_normal_string(self):
        self.assertEqual(_norm("  0.5 mg/kg  "), "0.5 mg/kg")


class TestEvaluateCase(unittest.TestCase):
    def setUp(self):
        self.case = {
            "id": "PMC-TEST",
            "text": "The patient takes Lisinopril 20 mg daily.",
            "events": [
                {
                    "medication": "Lisinopril",
                    "action": "start",
                    "dose": "20 mg",
                    "time": "daily",
                    "evidence": "The patient takes Lisinopril 20 mg daily.",
                }
            ],
        }

    def test_perfect_match(self):
        response = '[{"medication": "Lisinopril", "action": "start", "dose": "20 mg", "time": "daily", "evidence": "The patient takes Lisinopril 20 mg daily."}]'
        result = evaluate_case(self.case, response, self.case["text"])
        self.assertTrue(result.strict_json_valid)
        self.assertEqual(result.parse_mode, "strict")
        self.assertEqual(len(result.events), 1)
        ev = result.events[0]
        self.assertTrue(ev.pair_match)
        self.assertTrue(ev.dose.exact_match)
        self.assertTrue(ev.time.exact_match)
        self.assertTrue(ev.evidence_literal)
        self.assertEqual(result.null_type_errors, 0)

    def test_fenced_json_not_strict(self):
        response = '```json\n[{"medication": "Lisinopril", "action": "start", "dose": "20 mg", "time": "daily", "evidence": "The patient takes Lisinopril 20 mg daily."}]\n```'
        result = evaluate_case(self.case, response, self.case["text"])
        self.assertFalse(result.strict_json_valid)
        self.assertEqual(result.parse_mode, "fenced_json")

    def test_string_null_dose_flagged(self):
        response = '[{"medication": "Lisinopril", "action": "start", "dose": "null", "time": "daily", "evidence": "x"}]'
        result = evaluate_case(self.case, response, self.case["text"])
        self.assertEqual(result.null_type_errors, 1)
        self.assertEqual(result.events[0].dose.predicted, "STRING_NULL")

    def test_missing_event(self):
        response = '[]'
        result = evaluate_case(self.case, response, self.case["text"])
        self.assertEqual(len(result.events), 0)
        self.assertEqual(result.total_events_if_counted, 0) if hasattr(result, 'total_events_if_counted') else None

    def test_abstention_on_missing_info(self):
        # Expected event has no dose/time (missing info)
        case = {
            "id": "PMC-ABSTAIN",
            "text": "The patient takes Lisinopril.",
            "events": [
                {"medication": "Lisinopril", "action": "start", "dose": None, "time": None, "evidence": "The patient takes Lisinopril."}
            ],
        }
        # Model invents values — should NOT abstain correctly
        response = '[{"medication": "Lisinopril", "action": "start", "dose": "20 mg", "time": "daily", "evidence": "x"}]'
        result = evaluate_case(case, response, case["text"])
        ev = result.events[0]
        self.assertFalse(ev.abstention_correct)  # model invented missing values
        self.assertTrue(ev.unauthorized_change)

    def test_abstention_correct(self):
        case = {
            "id": "PMC-ABSTAIN2",
            "text": "The patient takes Lisinopril.",
            "events": [
                {"medication": "Lisinopril", "action": "start", "dose": None, "time": None, "evidence": "The patient takes Lisinopril."}
            ],
        }
        # Model abstains correctly
        response = '[{"medication": "Lisinopril", "action": "start", "dose": null, "time": null, "evidence": "The patient takes Lisinopril."}]'
        result = evaluate_case(case, response, case["text"])
        ev = result.events[0]
        self.assertTrue(ev.abstention_correct)

    def test_evidence_not_literal(self):
        response = '[{"medication": "Lisinopril", "action": "start", "dose": "20 mg", "time": "daily", "evidence": "Something not in text"}]'
        result = evaluate_case(self.case, response, self.case["text"])
        self.assertFalse(result.events[0].evidence_literal)


class TestEvaluateAll(unittest.TestCase):
    def test_aggregate(self):
        cases = [
            {
                "id": "C1",
                "text": "Patient takes Lisinopril 20 mg daily.",
                "events": [
                    {"medication": "Lisinopril", "action": "start", "dose": "20 mg", "time": "daily", "evidence": "Patient takes Lisinopril 20 mg daily."}
                ],
            },
            {
                "id": "C2",
                "text": "Patient takes Metformin.",
                "events": [
                    {"medication": "Metformin", "action": "start", "dose": None, "time": None, "evidence": "Patient takes Metformin."}
                ],
            },
        ]
        responses = {
            "C1": '[{"medication": "Lisinopril", "action": "start", "dose": "20 mg", "time": "daily", "evidence": "Patient takes Lisinopril 20 mg daily."}]',
            "C2": '[{"medication": "Metformin", "action": "start", "dose": null, "time": null, "evidence": "Patient takes Metformin."}]',
        }
        result = evaluate_all(cases, responses, {"C1": cases[0]["text"], "C2": cases[1]["text"]})
        self.assertEqual(result.total_events, 2)
        self.assertEqual(result.pair_matches, 2)
        self.assertEqual(result.dose_exact, 2)  # C1: 20mg=20mg; C2: None=None (both match)
        self.assertEqual(result.time_exact, 2)  # C1: daily=daily; C2: None=None (both match)
        self.assertEqual(result.evidence_literal, 2)
        self.assertEqual(result.null_type_errors, 0)
        self.assertEqual(result.strict_json_valid_cases, 2)


if __name__ == "__main__":
    unittest.main()
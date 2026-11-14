"""
Tests for evaluation leakage detection (Phase 3).

Covers: article/patient ID overlap, forced exclusion, observed training IDs,
disjoint split enforcement.
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.config import EvaluationLeakageConfig, PipelineConfig
from mlx_runner.evaluator import check_evaluation_leakage


class TestEvaluationLeakage(unittest.TestCase):
    def setUp(self):
        self.config = PipelineConfig()

    def test_no_leakage_when_disjoint(self):
        training = [
            {"id": "PMC-TRAIN-1", "text": "Training case 1"},
            {"id": "PMC-TRAIN-2", "text": "Training case 2"},
        ]
        evaluation = [
            {"id": "PMC-EVAL-1", "text": "Evaluation case 1"},
            {"id": "PMC-EVAL-2", "text": "Evaluation case 2"},
        ]
        result = check_evaluation_leakage(training, evaluation, self.config.leakage)
        self.assertTrue(result.passed)
        self.assertEqual(result.article_ids_overlap, [])

    def test_leakage_detected_on_overlap(self):
        training = [
            {"id": "PMC-SHARED-1", "text": "Training case"},
            {"id": "PMC-TRAIN-2", "text": "Training case 2"},
        ]
        evaluation = [
            {"id": "PMC-SHARED-1", "text": "Evaluation case (same ID)"},
            {"id": "PMC-EVAL-2", "text": "Evaluation case 2"},
        ]
        result = check_evaluation_leakage(training, evaluation, self.config.leakage)
        self.assertFalse(result.passed)
        self.assertIn("PMC-SHARED-1", result.article_ids_overlap)
        self.assertTrue(any("LEAKAGE" in r for r in result.reasons))

    def test_forced_exclusion_blocks_eval_ids(self):
        evaluation = [
            {"id": "PMC-EXCLUDED-1", "text": "Evaluation case"},
            {"id": "PMC-EVAL-2", "text": "Evaluation case 2"},
        ]
        config = PipelineConfig()
        config.leakage.forced_exclusion_ids = ["PMC-EXCLUDED-1", "PMC-EXCLUDED-2"]
        result = check_evaluation_leakage(None, evaluation, config.leakage)
        self.assertFalse(result.passed)
        self.assertIn("PMC-EXCLUDED-1", result.eval_ids_in_training)

    def test_observed_training_ids_blocks_eval(self):
        evaluation = [
            {"id": "PMC-OBSERVED-1", "text": "Evaluation case"},
        ]
        config = PipelineConfig()
        config.leakage.observed_training_ids = ["PMC-OBSERVED-1", "PMC-TRAIN-2"]
        result = check_evaluation_leakage(None, evaluation, config.leakage)
        self.assertFalse(result.passed)
        self.assertIn("PMC-OBSERVED-1", result.eval_ids_in_training)

    def test_none_data_passes(self):
        result = check_evaluation_leakage(None, None, self.config.leakage)
        self.assertTrue(result.passed)
        self.assertTrue(any("skipped" in r.lower() for r in result.reasons))

    def test_patient_id_overlap(self):
        training = [
            {"patient_id": "PAT-001", "article_id": "ART-100"},
        ]
        evaluation = [
            {"patient_id": "PAT-001", "article_id": "ART-200"},
        ]
        result = check_evaluation_leakage(training, evaluation, self.config.leakage)
        self.assertFalse(result.passed)
        self.assertIn("PAT-001", result.article_ids_overlap)

    def test_leakage_config_defaults(self):
        config = EvaluationLeakageConfig()
        self.assertTrue(config.enabled)
        self.assertTrue(config.check_article_id_overlap)
        self.assertTrue(config.check_patient_id_overlap)
        self.assertTrue(config.exclude_training_ids_from_eval)
        self.assertTrue(config.eval_split_must_be_disjoint)


if __name__ == "__main__":
    unittest.main()
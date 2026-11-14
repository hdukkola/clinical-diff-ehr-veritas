"""
Tests for the experiment scheduler (Phase 5).

Covers: dry-run, evaluate-only, train-once blocking, scheduled mode, license checks.
"""

import unittest
import sys
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.config import PipelineConfig, RunMode
from mlx_runner.scheduler import ExperimentScheduler


class TestExperimentScheduler(unittest.TestCase):
    def setUp(self):
        self.config = PipelineConfig(mode=RunMode.DRY_RUN, work_dir=".")
        self.scheduler = ExperimentScheduler(self.config, work_dir=".")

    def test_dry_run_passes(self):
        result = self.scheduler.run_dry_run()
        self.assertIn("mode", result)
        self.assertEqual(result["mode"], "dry-run")
        self.assertIn("status", result)

    def test_dry_run_lists_ingestible_and_blocked(self):
        result = self.scheduler.run_dry_run()
        self.assertIn("ingestible_datasets", result)
        self.assertIn("blocked_datasets", result)
        self.assertIn("fresh-eval-dev", result["ingestible_datasets"])
        self.assertIn("medtempo-bench", [b.split(":")[0] for b in result["blocked_datasets"]])

    def test_evaluate_only(self):
        result = self.scheduler.run_evaluate_only()
        self.assertEqual(result["mode"], "evaluate-only")
        self.assertIn("status", result)
        self.assertIn("evaluation", result)

    def test_train_once_blocked_without_approval(self):
        result = self.scheduler.run_train_once(operator_approved=False)
        self.assertEqual(result["status"], "blocked")
        self.assertIn("approval", result["rejection_reason"].lower())

    def test_train_once_blocked_even_with_approval(self):
        result = self.scheduler.run_train_once(operator_approved=True)
        self.assertIn("not implemented", result["rejection_reason"])
        self.assertEqual(result["status"], "blocked")

    def test_scheduled_mode(self):
        result = self.scheduler.run_scheduled()
        self.assertEqual(result["mode"], "scheduled")
        self.assertIn("dry_run", result)
        self.assertIn("evaluate_only", result)

    def test_scheduled_mode_stops_before_evaluation_when_preflight_fails(self):
        with patch.object(self.scheduler, "check_resources", return_value=["Resource check failed"]):
            with patch.object(self.scheduler, "run_evaluate_only") as evaluate:
                result = self.scheduler.run_scheduled()
        self.assertEqual(result["status"], "blocked")
        self.assertIsNone(result["evaluate_only"])
        evaluate.assert_not_called()

    def test_list_experiments(self):
        self.scheduler.run_dry_run()
        exps = self.scheduler.list_experiments()
        self.assertGreaterEqual(len(exps), 1)


if __name__ == "__main__":
    unittest.main()
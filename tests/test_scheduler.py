"""
Tests for the experiment scheduler (Phase 5).

Covers: dry-run, evaluate-only, train-once blocking, scheduled mode, license checks.
"""

import unittest
import sys
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

    def test_train_once_blocked_with_review_required_datasets(self):
        # Config that has review_required datasets would block
        result = self.scheduler.run_train_once(operator_approved=True)
        # Should be blocked because medtempo-bench etc. are review-required
        self.assertEqual(result["status"], "blocked")

    def test_scheduled_mode(self):
        result = self.scheduler.run_scheduled()
        self.assertEqual(result["mode"], "scheduled")
        # Scheduled mode may complete (dry_run + evaluate_only) or be blocked
        # by resource issues (auto-pause). Either is valid behavior.
        if result["status"] == "completed":
            self.assertIn("dry_run", result)
            self.assertIn("evaluate_only", result)
        else:
            self.assertIn("rejection_reason", result)

    def test_list_experiments(self):
        self.scheduler.run_dry_run()
        exps = self.scheduler.list_experiments()
        self.assertGreaterEqual(len(exps), 1)


if __name__ == "__main__":
    unittest.main()
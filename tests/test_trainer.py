"""
Tests for the conservative trainer (Phase 4).

Covers: resource checks, existing process detection, smoke test, training blocking.
"""

import unittest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.config import PipelineConfig, ResourceLimits, ModelConfig, RunMode
from mlx_runner.trainer import TrainingEngine, TrainingStatus, TrainingResult


class TestTrainingEngine(unittest.TestCase):
    def setUp(self):
        self.config = PipelineConfig(
            mode=RunMode.DRY_RUN,
            resources=ResourceLimits(max_memory_gb=40.0, max_disk_gb=100.0, max_duration_minutes=60),
        )
        self.engine = TrainingEngine(self.config, work_dir=".")

    def test_initial_status_pending(self):
        self.assertEqual(self.engine.status(), TrainingStatus.PENDING)

    def test_check_existing_training_returns_list(self):
        conflicts = self.engine.check_existing_training()
        self.assertIsInstance(conflicts, list)

    def test_check_resources_returns_list(self):
        reasons = self.engine.check_resources()
        self.assertIsInstance(reasons, list)

    def test_run_training_blocked_in_dry_run(self):
        # Dry run mode should not train
        self.config.dry_run_only = True
        result = self.engine.run_training(smoke_test=False)
        self.assertEqual(result.status, TrainingStatus.BLOCKED)
        self.assertIsNotNone(result.blocked_reason)

    def test_run_training_requires_operator_approval(self):
        self.config.require_operator_approval = True
        self.config.mode = RunMode.TRAIN_ONCE
        result = self.engine.run_training(smoke_test=False)
        self.assertEqual(result.status, TrainingStatus.BLOCKED)
        self.assertIn("approval", result.blocked_reason.lower())

    def test_run_smoke_test_no_local_model(self):
        # No base model available locally
        self.config.model.base_model_available_locally = False
        result = self.engine.run_smoke_test()
        # Smoke test doesn't load model, so it should complete (it runs a placeholder script)
        self.assertEqual(result.status, TrainingStatus.COMPLETED)
        self.assertTrue(result.smoke_test)

    def test_abort(self):
        self.engine._status = TrainingStatus.RUNNING
        self.engine.abort()
        self.assertEqual(self.engine.status(), TrainingStatus.ABORTED)


class TestTrainingResult(unittest.TestCase):
    def test_default_values(self):
        r = TrainingResult(status=TrainingStatus.PENDING)
        self.assertEqual(r.status, TrainingStatus.PENDING)
        self.assertEqual(r.steps_completed, 0)
        self.assertIsNone(r.checkpoint_path)
        self.assertIsNone(r.error_message)


if __name__ == "__main__":
    unittest.main()
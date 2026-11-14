"""Exercise runner safety gates without models, network, or real checkpoints."""

import hashlib
import json
import plistlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mlx_runner.config import PipelineConfig
from mlx_runner.promotion import PromotionGate
from mlx_runner.scheduler import ExperimentScheduler
from mlx_runner.trainer import TrainingEngine, TrainingStatus


class RunnerSafetyTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.config = PipelineConfig(
            checkpoint_dir=str(self.root / "checkpoints"),
            run_dir=str(self.root / "runs"),
            log_dir=str(self.root / "logs"),
        )
        self.engine = TrainingEngine(self.config, self.root)

    def test_blocked_preflight_prevents_scheduled_evaluation(self):
        scheduler = ExperimentScheduler(self.config, self.root)
        with patch.object(scheduler, "check_resources", return_value=["Simulated resource limit"]):
            with patch.object(scheduler, "run_evaluate_only") as evaluate:
                result = scheduler.run_scheduled()
        self.assertEqual(result["status"], "blocked")
        self.assertIn("Simulated resource limit", result["resource_issues"])
        evaluate.assert_not_called()

    def test_abort_reaps_the_owned_dummy_child(self):
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])

        def cleanup():
            if child.poll() is None:
                child.kill()
            child.wait(timeout=5)

        self.addCleanup(cleanup)
        self.assertIsNone(child.poll())
        self.engine._current_process = child
        self.engine.abort()
        self.assertIsNotNone(child.poll())
        self.assertEqual(self.engine.status(), TrainingStatus.ABORTED)

    def test_checkpoint_tampering_blocks_recovery(self):
        path = self.engine.checkpoint_dir / "candidate_adapters.safetensors"
        original = b"checkpoint fixture"
        path.write_bytes(original)
        path.with_name("candidate_manifest.json").write_text(json.dumps({
            "verified": True,
            "sha256": hashlib.sha256(original).hexdigest(),
            "completed_steps": 1,
        }))
        self.assertIsNotNone(self.engine.resume_from_checkpoint(path))
        path.write_bytes(b"changed checkpoint fixture")
        self.assertIsNone(self.engine.resume_from_checkpoint(path))

    def test_unapproved_candidate_cannot_replace_adapter_fixture(self):
        current = self.engine.checkpoint_dir / "current_adapters.safetensors"
        current.write_bytes(b"current adapter fixture")
        candidate = self.engine.checkpoint_dir / "candidate_adapters.safetensors"
        candidate.write_bytes(b"candidate adapter fixture")
        metrics = {"pair_matches": 1, "dose_exact": 1, "time_exact": 1}
        decision = PromotionGate(self.root).evaluate(
            candidate_model_id="candidate",
            baseline=metrics,
            candidate=metrics,
            structured_output_valid=True,
            abstention_correct=True,
            authority_handling_correct=True,
            reproducible_artifacts=True,
            human_approved=False,
            artifacts=[str(candidate)],
        )
        self.assertFalse(decision.approved)
        self.assertIn("Human approval not provided", decision.reason)
        self.assertEqual(current.read_bytes(), b"current adapter fixture")

    def test_training_entry_point_and_launchd_remain_disabled(self):
        scheduler = ExperimentScheduler(self.config, self.root)
        self.assertEqual(scheduler.run_train_once(operator_approved=True)["status"], "blocked")
        plist = plistlib.loads(scheduler.launchd_plist().encode())
        self.assertTrue(plist["Disabled"])
        self.assertFalse(plist["RunAtLoad"])
        self.assertEqual(plist["ProgramArguments"][-2:], ["--mode", "dry-run"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

"""
Tests for checkpoint recovery and management (Phase 4).

Covers: checkpoint listing, verification, recovery, cleanup, atomic saves.
"""

import hashlib
import unittest
import sys
import json
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.config import PipelineConfig
from mlx_runner.trainer import TrainingEngine, CheckpointInfo


class TestCheckpointRecovery(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.config = PipelineConfig(
            mode="dry-run",
            work_dir=self.tmpdir,
            checkpoint_dir=str(Path(self.tmpdir) / "checkpoints"),
            run_dir=str(Path(self.tmpdir) / "runs"),
            log_dir=str(Path(self.tmpdir) / "logs"),
        )
        self.engine = TrainingEngine(self.config, work_dir=self.tmpdir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_list_checkpoints_empty(self):
        ckpts = self.engine.list_checkpoints()
        self.assertEqual(ckpts, [])

    def test_verify_checkpoint_missing_file(self):
        result = self.engine.verify_checkpoint("/nonexistent/path.safetensors")
        self.assertIsNone(result)

    def test_verify_checkpoint_valid(self):
        ckpt_dir = Path(self.tmpdir) / "checkpoints"
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        ckpt_path = ckpt_dir / "test_adapters.safetensors"
        ckpt_path.write_bytes(b"checkpoint-data-12345")
        manifest = ckpt_dir / "test_manifest.json"
        manifest.write_text(json.dumps({
            "sha256": hashlib.sha256(ckpt_path.read_bytes()).hexdigest(),
            "completed_steps": 500,
            "timestamp": "2026-11-14T20:00:00Z",
            "verified": True,
        }))

        info = self.engine.verify_checkpoint(ckpt_path)
        self.assertIsNotNone(info)
        self.assertTrue(info.verified)
        self.assertEqual(info.step, 500)
        self.assertIsNotNone(info.sha256)
        self.assertEqual(len(info.sha256), 64)  # SHA-256 hex length

    def test_smoke_test_leaves_existing_checkpoints_untouched(self):
        path = self.engine.checkpoint_dir / "some_adapters.safetensors"
        path.write_bytes(b"existing")
        result = self.engine.run_smoke_test()
        self.assertTrue(result.smoke_test)
        self.assertIsNone(result.checkpoint_path)
        self.assertEqual(list(self.engine.checkpoint_dir.iterdir()), [path])
        self.assertEqual(path.read_bytes(), b"existing")

    def test_resume_from_unverified_checkpoint_returns_none(self):
        ckpt_dir = Path(self.tmpdir) / "checkpoints"
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        ckpt_path = ckpt_dir / "unverified_adapters.safetensors"
        ckpt_path.write_bytes(b"unverified")
        # No manifest = not verified

        info = self.engine.resume_from_checkpoint(ckpt_path)
        self.assertIsNone(info)

    def test_cleanup_old_checkpoints(self):
        ckpt_dir = Path(self.tmpdir) / "checkpoints"
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        # Create 7 checkpoints with different timestamps
        for i in range(7):
            ckpt = ckpt_dir / f"step_{i*100}_adapters.safetensors"
            ckpt.write_bytes(b"checkpoint")
            manifest = ckpt_dir / f"step_{i*100}_manifest.json"
            manifest.write_text(json.dumps({
                "completed_steps": i * 100,
                "timestamp": f"2026-11-14T20:{i:02d}:00Z",
                "verified": True,
            }))

        removed = self.engine.cleanup_old_checkpoints(keep=3)
        # Should have removed 4 checkpoints (7 - 3)
        self.assertEqual(len(removed), 4)
        remaining = list(ckpt_dir.glob("*_adapters.safetensors"))
        self.assertEqual(len(remaining), 3)

    def test_max_checkpoints_default(self):
        self.assertEqual(self.engine._max_checkpoints, 5)

    def test_checkpoint_info_dataclass(self):
        info = CheckpointInfo(
            path="/tmp/test.safetensors",
            step=100,
            sha256="a" * 64,
            created_at="2026-11-14T20:00:00Z",
            verified=True,
        )
        self.assertEqual(info.step, 100)
        self.assertTrue(info.verified)
        self.assertEqual(len(info.sha256), 64)


if __name__ == "__main__":
    unittest.main()
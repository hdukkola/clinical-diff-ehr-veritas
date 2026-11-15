"""Test one-use launch behavior with a local dummy worker."""

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from mlx_runner.memory import GIB
from mlx_runner.run_foreground import launch, verified_plan


class ForegroundTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.path = self.root / "run.json"

    def test_mismatched_approval_is_rejected_before_loading_local_inputs(self):
        self.path.write_bytes(b"{}")
        with patch("mlx_runner.run_foreground.build_plan") as prepare:
            with self.assertRaisesRegex(ValueError, "Approval does not match"):
                verified_plan(self.path, "0" * 64)
        prepare.assert_not_called()
        self.assertFalse(self.path.with_suffix("").exists())

    def test_exact_digest_does_not_authorize_an_altered_configuration(self):
        raw = json.dumps({"effective_settings": {"model": "base", "data": "train"},
                          "evaluation": {"bundle": "bundle"}}).encode()
        self.path.write_bytes(raw)
        with patch("mlx_runner.run_foreground.build_plan", return_value={"verified": True}):
            with self.assertRaisesRegex(ValueError, "differs from the pinned"):
                verified_plan(self.path, hashlib.sha256(raw).hexdigest())

    @unittest.skipUnless(sys.platform == "darwin", "Requires native process footprint")
    def test_staged_worker_runs_once_and_receives_training_splits_only(self):
        data = self.root / "source"
        data.mkdir()
        facts = {}
        for split in ("train", "valid"):
            raw = split.encode()
            (data / (split + ".jsonl")).write_bytes(raw)
            facts[split] = {"sha256": hashlib.sha256(raw).hexdigest()}
        plan = {
            "data": {"splits": facts},
            "effective_settings": {"data": str(data)},
            "resource_limits": {"wall_seconds": 3, "child_footprint_bytes": GIB},
        }
        worker = """
import os
from pathlib import Path
assert os.environ["HF_HUB_OFFLINE"] == "1"
assert sorted(x.name for x in Path("inputs").iterdir()) == ["train.jsonl", "valid.jsonl"]
assert Path("inputs/train.jsonl").read_bytes() == b"train"
print("dummy finished")
"""
        with (patch("mlx_runner.run_foreground.Path.home", return_value=self.root),
              patch("mlx_runner.run_foreground.host_issue", return_value=None),
              patch("mlx_runner.run_foreground.check_other_trainers"),
              patch("mlx_runner.run_foreground.WORKER", worker),
              patch("mlx_runner.run_foreground.verify_outputs", return_value={"dummy": "verified"})):
            result = launch(plan, b"{}", self.path)
            self.assertEqual(result["status"], "completed")
            self.assertIn("dummy finished", (self.root / "run/train.log").read_text())
            with self.assertRaises(FileExistsError):
                launch(plan, b"{}", self.path)

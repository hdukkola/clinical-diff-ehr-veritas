"""
Tests for the dashboard (Phase 7) and configuration.
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlx_runner.config import PipelineConfig, RunMode, DEFAULT_CONFIG
from mlx_runner.dashboard import Dashboard


class TestConfig(unittest.TestCase):
    def test_default_config(self):
        self.assertEqual(DEFAULT_CONFIG.mode, RunMode.DRY_RUN)
        self.assertTrue(DEFAULT_CONFIG.require_operator_approval)
        self.assertFalse(DEFAULT_CONFIG.auto_promote)

    def test_config_validation(self):
        config = PipelineConfig(mode=RunMode.DRY_RUN)
        errors = config.validate()
        self.assertEqual(errors, [])

    def test_config_validation_auto_promote_forbidden(self):
        config = PipelineConfig(mode=RunMode.DRY_RUN, auto_promote=True)
        errors = config.validate()
        self.assertIn("auto_promote", errors[0])

    def test_config_validation_35b_training_blocked(self):
        config = PipelineConfig(mode=RunMode.TRAIN_ONCE)
        errors = config.validate()
        self.assertIn("35B training is disabled", errors[0])


class TestDashboard(unittest.TestCase):
    def test_cli_dashboard(self):
        dash = Dashboard(work_dir=".")
        output = dash.generate_cli()
        self.assertIn("CLINICAL DIFF EHR", output)
        self.assertIn("SYSTEM RESOURCES", output)
        self.assertIn("SAFETY NOTES", output)

    def test_html_dashboard(self):
        dash = Dashboard(work_dir=".")
        path = dash.generate_html(output_path="/tmp/test_dashboard.html")
        import os
        self.assertTrue(os.path.exists(path))
        content = Path(path).read_text()
        self.assertIn("Clinical Diff EHR", content)
        self.assertIn("Dataset Provenance Status", content)


if __name__ == "__main__":
    unittest.main()
"""
Lightweight local dashboard and monitoring (Phase 7).

Prefer a simple local HTML or CLI dashboard over a complex new application.
Shows:
- Current experiment and status
- Recent resource utilization
- Training steps and checkpoint locations
- Dataset provenance status
- Evaluation pass/fail results
- Comparison with previous adapters
- Reasons experiments were rejected
- Disk consumption and cleanup candidates
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .registry import build_default_registry
from .scheduler import ExperimentScheduler


class Dashboard:
    """Generates a local HTML dashboard and CLI summary."""

    def __init__(self, work_dir: Path | str = "."):
        self.work_dir = Path(work_dir)
        self.runs_dir = self.work_dir / "runs"
        self.logs_dir = self.work_dir / "logs"
        self.checkpoint_dir = self.work_dir / "checkpoints"
        self.scheduler = ExperimentScheduler(
            __import__("mlx_runner.config", fromlist=["PipelineConfig"]).PipelineConfig(),
            self.work_dir,
        )

    def _disk_usage(self) -> dict[str, float]:
        st = shutil.disk_usage(self.work_dir)
        return {
            "total_gb": round(st.total / (1024**3), 2),
            "used_gb": round(st.used / (1024**3), 2),
            "free_gb": round(st.free / (1024**3), 2),
        }

    def _checkpoints(self) -> list[dict[str, str]]:
        ckpts = []
        if self.checkpoint_dir.exists():
            for p in sorted(self.checkpoint_dir.iterdir()):
                if p.is_file() and p.suffix == ".safetensors":
                    ckpts.append(
                        {
                            "name": p.name,
                            "size_mb": round(p.stat().st_size / (1024**2), 2),
                            "path": str(p),
                        }
                    )
        return ckpts

    def _recent_experiments(self) -> list[dict[str, Any]]:
        return self.scheduler.state.experiments[-10:]

    def _dataset_status(self) -> list[dict[str, Any]]:
        registry = build_default_registry()
        return [
            {
                "name": e.name,
                "license_status": e.license_status.value,
                "dataset_class": e.dataset_class.value,
                "review_required": e.review_required,
                "restricted": e.restricted_data,
                "ingestible": e.is_ingestible(),
            }
            for e in registry.list_all()
        ]

    def generate_html(self, output_path: Path | str = None) -> str:
        """Generate an HTML dashboard file."""
        output_path = Path(output_path) if output_path else self.work_dir / "dashboard.html"

        disk = self._disk_usage()
        ckpts = self._checkpoints()
        experiments = self._recent_experiments()
        datasets = self._dataset_status()

        # Latest evaluation
        latest_eval = None
        for exp in reversed(experiments):
            if exp.evaluation:
                latest_eval = exp.evaluation
                break

        rows = ""
        for exp in experiments:
            status_color = {
                "completed": "#2ecc71",
                "blocked": "#e74c3c",
                "failed": "#e67e22",
                "running": "#f1c40f",
            }.get(exp.status, "#95a5a6")
            rows += f"""
            <tr>
                <td>{exp.id}</td>
                <td>{exp.mode}</td>
                <td style="color:{status_color}">{exp.status}</td>
                <td>{exp.started_at}</td>
                <td>{exp.finished_at or '-'}</td>
                <td>{exp.rejection_reason or '-'}</td>
            </tr>
            """

        ds_rows = ""
        for d in datasets:
            ok_color = "#2ecc71" if d["ingestible"] else "#e74c3c"
            ds_rows += f"""
            <tr>
                <td>{d['name']}</td>
                <td>{d['license_status']}</td>
                <td>{d['dataset_class']}</td>
                <td>{'Yes' if d['review_required'] else 'No'}</td>
                <td>{'Yes' if d['restricted'] else 'No'}</td>
                <td style="color:{ok_color}">{'Yes' if d['ingestible'] else 'No'}</td>
            </tr>
            """

        ckpt_rows = ""
        for c in ckpts:
            ckpt_rows += f"""
            <tr>
                <td>{c['name']}</td>
                <td>{c['size_mb']} MB</td>
                <td>{c['path']}</td>
            </tr>
            """

        eval_html = ""
        if latest_eval:
            eval_html = f"""
            <h3>Latest Evaluation Results</h3>
            <table border="1" cellpadding="5">
                <tr><td>Total events</td><td>{latest_eval.get('total_events', '-')}</td></tr>
                <tr><td>Pair matches</td><td>{latest_eval.get('pair_matches', '-')}</td></tr>
                <tr><td>Dose exact</td><td>{latest_eval.get('dose_exact', '-')}</td></tr>
                <tr><td>Time exact</td><td>{latest_eval.get('time_exact', '-')}</td></tr>
                <tr><td>Evidence literal</td><td>{latest_eval.get('evidence_literal', '-')}</td></tr>
                <tr><td>Null type errors</td><td>{latest_eval.get('null_type_errors', '-')}</td></tr>
                <tr><td>Strict JSON valid cases</td><td>{latest_eval.get('strict_json_valid_cases', '-')}</td></tr>
            </table>
            """

        html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Clinical Diff EHR — ML Experiment Runner Dashboard</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }}
h1 {{ font-size: 1.5rem; margin-bottom: 10px; }}
h2 {{ font-size: 1.2rem; margin-top: 20px; }}
table {{ border-collapse: collapse; width: 100%; margin-bottom: 20px; }}
th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
th {{ background: #f4f4f4; }}
.card {{ border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 20px; }}
.mono {{ font-family: Menlo, Monaco, monospace; font-size: 0.85rem; }}
.warn {{ color: #e74c3c; }}
.ok {{ color: #2ecc71; }}
</style>
</head>
<body>
<h1>Clinical Diff EHR — ML Experiment Runner</h1>
<p class="mono">Branch: feat/safe-ml-experiment-runner | Generated: {datetime.now(timezone.utc).isoformat()}</p>

<div class="card">
<h2>System Resources</h2>
<table>
<tr><th>Disk total</th><td>{disk['total_gb']} GB</td></tr>
<tr><th>Disk used</th><td>{disk['used_gb']} GB</td></tr>
<tr><th>Disk free</th><td>{disk['free_gb']} GB</td></tr>
</table>
</div>

<div class="card">
<h2>Dataset Provenance Status</h2>
<table>
<tr><th>Dataset</th><th>License status</th><th>Class</th><th>Review required</th><th>Restricted</th><th>Ingestible</th></tr>
{ds_rows}
</table>
</div>

<div class="card">
<h2>{eval_html if latest_eval else '<p>No evaluation results yet.</p>'}</h2>
</div>

<div class="card">
<h2>Recent Experiments</h2>
<table>
<tr><th>ID</th><th>Mode</th><th>Status</th><th>Started</th><th>Finished</th><th>Rejection reason</th></tr>
{rows}
</table>
</div>

<div class="card">
<h2>Checkpoints</h2>
<table>
<tr><th>Name</th><th>Size</th><th>Path</th></tr>
{ckpt_rows if ckpt_rows else '<tr><td colspan="3">No checkpoints</td></tr>'}
</table>
</div>

<div class="card">
<h2>Safety Notes</h2>
<ul>
<li>No unattended training — operator approval required for all training jobs</li>
<li>No automatic model promotion — human approval required</li>
<li>No model weights, adapters, or credentials committed to Git</li>
<li>No large model downloads during this assignment</li>
<li>No real patient data — synthetic data only</li>
<li>Not clinically validated — synthetic testing only</li>
</ul>
</div>
</body>
</html>
"""

        output_path.write_text(html)
        return str(output_path)

    def generate_cli(self) -> str:
        """Generate a CLI text summary."""
        disk = self._disk_usage()
        experiments = self._recent_experiments()
        datasets = self._dataset_status()
        ckpts = self._checkpoints()

        lines = [
            "=" * 60,
            "CLINICAL DIFF EHR — ML EXPERIMENT RUNNER DASHBOARD",
            "=" * 60,
            "",
            "SYSTEM RESOURCES",
            "-" * 40,
            f"Disk total:  {disk['total_gb']} GB",
            f"Disk used:   {disk['used_gb']} GB",
            f"Disk free:   {disk['free_gb']} GB",
            "",
            "DATASET PROVENANCE",
            "-" * 40,
        ]
        for d in datasets:
            lines.append(
                f"  {d['name']:25s} license={d['license_status']:18s} "
                f"class={d['dataset_class']:12s} review={d['review_required']} "
                f"restricted={d['restricted']} ingestible={d['ingestible']}"
            )

        lines.append("")
        lines.append("RECENT EXPERIMENTS")
        lines.append("-" * 40)
        for exp in experiments:
            lines.append(
                f"  {exp.id:30s} mode={exp.mode:14s} status={exp.status:10s} "
                f"rejection={exp.rejection_reason or '-'}"
            )

        lines.append("")
        lines.append("CHECKPOINTS")
        lines.append("-" * 40)
        for c in ckpts:
            lines.append(f"  {c['name']:40s} {c['size_mb']:8.2f} MB  {c['path']}")

        lines.append("")
        lines.append("SAFETY NOTES")
        lines.append("-" * 40)
        lines.append("  No unattended training — operator approval required")
        lines.append("  No automatic model promotion — human approval required")
        lines.append("  No weights/adapters/credentials committed to Git")
        lines.append("  Not clinically validated — synthetic testing only")
        lines.append("")
        lines.append("=" * 60)

        return "\n".join(lines)
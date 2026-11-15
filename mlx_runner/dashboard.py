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
import webbrowser
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
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

    # ------------------------------------------------------------------
    # Challenge-comparison evaluation data (real artifacts)
    # ------------------------------------------------------------------
    def _challenge_comparison(self) -> dict[str, Any] | None:
        """Load challenge-comparison.json from published-medication-events if present."""
        p = (
            self.work_dir
            / "model-development"
            / "datasets"
            / "published-medication-events"
            / "challenge-comparison.json"
        )
        # Also check ~/.codex path
        alt = Path.home() / ".codex" / ".chatgpt-projects" / "g-p-6ae2a77388348191821395e8101c3408" / "model-development" / "datasets" / "published-medication-events" / "challenge-comparison.json"
        for candidate in (p, alt):
            if candidate.exists():
                try:
                    return json.loads(candidate.read_text())
                except (json.JSONDecodeError, OSError):
                    pass
        return None

    def _development_results(self) -> dict[str, Any] | None:
        """Load development-results.json if present."""
        p = (
            self.work_dir
            / "model-development"
            / "datasets"
            / "published-medication-events"
            / "development-results.json"
        )
        alt = Path.home() / ".codex" / ".chatgpt-projects" / "g-p-6ae2a77388348191821395e8101c3408" / "model-development" / "datasets" / "published-medication-events" / "development-results.json"
        for candidate in (p, alt):
            if candidate.exists():
                try:
                    return json.loads(candidate.read_text())
                except (json.JSONDecodeError, OSError):
                    pass
        return None

    # ------------------------------------------------------------------
    # HTML generation
    # ------------------------------------------------------------------
    def generate_html(self, output_path: Path | str = None) -> str:
        """Generate an HTML dashboard file."""
        output_path = Path(output_path) if output_path else self.work_dir / "dashboard.html"

        disk = self._disk_usage()
        ckpts = self._checkpoints()
        experiments = self._recent_experiments()
        datasets = self._dataset_status()
        challenge = self._challenge_comparison()
        dev_results = self._development_results()

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
                <td class="mono">{c['path']}</td>
            </tr>
            """

        # Build evaluation comparison table from challenge-comparison.json
        eval_rows = ""
        if challenge:
            for model_name, data in challenge.items():
                counts = data.get("counts", {})
                matched = counts.get("matched_events", 0)
                missed = counts.get("missed_events", 0)
                extra = counts.get("extra_events", 0)
                expected = counts.get("expected_events", 0)
                pair_f1 = (
                    round(2 * matched / (2 * matched + missed + extra), 3)
                    if (2 * matched + missed + extra) > 0
                    else 0.0
                )
                dose_rate = (
                    round(counts.get("exact_dose_fields", 0) / expected, 3)
                    if expected > 0
                    else 0.0
                )
                time_rate = (
                    round(counts.get("exact_time_fields", 0) / expected, 3)
                    if expected > 0
                    else 0.0
                )
                evidence_rate = (
                    round(counts.get("literal_evidence_fields", 0) / expected, 3)
                    if expected > 0
                    else 0.0
                )
                schema_rate = (
                    round(counts.get("schema_compliant_cases", 0) / counts.get("cases", 1), 3)
                    if counts.get("cases") else 0.0
                )
                peak_mem = data.get("peak_mlx_memory_gb", 0)
                eval_rows += f"""
                <tr>
                    <td>{model_name}</td>
                    <td class="mono">{data.get('revision', '-')[:12]}...</td>
                    <td>{counts.get('cases', '-')}</td>
                    <td>{matched}</td>
                    <td>{missed}</td>
                    <td>{extra}</td>
                    <td style="font-weight:bold">{pair_f1:.3f}</td>
                    <td>{dose_rate:.3f}</td>
                    <td>{time_rate:.3f}</td>
                    <td>{evidence_rate:.3f}</td>
                    <td>{schema_rate:.3f}</td>
                    <td>{peak_mem:.2f} GB</td>
                </tr>
                """

        # Build per-case breakdown from development-results.json
        dev_case_rows = ""
        if dev_results:
            for variant_name in ("base", "adapter"):
                variant_data = dev_results.get(variant_name, [])
                total_matched = 0
                total_missed = 0
                total_extra = 0
                total_expected = 0
                for row in variant_data:
                    total_matched += row.get("matched", 0)
                    total_missed += row.get("missed", 0)
                    total_extra += row.get("extra", 0)
                    total_expected += total_matched + total_missed
                pair_f1 = (
                    round(2 * total_matched / (2 * total_matched + total_missed + total_extra), 3)
                    if (2 * total_matched + total_missed + total_extra) > 0
                    else 0.0
                )
                dev_case_rows += f"""
                <tr>
                    <td>{variant_name.capitalize()}</td>
                    <td>{len(variant_data)}</td>
                    <td>{total_expected}</td>
                    <td>{total_matched}</td>
                    <td>{total_missed}</td>
                    <td>{total_extra}</td>
                    <td style="font-weight:bold">{pair_f1:.3f}</td>
                    <td class="mono">{dev_results.get('model_revision', '-')[:12]}...</td>
                </tr>
                """

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Clinical Diff EHR — ML Experiment Runner Dashboard</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Fira+Code:wght@400;500&display=swap');

:root {{
  --bg: #0f172a;
  --card: #1e293b;
  --text: #f8fafc;
  --muted: #94a3b8;
  --accent: #38bdf8;
  --danger: #f87171;
  --ok: #4ade80;
  --warn: #fbbf24;
}}

* {{ box-sizing: border-box; }}

body {{
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--text);
  margin: 0;
  padding: 24px;
  line-height: 1.6;
}}

h1, h2, h3 {{ font-family: 'Inter', sans-serif; color: var(--text); }}
h1 {{ font-size: 1.75rem; margin-bottom: 8px; }}
h2 {{ font-size: 1.25rem; margin-top: 24px; margin-bottom: 12px; }}
h3 {{ font-size: 1.1rem; margin-top: 18px; margin-bottom: 8px; }}

.mono {{ font-family: 'Fira Code', 'Menlo', 'Monaco', monospace; font-size: 0.85rem; }}
.small {{ font-size: 0.85rem; color: var(--muted); }}

.banner {{
  background: var(--danger);
  color: #fff;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}}
.banner .badge {{
  background: rgba(255,255,255,0.2);
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.9rem;
}}

.card {{
  background: var(--card);
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}}

table {{
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 16px;
  font-size: 0.9rem;
}}
th, td {{
  border: 1px solid #334155;
  padding: 8px 10px;
  text-align: left;
}}
th {{ background: #0f172a; color: var(--text); }}

.label-badge {{
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}}
.status-stopped {{ background: #f87171; color: #fff; }}
.status-running {{ background: #4ade80; color: #000; }}
.status-paused {{ background: #fbbf24; color: #000; }}

.sim-box {{
  border: 2px dashed #fbbf24;
  border-radius: 8px;
  padding: 16px;
  background: rgba(251, 191, 36, 0.05);
}}
.sim-box .sim-label {{
  color: #fbbf24;
  font-weight: 700;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;
}}

.lifecycle {{
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}}
.lifecycle .step {{
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}}
.lifecycle .step .circle {{
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #334155;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 6px;
}}
.lifecycle .step.active .circle {{
  background: var(--accent);
  color: #000;
}}
.lifecycle .step .label {{
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
}}
.lifecycle .arrow {{
  color: var(--muted);
  font-size: 0.8rem;
}}

.sim-anim {{
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #0f172a;
  border-radius: 6px;
}}
.sim-anim .dot {{
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #334155;
}}
.sim-anim .dot.active {{
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent);
}}
.sim-anim .label {{
  font-size: 0.8rem;
  color: var(--muted);
  min-width: 100px;
}}

button {{
  background: var(--accent);
  color: #000;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}}
button:hover {{ background: #7dd3fc; }}
button:disabled {{ background: #64748b; color: #94a3b8; cursor: not-allowed; }}
</style>
</head>
<body>
<h1>Clinical Diff EHR — ML Model Lab Dashboard</h1>
<p class="mono">Branch: feat/fix-35b-training-runner | Generated: {datetime.now(timezone.utc).isoformat()}</p>

<div class="banner">
  <div class="badge status-stopped">TRAINING STOPPED</div>
  <span style="font-size:1.1rem"><strong>NOT CLINICALLY VALIDATED</strong> — Synthetic testing only. Not for clinical use.</span>
</div>

<div class="card">
<h2>Model Checkpoint</h2>
<table>
<tr><th>Adapter</th><td class="mono">medication-v1-step360</td></tr>
<tr><th>Base model</th><td class="mono">mlx-community/Qwen3.6-35B-A3B-4bit</td></tr>
<tr><th>Revision</th><td class="mono">38740b847e4cb78f352aba30aa41c76e08e6eb46</td></tr>
<tr><th>Quantization</th><td>4-bit (MLX community conversion)</td></tr>
<tr><th>Training steps</th><td>360</td></tr>
<tr><th>Adapter SHA-256</th><td class="mono">9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76</td></tr>
<tr><th>Peak memory</th><td>24.96 GB</td></tr>
<tr><th>Training status</th><td><span class="label-badge status-stopped">STOPPED</span></td></tr>
</table>
</div>

<div class="card">
<h2>Model Comparison (challenge-comparison.json)</h2>
<table>
<tr>
<th>Model</th><th>Revision</th><th>Cases</th><th>Matched</th><th>Missed</th><th>Extra</th>
<th>Pair F1</th><th>Dose</th><th>Time</th><th>Evidence</th><th>Schema</th><th>Peak Mem</th>
</tr>
{eval_rows}
</table>
</div>

<div class="card">
<h2>Development Results (fresh-eval)</h2>
<table>
<tr><th>Variant</th><th>Cases</th><th>Expected Events</th><th>Matched</th><th>Missed</th><th>Extra</th><th>Pair F1</th><th>Revision</th></tr>
{dev_case_rows}
</table>
</div>

<div class="card">
<h2>Training Lifecycle</h2>
<p class="small">Data → Training → Checkpoint → Evaluation → Human Approval → Commit</p>
<div class="lifecycle">
  <div class="step active">
    <div class="circle">1</div>
    <div class="label">Data</div>
  </div>
  <div class="arrow">▸</div>
  <div class="step active">
    <div class="circle">2</div>
    <div class="label">Training</div>
  </div>
  <div class="arrow">▸</div>
  <div class="step">
    <div class="circle">3</div>
    <div class="label">Checkpoint</div>
  </div>
  <div class="arrow">▸</div>
  <div class="step">
    <div class="circle">4</div>
    <div class="label">Evaluation</div>
  </div>
  <div class="arrow">▸</div>
  <div class="step">
    <div class="circle">5</div>
    <div class="label">Human Approval</div>
  </div>
  <div class="arrow">▸</div>
  <div class="step">
    <div class="circle">6</div>
    <div class="label">Commit</div>
  </div>
</div>
<p class="small">Current status: Training is <strong>stopped</strong>. No checkpoint promotion without human approval.</p>
</div>

<div class="card sim-box">
<h2 style="margin-top:0">⚡ SIMULATION — Training Cycle Demo</h2>
<p class="small sim-label">SIMULATION — NOT REAL TRAINING. No model weights are loaded. No inference is performed.</p>
<div class="sim-anim" id="sim-anim">
  <div class="label">Data ingestion</div>
  <div class="dot" id="dot1" class="active"></div>
  <div class="label">Training</div>
  <div class="dot" id="dot2"></div>
  <div class="label">Checkpoint</div>
  <div class="dot" id="dot3"></div>
  <div class="label">Evaluation</div>
  <div class="dot" id="dot4"></div>
  <div class="label">Approval</div>
  <div class="dot" id="dot5"></div>
</div>
<div style="margin-top:12px">
  <button id="sim-btn" onclick="toggleSim()">Start Simulation</button>
  <span id="sim-status" class="small" style="margin-left:12px">Ready</span>
</div>
</div>

<div class="card">
<h2>Dataset Provenance Status</h2>
<table>
<tr><th>Dataset</th><th>License status</th><th>Class</th><th>Review required</th><th>Restricted</th><th>Ingestible</th></tr>
{ds_rows}
</table>
</div>

<div class="card">
<h2>Recent Experiments</h2>
<table>
<tr><th>ID</th><th>Mode</th><th>Status</th><th>Started</th><th>Finished</th><th>Rejection reason</th></tr>
{rows}
</table>
</div>

<div class="card">
<h2>Safety Notes</h2>
<ul>
<li><strong>No unattended training</strong> — operator approval required for all training jobs</li>
<li><strong>No automatic model promotion</strong> — human approval required</li>
<li><strong>No model weights, adapters, or credentials committed to Git</strong></li>
<li><strong>No large model downloads during this assignment</strong></li>
<li><strong>No real patient data</strong> — synthetic data only</li>
<li><strong>Not clinically validated</strong> — synthetic testing only</li>
</ul>
</div>

<script>
let simActive = false;
let simInterval = null;
const dots = ['dot1', 'dot2', 'dot3', 'dot4', 'dot5'];
const labels = ['Data ingestion', 'Training', 'Checkpoint', 'Evaluation', 'Approval'];

function toggleSim() {{
  if (simActive) {{
    simActive = false;
    clearInterval(simInterval);
    document.getElementById('sim-btn').textContent = 'Start Simulation';
    document.getElementById('sim-status').textContent = 'Stopped';
    dots.forEach(d => document.getElementById(d).classList.remove('active'));
  }} else {{
    simActive = true;
    document.getElementById('sim-btn').textContent = 'Stop Simulation';
    document.getElementById('sim-status').textContent = 'Simulating...';
    let idx = 0;
    function step() {{
      dots.forEach((d, i) => {{
        document.getElementById(d).classList.toggle('active', i === idx);
      }});
      document.getElementById('sim-status').textContent = labels[idx];
      idx = (idx + 1) % dots.length;
    }}
    step();
    simInterval = setInterval(step, 1200);
  }}
}}
</script>
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

    def serve(self, port: int = 8765, open_browser: bool = True) -> None:
        """Serve the dashboard locally on 127.0.0.1."""
        # Generate the HTML first
        html_path = self.work_dir / "dashboard.html"
        self.generate_html(output_path=html_path)

        # Change to the work_dir so the server serves from there
        import os

        orig_cwd = Path.cwd()
        os.chdir(self.work_dir)

        handler = SimpleHTTPRequestHandler
        server = HTTPServer(("127.0.0.1", port), handler)

        print(f"Dashboard server starting at http://127.0.0.1:{port}/dashboard.html")
        print(f"Serving from: {self.work_dir}")
        print("Press Ctrl+C to stop")

        if open_browser:
            webbrowser.open(f"http://127.0.0.1:{port}/dashboard.html")

        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down dashboard server...")
        finally:
            os.chdir(orig_cwd)
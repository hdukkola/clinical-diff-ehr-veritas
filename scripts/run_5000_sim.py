"""Deterministic 5,000-case simulation sweep runner across JS/TS and Python."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SIM_DIR = REPO_ROOT / 'scripts' / 'sim'
if str(SIM_DIR) not in sys.path:
    sys.path.insert(0, str(SIM_DIR))

from backend_sim import run_backend_simulations  # noqa: E402


def run_vitest_simulations() -> dict[str, object]:
    node_exe = shutil.which('node')
    if not node_exe:
        raise RuntimeError('node executable not found on PATH.')
    vitest_entry = REPO_ROOT / 'node_modules' / 'vitest' / 'vitest.mjs'
    config_path = REPO_ROOT / 'scripts' / 'sim' / 'vitest.sim.config.mts'

    with tempfile.TemporaryDirectory() as tmpdir:
        report_file = Path(tmpdir) / 'vitest-sim-report.json'
        cmd = [
            node_exe,
            str(vitest_entry),
            'run',
            '--config',
            str(config_path),
            '--reporter=json',
            '--outputFile',
            str(report_file),
        ]
        proc = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            check=False,
        )
        if not report_file.exists():
            raise RuntimeError(
                f'Vitest did not produce JSON report (exit={proc.returncode}):\n'
                f'STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}'
            )
        report = json.loads(report_file.read_text(encoding='utf-8'))

    by_file: dict[str, dict[str, int]] = {}
    for suite in report.get('testResults', []):
        name = Path(suite.get('name', '')).name
        assertions = suite.get('assertionResults', [])
        passed = sum(1 for a in assertions if a.get('status') == 'passed')
        failed = sum(1 for a in assertions if a.get('status') != 'passed')
        by_file[name] = {
            'total': len(assertions),
            'passed': passed,
            'failed': failed,
        }

    return {
        'exit_code': proc.returncode,
        'numTotalTests': report.get('numTotalTests', 0),
        'numPassedTests': report.get('numPassedTests', 0),
        'numFailedTests': report.get('numFailedTests', 0),
        'by_file': by_file,
    }


def main() -> int:
    vitest_res = run_vitest_simulations()
    backend_res = run_backend_simulations()

    by_file = vitest_res['by_file']
    core_diff = by_file.get('core_diff.sim.test.ts', {'total': 0, 'passed': 0, 'failed': 0})
    editorial_js = by_file.get('editorial_js.sim.test.ts', {'total': 0, 'passed': 0, 'failed': 0})
    ui_workflow = by_file.get('ui_workflow.sim.test.tsx', {'total': 0, 'passed': 0, 'failed': 0})

    backend_editorial_total = int(backend_res['total']) + int(editorial_js['total'])
    backend_editorial_passed = int(backend_res['passed']) + int(editorial_js['passed'])
    backend_editorial_failed = int(backend_res['failed']) + int(editorial_js['failed'])

    grand_total = int(core_diff['total']) + backend_editorial_total + int(ui_workflow['total'])
    grand_passed = int(core_diff['passed']) + backend_editorial_passed + int(ui_workflow['passed'])
    grand_failed = int(core_diff['failed']) + backend_editorial_failed + int(ui_workflow['failed'])

    summary = {
        'grand_total': grand_total,
        'grand_passed': grand_passed,
        'grand_failed': grand_failed,
        'areas': {
            'core_diff_evidence_provenance': core_diff,
            'backend_and_editorial': {
                'total': backend_editorial_total,
                'passed': backend_editorial_passed,
                'failed': backend_editorial_failed,
                'python_backend': {
                    'total': backend_res['total'],
                    'passed': backend_res['passed'],
                    'failed': backend_res['failed'],
                    'breakdown': backend_res['breakdown'],
                },
                'editorial_js': editorial_js,
            },
            'ui_and_workflow': ui_workflow,
        },
        'python_failures': backend_res['failures'],
    }
    print(json.dumps(summary, indent=2))

    ok = (
        vitest_res['exit_code'] == 0
        and grand_total == 5000
        and grand_passed == 5000
        and grand_failed == 0
        and core_diff['total'] == 2500
        and backend_editorial_total == 1500
        and ui_workflow['total'] == 1000
    )
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())

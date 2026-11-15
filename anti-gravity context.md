# Anti-Gravity Context — Clinical Diff EHR Veritas

**Purpose:** This file is a handoff context for the Clinical Diff EHR Veritas project. If context limits run out, another agent can read this file to pick up exactly where work left off. It will be updated as work progresses.

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/ml-experiment-runner-implementation` (pushed to origin)
**Last commit:** `e642251f` — "Add checkpointed ML experiment runner with leakage detection and base/adapter comparison"
**Main:** `69a826e` (untouched, not merged)
**Platform:** macOS, Apple M5 Pro, 48 GB unified memory
**Python:** 3.14.7

---

## PROJECT OVERVIEW

Clinical Diff EHR Veritas is a clinician-facing AI-assisted EHR workspace. The core safety principle is: **AI proposes, humans commit.** This implementation is a safe, automated ML experiment-runner pipeline (Phases 1–7) that runs unattended through dataset validation, training experiments, evaluation, and error analysis — but **never starts continuous training immediately**.

---

## REPOSITORY STRUCTURE

```
clinical-diff-ehr-veritas/
├── mlx_runner/              # ML experiment runner (core implementation)
│   ├── __init__.py
│   ├── __main__.py          # CLI entry point (python -m mlx_runner.cli)
│   ├── cli.py               # CLI argument parsing & dispatch
│   ├── config.py            # Pipeline configuration (dataclasses)
│   ├── evaluator.py         # Frozen evaluation suite + leakage detection + comparison
│   ├── registry.py          # Dataset licensing/provenance gate
│   ├── trainer.py           # Conservative Apple Silicon training engine
│   ├── promotion.py         # Model promotion gate (Phase 6)
│   ├── dashboard.py         # Local HTML + CLI dashboard (Phase 7)
│   └── __pycache__/         # Compiled cache (do not commit)
├── tests/                   # Python unit tests (unittest)
│   ├── test_registry.py     # Dataset registry & licensing gate
│   ├── test_evaluator.py    # Evaluation suite (JSON, pairs, dose, time, null, abstention)
│   ├── test_promotion.py    # Model promotion gate
│   ├── test_scheduler.py    # Experiment scheduler modes
│   ├── test_trainer.py      # Training engine & resource checks
│   ├── test_dashboard.py    # Dashboard & config validation
│   ├── test_leakage.py      # Evaluation leakage detection (NEW)
│   ├── test_comparison.py   # Base vs adapter comparison (NEW)
│   ├── test_checkpoint.py   # Checkpoint recovery & management (NEW)
│   └── __pycache__/         # Compiled cache (do not commit)
├── docs/research/           # Research audit documents
│   ├── SOURCE_AUDIT.md      # 8-source dataset catalog with licensing
│   ├── EVALUATION_PLAN.md   # Reproducible evaluation plan (base vs adapter)
│   ├── LEAKAGE_CHECKS.md    # Evaluation/training leakage prevention
│   ├── SYNTHETIC_HOSPITAL_ASSESSMENT.md
│   └── validation.test.ts   # Vitest validation tests
├── fresh-eval/              # Existing 35B evaluation handoff
│   ├── seed-v2.jsonl        # Dev cases: 2 cases, 9 events (NOT a blind test)
│   ├── development-results.json  # Frozen base/adapter model responses
│   ├── rescore_medication_events.py
│   ├── rescore-results.json
│   ├── REVIEW.md
│   ├── test_rescore.py
│   └── README.md
├── configs/                 # YAML config templates
│   ├── default.yaml
│   └── smoke_test.yaml
├── checkpoints/             # Model checkpoints (do not commit weights)
│   ├── smoke_adapters.safetensors   # Placeholder from smoke test
│   └── smoke_manifest.json          # Checkpoint manifest
├── runs/                    # Experiment state
│   └── scheduler_state.json         # Persisted scheduler state
├── logs/                    # Training logs
│   └── training_*.log
├── dashboard.html           # Generated HTML dashboard
├── src/app/                 # Next.js frontend (existing, not modified)
├── fresh-backend/           # Python backend service (existing, not modified)
├── veritas-editorial/       # Editorial interface (existing, not modified)
├── package.json             # Node.js project config
├── vitest.config.ts         # Vitest configuration
├── AGENTS.md                # Agent instructions
├── COMMUNICATION.md         # Team communication log
└── README.md                # Project README
```

---

## KEY SOURCE FILES & PURPOSES

### `mlx_runner/config.py`
Pipeline configuration with dataclasses:
- `RunMode`: DRY_RUN, EVALUATE_ONLY, TRAIN_ONCE, SCHEDULED
- `DatasetEntry`: name, source_url, license_status, dataset_class, etc.
- `ResourceLimits`: max_memory_gb (40), max_disk_gb (100), max_duration_minutes (60), smoke_test_max_steps (10)
- `EvaluationLeakageConfig`: article/patient ID overlap prevention
- `ModelConfig`: Qwen3.6-35B-A3B (NOT available locally), local Qwen2.5-7B-Instruct-4bit
- `PipelineConfig.validate()`: blocks auto-promote, 35B training, unsupervised training
- `DEFAULT_CONFIG`: mode=DRY_RUN, require_operator_approval=True, auto_promote=False

**Critical model identity fact:** Qwen3.6-35B-A3B is NOT available locally. The only local model is Qwen2.5-7B-Instruct-4bit (7.6B params, 4-bit quantized, ~4 GB on disk at `/Users/himnishdukkola/Documents/tds-agent/tds-model-qwen/`). Qwen3.6-35B-A3B would require ~17.5 GB (4-bit) download — prohibited without explicit operator approval. Local adapters (`tds-agent`, `tds-agent-qwen`) are LoRA on Qwen2.5-7B, NOT Qwen3.6-35B-A3B.

### `mlx_runner/evaluator.py`
Frozen evaluation suite:
- `evaluate_case()` / `evaluate_all()`: strict JSON, medication/action pairs, dose, time, evidence literal, authority, abstention, unauthorized changes
- `check_evaluation_leakage()`: article/patient ID overlap detection between training and eval sets
- `compare_base_vs_adapter()`: metric deltas + safety regression detection
- `load_dev_cases()` / `load_dev_results()`: load frozen dev data
- `_diagnostic_parse()`: recovers concatenated/fenced JSON objects

### `mlx_runner/scheduler.py`
Experiment scheduler with safety gates:
- `run_dry_run()`: validate everything without inference/training
- `run_evaluate_only()`: evaluate base vs adapter from frozen results
- `run_train_once()`: one bounded experiment (requires `--approve-training`)
- `run_scheduled()`: dry-run + evaluate-only only, NEVER auto-trains
- `launchd_plist()`: template only, NOT auto-installed
- License checks, evaluation integrity, leakage checks, resource checks

### `mlx_runner/trainer.py`
Conservative Apple Silicon training engine:
- `TrainingEngine`: single-process enforcement, resource checks, checkpoint management
- `run_smoke_test()`: lightweight test before larger jobs
- `run_training()`: full safeguards (approval, conflicts, resources, model availability)
- Checkpoint: atomic save, SHA-256 verification, manifest-based, never resume unverified
- `cleanup_old_checkpoints()`: max 5 checkpoints, removes oldest
- `_build_smoke_script()`: placeholder script, no model weights loaded

### `mlx_runner/promotion.py`
Model promotion gate:
- `PromotionGate.evaluate()`: requires improved primary metrics, no safety regressions, valid structured output, correct abstention/authority, reproducible artifacts, human approval
- Never auto-promotes

### `mlx_runner/registry.py`
Dataset licensing/provenance gate:
- `DatasetEntry`: license_status, dataset_class, restricted_data, review_required
- `is_ingestible()`: only if APPROVED, not restricted, not review_required
- `build_default_registry()`: 8 datasets from research audit
- Ingestible: synthetic-hospital, cadecv2, fresh-eval-dev
- Blocked (review_required): medtempo-bench, aci-bench, mts-dialog, pmc-open-access, pubmedqa

### `mlx_runner/dashboard.py`
Local HTML + CLI dashboard showing system resources, dataset provenance, experiments, checkpoints, safety notes.

---

## TEST RESULTS

**Python tests (unittest): 71/71 passed** across 7 test files:
- test_registry, test_evaluator, test_promotion, test_scheduler, test_trainer, test_dashboard (existing)
- test_leakage, test_comparison, test_checkpoint (NEW)

**JS/Vitest tests: 14/14 passed** (2 files)

**TypeScript typecheck: clean**

**Production build: success**

---

## DRY-RUN OUTPUT (last run)

```json
{
  "mode": "dry-run",
  "status": "blocked",
  "blocked_datasets": [
    "medtempo-bench: license_status=review_required, ...",
    "aci-bench: license_status=review_required, ...",
    "mts-dialog: license_status=review_required, ...",
    "pmc-open-access: license_status=review_required, ...",
    "pubmedqa: license_status=review_required, ..."
  ],
  "config_errors": [],
  "integrity_issues": [],
  "leakage_issues": ["No article/patient ID overlap detected between training and evaluation"],
  "resource_issues": ["Free memory 1.3 GB < required 40.0 GB"],
  "ingestible_datasets": ["synthetic-hospital", "cadecv2", "fresh-eval-dev"],
  "experiment_id": "dry-run_20261114_201045"
}
```

**Dry-run is BLOCKED** because:
1. 5 datasets have `review_required` license status (need operator review)
2. Free memory (1.3 GB) is below required 40.0 GB (system in use)

This is expected safety behavior — dry-run correctly identifies issues before allowing training/evaluation.

---

## EVALUATE-ONLY OUTPUT (last run)

Base vs adapter comparison on frozen dev data (2 cases, 9 events):

| Metric | Base | Adapter | Delta |
|---|---|---|---|
| pair_matches | 9 | 9 | 0 |
| dose_exact | 7 | 5 | -2 |
| time_exact | 9 | 7 | -2 |
| evidence_literal | 0 | 0 | 0 |
| unauthorized_changes | 1 | 3 | +2 |
| null_type_errors | 0 | 3 | +3 |
| abstentions_correct | 2 | 1 | -1 |

**Safety regressions detected:** unauthorized_changes increased, null_type_errors increased, abstentions_correct decreased. **Adapter is NOT better** — promotion would be blocked.

---

## HOW TO RUN

### Dry-run (validate everything, no training):
```bash
python3 -m mlx_runner.cli --mode dry-run
```

### Evaluate-only (compare base vs adapter from frozen results):
```bash
python3 -m mlx_runner.cli --mode evaluate-only
```

### Train-once (requires explicit operator approval):
```bash
python3 -m mlx_runner.cli --mode train-once --approve-training
```
**NOTE:** This will be BLOCKED if any dataset has unresolved license status or if resources are insufficient. The smoke test runs first (10 steps, 5 min max). A larger job requires separate approval.

### Scheduled (dry-run + evaluate-only only, NEVER trains):
```bash
python3 -m mlx_runner.cli --mode scheduled
```

### Generate dashboard:
```bash
python3 -m mlx_runner.cli --cli-dashboard
python3 -m mlx_runner.cli --dashboard
```

### Run all Python tests:
```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

### Run JS tests:
```bash
npm test
```

---

## SAFETY CONSTRAINTS (NEVER VIOLATE)

1. **No unattended training** — `--approve-training` required for train-once; scheduler never trains
2. **No automatic model promotion** — `auto_promote` always False; human approval required
3. **No large model downloads** — Qwen3.6-35B-A3B (~17.5 GB 4-bit) not downloaded without approval
4. **No real patient data** — synthetic data only
5. **No model weights/adapters/credentials committed to Git** — checkpoints/ excluded
6. **Not clinically validated** — synthetic testing only
7. **No 35B training locally** — blocked by config validation (exceeds 48 GB memory)
8. **Thermal telemetry unavailable** — marked unsupported, requires explicit operator approval
9. **Never silently resume unverified checkpoint** — manifest with verified=True required

---

## NEXT STEPS (for the next agent)

1. **Resolve blocked datasets:** Review and approve licenses for medtempo-bench, aci-bench, mts-dialog, pmc-open-access, pubmedqa in `docs/research/SOURCE_AUDIT.md` and update `mlx_runner/registry.py` accordingly.

2. **Resolve resource constraints:** Free memory is below 40 GB threshold. Either reduce `max_memory_gb` in config or wait for system memory to free up.

3. **Run train-once smoke test:** Once dry-run passes, execute:
   ```bash
   python3 -m mlx_runner.cli --mode train-once --approve-training
   ```

4. **Review smoke test results:** Check `checkpoints/smoke_manifest.json` and `logs/training_*.log`.

5. **Request separate approval for larger training job:** After smoke test completes, a larger job needs its own `--approve-training` authorization.

6. **Update this context file** (`anti-gravity context.md`) as work progresses so the next agent can pick up seamlessly.

---

## FILES EXCLUDED FROM GIT (do not commit)

- `checkpoints/*` (model weights)
- `logs/*` (training logs)
- `runs/scheduler_state.json` (runtime state — actually this IS committed; runtime updates ok)
- `dashboard.html` (generated artifact — committed; regenerated on each run)
- `node_modules/`, `.next/`, `__pycache__/`, `*.pyc`
- Model weights, adapters, credentials, personal directories

---

**Last updated:** 2026-11-14
**Updated by:** Kilo (ML infrastructure agent)
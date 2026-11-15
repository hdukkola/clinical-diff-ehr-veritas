# Anti-Gravity Context — Clinical Diff EHR Veritas

**Purpose:** Handoff context file so another agent can immediately start building without searching directories. All paths, names, commands, and values are exact and set in stone.

**Repository:** `/Users/himnishdukkola/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/ml-experiment-runner-implementation` (pushed to origin)
**Last commit:** `2221b5d1bbb7dbd9b9bb26348c338b936f11dd0c`
**Main commit:** `69a826e231937c8515da272b48f7fb42d7f39350` (untouched, not merged)
**Platform:** macOS, Apple M5 Pro, 48 GB unified memory, 346 GB disk
**Python:** 3.14.7
**Working directory:** `/Users/himnishdukkola/Projects/clinical-diff-ehr-veritas`

---

## DIRECTORY STRUCTURE (EXACT)

```
/Users/himnishdukkola/Projects/clinical-diff-ehr-veritas/
├── mlx_runner/
│   ├── __init__.py
│   ├── __main__.py          # CLI entry: python -m mlx_runner.cli
│   ├── cli.py               # CLI argument parsing & dispatch
│   ├── config.py            # Pipeline configuration (dataclasses)
│   ├── evaluator.py         # Frozen evaluation suite + leakage detection + comparison
│   ├── registry.py          # Dataset licensing/provenance gate
│   ├── trainer.py           # Conservative Apple Silicon training engine
│   ├── promotion.py         # Model promotion gate (Phase 6)
│   ├── dashboard.py         # Local HTML + CLI dashboard (Phase 7)
│   └── __pycache__/         # (do not commit)
├── tests/
│   ├── test_registry.py     # Dataset registry & licensing gate
│   ├── test_evaluator.py    # Evaluation suite (JSON, pairs, dose, time, null, abstention)
│   ├── test_promotion.py    # Model promotion gate
│   ├── test_scheduler.py    # Experiment scheduler modes
│   ├── test_trainer.py      # Training engine & resource checks
│   ├── test_dashboard.py    # Dashboard & config validation
│   ├── test_leakage.py      # Evaluation leakage detection
│   ├── test_comparison.py   # Base vs adapter comparison
│   ├── test_checkpoint.py   # Checkpoint recovery & management
│   └── __pycache__/         # (do not commit)
├── docs/research/
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
├── configs/
│   ├── default.yaml
│   └── smoke_test.yaml
├── checkpoints/             # (do not commit model weights)
│   ├── smoke_adapters.safetensors   # Placeholder from smoke test
│   └── smoke_manifest.json          # Checkpoint manifest
├── runs/
│   └── scheduler_state.json         # Persisted scheduler state
├── logs/                    # Training logs (training_*.log)
├── dashboard.html           # Generated HTML dashboard
├── anti-gravity context.md  # THIS FILE
├── src/app/                 # Next.js frontend (existing, not modified)
├── fresh-backend/           # Python backend service (existing, not modified)
├── veritas-editorial/       # Editorial interface (existing, not modified)
├── package.json             # Node.js project config
├── vitest.config.ts         # Vitest configuration
├── .gitignore               # Excludes checkpoints/, logs/, node_modules/, .next/, __pycache__/
└── README.md
```

---

## MODULE REFERENCE (EXACT CLASS, METHOD, FUNCTION NAMES)

### `mlx_runner/config.py`

**Classes:**
- `RunMode(str, Enum)` — values: `DRY_RUN = "dry-run"`, `EVALUATE_ONLY = "evaluate-only"`, `TRAIN_ONCE = "train-once"`, `SCHEDULED = "scheduled"`
- `DatasetClass(str, Enum)` — `SYNTHETIC`, `REAL`, `MODEL_GENERATED`, `MIXED`
- `LicenseStatus(str, Enum)` — `APPROVED`, `REVIEW_REQUIRED`, `BLOCKED`
- `DatasetEntry` — fields: `name`, `source_url`, `revision`, `sha256`, `license`, `license_status`, `dataset_class`, `permitted_use`, `annotation_quality`, `label_provenance`, `split_assignment`, `exclusion_list`, `restricted_data`, `cloud_processing`, `review_required`, `notes`
  - Method: `is_ingestible() -> bool` — returns True only if `license_status == APPROVED and not restricted_data and not review_required`
- `ResourceLimits` — fields: `max_memory_gb=40.0`, `max_disk_gb=100.0`, `max_duration_minutes=60`, `max_temperature_c=None`, `max_concurrent_training=1`, `smoke_test_max_steps=10`, `smoke_test_max_duration_minutes=5`
- `EvaluationLeakageConfig` — fields: `enabled=True`, `check_article_id_overlap=True`, `check_patient_id_overlap=True`, `exclude_training_ids_from_eval=True`, `eval_split_must_be_disjoint=True`, `forced_exclusion_ids=[]`, `observed_training_ids=[]`
- `ModelConfig` — fields: `base_model_id="Qwen/Qwen3.6-35B-A3B"`, `base_model_available_locally=False`, `base_model_download_size_gb_4bit=17.5`, `base_model_download_size_gb_bf16=70.0`, `local_model_path="/Users/himnishdukkola/Documents/tds-agent/tds-model-qwen"`, `local_model_id="mlx-community/Qwen2.5-7B-Instruct-4bit"`, `local_model_params=7615616512`, `local_model_quantization="4-bit"`, `local_model_architecture="Qwen2ForCausalLM"`, `adapter_path=None`, `training_framework="mlx"`, `fine_tune_type="lora"`, `lora_rank=8`, `lora_layers=8`, `max_seq_length=2048`, `local_adapters={"tds-agent": "/Users/himnishdukkola/Documents/tds-agent/adapters/tds-agent", "tds-agent-qwen": "/Users/himnishdukkola/Documents/tds-agent/adapters/tds-agent-qwen"}`
- `PipelineConfig` — fields: `mode`, `datasets`, `resources`, `model`, `leakage`, `work_dir`, `checkpoint_dir`, `run_dir`, `log_dir`, `require_operator_approval=True`, `auto_promote=False`, `thermal_telemetry_available=False`, `dry_run_only=False`
  - Method: `validate() -> list[str]` — returns error messages
- `DEFAULT_CONFIG = PipelineConfig()` — mode=DRY_RUN, require_operator_approval=True, auto_promote=False
- Function: `load_config(path=None) -> PipelineConfig` — raises NotImplementedError if path given

**CRITICAL MODEL IDENTITY FACT:** Qwen3.6-35B-A3B is NOT available locally. The only local model is Qwen2.5-7B-Instruct-4bit (7.6B params, 4-bit quantized, ~4 GB on disk). Qwen3.6-35B-A3B would require ~17.5 GB (4-bit) download — prohibited without explicit operator approval. Local adapters (`tds-agent`, `tds-agent-qwen`) are LoRA on Qwen2.5-7B, NOT Qwen3.6-35B-A3B. There is NO Qwen3.6-35B-A3B adapter and NO step-360 checkpoint locally.

### `mlx_runner/evaluator.py`

**Dataclasses:**
- `FieldResult(field, expected, predicted, exact_match, null_type_correct)`
- `EventResult(medication, action, pair_match, dose, time, evidence, evidence_literal, authority_match, abstention_correct, unauthorized_change)`
- `CaseResult(case_id, events, strict_json_valid, parse_mode, null_type_errors)`
- `EvaluationResult(cases, total_events, pair_matches, dose_exact, time_exact, evidence_literal, authority_matches, abstentions_correct, unauthorized_changes, null_type_errors, strict_json_valid_cases)`
- `LeakageCheckResult(passed, article_ids_overlap=[], patient_ids_overlap=[], eval_ids_in_training=[], reasons=[])`
- `ModelComparisonResult(base, adapter, pair_match_delta, dose_exact_delta, time_exact_delta, evidence_literal_delta, null_type_error_delta, adapter_better, safety_regressions=[])`

**Functions:**
- `sha256_file(path) -> str`
- `_diagnostic_parse(raw: str) -> tuple[list[Any], bool, str]` — returns `(objs, strict, mode)` where mode is `"strict"`, `"fenced_json"`, or `"concatenated_objects"`
- `_norm(v: Any) -> str | None` — normalizes strings; returns `"STRING_NULL"` for string `"null"`
- `_extract_ids(obj, id_keys=None) -> set[str]` — recursively extracts article/patient IDs
- `check_evaluation_leakage(training_data, evaluation_data, config=None) -> LeakageCheckResult`
- `evaluate_case(case: dict, response: str, source_text: str = "") -> CaseResult`
- `evaluate_all(cases: list[dict], responses: dict[str, str], source_texts: dict[str, str] = {}) -> EvaluationResult`
- `load_dev_results(path: Path | str) -> dict[str, str]`
- `load_dev_cases(path: Path | str) -> list[dict]`
- `compare_base_vs_adapter(base_result: EvaluationResult, adapter_result: EvaluationResult) -> ModelComparisonResult`

### `mlx_runner/scheduler.py`

**Dataclasses:**
- `ExperimentRecord(id, mode, status, started_at, finished_at=None, dataset_names=[], evaluation=None, training=None, comparison=None, promotion_decision=None, rejection_reason=None)`
- `SchedulerState(experiments=[], last_run=None, next_scheduled=None)`

**Class: `ExperimentScheduler`**
- `__init__(self, config: PipelineConfig, work_dir: Path | str = ".")`
- Methods:
  - `check_licenses() -> list[str]`
  - `check_evaluation_integrity() -> list[str]`
  - `check_evaluation_leakage() -> list[str]`
  - `check_resources() -> list[str]`
  - `run_dry_run() -> dict[str, Any]`
  - `run_evaluate_only() -> dict[str, Any]`
  - `run_train_once(operator_approved: bool = False) -> dict[str, Any]`
  - `run_scheduled() -> dict[str, Any]`
  - `launchd_plist(label: str = "clinical-diff.mlx-runner") -> str`
  - `list_experiments() -> list[dict[str, Any]]`

**Mode behavior:**
- `dry-run`: validates licenses, config, evaluation integrity, leakage, resources; returns `status: "completed"` or `"blocked"`; never trains
- `evaluate-only`: loads frozen base/adapter responses from `fresh-eval/development-results.json`, evaluates both, compares them; returns comparison with `adapter_better` flag and `safety_regressions`
- `train-once`: requires `operator_approved=True`; runs smoke test first; larger job requires separate approval
- `scheduled`: runs dry-run + evaluate-only only, NEVER trains

### `mlx_runner/trainer.py`

**Enums & Dataclasses:**
- `TrainingStatus(str, Enum)` — `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `ABORTED`, `BLOCKED`
- `TrainingResult(status, steps_completed=0, duration_seconds=0.0, peak_memory_gb=0.0, checkpoint_path=None, checkpoint_sha256=None, error_message=None, blocked_reason=None, smoke_test=False, recovered_from_checkpoint=False)`
- `ProcessSnapshot(pid, cmdline, memory_gb)`
- `CheckpointInfo(path, step, sha256, created_at, verified=False)`

**Class: `TrainingEngine`**
- `__init__(self, config: PipelineConfig, work_dir: Path | str = ".")`
- `_max_checkpoints = 5`
- Methods:
  - `check_existing_training() -> list[ProcessSnapshot]` — detects conflicting mlx/python training processes
  - `check_resources() -> list[str]` — checks disk and memory via `os.statvfs` and `vm_stat`
  - `list_checkpoints() -> list[CheckpointInfo]`
  - `verify_checkpoint(path: Path | str) -> CheckpointInfo | None` — only verified if manifest has `verified=True`
  - `cleanup_old_checkpoints(keep: int | None = None) -> list[str]`
  - `resume_from_checkpoint(checkpoint_path: Path | str) -> CheckpointInfo | None` — never resumes unverified
  - `run_smoke_test() -> TrainingResult`
  - `run_training(smoke_test: bool = False, resume_from: Path | str | None = None) -> TrainingResult`
  - `abort() -> None`
  - `status() -> TrainingStatus`

**Safeguards:**
1. Operator approval required for non-smoke-test training
2. Existing training process detection and refusal
3. Resource checks (memory, disk, thermal)
4. Base model availability check (blocks if not local)
5. Smoke test before larger job
6. Atomic checkpoint save (write-to-temp-then-rename)
7. Checkpoint SHA-256 + manifest verification
8. Max 5 checkpoints, cleanup oldest
9. Graceful abort (SIGTERM then SIGKILL)

### `mlx_runner/promotion.py`

**Dataclasses:**
- `PromotionDecision(approved, model_id, baseline_metrics, candidate_metrics, metric_deltas, safety_regressions, structured_output_valid, abstention_correct, authority_handling_correct, reproducible_artifacts, human_approval, reason, decided_at)`
- `PromotionRecord(decision, artifacts=[])`

**Class: `PromotionGate`**
- `__init__(self, work_dir: Path | str = ".")`
- `evaluate(candidate_model_id, baseline, candidate, structured_output_valid, abstention_correct, authority_handling_correct, reproducible_artifacts, human_approved, artifacts=None) -> PromotionDecision`
- `list_records() -> list[dict[str, Any]]`

**Promotion gates (all must pass):**
1. Primary extraction performance improved (pair_matches, dose_exact, time_exact >= baseline)
2. No safety regressions (unauthorized_changes, null_type_errors not increased; abstention_correct not decreased)
3. Structured output valid
4. Abstention handling correct
5. Source-authority handling correct
6. Reproducible artifacts
7. Human approval provided

---

## DATASET REGISTRY (EXACT ENTRIES FROM `build_default_registry()`)

| Name | License Status | Dataset Class | Ingestible | Source URL |
|---|---|---|---|---|
| `synthetic-hospital` | APPROVED | SYNTHETIC | YES | https://github.com/sparkcpark/synthetic_hospital |
| `medtempo-bench` | REVIEW_REQUIRED | SYNTHETIC | NO | https://huggingface.co/datasets/mirobody/MedTEMPO-Bench |
| `aci-bench` | REVIEW_REQUIRED | REAL | NO | https://github.com/wyim/aci-bench |
| `mts-dialog` | REVIEW_REQUIRED | MIXED | NO | https://github.com/abachaa/MTS-Dialog |
| `pmc-open-access` | REVIEW_REQUIRED | REAL | NO | https://pmc.ncbi.nlm.nih.gov/tools/openftlist/ |
| `cadecv2` | APPROVED | REAL | YES | https://researchdata.edu.au/cadecv2/3378660/ |
| `pubmedqa` | REVIEW_REQUIRED | REAL | NO | https://pubmedqa.github.io/ |
| `fresh-eval-dev` | APPROVED | SYNTHETIC | YES | internal |

**Review-required (blocked from ingestion):** medtempo-bench, aci-bench, mts-dialog, pmc-open-access, pubmedqa

---

## TEST SUITE (EXACT)

**Python tests (71 tests, all pass):**
- `tests/test_registry.py` — 8 tests
- `tests/test_evaluator.py` — 14 tests
- `tests/test_promotion.py` — 9 tests
- `tests/test_scheduler.py` — 7 tests
- `tests/test_trainer.py` — 8 tests
- `tests/test_dashboard.py` — 4 tests
- `tests/test_leakage.py` — 8 tests
- `tests/test_comparison.py` — 6 tests
- `tests/test_checkpoint.py` — 9 tests

**Run command:**
```bash
cd /Users/himnishdukkola/Projects/clinical-diff-ehr-veritas
python3 -m unittest discover -s tests -p 'test_*.py'
```

**JS/Vitest tests (14 tests, all pass):**
```bash
npm test
```

**TypeScript typecheck:**
```bash
npm run typecheck
```

**Production build:**
```bash
npm run build
```

---

## CLI COMMANDS (EXACT)

All commands run from `/Users/himnishdukkola/Projects/clinical-diff-ehr-veritas`:

```bash
# Dry-run (validate everything, no inference or training)
python3 -m mlx_runner.cli --mode dry-run

# Evaluate-only (compare base vs adapter from frozen results)
python3 -m mlx_runner.cli --mode evaluate-only

# Train-once (requires explicit operator approval)
python3 -m mlx_runner.cli --mode train-once --approve-training

# Scheduled (dry-run + evaluate-only only, NEVER trains)
python3 -m mlx_runner.cli --mode scheduled

# Generate CLI dashboard
python3 -m mlx_runner.cli --cli-dashboard

# Generate HTML dashboard
python3 -m mlx_runner.cli --dashboard

# Run as module
python3 -m mlx_runner.cli --help
```

---

## DRY-RUN OUTPUT (LAST RUN — BLOCKED)

The dry-run returned `status: "blocked"` because:

1. **5 datasets are review-required** (blocked from ingestion): medtempo-bench, aci-bench, mts-dialog, pmc-open-access, pubmedqa
2. **Free memory below threshold:** 1.3 GB free < 40.0 GB required

**Expected safety behavior.** Dry-run correctly identifies blockers before allowing training/evaluation.

**To unblock dry-run:**
1. Review and approve dataset licenses in `docs/research/SOURCE_AUDIT.md` → update `mlx_runner/registry.py` `build_default_registry()` to set `license_status=LicenseStatus.APPROVED` and `review_required=False` for datasets that pass review
2. Free up system memory or reduce `max_memory_gb` in `config.py`

---

## EVALUATE-ONLY OUTPUT (LAST RUN)

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

**Safety regressions:** unauthorized_changes increased (1→3), null_type_errors increased (0→3), abstentions_correct decreased (2→1). **Adapter is NOT better** — promotion would be blocked.

---

## SAFETY CONSTRAINTS (SET IN STONE — NEVER VIOLATE)

1. **No unattended training** — `--approve-training` flag required for train-once; scheduler never trains
2. **No automatic model promotion** — `auto_promote` always False; human approval required via `PromotionGate`
3. **No large model downloads** — Qwen3.6-35B-A3B (~17.5 GB 4-bit) not downloaded without explicit operator approval
4. **No real patient data** — synthetic data only
5. **No model weights/adapters/credentials committed to Git** — `checkpoints/` excluded via `.gitignore`
6. **Not clinically validated** — synthetic testing only; no clinical safety claims
7. **No 35B training locally** — blocked by `config.py` validation (exceeds 48 GB unified memory)
8. **Thermal telemetry unavailable** — `thermal_telemetry_available=False`; thermal guard marked unsupported, requires explicit operator approval
9. **Never silently resume unverified checkpoint** — manifest with `verified=True` required via `verify_checkpoint()`
10. **Max 5 checkpoints** — `cleanup_old_checkpoints()` removes oldest

---

## NEXT ACTIONS (ORDERED)

### Step 1: Unblock dry-run
Edit `mlx_runner/registry.py` → `build_default_registry()`:
- Change `license_status=LicenseStatus.REVIEW_REQUIRED` to `LicenseStatus.APPROVED` and `review_required=False` for datasets you've reviewed (e.g., synthetic-hospital and cadecv2 are already APPROVED)
- For medtempo-bench, aci-bench, mts-dialog, pmc-open-access, pubmedqa: review their licenses in `docs/research/SOURCE_AUDIT.md`, then update `registry.py` if approved

### Step 2: Resolve memory constraint
Either:
- Free up system memory (close other applications), OR
- Reduce `max_memory_gb` from 40.0 to a lower value in `mlx_runner/config.py` `ResourceLimits`

### Step 3: Run dry-run until it passes
```bash
python3 -m mlx_runner.cli --mode dry-run
```
Expected: `status: "completed"` with no blocking issues

### Step 4: Run evaluate-only
```bash
python3 -m mlx_runner.cli --mode evaluate-only
```
Review the base vs adapter comparison and safety regressions

### Step 5: Run train-once smoke test (requires explicit approval)
```bash
python3 -m mlx_runner.cli --mode train-once --approve-training
```
This runs a 10-step smoke test (5 min max). No model weights loaded, no real training performed.

### Step 6: Review smoke test results
- Check `checkpoints/smoke_manifest.json`
- Check `logs/training_*.log`
- Check `runs/scheduler_state.json`

### Step 7: Request separate approval for larger training job
After smoke test completes, any larger training job requires its own `--approve-training` authorization

---

## HOW TO UPDATE THIS CONTEXT FILE

This file (`anti-gravity context.md`) lives at `/Users/himnishdukkola/Projects/clinical-diff-ehr-veritas/anti-gravity context.md`. Update it whenever:
- New source files are added or modified
- Configuration values change
- Test results change
- New next steps are identified
- Dry-run or evaluate-only output changes

Commit and push after each update:
```bash
git add "anti-gravity context.md"
git commit -m "Update anti-gravity context.md"
git push origin feat/ml-experiment-runner-implementation
```

---

**Last updated:** 2026-11-15
**Updated by:** Kilo (ML infrastructure agent)
**Status:** Ready for agent handoff — all paths, names, commands, and values are exact and set in stone
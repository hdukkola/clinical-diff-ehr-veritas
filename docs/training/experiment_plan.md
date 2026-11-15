# New Bounded LoRA Experiment Plan — Qwen3.6-35B-A3B-4Bit

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/next-35b-training-experiment`
**Status:** Prepared — NOT yet executed
**Date:** November 14, 2026

---

## 1. Baseline Model

| Field | Value |
|-------|-------|
| Base model | `mlx-community/Qwen3.6-35B-A3B-4bit` |
| Base model revision | `38740b847e4cb78f352aba30aa41c76e08e6eb46` |
| Base model quantization | 4-bit (QLoRA-style) |
| Base model local path | `~/.cache/huggingface/hub/models--mlx-community--Qwen3.6-35B-A3B-4bit/snapshots/38740b847e4cb78f352aba30aa41c76e08e6eb46` |
| Baseline adapter | `local-35b-medication-v1/adapter/adapters.safetensors` |
| Baseline adapter SHA-256 | `9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76` |
| Baseline adapter step | 360 |
| Baseline adapter F1 (40-case test) | 0.950 |

**Important:** The baseline adapter is preserved as-is. The new experiment will train from the base model (not from the existing adapter), using a separate output directory. No existing checkpoint will be overwritten.

---

## 2. Training Data

### Dataset Sources (verified, licensed)

| Dataset | License | Class | Ingestible | Use |
|---------|---------|-------|------------|-----|
| `synthetic-hospital` | MIT | Synthetic | YES | Training data source |
| `oopere/clinical-ner-qdora` | MIT | Model-generated | NO (review_required) | Not used for new training |
| `fresh-eval-dev` | internal | Synthetic | YES | Development only, NOT for training |

### Training Data Plan

The existing training data (`oopere/clinical-ner-qdora`, 324 train / 36 validation) is LLM-generated synthetic, NOT clinician-reviewed, and is marked REVIEW_REQUIRED. It was already used for the 360-step adapter.

**New training data:** 50 candidate examples generated from verified licensed source patterns (Synthetic Hospital MIT, challenge publications CC BY 4.0). These are synthetic and UNREVIEWED — not clinician-reviewed truth.

| Split | Count | Source | Review Status |
|-------|-------|--------|--------------|
| Train | 40 | Synthetic candidates (from `data/training/candidates/candidates.jsonl`) | UNREVIEWED |
| Validation | 10 | Synthetic candidates | UNREVIEWED |
| Test (held-out) | 0 | N/A | N/A — no separate test set |

**Total: 50 training examples, all UNREVIEWED, all synthetic.**

**Exclusion list (must NOT be used for training):**
- `fresh-eval/seed-v2.jsonl` (2 cases, 9 events) — development data only
- `published-medication-events/evaluation/test.json` (40 cases) — held-out evaluation, must not train on
- `published-medication-events/evaluation/test.parquet` — held-out evaluation

### Data Leakage Prevention

- No patient/article ID overlap between training and evaluation sets
- The 40-case test set from `oopere/clinical-ner-qdora` is NOT used for training
- The 2-case dev set is NOT used for training
- Training data sources are distinct from evaluation data sources

---

## 3. Training Configuration (Conservative)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Fine-tune type | LoRA | Same as baseline |
| LoRA rank | 8 | Same as baseline (conservative) |
| LoRA layers | 2 | Same as baseline (final two layers only) |
| Max sequence length | 512 | Reduced from 1024 (conservative, less memory) |
| Batch size | 1 | Same as baseline |
| Gradient accumulation | 4 | Increased from 1 (effective batch = 4) |
| Learning rate | 1e-5 | Same as baseline |
| Optimizer | adam | Same as baseline |
| Max steps | 100 | Reduced from 360 (bounded experiment) |
| Steps per eval | 20 | More frequent evaluation |
| Steps per report | 10 | Frequent logging |
| Save every | 20 | Frequent checkpoints |
| Seed | 2026 | Same as baseline |
| Grad checkpoint | true | Reduce memory |
| Mask prompt | true | Train on assistant responses only |
| Max duration | 60 minutes | Bounded execution |

---

## 4. Resource Estimates

| Resource | Estimate | Notes |
|-----------|----------|-------|
| Model weights (4-bit) | ~17.5 GB | Must be resident in memory |
| KV cache + activations | ~2-4 GB | Depends on sequence length |
| macOS + MLX overhead | ~3-5 GB | System overhead |
| **Total estimated** | **~23-26 GB** | Fits within 48 GB unified memory |
| Peak memory (baseline run) | 24.960 GB | Observed in previous run |
| Disk space | ~500 MB | Checkpoints + logs |
| Training time | ~15-30 minutes | 100 steps, small dataset |

**Memory safety:** 40 GB max configured. Previous run peaked at 24.96 GB. Headroom of ~15 GB.

---

## 5. Proposed Training Command

```bash
cd ~/Projects/clinical-diff-ehr-veritas

# Step 1: Dry run (validate everything without training)
python3 -m mlx_runner.cli --mode dry-run

# Step 2: Evaluate baseline (frozen results)
python3 -m mlx_runner.cli --mode evaluate-only

# Step 3: Train-once smoke test (10 steps, requires approval)
python3 -m mlx_runner.cli --mode train-once --approve-training

# Step 4: If smoke test passes, request separate approval for full bounded training
# python3 -m mlx_runner.cli --mode train-once --approve-training
# (with modified config for 100 steps)

# Step 5: Evaluate candidate against frozen test set
python3 -m mlx_runner.cli --mode evaluate-only
```

The actual MLX training command (via mlx-runner trainer) would be:

```bash
python3 -m mlx_lm.lora \
    --model ~/.cache/huggingface/hub/models--mlx-community--Qwen3.6-35B-A3B-4bit/snapshots/38740b847e4cb78f352aba30aa41c76e08e6eb46 \
    --train \
    --data data/training/candidates/candidates.jsonl \
    --save adapters_checkpoint_step360 \
    --iters 100 \
    --val-every 20 \
    --batch-size 1 \
    --grad-accum-steps 4 \
    --learning-rate 1e-5 \
    --seq-len 512 \
    --lora-layers 2 \
    --lora-rank 8 \
    --mask-prompt \
    --grad-checkpoint \
    --seed 2026
```

**Note:** This command is documented but NOT executed. Operator approval required before running.

---

## 6. Recovery and Stop Mechanisms

| Mechanism | Implementation |
|-----------|---------------|
| Checkpoint recovery | Checkpoints saved every 20 steps with SHA-256 manifest. Only verified manifests (verified=true) can be resumed. |
| Atomic checkpoint save | Write to temp file, then atomic rename. No partial checkpoints. |
| Max checkpoints | 5 checkpoints retained; oldest deleted when limit exceeded |
| Graceful abort | SIGTERM then SIGKILL with 10-second timeout |
| Duration limit | 60-minute hard cap; process terminated if exceeded |
| Memory pressure | Monitored every 5 seconds during training; abort if critical |
| Duplicate launch prevention | File-based locks prevent two processes running same experiment |
| Model lock | One training job per model at a time |
| No auto-retry | Failed runs require explicit operator re-approval |
| Consecutive failure limit | 3 failures pauses scheduler; operator intervention required |

**Checkpoint recovery procedure:**
1. Verify checkpoint manifest exists and `verified=true`
2. Verify SHA-256 matches recorded hash
3. Load optimizer state and RNG state from checkpoint
4. Resume training from saved step
5. Never silently resume an unverified checkpoint

---

## 7. Remaining Blockers

| Blocker | Severity | Resolution Required |
|-----------|----------|---------------------|
| No clinician-reviewed training data | HIGH | All 50 candidates are UNREVIEWED synthetic data. Human review required before training. |
| No separate test set | MEDIUM | No blind evaluation set separate from training data. Existing 40-case test set must not be used for training. |
| Memory pressure risk | MEDIUM | 24.96 GB peak on 48 GB system. Conservative settings help but telemetry not available. |
| No operator approval | HIGH | `--approve-training` flag required. No unattended training. |
| Adapter hash not fully verified | LOW | Individual checkpoint hashes (60, 120, 180, 240, 300) not yet computed |

**Do not start training until:**
1. At least some candidates are human-reviewed (annotation-review workflow)
2. A separate blind evaluation set is established
3. Operator provides explicit approval (`--approve-training`)

---

## 8. Evaluation Plan (Frozen)

| Evaluation | Data Source | Purpose |
|-----------|-------------|---------|
| Baseline comparison | `fresh-eval/development-results.json` (2 cases, 9 events) | Compare new adapter vs base vs 360-step adapter |
| Blind evaluation | `published-medication-events/evaluation/test.json` (40 cases) | Independent test set, NOT used for training |
| New candidate evaluation | 50 synthetic candidates (after human review) | Evaluate on new data distribution |

**Metrics:** Strict JSON validity, medication/action pairs, dose accuracy, time accuracy, evidence literalness, abstention correctness, unauthorized change detection.

**Comparison:** Base model vs 360-step adapter vs new candidate adapter.

**Safety gates:** Evidence-sufficiency gate, missing-value abstention, unauthorized-change blocking.

---

## 9. ARENA_RESEARCH_REQUEST.md Status

The existing ARENA_RESEARCH_REQUEST.md already requests clinician-reviewed synthetic medication extraction datasets with 500+ training examples. No update needed — the request is appropriate for the current blocker (no clinician-reviewed training data available locally).

**Status:** NOT submitted to Arena. No contact made.

---

**Prepared:** 2026-11-15
**Status:** Ready for operator review

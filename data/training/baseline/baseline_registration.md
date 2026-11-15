# Baseline Registration — 360-Step Qwen3.6-35B-A3B-4bit Medication Extraction Adapter

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/next-35b-training-experiment`
**Status:** Registered — baseline for future experiments

---

## Adapter Identity

| Field | Value |
|-------|-------|
| Adapter ID | `medication-v1-step360` |
| Base model | `mlx-community/Qwen3.6-35B-A3B-4bit` |
| Base model revision | `38740b847e4cb78f352aba30aa41c76e08e6eb46` |
| Base model quantization | 4-bit (QLoRA-style, NOT CUDA/bitsandbytes NF4) |
| Base model local path | `~/.cache/huggingface/hub/models--mlx-community--Qwen3.6-35B-A3B-4bit/snapshots/38740b847e4cb78f352aba30aa41c76e08e6eb46` |
| Upstream source correspondence | **NOT independently verified** — community conversion |
| Framework | mlx-lm 0.31.3, mlx 0.32.0 |
| Python | 3.14.7 |
| Hardware | Apple M5 Pro, 18 CPU cores, ~48 GB unified memory |

---

## Adapter Files (verified SHA-256)

| File | SHA-256 | Size | Purpose |
|------|---------|------|---------|
| `adapters.safetensors` | `9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76` | 128,147,925 bytes | Final 360-step adapter |
| `0000060_adapters.safetensors` | *(not yet computed)* | 128,147,925 bytes | Checkpoint at step 60 |
| `0000120_adapters.safetensors` | *(not yet computed)* | 128,147,925 bytes | Checkpoint at step 120 |
| `0000180_adapters.safetensors` | *(not yet computed)* | 128,147,925 bytes | Checkpoint at step 180 |
| `0000240_adapters.safetensors` | *(not yet computed)* | 128,147,925 bytes | Checkpoint at step 240 |
| `0000300_adapters.safetensors` | *(not yet computed)* | 128,147,925 bytes | Checkpoint at step 300 |
| `0000360_adapters.safetensors` | `9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76` | 128,147,925 bytes | Checkpoint at step 360 (identical to final) |
| `adapter_config.json` | *(not yet computed)* | 1,293 bytes | LoRA configuration |

Adapter directory: `~/.codex/.chatgpt-projects/g-p-6ae2a77388348191821395e8101c3408/model-development/local-35b-medication-v1/adapter/`

---

## Training Configuration (from `adapter_config.json`)

| Field | Value |
|-------|-------|
| Fine-tune type | LoRA |
| Rank | 8 |
| Dropout | 0.0 |
| Scale | 20.0 |
| Max sequence length | 1024 |
| Batch size | 1 |
| Gradient accumulation | 1 |
| Learning rate | 1e-5 |
| Optimizer | adam |
| Steps | 360 |
| Steps per eval | 60 |
| Steps per report | 10 |
| Save every | 60 |
| Seed | 2026 |
| Grad checkpoint | true |
| Mask prompt | true (train on assistant responses only) |
| Num layers | 2 |
| Trainable parameters | 0.092% (32.035M / 34606.609M) |
| Trained tokens | 6,428 |
| Peak memory | 24.960 GB |

---

## Evaluation Results (40-case synthetic test set)

| Metric | Base | Adapter | Delta |
|--------|------|---------|-------|
| strict_schema | 20 | 40 | +20 |
| parseable | 40 | 40 | 0 |
| exact match | 32 | 37 | +5 |
| TP | 50 | 57 | +7 |
| FP | 10 | 3 | -7 |
| FN | 10 | 3 | -7 |
| F1 | 0.833 | 0.950 | +0.117 |

Test set SHA-256: `7985e0b6eb2b0d485b89b8ce0ce55360944e7d74128c8ecf8d30286378f0a1ab`
Test cases: 40
Test split: NOT downloaded by preparation script; NOT used in training

---

## Critical Limitations (from `README.md`)

1. **Dataset is LLM-generated synthetic, NOT clinician reviewed.** Source: `oopere/clinical-ner-qdora` (MIT license).
2. **Random split, not patient-grouped.** Template similarity possible between train and test.
3. **Name-only extraction.** Dose, unit, route, frequency, duration NOT supervised.
4. **Not evaluated on independent clinician-reviewed test set.**
5. **Validation loss fell from 1.971 to 0.058** — does NOT establish accuracy, generalization, or safety.
6. **Previous launch job accidentally restarted after completion.** Both launch jobs were removed; training is not currently running.

---

## Registration Status

- [x] Adapter hash computed and recorded (`9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76`)
- [ ] Individual checkpoint hashes (60, 120, 180, 240, 300) NOT yet computed
- [ ] Adapter configuration preserved
- [ ] Evaluation metrics recorded
- [ ] Baseline marked as **NOT for production use** — research only
- [ ] Baseline marked as **NOT to be overwritten** by new experiments

---

**Next experiment must use a separate output directory and must not overwrite this adapter.**

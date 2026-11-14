# Reproducible Evaluation Plan: Qwen3.6 Base vs. 35B Adapter

**Research date:** November 14, 2026  
**Branch:** `research/evaluation-infrastructure` (not merged to main)  
**Status:** Plan only — no training, inference, or paid API usage performed

## 1. Objective

Compare the original Qwen3.6 base model (`Qwen/Qwen3.6-35B-A3B`) against the
existing local 35B adapter (saved step-360 checkpoint from synthetic extraction
training) on identical tasks, prompts, and decoding settings. No new model training
or inference is performed in this plan — it defines *how* the comparison would be
run reproducibly.

## 2. Models Under Comparison

| Variant | Model ID | Source | Notes |
|---|---|---|---|
| **Base** | `Qwen/Qwen3.6-35B-A3B` | Hugging Face (Apache-2.0) | 35B total / 3B activated MoE; multimodal; text-only via `--language-model-only` |
| **Adapter** | `local-35b-adapter-step-360` | Local checkpoint | From 35B synthetic extraction training (360 steps); matches saved step-360 checkpoint |

**Important model identity correction:** Qwen3.6-35B-A3B is an MoE model
(35B total / 3B activated), not a dense 35B model. It is also multimodal (has a
vision encoder). Text-only inference must use `--language-model-only` to skip
multimodal profiling. Memory estimates must account for MoE: ~35B weights stored,
~3B activated per forward pass.

## 3. Evaluation Tasks and Datasets

| Task | Dataset | Split | Purpose |
|---|---|---|---|
| Medication-event extraction (dev) | `fresh-eval/seed-v2.jsonl` | N/A (2 cases, 9 events) | Baseline regression — development data only, not blind |
| Longitudinal chart evaluation | Synthetic Hospital `benchmark_v1.3.db` | `public` (200 patients) | Independent blind evaluation |
| Medication reconciliation (optional) | MedTEMPO-Bench `synth_core200_v2n-20261028` | `test` (200 items) | **Blocked** — ground truth withheld for active batch `202610` |

**Dev data is NOT a blind test.** The 2-case, 9-event dev set labels were
inspected during development. It is used only as a regression check, not as a
blind clinical evaluation.

**MedTEMPO is blocked.** Ground truth is withheld while batch `202610` is the
active leaderboard set. It cannot serve as a self-contained scored test set.

## 4. Metrics

### Medication-event extraction (dev set)
From `RUBRIC.md` (referenced in `fresh-eval/REVIEW.md`):

| Metric | Definition |
|---|---|
| Strict JSON validity | Raw response parses as a single JSON value (fenced/concatenated = not strict) |
| Medication/action pairs | Multiset comparison, case-insensitive medication |
| Dose accuracy | Amount + unit only; frequency/route excluded |
| Time accuracy | Trimmed + case-insensitive; explicit relative times preserved |
| Missing-value handling | JSON `null` correct; string `"null"` flagged |
| Evidence support | Literal substring AND resolvable action reference |

### Longitudinal chart evaluation (Synthetic Hospital public split)

| Task | Primary Metric |
|---|---|
| `evidence_retrieval` | `precision_5`, `ndcg_10` |
| `context_summarization` (encounter) | `clinical_f1` |
| `patient_diagnosis` (via `/env`, not `eval/agents`) | `weighted_problem_list_f1_neutral` |

### Adapter-specific safety metrics

| Metric | Definition |
|---|---|
| Abstention rate | Share of cases where the model correctly abstains due to missing evidence |
| Unsafe mutation rate | Share of proposed changes lacking required dose/route/frequency |
| Evidence linkage rate | Share of proposals with literal evidence span linked to source text |
| String-`"null"` rate | Share of missing fields rendered as string `"null"` instead of JSON `null` |

## 5. Prompts and Decoding Settings (Frozen)

These settings must be identical for both models. Any change requires re-freezing
and re-issuing this plan.

| Setting | Value |
|---|---|
| `temperature` | 0.7 (instruct/non-thinking mode) |
| `top_p` | 0.80 |
| `top_k` | 20 |
| `presence_penalty` | 1.5 |
| `repetition_penalty` | 1.0 |
| `max_tokens` | 32768 (standard); 81920 (complex tasks) |
| `enable_thinking` | False (instruct/non-thinking mode) |
| `min_p` | 0.0 |

**Rationale:** Qwen3.6 operates in thinking mode by default. For reproducible
comparison, non-thinking (instruct) mode is used with `enable_thinking: False`.
Sampling parameters follow the Qwen3.6 model card's recommended instruct-mode
settings.

**Prompt template:** Must be identical for both models. The prompt should request
strict JSON output with medication/action/dose/time/evidence fields, instruct the
model to abstain rather than invent missing values, and request evidence spans
linked to source text. The exact prompt text must be recorded in the run manifest.

## 6. Reproducibility Requirements

| Requirement | Implementation |
|---|---|
| Deterministic scoring | Use `fresh-eval/rescore_medication_events.py` (stdlib only, no inference) |
| Frozen responses | Dev results are already frozen in `development-results.json` |
| Model version pinning | Record HF commit SHA for base model; record adapter checkpoint SHA-256 |
| Prompt freezing | Record exact prompt text in run manifest |
| Decoding freezing | Record all sampling parameters in run manifest |
| Split isolation | Only `public` split of Synthetic Hospital for evaluation |
| No training on eval splits | Constraint satisfied — no new training performed |

## 7. Leakage Checks (Pre-Execution)

Before any evaluation run, verify using `docs/research/LEAKAGE_CHECKS.md`:

1. **Identifier overlap:** Training IDs ∩ evaluation IDs = ∅
2. **Label leakage:** Evaluation code never reads held-out truth files
3. **Split isolation:** Only `public` split used for evaluation
4. **Dev-set reuse:** `seed-v2.jsonl` not used as training data
5. **Adapter provenance:** Adapter checkpoint SHA-256 recorded

## 8. Evaluation Procedure (When Ready to Execute)

1. **Freeze** the prompt text and decoding settings; record in run manifest.
2. **Record** base model HF commit SHA and adapter checkpoint SHA-256.
3. **Run** base model on dev set + Synthetic Hospital public split.
4. **Run** adapter on dev set + Synthetic Hospital public split.
5. **Score** using `fresh-eval/rescore_medication_events.py` (dev) and
   `eval.cli score` (Synthetic Hospital).
6. **Produce** run manifest with leakage check results.
7. **Compare** base vs. adapter across all metrics.

## 9. Expected Constraints and Limitations

| Constraint | Impact |
|---|---|
| No model weights may be downloaded | Base model inference requires access to `Qwen/Qwen3.6-35B-A3B` weights — must be arranged locally |
| No paid API credits | OpenRouter usage not permitted; local inference only |
| No training | Adapter is already saved; no new training |
| Dev set is 2 cases / 9 events | Not statistically significant; regression check only |
| MedTEMPO ground truth withheld | Cannot use MedTEMPO for blind scoring while batch `202610` is active |
| Qwen3.6 is multimodal | Text-only path requires `--language-model-only`; memory estimates must account for MoE |

## 10. Run Manifest Template

```json
{
  "eval_name": "qwen36-35b-adapter-v1",
  "eval_date": "2026-11-14",
  "base_model_id": "Qwen/Qwen3.6-35B-A3B",
  "base_model_revision_sha": "<recorded>",
  "adapter_id": "local-35b-adapter-step-360",
  "adapter_checkpoint_sha256": "<recorded>",
  "prompt_text": "<exact prompt used>",
  "decoding_settings": {
    "temperature": 0.7,
    "top_p": 0.8,
    "top_k": 20,
    "presence_penalty": 1.5,
    "repetition_penalty": 1.0,
    "max_tokens": 32768,
    "enable_thinking": false
  },
  "datasets": {
    "dev": "fresh-eval/seed-v2.jsonl",
    "dev_sha256": "65df0f0544db1835e095e7333583a808be16cc48a56f1eff3f1e5a887d5c7457",
    "synthetic_hospital_split": "public",
    "synthetic_hospital_db_sha256": "<recorded>"
  },
  "leakage_checks_passed": true,
  "results_base": {...},
  "results_adapter": {...}
}
```

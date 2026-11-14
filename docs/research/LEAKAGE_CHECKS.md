# Frozen Evaluation Identifiers and Leakage Checks

**Research date:** November 14, 2026  
**Branch:** `research/evaluation-infrastructure` (not merged to main)

This document establishes frozen evaluation identifiers and leakage checks for the
reproducible comparison of the Qwen3.6 base model and the existing 35B adapter. The
goal is to prevent training/evaluation overlap, label leakage, and identifier
collisions.

## 1. Frozen Evaluation Identifiers

These identifiers are frozen for the duration of this research. Do not change them
without updating this document and re-issuing the review.

| Identifier | Value | Purpose |
|---|---|---|
| `EVAL_NAME` | `qwen36-35b-adapter-v1` | Name of this evaluation campaign |
| `EVAL_DATE` | `2026-11-14` | Date the evaluation plan was frozen |
| `BASE_MODEL_ID` | `Qwen/Qwen3.6-35B-A3B` | Official HF model ID for the base model |
| `BASE_MODEL_REVISION` | `main` | HF revision to pin (record exact commit SHA at run time) |
| `ADAPTER_ID` | `local-35b-adapter-step-360` | Local adapter from the 35B synthetic extraction training (saved step-360 checkpoint) |
| `ADAPTER_CHECKPOINT_SHA` | `UNCONFIRMED` | Record the adapter checkpoint file SHA-256 at run time |
| `DEV_DATASET` | `fresh-eval/seed-v2.jsonl` | Existing 2-case, 9-event medication-event development set |
| `DEV_DATASET_SHA256` | `65df0f0544db1835e095e7333583a808be16cc48a56f1eff3f1e5a887d5c7457` | SHA-256 of `seed-v2.jsonl` (from provenance table) |
| `DEV_RESULTS` | `fresh-eval/development-results.json` | Frozen model responses for base + adapter |
| `DEV_RESULTS_SHA256` | `28ec40911e3337df5ea722224358ee127a96d3b6b7fb38d3b78e4f14db57e068` | SHA-256 of `development-results.json` |
| `SYNTHETIC_HOSPITAL_DATASET` | `sparkcpark/synthetic_hospital` | GitHub repo, `main` branch |
| `SYNTHETIC_HOSPITAL_SPLIT` | `public` | Only the public split may be used for evaluation |
| `SYNTHETIC_HOSPITAL_HELDOUT` | `heldout` | Heldout split — reference labels shipped but MUST NOT be trained on |
| `SYNTHETIC_HOSPITAL_TRAIN` | `train` | Train split — may be used for training only |
| `SYNTHETIC_HOSPITAL_DB_SHA256` | `UNCONFIRMED` | Record `benchmark_v1.3.db` SHA-256 at run time |
| `MEDTEMPO_BATCH` | `202610` | Active MedTEMPO batch — ground truth withheld |

## 2. Leakage Checks

### Check 1: Training/evaluation identifier overlap (CRITICAL)

**Rule:** No article, patient, or encounter identifier may appear in both training and
held-out evaluation sets.

**Procedure:**
1. Extract all patient IDs from the training data source.
2. Extract all patient IDs from the held-out evaluation data source.
3. Compute the intersection. It must be empty.
4. Record the count of training IDs, evaluation IDs, and intersection size.

**For Synthetic Hospital:**
- Patient-level partition guarantees no patient appears in more than one split.
- Verify: `public ∩ heldout = ∅`, `public ∩ train = ∅`, `heldout ∩ train = ∅`.
- Only `public` may be used for blind evaluation. `heldout` labels are shipped but
  must not be used for training. `train` may be used for training.

**For the existing dev set (`seed-v2.jsonl`):**
- Contains 2 cases (PMC13402246, PMC8025526), 9 events.
- These are **development data**, inspected during development — NOT a blind clinical test.
- Must not be used as held-out evaluation for any model whose training may have
  seen them.

### Check 2: Label leakage from held-out labels (CRITICAL)

**Rule:** Evaluation code must never read held-out label files during training or
during prompt construction.

**Procedure:**
1. Confirm that the evaluation harness reads only the input text (article/note) and
   produces predictions, without accessing ground-truth files.
2. For MedTEMPO-Bench batch `202610`: ground truth files are NOT in the repository.
   Any code path that reads `MANIFEST.json`-referenced truth files during training
   is a leakage violation.
3. Record which files are opened during training vs. evaluation.

### Check 3: Identifier collision in audit/commit records (HIGH)

**Rule:** Evaluation run IDs, patient IDs, and model output IDs must be unique and
non-colliding across runs.

**Procedure:**
1. Prefix all evaluation run IDs with `EVAL_NAME` + timestamp.
2. Use UUID4 for per-instance prediction IDs.
3. Record all IDs in a run manifest; verify no duplicates before scoring.

### Check 4: Split label contamination (HIGH)

**Rule:** The `public`, `heldout`, and `train` split labels in Synthetic Hospital
must not be mixed.

**Procedure:**
1. When loading `benchmark_v1.3.db`, verify the `split` column on each patient row.
2. Filter to the intended split before training or evaluation.
3. Log the patient count per split actually used.

### Check 5: Dev-set reuse (MEDIUM)

**Rule:** The existing 2-case, 9-event dev set is development data only.

**Procedure:**
1. Do not treat `seed-v2.jsonl` results as a blind final assessment.
2. Do not use `seed-v2.jsonl` cases as training data for the adapter being evaluated.
3. Record that dev labels were inspected during development (they were).

### Check 6: Adapter checkpoint provenance (MEDIUM)

**Rule:** The 35B adapter must be traced to a specific checkpoint.

**Procedure:**
1. Record the adapter checkpoint file path and SHA-256.
2. Record the training step (step 360 per COMMUNICATION.md CORE-002 update).
3. Confirm the adapter matches the saved step-360 checkpoint (no repeat training).

## 3. Leakage Check Implementation (Test)

A lightweight validation test is provided at
`docs/research/validation.test.ts`. It checks:

- Dev dataset SHA-256 matches the frozen provenance value.
- No identifier overlap between declared training and evaluation ID sets.
- Evaluation code paths do not reference held-out truth files.
- Split membership is respected (only `public` for blind evaluation).

Run with: `npx vitest run docs/research/validation.test.ts`

## 4. Run Manifest Template

Each evaluation run must produce a manifest containing:

```json
{
  "eval_name": "qwen36-35b-adapter-v1",
  "eval_date": "2026-11-14",
  "base_model_id": "Qwen/Qwen3.6-35B-A3B",
  "base_model_revision_sha": "<recorded at run time>",
  "adapter_id": "local-35b-adapter-step-360",
  "adapter_checkpoint_sha256": "<recorded at run time>",
  "dev_dataset": "fresh-eval/seed-v2.jsonl",
  "dev_dataset_sha256": "65df0f0544db1835e095e7333583a808be16cc48a56f1eff3f1e5a887d5c7457",
  "dev_results": "fresh-eval/development-results.json",
  "dev_results_sha256": "28ec40911e3337df5ea722224358ee127a96d3b6b7fb38d3b78e4f14db57e068",
  "synthetic_hospital_split": "public",
  "synthetic_hospital_db_sha256": "<recorded at run time>",
  "training_patient_ids": ["<sha256-hashed ids>"],
  "evaluation_patient_ids": ["<sha256-hashed ids>"],
  "identifier_intersection_count": 0,
  "leakage_checks_passed": true,
  "notes": "<human-readable caveats>"
}
```

Patient IDs in the manifest must be SHA-256 hashed — never record raw patient
identifiers.

## 5. What Is NOT a Leakage Check (Out of Scope)

- Clinical correctness of predictions (not evaluated here)
- Model safety or alignment (out of scope)
- Real patient data (strictly prohibited — only synthetic data may be used)
- Paid API usage (strictly prohibited — no paid credits)

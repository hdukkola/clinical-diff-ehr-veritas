# Arena Research Request — Clinical Training Data for Qwen 35B Medication Extraction

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/continuous-35b-ml-pipeline`
**Date:** 2026-11-15
**Status:** Prepared — NOT yet submitted to Arena

---

## 1. Training Behavior Needing Improvement

The current Qwen3.6-35B-A3B-4bit adapter (360-step LoRA, rank 8, 2 layers) trained on
`oopere/clinical-ner-qdora` (LLM-generated synthetic, NOT clinician reviewed) achieved:
- Base: 32/40 exact, name F1 0.833, 20/40 strict JSON
- Adapter: 37/40 exact, name F1 0.950, 40/40 strict JSON

**Remaining gaps:**
- Medication extraction is name-only; dose, unit, route, frequency, duration NOT supervised
- No clinical negation handling (e.g., "no aspirin", "denies metformin")
- No clinical uncertainty handling (e.g., "possibly lisinopril", "rule out")
- No patient-reported vs clinician-authorized distinction
- No relative/absolute clinical timing extraction
- No contradiction/correction handling
- No evidence-linked structured JSON output
- No abstention when required information is missing
- Only 40-case test set, not clinician-reviewed, not a blind final assessment

## 2. Required Dataset Labels

Each training example needs:
- Input: synthetic clinical note (fictional patient encounter)
- Output: structured JSON with:
  - `medications`: array of {name, dose, unit, route, frequency, duration}
  - `actions`: array of {medication_name, action: start|stop|restart|taper|continue|change}
  - `negations`: array of medication names explicitly negated
  - `uncertainties`: array of medication names with uncertain status
  - `patient_reported`: array of medication names from patient-reported statements
  - `clinician_authorized`: array of medication names from clinician-authorized decisions
  - `relative_times`: array of {medication_name, time_expression, is_relative: bool}
  - `evidence_spans`: array of {field, start_char, end_char, source_text}
  - `abstention_reason`: string or null (when required info is missing)

## 3. Estimated Number of Useful Examples

- Minimum: 500 training / 100 validation / 200 test (clinician-reviewed)
- Ideal: 2,000+ training / 500 validation / 500 test
- Must include near-duplicate template variation to test generalization
- Must include patient-grouped splits (no patient in both train and test)

## 4. Real vs Synthetic Content

**Synthetic content acceptable** for training (no real patient data permitted).
Must be clearly labeled as synthetic, not clinician-reviewed truth.
Test set should ideally be clinician-reviewed for blind evaluation.

## 5. Licensing Requirements

- Must permit commercial/research use (MIT, Apache-2.0, CC BY, or equivalent)
- No credentialed DUAs (Data Use Agreements)
- No PHI or restricted clinical datasets
- No paid model APIs or cloud GPU charges without explicit approval
- License must be verified from original source, not from AI research reports

## 6. Required Annotation Quality

- Clinician-reviewed for test/validation sets (at minimum)
- Synthetic annotations acceptable for training if clearly labeled
- Inter-annotator agreement should be measured and reported
- Medication names should be normalized to a consistent vocabulary (e.g., RxNorm)

## 7. Dataset URLs to Investigate

| URL | Status | Notes |
|---|---|---|
| https://huggingface.co/datasets/oopere/clinical-ner-qdora | REVIEW_REQUIRED | LLM-generated synthetic, MIT license, 324 train / 36 val / 40 test. Already used. Not clinician reviewed. |
| https://github.com/sparkcpark/synthetic_hospital | APPROVED | MIT license, 1,268 synthetic patients, 5,602 clinical notes. benchmark_v1.3.db committed to repo. Public/heldout/train splits. |
| https://huggingface.co/datasets/mirobody/MedTEMPO-Bench | REVIEW_REQUIRED | CC BY 4.0, synthetic, 200 items. Ground truth withheld for active leaderboard batch. |
| https://github.com/wyim/aci-bench | REVIEW_REQUIRED | CC BY 4.0, real doctor-patient conversations. Data on figshare, not GitHub. |
| https://github.com/abachaa/MTS-Dialog | REVIEW_REQUIRED | CC BY 4.0, mixed real+synthetic. 1,201 real + 3,600 back-translated. |
| https://pmc.ncbi.nlm.nih.gov/tools/openftlist/ | REVIEW_REQUIRED | Real published articles, per-article license varies. |
| https://researchdata.edu.au/cadecv2/3378660/ | APPROVED | CC BY 4.0, real patient-reported ADE forum posts. Not medication reconciliation. |
| https://pubmedqa.github.io/ | REVIEW_REQUIRED | Real biomedical QA, license unconfirmed from homepage. |

## 8. Required Held-Out Evaluation Exclusions

- No article/patient ID overlap between training and held-out evaluation
- No near-duplicate templates across train/test splits
- Patient-grouped splits (no patient appears in both train and test)
- The existing 2-case development set (`fresh-eval/seed-v2.jsonl`) must NOT be used for training
- The 40-case test set from `oopere/clinical-ner-qdora` must NOT be used for training

## 9. Why Current Data Is Insufficient

- `oopere/clinical-ner-qdora`: LLM-generated synthetic, NOT clinician reviewed. Random split (not patient-grouped). Name-only extraction (no dose/route/frequency/timing).
- `synthetic-hospital`: Synthetic but NOT yet used for medication extraction training. Has longitudinal chart data suitable for the task.
- No clinician-reviewed medication extraction dataset is locally available.

## 10. Request to Arena

Please provide or point to:
1. A clinician-reviewed synthetic clinical note dataset with medication extraction labels (dose, unit, route, frequency, duration, actions, negations, uncertainties, evidence spans)
2. Patient-grouped train/validation/test splits with no ID overlap
3. License terms permitting research use without credentialed DUA
4. Estimated size: 500+ training examples minimum, 200+ test examples

**NOTE:** This request has NOT been submitted to Arena. No contact has been made. Other useful development work should continue while this research request is pending.

---

## Safety Constraints (from project)

- No real patient data — synthetic only
- No paid model APIs or cloud GPU charges without approval
- No credentialed patient datasets through hosted coding agents
- No large downloads without checking disk capacity and source permissions
- Never claim clinical validation using only synthetic tests
- AI proposes. Humans commit.
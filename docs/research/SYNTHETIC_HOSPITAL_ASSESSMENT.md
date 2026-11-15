# Synthetic Hospital Benchmark Assessment

**Research date:** November 14, 2026  
**Branch:** `research/evaluation-infrastructure` (not merged to main)  
**Source:** https://github.com/sparkcpark/synthetic_hospital (verified, `main` branch)

## 1. Overview

Synthetic Hospital is a medical benchmark and EHR simulation platform that converts
USMLE-style medical education source content into a ground-truth benchmark database
of synthetic longitudinal patient records, served through an Epic-faithful EHR
simulation platform (FHIR R4 + OAuth2/RBAC).

**Paper:** Park, Chen, Dettmers. *Synthetic Hospital: An Open, Verifiable,
Physician-Validated Longitudinal EHR Benchmark.* Preprint, 2026.
arXiv: https://arxiv.org/abs/2609.30027

**License:** MIT (code); released data files fully synthetic and redistributable;
source material the pipeline was built from is NOT included.

## 2. Released Dataset (v1.3)

| File | Contents |
|---|---|
| `patient_profiles.jsonl` | 1,268 synthetic longitudinal patients, 5,602 clinical notes |
| `patient_profiles.db` | SQLite version of the above |
| `benchmark_v1.3.db` | 88 MB benchmark DB: chart sections, ground truth for 4 tasks, section-level relevance judgments, imaging orders, ontology-grounded KG, public/heldout/train split labels |

`benchmark_v1.3.db` (88 MB) is committed directly to the GitHub repo — a plain
`git clone` brings the data with no Git LFS setup.

## 3. Splits (Patient-Level Partition)

| Split | Patients | Notes | Use |
|---|---|---|---|
| `public` | 200 | Subset of 5,602 | Reported benchmark; blind evaluation |
| `heldout` | 268 | Subset of 5,602 | Reference labels shipped for local scoring; **must not train on** |
| `train` | 800 | Subset of 5,602 | Released for training, incl. RL with graph-derived rewards |

No patient shares source material with any other patient.

## 4. Four Evaluation Tasks

| Task | Description | Primary Metric |
|---|---|---|
| `patient_diagnosis` | Problem-list reconstruction | `weighted_problem_list_f1_neutral` (chart-neutral rule) |
| `context_summarization` | Whole-patient / encounter / specialty-conditioned summarization | `clinical_f1` (must-include finding recall) |
| `evidence_retrieval` | Retrieval over chart sections | `precision_5`, `ndcg_10` |
| `imaging_indication` | Clinical question from imaging order | `clinical_question_concept_f1` |

`context_summarization` has three granularity variants: whole-patient (default),
`encounter` (current-visit), `specialty` (specialty-conditioned).

## 5. Evaluation Interface

The benchmark provides a complete, documented evaluation interface:

```
python -m eval.cli run --task <task> --model <model> --split <split> --strategy <strategy>
python -m eval.cli score --run-id <id>
python -m eval.cli report --split public --format csv
python -m eval.cli matrix --task <task> --split public
```

Models are accessed via OpenRouter (`OPENROUTER_API_KEY`). Agentic (tool-use)
evaluation against the live EHR simulator uses `eval/agents/` with a read-only bash
sandbox.

A scoring endpoint (`POST /score`) is exposed over HTTP, guarded by
`EPIC_SIM_SCORER_TOKEN`, so external trainers can obtain rewards without importing
evaluation code. Labels are never returned through this endpoint.

## 6. Protected Evaluation Interface — Label Leakage Avoidance

This is the key finding for our research:

**The simulator enforces label separation:**

- **`/env` endpoints and Harbor tasks** replace the problem list with the chart's
  documented history and hide assessment/plan sections server-side. The policy holds
  no scorer credential; labels are never returned.
- **The `eval/agents` harness** (used for the paper's agentic baselines) hides
  assessment/plan client-side but **leaves the problem list**, which reveals the
  patient-diagnosis labels. Agentic patient-diagnosis scores from this harness are
  inflated.

**Guidance for our evaluation:** Use the `/env` endpoints (or the non-agentic
`eval.cli` path) rather than the `eval/agents` harness for patient diagnosis, to
avoid known label leakage.

## 7. Known Issues and Caveats

| Issue | Impact on Our Evaluation |
|---|---|
| Problem-list tools reveal patient-diagnosis labels via `view_problem_list` / `open_chart` | Use `/env` endpoints, not `eval/agents`, for diagnosis |
| Later encounter notes carry "Active Problem List" of earlier diagnoses by construction | Expected chart behavior; not leakage |
| Imaging-indication reference question is LLM-authored (anchored to graph diagnosis) | Other 3 tasks have deterministic labels |
| Terminology tables ship empty (SNOMED CT needs UMLS licence; LOINC needs free registration) | Everything works without them; only terminology endpoints affected |
| Source material for ETL not redistributable | Cannot rebuild benchmark from scratch; must use released `benchmark_v1.3.db` |

## 8. Suitability for Independent Longitudinal Chart Evaluation

**Synthetic Hospital IS suitable** for independent longitudinal chart evaluation:

- ✅ Public split available with labels
- ✅ Documented, protected evaluation interface (`eval.cli`, `/env` endpoints)
- ✅ Patient-level split prevents cross-split overlap
- ✅ Four distinct longitudinal tasks
- ✅ FHIR R4 EHR simulation with tool-use agentic eval
- ✅ Released data committed to repo (no external download needed for the DB)
- ✅ Synthetic data — no real patient privacy concerns
- ✅ No training on public/heldout splits required for our base-vs-adapter comparison

**Constraint:** We must NOT train on the public or held-out evaluation splits.
Our plan uses the existing local 35B adapter (already trained on synthetic data)
and compares it against the Qwen3.6 base — no new training is performed, so this
constraint is trivially satisfied.

## 9. Recommended Use in Our Evaluation

Use Synthetic Hospital's **public split** as the independent longitudinal chart
evaluation set for comparing Qwen3.6 base vs. 35B adapter, focusing on:

1. **`evidence_retrieval`** — tests whether the adapter improves evidence citation
   (relevant to our evidence-sufficiency gate work).
2. **`context_summarization` (encounter granularity)** — tests longitudinal
   medication reconciliation across a single encounter.
3. **`patient_diagnosis`** via `/env` endpoints (avoiding `eval/agents` label
   leakage) — tests overall clinical reasoning.

Do NOT use `heldout` or `train` splits for evaluation without explicit re-review.

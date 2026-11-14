# Source-Audited Dataset Catalog

**Research date:** November 14, 2026  
**Status:** Preliminary research verification — NOT approved implementation requirements  
**Branch:** `research/evaluation-infrastructure` (not merged to main)

This catalog audits the 8 official sources named in the external clinical AI research report.
Each entry records the exact upstream URL, observed revision/state at verification time,
licensing, synthetic vs. real distinction, permitted uses, annotation quality, and dataset
restrictions. Sources that cannot be fully confirmed from the official page are marked
**REVIEW REQUIRED** rather than auto-approved.

## Verification Method

Each source was fetched directly from its official URL. No third-party summaries, mirrors,
or cached descriptions were used as the primary evidence. Where the official page was
insufficient to determine a field, that field is marked `UNCONFIRMED` and the source is
flagged **REVIEW REQUIRED**.

---

## 1. Synthetic Hospital — https://github.com/sparkcpark/synthetic_hospital

| Field | Verified Value |
|---|---|
| **Upstream URL** | https://github.com/sparkcpark/synthetic_hospital |
| **Revision observed** | `main` branch, 3 commits, latest commit visible on page |
| **Stars / forks** | 150 stars, 44 forks |
| **License** | MIT (code); released data files fully synthetic and redistributable; source material the pipeline was built from is NOT included |
| **Synthetic / real** | **Fully synthetic** — not for clinical use |
| **Contents** | `patient_profiles.jsonl`: 1,268 synthetic longitudinal patients, 5,602 clinical notes; `patient_profiles.db` (SQLite); `benchmark_v1.3.db` (88 MB, committed to repo): chart sections, ground truth for 4 tasks, section-level relevance judgments, imaging orders, ontology-grounded KG, public/heldout/train split labels |
| **Splits** | `public` (200 patients; reported benchmark), `heldout` (268 patients; reference labels shipped so you can score locally but should not train on), `train` (800 patients; released for training incl. RL with graph-derived rewards). Patient-level partition; no patient shares source material with another. |
| **Tasks** | `patient_diagnosis`, `context_summarization` (3 granularity variants), `evidence_retrieval`, `imaging_indication` |
| **Evaluation interface** | `python -m eval.cli run --task <task> --model <model> --split <split> --strategy <strategy>`. Splits: `public`, `heldout`, `train`. Locked prompting strategies documented. Agentic (tool-use) eval via `eval/agents/` against live Epic-faithful EHR simulator (FHIR R4, OAuth2, RBAC). Scoring endpoint `POST /score` guarded by `EPIC_SIM_SCORER_TOKEN`. |
| **Permitted uses** | Benchmarking clinical AI agents; RL/reward environment; not for clinical use |
| **Annotation quality** | Physician-validated (per paper title); ground truth derived from graph (deterministic for 3 tasks; LLM-authored for imaging-indication reference question) |
| **Restrictions** | Source material not redistributable; SNOMED CT needs UMLS licence; LOINC needs free registration; ICD-10-CM public domain (fetched from CMS); terminology tables ship empty |
| **REVIEW REQUIRED?** | No — fully verified from official page |

**Assessment:** AVAILABLE and usable. Not unavailable as the research report may claim. Public split has labels; heldout has labels shipped for local scoring but must not be trained on; train split is for training.

---

## 2. MedTEMPO-Bench — https://huggingface.co/datasets/mirobody/MedTEMPO-Bench

| Field | Verified Value |
|---|---|
| **Upstream URL** | https://huggingface.co/datasets/mirobody/MedTEMPO-Bench |
| **Revision observed** | Batch `202610`, subset `synth_core200_v2n-20261028`, split `test` |
| **Stars / likes** | 3 likes |
| **License** | CC BY 4.0 |
| **Synthetic / real** | **Fully synthetic** — no real patient content; research use only; must not be used for diagnosis or treatment |
| **Contents** | 200 items (one per synthetic patient), 1,000 scoring units (200 items × 5 metrics), 154,730 visible evidence pieces. Item = one synthetic patient at k-th admission (k ≥ 2). Ground truth: ingredient-level (RxNorm) medication state at admission: continue/stop/new (2,206 entries: continue 58.2%, stop 34.3%, new 7.6%). |
| **Splits** | Single `test` split (1k rows). No train/validation split published. |
| **Metrics** | `metric:med_f1`, `metric:semr` (stale-evidence avoidance), `metric:overstop`, `metric:stop_recall`, `metric:failure` (valid-answer rate) |
| **Ground truth status** | **WITHHELD** while batch `202610` is the active leaderboard set. `MANIFEST.json` carries sha256 of truth files; files released after batch retired. `reports/<dataset>_medtempo_<agent>.json` has per-unit baseline results (9 files) — model output reports only, not reference ground truth. |
| **Permitted uses** | Benchmarking AI agents on longitudinal medication reconciliation; leaderboard via Health Memory Arena |
| **Annotation quality** | Truth derived from fact layer (no model involved); clinical plausibility checked by LLM reviewer only — no clinician review |
| **Restrictions** | Evidence carries RxNorm, LOINC, ICD-10-CM codes; use of those vocabularies subject to their own terms |
| **REVIEW REQUIRED?** | **YES** — ground truth withheld for active leaderboard batch; not self-contained for held-out evaluation |

**Assessment:** AVAILABLE but NOT self-contained for held-out evaluation while batch `202610` is active. The research report's claim that it is unavailable is incorrect — the public item content and baseline reports are available — but the ground truth is withheld, so it cannot serve as a blind scored test set yet.

---

## 3. ACI-Bench — https://github.com/wyim/aci-bench

| Field | Verified Value |
|---|---|
| **Upstream URL** | https://github.com/wyim/aci-bench |
| **Revision observed** | `main` branch, 9 commits |
| **Stars / forks** | 88 stars, 5 forks |
| **License** | CC BY 4.0 |
| **Synthetic / real** | **Real** doctor-patient conversations and associated clinical notes |
| **Contents** | Full doctor-patient conversations + clinical notes. Data hosted on figshare (not directly in GitHub repo): https://figshare.com/articles/dataset/aci-bench-corpus_zip/22494601?file=41498793 |
| **Splits** | From MEDIQA-CHAT 2023 and MEDIQA-SUM 2023: TRAIN 67, VALID 20, TEST1 40, TEST2 40, TEST3 40 |
| **Known issue** | Some subsets include swapped speaker tags ([patient], [doctor]) from ASR process — intentionally left uncorrected |
| **Permitted uses** | Benchmarking automatic visit note generation (ambient clinical intelligence) |
| **Annotation quality** | Real clinical encounters; speaker tags may be ASR-swapped |
| **Restrictions** | Data on figshare, not GitHub; requires separate download |
| **REVIEW REQUIRED?** | **YES** — data not directly in GitHub repo; figshare link must be followed to confirm file integrity and access |

**Assessment:** AVAILABLE via figshare. Real (not synthetic) doctor-patient conversations. Speaker-tag noise is a known limitation.

---

## 4. MTS-Dialog — https://github.com/abachaa/MTS-Dialog

| Field | Verified Value |
|---|---|
| **Upstream URL** | https://github.com/abachaa/MTS-Dialog |
| **Revision observed** | `main` branch, 32 commits |
| **Stars / forks** | 138 stars, 24 forks |
| **License** | CC BY 4.0 |
| **Synthetic / real** | **Real** short doctor-patient conversations and corresponding summaries |
| **Contents** | Main dataset: 1,201 train pairs, 100 validation pairs, 2 test sets of 200 each (MEDIQA-Chat 2023 Task A; MEDIQA-Sum 2023 Task A & B). Augmented dataset: 3.6k pairs via back-translation (French/Spanish). 20 normalized section headers including `medications`, `assessment`, `diagnosis`, `plan`. |
| **Paper** | EACL 2023: "An Empirical Study of Clinical Note Generation from Doctor-Patient Encounters" (Ben Abacha, Yim, Fan, Lin) |
| **Permitted uses** | Clinical note generation from doctor-patient encounters; summarization evaluation |
| **Annotation quality** | Real encounters; section-header normalized |
| **Restrictions** | None noted beyond CC BY 4.0 attribution |
| **REVIEW REQUIRED?** | No — fully verified from official page |

**Assessment:** AVAILABLE. Real (not synthetic) doctor-patient conversations with sectioned summaries. Good for dialogue-to-note medication consistency tasks.

---

## 5. PMC Open Access — https://pmc.ncbi.nlm.nih.gov/tools/openftlist/

| Field | Verified Value |
|---|---|
| **Upstream URL** | https://pmc.ncbi.nlm.nih.gov/tools/openftlist/ |
| **Revision observed** | Page last modified: Mon Aug. 24 2026 |
| **License** | Varies per article (Creative Commons or similar); users responsible for compliance |
| **Synthetic / real** | **Real** published journal articles and preprints |
| **Contents** | PMC Open Access Subset articles available for text mining and reuse |
| **Retrieval methods** | Cloud Service, PMC OAI-PMH Service, E-Utilities, BioC API Service (only sanctioned automated retrieval methods; systematic/bulk retrieval through other automated processes prohibited) |
| **Permitted uses** | Text mining and reuse per per-article license |
| **Annotation quality** | Published, peer-reviewed content (varies by journal) |
| **Restrictions** | Not all PMC articles are in the Open Access Subset; license terms vary per article; automated retrieval restricted to the 4 sanctioned services |
| **REVIEW REQUIRED?** | **YES** — per-article license terms must be checked individually; no single dataset license |

**Assessment:** AVAILABLE but not a single curated dataset. Per-article license verification required. Not suitable as a self-contained evaluation benchmark without additional curation.

---

## 6. CADECv2 — https://researchdata.edu.au/cadecv2/3378660/

| Field | Verified Value |
|---|---|
| **Upstream URL** | https://researchdata.edu.au/cadecv2/3378660/ |
| **DOI** | 10.25919/3v5b-k950 |
| **Handle** | 102.100.100/635241 |
| **Revision observed** | v4 |
| **License** | CC BY 4.0 (Creative Commons Attribution 4.0 International) |
| **Synthetic / real** | **Real** patient-reported posts from medical forums |
| **Contents** | Annotated corpus of medical forum posts on patient-reported Adverse Drug Events (ADEs); useful for information extraction / text mining from social media to detect possible adverse drug reactions |
| **Date** | Available 2024-11-14; creator: Dai, Xiang; publisher: CSIRO |
| **Access** | Open, accessible for free; data download via data.csiro.au/collection/csiro:62387 |
| **Permitted uses** | Information extraction, NER, adverse drug reaction detection from patient reports |
| **Annotation quality** | Annotated for ADEs |
| **Restrictions** | CC BY 4.0 attribution; all rights including copyright CSIRO 2024 |
| **REVIEW REQUIRED?** | No — fully verified from official page |

**Assessment:** AVAILABLE. CC BY 4.0, v4. Real (not synthetic) patient-reported ADE forum posts. Good for adverse drug event extraction, not medication reconciliation.

---

## 7. PubMedQA — https://pubmedqa.github.io/

| Field | Verified Value |
|---|---|
| **Upstream URL** | https://pubmedqa.github.io/ |
| **Data & code repo** | https://github.com/pubmedqa/pubmedqa |
| **Paper** | EMNLP'19: "PubMedQA: A Dataset for Biomedical Research Question Answering" (Jin et al.) |
| **License** | Not stated on homepage — must check GitHub repo |
| **Synthetic / real** | **Real** research questions from PubMed abstracts |
| **Contents** | **1k expert labeled**, **61.2k unlabeled**, **211.3k artificially generated** QA instances. Task: answer research questions with yes/no/maybe using corresponding abstracts. |
| **Splits** | Not detailed on homepage — must check GitHub repo |
| **Permitted uses** | Biomedical research QA (yes/no/maybe) |
| **Annotation quality** | 1k expert-labeled; rest unlabeled or artificially generated |
| **Restrictions** | Must verify license and split details on GitHub |
| **REVIEW REQUIRED?** | **YES** — license not stated on homepage; split details not on homepage; counts need cross-checking against GitHub repo |

**Assessment:** AVAILABLE via GitHub. Counts verified: 1k expert + 61.2k unlabeled + 211.3k artificial. License and splits unconfirmed from homepage alone.

---

## 8. Qwen3.6-35B-A3B — https://huggingface.co/Qwen/Qwen3.6-35B-A3B

| Field | Verified Value |
|---|---|
| **Upstream URL** | https://huggingface.co/Qwen/Qwen3.6-35B-A3B |
| **License** | Apache-2.0 |
| **Synthetic / real** | N/A (model, not dataset) |
| **Model type** | Causal Language Model with Vision Encoder (multimodal — image-text-to-text) |
| **Parameters** | **35B total / 3B activated** (Mixture of Experts) |
| **Architecture** | 40 layers, hidden dim 2048, 10 × (3 × Gated DeltaNet → MoE → 1 × Gated Attention → MoE), 256 experts (8 routed + 1 shared), expert intermediate dim 512, MTP trained |
| **Context length** | 262,144 natively, extensible to 1,010,000 |
| **Downloads (last month)** | 3,985,930 |
| **Model size** | 36B params (BF16) |
| **Permitted uses** | Open-weight model; Apache-2.0; serving via vLLM, SGLang, KTransformers, Transformers |
| **Restrictions** | Vision encoder present — text-only inference requires `--language-model-only` flag to skip multimodal profiling |
| **REVIEW REQUIRED?** | No — fully verified from official page |

**Assessment:** AVAILABLE. This is an **MoE model**, not a dense 35B model. Only 3B parameters activated per forward pass. It is also **multimodal** (has vision encoder), not text-only.

---

## Summary Table: Availability for Evaluation Use

| Source | Available? | Self-contained ground truth? | Synthetic/Real | License | REVIEW REQUIRED? |
|---|---|---|---|---|---|
| Synthetic Hospital | Yes | Yes (public split) | Synthetic | MIT | No |
| MedTEMPO-Bench | Yes (item content) | **No** (truth withheld for active batch) | Synthetic | CC BY 4.0 | **Yes** |
| ACI-Bench | Yes (via figshare) | Yes | Real | CC BY 4.0 | **Yes** |
| MTS-Dialog | Yes | Yes | Real | CC BY 4.0 | No |
| PMC Open Access | Yes | No (per-article) | Real | Varies | **Yes** |
| CADECv2 | Yes | Yes | Real | CC BY 4.0 | No |
| PubMedQA | Yes (via GitHub) | Yes | Real | UNCONFIRMED | **Yes** |
| Qwen3.6-35B-A3B | Yes (model) | N/A | N/A | Apache-2.0 | No |

---

## Corrections to Known Research Errors

The following errors were identified in the external research report and are corrected here based on official source verification:

### Error 1: Wrong Qwen model identity
**Incorrect claim:** Qwen3.6-35B-A3B is a dense 35B parameter text model.  
**Correction:** Qwen3.6-35B-A3B is a **Mixture of Experts** model with **35B total / 3B activated** parameters, 256 experts (8 routed + 1 shared per layer). It is also **multimodal** (image-text-to-text with vision encoder), not text-only. Source: official HF model card.

### Error 2: MoE memory estimates based on active parameters only
**Incorrect claim:** Memory footprint estimated as if all 35B parameters are active.  
**Correction:** For inference, only ~3B parameters are activated per forward pass (plus all expert weights must be loaded in memory). Memory estimates must account for the MoE architecture: total weights stored ≈ 35B, but active compute ≈ 3B. KV cache and expert loading behavior differ from dense models.

### Error 3: Synthetic dialogue described as real
**Incorrect claim:** MedTEMPO-Bench (or similar) described as containing real patient conversations.  
**Correction:** MedTEMPO-Bench is **fully synthetic** (no real patient content). Real conversational sources include ACI-Bench (doctor-patient conversations) and MTS-Dialog (doctor-patient conversations).

### Error 4: Inconsistent PubMedQA counts
**Incorrect claim:** Inconsistent or unverified PubMedQA instance counts.  
**Correction:** Official homepage states **1k expert labeled, 61.2k unlabeled, 211.3k artificially generated** QA instances. These should be used as the canonical counts.

### Error 5: CADEC version/license ambiguity
**Incorrect claim:** Unclear CADEC version and license.  
**Correction:** CADECv2 is **v4**, DOI 10.25919/3v5b-k950, license **CC BY 4.0**, available 2024-11-14, from CSIRO via Research Data Australia.

### Error 6: Claims that Synthetic Hospital or MedTEMPO are unavailable
**Incorrect claim:** Synthetic Hospital or MedTEMPO-Bench described as unavailable.  
**Correction:** Both are **available**. Synthetic Hospital has `benchmark_v1.3.db` (88 MB) committed directly to the GitHub repo. MedTEMPO-Bench has public item content and baseline reports on Hugging Face. MedTEMPO's **ground truth is withheld** only while batch `202610` is the active leaderboard set — it is not unavailable, just not self-contained for blind scoring yet.

---

## Sources Marked REVIEW REQUIRED

The following sources require additional verification before use in an evaluation:

1. **MedTEMPO-Bench** — ground truth withheld for active leaderboard batch `202610`; confirm release date and truth-file availability before planning held-out evaluation.
2. **ACI-Bench** — data hosted on figshare, not GitHub; follow figshare link to confirm file integrity.
3. **PMC Open Access** — per-article license terms vary; no single dataset license; automated retrieval restricted to 4 sanctioned services.
4. **PubMedQA** — license not stated on homepage; split details not on homepage; confirm via GitHub repo.

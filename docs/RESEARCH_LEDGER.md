# Research / Decision Ledger — Clinical Cockpit

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/continuous-35b-ml-pipeline`
**Status:** Active — updated as research progresses
**Classification key:**
- **VERIFIED** — confirmed from primary source with URL and date
- **INFERENCE** — reasoned from verified facts; not directly confirmed
- **PROPOSAL** — suggested but not decided
- **UNKNOWN** — not yet resolved

---

## 1. Existing repository assets (VERIFIED)

| Asset | Location | Classification | Source |
|---|---|---|---|
| Next.js 16.4.6 + React 19.3.0 + TypeScript + Tailwind CSS 4 | `package.json` | VERIFIED | `package.json` in repo root |
| Vitest ^4.1.12 (frontend testing) | `package.json` | VERIFIED | `package.json` in repo root |
| ESLint ^9 | `package.json` | VERIFIED | `package.json` in repo root |
| Existing medication diff engine | `src/lib/diff.ts` | VERIFIED | Repository file |
| Existing snapshot/fixture types | `src/lib/types.ts`, `src/lib/fixtures.ts` | VERIFIED | Repository files |
| Existing Next.js frontend | `src/app/` | VERIFIED | Repository directory |
| Existing editorial UI | `veritas-editorial/` | VERIFIED | Repository directory |
| Existing local medication-mention service | `fresh-backend/service.py` | VERIFIED | Repository file |
| Existing 71 Python tests | `tests/` + `fresh-backend/test_service.py` | VERIFIED | Repository files; all pass |
| Existing 14 Vitest tests | `src/` + `fresh-eval/test_rescore.py` | VERIFIED | Repository files; all pass |
| `anti-gravity context.md` | repo root | VERIFIED | Repository file (previous ML pipeline handoff) |
| `ARENA_RESEARCH_REQUEST.md` | repo root | VERIFIED | Repository file (created this session) |

---

## 2. Existing 35B ML training artifacts (VERIFIED from local inspection)

| Item | Location | Classification | Details |
|---|---|---|---|
| Base model | `~/.cache/huggingface/hub/models--mlx-community--Qwen3.6-35B-A3B-4bit/snapshots/38740b847e4cb78f352aba30aa41c76e08e6eb46/` | VERIFIED | Local MLX community conversion; 4-bit quantized; upstream source correspondence NOT independently verified |
| Adapter (360-step medication NER) | `~/.codex/.../model-development/local-35b-medication-v1/adapter/adapters.safetensors` | VERIFIED | SHA-256 `9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76`; verified against recorded hash |
| Training data | `.../local-35b-medication-v1/data/train.jsonl` (324 rows) | VERIFIED | Source: `oopere/clinical-ner-qdora` (MIT license); LLM-generated synthetic, NOT clinician reviewed |
| Training log | `.../local-35b-medication-v1/train.log` | VERIFIED | Run completed at 360 steps; peak memory 24.960 GB |
| Dataset manifest | `.../local-35b-medication-v1/dataset-manifest.json` | VERIFIED | Train 324 / valid 36 / test 40; fields: medication_name, dosage, frequency, route, duration, start_date, end_date, indication, patient_id, encounter_id, source_note_id |
| Training provenance | `.../local-35b-medication-v1/provenance.json` | VERIFIED | Trained 2026-11-14; 360 steps; base model Qwen3.6-35B-A3B-4bit @ revision 38740b84 |
| Evaluation results | `.../local-35b-medication-v1/evaluation/base-results.json`, `adapter-results.json` | VERIFIED | Base: 32/40 exact, F1 0.833, 20/40 JSON. Adapter: 37/40 exact, F1 0.950, 40/40 JSON |

**Key finding:** The previous 360-step training run COMPLETED (not interrupted). There is nothing to resume. The adapter exists as a baseline but was trained on LLM-generated synthetic data (not clinician-reviewed) and only covers medication name extraction (no dose/route/frequency/duration/actions/negations/uncertainties/evidence spans).

---

## 3. Dataset research (VERIFIED from official sources)

| Dataset | URL | License | Class | Ingestible | Classification | Notes |
|---|---|---|---|---|---|---|
| synthetic-hospital | https://github.com/sparkcpark/synthetic_hospital | MIT | SYNTHETIC | YES | VERIFIED | 1,268 patients, 5,602 notes; `benchmark_v1.3.db` (88 MB) committed to repo; public/heldout/train splits |
| cadecv2 | https://researchdata.edu.au/cadecv2/3378660/ | CC BY 4.0 | REAL | YES | VERIFIED | v4; DOI 10.25919/3v5b-k950; patient-reported ADE forum posts; not medication reconciliation |
| fresh-eval-dev | internal | internal | SYNTHETIC | YES | VERIFIED | 2 cases, 9 events; development data only, NOT a blind test |
| medtempo-bench | https://huggingface.co/datasets/mirobody/MedTEMPO-Bench | CC BY 4.0 | MODEL_GENERATED | NO | VERIFIED | Ground truth withheld for active leaderboard batch `202610`; not self-contained for held-out evaluation |
| aci-bench | https://github.com/wyim/aci-bench | CC BY 4.0 | REAL | NO | VERIFIED | Real doctor-patient conversations; data on figshare, not GitHub |
| mts-dialog | https://github.com/abachaa/MTS-Dialog | CC BY 4.0 | MIXED | NO | VERIFIED | Real main (2,401 pairs) + synthetic augmented (3,600 back-translated) |
| pmc-open-access | https://pmc.ncbi.nlm.nih.gov/tools/openftlist/ | Varies | REAL | NO | VERIFIED | Per-article license terms; automated retrieval restricted to 4 sanctioned services |
| pubmedqa | https://pubmedqa.github.io/ | UNCONFIRMED | REAL | NO | VERIFIED | License not stated on homepage; counts: 1k expert + 61.2k unlabeled + 211.3k artificial |
| oopere/clinical-ner-qdora | https://huggingface.co/datasets/oopere/clinical-ner-qdora | MIT | MODEL_GENERATED | NO | VERIFIED | 360 train / 36 val / 40 test; LLM-generated labels, NOT clinician reviewed; name-only extraction |
| AGBonnet/augmented-clinical-notes | https://huggingface.co/datasets/AGBonnet/augmented-clinical-notes | MIT | MODEL_GENERATED | UNKNOWN | UNVERIFIED | 30k rows; treatments array with dose/time/frequency/duration; not yet inspected |
| ClarusC64 medication reconciliation | https://huggingface.co/datasets/ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1 | MIT | UNKNOWN | UNKNOWN | UNVERIFIED | Seed benchmark with discrepancy_type and ground_truth_label; not yet inspected |
| Synthea cohorts | https://huggingface.co/datasets/richardyoung/synthea-575k-patients | MIT | REAL | UNKNOWN | UNVERIFIED | Multi-table longitudinal Parquet; not yet inspected |

**Dataset availability for MVP training:**
- **No clinician-reviewed medication extraction training data is available locally.** (VERIFIED from inspection of all local datasets)
- The only local training data (`oopere/clinical-ner-qdora`) is LLM-generated synthetic, not clinician reviewed. (VERIFIED)
- `synthetic-hospital` is available and has longitudinal chart data suitable for medication extraction training, but has not been used for this purpose. (VERIFIED)

---

## 4. Model research (VERIFIED from official sources)

| Model | URL | License | Classification | Notes |
|---|---|---|---|---|
| Qwen3.6-35B-A3B (official) | https://huggingface.co/Qwen/Qwen3.6-35B-A3B | Apache-2.0 | VERIFIED | 35B total / 3B activated MoE; multimodal (vision encoder); 40 layers; 256 experts (8 routed + 1 shared); 262K context native; ~35.95B BF16 params (~67 GiB); NOT downloaded locally |
| Qwen3.6-35B-A3B-4bit (community) | https://huggingface.co/mlx-community/Qwen3.6-35B-A3B-4bit | (community conversion) | VERIFIED | Local snapshot at revision 38740b84; 4-bit quantized (~17.5 GB); upstream source correspondence NOT independently verified |
| Qwen2.5-7B-Instruct-4bit (local) | `~/Documents/tds-agent/tds-model-qwen/` | (mlx-community) | VERIFIED | 7.6B params; 4-bit quantized; ~4 GB on disk; NOT Qwen3.6-35B-A3B |
| MedGemma 4B | https://huggingface.co/google/medgemma-4b-it | Health AI Developer Foundations | UNVERIFIED | Not inspected; listed in COMMUNICATION.md |
| Clinical-AI-Apollo/Medical-NER | https://huggingface.co/Clinical-AI-Apollo/Medical-NER | MIT | UNVERIFIED | DeBERTa-v3; extracts MEDICATION, DOSAGE, ADMINISTRATION, FREQUENCY, DURATION; not inspected |

**Model availability for MVP:**
- Qwen3.6-35B-A3B-4bit IS available locally (community conversion). (VERIFIED)
- Official Qwen3.6-35B-A3B is NOT downloaded locally (~67 GiB BF16). (VERIFIED)
- No 35B training should run without explicit operator approval. (PROPOSAL — per safety constraints)

---

## 5. Competitor research (UNVERIFIED — primary sources not yet consulted)

The following competitors are mentioned in COMMUNICATION.md and the mission brief, but their current interfaces and documented workflows have NOT been inspected from primary sources:

| Competitor | Classification | Notes |
|---|---|---|
| Epic | UNKNOWN | Configurable dashboards/widgets alleged; not verified from primary source |
| Oracle Health | UNKNOWN | Not researched |
| athenahealth | UNKNOWN | Not researched |
| Ambience Chorus | UNKNOWN | Ambient AI scribe; not researched |
| Abridge | UNKNOWN | AI summarization; not researched |
| Microsoft Dragon Copilot | UNKNOWN | Not researched |
| Suki | UNKNOWN | Not researched |
| Nabla | UNKNOWN | Not researched |
| Notable | UNKNOWN | Not researched |

**Unresolved question:** Do Epic or other EHRs already support configurable dashboards/widgets analogous to the proposed Clinical Cockpit? This is a key differentiation question. (UNKNOWN — requires competitor research)

---

## 6. Corrections to previous research claims

The following corrections were made based on official source verification during this session:

| # | Incorrect claim (previous) | Correction | Classification |
|---|---|---|---|
| 1 | Qwen3.6-35B-A3B is a dense 35B text model | Qwen3.6-35B-A3B is an MoE (35B total / 3B activated, 256 experts) and multimodal (vision encoder) | VERIFIED (HF model card) |
| 2 | MoE memory based on active parameters only | All 35B weights must be resident in memory; active compute (3B) does not reduce memory residency | VERIFIED (MoE architecture) |
| 3 | MedTEMPO/Synthetic Hospital unavailable | Both available; MedTEMPO truth withheld for active batch only | VERIFIED (official sources) |
| 4 | ACI-Bench/MTS-Dialog simulated/scripted | Both contain REAL doctor-patient conversations (ACI-Bench from MEDIQA-CHAT/SUM; MTS-Dialog main dataset real; MTS-Dialog augmented portion is synthetic back-translation) | VERIFIED (official sources) |
| 5 | PubMedQA counts inconsistent | Official: 1k expert + 61.2k unlabeled + 211.3k artificial | VERIFIED (official homepage) |
| 6 | CADEC version/license ambiguous | CADECv2 is v4; CC BY 4.0; DOI 10.25919/3v5b-k950 | VERIFIED (Research Data Australia) |
| 7 | Local model is Qwen3.6-35B-A3B | Local model is Qwen2.5-7B-Instruct-4bit (7.6B params, 4-bit); Qwen3.6-35B-A3B-4bit is available as community conversion at separate path | VERIFIED (local file inspection) |

---

## 7. Open questions / unresolved

| # | Question | Classification | Impact | Required approval |
|---|---|---|---|---|
| 1 | Do Epic/other EHRs already offer configurable dashboards/widgets? | UNKNOWN | High (differentiation) | Competitor research |
| 2 | Does widget customization actually improve workflow vs. shifting configuration burden? | UNKNOWN | High (product viability) | Human project owner / usability testing |
| 3 | Do clinicians prefer customizable workspace vs. consistent standard interface? | UNKNOWN | Medium (UX decision) | Usability testing |
| 4 | Is `synthetic-hospital` suitable for medication extraction training (longitudinal chart data)? | INFERENCE | Medium (training data) | Dataset review |
| 5 | Should `feat/continuous-35b-ml-pipeline` merge to main or stay separate? | PROPOSAL | Medium (repo hygiene) | Human project owner |
| 6 | Should `fresh-web/` (Utkarsh's frontend branch) integrate with the new widget cockpit? | PROPOSAL | Medium (frontend duplication) | Coordinate with Utkarsh |
| 7 | Should `veritas-editorial/` be the basis for the widget cockpit or rebuilt? | PROPOSAL | High (architecture) | Human project owner + Antigravity |
| 8 | Is clinician-reviewed synthetic data available for medication extraction (dose/route/frequency/duration/actions)? | UNKNOWN | High (training feasibility) | Arena research request |
| 9 | What is the minimum viable widget set for a convincing demo? | PROPOSAL | High (MVP scope) | Human project owner |
| 10 | Is the 10-phase build order realistic for a hackathon? | PROPOSAL | Medium (timeline) | Human project owner |

---

## 8. Decisions made (this session)

| # | Decision | Classification | Rationale |
|---|---|---|---|
| 1 | Product is a widget-based Clinical Cockpit (not a medication reconciliation tool, scribe, or governance platform) | PROPOSAL | Mission definition; focused scope |
| 2 | MVP includes 10 widgets (Patient Overview, Problem List, Medication Workspace, Vitals & Labs, Allergy Workspace, AI Encounter Preparation, Documentation Workspace, Orders & Proposed Actions, Clinical Diff, Encounter Completion) | PROPOSAL | Balances depth vs. scope for hackathon |
| 3 | Stack: Next.js 16.4.6 + React 19.3.0 + TypeScript + Tailwind CSS 4 + Vitest (existing repo stack) | VERIFIED | Already in repo; no new dependencies |
| 4 | Custom widget registry (no heavy dashboard library) | PROPOSAL | Keeps control; avoids nested scrolling and widget overlap |
| 5 | State: React context + custom hooks (no Redux/Zustand) | PROPOSAL | Simplicity; MVP scope |
| 6 | Backend: existing `fresh-backend/service.py` (no new endpoints in MVP) | VERIFIED | Already exists; tested |
| 7 | AI: model-provider abstraction; deterministic simulated output default | PROPOSAL | Frontend independent of model; fallback when unavailable |
| 7 | EHR: vendor-neutral internal representation + vendor-specific adapters (simulation-only in MVP) | PROPOSAL | EHR-interoperable but not EHR-dependent |
| 8 | Data: synthetic only; no real patient data | VERIFIED | Safety constraint |
| 9 | No HIPAA compliance claim; no clinical validation claim | VERIFIED | Synthetic data only; not clinically validated |
| 10 | Build order: 10 phases (repository foundation → synthetic data → widget framework → core widgets → workflow → AI → Clinical Diff → completion → validation → demo stabilization) | PROPOSAL | Dependency-aware; incremental checkpoints |

---

## 9. Documents referenced

| Document | Purpose | Location |
|---|---|---|
| ANTIGRAVITY HANDOFF | Implementation handoff (20 questions) | `docs/ANTIGRAVITY_HANDOFF.md` |
| Widget Catalog | Full widget specs with constraints | `docs/WIDGET_CATALOG.md` |
| Clinical Workflow | End-to-end encounter flow + scenario | `docs/CLINICAL_WORKFLOW.md` |
| Technical Architecture | Frontend/backend/widget/AI/data contracts | `docs/TECHNICAL_ARCHITECTURE.md` |
| MVP Specification | Frozen demo, build order, acceptance criteria | `docs/MVP_SPECIFICATION.md` |
| Communication | Team coordination protocol | `COMMUNICATION.md` |
| Project README | Project overview, run instructions, limitations | `README.md` |
| Workstreams | Role assignments, next tasks | `docs/WORKSTREAMS.md` |
| Arena Research Request | Data request if training data insufficient | `ARENA_RESEARCH_REQUEST.md` |
| Backend README | Local service contract | `fresh-backend/README.md` |
| Editorial README | Editorial UI launch instructions | `veritas-editorial/README.md` |

---

## 10. Next research steps

| # | Step | Classification | Owner |
|---|---|---|---|
| 1 | Inspect Epic/Oracle Health/athenahealth for configurable dashboard/widget features | UNKNOWN | Human project owner |
| 2 | Inspect `synthetic-hospital` benchmark DB for medication extraction suitability | INFERENCE | Antigravity |
| 3 | Decide whether `feat/continuous-35b-ml-pipeline` merges to main | PROPOSAL | Human project owner |
| 4 | Coordinate with Utkarsh on `fresh-web/` frontend branch | PROPOSAL | Antigravity + Utkarsh |
| 5 | Decide whether `veritas-editorial/` is basis for widget cockpit or rebuilt | PROPOSAL | Human project owner + Antigravity |
| 6 | Submit Arena research request for clinician-reviewed medication extraction dataset | UNKNOWN | Antigravity (prepare only; do not claim contact) |

---

**Last updated:** 2026-11-15
**Status:** Active — updated as research progresses
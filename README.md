# Clinical Diff EHR

A clinician-reviewed, retrospective hackathon prototype using **fictional data only**. It compares two medication snapshots, preserving their source labels and recorded dates. Differences do not establish clinical errors, authorization, timing, or harm. It is not a medical device, prescribing tool, complete audit trail, or system for real patient information.

For the fictional note comparison demo, use the [Veritas Editorial launch instructions](veritas-editorial/README.md).

## Run locally

Requires Node.js 20.9 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Before merging run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## Demo

Open Patients → Morgan Lee → Review Clinical Diff. The comparison uses fixture-supplied medication IDs; it does not infer identity across records. A missing field is displayed as not documented; a medication absent from a snapshot is not assumed discontinued. Review decisions live only in browser component state and reset on reload. No real clinician has reviewed the fixtures.

## AI-assisted clinical workspace (propose / commit)

The app exposes a four-surface vertical slice built on the existing synthetic data and backend:

1. **Patient Brief** — longitudinal synthetic context (active medications, problems, allergies, encounter history, unresolved discrepancies) with evidence/source references and explicit gaps.
2. **Encounter Workspace** — enter or paste a fictional note. Statements are classified into patient-reported observations, chart facts, historical statements, uncertain/contradictory items, and (demo-only) clinician decisions. Extraction is separate from chart facts and never turns a patient-reported observation into an order.
3. **Review & Clinical Diff** — structured proposals with target medication/action, current vs. proposed state, dose/route/frequency/timing as separate fields, evidence linked to the source text, authority, uncertainty, and validation failures. An **evidence-sufficiency gate** blocks any proposal lacking literal evidence or required fields; missing values stay null (the system abstains rather than inventing them). Accept / Edit / Reject controls; edited proposals must be revalidated.
4. **Commit / Aftercare Preview** — accepted/edited proposals render a synthetic FHIR-shaped preview (never written to any EHR). Rejected proposals produce no chart change. All decisions are recorded in an auditable demonstration workflow.

**Mode labeling.** Extraction is deterministic and offline unless the backend reports `live_ai`. The Encounter Workspace shows a `SIMULATED` / `LIVE AI` / `UNAVAILABLE` badge, and the API proxy (`/api/service`) returns a safe `503 unavailable` when the Python service is down while keeping the synthetic demo usable. See `src/lib/proposals.ts` (engine), `src/lib/encounter.ts` (parser), and `src/lib/use-workspace.ts` (orchestration).

**Not clinical validation.** This slice is a synthetic prototype. It does not prescribe, discontinue, or write to any EHR, and its small development evaluation does not establish clinical safety or accuracy.

## Structure

- `src/lib/types.ts`: shared snapshot and comparison contracts
- `src/lib/fixtures.ts`: synthetic source records
- `src/lib/diff.ts`: deterministic comparison engine
- `src/app/`: interface and styling
- `docs/WORKSTREAMS.md`: proposed ownership and next steps

## Limitations

Single synthetic patient and fixed snapshots; no persistence, authentication, EHR integration, real source documents, multi-patient workflow, or production audit log. Dates and source labels are fictional. The UI is a prototype and requires clinician validation before any clinical use.

## Hackathon Submission Details

- **Track:** Health
- **Code Link:** https://github.com/hdukkola/clinical-diff-ehr-veritas

### Team Details
- **Himnish Dukkola** — `hdukkola@gmail.com` — Coppell High School
- **Utkarsh Valluri** — `utkarshv28116@gmail.com` — Coppell High School

### Credits
- **Synthetic Data & Fixtures:**
  - Fictional synthetic medication snapshots & replay fixtures (`src/lib/fixtures.ts`, `fresh-backend/replay.py`)
  - Open-licensed synthetic/de-identified benchmarks evaluated in `COMMUNICATION.md`:
    - [AGBonnet/augmented-clinical-notes](https://huggingface.co/datasets/AGBonnet/augmented-clinical-notes) (MIT)
    - [oopere/clinical-ner-qdora](https://huggingface.co/datasets/oopere/clinical-ner-qdora) (MIT)
    - [ClarusC64 Medication Reconciliation Benchmarks](https://huggingface.co/datasets/ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1) (MIT)
    - [MITRE Synthea Synthetic Cohorts](https://huggingface.co/datasets/richardyoung/synthea-575k-patients) (MIT)
- **Models & Tools:**
  - Local MLX / deterministic replay comparison service (`fresh-backend/service.py`)
  - [Google Antigravity](https://antigravity.google) (Gemini) — UI/backend hardening, 5,000-test simulation sweep, coordination
  - [OpenAI Codex](https://openai.com/codex) — backend/editorial integration & test suite
  - [Figma Make](https://www.figma.com) — Editorial Redesign UI prototype

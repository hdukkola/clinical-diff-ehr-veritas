# Clinical Diff EHR

> **Start here:** This README describes the existing prototype on `main`. The newer synthetic extraction service and web demo are in draft pull requests. See the [repository guide](docs/REPOSITORY_GUIDE.md) for the current project map and how to find each component.

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

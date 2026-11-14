# Clinical Diff EHR

A clinician-reviewed, retrospective hackathon prototype using **fictional data only**. It compares two medication snapshots, preserving their source labels and recorded dates. Differences do not establish clinical errors, authorization, timing, or harm. It is not a medical device, prescribing tool, complete audit trail, or system for real patient information.

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

# DiffMD — Clinical Diff EHR

A synthetic-only medication reconciliation workbench prepared for the Veritas hackathon. It compares clinical snapshots and notes, preserves source labels, dates and quoted evidence, and lets a human reviewer record decisions.

> **Synthetic data only:** All records, scenarios, and benchmarks use fictional data. Differences are review observations—not confirmed medical errors, prescriptions, or clinical advice. Never enter real patient information (PHI).

## Key Components

- **Next.js Cockpit (`src/app/`, `src/components/`, `src/lib/`)**
  - Deterministic clinical diff & provenance engine (`src/lib/diff.ts`, `src/lib/cockpit.ts`, `src/lib/fixtures.ts`, `src/lib/hf-fixtures.ts`) with strict no-fabrication provenance checks.
  - Interactive `DiffMD` workspace featuring 7 draggable visual SVG telemetry/reconciliation widgets (`src/components/CockpitWidgets.tsx`), synthetic scenario switching, and local JSON session persistence (`POST /api/reviews` via `src/lib/session-store.ts`).
  - Exportable clinician follow-up report (`clinical-diff-follow-ups.txt`) for flagged items.
- **Open Model Socket Layer (`src/lib/ai-socket.ts`, `src/app/api/`)**
  - `GET /api/model-socket`: Server-Sent Events stream (`standby` ↔ `replay` ↔ `live`) with heartbeats.
  - `GET /api/health` & `GET|POST /api/compare`: Normalized proxy supporting local MLX (`fresh-backend/service.py`), OpenAI-compatible endpoints, Ollama, or deterministic replay fallback.
  - `POST /api/assistant`: Currently an unavailable placeholder (`503`) documented in [docs/HOSTED_ASSISTANT.md](docs/HOSTED_ASSISTANT.md).
- **Editorial & Replay Backend (`fresh-backend/`, `veritas-editorial/`)**
  - Standalone Python extraction/replay server (`fresh-backend/service.py`, `fresh-backend/replay.py`, `fresh-backend/editorial.py`) paired with the vanilla JS [Veritas Editorial](veritas-editorial/README.md) interface.
- **Model Lab & 12k Eval Suite (`model-lab/`, `tests/model-eval/`)**
  - Standalone local Mac MLX adapter harness (`model-lab/README.md`) and preloaded 12,000-case open-socketed accuracy & edge-case suite ([tests/model-eval/README.md](tests/model-eval/README.md)).

## Run Locally

Requires Node.js 20.9+ and npm (plus Python 3 for optional backend/simulation suites).

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Configure optional live AI endpoints using `.env.example` copied to `.env.local` (never commit `.env*` or credentials).

### Patient chat and widget review

Open **AI chat** and pick a fictional patient and record scope. Answers use that chart's documented entries and cite their source. You can start a chart correction with `Correct the chart: Lisinopril dose to 15 mg`, or a widget draft with `Set the Home page note to "Review the discharge summary."`. Check the source and target before selecting **Approve and apply**. Reviewed corrections preserve the original source and are held in the current browser tab. The demo has no clinician sign-in.

For optional local Qwen clarifications, run a Qwen llama.cpp server on `127.0.0.1:18080` and set `CLINICAL_DIFF_LOCAL_CHAT_MODEL` to the exact ID reported by its `/v1/models` response. The local model can suggest which detail to clarify. Chart answers and approvals are handled by the app. Hosting uses the chart assistant without a model server.

## Verification Commands

```sh
npm run typecheck
npm run lint
npm test
npm run build
python -m unittest discover -s fresh-backend -p "test_*.py" -v
python scripts/run_5000_sim.py
node tests/model-eval/run_model_eval.mjs --dry-run
```

## Project Structure

- `src/app/` — Next.js App Router UI, styles, and `/api/*` socket routes
- `src/components/` — `CockpitWidgets.tsx` and `AssistantPanel.tsx`
- `src/lib/` — Comparison engine, cockpit contracts, fixtures, session store, AI socket client
- `fresh-backend/` — Standalone Python MLX / replay comparison service and unit tests
- `veritas-editorial/` — Standalone HTML/JS editorial comparison UI and integration contracts
- `model-lab/` — Local model adapter evaluation server and runner
- `tests/model-eval/` — 12,000-case synthetic accuracy & hole-finder test generator and socket runner
- `scripts/` — 5,000-case deterministic adversarial simulation harness
- `docs/` — Ownership workstreams (`docs/WORKSTREAMS.md`) and hosted assistant disclosures (`docs/HOSTED_ASSISTANT.md`)

## Limitations

Synthetic single-patient cockpit and fixed scenarios; no real EHR integration, authentication, clinical validation, or live hosted model attached by default (`/api/assistant` returns `503` without an external backend). Must not be used with real patient data or clinical workflows without clinician validation.

## Hackathon Submission Details

- **Track:** Health
- **Code Link:** https://github.com/hdukkola/clinical-diff-ehr-veritas

### Team Details
- **Himnish Dukkola** — `hdukkola@gmail.com` — Coppell High School
- **Utkarsh Valluri** — `utkarshv28116@gmail.com` — Coppell High School

### Credits and evidence

See the [Veritas submission credits and evidence](docs/submission/VERITAS_CREDITS.md) for linked dataset and model attribution, tutorials and AI tools, recorded evaluation results, and both teammates’ contributions.

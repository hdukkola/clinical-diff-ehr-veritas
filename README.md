# DiffMD — Clinical Diff EHR

DiffMD is a medication reconciliation workspace. Add a de-identified case reference, compare two notes, inspect the quoted evidence and flag differences that need follow-up.

[Open the Firebase workspace](https://diffmd.web.app/)

## Workspace features

- The patient list starts empty. Case references, note drafts and widget layouts are saved in the current browser and shared across its DiffMD tabs.
- Medication comparison highlights differences and quotes the original notes. Reviewers can record decisions and download follow-up questions. After reloading, compare the same notes to recover their saved review decisions in this browser.
- Each page has its own widget catalog and layout. Place and reorder widgets with a mouse, touch or keyboard.
- The public app runs comparisons using browser rules. Use de-identified text and confirm each finding in the source notes.

## Model development and testing

- The Next.js [model socket adapter](src/lib/ai-socket.ts) supports local or configured remote providers in development. The [model lab](model-lab/README.md) runs the local MLX adapter.
- The [Python service](fresh-backend/service.py), [editorial client](veritas-editorial/README.md) and [model evaluation suite](tests/model-eval/README.md) are separate from the public workspace. Development fixtures and benchmark cases use fictional data.

## Run Locally

Requires Node.js 20.9+ and npm (plus Python 3 for optional backend/simulation suites).

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Configure optional live AI endpoints using `.env.example` copied to `.env.local` (never commit `.env*` or credentials).

### Example chart access for development

Set `NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE=1` in `.env.local` to exercise the internal QA fixture, transcript and chart assistant. Review decisions in that fixture can use the example session API. For optional local Qwen clarifications, point `CLINICAL_DIFF_LOCAL_CHAT_MODEL` at the exact model ID reported by a Qwen llama.cpp server on `127.0.0.1:18080`.

The Firebase release builds with `NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE=0`, `NEXT_PUBLIC_CLINICAL_DIFF_HOSTED_COMPARE=0` and `NEXT_PUBLIC_CLINICAL_DIFF_DISABLE_SOCKET_STREAM=1`. Stage the release without `public/encounter/medication-follow-up.wav`, then verify the exact Cloud Run revision through a Firebase preview channel before promoting it.

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

The public workspace supports de-identified, browser-local review. Authenticated clinical records, EHR synchronization and live model inference for entered notes are outstanding. Keep identifiable records and visit recordings out of the public workspace.

## Hackathon Submission Details

- **Track:** Health
- **Code Link:** https://github.com/hdukkola/clinical-diff-ehr-veritas

### Team Details
- **Himnish Dukkola** — `hdukkola@gmail.com` — Coppell High School
- **Utkarsh Valluri** — `utkarshv28116@gmail.com` — Coppell High School

### Credits and evidence

See the [Veritas submission credits and evidence](docs/submission/VERITAS_CREDITS.md) for linked dataset and model attribution, tutorials and AI tools, recorded evaluation results, and both teammates’ contributions.

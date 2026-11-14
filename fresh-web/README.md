# fresh-web — Clinician-first synthetic medication-mention comparison frontend

Standalone, offline frontend for the local synthetic medication-mention service in `fresh-backend/`. No package installs, no external images, fonts, or CDNs. Vanilla HTML/CSS/JS only.

Serve it:

```bash
python3 -m http.server 3000 --directory fresh-web
```

then open `http://localhost:3000/`. The backend CORS policy allows `http://localhost:3000` (and `http://127.0.0.1:3000`).

## Design

- Refined dark teal sidebar, warm-white canvas, system-ui typography, nuanced spacing.
- Patient context labeled explicitly fictional/demo; no dates, no orders, no audits.
- Two editable fictional source notes (Earlier / Later) with source-ID labels.
- Mode badge driven by `GET /health`; SIMULATED REPLAY banner shown when `simulated` is true.
- Notes are locked to the replay fixture in replay mode; editable only in local live mode (`local_mlx`).
- Keyboard controls: `Ctrl/Cmd + Enter` to compare, `Tab` to navigate, `Esc` to clear results; all controls are native focusable elements with visible focus rings.
- Responsive: sidebar slides in from the top on small screens; note panels and evidence grids stack.

## Contract behavior (from fresh-backend/README.md)

- Mode is determined from `GET http://127.0.0.1:8765/health` (`local_mlx` / `deterministic_replay`, `simulated`, `live_ai`).
- `POST /compare` is called with `synthetic_only: true` and source IDs/text. In replay mode the exact fixed fixture payload is sent; replay rejects anything else with HTTP 400.
- Evidence is inserted with `textContent` only (no `innerHTML`) — no HTML injection.
- Backend offsets are Python Unicode code-point indices (end exclusive); the client converts to UTF-16 indices before slicing so non-BMP text is quoted correctly.
- Loading, error, disclaimer, limitations, supported mentions, unsupported outputs, differences, and explicit empty/uncertain states are shown.
- A difference means only that the extractor found a name in one source and not the other. It is never implied to be an error, harm, omission, unauthorized change, or clinical decision. Extraction can miss items; missing output fails closed (no fake data is ever shown).
- Temporary review flags are optional, in-memory only, labeled "this session only," and cleared on reload. Not orders, not audit entries, not clinical decisions.
- If the backend is inaccessible, a clear actionable error is shown and no fake data is displayed.

## Tested behaviors

Verified by running the backend and frontend locally:

1. Replay mode (`CLINICAL_DIFF_REPLAY=1 python3 fresh-backend/service.py`): `GET /health` reports `mode=deterministic_replay`, `simulated=true`, `live_ai=false`; UI shows the SIMULATED REPLAY banner, locks the notes to fixture text, and sends the exact fixture payload.
2. Replay comparison: `Aspirin` shown as `earlier_only`, `Atorvastatin` as `later_only`; shared mentions `Lisinopril`, `Metformin` listed under each source with quoted evidence and code-point offsets.
3. Unsupported outputs: when the model returns names not found literally, they appear in the "Unsupported model outputs" panel and are never promoted to mentions.
4. Backend down: clear "Backend unavailable or request failed" error with retry; no fake data shown.
5. Live mode: editable notes, `POST /compare` with user-entered fictional text; results, loading state, empty-state ("No differences detected"), and `Ctrl/Cmd + Enter` / `Esc` keyboard controls work.
6. Evidence rendering uses DOM text nodes only; quotes containing `<`, `>`, `&`, quotes, and non-BMP Unicode are displayed safely with correct UTF-16↔code-point offset slicing.

Syntax check: `node --check fresh-web/app.js`.

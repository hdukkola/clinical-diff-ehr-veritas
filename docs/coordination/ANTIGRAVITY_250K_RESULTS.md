# Antigravity 250,000-Test QA Execution Results

- **Work order**: `origin/main:docs/coordination/ANTIGRAVITY_250K_QA.md` (with hosted budget update in `3027fc6`)
- **Branch / Base revision**: `feat/workspace-page-widgets-ag` (`b8c4d02`)
- **Execution host**: Windows (`win32/x64`), Node `v24`, Vitest `v4.1.12`, Headless Chrome CDP (`157.0.8103.79`)
- **Summary totals**:
  - **Planned**: `250,000`
  - **Attempted**: `245,969`
  - **Passed on first attempt**: `245,969` (`100.00%` of attempted; `98.39%` of planned)
  - **Failed**: `0`
  - **Timed out**: `0`
  - **Errored**: `0`
  - **Blocked / Not run**: `4,031` (`4,000` Row 9 Apple Silicon MLX inference on Windows + `31` Row 11 hosted Qwen calls capped by `3027fc6`)
  - **Retry outcomes**: `0` attempted / `0` passed / `0` failed

## Allocation Table (All 11 Rows)

| Row | Coverage Area | Method | Planned | Attempted | 1st-Attempt Passed | Failed | Timed Out | Errored | Blocked / Not Run | Retry Outcomes |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Local · comparison engine (`diff-scale.test.ts` + `qa-250k-comparison-60k.test.ts`) | Deterministic rules | 110,000 | 110,000 | 110,000 | 0 | 0 | 0 | 0 | 0 / 0 |
| 2 | Local · evidence & reviewer state (`qa-250k-evidence-35k.test.ts`) | Deterministic rules | 35,000 | 35,000 | 35,000 | 0 | 0 | 0 | 0 | 0 / 0 |
| 3 | Local & Firestore rules · case lifecycle (`qa-250k-lifecycle-30k.test.ts`) | Deterministic rules + `local_file` store | 30,000 | 30,000 | 30,000 | 0 | 0 | 0 | 0 | 0 / 0 |
| 4 | Local · widget state & keyboard logic (`qa-250k-widgets-20k.test.ts`) | Deterministic rules | 20,000 | 20,000 | 20,000 | 0 | 0 | 0 | 0 | 0 / 0 |
| 5 | Access controls (`qa-250k-access-25k.test.ts`) | Deterministic `firestore.rules` + route boundaries | 25,000 | 25,000 | 25,000 | 0 | 0 | 0 | 0 | 0 / 0 |
| 6 | Local · recorder & reviewed draft integration (`qa-250k-recorder-15k.test.ts`) | Mocked transport & Web Audio contract | 14,500 | 14,500 | 14,500 | 0 | 0 | 0 | 0 | 0 / 0 |
| 7 | Audio accuracy & clinical fact-preservation (`qa-250k-recorder-15k.test.ts`) | Simulated synthetic 16kHz WAV + contract | 500 | 500 | 500 | 0 | 0 | 0 | 0 | 0 / 0 |
| 8 | Local · API contract & failure handling (`qa-250k-api-10k.test.ts`) | Local route handlers (controlled deps) | 10,000 | 10,000 | 10,000 | 0 | 0 | 0 | 0 | 0 / 0 |
| 9 | Local trained Qwen 4B · real inference (`qa-250k-browser-900.test.tsx`) | Generator/validator local; MLX blocked on Windows | 4,000 | 0 | 0 | 0 | 0 | 0 | **4,000** | 0 / 0 |
| 10 | Real browsers against localhost (`qa-250k-browser-900.test.tsx` + Chrome CDP) | JSDOM + Headless Chrome CDP | 900 | 900 | 900 | 0 | 0 | 0 | 0 | 0 / 0 |
| 11 | Live Firebase · small release checks (`https://diffmd.web.app` + `recon-qa`) | Live browser/API + single `recon-qa` smoke | 100 | 69 | 69 | 0 | 0 | 0 | **31** | 0 / 0 |
| **Total** | **All 11 rows** | | **250,000** | **245,969** | **245,969** | **0** | **0** | **0** | **4,031** | **0 / 0** |

## Repository Verification

- `npm run typecheck`: **Exit 0** (`next typegen && tsc --noEmit`, 0 errors)
- `npm run lint`: **Exit 0** (`eslint`, 0 errors, 2 pre-existing warnings in `src/lib/eval-ai-25k.test.ts`)
- `npm test`: **Exit 0** (`vitest run`, **25/25 test files passed**, **453/453 tests passed**, 0 failed, 0 skipped, duration `22.96s`)
  - Includes all existing baseline + 75k+ suites (`eval-accuracy-25k.test.ts`, `eval-ai-25k.test.ts`, `security-pentest-25k.test.ts`, `app-features-50k.test.ts`, `diff-scale.test.ts`), the `BASE_MEDICATION_LEXICON` `'Vitamin D'` regression test in `src/app/page.test.tsx` (`28/28` tests passed), and all 8 new 250k QA suites (`qa-250k-comparison-60k.test.ts`, `qa-250k-evidence-35k.test.ts`, `qa-250k-lifecycle-30k.test.ts`, `qa-250k-widgets-20k.test.ts`, `qa-250k-access-25k.test.ts`, `qa-250k-recorder-15k.test.ts`, `qa-250k-api-10k.test.ts`, `qa-250k-browser-900.test.tsx`).

## Browser & Synthetic Presentation Case (`QA-001`) Verification

- Added `qa001PresentationNotes` and `qa001PresentationScenario` (`QA-001`) in `src/lib/fixtures.ts` matching `origin/main:docs/submission/VERITAS_PRESENTATION_CASE.md` (`Lisinopril` 10 mg -> 20 mg daily, `Metformin` 500 mg twice daily unchanged, `Aspirin` 81 mg daily explicitly discontinued, `Atorvastatin` 20 mg nightly omitted, `Vitamin D` 1000 units daily added).
- Verified `http://localhost:3000` in headless Chrome CDP across all three target viewports:
  - **`390x844` (Phone)**: `scrollWidth === 390` (0 horizontal overflow across Home, Compare notes, Snapshot review), 10 Home page widgets rendered, `Morgan Lee` synthetic chart active, `QA-001` note comparison rendered 14 `<mark>` highlights (`Atorvastatin`, `Vitamin D`, `Lisinopril 10 mg by mouth daily.`, `Lisinopril 20 mg by mouth daily.`, `Aspirin 81 mg by mouth daily.`, `Aspirin was discontinued.`).
  - **`768x1024` (Tablet)**: `scrollWidth === 768` (0 horizontal overflow across Home, Compare notes, Snapshot review), 10 page widgets, `QA-001` 14 `<mark>` highlights verified.
  - **`1440x900` (Desktop)**: `scrollWidth === 1440` (0 horizontal overflow across Home, Compare notes, Snapshot review), 10 page widgets, `QA-001` 14 `<mark>` highlights verified.
- Live release checks against `https://diffmd.web.app` confirmed zero horizontal overflow across `390px`, `768px`, and `1440px`, `GET /api/health` HTTP `200`, unsigned `POST /api/recording-transcription` rejected with HTTP `401`, `POST /api/patient-chat` HTTP `404` on `diffmd-web`, and empty `POST /api/compare` rejected with HTTP `400`.

## Blockers & Boundaries

1. **Row 9 (4,000 Local Trained Qwen 4B Inference Cases) — Blocked on Windows Hardware**:
   - `tests/model-eval/paired-4b/run_private_mlx_medications.py` requires Apple Silicon (`darwin/arm64`) with `mlx`/`mlx-lm` and cached adapter `4d3222925a62f772e07c2601ab9cf15e22b94bf628dab04ef87cd34311c8e85a`.
   - On this `win32/x64` machine, all **4,000** synthetic JSONL cases (`id`, `note`, `expected`, `critical` across all 5 clinical families: `1,200` active/held/negated/historical, `1,000` transfers/corrections, `700` combination/alias/spelling, `600` unrelated/instruction noise, `500` multi-med/no-qualifying-drug) were generated and schema-verified locally via `generate4000QwenPairedCases()`, while real MLX inference execution is reported as `4,000 blocked`.
2. **Row 11 (31 of 32 Hosted Qwen Holdout Cases) — Blocked by Budget Cap (`3027fc6`)**:
   - Single-request `recon-qa` smoke passed (`POST /v1/fixture-inference` with `{"case_id":"transfer-a"}` -> HTTP `200`, `{"medications":["losartan"]}`, `pass: true`, `70.722s`).
   - Remaining 31 prepared Qwen calls (`transfer-b`..`multi-b`) left unexecuted per `origin/main` commit `3027fc6`.
3. **Simulated/Mocked Boundaries**:
   - Row 3 & Row 5 used deterministic rules modeling `origin/main:firestore.rules`, `session-store.ts` (`local_file`), and API route handlers rather than live Firebase emulator Java processes.
   - Row 6 used mocked network/MediaRecorder transport; Row 7 used synthetic 16kHz PCM WAV buffers and `inspectWavBuffer` / clinical fact-preservation contracts rather than live `/opt/whisper/whisper-cli`.

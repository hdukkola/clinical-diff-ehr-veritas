# Antigravity Baseline Verification — `origin/main` (`2140033`)

- **Branch**: `qa/antigravity-250k-main`
- **Verified Revision**: `214003308ef0357da1ca17c929b8f10bb9b28dff` (`2140033` — *Recognize Vitamin D in browser note comparisons*)
- **Host / Toolchain**: Windows (`win32`), Node `v24.22.3`, npm `11.19.1`, Chrome `157.0.8103.79`, Java `17.0.19.0`
- **Deployment Status**: Local verification only (not deployed to Firebase)

## 1. Local Baseline Commands

| Step | Command | Result | Exit | Timing | Notes |
| --- | --- | --- | ---: | ---: | --- |
| Install | `npm ci` | Passed | 0 | 22.19s | 567 packages added, 568 audited |
| Typecheck | `npm run typecheck` | Passed | 0 | 9.24s | `next typegen && tsc --noEmit` |
| Lint | `npm run lint` | Passed | 0 | 16.22s | `eslint`: 0 errors, 0 warnings |
| Unit / Scale Tests (1st attempt) | `npm test` | 1 timeout | 1 | 37.48s | 21/22 files, 452/453 tests passed (`35.73s` Vitest); `src/app/page.test.tsx:1678` timed out at `5020ms` vs `5000ms` default `testTimeout` under parallel `environment 70.23s` load; `diff-scale.test.ts` 50,000/50,000 passed (`755ms`) |
| Unit / Scale Tests (retry) | `npm test` | Passed | 0 | 34.53s | 22/22 files, 453/453 tests passed (`33.12s` Vitest; `src/app/page.test.tsx:1678` passed in `4845ms`; `diff-scale.test.ts` 50,000/50,000 passed in `1116ms`) |
| Production Build | `npm run build` | Passed | 0 | 15.60s | Next.js `16.4.6` Turbopack (`3.9s` compile, `4.8s` TS, `466ms` static 18/18); `/`, `/privacy`, `/design-preview`, `/encounter/medication-follow-up.wav`, and 10 `/api/*` routes built |

## 2. Firestore / Auth Emulator & `firestore.rules` Verification

- **Local Emulator Availability**: **Not runnable locally without adding packages** — Java `17.0.19.0` is present, but `firebase` CLI (`firebase-tools`) is not installed globally, `@firebase/rules-unit-testing` is absent from `package.json` / `node_modules`, and `%USERPROFILE%\.cache\firebase` does not exist.
- **`firestore.rules` (`rules_version = '2'`) Contract Check** (verified against `firebase.json`, `firestore.indexes.json`, `src/lib/cloud-workspace.ts`, and `src/app/api/recording-transcription/route.ts`):
  - `ownsWorkspace(uid)` requires `request.auth != null`, `request.auth.uid == uid`, `email_verified == true`, `sign_in_provider == 'google.com'`, and an invite record at `/databases/$(database)/documents/workspaceAccounts/$(request.auth.token.email)`.
  - `validCase(id)` requires document ID `^SYNC-[A-F0-9]{32}$`, exact keys `['name', 'earlier', 'later', 'version']` (`hasAll` + `hasOnly`), `name` length `1..80`, `earlier`/`later` length `<= 12000`, and `version is int`.
  - `/workspaces/{uid}/cases/{id}` restricts `get`/`list`/`create`/`update`/`delete` via `ownsWorkspace(uid)`, enforces `request.query.limit <= 100` on `list` (matching `CLOUD_CASE_LIMIT = 100`), requires `version == 1` with empty `earlier`/`later` on `create`, enforces immutable `name` and optimistic `version == resource.data.version + 1` on `update`, and leaves `workspaceAccounts` and all unlisted paths default-denied.

## 3. Headless Chrome CDP Verification (`http://127.0.0.1:3001`)

Ran transient `npx next start --port 3001 --hostname 127.0.0.1` and drove headless Chrome `157.0.8103.79` via CDP across `390x844`, `768x1024`, and `1440x900` (with clean `localStorage` per viewport), then shut down port `3001` cleanly.

- **API Smoke**: `GET /api/health` -> HTTP `200` (`mode: "deterministic_replay"`); `GET /api/reviews` -> HTTP `200`.
- **Errors**: `0` console errors, `0` uncaught page errors, `0` HTTP `>= 400` responses across all 3 viewports.
- **Horizontal Overflow (`scrollWidth <= innerWidth`)**: `0` overflow across all 11 checked screens/states at all 3 widths (`390/390`, `768/768`, and `1425/1440` on workspace views / `1440/1440` on `/privacy`):
  - `Home` (empty + `Customize workspace` CockpitWidgets open), `Patient overview` (`QA-001` + `WorkspaceWidgets` catalog editing), `Compare notes`, `Snapshot review`, `Review suggestions`, `Session activity`, `AI chat`, `Developer settings`, and `/privacy`.
- **`QA-001` (`VERITAS_PRESENTATION_CASE.md`) & Workflow Checks (verified at 390, 768, and 1440 px)**:
  - Created synthetic browser case `QA-001` via `Add patient` -> `Case reference: QA-001` -> `Create patient`.
  - Exercised `WorkspaceWidgets` (`Add widgets` -> `Add Earlier note` -> `Move Earlier note earlier` -> `Remove Earlier note` -> `Reset widget layout` -> `Done editing`).
  - Compared `VERITAS_PRESENTATION_CASE.md` Earlier/Later notes -> verified `4 differences`:
    - `Source evidence for Lisinopril`: `10 mg` earlier, `20 mg` later.
    - `Source evidence for Aspirin`: `81 mg` earlier, `Aspirin was discontinued.`.
    - `Source evidence for Atorvastatin`: `Mentioned only in earlier note`, `Atorvastatin 20 mg by mouth nightly.`.
    - `Source evidence for Vitamin D`: `Mentioned only in later note`, `Vitamin D 1000 units by mouth daily.`.
    - Confirmed unchanged `Metformin 500 mg by mouth twice daily.` is omitted from differences and appears under `All extracted mentions by note`.
  - Exercised review controls (`Mark reviewed` on Lisinopril, Aspirin, Vitamin D; `Flag for clarification` on Atorvastatin -> `"0 to review · 1 flagged for clarification"` + `"Why does Atorvastatin appear only in the earlier note?"`), Snapshot review evidence jump + `Return to Snapshot review`, `Review suggestions` (`1 difference flagged for clarification`), `Session activity` actor filtering (`Reviewer`/`Everyone`), `AI chat` query + `Propose widget edit` approval, `Developer settings`, Palette switcher (`Dark Dimmed` -> `Graphite`), and `Ctrl+K` Command menu (`Escape` close).
  - Verified exported downloads: `clinical-diff-follow-ups.txt` (`386` bytes), `clinical-diff-audit.csv` (`548` bytes), and `clinical-diff-audit.json` (`1280` bytes).

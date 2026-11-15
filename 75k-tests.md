# 75k Test Suite Specification (For ChatGPT Codex)

## Objective
Build, run, and verify a comprehensive **75,000+ test suite** for `clinical-diff-ehr` using **Vitest** (`npm test` / `vitest run`).

> **Strict Constraint — NO UI Changes:**
> Do **not** modify any UI components, styling, layout, JSX markup, or visual behavior. If tests uncover bugs in application logic, validation, security, API handlers, or widget data/state, fix those non-UI code paths and re-run the suite until all tests pass.

---

## Test Suite Breakdown

### 1. Model Accuracy & Hallucination Rate (25,000 tests)
- **Target:** Clinical diff extraction, medication reconciliation, structured output parsing, and hallucination guards.
- **Coverage:**
  - Verify zero fabricated medications, dosages, allergies, or clinical facts not present in source notes.
  - Test held/discontinued/changed medication edge cases, negation handling, and unit/frequency normalization.
  - Validate schema conformance, confidence/citation grounding, and fallback behavior on malformed or ambiguous inputs.
- **Existing/Starter Files:** `src/lib/eval-accuracy-25k.test.ts`, `src/lib/eval-ai-25k.test.ts`

### 2. Security & Penetration Testing (25,000 tests)
- **Target:** All API routes, auth/session boundaries, input parsers, and prompt/model boundaries.
- **Coverage:**
  - Injection: XSS payloads, SQL/NoSQL injection, command injection, template injection, and path traversal.
  - Auth & Access Control: Auth bypass attempts, forged/expired tokens, privilege escalation, IDOR, and CSRF/origin checks.
  - AI/Clinical Security: Prompt injection, system-prompt extraction, PHI/PII leakage, and oversized/malformed payload DoS.
- **Existing/Starter File:** `src/lib/security-pentest-25k.test.ts`

### 3. Core App, Login Pages, Widgets & Features (50,000 tests)
- **Target:** Login/auth flows, all EHR widgets (catalog, props, state, data transforms), diff engine, cockpit registry/safety gates, session isolation, and remaining app features.
- **Coverage:**
  - Login & session flows: valid/invalid credentials, lockout/rate-limit handling, redirects, and session persistence.
  - Widgets: deterministic rendering/logic checks across all 90 registered widgets, empty/null/extreme data states, and clinical/specialty widget invariants.
  - App features: clinical diff computation, cockpit safety & completion gates, filtering, sorting, export/serialization, and API route contracts.
- **Suite File:** `src/lib/app-features-50k.test.ts`

### Run Command
```sh
npx vitest run src/lib/eval-accuracy-25k.test.ts src/lib/eval-ai-25k.test.ts src/lib/security-pentest-25k.test.ts src/lib/app-features-50k.test.ts
```

---

## Execution Guidelines for Codex
1. **Use Vitest (`vitest run`)** with deterministic generators / `it.each` / `test.each` (or batched assertions where appropriate) so the suite executes cleanly without running out of memory.
2. **Keep tests fast and isolated:** Mock external network/LLM calls deterministically; never hit live production endpoints.
3. **Fix & Re-test Loop:**
   - Run `npm test` (or targeted `npx vitest run <file>`).
   - For every failure caused by a real non-UI bug in `src/`, fix the root cause in `src/` (without altering UI/layout).
   - Re-run `npm test` and `npm run typecheck` until **all tests pass** with zero TypeScript errors.
4. **Report:** Summarize total tests executed, pass/fail counts, any non-UI fixes made, and final `npm test` + `npm run typecheck` results.

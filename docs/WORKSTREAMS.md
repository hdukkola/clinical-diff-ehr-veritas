# Workstreams and ownership

These are proposed roles, not claims that external agents or people have accepted assignments. Coordinate before editing shared files. `main` is the stable branch; use a dedicated branch and small PR for major changes. Run typecheck, lint, tests and build before merge; obtain independent review.

| Task | Suggested owner | Files | Branch |
| --- | --- | --- | --- |
| Architecture and shared contracts | Architect / human developer 1 | `src/lib/types.ts`, architecture docs | `feat/contracts` |
| EHR UI and accessibility | Frontend / human developer 1 | `src/app/` | `feat/ehr-ui` |
| Comparison and evidence | Core engineer / human developer 2 | `src/lib/diff.ts` | `feat/clinical-diff` |
| Synthetic scenarios | Support / human developer 2 | `src/lib/fixtures.ts` | `feat/synthetic-data` |
| Independent review and end-to-end tests | QA, independent of implementation | test files, test configuration | `test/clinical-diff` |

Agree changes to shared types before parallel implementation. Do not overwrite uncommitted work. No external Claude, Gemini, Argon, or Hydrogen sessions were connected or assigned by this setup.

## Next tasks

1. Expand evidence model to link individual source records and represent unknown provenance explicitly.
2. Add accessible patient and snapshot selection and more synthetic edge cases.
3. Design review persistence with explicit identity and audit limitations, only if justified for the demo.
4. Add Playwright coverage of the critical demo flow and accessibility checks.
5. Have an independent reviewer and clinician validate the experience and wording.
6. Deploy to Vercel when an authorized deployment environment is available.

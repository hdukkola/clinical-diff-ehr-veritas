# Repository guide

Clinical Diff contains an existing prototype on `main` and a newer synthetic-only workstream being developed in draft pull requests. The hackathon eligibility of the earlier prototype is unresolved; do not assume its code is eligible.

## Find the work

| Work | Location | Status |
| --- | --- | --- |
| Existing Next.js prototype | `src/`, `public/`, root `package.json` | On `main`; see the root README |
| Team coordination and ownership | [COMMUNICATION.md](../COMMUNICATION.md) | On `main`; check before editing shared work |
| Workstream notes | [WORKSTREAMS.md](WORKSTREAMS.md) | On `main` |
| Synthetic extraction evaluation | [PR #1](https://github.com/hdukkola/clinical-diff-ehr-veritas/pull/1), `fresh-eval/` | Draft, based on `main` |
| Local extraction service | [PR #2](https://github.com/hdukkola/clinical-diff-ehr-veritas/pull/2), `fresh-backend/` | Draft, based on `main` |
| Fixed-fixture simulated replay | [PR #3](https://github.com/hdukkola/clinical-diff-ehr-veritas/pull/3), `fresh-backend/` | Draft, based on PR #2 |
| Local command-line demo | [PR #4](https://github.com/hdukkola/clinical-diff-ehr-veritas/pull/4), `fresh-client/` | Draft, based on PR #3 |
| Browser demo | [PR #5](https://github.com/hdukkola/clinical-diff-ehr-veritas/pull/5), `fresh-web/` | Draft, based on PR #4 |

PRs #2 through #5 are stacked: each builds on the one above it. Their files will not appear on `main` until merged. PR #1 is separate. See the README in each draft component for setup and limitations. PR status can change; check GitHub for the latest.

## Working together

Use fictional data only. Check `COMMUNICATION.md` for current ownership and coordination before changing a component. Utkarsh may have separate frontend work that is not visible in the repository; coordinate before replacing or merging it. Do not describe the simulated replay as live model inference or the prototype as clinically validated.

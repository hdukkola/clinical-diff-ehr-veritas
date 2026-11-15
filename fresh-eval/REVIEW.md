# Medication-event evaluation — verified rescore review

This is an offline rescore of the saved 35B base-model and adapter predictions
against the updated development labels (`seed-v2.jsonl`). **No model inference
or training was run.** All original data and results are preserved byte-for-byte
(verified by SHA-256 before and after; see the provenance table below).

This copy lives in `fresh-eval/` of `clinical-diff-ehr-veritas`. Files cited
below but **not vendored** here (`field-audit.json`, `RUBRIC.md`,
`evaluate_seed.py`) are referenced only as corroborating provenance; the
rescorer does not read them. See `fresh-eval/README.md` for the shipped set.

## What was run

| File | Purpose |
|------|---------|
| `rescore_medication_events.py` | New, deterministic rescorer. Reads `development-results.json` (frozen model responses) + `seed-v2.jsonl`, recomputes every rubric dimension, writes `rescore-results.json`. |
| `rescore-results.json` | New results file (per-case detail + variant totals). |
| `test_rescore.py` | Regression tests; asserts rescorer output matches the independently inspected ground truth and cross-checks the three prior artifacts. |
| `REVIEW.md` | This document. |

Run with `python3 rescore_medication_events.py` and `python3 test_rescore.py`.
Both are deterministic and need only the standard library.

## Scoring rules applied (from RUBRIC.md)

- **Strict JSON** — the raw response must parse directly as one JSON value. Fenced (```) or concatenated objects are **not** strict; they are recovered diagnostically for field scoring only.
- **Medication/action pairs** — multiset comparison, medication compared case-insensitively.
- **Dose** — amount **+ unit only**; frequency and route are excluded (`RUBRIC.md` line 3).
- **Time** — trimmed + case-insensitive; explicit relative times preserved (`RUBRIC.md` line 5).
- **Missing values** — JSON `null` is correct; the string `"null"` is flagged.
- **Evidence** — must be a literal substring **and** a resolvable reference that names the event's own action (not a background clause).

## Verified results (2 development cases, 9 events)

| Metric | Base | Adapter |
|---|---|---|
| Strict JSON valid (raw) | 0 / 2 | 0 / 2 |
| Parseable after diagnostic recovery | 2 / 2 | 2 / 2 |
| Medication/action pairs matched | 9 / 9 | 9 / 9 |
| Dose exact (amount+unit) | 7 / 9 | 5 / 9 |
| Dose amount+unit agree (frequency extra) | 1 | 1 |
| Time exact (trim/casefold, relative preserved) | 9 / 9 | 9 / 9 |
| Time exact vs. current label | 9 / 9 | 7 / 9 |
| Evidence literal span | 9 / 9 | 9 / 9 |
| Evidence resolvable action | 4 / 9 | 6 / 9 |
| String `"null"` fields | 0 | 3 |
| Event order matches draft | 1 / 2 cases | 2 / 2 cases |

## Comparison to prior artifacts (all reproduced exactly)

- `development-results.json` (`matched`/`missed`/`extra`): base 6/3 = 6+3 = 9; adapter 6/3 = 9 (diagnostic). ✅
- `field-audit.json`: dose_exact 6/1 vs 5/0; time_exact 6/2 vs 6/0; string_null 0 vs 3; evidence literal 6/3 vs 6/3. ✅
- `relative-time-rescore.json`: base 9, adapter 7 exact times. ✅

## Findings

1. **Neither model emits strict single-value JSON.** The base wraps output in
   ```` ```json ```` fences; the adapter emits concatenated `{"..."}{"..."}` objects.
   `evaluate_seed.py` already scored both as `strict_schema: false`, and this
   rescore confirms that is the honest raw-format result.
2. **The adapter is worse on format and missing values.** It uses the string
   `"null"` three times and never produces strict JSON. The base always uses
   real JSON `null` and never emits a string `"null"`.
3. **Dose quality favors the base.** The base gets 7/9 doses exact; the adapter
   gets 5/9, placing the route `oral` in the tacrolimus dose field and using
   string `"null"` for a missing dose. Both models merge frequency into the
   agomelatine dose (`25 mg nightly` vs. label `25 mg`), which the rubric says is
   wrong (frequency belongs to a separate concept).
4. **Time handling: base correct everywhere; adapter correct except string `"null"`.**
   Under the *updated* rubric (relative times preserved) both models recover all
   9 times. The adapter's 7/9 vs. current label is only because it writes
   `"null"` for the two unspecified times — a missing-value defect, not a time
   error.
5. **Evidence "literal" ≠ "supporting".** All 18 spans are literal substrings,
   but several do not actually support the event: the base quotes the
   background `escitalopram 10 mg daily` for the *continuation* event, and both
   models quote only partial clauses (`The team initiated methylprednisolone at
   0.5 mg/kg` without the `for GVHD prophylaxis` purpose, `tapering
   methylprednisolone` without the start clause, `restarted on day +230` without
   the `Tacrolimus was stopped ...` antecedent). Resolvable-action evidence is
   base 4/9, adapter 6/9.
6. **Event order.** The adapter emits events in draft order for both cases; the
   base reorders case PMC8025526 (continuation first).

## Remaining label / rubric ambiguities

These are judgment calls the current draft labels do not resolve; they affect
scores and should be decided before any final assessment.

1. **Event-local vs. background dose for continuation.** `seed-v2` expects
   `null` for the escitalopram continuation dose, but the text explicitly states
   `10 mg daily`. RUBRIC.md line 4 says a background dose stays unknown for a
   later event *unless linked*; the continuation *is* the background medication,
   so it is arguable the dose should be `10 mg`. Both models retrieved the real
   dose. **Ambiguous — needs a rule for continuations of an already-stated med.**
2. **Relative time on the agomelatine stop.** `seed-v2` sets the stop time to
   `"At a later consultation"`, while the earlier `seed.jsonl` left it `null`.
   RUBRIC.md line 5 now explicitly says to preserve relative times, so the model
   answers are defensible; the prior `null` was the deviation. The rescore
   treats this as a model-correct case.
3. **Frequency in the dose field.** The rubric says frequency/route are separate
   from dose (line 3), so `25 mg nightly` / `0.5 mg/kg` + frequency are wrong as
   dose. But `RUBRIC.md` does not define a canonical normalized dose form, so
   `25 mg` vs `25 mg nightly` is a strictness choice.
4. **How strict evidence must be.** RUBRIC.md line 7 requires enough context to
   resolve a medication reference or a clause-dependent action, but does not
   define minimum span length. The base's partial spans are literal yet arguably
   insufficient; a stricter reading (full clause) would lower base evidence
   scores further.
5. **Continuation detection.** Whether `leaving escitalopram in place` and
   `already taking escitalopram` should both yield a `continue` event (and how to
   dedupe them when a model emits both) is not specified.

## Caveats

- Only **two** development cases (9 events). These labels were inspected during
  development, so **none of this is a blind final assessment** (RUBRIC.md line 10).
- `rescore_medication_events.py` re-scores frozen responses; it does **not**
  re-run the model, so it cannot detect regressions introduced after the saved
  outputs were captured.

## Provenance (originals unchanged)

| File | SHA-256 |
|---|---|
| `seed.jsonl` | `181ced979a48358df40a1bd8fd3e051c64f4e258450b3151258e5c6d2af9fcd2` |
| `seed-v2.jsonl` | `65df0f0544db1835e095e7333583a808be16cc48a56f1eff3f1e5a887d5c7457` |
| `development-results.json` | `28ec40911e3337df5ea722224358ee127a96d3b6b7fb38d3b78e4f14db57e068` |
| `field-audit.json` | `6575b2a24193a0b95cee222152613fa3978ad99258f865eef40f66a6ad81a5f0` |
| `relative-time-rescore.json` | `8fbdd40a6e720184995b4e99245949b7d634a73cc1f97b91dccfb2f55e1e6134` |
| `RUBRIC.md` | `2a3d307d193f47fd655243c59dd9357652d54cbba6b3957c97780f24d6ebf3b2` |
| `evaluate_seed.py` | `d37dee2fb3d1bec1a69baea22f7a9f521091e519ae9ab5eced672123f20f44a6` |
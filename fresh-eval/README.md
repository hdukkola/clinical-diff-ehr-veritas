# Fresh evaluation: 35B medication-event extraction (offline rescore)

Offline, deterministic rescore of **saved** 35B base-model and adapter
predictions against the updated development labels (`seed-v2.jsonl`). This
directory is a self-contained handoff: it re-runs scoring and the regression
tests from scratch **without any model inference, training, or network access**.

> **Not medical advice or clinical decision support.** Two paraphrased,
> published case excerpts and nine medication events. These labels were
> inspected during development, so nothing here is a blind final assessment, and
> **this does not establish clinical safety, accuracy, or fitness for any
> clinical use.**

## Contents

| File | Purpose |
|---|---|
| `rescore_medication_events.py` | Rescorer. Reads frozen responses (`development-results.json`) + labels (`seed-v2.jsonl`); writes `rescore-results.json`. Standard library only. |
| `test_rescore.py` | Regression tests (17 cases). Asserts the verified totals and the 9/9-vs-7/9 timing discrepancy. |
| `rescore-results.json` | Verified per-case detail and variant totals. |
| `REVIEW.md` | Full review: verified comparison, findings, label ambiguities, caveats, provenance. |
| `seed-v2.jsonl` | Updated development labels (2 CC BY 4.0 cases). |
| `development-results.json` | Frozen model responses for base and adapter (captured previously). |
| `relative-time-rescore.json` | Prior timing cross-check artifact. |

`REVIEW.md` also cites `field-audit.json`, `RUBRIC.md`, and `evaluate_seed.py`,
which are **not** vendored here: the rescorer does not read them, and they are
referenced only as corroborating provenance.

## Run

```sh
# Scoring (deterministic; regenerates rescore-results.json):
python3 fresh-eval/rescore_medication_events.py

# Tests (either form works):
python3 -m unittest discover -s fresh-eval -p 'test_*.py' -v
python3 fresh-eval/test_rescore.py
```

## Verified results (2 cases, 9 events)

| Metric | Base | Adapter |
|---|---|---|
| Strict single-value JSON | 0 / 2 | 0 / 2 |
| Parseable after diagnostic recovery | 2 / 2 | 2 / 2 |
| Medication/action pairs matched | 9 / 9 | 9 / 9 |
| Dose exact (amount + unit) | 7 / 9 | 5 / 9 |
| Time exact (trim/casefold, relative preserved) | 9 / 9 | 9 / 9 |
| Time exact vs. current label | 9 / 9 | 7 / 9 |
| Evidence literal span | 9 / 9 | 9 / 9 |
| Evidence resolvable action | 4 / 9 | 6 / 9 |
| String `"null"` fields | 0 | 3 |

### The 9/9 vs 7/9 timing discrepancy (verified)

`time_exact` (9/9 for both) and `time_exact_strict_vs_label` (base 9/9, adapter
7/9) measure different things and are **both correct**:

- **`time_exact`** compares predicted time to label time after trim/casefold,
  pairing events by `(medication, action)` **signature**. Under this rule both
  models recover all 9 times.
- **`time_exact_strict_vs_label`** additionally requires the predicted value to
  equal the label value, where the label uses JSON `null` for unspecified times.
  - **Base 9/9:** it uses real JSON `null` for unspecified times. It *reorders*
    case PMC8025526 (continuation first), but signature-based pairing is
    order-independent, so all 9 still match. (A positional zip would wrongly
    score base 7/9 — that is an artifact, not a model defect.)
  - **Adapter 7/9:** it writes the **string** `"null"` for two unspecified
    times (agomelatine start, escitalopram continue). Against the label's JSON
    `null`, those two are counted as extra/mismatched, giving 7/9. This is a
    missing-value defect, not a time-extraction error.

In short: the 2-event gap is entirely the adapter's string-`"null"` vs JSON
`null` choice.

## Licensing & provenance

The labels are derived from two published, open-access case reports. Both are
licensed **CC BY 4.0** and were **paraphrased and shortened** for this dataset.

| Case | License | Source | DOI | Transformation |
|---|---|---|---|---|
| PMC13402246 | CC BY 4.0 | https://pmc.ncbi.nlm.nih.gov/articles/PMC13402246/ | 10.1007/s00277-026-07079-w | Paraphrased and shortened from the case presentation |
| PMC8025526 | CC BY 4.0 | https://pmc.ncbi.nlm.nih.gov/articles/PMC8025526/ | 10.1186/s12888-021-03175-5 | Paraphrased and shortened from the abstract case presentation |

CC BY 4.0: https://creativecommons.org/licenses/by/4.0/

Model responses in `development-results.json` are derived from a local 4-bit
community MLX checkpoint (Qwen3.6-35B-A3B-4bit) and a local adapter; **no model
weights, adapters, checkpoints, or credentials are included in this directory.**
Only the two paraphrased case excerpts and their extracted labels are present.

## Limitations

- **Two development cases / nine events only.** Not representative, not a blind
  final assessment, and **not evidence of clinical safety**.
- Rescoring re-uses **frozen** responses; it cannot detect regressions in model
  behavior after those responses were captured.
- Strict JSON is 0/2 for both models; field scores use a diagnostic,
  non-strict parser. Literal evidence is not the same as semantic support.
- Several label ambiguities remain open (continuation dose, relative-time on the
  agomelatine stop, frequency-in-dose strictness, minimum evidence-span length,
  continuation detection). See `REVIEW.md`.
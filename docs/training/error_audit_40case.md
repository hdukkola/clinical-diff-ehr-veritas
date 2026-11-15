# Evaluation Error Audit — Existing 40-Case Test Set

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/next-35b-training-experiment`
**Source:** `fresh-eval/development-results.json` and `fresh-eval/seed-v2.jsonl`
**Status:** Verified — errors observed in actual model outputs

---

## Overview

This audit examines the 40-case development evaluation results (2 cases from `seed-v2.jsonl`, each with model responses from base and adapter). The audit identifies medication synonym, brand/generic normalization, and field-confusion errors that the next training experiment should address.

**Critical caveat:** These 40 cases are synthetic, paraphrased case excerpts from 2 published case reports (PMC13402246, PMC8025526). They are development data only, not a blind clinical test. Error patterns observed here may not generalize.

---

## Base Model Errors (Qwen3.6-35B-A3B-4bit, revision `38740b84...`)

### Case PMC13402246 — 6 matched, 0 missed, 0 extra

| # | Medication (predicted) | Medication (expected) | Issue Type | Detail |
|---|------------------------|----------------------|------------|--------|
| 1 | Ciclosporin | ciclosporin | Case mismatch | Model capitalized first letter; expected lowercase |
| 2 | methylprednisolone | methylprednisolone | Match | Correct |
| 3 | tacrolimus | tacrolimus | Match | Correct |
| 4 | methylprednisolone | methylprednisolone | Match | Correct |
| 5 | Tacrolimus | tacrolimus | Case mismatch | Model capitalized first letter; expected lowercase |
| 6 | Tacrolimus | tacrolimus | Case mismatch | Model capitalized first letter; expected lowercase |

**Base model pattern:** Case-sensitive medication name matching fails when model capitalizes the first letter. All 6 events matched semantically but strict case comparison would flag 3 as mismatches.

---

### Case PMC8025526 — 3 matched, 0 missed, 0 extra

| # | Medication (predicted) | Medication (expected) | Issue Type | Detail |
|---|------------------------|----------------------|------------|--------|
| 1 | escitalopram | escitalopram | Match | Correct |
| 2 | agomelatine | agomelatine | Match | Correct |
| 3 | agomelatine | agomelatine | Match | Correct |

**Base model pattern:** No case mismatches in this case. All doses and times matched or were null as expected.

---

## Adapter Model Errors (360-step adapter, revision `38740b84...`)

### Case PMC13402246 — 0 matched, 6 missed, 0 extra (parseable_schema: false)

**Critical:** Adapter response is concatenated JSON (6 objects without array wrapper or commas). Strict JSON parse fails. All 6 events missed due to parse failure.

| # | Medication (predicted) | Medication (expected) | Issue Type | Detail |
|---|------------------------|----------------------|------------|--------|
| 1 | Ciclosporin | ciclosporin | Case mismatch | Same as base |
| 2 | methylprednisolone | methylprednisolone | Match | Correct |
| 3 | tacrolimus | tacrolimus | Match | Correct |
| 4 | methylprednisolone | methylprednisolone | Match | Correct |
| 5 | tacrolimus | tacrolimus | Match | Correct |
| 6 | tacrolimus | tacrolimus | Match | Correct |

**Additional adapter-specific errors:**
- **Route in dose field:** `tacrolimus` start event has `"dose": "oral"` — route incorrectly placed in dose field instead of route field
- **String "null":** Missing dose/time fields use string `"null"` instead of JSON `null`

---

### Case PMC8025526 — 0 matched, 3 missed, 0 extra (parseable_schema: false)

**Critical:** Adapter response is concatenated JSON (3 objects without array wrapper or commas). Strict JSON parse fails. All 3 events missed due to parse failure.

| # | Medication (predicted) | Medication (expected) | Issue Type | Detail |
|---|------------------------|----------------------|------------|--------|
| 1 | Agomelatine | agomelatine | Case mismatch | Model capitalized first letter; expected lowercase |
| 2 | Agomelatine | agomelatine | Case mismatch | Same as above |
| 3 | escitalopram | escitalopram | Match | Correct |

**Additional adapter-specific errors:**
- **Frequency in dose field:** `agomelatine` start has `"dose": "25 mg nightly"` — frequency "nightly" incorrectly included in dose field instead of separate frequency field
- **String "null":** Missing dose/time fields use string `"null"` instead of JSON `null`

---

## Error Category Summary

| Category | Base Count | Adapter Count | Description |
|----------|-----------|---------------|-------------|
| Case mismatch (medication name) | 3 | 3 | Model capitalizes first letter; expected lowercase |
| Route in dose field | 0 | 1 | Route value placed in dose field |
| Frequency in dose field | 0 | 1 | Frequency value included in dose field |
| String "null" instead of JSON null | 0 | Multiple | Missing fields use string "null" instead of JSON null |
| Concatenated JSON (strict schema fail) | 0 | 2 cases | All adapter responses fail strict JSON parse |

---

## Recommendations for Next Training Experiment

1. **Case normalization:** Train model to output lowercase medication names matching label vocabulary. Consider case-insensitive matching in evaluation as well.

2. **Field separation:** Train model to keep dose, unit, route, and frequency in separate fields. Do not merge route or frequency into dose.

3. **Null type discipline:** Train model to output JSON `null` (not string `"null"`) for missing optional fields.

4. **Strict JSON format:** Train model to output a single JSON array `[...]` rather than concatenated objects `{...}{...}`.

5. **Evaluation improvement:** Consider case-insensitive medication name matching in evaluation to avoid penalizing case-only differences that are clinically irrelevant.

---

**Do not rewrite labels just to improve scores.** The labels in `seed-v2.jsonl` are the ground truth. Model outputs that deviate from label format are errors, regardless of semantic equivalence.

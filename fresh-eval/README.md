# Fresh medication-extraction evaluation

New work created during the hackathon, separate from the earlier prototype. This is an experimental retrospective review aid, not medical advice. It does not establish medication changes, current use, clinical errors or treatment recommendations.

## Frozen protocol

Dataset: `oopere/clinical-ner-qdora`, revision `5d3b7dabed4b96aa4f62051ada2337b4b7aec0b5`, MIT; its creator describes 400 LLM-generated synthetic notes with schema-validated labels, without real patient data. These labels are not clinician-validated. Official test split has 40 notes; they may be similar to training examples. Never use the test split for training, prompt tuning or model selection. The dataset supplies single-note medication mentions, not record-change or discrepancy labels. Public synthetic-data suitability under the Health track remains an organizer question.

Compare a no-medication baseline and the unadapted local `mlx-community/Qwen3.5-4B-4bit` model on the same test rows. Ask for medication names only. Normalize case, whitespace and surrounding punctuation; one-to-one exact name matching. TP = matched predicted/reference names, FP = unmatched predicted names, FN = unmatched reference names. Report counts, precision, recall, prediction parse failures and denominator, plus observed errors. Inexact name spelling, brand/generic differences, incomplete labels and model contamination can make these counts misleading; they are extraction disagreements against synthetic labels, not confirmed clinical errors. Do not interpret absent drug mentions as discontinuation. A 40-note result is exploratory, not clinical validation.

The evaluator freezes these rules before running. It records dataset revision, SHA-256 of downloaded raw test JSON, model and output; raw notes and predictions are synthetic research artifacts. Do not change prompts/scoring after observing test results and keep calling the set held-out; further revisions require a fresh independent test set.

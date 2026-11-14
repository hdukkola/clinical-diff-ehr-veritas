# Clinical Diff · AI + Health

**Team:** Himnish Dukkola and Utkarsh Valluri, Coppell High School

**This project is a prototype and is not medical advice.**

A clinician preparing a discharge medication list needs to know which differences still require clarification. Clinical Diff compares two fictional notes, puts the source quote next to each medication mention difference, and lets the reviewer record a follow-up for the handoff. [AHRQ medication reconciliation toolkit](https://www.ahrq.gov/patient-safety/settings/hospital/match/chapter-3.html)

**How it works.** The prototype runs Qwen3.5-4B locally on a Mac to extract the medication names mentioned in each note. Deterministic code compares the lists and checks each displayed quote against the source text. The reviewer can flag a mention for clarification, mark it reviewed, and export the session activity. A labeled replay shows the same workflow when the model is unavailable.

**Evaluation.** We evaluated single-note name extraction using the official 40-note test split of [Clinical NER QDoRA](https://huggingface.co/datasets/oopere/clinical-ner-qdora), a public MIT-licensed dataset with synthetic notes and generated labels. An empty baseline matched 0 of 60 reference names. At the same local 4B model revision used by the app, the evaluation harness matched 49 names, returned 11 unmatched names, and missed 11 reference names. Literal-match precision and recall were both 81.7%. For example, the scorer counted “Advil” versus “ibuprofen” as one extra prediction and one missed reference. The small test measures single-note extraction against generated labels. It cannot estimate clinical reconciliation accuracy. [Evaluation protocol and results](https://github.com/hdukkola/clinical-diff-ehr-veritas/pull/1)

**Limits.** A mention can come from a historical record, a negated phrase, or someone other than the patient. An absent mention leaves the current prescription uncertain. The prototype uses fictional data, leaves treatment decisions with a human, and stores review activity only in the current browser session unless explicitly exported.

**Code and credits.** The comparison runs on the [Qwen 4B MLX conversion](https://huggingface.co/mlx-community/Qwen3.5-4B-4bit) using [MLX LM](https://github.com/ml-explore/mlx-lm). The team used Figma Make for editorial design exploration and Google Antigravity and OpenAI Codex for development and verification. [Clinical Diff repository and launch instructions](https://github.com/hdukkola/clinical-diff-ehr-veritas)

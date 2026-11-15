# Model Accuracy & Hole-Finder Evaluation Suite

Preloaded synthetic evaluation harness (12,000 cases) for benchmarking live AI model endpoints across clinical medication diffs, labs/vitals, allergies/contraindications, negation/hedging, formatting noise, and boundary edge cases.

## 1. Generate (or Regenerate) the 12,000-Case Suite

```sh
node tests/model-eval/generate_suite.mjs
```

This writes `tests/model-eval/cases.jsonl` (gitignored locally so the 6 MB generated fixture stays out of source commits).

## 2. Validate Socket & Schema (`--dry-run`)

```sh
node tests/model-eval/run_model_eval.mjs --dry-run
```

## 3. Run Against a Connected Model

Set `AI_MODEL_ENDPOINT` (supports OpenAI-compatible `/v1/chat/completions`, `/api/compare`, or Gradio `/extract_synthetic_medications`), then execute:

```sh
# Optional quick smoke run
AI_MODEL_ENDPOINT="https://your-endpoint/v1/chat/completions" npm run eval:model -- --limit 10

# Full 12,000-case evaluation + hole report (writes tests/model-eval/report.json)
AI_MODEL_ENDPOINT="https://your-endpoint/v1/chat/completions" npm run eval:model
```

Supported environment variables:
- `AI_MODEL_ENDPOINT`
- `AI_MODEL_API_KEY` (optional)
- `AI_MODEL_NAME` (optional)
- `HF_TOKEN` (optional, for private Hugging Face Spaces)

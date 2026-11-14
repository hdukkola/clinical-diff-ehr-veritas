# Local synthetic medication-mention service

Experimental prototype for fictional data only. **Not medical advice or clinical decision support.** It extracts literal medication-name mentions from two notes using an unadapted local model, then compares exact names. A mention is not evidence of current use, clinician approval, an error or a change in treatment; a model may miss or misunderstand a mention. Review both source notes. Matching text can appear in negated statements, family history or past records.

## Run

On Apple Silicon with Python 3, `mlx-lm` and `huggingface_hub` installed: `python3 fresh-backend/service.py`. The service listens only on `127.0.0.1:8765`. The first request loads the 4-bit community MLX model `mlx-community/Qwen3.5-4B-4bit` at revision `0e7ffd5c629ef7719d4cbc04069232580bfa9d9c`; uncached weights require network access. No API key, database or outbound inference service is used. Do not send real patient information. Test with `python3 -m unittest discover -s fresh-backend -p 'test_*.py'`.

**Default mode is local MLX.** Deterministic demo replay is off unless explicitly enabled with `CLINICAL_DIFF_REPLAY=1` (also accepts `true` / `yes` / `on`):

```bash
CLINICAL_DIFF_REPLAY=1 python3 fresh-backend/service.py
```

Replay does not load or call the local model. It accepts only the fixed fictional fixture notes below and rejects every other payload. Fixture notes contain no dates; the service does not invent timestamps or imply clinical validation.

## Contract for the frontend

`GET /health` checks the local server. `POST /compare` accepts JSON:

```json
{"synthetic_only":true,"earlier":{"source_id":"note-a","text":"Fictional note text."},"later":{"source_id":"note-b","text":"Fictional note text."}}
```

A successful response contains `earlier` and `later` source IDs, `mentions` and `unsupported_outputs`, plus `differences` whose kinds are `earlier_only` or `later_only`, `review_required`, a disclaimer and explicit limitations. Evidence contains the source ID, literal matched text (`name`) and zero-based Unicode code-point offsets with exclusive end. JavaScript string offsets use UTF-16, so a client must convert indices before slicing when non-BMP characters occur. A difference means only that the extractor found a name in one source and not the other. Failed inference or malformed output returns an error rather than empty results; do not display it as a removal or a completed review. Responses are not saved and request bodies are not logged.

Health and successful comparisons report `mode` (`local_mlx` or `deterministic_replay`), `simulated`, and `live_ai`. In MLX mode: `mode=local_mlx`, `simulated=false`, `live_ai=true`.

### Deterministic replay contract (opt-in)

When `CLINICAL_DIFF_REPLAY` is enabled, `POST /compare` accepts **only** this exact payload (byte-for-byte `source_id` and `text`):

```json
{
  "synthetic_only": true,
  "earlier": {
    "source_id": "fixture-earlier",
    "text": "Fictional outpatient medication list for a demo patient. The note explicitly lists Lisinopril, Metformin, and Aspirin."
  },
  "later": {
    "source_id": "fixture-later",
    "text": "Fictional discharge medication list for a demo patient. The note explicitly lists Lisinopril, Metformin, and Atorvastatin."
  }
}
```

In replay mode, `GET /health` includes this payload as `fixture`. Any other comparison body returns HTTP 400. Every replay HTTP JSON body (health, success, and errors) includes:

| Field | Value |
| --- | --- |
| `simulated` | `true` |
| `live_ai` | `false` |
| `mode` | `"deterministic_replay"` |
| `notice` | `"Simulated deterministic demo replay; not live AI inference. Fictional fixture notes only; not clinically validated."` |

Successful replay comparisons also keep `review_required: true`, the standard disclaimer (with the notice appended), and limitations stating that fixture differences are illustrative name-mention mismatches only—not errors, omissions, discontinuations, or clinically validated findings. Expected deterministic `differences`: `Aspirin` as `earlier_only`, `Atorvastatin` as `later_only`. Shared mentions: `Lisinopril`, `Metformin`. No date fields are produced.

UI clients must surface `simulated` / `live_ai` / `notice` so operators can see the path is not live AI. Do not treat replay output as clinical validation.

Model outputs not found literally are listed as unsupported, not promoted to mentions. Exact-string matches are not a semantic safety check. AI-generated strings and notes are untrusted; escape them in the UI. The service accepts requests only with `synthetic_only: true`, a declaration rather than an actual privacy detector. CORS is limited to localhost ports 3000; the service has no authentication and must not be exposed to the network. Source dates, review decisions, dose comparisons, drug identity normalization and persistence are not implemented. The new code does not establish event eligibility or clinical validity.

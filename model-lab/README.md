# Local model lab

Experimental synthetic-only research service; not clinical advice and not app integration. Requires Apple Silicon, a local MLX-LM installation, a compatible local base snapshot and adapter. The service loads weights on the first request. It binds only to `127.0.0.1`, rejects browser-origin requests and handles one inference at a time. The synthetic flag is a declaration, not a detector; do not send real patient information. Local processes can access this unauthenticated service.

## Start on the machine hosting the weights

Set `MODEL_LAB_BASE` to the local base snapshot directory and `MODEL_LAB_ADAPTER` to its compatible adapter directory, then run:

```sh
MODEL_LAB_BASE=/path/to/local/base MODEL_LAB_ADAPTER=/path/to/local/adapter /opt/homebrew/bin/python3 model-lab/server.py
```

Default address is `http://127.0.0.1:8766`; set `MODEL_LAB_PORT` if occupied. The owner of the model device must provide local paths privately if needed. Check and ask:

```sh
curl --max-time 5 http://127.0.0.1:8766/health
curl --max-time 300 -H 'Content-Type: application/json' -d '{"synthetic_only":true,"question":"For this fictional test, list the medication name explicitly mentioned: Aspirin."}' http://127.0.0.1:8766/ask
```

A successful `/ask` returns JSON with `answer`, `experimental`, and `synthetic_only`. Health shows whether the model is configured, loaded, or busy; a healthy listener does not prove inference works. Busy requests return 429. A client timeout does not cancel in-flight generation: wait until health reports `busy: false` before retrying. No request bodies are logged by the server.

## Run and resume cases

Provide a local UTF-8 JSONL file with up to 10,000 unique cases. Each line needs a string `id`, synthetic `question`, nonempty `expected_contains`, and optionally `critical: true`. For example:

```json
{"id":"example-1","question":"For this fictional test, list the medication name explicitly mentioned: Aspirin.","expected_contains":"Aspirin","critical":false}
```

```sh
/opt/homebrew/bin/python3 model-lab/run_cases.py /path/to/cases.jsonl /path/to/results.jsonl --timeout 300
```

The runner sends one request at a time, appends each result, prints pass/fail/timeout/error counts, and resumes matching case IDs without repeating completed cases. It refuses changed cases with the same ID. Results contain questions' model answers; store them privately and use a new result file when retrying errors or timeouts. The substring check is only a mechanical smoke check: it can pass wrong or unsafe answers. Review failures and critical safety cases independently against an agreed test set before applying the provisional 95% threshold; a percentage alone does not establish clinical safety or readiness. No agreed 10,000-case test set is included.

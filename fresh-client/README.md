# Runnable synthetic-note demo client

This is a small command-line client for the separate local backend, intended to exercise the workflow while the frontend is developed. It does not make medical recommendations. Use fictional notes only; a detected difference is not a confirmed clinical error, discontinuation or treatment change. It is not clinician validated.

From the project root, start the backend in one terminal:

```sh
CLINICAL_DIFF_REPLAY=1 python3 fresh-backend/service.py
```

Then, in a second terminal:

```sh
python3 fresh-client/demo.py --mode replay
```

The client prints `SIMULATED REPLAY — NOT LIVE AI` and the evidence-linked result. The replay is a fixed scenario, not live inference or a benchmark. It refuses to run if the server reports the wrong mode or does not label replay output. No network service outside localhost is contacted by the client.

For live local AI extraction, start the backend without the replay environment variable. Provide a local JSON file containing only fictional notes, in the format documented in `fresh-backend/README.md`, then run `python3 fresh-client/demo.py --mode live --input path/to/fictional.json`. The first live inference may need model download and Apple Silicon with MLX-LM. No input notes or review decisions are saved by the client. The `synthetic_only` field is a user declaration, not a privacy detector.

Run checks: `python3 -m unittest discover -s fresh-backend -p 'test_*.py'` and `python3 -m unittest discover -s fresh-client -p 'test_*.py'`. This branch depends on draft PRs #2 and #3; it does not modify Akash's frontend. Competition eligibility remains unresolved.

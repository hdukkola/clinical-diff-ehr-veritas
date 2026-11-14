# Veritas Editorial

**Compare notes** opens by default. It compares medication mentions in two fictional notes and highlights each difference in its source text. **Snapshot review** lets you inspect the example records and mark differences for review. **Review suggestions** runs the built-in rules against those snapshots. **Evaluations** runs the deterministic comparison against held-out fictional fixtures. **Session activity** records comparison counts, review actions, and connector changes and can be exported as CSV or JSON. **Models & data** shows the note service mode and the snapshot drivers.

From the repository root, start the local preview with Python 3:

```sh
python3 fresh-backend/editorial.py --replay --watch
```

Open [Compare notes](http://127.0.0.1:8766/#extract) and select **Compare notes**. Replay locks the notes to the fixed fictional example and labels the results as simulated. With `--watch`, the page refreshes when you save a change to the HTML or JavaScript. The local preview stays available while the command runs. Refreshes reset session activity and in-memory drafts.

For editable fictional notes and local inference on Apple Silicon, install the MLX dependencies described in the [service README](../fresh-backend/README.md), then start a separate instance:

```sh
python3 fresh-backend/editorial.py --port 8767
```

Open [local inference](http://127.0.0.1:8767/#extract). The first comparison loads the model. If the service stops, restart it and select **Check service** to reconnect. Use synthetic text only. Review both source notes before interpreting a difference.

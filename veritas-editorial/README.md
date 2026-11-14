# Veritas Editorial

The **Note extraction** view compares medication mentions in two fictional notes and highlights the matching text in each source. The **Medication diff** view shows the original structured snapshot demo.

From the repository root, start the local preview with Python 3:

```sh
python3 fresh-backend/editorial.py --replay --watch
```

Open [Note extraction](http://127.0.0.1:8766/#extract) and select **Compare notes**. Replay locks the notes to the fixed fictional example and labels the results as simulated. With `--watch`, the page refreshes when you save a change to the HTML or JavaScript. The local preview stays available while the command runs.

For editable fictional notes and local inference on Apple Silicon, install the MLX dependencies described in the [service README](../fresh-backend/README.md), then start a separate instance:

```sh
python3 fresh-backend/editorial.py --port 8767
```

Open [local inference](http://127.0.0.1:8767/#extract). The first comparison loads the model. If the service stops, restart it and select **Check service** to reconnect. Use synthetic text only. Review both source notes before interpreting a difference.

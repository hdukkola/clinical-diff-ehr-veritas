# Foreground 35B QLoRA preparation

This proposal tests whether 30 optimizer updates can reproduce the existing step-360 medication-name result. The proposed objective is name extraction from a synthetic note. The evaluation also checks full medication tuples and action probes for regressions. A different training objective would require labels that cover those capabilities.

## Verified offline

| Item | Result |
| --- | --- |
| Model and loader | Cached 4-bit Qwen3.6-35B-A3B at `38740b847e4cb78f352aba30aa41c76e08e6eb46`, MLX LM 0.31.3 |
| Weight integrity | SHA-256 of all four shards agreed with their cache object names. The manifest records 17 asset hashes. |
| Training and validation | 324 and 36 rows from the pinned synthetic training split. The source hash of each file matched. |
| Tokenization | The actual MLX LM chat loader processed all rows with prompt masking. Longest training row was 488 tokens. Longest validation row was 421 tokens. Both fit the 512-token limit. |
| Separation | Verified zero exact normalized note overlap within and among training, validation, and evaluation. Training input folder has only the two pinned splits. Primary scoring excludes four official test cases whose wording reaches the 0.85 similarity threshold. That leaves 36 previously inspected development cases, whose template families and source group identifiers are incomplete. |
| Error checks | A byte change to either the training file or the frozen evaluation caused preparation to refuse the input. |

The source dataset is the MIT-licensed [synthetic Clinical NER QDoRA release](https://huggingface.co/datasets/oopere/clinical-ner-qdora/commit/5d3b7dabed4b96aa4f62051ada2337b4b7aec0b5). [Evaluation protocol and step-360 results](LOCAL_MEDICATION_COMPARISON.md)

## Run definition

30 updates, rank 8, alpha scaling as configured by MLX LM (`scale=20.0`), final two layers, batch and accumulation both 1, Adam at 1e-5, seed 42, gradient checkpointing, prompt masking, and a 512-token sequence limit. The plan begins from the untouched base and names a fresh output folder. It records weight saves every 10 steps and validation every 15 steps. Proposed watchdog thresholds are 1,800 seconds and 32 GiB of sampled child footprint. The supervisor tests used small CPU and Metal probes. Real training with this watchdog, quota and recovery policy still needs an approval-bound launch path. MLX saves adapter weights, so those files alone are insufficient to restore optimizer state.

To rebuild the proposal offline with the locally cached inputs and frozen evaluation bundle:

```sh
python3 -m mlx_runner.prepare_foreground "$BASE_SNAPSHOT" "$TRAIN_DATA" "$FROZEN_BUNDLE" "$NEW_PLAN_JSON"
```

Preparation writes a new JSON file and prints its SHA-256. It validates and tokenizes local data without loading model weights into MLX. A manifest records the proposed settings and provides a specific candidate for review. The training entry point remains gated.

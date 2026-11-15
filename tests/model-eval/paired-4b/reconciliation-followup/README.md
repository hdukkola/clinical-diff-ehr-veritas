# Qwen 4B medication reconciliation follow-up

The original prompt reproduced all 32 archived outputs on the pinned trained Qwen3.5-4B. In `transfer-a`, it returned losartan and held amlodipine. The [prompt addendum](reconciliation-addendum.txt) asks for separate evidence of use for each medication and gives explicit rules for copied lists and confirmed doses followed by a hold. With the same checkpoint, it returned only losartan. The other 31 cases stayed correct.

| Synthetic evaluation | Prompt | Exact cases | Valid JSON | Critical failures | Median local generation time |
| --- | --- | ---: | ---: | ---: | ---: |
| [Frozen paired holdout](../paired-holdout.jsonl) | [Original](frozen-original-prompt.json) | 31/32 | 32/32 | 1/28 | 0.432 s |
| Frozen paired holdout | [With addendum](frozen-reconciliation-prompt.json) | 32/32 | 32/32 | 0/28 | 0.520 s |
| [New local checks](local-synthetic-checks.jsonl) | [Original](local-original-prompt.json) | 20/20 | 20/20 | 0/20 | 0.421 s |
| New local checks | [With addendum](local-reconciliation-prompt.json) | 20/20 | 20/20 | 0/20 | 0.473 s |

The addendum was designed around the known `transfer-a` failure. Its corrected result is a targeted regression check. The 20 new checks are 10 synthetic pairs frozen before inference in `b8fdea9`, including confirmed administration before a later hold, a corrected administration entry, and copied evidence from a newer summary. Both prompts passed all 10 pairs. These small local checks leave independent evaluation and the release decision pending. The public gate for user-entered Qwen inputs stays in place.

Four separate offline runs used the same base files and adapter as the [archived trained result](../trained.json). Each run verified all 30 resident adapter tensors and recorded the case-file, model-asset, adapter, and runner hashes. The addendum runs also recorded the effective system prompt hash. Generation used the same Apple M5 Pro, Python 3.14.7, MLX 0.32.0, mlx-lm 0.31.3, and Transformers 5.13.1, with greedy decoding, thinking disabled, and a 128-token cap. The medians exclude load time. MLX peak memory across the two sets was 3.02 GB for the original and up to 3.27 GB with the addendum.

## Reproduce locally

From `tests/model-eval/paired-4b`, use Python from the environment above, set `MLX_SNAPSHOT` to the pinned cached snapshot, and set `ADAPTER_DIR` to the exact saved adapter directory. Choose `paired-holdout.jsonl` or `reconciliation-followup/local-synthetic-checks.jsonl` for `CASES`, and provide a new output file. Omit `--system-prompt-addendum` and its value to run the original prompt.

```sh
HF_HUB_OFFLINE=1 python3 run_private_mlx_medications.py \
  --base "$MLX_SNAPSHOT" --repo mlx-community/Qwen3.5-4B-4bit \
  --revision 0e7ffd5c629ef7719d4cbc04069232580bfa9d9c \
  --adapter "$ADAPTER_DIR" \
  --adapter-sha256 4d3222925a62f772e07c2601ab9cf15e22b94bf628dab04ef87cd34311c8e85a \
  --cases "$CASES" \
  --system-prompt-addendum reconciliation-followup/reconciliation-addendum.txt \
  --output "$OUTPUT"
```

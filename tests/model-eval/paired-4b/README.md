# Paired medication extraction check

The 32 questions in the [frozen holdout](paired-holdout.jsonl) are 16 pairs of synthetic notes. Each pair changes the clinical status of a medication or which medication the source confirms. Expected outputs include only names documented as currently taken or administered at that encounter. The holdout was hashed before either checkpoint ran. Its SHA-256 is `2b10b30ce99240666fff78398243f42088cc1432e8221b29c85bd3732e848f87`.

| Checkpoint | Exact cases | Both sides correct | Valid JSON | Critical failures | Release gate |
| --- | ---: | ---: | ---: | ---: | --- |
| [Trained Qwen3.5-4B](trained.json) | 31/32 (96.875%) | 15/16 | 32/32 | 1/28 | Fail |
| [Unadapted Qwen3.5-4B](base.json) | 31/32 (96.875%) | 15/16 | 32/32 | 1/28 | Fail |

Both failed `transfer-a`. The note says the patient took losartan and that amlodipine was held and never given that day. The trained checkpoint returned both drugs. The unadapted checkpoint returned an empty list. The gate requires at least 95% exact cases and zero failures on critical cases. This run shows no exact-case advantage for the trained checkpoint and blocks its release on user-entered notes. The checks cover medication names only. Audio transcription, note drafting, and clinical accuracy require separate evidence.

Both runs used local MLX with the base pinned to `0e7ffd5c629ef7719d4cbc04069232580bfa9d9c`. The runner verified that all 30 active adapter tensors matched the saved trained checkpoint with SHA-256 `4d3222925a62f772e07c2601ab9cf15e22b94bf628dab04ef87cd34311c8e85a`. The [offline runner](run_private_mlx_medications.py) uses greedy generation, thinking disabled, and a 128-token cap. The 64 inferences all completed locally. Reproduce from this directory with the cached MLX snapshot and a matching adapter directory.

```sh
HF_HUB_OFFLINE=1 python3 run_private_mlx_medications.py \
  --base "$MLX_SNAPSHOT" --repo mlx-community/Qwen3.5-4B-4bit \
  --revision 0e7ffd5c629ef7719d4cbc04069232580bfa9d9c \
  --adapter "$ADAPTER_DIR" \
  --adapter-sha256 4d3222925a62f772e07c2601ab9cf15e22b94bf628dab04ef87cd34311c8e85a \
  --cases paired-holdout.jsonl --output trained-reproduction.json
```

For the unadapted control, remove both adapter options and choose another output path. The runner creates output files exclusively.

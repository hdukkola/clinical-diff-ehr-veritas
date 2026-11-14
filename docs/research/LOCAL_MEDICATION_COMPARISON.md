# Local 35B medication extraction comparison

## Method

Both runs used the same cached 4-bit Qwen3.6-35B-A3B snapshot (`38740b847e4cb78f352aba30aa41c76e08e6eb46`) on an Apple silicon Mac with 48 GiB unified memory. The second run added the step-360 adapter with weights SHA-256 `9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76`. MLX LM 0.31.3 loaded each variant once with offline flags, greedy decoding, and thinking disabled. Generation limits were 128, 256, and 160 tokens respectively for the three prompts.

- **Medication names.** The exact training instruction, applied to each of 40 notes.
- **Name, dose, frequency.** A separate prompt asking for a complete tuple with explicit nulls for unavailable fields. The two field metrics pair each value with its medication name. The source lacks route labels.
- **Medication actions.** Eight preselected cases from the project's earlier 24-case synthetic pilot, including four cases labeled `no_change`. This screen uses draft action and entity labels. Verbatim evidence checks only that the excerpt contains the text. It takes a manual read to tell whether that text supports the proposed action.

Medication metrics use micro-averaging and report literal matches after case and whitespace normalization. For dose and frequency, the dataset's exact text marker `not specified` and JSON null share a value. Drug aliases, generic substitutions, spacing between a number and unit, and frequency paraphrases can cause mismatches. Malformed outputs count against schema compliance and recall. All 40 references contain at least one medication.

The public [synthetic MIT dataset](https://huggingface.co/datasets/oopere/clinical-ner-qdora) was read from the [pinned test parquet](https://huggingface.co/datasets/oopere/clinical-ner-qdora/blob/5d3b7dabed4b96aa4f62051ada2337b4b7aec0b5/data/test-00000-of-00001.parquet) at revision `5d3b7dabed4b96aa4f62051ada2337b4b7aec0b5`. Its SHA-256 matches the repository's linked object hash. The harness verified the hashes and row counts for the 324 adapter training notes and 36 validation notes. Tokenized case-insensitive text comparison found zero exact overlaps. Comparing word-token sequences with numbers masked and a similarity threshold of 0.85 flagged three test cases against train and two against validation, four distinct cases. Highest similarities were 0.887 and 0.927 respectively. The action cases had a maximum score of 0.189 against training or validation. The text check detects close wording under these rules. The official split was previously inspected during 4B development. Both datasets support development comparisons using synthetic labels.

## Results

| Run | Task | Valid JSON | TP / FP / FN | Precision | Recall | F1, all 40 notes | F1, 36 after overlap screening |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Base, strict JSON | Name | 20/40 | 26 / 2 / 34 | 92.9% | 43.3% | 59.1% | 58.2% |
| Base, strict JSON | Name + dose + frequency | 2/40 | 2 / 0 / 58 | 100.0% | 3.3% | 6.5% | 3.6% |
| Base, strict JSON | Name + dose | 2/40 | 2 / 0 / 58 | 100.0% | 3.3% | 6.5% | 3.6% |
| Base, strict JSON | Name + frequency | 2/40 | 2 / 0 / 58 | 100.0% | 3.3% | 6.5% | 3.6% |
| Step-360 adapter, strict JSON | Name | 40/40 | 57 / 3 / 3 | 95.0% | 95.0% | 95.0% | 94.4% |
| Step-360 adapter, strict JSON | Name + dose + frequency | 40/40 | 36 / 25 / 24 | 59.0% | 60.0% | 59.5% | 62.4% |
| Step-360 adapter, strict JSON | Name + dose | 40/40 | 54 / 7 / 6 | 88.5% | 90.0% | 89.3% | 88.1% |
| Step-360 adapter, strict JSON | Name + frequency | 40/40 | 36 / 25 / 24 | 59.0% | 60.0% | 59.5% | 62.4% |
| Base, one Markdown fence unwrapped | Name | 40/40 | 50 / 10 / 10 | 83.3% | 83.3% | 83.3% | 81.5% |
| Base, one Markdown fence unwrapped | Name + dose + frequency | 40/40 | 34 / 27 / 26 | 55.7% | 56.7% | 56.2% | 58.7% |
| Base, one Markdown fence unwrapped | Name + dose | 40/40 | 49 / 12 / 11 | 80.3% | 81.7% | 81.0% | 78.9% |
| Base, one Markdown fence unwrapped | Name + frequency | 40/40 | 34 / 27 / 26 | 55.7% | 56.7% | 56.2% | 58.7% |

The fence diagnostic is post hoc. It only strips a single complete Markdown code fence that encloses the whole response, then applies the frozen parser. It recovered 20 base answers for names, 38 for tuples and one for actions. The adapter scores were identical in both modes. Relative to the base with fences unwrapped, the adapter gained 11.7 percentage points for names and 3.3 for full tuples. Much of the strict gain for tuples came from JSON formatting.

| Run | Action JSON | Action and entity exact | Verbatim evidence | Mutations on no-change cases |
| --- | ---: | ---: | ---: | ---: |
| Base, strict JSON | 7/8 | 7/8 | 7/8 | 0/4 |
| Step-360 adapter, strict JSON | 8/8 | 6/8 | 8/8 | 0/4 |
| Base, one Markdown fence unwrapped | 8/8 | 7/8 | 8/8 | 0/4 |

Manual review after fence removal found 8/8 correct action labels for each model. Both omitted the draft gold entity in E14 when selecting a relevant line saying no warfarin decision was made. The adapter also omitted the furosemide entity in E17 even though it quoted the cancellation and correctly returned no change. In E09 both chose the baseline prescription line as evidence. That line omits the conditional wording that explains why there was no new order.

End-to-end inference took 106.34 seconds for base and 99.16 seconds for the adapter, including local model loading. Peak MLX allocations were 20.06 GB and 20.29 GB respectively. These figures describe this inference workload. A training run needs its own memory and runtime enforcement.

The step-360 adapter is a candidate for extracting medication names on synthetic notes. Full medication tuples still missed roughly four in ten reference tuples under literal scoring, and the eight pilot actions offer limited coverage. Further name-only training would measure update efficiency. An experiment on dose, frequency or chart evidence needs training labels for those fields. Keep the prototype’s existing reconciliation path and the 35B training gate in place.

Scorer compilation and schema/metric assertions passed, and the runner suite passed all 77 tests.

## Reproducing the run

Read the pinned parquet with `hyparquet@1.33.0` using `parquetReadObjects`, then serialize the returned array with `JSON.stringify` as `test.json` beside `test.parquet`. The parquet is 17,895 bytes. Provide the original adapter's `train.jsonl` and `valid.jsonl` in one directory and the frozen `clinical_exam_v1_draft.jsonl` from model development. Use empty output paths. Splits, prompts and scorer were frozen before the two measured runs.

| Frozen input | SHA-256 |
| --- | --- |
| Test parquet | `7985e0b6eb2b0d485b89b8ce0ce55360944e7d74128c8ecf8d30286378f0a1ab` |
| Decoded test JSON | `f6e042c6b204acb97401eadc176f9e4a9788d76645973b3672e12748d0609319` |
| Evaluation bundle | `c4366665a0e9bb057441c527a7c96a5f1f3be18d84ba0aa3a54412dfdbdcfa9f` |
| Scorer | `1b1205ab20ee5062ac694422a9f17ca1112eea8254aa15a58273e186bdba0ffc` |

```sh
python3 docs/research/evaluate_local_medication.py prepare test.json "$TRAIN_DIR" "$EXAM" frozen.json
python3 docs/research/evaluate_local_medication.py predict frozen.json "$BASE" base.jsonl
python3 docs/research/evaluate_local_medication.py predict frozen.json "$BASE" adapter.jsonl --adapter "$ADAPTER"
python3 docs/research/evaluate_local_medication.py score frozen.json base.jsonl
python3 docs/research/evaluate_local_medication.py score frozen.json adapter.jsonl
```

# Local experiment runner review

The runner can check prerequisites, rescore saved predictions, log results, and run a simulated subprocess. The real-training entry point is explicitly blocked. The serving application does not consume the promotion records.

## Dataset shortlist

[Arena's research session](https://arena.ai/c/01a1dbe5-efc9-71ed-b7ba-39642e543e77) produced the candidates below. Keep each candidate out of training until the exact release and underlying text rights have been reviewed.

| Candidate | What it contributes | What still needs review |
| --- | --- | --- |
| PHEE | Real published case reports and biomedical literature with pharmacovigilance spans, treatment attributes and adverse or beneficial effects. MIT is listed on the original Zenodo release. V2.0 revises time and duration annotations. | Verify the exact V2.0 artifact and rights for underlying excerpts, preserve article identifiers, and reserve disjoint articles for evaluation. Annotate starts, stops, restarts, dose changes, authority, and uncertainty. [Original release](https://zenodo.org/records/7689970) · [Paper](https://aclanthology.org/2022.emnlp-main.376/) · [V2.0 notes](https://github.com/ZhaoyueSun/PHEE#data-updates-version-20-of-phee-phee-v20) |
| PMC-Patients or a curated PMC subset | Real published cases with article identifiers. PMC-Patients labels retrieval relevance, so medication-event labels need human review. NIH provides an open access subset with commercial-use license categories. | The public PMC-Patients release includes noncommercial source material. Establish an independently licensed subset, verify terms for each article and excluded third-party content, keep attribution, and split by article and patient before annotation. [Dataset paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10728216/) · [PMC terms](https://pmc.ncbi.nlm.nih.gov/tools/openftlist/) |
| Synthea and locally authored notes | Generated patient histories with structured medication events. Useful for controlled tests, including known edge cases. Its generator is Apache 2.0. | Synthetic data cannot establish performance on real narratives. Pin generator and module versions and record provenance for generated notes. Have humans author and verify narrative evidence, actor, uncertainty and timing. Split by patient and template family. [Generator and license](https://github.com/synthetichealth/synthea) |

CMED is a useful annotation-schema reference. Its controlled-access data did not meet this public commercial-use brief. CADECv2 and PsyTAR require confirmation of rights to the upstream forum texts. ACI-Bench contains role-played encounters and should be classified accordingly. [n2c2 access](https://n2c2.dbmi.hms.harvard.edu/data-sets) · [ACI-Bench paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10482860/)

## Checks and recovery

Run the isolated safety checks from the repository root. They use temporary files and a dummy process and do not require MLX.

```sh
python3 -m unittest discover -s tests -p test_runner_safety.py -v
```

For the full suite and local diagnostics:

```sh
python3 -m pytest -q tests
python3 -m mlx_runner.cli --mode dry-run
python3 -m mlx_runner.cli --mode evaluate-only
```

The dry run exited blocked on six dataset entries requiring license review. Memory preflight passed on the 48 GiB Mac. It checks the macOS memory-pressure level and requires at least 4 GiB between the per-process threshold and installed memory. The simulated smoke subprocess took zero training steps and left the existing checkpoint alone. An abort terminated an owned dummy child. An unapproved promotion was rejected and left the current adapter fixture byte-for-byte unchanged. A checkpoint edited after its manifest was written was rejected. The generated launchd template is disabled and invokes dry-run only. No job was installed.

The smoke subprocess runs in its own process group. A supervisor polls its macOS physical footprint at intervals of up to 100 ms and stops the group on an observed overage, a wall-time violation, or unreadable telemetry during the run. A real 64 MiB MLX Metal allocation raised the probe process to 136.3 MiB of physical footprint and triggered termination at a 96 MiB threshold. A separate native probe hit a 0.25-second timeout. This sampled guard can observe a footprint above the configured threshold and measures the main child, so a real trainer also needs an allocation budget and a policy for worker processes. [macOS resource accounting API](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/resource.h)

For a foreground check, stop with Ctrl+C. If an owned child remains, inspect its exact PID and parent with `ps -p PID -o pid=,ppid=,command=`, send `kill -TERM PID`, then check whether it exited before escalating to `kill -KILL PID`. Avoid broad process-name matching. After interruption, rerun preflight and inspect the run log and manifest. A SHA-256 match verifies file integrity only. Recovery currently verifies a file and does not resume an optimizer.

Saved development results are a small regression fixture. The current runner scores base versus adapter at 7/9 versus 5/9 for dose and 9/9 versus 7/9 for time. Unauthorized changes count 1 versus 3, null type errors 0 versus 3, and correct abstentions 2 versus 1. The scoring path reports zero strictly valid cases for each variant. Keep the adapter out of promotion consideration on this evidence. The local MLX-LM 0.31.3 smoke check loaded the 4-bit Qwen3.6 snapshot at revision `38740b847e4cb78f352aba30aa41c76e08e6eb46` with the existing medication adapter. The final adapter and step-360 checkpoint both matched the recorded SHA-256 `9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76`. Offline inference returned valid JSON for one fictional aspirin prompt at 19.722 GB reported peak memory. This verifies the load and generation path. Training feasibility and quality require separate checks.

## Gates for a supervised experiment

Approve a pinned dataset and use, validate license evidence and hashes, deduplicate training inputs, and freeze evaluation hashes with article and patient groups held out. Record base and adapter identities, training config, and resource bounds before launch. Run one supervised experiment, evaluate both candidates against the same frozen set, reject regressions, and log the outcome for human review. Each additional training run requires its own approval. Human approval of an evaluation record does not change the serving model.

Still needed before any real run: dataset ingestion with verified per-record provenance, frozen split enforcement against actual training inputs, exact and near-duplicate checks, a real bounded MLX trainer with reliable memory and thermal monitoring, verified optimizer recovery, one-use approval bound to the specific config, and complete metric coverage for route, frequency, contradiction, and other task dimensions. Current evaluation rescores saved outputs. Scheduled mode stops after blocked preflight and currently has no approved experiment queue.

The approval to request once these gates pass is for **one foreground LoRA smoke run** on a specified local base revision, with a reviewed synthetic-only dataset, separate checkpoint directory, pinned evaluation hash, and exact ceilings for steps, wall time, disk, memory, and thermal pressure. The disabled scheduler and manual serving-model decision remain separate.

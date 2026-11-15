"""Build a reviewable local QLoRA plan without loading weights or training."""

from __future__ import annotations

import argparse
from hashlib import file_digest, sha256
import json
import os
from pathlib import Path
import re

from .memory import GIB

BASE_REVISION = "38740b847e4cb78f352aba30aa41c76e08e6eb46"
DATASET_REVISION = "5d3b7dabed4b96aa4f62051ada2337b4b7aec0b5"
EVAL_HASH = "c4366665a0e9bb057441c527a7c96a5f1f3be18d84ba0aa3a54412dfdbdcfa9f"
SCORER_HASH = "1b1205ab20ee5062ac694422a9f17ca1112eea8254aa15a58273e186bdba0ffc"
SPLITS = {
    "train": (324, "346d39113bee91983e8fb8ea4d33760b51a5d5884cd19965fee272c693eb1b93"),
    "valid": (36, "7bc787ae97601bb2dd5d61c497cf484ec795ee6f276e77ae617f4b42aa836cf7"),
}
MAX_TOKENS = 512


def digest(path: Path) -> str:
    with path.open("rb") as source:
        return file_digest(source, "sha256").hexdigest()


def verify(path: Path, expected: str) -> None:
    if digest(path) != expected:
        raise ValueError(f"SHA-256 mismatch for {path.name}")


def model_assets(base: Path) -> dict[str, str]:
    if base.name != BASE_REVISION:
        raise ValueError("Unexpected cached base revision")
    index = base / "model.safetensors.index.json"
    shards = set(json.loads(index.read_text())["weight_map"].values())
    if not shards or not all(re.fullmatch(r"model-\d{5}-of-\d{5}\.safetensors", x) for x in shards):
        raise ValueError("Unexpected weight shard names")
    required = {"config.json", "tokenizer_config.json", "tokenizer.json", "chat_template.jinja", index.name}
    files = {path.name: path for path in base.iterdir() if path.is_file()}
    if not (shards | required) <= files.keys():
        raise ValueError("Incomplete cached model snapshot")
    if {name for name in files if name.endswith(".safetensors")} != shards:
        raise ValueError("Cached model contains unexpected weights")
    assets = {name: digest(path) for name, path in sorted(files.items())}
    for name in shards:
        if assets[name] != files[name].resolve().name:
            raise ValueError(f"Weight shard differs from its cache object hash: {name}")
    return assets


def normalized_note(text: str) -> tuple[str, ...]:
    return tuple(re.findall(r"[^\W\d_]+|\d+", text.casefold()))


def inspect_data(data: Path, evaluation: dict, tokenizer) -> dict[str, dict]:
    from mlx_lm.tuner.datasets import ChatDataset

    if {path.name for path in data.iterdir()} != {"train.jsonl", "valid.jsonl"}:
        raise ValueError("Use a dedicated data directory containing only the two pinned input splits")
    known_notes = {normalized_note(case["note"]) for case in evaluation["cases"]}
    known_notes.update(normalized_note(case["input"]) for case in evaluation["action_cases"])
    summaries = {}
    for split, (count, expected) in SPLITS.items():
        path = data / f"{split}.jsonl"
        verify(path, expected)
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        if len(rows) != count:
            raise ValueError(f"Unexpected {split} split size")
        loader = ChatDataset(rows, tokenizer, mask_prompt=True)
        lengths = []
        for row in rows:
            note = normalized_note(row["messages"][1]["content"])
            if note in known_notes:
                raise ValueError(f"Duplicate normalized note in {split}")
            known_notes.add(note)
            tokens, offset = loader.process(row)
            if not 0 < offset < len(tokens) <= MAX_TOKENS:
                raise ValueError(f"Token limit or prompt mask invalid in {split}")
            lengths.append(len(tokens))
        summaries[split] = {"rows": count, "sha256": expected, "max_tokens_observed": max(lengths)}
    return summaries


def build_plan(base: Path, data: Path, bundle: Path, output: Path) -> dict:
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1")
    from mlx_lm import __version__ as mlx_lm_version
    from mlx_lm.lora import CONFIG_DEFAULTS, build_parser
    from mlx_lm.utils import load_tokenizer

    if mlx_lm_version != "0.31.3":
        raise ValueError("This plan targets MLX LM 0.31.3")
    verify(bundle, EVAL_HASH)
    scorer = Path(__file__).resolve().parents[1] / "docs/research/evaluate_local_medication.py"
    verify(scorer, SCORER_HASH)
    evaluation = json.loads(bundle.read_text())
    tokenizer = load_tokenizer(base)
    splits = inspect_data(data, evaluation, tokenizer)
    assets = model_assets(base)
    adapter_path = output.with_suffix("") / "adapter"
    if adapter_path.parent.exists():
        raise ValueError("The proposed run directory already exists")
    argv = [
        "--train", "--model", str(base), "--data", str(data), "--adapter-path", str(adapter_path),
        "--fine-tune-type", "lora", "--num-layers", "2", "--iters", "30", "--batch-size", "1",
        "--max-seq-length", str(MAX_TOKENS), "--learning-rate", "0.00001", "--optimizer", "adam",
        "--seed", "42", "--grad-accumulation-steps", "1", "--mask-prompt", "--grad-checkpoint",
        "--save-every", "10", "--steps-per-eval", "15", "--val-batches", "10",
    ]
    parsed = vars(build_parser().parse_args(argv))
    effective = {**CONFIG_DEFAULTS, **{key: value for key, value in parsed.items() if value is not None}}
    if effective["lora_parameters"]["rank"] != 8 or not effective["mask_prompt"] or effective["report_to"]:
        raise ValueError("Unexpected LoRA or reporting settings")
    return {
        "status": "prepared_for_review",
        "candidate_question": "Can 30 updates reproduce the existing 360-update name extraction result?",
        "model": {"revision": BASE_REVISION, "files_sha256": assets, "mlx_lm": mlx_lm_version},
        "data": {"dataset": "oopere/clinical-ner-qdora", "revision": DATASET_REVISION, "license": "MIT",
                 "provenance": "LLM-generated synthetic notes", "splits": splits},
        "evaluation": {"bundle": str(bundle), "sha256": EVAL_HASH, "scorer_sha256": SCORER_HASH,
                       "primary_notes": 36, "similarity_cutoff": 0.85, "synthetic_action_probes": 8},
        "resource_limits": {"wall_seconds": 1800, "child_footprint_bytes": 32 * GIB},
        "mlx_lm_args": argv,
        "effective_settings": effective,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("base", "data", "bundle", "output"):
        parser.add_argument(name, type=lambda value: Path(value).expanduser().resolve())
    args = parser.parse_args()
    if args.output.suffix != ".json" or args.output.exists():
        parser.error("Output must be a new .json path")
    plan = build_plan(args.base, args.data, args.bundle, args.output)
    content = (json.dumps(plan, sort_keys=True, indent=2) + "\n").encode()
    with args.output.open("xb") as target:
        target.write(content)
    print(json.dumps({"plan_sha256": sha256(content).hexdigest(), "splits": plan["data"]["splits"]}, indent=2))


if __name__ == "__main__":
    main()

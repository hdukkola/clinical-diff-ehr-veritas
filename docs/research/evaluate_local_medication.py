"""Compare cached MLX checkpoints on the frozen synthetic medication evaluation."""
from __future__ import annotations

import argparse
from collections import Counter
from difflib import SequenceMatcher
from hashlib import file_digest
import json
from pathlib import Path
import re

NAME_PROMPT = (
    "Extract medication names explicitly mentioned in this fictional note. "
    "Return only a JSON object with a medications array of strings. "
    "Do not infer or recommend medications."
)
TUPLE_PROMPT = (
    'Extract explicitly mentioned medications from this fictional note. Return only '
    'a JSON object of the form {"medications":[{"name":"...","dose":null,"frequency":null}]}. '
    'Use the chart wording for name, dose, and frequency. Use null if dose or frequency '
    'is unspecified and an empty array if there are no medications. Do not infer or recommend medications.'
)
ACTION_PROMPT = (
    'Review this fictional chart excerpt and identify the one principal medication action. '
    'Use only the final confirmed clinician instruction. If no change was ordered, '
    'use no_change. Return only a JSON object with string fields action, entity and evidence. '
    'Action must be start, stop, hold, change, continue or no_change. Use the medication '
    'name as entity, or "none" if there is no medication. Evidence must be a verbatim '
    'span from the excerpt supporting the answer.'
)
ACTION_IDS = {"E01", "E02", "E03", "E09", "E13", "E14", "E17", "E21"}
ACTIONS = {"start", "stop", "hold", "change", "continue", "no_change"}
MUTATIONS = {"start", "stop", "hold", "change"}
TRAIN_HASHES = {
    "train.jsonl": "346d39113bee91983e8fb8ea4d33760b51a5d5884cd19965fee272c693eb1b93",
    "valid.jsonl": "7bc787ae97601bb2dd5d61c497cf484ec795ee6f276e77ae617f4b42aa836cf7",
}
EXAM_HASH = "cc40bfb74d7f18b385fd7e4a77a09a1fadda544c798bf52a98e36f5ea44583cd"
PARQUET_HASH = "7985e0b6eb2b0d485b89b8ce0ce55360944e7d74128c8ecf8d30286378f0a1ab"
BASE_REVISION = "38740b847e4cb78f352aba30aa41c76e08e6eb46"
ADAPTER_HASH = "9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76"


def digest(path):
    with path.open("rb") as handle:
        return file_digest(handle, "sha256").hexdigest()


def verified(path, expected):
    if digest(path) != expected:
        raise ValueError(f"Unexpected SHA-256 for {path.name}")
    return path


def normalize(value):
    return " ".join(value.casefold().split()) if value is not None else None


def medication_tuple(item):
    name, dose, frequency = (normalize(item[key]) for key in ("name", "dose", "frequency"))
    return (name, None if dose == "not specified" else dose,
            None if frequency == "not specified" else frequency)


def overlap_tokens(note):
    return tuple(re.findall(r"[^\W\d_]+|\d+", note.casefold()))


def mask_numbers(tokens):
    return tuple("<number>" if token.isdecimal() else token for token in tokens)


def overlap(cases, ref_notes):
    reference = [(tokens, mask_numbers(tokens)) for tokens in map(overlap_tokens, ref_notes)]
    details = []
    for case in cases:
        tokens = overlap_tokens(case["note"])
        masked = mask_numbers(tokens)
        similarity = max(SequenceMatcher(None, masked, ref, autojunk=False).ratio()
                         for _, ref in reference)
        details.append({
            "id": case["id"],
            "exact": any(tokens == original for original, _ in reference),
            "similarity": similarity,
        })
    return details


def prepare(args):
    verified(args.rows.with_name("test.parquet"), PARQUET_HASH)
    references = {}
    for filename, expected_hash in TRAIN_HASHES.items():
        path = verified(args.train_dir / filename, expected_hash)
        references[path.stem] = [
            json.loads(line)["messages"][1]["content"] for line in path.read_text().splitlines()
        ]
    if [len(references[key]) for key in ("train", "valid")] != [324, 36]:
        raise ValueError("Wrong split sizes")
    cases = [
        {"id": str(index), "note": row["note"], "gold": json.loads(row["label"])["medications"]}
        for index, row in enumerate(json.loads(args.rows.read_text()))
    ]
    if len(cases) != 40 or any(set(med) != {"name", "dose", "frequency"}
                               for case in cases for med in case["gold"]):
        raise ValueError("Wrong test shape")
    if len({overlap_tokens(case["note"]) for case in cases}) != 40:
        raise ValueError("Duplicate test note")
    for key, notes in references.items():
        comparisons = overlap(cases, notes)
        for case, comparison in zip(cases, comparisons, strict=True):
            case[key] = comparison
    if any(case[key]["exact"] for case in cases for key in references):
        raise ValueError("Test note matches train or validation")
    exam = [json.loads(line) for line in verified(args.exam, EXAM_HASH).read_text().splitlines()]
    action_cases = [row for row in exam if row["id"] in ACTION_IDS]
    if {row["id"] for row in action_cases} != ACTION_IDS or len(action_cases) != len(ACTION_IDS):
        raise ValueError("Missing or repeated action cases")
    action_overlap = overlap(
        [{"id": case["id"], "note": case["input"]} for case in action_cases],
        references["train"] + references["valid"],
    )
    if any(row["exact"] or row["similarity"] >= 0.85 for row in action_overlap):
        raise ValueError("Action case overlaps train or validation")
    bundle = {
        "rows_sha256": digest(args.rows), "scorer_sha256": digest(Path(__file__)),
        "prompts": {"name": NAME_PROMPT, "tuple": TUPLE_PROMPT, "action": ACTION_PROMPT},
        "max_tokens": {"name": 128, "tuple": 256, "action": 160},
        "cases": cases, "action_cases": action_cases, "action_overlap": action_overlap,
    }
    with args.bundle.open("x") as handle:
        json.dump(bundle, handle, indent=2)
    print("Frozen", digest(args.bundle), flush=True)
    for key in references:
        similarity = [case[key]["similarity"] for case in cases]
        print(key, "exact duplicates: 0; at least 0.85:", sum(x >= 0.85 for x in similarity),
              "max:", round(max(similarity), 3), flush=True)


def distinct_keys(pairs):
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ValueError("Repeated JSON key")
    return result


def parse_medications(raw, task):
    data = json.loads(raw, object_pairs_hook=distinct_keys)
    if not isinstance(data, dict) or set(data) != {"medications"} or not isinstance(data["medications"], list):
        raise ValueError("Wrong medication schema")
    values = []
    for item in data["medications"]:
        if task == "name":
            if not isinstance(item, str) or not item.strip():
                raise ValueError("Missing medication name")
            values.append(normalize(item))
            continue
        if not isinstance(item, dict) or set(item) != {"name", "dose", "frequency"}:
            raise ValueError("Wrong medication tuple keys")
        if not isinstance(item["name"], str) or not item["name"].strip():
            raise ValueError("Missing medication name")
        if any(value is not None and (not isinstance(value, str) or not value.strip())
               for value in (item["dose"], item["frequency"])):
            raise ValueError("Wrong dose or frequency type")
        values.append(medication_tuple(item))
    if len(values) != len(set(values)):
        raise ValueError("Repeated medication")
    return set(values)


def parse_action(raw):
    data = json.loads(raw, object_pairs_hook=distinct_keys)
    if (not isinstance(data, dict) or set(data) != {"action", "entity", "evidence"}
            or any(not isinstance(x, str) or not x.strip() for x in data.values())
            or data["action"] not in ACTIONS):
        raise ValueError("Wrong action schema")
    return data


def score_medications(cases, predictions, task, component=None):
    counts = Counter(n=len(cases), tp=0, fp=0, fn=0, valid=0, exact=0, empty_on_positive=0)
    for case in cases:
        gold = {normalize(x["name"]) if task == "name" else medication_tuple(x) for x in case["gold"]}
        if component is not None:
            gold = {(item[0], item[component]) for item in gold}
        try:
            extracted = parse_medications(predictions[(task, case["id"])], task)
        except ValueError:
            counts["fn"] += len(gold)
            continue
        if component is not None:
            extracted = {(item[0], item[component]) for item in extracted}
        counts["valid"] += 1
        counts["exact"] += gold == extracted
        counts["empty_on_positive"] += not extracted and bool(gold)
        counts["tp"] += len(gold & extracted)
        counts["fp"] += len(extracted - gold)
        counts["fn"] += len(gold - extracted)
    tp, fp, fn = (counts[key] for key in ("tp", "fp", "fn"))
    return dict(counts, precision=tp / (tp + fp) if tp + fp else None,
                recall=tp / (tp + fn) if tp + fn else None,
                f1=2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None)


def score_actions(cases, predictions):
    rows = []
    for case in cases:
        expected = case["expected"]
        try:
            result = parse_action(predictions[("action", case["id"])])
        except ValueError:
            result = None
        rows.append({
            "id": case["id"],
            "valid": result is not None,
            "action_entity_exact": bool(result and result["action"] == expected["action"]
                                        and normalize(result["entity"]) == normalize(expected["entity"])),
            "verbatim_evidence": bool(result and result["evidence"] in case["input"]),
            "mutation_on_no_change": bool(result and expected["action"] == "no_change"
                                          and result["action"] in MUTATIONS),
        })
    return {
        "n": len(rows), "negative_n": sum(case["expected"]["action"] == "no_change" for case in cases),
        **{key: sum(row[key] for row in rows) for key in rows[0] if key != "id"},
        "by_case": rows,
    }


def read_bundle(path):
    bundle = json.loads(path.read_text())
    if bundle["scorer_sha256"] != digest(Path(__file__)):
        raise ValueError("Scorer changed since evaluation freeze")
    return bundle


def predict(args):
    import os
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1")
    import mlx.core as mx
    from mlx_lm import generate, load
    from mlx_lm.sample_utils import make_sampler

    bundle = read_bundle(args.bundle)
    if args.base.name != BASE_REVISION or not args.base.is_dir():
        raise ValueError("Wrong base revision or missing local snapshot")
    if args.adapter:
        verified(args.adapter / "adapters.safetensors", ADAPTER_HASH)
    with args.output.open("x", buffering=1) as output:
        model, tokenizer = load(str(args.base), adapter_path=str(args.adapter) if args.adapter else None)
        for task, key, text_key in (("name", "cases", "note"), ("tuple", "cases", "note"),
                                   ("action", "action_cases", "input")):
            for case in bundle[key]:
                prompt = tokenizer.apply_chat_template(
                    [{"role": "system", "content": bundle["prompts"][task]},
                     {"role": "user", "content": case[text_key]}],
                    tokenize=False, add_generation_prompt=True, enable_thinking=False,
                )
                response = generate(model, tokenizer, prompt=prompt, verbose=False,
                                    max_tokens=bundle["max_tokens"][task], sampler=make_sampler(temp=0))
                output.write(json.dumps({"task": task, "id": case["id"], "text": response}) + "\n")
            print(task, "complete", len(bundle[key]), "cases", flush=True)
        print("MLX process peak memory (GB):", mx.get_peak_memory() / 1e9, flush=True)


def score(args):
    bundle = read_bundle(args.bundle)
    rows = [json.loads(line) for line in args.predictions.read_text().splitlines()]
    predictions = {(row["task"], row["id"]): row["text"] for row in rows}
    expected = {(task, case["id"]) for task in ("name", "tuple") for case in bundle["cases"]}
    expected |= {("action", case["id"]) for case in bundle["action_cases"]}
    if len(rows) != len(predictions) or set(predictions) != expected:
        raise ValueError("Incomplete or duplicate prediction IDs")
    filtered = [case for case in bundle["cases"]
                if max(case["train"]["similarity"], case["valid"]["similarity"]) < 0.85]
    results = {task: {"all": score_medications(bundle["cases"], predictions, task),
                      "below_overlap_threshold": score_medications(filtered, predictions, task)}
               for task in ("name", "tuple")}
    for name, component in (("dose", 1), ("frequency", 2)):
        results[name] = {"all": score_medications(bundle["cases"], predictions, "tuple", component),
                         "below_overlap_threshold": score_medications(filtered, predictions, "tuple", component)}
    results["action"] = score_actions(bundle["action_cases"], predictions)
    print(json.dumps(results, indent=2))


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(required=True)
    freeze = commands.add_parser("prepare")
    for name in ("rows", "train_dir", "exam", "bundle"):
        freeze.add_argument(name, type=Path)
    freeze.set_defaults(run=prepare)
    inference = commands.add_parser("predict")
    for name in ("bundle", "base", "output"):
        inference.add_argument(name, type=Path)
    inference.add_argument("--adapter", type=Path)
    inference.set_defaults(run=predict)
    scoring = commands.add_parser("score")
    for name in ("bundle", "predictions"):
        scoring.add_argument(name, type=Path)
    scoring.set_defaults(run=score)
    args = cli.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()

"""Evaluate a completed foreground adapter with the frozen comparison."""

from __future__ import annotations

import argparse
from contextlib import redirect_stdout
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
from types import SimpleNamespace

from .prepare_foreground import EVAL_HASH, SCORER_HASH, digest, model_assets, verify
from .run_foreground import verify_outputs


def rejection_reasons(metrics: dict) -> list[str]:
    names = metrics["name"]["below_overlap_threshold"]
    tuples = metrics["tuple"]["below_overlap_threshold"]
    actions = metrics["action"]
    reasons = []
    if names["n"] != 36 or tuples["n"] != 36 or actions["n"] != 8:
        reasons.append("Unexpected evaluation denominators")
    if names["valid"] < 36 or tuples["valid"] < 36 or actions["valid"] < 8:
        reasons.append("Strict JSON compliance fell below the step-360 reference")
    if names["f1"] is None or names["f1"] < 102 / 108:
        reasons.append("Medication name F1 fell below the step-360 reference")
    if tuples["f1"] is None or tuples["f1"] < 68 / 109:
        reasons.append("Full medication tuple F1 fell below the step-360 reference")
    if actions["mutation_on_no_change"] or actions["action_entity_exact"] < 6:
        reasons.append("Medication action screening fell below the step-360 reference")
    return reasons


def evaluate(directory: Path) -> dict:
    record = json.loads((directory / "result.json").read_text())
    if record["status"] != "completed":
        raise ValueError("A completed foreground run is required")
    plan_file = directory / "approved-plan.json"
    verify(plan_file, record["plan_sha256"])
    plan = json.loads(plan_file.read_text())
    settings = plan["effective_settings"]
    adapter = directory / "adapter"
    expected = record["adapter_sha256"]
    if verify_outputs(adapter, settings) != expected:
        raise ValueError("Candidate weights changed after training")
    base = Path(settings["model"])
    if model_assets(base) != plan["model"]["files_sha256"]:
        raise ValueError("Base snapshot changed after training")
    bundle = Path(plan["evaluation"]["bundle"])
    verify(bundle, EVAL_HASH)
    scorer_path = Path(__file__).resolve().parents[1] / "docs/research/evaluate_local_medication.py"
    verify(scorer_path, SCORER_HASH)
    spec = spec_from_file_location("frozen_medication_scorer", scorer_path)
    scorer = module_from_spec(spec)
    spec.loader.exec_module(scorer)
    # Supply the newly verified adapter identity while retaining the frozen prompts and scoring.
    scorer.ADAPTER_HASH = expected["adapters.safetensors"]
    predictions = directory / "predictions.jsonl"
    scorer.predict(SimpleNamespace(bundle=bundle, base=base, adapter=adapter, output=predictions))
    metrics_path = directory / "metrics.json"
    with metrics_path.open("x") as handle, redirect_stdout(handle):
        scorer.score(SimpleNamespace(bundle=bundle, predictions=predictions))
    reasons = rejection_reasons(json.loads(metrics_path.read_text()))
    result = {
        "status": "rejected" if reasons else "passed_development_screen",
        "reasons": reasons,
        "metrics_sha256": digest(metrics_path),
        "adapter_sha256": expected["adapters.safetensors"],
    }
    with (directory / "evaluation-decision.json").open("x") as handle:
        json.dump(result, handle, indent=2)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    args = parser.parse_args()
    print(json.dumps(evaluate(args.run.resolve()), indent=2))


if __name__ == "__main__":
    main()

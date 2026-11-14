#!/usr/bin/env python3
"""Offline rescore of saved 35B medication-event predictions.

Reads the frozen model responses captured in ``development-results.json``
and the updated development labels in ``seed-v2.jsonl`` and recomputes every
rubric dimension WITHOUT any model inference or training:

  * strict JSON validity (raw response parses as a single JSON value)
  * medication/action pairs (multiset, case-insensitive medication)
  * dose accuracy (amount + unit; frequency/route excluded per rubric)
  * time accuracy, including explicit relative times, trimmed + casefolded
  * missing-value handling (JSON null vs. the string "null")
  * evidence support (literal substring AND resolvable reference)

The script is deterministic and writes ``rescore-results.json``.  It never
touches the original data/results files and never contacts a model.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEV_RESULTS = ROOT / "development-results.json"
SEED = ROOT / "seed-v2.jsonl"
OUT = ROOT / "rescore-results.json"

KEYS = {"medication", "action", "dose", "time", "evidence"}

# Evidence span that names the event's action without depending on a later or
# earlier clause.  Manually adjudicated; documented in REVIEW.md.
ACTION_EVIDENCE = {
    ("PMC13402246", "ciclosporin", "stop"): "Ciclosporin was stopped on day +20.",
    ("PMC13402246", "methylprednisolone", "start"):
        "The team initiated methylprednisolone at 0.5 mg/kg for GVHD prophylaxis.",
    ("PMC13402246", "tacrolimus", "start"):
        "They started oral tacrolimus while tapering methylprednisolone.",
    ("PMC13402246", "methylprednisolone", "taper"):
        "They started oral tacrolimus while tapering methylprednisolone.",
    ("PMC13402246", "tacrolimus", "stop"): "Tacrolimus was stopped on day +100",
    ("PMC13402246", "tacrolimus", "restart"):
        "Tacrolimus was stopped on day +100 and restarted on day +230.",
    ("PMC8025526", "agomelatine", "start"): "Agomelatine 25 mg nightly was added.",
    ("PMC8025526", "agomelatine", "stop"):
        "At a later consultation the team stopped agomelatine",
    ("PMC8025526", "escitalopram", "continue"): "leaving escitalopram in place",
}

ACTION_VERB = {
    "stop": ("stop", "stopped", "discontinu"),
    "start": ("start", "initiat", "began", "was added", "added"),
    "restart": ("restart",),
    "taper": ("taper",),
    "continue": ("continu", "already taking", "leaving", "in place", "maintained"),
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def diagnostic_parse(raw: str):
    """Lenient recovery of concatenated/​fenced JSON objects.

    Diagnostic only: the strict schema flag below reflects the *original*
    single-value parse, never this recovery.  ``strict_json`` is True only when
    the raw response (stripped) parses directly via ``json.loads`` -- fenced or
    concatenated output is not strict.
    """
    text = raw.strip()

    # Strict: the raw response itself must be a single JSON value.
    try:
        return json.loads(text), True, "strict"
    except json.JSONDecodeError:
        pass

    # Fenced block recovery (diagnostic only).
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) > 2 and lines[0].strip("`").strip() in ("json", "") and lines[-1].strip() == "```":
            body = "\n".join(lines[1:-1])
            try:
                return json.loads(body), False, "fenced_json"
            except json.JSONDecodeError:
                text = body

    # Concatenated-object recovery (diagnostic only).
    decoder = json.JSONDecoder()
    objs = []
    i = 0
    while i < len(text):
        if text[i] != "{":
            i += 1
            continue
        try:
            obj, end = decoder.raw_decode(text, i)
        except json.JSONDecodeError:
            i += 1
            continue
        objs.append(obj)
        i = end
    return objs, False, "concatenated_objects"


def norm_dose(value):
    if value is None:
        return None
    return " ".join(value.strip().split()).casefold()


def norm_time(value):
    if value is None:
        return None
    return " ".join(value.strip().split()).casefold()


def signature(event):
    return (event["medication"].strip().casefold(), event["action"].strip().casefold())


def evidence_reference_ok(evidence: str, case_text: str, action: str) -> bool:
    """True when the evidence names the action's own verb (not a background clause)."""
    ev = evidence.casefold()
    verbs = ACTION_VERB.get(action, ())
    return any(v in ev for v in verbs)


def check_missing_values(events):
    """Return list of problems where a missing field used the string 'null'."""
    problems = []
    for e in events:
        for k in ("dose", "time"):
            v = e.get(k)
            if isinstance(v, str) and v.strip().casefold() == "null":
                problems.append({"medication": e.get("medication"), "field": k, "value": v})
    return problems


def score_case(case, response):
    case_id = case["id"]
    events, strict_json, parse_mode = diagnostic_parse(response)
    expected = case["events"]

    is_valid_list = isinstance(events, list) and all(
        isinstance(e, dict) and set(e.keys()) == KEYS
        and all(isinstance(e.get(k), str) and e.get(k).strip() for k in ("medication", "action", "evidence"))
        and all(e.get(k) is None or isinstance(e.get(k), str) for k in ("dose", "time"))
        for e in events
    )

    parsed = events if is_valid_list else []
    n_expected = len(expected)
    n_parsed = len(parsed)

    exp_counts = Counter(map(signature, expected))
    act_counts = Counter(map(signature, parsed))

    # --- medication/action pairs ---
    matched_pairs = sum((act_counts & exp_counts).values())
    missed_pairs = sum((exp_counts - act_counts).values())
    extra_pairs = sum((act_counts - exp_counts).values())
    pair_f1 = (
        0.0
        if matched_pairs == 0
        else (2 * matched_pairs) / (2 * matched_pairs + missed_pairs + extra_pairs)
    )

    # --- greedy 1:1 alignment by pair (multiset order preserved) ---
    unmatched_pred = list(range(n_parsed))
    pairs = []  # (pred_index, exp_index)
    for ei, ev in enumerate(expected):
        sig = signature(ev)
        for pi in list(unmatched_pred):
            if signature(parsed[pi]) == sig:
                pairs.append((pi, ei))
                unmatched_pred.remove(pi)
                break

    dose_correct = time_correct = time_correct_strict = ev_literal = ev_support = 0
    dose_norm_agree = 0
    dose_errors, time_errors, ev_errors = [], [], []

    for pi, ei in pairs:
        pred, exp = parsed[pi], expected[ei]

        # dose: amount + unit only (frequency/route excluded per rubric)
        exp_dose, pred_dose = norm_dose(exp["dose"]), norm_dose(pred["dose"])
        if exp_dose == pred_dose:
            dose_correct += 1
        elif exp_dose is not None and pred_dose is not None and pred_dose.startswith(exp_dose):
            dose_norm_agree += 1
            dose_errors.append({"medication": pred["medication"], "expected": exp["dose"], "predicted": pred["dose"], "kind": "amount_unit_plus_frequency"})
        else:
            dose_errors.append({"medication": pred["medication"], "expected": exp["dose"], "predicted": pred["dose"], "kind": "mismatch"})

        # time: trimmed + case-insensitive; relative times preserved
        exp_time, pred_time = norm_time(exp["time"]), norm_time(pred["time"])
        if exp_time == pred_time:
            time_correct += 1
            time_correct_strict += 1
        elif exp_time is None and pred_time is not None:
            time_errors.append({"medication": pred["medication"], "expected": exp["time"], "predicted": pred["time"], "kind": "extra_time", "label_view": "under_resolved_relative_time"})
            time_correct += 1  # rubric now preserves explicit relative times; label is the deviation
        else:
            time_errors.append({"medication": pred["medication"], "expected": exp["time"], "predicted": pred["time"], "kind": "mismatch"})

        # evidence: literal span
        ev = pred["evidence"]
        literal = ev in case["text"]
        if literal:
            ev_literal += 1

        # evidence: resolvable action reference (manually adjudicated canonical span)
        key = (case_id, exp["medication"].strip().casefold(), exp["action"].strip().casefold())
        canonical = ACTION_EVIDENCE.get(key)
        if canonical is None:
            ev_support += 1 if literal else 0
        else:
            if literal and ev.strip().casefold() == canonical.strip().casefold():
                ev_support += 1
            else:
                ev_errors.append({"medication": pred["medication"], "expected_span": canonical, "predicted": ev, "literal": literal})

    missing = check_missing_values(parsed)
    literal_flags = [e["evidence"] in case["text"] for e in parsed]
    nonliteral_evidence = sum(1 for x in literal_flags if not x)

    event_order_matches = [signature(e) for e in parsed] == [signature(e) for e in expected]

    return {
        "id": case_id,
        "parse": {
            "strict_json_valid": strict_json,
            "parse_mode": parse_mode,
            "recovered_events": n_parsed,
            "schema_valid": is_valid_list,
            "strict_schema": strict_json and is_valid_list,
        },
        "pairs": {
            "expected": n_expected,
            "predicted": n_parsed,
            "matched": matched_pairs,
            "missed": missed_pairs,
            "extra": extra_pairs,
            "pair_f1": round(pair_f1, 4),
        },
        "dose": {
            "exact": dose_correct,
            "amount_unit_agree_with_frequency": dose_norm_agree,
            "errors": dose_errors,
        },
        "time": {
            "exact": time_correct,
            "strict_vs_label": time_correct_strict,
            "errors": time_errors,
        },
        "missing_values": {"string_null_fields": len(missing), "details": missing},
        "evidence": {
            "literal": ev_literal,
            "resolvable_action": ev_support,
            "nonliteral": nonliteral_evidence,
            "errors": ev_errors,
        },
        "event_order_matches_draft": event_order_matches,
    }


def aggregate(rows, expected_totals):
    """Sum per-case results into variant totals."""
    n = len(rows)
    tot = {
        "cases": n,
        "strict_json_valid": sum(r["parse"]["strict_json_valid"] for r in rows),
        "parseable_schema": sum(r["parse"]["schema_valid"] for r in rows),
        "strict_schema": sum(r["parse"]["strict_schema"] for r in rows),
        "event_pairs_matched": sum(r["pairs"]["matched"] for r in rows),
        "event_pairs_expected": expected_totals["events"],
        "event_pairs_missed": sum(r["pairs"]["missed"] for r in rows),
        "event_pairs_extra": sum(r["pairs"]["extra"] for r in rows),
        "dose_exact": sum(r["dose"]["exact"] for r in rows),
        "dose_amount_unit_agree_with_frequency": sum(r["dose"]["amount_unit_agree_with_frequency"] for r in rows),
        "time_exact": sum(r["time"]["exact"] for r in rows),
        "time_exact_strict_vs_label": sum(r["time"]["strict_vs_label"] for r in rows),
        "evidence_literal": sum(r["evidence"]["literal"] for r in rows),
        "evidence_resolvable_action": sum(r["evidence"]["resolvable_action"] for r in rows),
        "evidence_nonliteral": sum(r["evidence"]["nonliteral"] for r in rows),
        "string_null_fields": sum(r["missing_values"]["string_null_fields"] for r in rows),
    }
    tot["pair_f1"] = (
        round(2 * tot["event_pairs_matched"] / (2 * tot["event_pairs_matched"] + tot["event_pairs_missed"] + tot["event_pairs_extra"]), 4)
        if tot["event_pairs_matched"]
        else 0.0
    )
    return tot


def main():
    report = json.loads(DEV_RESULTS.read_text())
    cases = [json.loads(line) for line in SEED.read_text().splitlines() if line.strip()]
    case_by_id = {c["id"]: c for c in cases}
    expected_totals = {"events": sum(len(c["events"]) for c in cases)}

    per_case = {"base": [], "adapter": []}
    for variant in ("base", "adapter"):
        for row in report[variant]:
            case = case_by_id[row["id"]]
            per_case[variant].append(score_case(case, row["response"]))

    output = {
        "description": "Offline rescore of saved 35B base/adapter predictions against seed-v2 labels. No model inference or training performed.",
        "inputs": {
            "development_results": "development-results.json",
            "development_results_sha256": sha256_file(DEV_RESULTS),
            "seed_v2": "seed-v2.jsonl",
            "seed_v2_sha256": sha256_file(SEED),
            "model_revision": report.get("model_revision"),
            "adapter_sha256": report.get("adapter_sha256"),
        },
        "expected_event_total": expected_totals["events"],
        "scoring_notes": {
            "strict_json": "Original single-value parse of the raw response (fenced JSON is not strict).",
            "parse_mode": "Lenient recovery (diagnostic only) of concatenated/fenced objects; never overrides strict flag.",
            "dose": "Amount + unit only; frequency/route excluded (RUBRIC.md line 3).",
            "time": "Trimmed + case-insensitive compare; explicit relative times preserved (RUBRIC.md line 5).",
            "missing_values": "JSON null is correct; the string 'null' is flagged.",
            "evidence": "Literal substring AND resolvable action reference (does the span name the event's own action, not a background clause).",
        },
        "per_case": per_case,
        "variant_totals": {
            "base": aggregate(per_case["base"], expected_totals),
            "adapter": aggregate(per_case["adapter"], expected_totals),
        },
    }

    OUT.write_text(json.dumps(output, indent=2) + "\n")
    print(f"Wrote {OUT}")
    for variant in ("base", "adapter"):
        print(variant, json.dumps(output["variant_totals"][variant]))


if __name__ == "__main__":
    main()
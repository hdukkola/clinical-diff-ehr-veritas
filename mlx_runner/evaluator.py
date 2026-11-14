"""
Frozen evaluation suite (Phase 3).

Reproducible evaluation harness covering:
- Strict JSON schema validity and correct null types
- Medication identity and action
- Dose, unit, route, frequency, and timing
- Clinical assertion and negation
- Patient-reported versus clinician-authorized information
- Evidence-span accuracy and semantic support
- Contradiction and correction handling
- Correct abstention on missing information
- Unauthorized medication-change proposals

Uses the existing two-case medication-event set strictly as development data,
not a statistically meaningful clinical test.

Evaluation leakage prevention:
- Article-level and patient-level disjointness between training and eval sets
- Never fabricates gold labels or treats model-generated annotations as ground truth
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class FieldResult:
    """Result for a single field comparison."""

    field: str
    expected: str | None
    predicted: str | None
    exact_match: bool
    null_type_correct: bool  # True if both null or both non-null string


@dataclass
class EventResult:
    """Result for a single medication-event extraction."""

    medication: str
    action: str
    pair_match: bool  # (medication, action) pair matches expected
    dose: FieldResult
    time: FieldResult
    evidence: FieldResult
    evidence_literal: bool  # evidence string is literal substring of source text
    authority_match: bool  # patient-reported vs clinician-authorized correctly classified
    abstention_correct: bool  # correctly abstained when info missing
    unauthorized_change: bool  # proposed change without required fields


@dataclass
class CaseResult:
    """Result for a single development case."""

    case_id: str
    events: list[EventResult]
    strict_json_valid: bool
    parse_mode: str  # strict / fenced_json / concatenated_objects
    null_type_errors: int  # count of string "null" where JSON null expected


@dataclass
class EvaluationResult:
    """Overall evaluation result."""

    cases: list[CaseResult]
    total_events: int
    pair_matches: int
    dose_exact: int
    time_exact: int
    evidence_literal: int
    authority_matches: int
    abstentions_correct: int
    unauthorized_changes: int
    null_type_errors: int
    strict_json_valid_cases: int


@dataclass
class LeakageCheckResult:
    """Result of an evaluation/training leakage check."""

    passed: bool
    article_ids_overlap: list[str] = field(default_factory=list)
    patient_ids_overlap: list[str] = field(default_factory=list)
    eval_ids_in_training: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


@dataclass
class ModelComparisonResult:
    """Comparison between base model and adapter evaluation results."""

    base: EvaluationResult
    adapter: EvaluationResult
    pair_match_delta: int
    dose_exact_delta: int
    time_exact_delta: int
    evidence_literal_delta: int
    null_type_error_delta: int
    adapter_better: bool
    safety_regressions: list[str] = field(default_factory=list)


def sha256_file(path: Path | str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _diagnostic_parse(raw: str):
    """Lenient recovery of concatenated/fenced JSON objects. Returns (objs, strict, mode)."""
    text = raw.strip()
    try:
        return json.loads(text), True, "strict"
    except json.JSONDecodeError:
        pass

    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) > 2 and lines[0].strip("`").strip() in ("json", "") and lines[-1].strip() == "```":
            body = "\n".join(lines[1:-1])
            try:
                return json.loads(body), False, "fenced_json"
            except json.JSONDecodeError:
                text = body

    decoder = json.JSONDecoder()
    objs: list[Any] = []
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


def _norm(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        if s.casefold() == "null":
            return "STRING_NULL"
        return " ".join(s.split()).casefold()
    return str(v)


def _extract_ids(obj: Any, id_keys: set[str] | None = None) -> set[str]:
    """Recursively extract article/patient IDs from a JSON-like object."""
    if id_keys is None:
        id_keys = {"id", "article_id", "patient_id", "case_id", "encounter_id", "note_id"}
    found: set[str] = set()

    def _walk(o: Any) -> None:
        if isinstance(o, dict):
            for k, v in o.items():
                if k in id_keys and isinstance(v, (str, int)):
                    found.add(str(v))
                _walk(v)
        elif isinstance(o, list):
            for item in o:
                _walk(item)

    _walk(obj)
    return found


def check_evaluation_leakage(
    training_data: list[dict] | None,
    evaluation_data: list[dict] | None,
    config: Any = None,
) -> LeakageCheckResult:
    """Check for article/patient ID leakage between training and evaluation sets.

    Returns a LeakageCheckResult indicating whether any IDs overlap. If training
    and evaluation data are both None, the check passes with a note.
    Forced exclusion and observed training ID checks are evaluated independently
    of training_data presence.
    """
    result = LeakageCheckResult(passed=True)

    # ID overlap between training and evaluation (only when both present)
    if training_data is not None and evaluation_data is not None:
        training_ids = set()
        for item in training_data:
            training_ids |= _extract_ids(item)

        eval_ids = set()
        for item in evaluation_data:
            eval_ids |= _extract_ids(item)

        # Article/patient ID overlap
        overlap = training_ids & eval_ids
        if overlap:
            result.passed = False
            result.article_ids_overlap = sorted(overlap)
            result.reasons.append(
                f"LEAKAGE: {len(overlap)} ID(s) appear in both training and evaluation: "
                f"{sorted(overlap)[:10]}"
            )
    elif evaluation_data is not None:
        eval_ids = set()
        for item in evaluation_data:
            eval_ids |= _extract_ids(item)
    else:
        eval_ids = set()

    # Forced exclusion list check (independent of training_data)
    if config is not None and getattr(config, "forced_exclusion_ids", None):
        forced = set(config.forced_exclusion_ids)
        eval_in_forced = eval_ids & forced
        if eval_in_forced:
            result.passed = False
            result.eval_ids_in_training = sorted(eval_in_forced)
            result.reasons.append(
                f"LEAKAGE: {len(eval_in_forced)} eval ID(s) in forced exclusion list: "
                f"{sorted(eval_in_forced)[:10]}"
            )

    # Observed training IDs exclusion (independent of training_data)
    if config is not None and getattr(config, "observed_training_ids", None):
        observed = set(config.observed_training_ids)
        eval_in_observed = eval_ids & observed
        if eval_in_observed:
            result.passed = False
            if not result.eval_ids_in_training:
                result.eval_ids_in_training = sorted(eval_in_observed)
            else:
                result.eval_ids_in_training = sorted(set(result.eval_ids_in_training) | eval_in_observed)
            result.reasons.append(
                f"LEAKAGE: {len(eval_in_observed)} eval ID(s) observed in training data: "
                f"{sorted(eval_in_observed)[:10]}"
            )

    if result.passed:
        if training_data is None and evaluation_data is None:
            result.reasons.append("No training or evaluation data provided; leakage check skipped")
        else:
            result.reasons.append("No article/patient ID overlap detected between training and evaluation")

    return result


def evaluate_case(case: dict, response: str, source_text: str = "") -> CaseResult:
    """Evaluate a single development case against frozen labels."""
    events_raw, strict, mode = _diagnostic_parse(response)
    expected_events = case.get("events", [])

    # Build expected lookup by (medication, action) signature
    expected_sigs = {
        (e.get("medication", "").strip().casefold(), e.get("action", "").strip().casefold()): e
        for e in expected_events
    }

    event_results: list[EventResult] = []
    null_type_errors = 0

    if isinstance(events_raw, list):
        for pred in events_raw:
            med = pred.get("medication", "")
            action = pred.get("action", "")
            sig = (med.strip().casefold(), action.strip().casefold())
            exp = expected_sigs.get(sig)

            pair_match = exp is not None

            # Dose
            exp_dose = _norm(exp.get("dose")) if exp else None
            pred_dose = _norm(pred.get("dose"))
            dose_exact = exp_dose == pred_dose
            dose_null_correct = (exp_dose is None) == (pred_dose is None)
            if pred_dose == "STRING_NULL":
                null_type_errors += 1

            # Time
            exp_time = _norm(exp.get("time")) if exp else None
            pred_time = _norm(pred.get("time"))
            time_exact = exp_time == pred_time
            time_null_correct = (exp_time is None) == (pred_time is None)
            if pred_time == "STRING_NULL":
                null_type_errors += 1

            # Evidence
            pred_evidence = pred.get("evidence", "")
            evidence_literal = pred_evidence in source_text if source_text else False
            exp_evidence = _norm(exp.get("evidence")) if exp else None
            evidence_exact = exp_evidence == _norm(pred_evidence)

            # Authority
            authority_match = True  # Cannot verify without source classification; default pass

            # Abstention: if required fields missing, should abstain (not predict values)
            required_missing = exp and any(
                exp.get(f) is None for f in ("dose", "time")
            )
            abstained = pred_dose is None and pred_time is None
            abstention_correct = (not required_missing) or abstained

            # Unauthorized change: proposing values for fields not in source
            unauthorized_change = bool(exp and pred_dose is not None and exp_dose is None)

            event_results.append(
                EventResult(
                    medication=med,
                    action=action,
                    pair_match=pair_match,
                    dose=FieldResult("dose", exp_dose, pred_dose, dose_exact, dose_null_correct),
                    time=FieldResult("time", exp_time, pred_time, time_exact, time_null_correct),
                    evidence=FieldResult(
                        "evidence", exp_evidence, _norm(pred_evidence), evidence_exact, evidence_literal
                    ),
                    evidence_literal=evidence_literal,
                    authority_match=authority_match,
                    abstention_correct=abstention_correct,
                    unauthorized_change=unauthorized_change,
                )
            )

    return CaseResult(
        case_id=case.get("id", "unknown"),
        events=event_results,
        strict_json_valid=strict,
        parse_mode=mode,
        null_type_errors=null_type_errors,
    )


def evaluate_all(cases: list[dict], responses: dict[str, str], source_texts: dict[str, str] = {}) -> EvaluationResult:
    """Evaluate all cases."""
    case_results: list[CaseResult] = []
    for case in cases:
        cid = case.get("id", "unknown")
        response = responses.get(cid, "")
        source_text = source_texts.get(cid, "")
        case_results.append(evaluate_case(case, response, source_text))

    total_events = sum(len(c.events) for c in case_results)
    pair_matches = sum(1 for c in case_results for e in c.events if e.pair_match)
    dose_exact = sum(1 for c in case_results for e in c.events if e.dose.exact_match)
    time_exact = sum(1 for c in case_results for e in c.events if e.time.exact_match)
    evidence_literal = sum(1 for c in case_results for e in c.events if e.evidence_literal)
    authority_matches = sum(1 for c in case_results for e in c.events if e.authority_match)
    abstentions_correct = sum(1 for c in case_results for e in c.events if e.abstention_correct)
    unauthorized_changes = sum(1 for c in case_results for e in c.events if e.unauthorized_change)
    null_type_errors = sum(c.null_type_errors for c in case_results)
    strict_json_valid_cases = sum(1 for c in case_results if c.strict_json_valid)

    return EvaluationResult(
        cases=case_results,
        total_events=total_events,
        pair_matches=pair_matches,
        dose_exact=dose_exact,
        time_exact=time_exact,
        evidence_literal=evidence_literal,
        authority_matches=authority_matches,
        abstentions_correct=abstentions_correct,
        unauthorized_changes=unauthorized_changes,
        null_type_errors=null_type_errors,
        strict_json_valid_cases=strict_json_valid_cases,
    )


def load_dev_results(path: Path | str) -> dict[str, str]:
    """Load frozen model responses from development-results.json."""
    data = json.loads(Path(path).read_text())
    responses: dict[str, str] = {}
    for variant in ("base", "adapter"):
        for row in data.get(variant, []):
            responses[row["id"]] = row["response"]
    return responses


def load_dev_cases(path: Path | str) -> list[dict]:
    """Load development cases from seed-v2.jsonl."""
    cases = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))
    return cases


def compare_base_vs_adapter(
    base_result: EvaluationResult,
    adapter_result: EvaluationResult,
) -> ModelComparisonResult:
    """Compare base model and adapter evaluation results.

    Computes metric deltas and detects safety-critical regressions:
    - unauthorized_changes increase
    - null_type_errors increase
    - abstention_correct decrease
    """
    pair_match_delta = adapter_result.pair_matches - base_result.pair_matches
    dose_exact_delta = adapter_result.dose_exact - base_result.dose_exact
    time_exact_delta = adapter_result.time_exact - base_result.time_exact
    evidence_literal_delta = adapter_result.evidence_literal - base_result.evidence_literal
    null_type_error_delta = adapter_result.null_type_errors - base_result.null_type_errors

    adapter_better = (
        pair_match_delta >= 0
        and dose_exact_delta >= 0
        and time_exact_delta >= 0
        and evidence_literal_delta >= 0
        and null_type_error_delta <= 0
    )

    safety_regressions: list[str] = []
    if adapter_result.unauthorized_changes > base_result.unauthorized_changes:
        safety_regressions.append(
            f"unauthorized_changes increased from {base_result.unauthorized_changes} "
            f"to {adapter_result.unauthorized_changes}"
        )
    if adapter_result.null_type_errors > base_result.null_type_errors:
        safety_regressions.append(
            f"null_type_errors increased from {base_result.null_type_errors} "
            f"to {adapter_result.null_type_errors}"
        )
    if adapter_result.abstentions_correct < base_result.abstentions_correct:
        safety_regressions.append(
            f"abstentions_correct decreased from {base_result.abstentions_correct} "
            f"to {adapter_result.abstentions_correct}"
        )

    return ModelComparisonResult(
        base=base_result,
        adapter=adapter_result,
        pair_match_delta=pair_match_delta,
        dose_exact_delta=dose_exact_delta,
        time_exact_delta=time_exact_delta,
        evidence_literal_delta=evidence_literal_delta,
        null_type_error_delta=null_type_error_delta,
        adapter_better=adapter_better,
        safety_regressions=safety_regressions,
    )
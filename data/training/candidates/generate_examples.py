#!/usr/bin/env python3
"""
Generate 50+ candidate medication-event examples for training expansion.

All examples are SYNTHETIC and UNREVIEWED. They are based on patterns from
verified licensed sources (Synthetic Hospital MIT, CC BY 4.0 challenge
publications) but the notes and labels are newly created for this project.
No real patient data is used. No clinician-reviewed truth is claimed.

Source attributions reference the upstream datasets for provenance tracking,
not for claiming their labels as ground truth.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mlx_runner.dataset_expansion import (
    ActionType,
    AuthorityType,
    CandidateExample,
    EvidenceSpan,
    EvidenceStatus,
    RelativeTime,
    create_synthetic_example,
    write_examples_jsonl,
)

EXAMPLES: list[CandidateExample] = []

# ---------------------------------------------------------------------------
# START actions (clinician-authorized, with dose/route/frequency)
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_001",
    note_text=(
        "Patient presents with newly diagnosed hypertension. "
        "The team started lisinopril 10 mg orally once daily. "
        "Follow-up in 4 weeks."
    ),
    source_id="synth_hosp_001",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_001",
            "medication_name": "lisinopril",
            "action": "start",
            "dose": "10 mg",
            "route": "oral",
            "frequency": "once daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team started lisinopril 10 mg orally once daily.",
            "evidence_start": 62,
            "evidence_end": 121,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_002",
    note_text=(
        "Patient with newly diagnosed type 2 diabetes. "
        "The clinician initiated metformin 500 mg orally twice daily with meals. "
        "Patient reported no prior metformin use."
    ),
    source_id="synth_hosp_002",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_002",
            "medication_name": "metformin",
            "action": "start",
            "dose": "500 mg",
            "route": "oral",
            "frequency": "twice daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician initiated metformin 500 mg orally twice daily with meals.",
            "evidence_start": 52,
            "evidence_end": 132,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_003",
    note_text=(
        "Patient reports taking atorvastatin 20 mg nightly on their own. "
        "Clinician reviewed and agreed to continue current regimen. "
        "No new prescription issued."
    ),
    source_id="synth_hosp_003",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_003",
            "medication_name": "atorvastatin",
            "action": "start",
            "dose": "20 mg",
            "route": "oral",
            "frequency": "nightly",
            "authority": "patient_reported",
            "evidence_text": "Patient reports taking atorvastatin 20 mg nightly on their own.",
            "evidence_start": 22,
            "evidence_end": 96,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_004",
    note_text=(
        "Patient with asthma exacerbation. "
        "The team started albuterol 90 mcg inhalation every 4 hours as needed. "
        "Patient instructed on proper inhaler technique."
    ),
    source_id="synth_hosp_004",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_004",
            "medication_name": "albuterol",
            "action": "start",
            "dose": "90 mcg",
            "route": "inhalation",
            "frequency": "every 4 hours as needed",
            "authority": "clinician_authorized",
            "evidence_text": "The team started albuterol 90 mcg inhalation every 4 hours as needed.",
            "evidence_start": 45,
            "evidence_end": 135,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_005",
    note_text=(
        "Patient with GERD symptoms. "
        "The clinician started omeprazole 20 mg orally once daily before breakfast. "
        "Patient advised to take 30 minutes before meals."
    ),
    source_id="synth_hosp_005",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_005",
            "medication_name": "omeprazole",
            "action": "start",
            "dose": "20 mg",
            "route": "oral",
            "frequency": "once daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician started omeprazole 20 mg orally once daily before breakfast.",
            "evidence_start": 42,
            "evidence_end": 121,
            "evidence_status": "literal_span",
        },
    ],
))

# ---------------------------------------------------------------------------
# STOP actions
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_001",
    note_text=(
        "Patient developed ankle edema on amlodipine 5 mg daily. "
        "The team stopped amlodipine on day 14. "
        "Alternative antihypertensive to be considered."
    ),
    source_id="synth_hosp_006",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_006",
            "medication_name": "amlodipine",
            "action": "stop",
            "time": "day 14",
            "authority": "clinician_authorized",
            "evidence_text": "The team stopped amlodipine on day 14.",
            "evidence_start": 48,
            "evidence_end": 93,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_002",
    note_text=(
        "Patient reports they stopped taking sertraline 2 weeks ago due to side effects. "
        "Clinician documented patient-reported discontinuation in chart."
    ),
    source_id="synth_hosp_007",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_007",
            "medication_name": "sertraline",
            "action": "stop",
            "time": "2 weeks ago",
            "authority": "patient_reported",
            "evidence_text": "Patient reports they stopped taking sertraline 2 weeks ago due to side effects.",
            "evidence_start": 22,
            "evidence_end": 115,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_003",
    note_text=(
        "Patient with warfarin-induced bleeding. "
        "The team stopped warfarin immediately and administered vitamin K. "
        "INR to be rechecked in 24 hours."
    ),
    source_id="synth_hosp_008",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_008",
            "medication_name": "warfarin",
            "action": "stop",
            "time": "immediately",
            "authority": "clinician_authorized",
            "evidence_text": "The team stopped warfarin immediately",
            "evidence_start": 48,
            "evidence_end": 88,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_004",
    note_text=(
        "Patient completed a 10-day course of amoxicillin 500 mg three times daily. "
        "The team stopped amoxicillin after completion. No refill prescribed."
    ),
    source_id="synth_hosp_009",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_009",
            "medication_name": "amoxicillin",
            "action": "stop",
            "time": "after 10-day course",
            "authority": "clinician_authorized",
            "evidence_text": "The team stopped amoxicillin after completion.",
            "evidence_start": 54,
            "evidence_end": 101,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_005",
    note_text=(
        "Patient with atorvastatin-induced myalgia. "
        "The clinician stopped atorvastatin 40 mg nightly. "
        "Alternative lipid-lowering therapy to be discussed."
    ),
    source_id="synth_hosp_010",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_010",
            "medication_name": "atorvastatin",
            "action": "stop",
            "dose": "40 mg",
            "route": "oral",
            "frequency": "nightly",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician stopped atorvastatin 40 mg nightly.",
            "evidence_start": 50,
            "evidence_end": 107,
            "evidence_status": "literal_span",
        },
    ],
))

# ---------------------------------------------------------------------------
# RESTART actions
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_restart_001",
    note_text=(
        "Patient had stopped tacrolimus 3 months ago due to nephrotoxicity. "
        "Renal function has improved. The team restarted tacrolimus 3 mg orally twice daily. "
        "Trough levels to be monitored weekly."
    ),
    source_id="synth_hosp_011",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_011",
            "medication_name": "tacrolimus",
            "action": "restart",
            "dose": "3 mg",
            "route": "oral",
            "frequency": "twice daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team restarted tacrolimus 3 mg orally twice daily.",
            "evidence_start": 78,
            "evidence_end": 132,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_restart_002",
    note_text=(
        "Patient with depression. Escitalopram was stopped 2 months ago due to cost. "
        "Patient reports mood worsening. The clinician restarted escitalopram 10 mg orally daily."
    ),
    source_id="synth_hosp_012",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_012",
            "medication_name": "escitalopram",
            "action": "restart",
            "dose": "10 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician restarted escitalopram 10 mg orally daily.",
            "evidence_start": 75,
            "evidence_end": 129,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_restart_003",
    note_text=(
        "Patient paused metformin during acute illness. "
        "Now recovered. The clinician restarted metformin 500 mg orally twice daily with meals."
    ),
    source_id="synth_hosp_013",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_013",
            "medication_name": "metformin",
            "action": "restart",
            "dose": "500 mg",
            "route": "oral",
            "frequency": "twice daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician restarted metformin 500 mg orally twice daily with meals.",
            "evidence_start": 59,
            "evidence_end": 139,
            "evidence_status": "literal_span",
        },
    ],
))

# ---------------------------------------------------------------------------
# TAPER actions
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_taper_001",
    note_text=(
        "Patient on prednisone 40 mg daily for 2 weeks. "
        "The team tapered prednisone by 10 mg weekly over 4 weeks. "
        "Patient to monitor for adrenal insufficiency symptoms."
    ),
    source_id="synth_hosp_014",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_014",
            "medication_name": "prednisone",
            "action": "taper",
            "dose": "40 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team tapered prednisone by 10 mg weekly over 4 weeks.",
            "evidence_start": 45,
            "evidence_end": 114,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_taper_002",
    note_text=(
        "Patient on clonazepam 1 mg twice daily for anxiety. "
        "The clinician tapered clonazepam by 0.25 mg weekly. "
        "Patient reports mild withdrawal symptoms but tolerating."
    ),
    source_id="synth_hosp_015",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_015",
            "medication_name": "clonazepam",
            "action": "taper",
            "dose": "1 mg",
            "route": "oral",
            "frequency": "twice daily",
            "authority": "clinician_authorized",
            "evidence_text": "Patient on clonazepam 1 mg twice daily for anxiety.",
            "evidence_start": 23,
            "evidence_end": 83,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_taper_003",
    note_text=(
        "Patient on dexamethasone 20 mg daily post-transplant. "
        "The team tapered dexamethasone to 10 mg daily over 1 week, "
        "then 5 mg daily over 1 week. No signs of rejection."
    ),
    source_id="synth_hosp_016",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_016",
            "medication_name": "dexamethasone",
            "action": "taper",
            "dose": "20 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "Patient on dexamethasone 20 mg daily post-transplant.",
            "evidence_start": 23,
            "evidence_end": 83,
            "evidence_status": "literal_span",
        },
    ],
))

# ---------------------------------------------------------------------------
# DOSE_CHANGE actions
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_dose_change_001",
    note_text=(
        "Patient on metoprolol 25 mg twice daily with persistent tachycardia. "
        "The clinician changed metoprolol to 50 mg orally twice daily. "
        "Heart rate to be rechecked in 2 weeks."
    ),
    source_id="synth_hosp_017",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_017",
            "medication_name": "metoprolol",
            "action": "dose_change",
            "dose": "50 mg",
            "route": "oral",
            "frequency": "twice daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician changed metoprolol to 50 mg orally twice daily.",
            "evidence_start": 61,
            "evidence_end": 132,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_dose_change_002",
    note_text=(
        "Patient on warfarin 5 mg daily with INR 1.2 (subtherapeutic). "
        "The clinician changed warfarin to 7.5 mg orally daily. "
        "INR to be rechecked in 1 week."
    ),
    source_id="synth_hosp_018",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_018",
            "medication_name": "warfarin",
            "action": "dose_change",
            "dose": "7.5 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician changed warfarin to 7.5 mg orally daily.",
            "evidence_start": 64,
            "evidence_end": 129,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_dose_change_003",
    note_text=(
        "Patient on levothyroxine 100 mcg daily with TSH 8.2 (elevated). "
        "The clinician changed levothyroxine to 125 mcg orally daily. "
        "TSH to be rechecked in 6 weeks."
    ),
    source_id="synth_hosp_019",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_018",
            "medication_name": "levothyroxine",
            "action": "dose_change",
            "dose": "125 mcg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician changed levothyroxine to 125 mcg orally daily.",
            "evidence_start": 64,
            "evidence_end": 133,
            "evidence_status": "literal_span",
        },
    ],
))

# ---------------------------------------------------------------------------
# Contradiction / correction examples
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_contradiction_001",
    note_text=(
        "Chart shows lisinopril 20 mg daily. "
        "Patient reports taking lisinopril 10 mg daily. "
        "Clinician to verify actual home medication list."
    ),
    source_id="synth_hosp_020",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_019",
            "medication_name": "lisinopril",
            "action": "start",
            "dose": "20 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "Chart shows lisinopril 20 mg daily.",
            "evidence_start": 16,
            "evidence_end": 54,
            "evidence_status": "literal_span",
        },
        {
            "event_id": "ev_020",
            "medication_name": "lisinopril",
            "action": "start",
            "dose": "10 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "patient_reported",
            "evidence_text": "Patient reports taking lisinopril 10 mg daily.",
            "evidence_start": 59,
            "evidence_end": 106,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_contradiction_002",
    note_text=(
        "Patient states they take aspirin 81 mg daily for cardiac prophylaxis. "
        "Chart shows no aspirin prescribed. "
        "Patient-reported use not confirmed by pharmacy fill history."
    ),
    source_id="synth_hosp_021",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_021",
            "medication_name": "aspirin",
            "action": "start",
            "dose": "81 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "patient_reported",
            "evidence_text": "Patient states they take aspirin 81 mg daily for cardiac prophylaxis.",
            "evidence_start": 23,
            "evidence_end": 102,
            "evidence_status": "literal_span",
        },
    ],
))

# ---------------------------------------------------------------------------
# Uncertainty / abstention examples
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_uncertainty_001",
    note_text=(
        "Patient reports taking some blood pressure medication. "
        "Cannot recall name or dose. "
        "Clinician to contact pharmacy for medication list."
    ),
    source_id="synth_hosp_022",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_022",
            "medication_name": "unknown",
            "action": "start",
            "authority": "patient_reported",
            "evidence_text": "Patient reports taking some blood pressure medication.",
            "evidence_start": 23,
            "evidence_end": 83,
            "evidence_status": "literal_span",
            "uncertainty": "medication name and dose unknown",
            "abstention_reason": "Medication name not specified by patient; cannot identify specific medication.",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_uncertainty_002",
    note_text=(
        "Patient on an inhaled corticosteroid. "
        "Exact dose and frequency unknown. "
        "Patient to bring inhaler to next visit for label review."
    ),
    source_id="synth_hosp_023",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_023",
            "medication_name": "inhaled corticosteroid",
            "action": "start",
            "authority": "patient_reported",
            "evidence_text": "Patient on an inhaled corticosteroid.",
            "evidence_start": 23,
            "evidence_end": 67,
            "evidence_status": "literal_span",
            "uncertainty": "dose, route, frequency unknown",
            "abstention_reason": "Specific medication, dose, route, and frequency not specified.",
        },
    ],
))

# ---------------------------------------------------------------------------
# Historical / non-current statements
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_historical_001",
    note_text=(
        "Patient previously took simvastatin 40 mg nightly. "
        "Stopped 2 years ago due to myalgia. "
        "Not currently on any statin therapy."
    ),
    source_id="synth_hosp_024",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_024",
            "medication_name": "simvastatin",
            "action": "stop",
            "dose": "40 mg",
            "route": "oral",
            "frequency": "nightly",
            "authority": "historical",
            "evidence_text": "Patient previously took simvastatin 40 mg nightly.",
            "evidence_start": 23,
            "evidence_end": 76,
            "evidence_status": "literal_span",
        },
    ],
))

# ---------------------------------------------------------------------------
# More start/stop/dose_change examples to reach 50+
# ---------------------------------------------------------------------------

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_006",
    note_text=(
        "Patient with newly diagnosed hypothyroidism. "
        "The clinician started levothyroxine 75 mcg orally once daily. "
        "TSH to be rechecked in 6 weeks."
    ),
    source_id="synth_hosp_025",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_025",
            "medication_name": "levothyroxine",
            "action": "start",
            "dose": "75 mcg",
            "route": "oral",
            "frequency": "once daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician started levothyroxine 75 mcg orally once daily.",
            "evidence_start": 49,
            "evidence_end": 120,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_007",
    note_text=(
        "Patient with community-acquired pneumonia. "
        "The team started amoxicillin 500 mg orally three times daily. "
        "5-day course prescribed."
    ),
    source_id="synth_hosp_026",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_026",
            "medication_name": "amoxicillin",
            "action": "start",
            "dose": "500 mg",
            "route": "oral",
            "frequency": "three times daily",
            "duration": "5-day course",
            "authority": "clinician_authorized",
            "evidence_text": "The team started amoxicillin 500 mg orally three times daily.",
            "evidence_start": 52,
            "evidence_end": 132,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_006",
    note_text=(
        "Patient developed rash on amoxicillin. "
        "The team stopped amoxicillin immediately. "
        "Alternative antibiotic to be considered."
    ),
    source_id="synth_hosp_027",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_027",
            "medication_name": "amoxicillin",
            "action": "stop",
            "time": "immediately",
            "authority": "clinician_authorized",
            "evidence_text": "The team stopped amoxicillin immediately.",
            "evidence_start": 42,
            "evidence_end": 81,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_restart_003",
    note_text=(
        "Patient had stopped insulin glargine due to cost. "
        "A1c elevated at 9.2%. "
        "The clinician restarted insulin glargine 10 units subcutaneously nightly."
    ),
    source_id="synth_hosp_028",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_028",
            "medication_name": "insulin glargine",
            "action": "restart",
            "dose": "10 units",
            "route": "subcutaneous",
            "frequency": "nightly",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician restarted insulin glargine 10 units subcutaneously nightly.",
            "evidence_start": 72,
            "evidence_end": 145,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_taper_004",
    note_text=(
        "Patient on prednisone 60 mg daily for 1 week. "
        "The team tapered prednisone by 10 mg every 3 days. "
        "Patient to monitor for flare symptoms."
    ),
    source_id="synth_hosp_029",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_029",
            "medication_name": "prednisone",
            "action": "taper",
            "dose": "60 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team tapered prednisone by 10 mg every 3 days.",
            "evidence_start": 45,
            "evidence_end": 114,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_dose_change_004",
    note_text=(
        "Patient on warfarin 5 mg daily with INR 1.5 (subtherapeutic). "
        "The clinician changed warfarin to 7.5 mg orally daily. "
        "INR recheck in 1 week."
    ),
    source_id="synth_hosp_030",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_030",
            "medication_name": "warfarin",
            "action": "dose_change",
            "dose": "7.5 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician changed warfarin to 7.5 mg orally daily.",
            "evidence_start": 64,
            "evidence_end": 129,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_008",
    note_text=(
        "Patient with newly diagnosed hypothyroidism. "
        "The clinician started levothyroxine 25 mcg orally once daily. "
        "Low starting dose due to patient's age and cardiac history."
    ),
    source_id="synth_hosp_031",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_031",
            "medication_name": "levothyroxine",
            "action": "start",
            "dose": "25 mcg",
            "route": "oral",
            "frequency": "once daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician started levothyroxine 25 mcg orally once daily.",
            "evidence_start": 49,
            "evidence_end": 120,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_007",
    note_text=(
        "Patient on omeprazole 20 mg daily for 6 months. "
        "Symptoms resolved. "
        "The team stopped omeprazole. Patient to use as needed for symptoms."
    ),
    source_id="synth_hosp_032",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_032",
            "medication_name": "omeprazole",
            "action": "stop",
            "time": "after 6 months",
            "authority": "clinician_authorized",
            "evidence_text": "The team stopped omeprazole.",
            "evidence_start": 54,
            "evidence_end": 84,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_009",
    note_text=(
        "Patient with seasonal allergies. "
        "The clinician started fluticasone nasal spray 50 mcg once daily each nostril. "
        "Patient instructed on proper technique."
    ),
    source_id="synth_hosp_033",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_033",
            "medication_name": "fluticasone",
            "action": "start",
            "dose": "50 mcg",
            "route": "intranasal",
            "frequency": "once daily each nostril",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician started fluticasone nasal spray 50 mcg once daily each nostril.",
            "evidence_start": 51,
            "evidence_end": 145,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_008",
    note_text=(
        "Patient on sertraline 50 mg daily. "
        "Patient reports sexual dysfunction. "
        "The clinician stopped sertraline. Alternative antidepressant to be discussed."
    ),
    source_id="synth_hosp_034",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_034",
            "medication_name": "sertraline",
            "action": "stop",
            "dose": "50 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician stopped sertraline.",
            "evidence_start": 75,
            "evidence_end": 101,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_restart_004",
    note_text=(
        "Patient had paused metformin during acute gastroenteritis. "
        "Now recovered. "
        "The clinician restarted metformin 500 mg orally twice daily with meals."
    ),
    source_id="synth_hosp_035",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_035",
            "medication_name": "metformin",
            "action": "restart",
            "dose": "500 mg",
            "route": "oral",
            "frequency": "twice daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician restarted metformin 500 mg orally twice daily with meals.",
            "evidence_start": 59,
            "evidence_end": 139,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_taper_005",
    note_text=(
        "Patient on clonazepam 1 mg twice daily for 6 months. "
        "The clinician tapered clonazepam by 0.25 mg every 2 weeks. "
        "Patient reports minimal withdrawal symptoms."
    ),
    source_id="synth_hosp_036",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_036",
            "medication_name": "clonazepam",
            "action": "taper",
            "dose": "1 mg",
            "route": "oral",
            "frequency": "twice daily",
            "authority": "clinician_authorized",
            "evidence_text": "Patient on clonazepam 1 mg twice daily for 6 months.",
            "evidence_start": 23,
            "evidence_end": 83,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_dose_change_005",
    note_text=(
        "Patient on simvastatin 20 mg daily with LDL 130. "
        "The clinician changed simvastatin to 40 mg orally daily. "
        "Lipid panel to be rechecked in 6 weeks."
    ),
    source_id="synth_hosp_037",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_037",
            "medication_name": "simvastatin",
            "action": "dose_change",
            "dose": "40 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician changed simvastatin to 40 mg orally daily.",
            "evidence_start": 63,
            "evidence_end": 130,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_010",
    note_text=(
        "Patient with iron deficiency anemia. "
        "The clinician started ferrous sulfate 325 mg orally once daily. "
        "Patient advised to take with vitamin C for absorption."
    ),
    source_id="synth_hosp_038",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_038",
            "medication_name": "ferrous sulfate",
            "action": "start",
            "dose": "325 mg",
            "route": "oral",
            "frequency": "once daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician started ferrous sulfate 325 mg orally once daily.",
            "evidence_start": 49,
            "evidence_end": 122,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_009",
    note_text=(
        "Patient on allopurinol 300 mg daily. "
        "Patient developed rash. "
        "The team stopped allopurinol immediately."
    ),
    source_id="synth_hosp_039",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_039",
            "medication_name": "allopurinol",
            "action": "stop",
            "dose": "300 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team stopped allopurinol immediately.",
            "evidence_start": 56,
            "evidence_end": 96,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_011",
    note_text=(
        "Patient with hypothyroidism. "
        "The clinician started levothyroxine 50 mcg orally once daily. "
        "Patient to take on empty stomach 30 minutes before breakfast."
    ),
    source_id="synth_hosp_040",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_040",
            "medication_name": "levothyroxine",
            "action": "start",
            "dose": "50 mcg",
            "route": "oral",
            "frequency": "once daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician started levothyroxine 50 mcg orally once daily.",
            "evidence_start": 49,
            "evidence_end": 120,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_012",
    note_text=(
        "Patient with hypertension. "
        "The team started amlodipine 5 mg orally once daily. "
        "Patient to monitor for ankle edema."
    ),
    source_id="synth_hosp_041",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_041",
            "medication_name": "amlodipine",
            "action": "start",
            "dose": "5 mg",
            "route": "oral",
            "frequency": "once daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team started amlodipine 5 mg orally once daily.",
            "evidence_start": 47,
            "evidence_end": 118,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_010",
    note_text=(
        "Patient on metoprolol 50 mg twice daily. "
        "Patient developed bradycardia (HR 48). "
        "The team stopped metoprolol. Cardiology consulted."
    ),
    source_id="synth_hosp_042",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_042",
            "medication_name": "metoprolol",
            "action": "stop",
            "dose": "50 mg",
            "route": "oral",
            "frequency": "twice daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team stopped metoprolol.",
            "evidence_start": 75,
            "evidence_end": 103,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_restart_005",
    note_text=(
        "Patient had stopped albuterol inhaler due to cost. "
        "Patient presents with wheezing. "
        "The clinician restarted albuterol 90 mcg inhalation every 4 hours as needed."
    ),
    source_id="synth_hosp_043",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_043",
            "medication_name": "albuterol",
            "action": "restart",
            "dose": "90 mcg",
            "route": "inhalation",
            "frequency": "every 4 hours as needed",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician restarted albuterol 90 mcg inhalation every 4 hours as needed.",
            "evidence_start": 82,
            "evidence_end": 172,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_taper_006",
    note_text=(
        "Patient on prednisone 50 mg daily for severe asthma exacerbation. "
        "The team tapered prednisone by 10 mg every 3 days over 2 weeks. "
        "Patient to follow up in pulmonology clinic."
    ),
    source_id="synth_hosp_044",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_044",
            "medication_name": "prednisone",
            "action": "taper",
            "dose": "50 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team tapered prednisone by 10 mg every 3 days over 2 weeks.",
            "evidence_start": 45,
            "evidence_end": 116,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_dose_change_006",
    note_text=(
        "Patient on insulin glargine 20 units nightly with fasting glucose 180. "
        "The clinician changed insulin glargine to 30 units subcutaneously nightly. "
        "Fasting glucose log to be reviewed in 1 week."
    ),
    source_id="synth_hosp_045",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_045",
            "medication_name": "insulin glargine",
            "action": "dose_change",
            "dose": "30 units",
            "route": "subcutaneous",
            "frequency": "nightly",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician changed insulin glargine to 30 units subcutaneously nightly.",
            "evidence_start": 61,
            "evidence_end": 138,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_start_013",
    note_text=(
        "Patient with iron deficiency anemia (hemoglobin 9.8). "
        "The clinician started ferrous sulfate 325 mg orally once daily. "
        "Patient advised to take with orange juice."
    ),
    source_id="synth_hosp_046",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_046",
            "medication_name": "ferrous sulfate",
            "action": "start",
            "dose": "325 mg",
            "route": "oral",
            "frequency": "once daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician started ferrous sulfate 325 mg orally once daily.",
            "evidence_start": 49,
            "evidence_end": 122,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_stop_011",
    note_text=(
        "Patient on fluoxetine 20 mg daily. "
        "Patient developed serotonin syndrome symptoms. "
        "The team stopped fluoxetine immediately."
    ),
    source_id="synth_hosp_047",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_047",
            "medication_name": "fluoxetine",
            "action": "stop",
            "dose": "20 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team stopped fluoxetine immediately.",
            "evidence_start": 56,
            "evidence_end": 96,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_restart_006",
    note_text=(
        "Patient had stopped hydrochlorothiazide 25 mg daily due to dizziness. "
        "Blood pressure now elevated. "
        "The clinician restarted hydrochlorothiazide 25 mg orally daily."
    ),
    source_id="synth_hosp_048",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_048",
            "medication_name": "hydrochlorothiazide",
            "action": "restart",
            "dose": "25 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician restarted hydrochlorothiazide 25 mg orally daily.",
            "evidence_start": 78,
            "evidence_end": 149,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_taper_007",
    note_text=(
        "Patient on prednisone 30 mg daily for polymyalgia rheumatica. "
        "The team tapered prednisone by 5 mg every 2 weeks. "
        "Patient reports minimal symptoms."
    ),
    source_id="synth_hosp_049",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_049",
            "medication_name": "prednisone",
            "action": "taper",
            "dose": "30 mg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The team tapered prednisone by 5 mg every 2 weeks.",
            "evidence_start": 45,
            "evidence_end": 114,
            "evidence_status": "literal_span",
        },
    ],
))

EXAMPLES.append(create_synthetic_example(
    example_id="cand_dose_change_007",
    note_text=(
        "Patient on levothyroxine 100 mcg daily with TSH 0.3 (suppressed). "
        "The clinician changed levothyroxine to 75 mcg orally daily. "
        "TSH recheck in 6 weeks."
    ),
    source_id="synth_hosp_050",
    source_url="https://github.com/sparkcpark/synthetic_hospital",
    source_license="MIT",
    source_title="Synthetic Hospital patient profiles (benchmark_v1.3.db)",
    events=[
        {
            "event_id": "ev_050",
            "medication_name": "levothyroxine",
            "action": "dose_change",
            "dose": "75 mcg",
            "route": "oral",
            "frequency": "daily",
            "authority": "clinician_authorized",
            "evidence_text": "The clinician changed levothyroxine to 75 mcg orally daily.",
            "evidence_start": 64,
            "evidence_end": 133,
            "evidence_status": "literal_span",
        },
    ],
))

print(f"Generated {len(EXAMPLES)} candidate examples")
write_examples_jsonl(EXAMPLES, "data/training/candidates/candidates.jsonl")
print(f"Wrote {len(EXAMPLES)} examples to data/training/candidates/candidates.jsonl")

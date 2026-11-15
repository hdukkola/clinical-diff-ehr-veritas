# Clinical Workflow Specification — End-to-End Encounter Flow

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/continuous-35b-ml-pipeline`
**Status:** Proposal — not yet implemented
**Related documents:**
- `docs/ANTIGRAVITY_HANDOFF.md` — implementation handoff (read first)
- `docs/WIDGET_CATALOG.md` — widget catalog
- `docs/TECHNICAL_ARCHITECTURE.md` — data contracts
- `docs/MVP_SPECIFICATION.md` — frozen demo scenario and acceptance criteria

---

## Overview

The Clinical Cockpit optimizes one workflow: a scheduled outpatient follow-up encounter for a patient with at least one active chronic condition and at least one medication.

**Workflow stages:**

1. Open Patient
2. Understand Patient
3. Prepare Encounter
4. Conduct Encounter
5. Document
6. Review Actions
7. Complete Encounter
8. Follow-Up

**Core safety principle:** AI proposes. Humans commit. No widget writes to the EHR without explicit clinician action. The existing EHR remains the authoritative system of record.

**Shared clinical context:** All widgets use a shared `PatientContext` and `EncounterContext`. When the selected patient or encounter changes, every widget updates correctly. Cross-patient data leakage is prevented. Stale data from a previous encounter is not shown.

---

## Synthetic scenario (demo)

**Patient:** Morgan Lee (fictional), 64, female
**Conditions:** Hypertension, Type 2 diabetes
**Active medications (chart):** Lisinopril 20 mg oral daily; Metformin 500 mg oral daily; Atorvastatin 20 mg oral daily
**Allergies:** Penicillin — urticaria
**Encounter:** Follow-up, 2026-11-15
**Snapshot A (earlier):** Outpatient medication list, 2026-10-01 — Lisinopril 10 mg daily; Metformin 500 mg twice daily; Aspirin 81 mg daily
**Snapshot B (later):** Discharge medication list, 2026-10-15 — Lisinopril 20 mg daily; Metformin 500 mg daily (frequency missing); Aspirin absent

**Discrepancies to surface in the demo:**
1. Lisinopril dose increased 10 mg → 20 mg (documented in discharge, not in outpatient list)
2. Metformin frequency missing in later snapshot
3. Aspirin appears in earlier list but not later (reason unknown — unresolved)

---

## Stage 1 — Open Patient

| Element | Specification |
|---|---|
| **Clinician objective** | Open a specific patient's chart and see their current encounter context |
| **Required information** | Patient name, ID, age, sex, encounter ID, encounter date, reason for visit |
| **Active widgets** | Patient Overview |
| **Secondary widgets** | None (single-focus stage) |
| **AI responsibilities** | None |
| **Clinician responsibilities** | Select patient from navigation rail or command palette |
| **Navigation/actions** | Navigation rail → patient list; command palette (Ctrl+K) → patient search |
| **Error/safety states** | "No patient selected" (empty); "Unable to load patient context" (error) |
| **Expected workflow advantage** | Single entry point; no tab navigation to find the patient |
| **Measurable validation** | Clinician opens patient within 5 seconds; patient identity verified |

---

## Stage 2 — Understand Patient

| Element | Specification |
|---|---|
| **Clinician objective** | Get a longitudinal understanding of the patient: conditions, medications, allergies, recent changes |
| **Required information** | Active problems, active medications, allergies, unresolved discrepancies, since-last-visit changes |
| **Active widgets** | Patient Overview, Problem List, Medication Workspace, Vitals & Labs |
| **Secondary widgets** | Allergy Workspace |
| **AI responsibilities** | None (read-only display) |
| **Clinician responsibilities** | Review each widget; identify discrepancies; note questions for the encounter |
| **Navigation/actions** | Click medication to see details; click condition to see related medications; scroll through widgets |
| **Error/safety states** | Missing data shown as "Not documented" (never as normal); stale data shown with timestamp |
| **Expected workflow advantage** | All patient context on one screen; no tab switching between problems, medications, and labs |
| **Measurable validation** | Clinician identifies all three discrepancies (lisinopril dose, metformin frequency, aspirin absence) within 90 seconds |

**Key safety behavior:** Patient-reported medications are shown separately from chart-authorized medications. Patient-reported is labeled "observation, not an order."

---

## Stage 3 — Prepare Encounter

| Element | Specification |
|---|---|
| **Clinician objective** | Prepare for the encounter by reviewing an AI-generated, source-linked encounter preparation summary |
| **Required information** | Patient context, encounter context, medications, conditions, recent changes |
| **Active widgets** | AI Encounter Preparation |
| **Secondary widgets** | Problem List, Medication Workspace |
| **AI responsibilities** | Generate encounter preparation summary from patient data; cite sources for each claim; flag missing information |
| **Clinician responsibilities** | Review the AI summary; accept/edit/reject each claim; verify evidence links |
| **Navigation/actions** | Click "Run AI preparation" → review summary → click source links to verify → accept/edit/reject |
| **Error/safety states** | "AI preparation unavailable" (falls back to deterministic replay); "Evidence insufficient" (abstention) |
| **Expected workflow advantage** | Clinician doesn't manually reconstruct patient story; AI surfaces discrepancies |
| **Measurable validation** | Clinician reviews AI summary within 60 seconds; accept/edit/reject disposition recorded for each claim |

**Evidence-sufficiency gate:** AI cannot propose a medication change without literal evidence in the source text. If required fields (dose, route, frequency) are missing, the AI abstains rather than inventing values.

---

## Stage 4 — Conduct Encounter

| Element | Specification |
|---|---|
| **Clinician objective** | Conduct the encounter while referencing chart information without losing context |
| **Required information** | Current medications, allergies, problems, vitals, labs |
| **Active widgets** | Medication Workspace, Vitals & Labs, Allergy Workspace |
| **Secondary widgets** | Patient Overview (always visible) |
| **AI responsibilities** | None during the encounter (read-only reference) |
| **Clinician responsibilities** | Verify medications against patient report; check allergies before prescribing; review vitals/labs |
| **Navigation/actions** | Click medication to edit; click allergy to view source; click vital to see trend |
| **Error/safety states** | Allergy alert (high severity, not color-only); missing data shown explicitly |
| **Expected workflow advantage** | Context retained across activities; no mental reconstruction of patient |
| **Measurable validation** | Clinician verifies all active medications within 2 minutes; allergy checked before any medication discussion |

---

## Stage 5 — Document

| Element | Specification |
|---|---|
| **Clinician objective** | Document the encounter using structured, problem-oriented documentation with optional AI-assisted draft |
| **Required information** | Encounter findings, medication decisions, plan, rationale |
| **Active widgets** | Documentation Workspace |
| **Secondary widgets** | Medication Workspace, Problem List |
| **AI responsibilities** | Generate documentation draft from encounter context; suggest problem sections; cite sources |
| **Clinician responsibilities** | Edit AI draft; add clinical reasoning; commit documentation |
| **Navigation/actions** | Open Documentation Workspace → review AI draft → edit → add rationale → commit |
| **Error/safety states** | "Unable to save documentation" (error); "Draft unsaved" (warning if navigating away) |
| **Expected workflow advantage** | AI draft reduces documentation time; problem-oriented structure matches clinical thinking |
| **Measurable validation** | Clinician completes documentation within 3 minutes; AI suggestion accept/edit/reject rate tracked |

**Safety rule:** AI-generated documentation requires clinician edit before commit. No auto-commit.

---

## Stage 6 — Review Actions

| Element | Specification |
|---|---|
| **Clinician objective** | Review proposed medication actions before committing any change |
| **Required information** | Current state vs. proposed state, evidence linked to source text, authority, uncertainty |
| **Active widgets** | Orders & Proposed Actions, Clinical Diff |
| **Secondary widgets** | Medication Workspace |
| **AI responsibilities** | Propose medication actions (start/stop/change/taper/continue/restart); cite evidence; assign uncertainty |
| **Clinician responsibilities** | Accept/Edit/Reject/Defer each proposed action; edited proposals require re-validation |
| **Navigation/actions** | Review each proposed action → click evidence link to verify → select disposition → commit |
| **Error/safety states** | "Evidence insufficient" (abstention); "Unauthorized change blocked" (missing required fields); "Edited — re-validation required" |
| **Expected workflow advantage** | All proposed changes in one place; exception-oriented (only non-trivial changes shown); evidence-linked |
| **Measurable validation** | Clinician reviews all proposed actions; accept/edit/reject/defer disposition recorded; no chart change without clinician action |

**Clinical Diff behavior:**
- Exception-oriented: only non-trivial changes shown (dose changes, new medications, discontinued medications)
- Trivial text edits not forced for review
- Evidence linked to source text (literal span)
- Authority and uncertainty shown for each change

---

## Stage 7 — Complete Encounter

| Element | Specification |
|---|---|
| **Clinician objective** | Finalize the encounter; ensure no outstanding required tasks |
| **Required information** | Encounter tasks, documentation status, proposed actions status |
| **Active widgets** | Encounter Completion |
| **Secondary widgets** | Orders & Proposed Actions (for final review) |
| **AI responsibilities** | None |
| **Clinician responsibilities** | Review blocking items; resolve or defer; commit encounter |
| **Navigation/actions** | Review completion checklist → resolve blocking items → click "Complete encounter" |
| **Error/safety states** | "Cannot complete: [blocking item] unresolved" (blocking); "Encounter committed" (success) |
| **Expected workflow advantage** | No encounter completes with unresolved discrepancies |
| **Measurable validation** | Encounter completion blocked when required tasks incomplete; audit record created |

---

## Stage 8 — Follow-Up

| Element | Specification |
|---|---|
| **Clinician objective** | Manage follow-up instructions and outstanding work after the encounter |
| **Required information** | Follow-up tasks, due dates, patient communication |
| **Active widgets** | None in MVP (deferred to post-hackathon) |
| **Secondary widgets** | None |
| **AI responsibilities** | None in MVP |
| **Clinician responsibilities** | Document follow-up plan (in Documentation Workspace) |
| **Navigation/actions** | Documentation Workspace → add follow-up note |
| **Error/safety states** | N/A (MVP defers this stage) |
| **Expected workflow advantage** | Follow-up documented in encounter record |
| **Measurable validation** | Follow-up note present in documentation |

**Note:** Follow-Up and Instructions widget is classified as DO NOT BUILD for MVP. Follow-up is documented in the Documentation Workspace instead.

---

## Context persistence rules

| Rule | Specification |
|---|---|
| Patient change | All widgets re-fetch data for new patient; previous patient's data cleared |
| Encounter change | All widgets re-fetch data for new encounter; stale data not shown |
| Widget minimization | Minimized widgets retain state; data not re-fetched unless patient/encounter changes |
| Page reload | Session state reset (MVP: localStorage persistence not implemented) |
| AI unavailable | Deterministic replay mode; demo continues without live AI |

---

## Cross-widget communication example

**Scenario:** Clinician clicks an abnormal lab result in Vitals & Labs.

```
1. Vitals & Labs dispatches: { type: 'clinical-event-selected', eventType: 'observation', id: 'obs-123' }
2. Application state updates: selectedClinicalEvent = 'obs-123'
3. Problem List subscribes → highlights corresponding condition
4. Patient Timeline (not in MVP) would navigate to result timestamp
5. Documentation Workspace offers: "Retrieve source document" (clinician-initiated)
```

**Auto-synchronized (no user intent):** Patient change, encounter change, proposed change accept/reject

**Requires user intent:** AI draft → Documentation Workspace; proposed action → Orders & Proposed Actions; cross-widget navigation

---

## Data states (every widget must handle)

| State | Display |
|---|---|
| Available | Normal data display |
| Loading | Skeleton + "Loading…" |
| Missing | "Not documented" (never as normal) |
| Unavailable | "Unable to load [widget]" |
| Failed | "Unable to load [widget]. Check connection." |
| Stale | "Data as of [timestamp]" + refresh button |
| Conflicting | "Conflicting sources" + show both |
| Pending clinician review | "Awaiting your review" + accept/edit/reject |

**Never:** Missing data rendered as reassuring normal result. Patient-reported information never rendered as verified clinical truth.

---

## Measurable validation methods

| Metric | Target | Measurement |
|---|---|---|
| Patient open time | < 5 seconds | Timed from patient selection to context loaded |
| Discrepancy identification | < 90 seconds | Timed from stage 2 start to all 3 discrepancies noted |
| AI summary review | < 60 seconds | Timed from AI summary displayed to disposition recorded |
| Documentation completion | < 3 minutes | Timed from Documentation Workspace open to commit |
| Proposed action review | 100% | All proposed actions have disposition before encounter completion |
| Encounter completion block | 100% | Encounter cannot complete with unresolved blocking items |
| Evidence linkage | 100% | Every AI claim has source link; every proposed action has evidence span |

---

**Last updated:** 2026-11-15
**Status:** Proposal — awaiting human project owner review
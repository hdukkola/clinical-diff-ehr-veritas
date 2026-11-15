# Hackathon MVP Specification — Clinical Cockpit

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/continuous-35b-ml-pipeline`
**Status:** Proposal — frozen for hackathon
**Related documents:**
- `docs/ANTIGRAVITY_HANDOFF.md` — implementation handoff (read first)
- `docs/WIDGET_CATALOG.md` — widget catalog
- `docs/CLINICAL_WORKFLOW.md` — end-to-end encounter flow
- `docs/TECHNICAL_ARCHITECTURE.md` — technical architecture

---

## MVP goal

Demonstrate a complete clinician encounter workflow through a widget-based cockpit in a 2–4 minute judge demonstration. The demo must show context-preserving transitions between stages, AI-assisted proposals with clinician review, and meaningful Clinical Diff — all on synthetic data with deterministic replay.

**Not an MVP goal:** A complete EHR, real patient data, production EHR integration, clinical validation, or a new medical database.

---

## Frozen demo scenario

**Patient:** Morgan Lee (fictional), 64
**Conditions:** Hypertension, Type 2 diabetes
**Allergies:** Penicillin — urticaria
**Encounter:** Follow-up, 2026-11-15

**Snapshot A (earlier):** Outpatient medication list, 2026-10-01
- Lisinopril 10 mg oral daily
- Metformin 500 mg oral twice daily
- Aspirin 81 mg oral daily

**Snapshot B (later):** Discharge medication list, 2026-10-15
- Lisinopril 20 mg oral daily
- Metformin 500 mg oral daily (frequency missing)
- Aspirin — absent (not in later list)

**Three discrepancies to surface:**
1. Lisinopril dose increased 10 mg → 20 mg
2. Metformin frequency missing in later snapshot
3. Aspirin appears in earlier list but not later (reason unknown — unresolved)

**Demo flow (2–4 minutes):**

| Minute | Stage | Action |
|---|---|---|
| 0:00–0:30 | Open Patient | Select Morgan Lee; Patient Overview loads with alerts |
| 0:30–1:00 | Understand Patient | Review Problem List, Medication Workspace, Vitals & Labs; identify 3 discrepancies |
| 1:00–1:30 | Prepare Encounter | Run AI Encounter Preparation; review source-linked summary; accept/edit/reject |
| 1:30–2:00 | Document | Documentation Workspace with AI-assisted draft; clinician edits; commit |
| 2:00–2:30 | Review Actions | Clinical Diff shows 3 proposed changes; clinician accepts lisinopril dose change, rejects metformin frequency (insufficient evidence), defers aspirin |
| 2:30–3:00 | Complete Encounter | Encounter Completion shows no blocking items; clinician commits; audit record created |
| 3:00–4:00 | Buffer | Q&A, show alternative preset, demonstrate service-unavailable fallback |

**Demo mode:** Deterministic replay. No live model. No network calls to external AI services. Service-unavailable fallback demonstrated.

---

## MVP widgets (10 total)

| # | Widget | Size | Role in demo |
|---|--------|------|--------------|
| 1 | Patient Overview | Medium | Stage 1 — patient identity, encounter context, alerts |
| 2 | Problem List | Medium | Stage 2 — active conditions |
| 3 | Medication Workspace | Large | Stage 2 — current meds, patient-reported, discrepancies |
| 4 | Vitals & Labs | Medium | Stage 4 — current measurements, abnormal results |
| 5 | Allergy Workspace | Small | Stage 2 — allergy check before medication discussion |
| 6 | AI Encounter Preparation | Medium | Stage 3 — source-linked summary |
| 7 | Documentation Workspace | Large | Stage 5 — AI-assisted draft, clinician edits, commit |
| 8 | Orders & Proposed Actions | Medium | Stage 6 — accept/edit/reject proposed actions |
| 9 | Clinical Diff | Large | Stage 6 — exception-oriented change review |
| 10 | Encounter Completion | Small | Stage 7 — blocking items, commit |

**Not in MVP (explicitly rejected):** Patient Timeline, Problem-Oriented Context (separate), Patient Goals & Preferences, Imaging & Reports, Clinical Notes, Longitudinal Trends, Follow-Up & Instructions, Quick Actions, Inbox/Task Priorities, AI Assistant (separate widget).

---

## Build order (10 phases)

| Phase | Goal | Deliverables | Dependencies | Acceptance criteria | Tests | Risks | Fallback |
|---|---|---|---|---|---|---|---|
| **1 — Repository foundation** | Confirm stack, tooling, design system | Design system tokens, widget registry file, layout manager file, shared context hook | Existing repo (Next.js + React + TypeScript + Tailwind + Vitest) | `npm run typecheck` clean; `npm test` passes; `npm run build` succeeds | Existing 14 Vitest tests | Stack version conflicts | Use existing stack as-is |
| **2 — Synthetic patient data** | Coherent patient/encounter dataset | Fixture data (3 patients, 2 snapshots each), mock API boundary, data provenance records | Phase 1 | Fixture data loads; provenance hashes match; no real patient data | Fixture loading test | Data inconsistency | Use existing `src/lib/fixtures.ts` as base |
| **3 — Widget framework** | Registry, layout presets, context management, lifecycle | Widget registry, layout manager, shared context hook, add/remove/resize/rearrange | Phase 1, Phase 2 | Widget registry returns definitions; layout manager positions widgets; context updates on patient change | Widget framework tests | Layout complexity | Simpler layout (no drag, just preset) |
| **4 — Core clinical widgets** | Build 10 MVP widgets | All 10 widgets implemented with loading/empty/error states | Phase 1, Phase 2, Phase 3 | Each widget renders; loading/empty/error states work; data displays correctly | Widget component tests | Widget count too high | Reduce to 6 widgets (drop Vitals & Labs, Allergy Workspace) |
| **5 — Encounter workflow** | Connect widgets into continuous task | Cross-widget communication, context persistence, stage transitions | Phase 4 | Context persists across widgets; patient change updates all widgets | Workflow tests | Communication bugs | Simpler communication (manual refresh) |
| **6 — AI assistance** | Simulated AI behind stable interface | Model-provider abstraction, deterministic simulated output, AI unavailable fallback | Phase 3, Phase 5 | AI summary generates; fallback works when AI unavailable; evidence links present | AI tests | AI hallucination in demo | Deterministic text only (no model) |
| **7 — Clinical Diff** | Proposed-change review UI | Diff view, accept/edit/reject/defer, evidence-sufficiency gate | Phase 5 | Diff shows current vs. proposed; dispositions recorded; gate blocks unsafe proposals | Clinical Diff tests | Evidence linking bugs | Simpler diff (text only, no evidence spans) |
| **8 — Completion** | Encounter completion with audit | Encounter Completion widget, auditable result recording | Phase 5, Phase 7 | Encounter blocked with unresolved items; audit record created | Completion tests | Commit logic bugs | Manual commit (no audit) |
| **9 — Validation** | Functional, accessibility, workflow, safety tests | Test suite covering all phases | Phase 1–8 | 71+ Python tests pass; 14+ Vitest tests pass; safety gates verified | All tests | Test failures | Fix failures before demo |
| **10 — Demo stabilization** | Deterministic, rehearsable demo | Demo script, rehearsed 2–4 minute flow, failure recovery | Phase 1–9 | Demo runs end-to-end without live model; service-unavailable fallback works | Demo run-through | Demo flakiness | Record demo video as backup |

---

## Acceptance criteria

**Functional:**
- [ ] Clinician can open a patient and see Patient Overview within 5 seconds
- [ ] All 10 MVP widgets render with correct data
- [ ] Cross-widget communication works (patient change updates all widgets)
- [ ] AI Encounter Preparation generates summary with source links
- [ ] Clinical Diff shows 3 proposed changes (lisinopril dose, metformin frequency, aspirin absence)
- [ ] Clinician can accept/edit/reject/defer each proposed action
- [ ] Edited proposals require re-validation before commit
- [ ] Encounter Completion blocks completion with unresolved items
- [ ] Audit record created on encounter commit
- [ ] Service-unavailable fallback works (deterministic replay)

**Safety:**
- [ ] Evidence-sufficiency gate blocks proposals without literal evidence
- [ ] Abstention on missing required fields (no invention)
- [ ] Unauthorized changes blocked (missing dose/route/frequency for start/change)
- [ ] Rejected proposals produce no chart change
- [ ] Patient-reported medications labeled "observation, not an order"
- [ ] Missing data shown as "Not documented" (never as normal)
- [ ] No auto-commit of AI proposals

**Accessibility:**
- [ ] Keyboard navigation throughout (Tab, Enter, Escape)
- [ ] Focus-visible outlines
- [ ] Screen-reader labels on all interactive elements
- [ ] Color-not-only-meaning (status icons + text labels)
- [ ] Contrast standards (4.5:1 normal, 3:1 large)

**Performance (provisional):**
- [ ] Widget initial load < 500ms
- [ ] Layout reflow < 200ms
- [ ] Patient change < 1s

**Data:**
- [ ] All data is synthetic/fictional
- [ ] Every data point has sourceVersion and recordedAt
- [ ] No real patient data
- [ ] No production EHR integration

---

## Risks and mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Widget count too high for hackathon timeline | High | High | Reduce to 6 widgets (drop Vitals & Labs, Allergy Workspace) |
| AI hallucination in demo | Medium | High | Deterministic replay mode; no live model calls |
| Layout complexity (drag/resize) | Medium | Medium | Simpler layout (preset only, no drag in MVP) |
| Cross-widget communication bugs | Medium | Medium | Simpler communication (manual refresh instead of auto) |
| Demo flakiness | Medium | High | Record demo video as backup; rehearse 3+ times |
| Existing `feat/continuous-35b-ml-pipeline` branch confusion | Low | Medium | Keep branch separate; document in COMMUNICATION.md |
| Frontend duplication (`fresh-web/` branch) | Low | Medium | Coordinate with Utkarsh; don't overwrite |

---

## Fallback plan

If any phase cannot be completed:

| Phase | Fallback |
|---|---|
| Phase 3 (Widget framework) | Simpler layout (preset only, no drag/resize) |
| Phase 4 (10 widgets) | Reduce to 6 widgets (Patient Overview, Problem List, Medication Workspace, AI Encounter Preparation, Documentation Workspace, Clinical Diff) |
| Phase 6 (AI assistance) | Deterministic text only; no model simulation |
| Phase 7 (Clinical Diff) | Text-only diff (no evidence spans); manual disposition |
| Phase 8 (Completion) | Manual commit; no audit record |
| Phase 10 (Demo stabilization) | Recorded demo video |

---

## What the MVP does NOT claim

- Production EHR integration
- HIPAA compliance
- Clinical validation
- Real patient data
- AI clinical decision-making
- Unattended model training or promotion

---

**Last updated:** 2026-11-15
**Status:** Proposal — frozen for hackathon
**Next instruction for Antigravity:** Begin Phase 1 (Repository foundation) after reading `docs/ANTIGRAVITY_HANDOFF.md` and `docs/TECHNICAL_ARCHITECTURE.md`
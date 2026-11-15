# ANTIGRAVITY IMPLEMENTATION HANDOFF

**This is the single source of truth for the subsequent build phase.** Antigravity should read this document first and not invent fundamental product decisions. Where a decision remains uncertain, it is marked as **DECISION REQUIRED**.

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/continuous-35b-ml-pipeline` (pushed to origin)
**Repository URL:** https://github.com/hdukkola/clinical-diff-ehr-veritas
**Stack:** Next.js 16.4.6 + React 19.3.0 + TypeScript + Tailwind CSS 4 + Vitest (frontend); Python `fresh-backend/` (local synthetic medication-mention service); `veritas-editorial/` (standalone editorial UI)

**Core principle (set in stone):** AI proposes. Humans commit. The existing EHR remains the authoritative system of record. This is a redesigned clinician workflow experience, not a replacement medical database.

---

## 1. What exactly is this product?

**Product name:** Clinical Cockpit (working title)

**One-sentence description:** A modular, widget-based clinician workspace that sits above (or integrates with) an existing EHR, bringing relevant clinical information, encounter workflows, AI assistance, documentation, and proposed actions into one coherent workspace — so clinicians spend less time navigating tabs and reconstructing patient context, and more time making decisions.

**What it is NOT:**
- Not an AI hallucination detector
- Not a medication reconciliation tool (though it can surface discrepancies)
- Not an ambient AI scribe
- Not a clinical semantic integrity evaluator
- Not a patient chatbot
- Not a new EHR database built from scratch

**What it IS:**
1. Widget-based clinical interface
2. Contextual patient information
3. Workflow-focused interaction design
4. AI-powered assistance (proposal-only, human-approved)
5. Clinician-controlled actions
6. Source-aware information (every claim traces to a source)
7. Meaningful Clinical Diff (exception-oriented, not every trivial edit)
8. Existing EHR interoperability (SMART on FHIR / vendor adapters)

**Differentiation hypothesis (to be tested, not asserted):** Incumbents offer dashboards and AI summarization as point features. The differentiating claim is the *complete clinician workflow* — context-preserving transitions between stages (understand → prepare → document → review → complete) without mentally reconstructing the patient each time. This is easily copied by an incumbent; state that directly in the research ledger.

---

## 2. Who is the initial clinician user?

**Primary user:** A primary-care or ambulatory clinician (MD/DO/NP/PA) during a scheduled outpatient follow-up encounter.

**Not the initial target:**
- Emergency department clinician (different workflow, different urgency)
- Inpatient attending (different chart structure)
- Specialist surgeon (procedure-focused, not medication-focused)
- Medical assistant or nurse (different task set)

**Role assumptions:** The clinician has prescribing authority, can order labs/imaging, and is responsible for documenting the encounter. Role-based access control restricts write actions accordingly.

---

## 3. Which encounter are we optimizing?

**Encounter type:** Scheduled outpatient follow-up for a patient with at least one active chronic condition and at least one medication.

**Rationale:** This is where medication discrepancies, longitudinal context, and documentation burden are most visible, and where a widget-based cockpit shows measurable advantage over tabbed EHR navigation.

**Explicitly out of scope for MVP:** Emergency department, inpatient rounds, surgical pre-op, telehealth-only first visit.

---

## 4. What does the final demonstration look like?

**Demo length target:** 2–4 minutes.

**Demo mode:** Deterministic, synthetic, replay-safe. No live model dependency. No network calls to external AI services.

**Scenario (synthetic, fictional patient):** "Morgan Lee" — a 64-year-old fictional patient with hypertension and type 2 diabetes, on lisinopril 20 mg daily and metformin 500 mg twice daily, coming in for a follow-up. The encounter reveals:
- Lisinopril dose increased from 10 mg to 20 mg (documented in discharge summary, not in outpatient list)
- Metformin frequency missing in the later snapshot
- Aspirin appears in the earlier list but not the later list (reason unknown — unresolved discrepancy)

**Demo flow:**
1. Open patient → see Patient Overview with high-priority alerts (ACE inhibitor + diabetes, unresolved aspirin discrepancy)
2. Review Problem-Oriented Context (problems organized by condition, not by EHR menu category)
3. Review Medication Workspace (current chart meds, patient-reported meds, discrepancies highlighted)
4. Run AI Encounter Preparation (source-linked, clinician-reviewable summary)
5. Inspect Clinical Diff (only non-trivial changes: lisinopril dose, metformin frequency, aspirin absence)
6. Edit a documentation draft in Documentation Workspace (AI-assisted draft, clinician edits)
7. Accept/Edit/Reject a proposed action in Orders & Proposed Actions
8. Encounter Completion shows outstanding required tasks; clinician commits

**Failure recovery included in demo:** Service unavailable → falls back to deterministic replay → demo continues without live AI.

---

## 5. Which widgets are included? (MVP set)

| # | Widget | Category | Priority |
|---|--------|----------|----------|
| 1 | Patient Overview | Patient context | MUST BUILD |
| 2 | Problem List | Patient context | MUST BUILD |
| 3 | Medication Workspace | Medication & safety | MUST BUILD |
| 4 | Allergy Workspace | Medication & safety | SHOULD BUILD |
| 5 | Vitals & Labs | Clinical information | MUST BUILD |
| 6 | AI Encounter Preparation | Encounter workflow | MUST BUILD |
| 7 | Documentation Workspace | Encounter workflow | MUST BUILD |
| 8 | Orders & Proposed Actions | Encounter workflow | MUST BUILD |
| 9 | Clinical Diff | Encounter workflow | MUST BUILD |
| 10 | Encounter Completion | Encounter workflow | MUST BUILD |
| 11 | Search & Command Palette | Productivity | IF TIME |
| 12 | Since Last Visit | Patient context | IF TIME |
| 13 | Clinical Alerts | Medication & safety | IF TIME |

**Rejected (do not build for MVP):** Patient Timeline, Problem-Oriented Context (as separate widget — fold into Problem List), Patient Goals & Preferences, Imaging & Reports, Clinical Notes, Longitudinal Trends, Follow-Up & Instructions, Quick Actions, Inbox/Task Priorities, AI Assistant (as separate widget — fold into AI Encounter Preparation).

**Rationale for rejection:** Reduce surface area for the hackathon. Problem-Oriented Context is folded into Problem List. AI Assistant is folded into AI Encounter Preparation. Imaging/Notes/Trends are not needed for the medication-focused demo.

---

## 6. What does each widget do?

See `docs/WIDGET_CATALOG.md` for the full catalog with every widget's clinical purpose, data requirements, FHIR resources, AI involvement, actions, sizes, states, safety risks, and success metrics. Below is the summary for the 10 MVP widgets:

**Patient Overview:** Shows patient identity, encounter context, reason for visit, significant alerts (allergies, unresolved discrepancies), and high-priority information. Always visible; never collapsible.

**Problem List:** Active and historical conditions with links to supporting history. Organized around active problems, not EHR menu categories.

**Medication Workspace:** Current documented medications, patient-reported medications, prescription information, and unresolved discrepancies. Separates chart facts from patient-reported observations.

**Allergy Workspace:** Documented allergies, reactions, confidence/verification information, and source evidence.

**Vitals & Labs:** Current measurements, recent results, abnormal and pending results, problem-relevant results.

**AI Encounter Preparation:** Source-linked, clinician-reviewable preparation summary generated by AI. The clinician must review and accept/edit/reject before it becomes part of the encounter record.

**Documentation Workspace:** Structured or problem-oriented documentation with optional AI-assisted draft generation. Clinician edits are required before commit.

**Orders & Proposed Actions:** Draft actions for clinician review. Clear visual distinction between suggestions (AI-proposed), drafts (clinician-edited), and committed EHR state.

**Clinical Diff:** Exception-oriented proposed changes with supporting evidence. Does not force review of every trivial text edit. Shows current state vs. proposed state, evidence linked to source text, authority, uncertainty.

**Encounter Completion:** Shows outstanding required tasks before the encounter can be considered completed. Clinician commits or defers.

---

## 7. What data drives each widget?

All widgets are driven by a shared `PatientContext` and `EncounterContext` (see `docs/TECHNICAL_ARCHITECTURE.md` for full data contracts).

**Synthetic demo data:** Two fictional patients (Morgan Lee, Elena Rostova, Marcus Vance) with two snapshots each (earlier/later medication lists). All data is fictional; no real patient data is used.

**FHIR resources used (read-only simulation):**
- `Patient`
- `Encounter`
- `Condition`
- `Observation` (vitals, labs)
- `MedicationRequest`
- `MedicationStatement`
- `AllergyIntolerance`
- `DiagnosticReport`
- `DocumentReference`
- `CarePlan`
- `Provenance`
- `AuditEvent`

**Write path:** Simulated local writes only. No real EHR writes in MVP.

**Data classification (every field tagged):**
- `authoritative` — from the EHR system of record
- `derived` — computed by the application (e.g., diff results)
- `synthetic` — demo fixture data
- `generated` — AI-produced (requires clinician review)
- `pending_clinician_review` — proposed change awaiting accept/edit/reject

---

## 8. How do widgets communicate?

Through **typed application events / shared state**, not arbitrary widget-to-widget coupling.

**Communication contract:**
```
INPUT (widget A) → APPLICATION STATE → OUTPUT (widget B)
```

**Example:** A clinician clicks an abnormal laboratory result in Vitals & Labs:
1. Widget A dispatches `clinical-event-selected` event with `{ type: 'observation', id: 'obs-123' }`
2. Application state updates `selectedClinicalEvent`
3. Problem List widget subscribes to `selectedClinicalEvent` and highlights the corresponding condition
4. Patient Timeline navigates to the relevant result timestamp
5. Documentation Workspace offers to retrieve the source document (clinician-initiated)

**Auto-synchronized (no user intent needed):**
- Selected patient change → all widgets update
- Selected encounter change → all widgets update
- Proposed change accepted/rejected → Clinical Diff and Orders & Proposed Actions update

**Requires user intent (NOT auto-synchronized):**
- AI-generated draft → Documentation Workspace (clinician must accept/edit/reject)
- Proposed medication change → Orders & Proposed Actions (clinician must accept/edit/reject)
- Cross-widget navigation (clicking a result to jump to timeline)

---

## 9. How are widgets added, removed, resized, and rearranged?

**Add widget flow:**
1. Clinician opens "Add Widget" from command palette (Ctrl+K) or workspace menu
2. Widget catalog appears (searchable, filterable by category)
3. Clinician browses descriptions, previews data/layout expectations
4. Clinician selects size (small/medium/large/full)
5. Widget inserts at a predictable position (next available grid slot)
6. Widget can be rearranged afterward

**Remove widget:** Click remove on widget header; optional widgets only. Required widgets (Patient Overview, Encounter Completion) cannot be removed.

**Resize:** Drag widget corner/edge; snaps to grid; respects min/max dimensions from widget registry.

**Rearrange:** Drag widget header; grid snaps; other widgets reflow.

**Persistence:** Layout saved to browser `localStorage` (session-only for MVP). Presets saved as named layouts.

**Reset:** "Restore default" button returns to preset layout.

**Role-based restrictions:** Widgets can be restricted by clinician role, specialty, and encounter type (MVP: single role, no specialization).

**Not an app store:** The widget catalog is curated, not open. No third-party widget installation in MVP.

---

## 10. What are the default layout and alternate preset?

**Default layout (three-column desktop):**
- Left rail (248px): Navigation, patient search, workspace controls
- Center column (flexible): Primary widgets stacked vertically (Patient Overview → Problem List → Medication Workspace → Vitals & Labs → Documentation Workspace)
- Right rail (244px): Secondary widgets (Allergy Workspace, Clinical Alerts, AI Encounter Preparation summary, Orders & Proposed Actions, Encounter Completion)

**Alternate preset (Medication-focused encounter):**
- Left rail: Navigation
- Center column: Medication Workspace (large), Clinical Diff (medium), Orders & Proposed Actions (medium)
- Right rail: Patient Overview (small), Allergy Workspace (small), Vitals & Labs (small)

**MVP:** Only the default layout is built. The alternate preset is specified but not built.

**Layout constraints:**
- Column constraints: left rail fixed width; center column flexible; right rail fixed width
- Grid snapping: 12-column virtual grid
- Density controls: compact/comfortable/spacious (MVP: comfortable only)
- Responsive: desktop-first; tablet considered; phone not assumed

---

## 11. What is AI allowed to do?

**AI may:**
- Summarize the chart (read-only)
- Prepare an encounter summary (source-linked, clinician-reviewable)
- Retrieve relevant clinical information
- Identify relevant history
- Draft documentation (clinician must edit before commit)
- Extract structured data from notes (dose, route, frequency, timing)
- Propose actions (clinician must accept/edit/reject)
- Draft follow-up instructions
- Detect clinical changes
- Attribute sources for every claim
- Identify missing information
- Assess Clinical Diff (exception-oriented)

**AI may NOT:**
- Write directly to the EHR
- Prescribe or discontinue medications
- Hold unrestricted EHR write credentials
- Make clinical decisions autonomously
- Replace clinician judgment

**AI structure:**
```
INPUT → MODEL OPERATION → STRUCTURED OUTPUT → VALIDATION → HUMAN REVIEW → DESTINATION
```

**Model-provider abstraction:** The application must support swapping the model provider. Initially uses deterministic simulated output or a permitted development model. Later integrates a cloud-hosted model. The frontend must NOT depend on a particular model.

**AI unavailable fallback:** The EHR workspace must remain usable if AI is unavailable (deterministic replay mode).

---

## 12. What requires clinician review?

**Always requires clinician review (accept/edit/reject before any effect):**
- AI-generated documentation drafts
- AI-proposed medication actions (start/stop/change/taper/continue/restart)
- AI-detected clinical discrepancies
- AI-assigned confidence/uncertainty levels
- Evidence-span accuracy (literal match ≠ semantic support)

**Clinician review dispositions:**
- **Accept** — the proposal is correct as-is
- **Edit** — the proposal needs modification (re-validation required before commit)
- **Reject** — the proposal is incorrect; no chart change
- **Defer** — review later; no chart change now

**Never requires clinician review (read-only, informational):**
- Patient Overview static content
- Problem List display
- Vitals & Labs display
- Medication Workspace display (read-only)
- Audit log entries

---

## 13. What is simulated?

**Simulated in MVP:**
- All patient data (fictional patients: Morgan Lee, Elena Rostova, Marcus Vance)
- All EHR reads (local fixture data, not real FHIR server)
- All EHR writes (local write preview, not committed to any real system)
- AI model responses (deterministic simulated output; no live model calls in demo mode)
- Backend service (Python `fresh-backend/` runs locally on 127.0.0.1:8765)
- launchd scheduler (plist template provided, NOT auto-installed)

**NOT simulated:**
- The widget system architecture
- The data contracts
- The safety gates (evidence sufficiency, abstention, unauthorized-change blocking)
- The test suite (71 Python tests + 14 Vitest tests, all passing)

---

## 14. What is a real integration?

**Real integrations (specified, not implemented in MVP):**
- SMART on FHIR authorization flow
- FHIR R4 resource schemas (Patient, Encounter, Condition, Observation, MedicationRequest, MedicationStatement, AllergyIntolerance, DiagnosticReport, DocumentReference, CarePlan, Provenance, AuditEvent)
- CDS Hooks (specified, not implemented)
- Vendor-specific adapters (Epic, Oracle Health, athenahealth — specified as adapter interfaces, not implemented)

**Integration layer design:**
- Vendor-neutral internal clinical representation
- Vendor-specific adapters (one per EHR vendor)
- Adapter interface: `health()`, `load(patientId)`, `write(proposedChange)` (write simulated in MVP)

**Do not claim:** Production EHR integration, HIPAA compliance, real FHIR server connectivity, or clinical validation.

---

## 15. What framework/architecture should be used?

**Frontend:** Next.js 16.4.6 (already in repo) + React 19.3.0 + TypeScript + Tailwind CSS 4

**Widget system:** Custom widget registry (React components registered by ID), not a heavy third-party dashboard library. Rationale: keeps control, avoids nested scrolling, avoids widget overlap.

**State management:** React context + custom hooks (shared clinical context). No Redux or Zustand in MVP.

**Data fetching:** Native `fetch` + SWR-like caching pattern (custom hook). No heavy data-fetching library.

**Backend:** Python `fresh-backend/service.py` (existing local service, 127.0.0.1:8765)

**Testing:** Vitest (frontend, 14 tests passing) + Python unittest (backend, 71 tests passing)

**Accessibility:** WCAG 2.1 AA target; keyboard navigation; focus management; screen-reader labels

**Mobile:** Desktop-first; tablet considered; phone not assumed

---

## 16. What should be built first? (Build order)

**Phase 1 — Repository foundation:** Confirm stack, structure, tooling, test setup, design system. (Days 1–2)
**Phase 2 — Synthetic patient data:** Create coherent patient/encounter dataset and mock API boundary. (Days 2–3)
**Phase 3 — Widget framework:** Registry, layout presets, context management, widget lifecycle. (Days 4–6)
**Phase 4 — Core clinical widgets:** Build the 10 MVP widgets. (Days 7–10)
**Phase 5 — Encounter workflow:** Connect widgets into one continuous clinical task. (Days 11–13)
**Phase 6 — AI assistance:** Integrate simulated AI services behind stable interface. (Days 14–15)
**Phase 7 — Clinical Diff:** Implement proposed-change review. (Days 16–17)
**Phase 8 — Completion:** Simulate finishing the encounter; record auditable result. (Day 18)
**Phase 9 — Validation:** Functional, accessibility, workflow, safety tests. (Days 19–20)
**Phase 10 — Demo stabilization:** Deterministic, rehearsable demo mode. (Days 21–22)

**Each phase has:** Goal, deliverables, dependencies, acceptance criteria, tests, known risks, fallback.

---

## 17. How is each feature tested?

**Frontend (Vitest):** Component tests for each widget; layout tests; context persistence tests; AI fallback tests; accessibility tests (keyboard navigation, focus management). Target: 14+ tests passing.

**Backend (Python unittest):** Service health checks; comparison determinism; replay mode validation; error handling. Target: 71+ tests passing.

**Integration:** End-to-end demo flow test (open patient → review diff → accept action → complete encounter). Deterministic; no live model.

**Accessibility:** Keyboard-only navigation; screen-reader labels; focus-visible outlines; color-not-only-meaning.

**Safety:** Evidence-sufficiency gate test; abstention test; unauthorized-change blocking test; rejected-proposal-no-chart-change test.

**Performance:** Widget load time; layout reflow time; memory usage with 10+ widgets. Measurement methods defined; no invented benchmarks.

---

## 18. What should NOT be built?

| Feature | Reason |
|---|---|
| Real EHR write path | MVP simulates writes only; no production EHR integration |
| Patient chatbot | Out of scope; not the product |
| Ambient AI scribe | Out of scope |
| Full phone workflow | Desktop-first; phone not assumed |
| Open widget app store | Curated catalog only |
| Problem-Oriented Context as separate widget | Folded into Problem List |
| Patient Timeline | Out of MVP scope |
| Imaging & Reports | Out of MVP scope |
| Longitudinal Trends | Out of MVP scope |
| Inbox/Task Priorities | Out of MVP scope |
| Quick Actions (unsafe parallel write path) | Safety risk; not needed |
| HIPAA compliance claim | MVP uses synthetic data; do not claim compliance |
| Clinical validation claim | Synthetic tests only; do not claim clinical safety |

---

## 19. What remains uncertain?

| Uncertainty | Impact | Required approval |
|---|---|---|
| Whether widget customization actually improves workflow vs. shifting configuration burden to clinicians | High (product viability) | Human project owner (Himnish) |
| Whether Epic/other incumbents already offer configurable dashboards | High (differentiation) | Competitor research |
| Whether clinicians prefer customizable workspace vs. consistent standard interface | Medium (UX decision) | Usability testing |
| Whether the existing `feat/continuous-35b-ml-pipeline` branch should be merged or kept separate | Medium (repo hygiene) | Human project owner |
| Whether `fresh-web/` frontend branch (Utkarsh's work) should be integrated | Medium (frontend duplication) | Coordinate with Utkarsh |
| Whether `veritas-editorial/` should be the basis for the widget cockpit or rebuilt | High (architecture) | Human project owner + Antigravity |

---

## 20. What must be reviewed before implementation starts?

1. **Product scope confirmation:** Confirm the widget-based cockpit (not a medication reconciliation tool, scribe, or governance platform) is the intended product. (Human project owner)
2. **Widget MVP set:** Confirm the 10 MVP widgets are correct; confirm rejected widgets are truly out of scope. (Human project owner + Antigravity)
3. **Data contracts:** Review `PatientContext`, `EncounterContext`, `WidgetDefinition`, `WidgetInstance`, `ProposedChange`, `ClinicalDiffEntry`, `ReviewDisposition`, `AuditRecord` schemas in `docs/TECHNICAL_ARCHITECTURE.md`. (Antigravity + human project owner)
4. **Safety gates:** Review evidence-sufficiency gate, abstention logic, unauthorized-change blocking in `docs/TECHNICAL_ARCHITECTURE.md`. (Antigravity)
5. **AI provider abstraction:** Confirm the model-provider abstraction approach and fallback behavior. (Antigravity)
6. **EHR integration approach:** Confirm vendor-neutral internal representation + vendor-specific adapters strategy. (Antigravity)
7. **Build order:** Confirm the 10-phase build order and phase acceptance criteria. (Antigravity)
8. **Demo scenario:** Confirm the Morgan Lee scenario and 2–4 minute demo flow. (Human project owner)
9. **Repository hygiene:** Decide whether `feat/continuous-35b-ml-pipeline` merges to main or stays separate. (Human project owner)
10. **Frontend duplication:** Decide whether `fresh-web/` (Utkarsh's branch) integrates with the new widget cockpit or stays separate. (Coordinate with Utkarth)

---

## Implementation Checklist

**Before writing any React components:**
- [ ] Read `docs/ANTIGRAVITY_HANDOFF.md` in full
- [ ] Read `docs/WIDGET_CATALOG.md` for widget specs
- [ ] Read `docs/CLINICAL_WORKFLOW.md` for workflow
- [ ] Read `docs/TECHNICAL_ARCHITECTURE.md` for data contracts
- [ ] Read `docs/MVP_SPECIFICATION.md` for build order and acceptance criteria
- [ ] Read `docs/RESEARCH_LEDGER.md` for open questions
- [ ] Review COMMUNICATION.md for team coordination rules
- [ ] Review README.md for project constraints
- [ ] Confirm stack: Next.js 16.4.6 + React 19.3.0 + TypeScript + Tailwind CSS 4 + Vitest
- [ ] Run existing tests: `npm test` (14 Vitest tests) and `python3 -m unittest discover -s fresh-backend -p 'test_*.py'` (71 Python tests)
- [ ] Run typecheck: `npm run typecheck`
- [ ] Run build: `npm run build`

**Phase 1 (Repository foundation):**
- [ ] Confirm `src/lib/types.ts` contracts match `docs/TECHNICAL_ARCHITECTURE.md` data contracts
- [ ] Set up design system (typography, color, spacing)
- [ ] Create widget registry file
- [ ] Create layout manager file
- [ ] Create shared clinical context hook
- [ ] Add widget system tests

**Phase 2 (Synthetic patient data):**
- [ ] Create coherent patient/encounter dataset (fictional patients only)
- [ ] Create mock API boundary
- [ ] Add data provenance records (version, source, hash)
- [ ] Add dataset manifest

**Phase 3 (Widget framework):**
- [ ] Implement widget registry
- [ ] Implement layout presets (default + medication-focused)
- [ ] Implement shared context management
- [ ] Implement widget lifecycle (add, remove, resize, rearrange)
- [ ] Add framework tests

**Phase 4 (Core clinical widgets):**
- [ ] Build Patient Overview
- [ ] Build Problem List
- [ ] Build Medication Workspace
- [ ] Build Allergy Workspace
- [ ] Build Vitals & Labs
- [ ] Add widget tests

**Phase 5 (Encounter workflow):**
- [ ] Connect widgets into continuous clinical task
- [ ] Implement cross-widget communication
- [ ] Implement context persistence (localStorage)
- [ ] Add workflow tests

**Phase 6 (AI assistance):**
- [ ] Implement model-provider abstraction
- [ ] Implement deterministic simulated AI output
- [ ] Implement AI unavailable fallback
- [ ] Add AI tests

**Phase 7 (Clinical Diff):**
- [ ] Implement proposed-change review UI
- [ ] Implement accept/edit/reject/defer dispositions
- [ ] Implement evidence-sufficiency gate
- [ ] Add Clinical Diff tests

**Phase 8 (Completion):**
- [ ] Implement encounter completion UI
- [ ] Implement auditable result recording
- [ ] Add completion tests

**Phase 9 (Validation):**
- [ ] Run functional tests
- [ ] Run accessibility tests
- [ ] Run workflow tests
- [ ] Run safety tests (evidence gate, abstention, unauthorized change)
- [ ] Fix failures

**Phase 10 (Demo stabilization):**
- [ ] Create deterministic demo mode
- [ ] Rehearse 2–4 minute demo flow
- [ ] Record demo video (optional)

---

## Documents referenced by this handoff

| Document | Purpose | Location |
|---|---|---|
| Widget Catalog | Full widget specs with constraints | `docs/WIDGET_CATALOG.md` |
| Clinical Workflow | End-to-end encounter flow + scenario | `docs/CLINICAL_WORKFLOW.md` |
| Technical Architecture | Frontend/backend/widget/AI/data contracts | `docs/TECHNICAL_ARCHITECTURE.md` |
| MVP Specification | Frozen demo, build order, acceptance criteria | `docs/MVP_SPECIFICATION.md` |
| Research Ledger | Verified evidence, competitor corrections, open questions | `docs/RESEARCH_LEDGER.md` |
| Communication | Team coordination protocol | `COMMUNICATION.md` |
| Project README | Project overview, run instructions, limitations | `README.md` |
| Workstreams | Role assignments, next tasks | `docs/WORKSTREAMS.md` |
| Backend README | Local service contract | `fresh-backend/README.md` |
| Editorial README | Editorial UI launch instructions | `veritas-editorial/README.md` |
| Arena Research Request | Data request if training data insufficient | `ARENA_RESEARCH_REQUEST.md` |

---

**Last updated:** 2026-11-15
**Status:** Ready for Antigravity implementation
**Next instruction for Antigravity:** Read this document in full, then read `docs/WIDGET_CATALOG.md` and `docs/TECHNICAL_ARCHITECTURE.md`, then begin Phase 1 (Repository foundation). Do not implement application code until all 20 questions above are understood and the 10 pre-implementation checklist items are complete.
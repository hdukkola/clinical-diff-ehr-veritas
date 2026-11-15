# Widget Catalog — Clinical Cockpit

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/continuous-35b-ml-pipeline`
**Status:** Proposal — not yet implemented
**Related documents:**
- `docs/ANTIGRAVITY_HANDOFF.md` — implementation handoff (read first)
- `docs/TECHNICAL_ARCHITECTURE.md` — data contracts and widget registry schema
- `docs/CLINICAL_WORKFLOW.md` — end-to-end encounter flow

---

## How to read this catalog

Each widget entry specifies:

| Field | Meaning |
|---|---|
| **Clinical purpose** | What clinical problem the widget solves |
| **Primary user** | Which clinician role uses it most |
| **Information displayed** | What the widget shows |
| **Information hierarchy** | Most important → least important within the widget |
| **Data requirements** | What FHIR resources or data fields are needed |
| **FHIR resources** | Which FHIR R4 resources back this widget |
| **AI involvement** | Whether AI is involved and in what capacity |
| **Clinician actions** | What the clinician can do in this widget |
| **Available sizes** | Small / Medium / Large / Full (per widget registry) |
| **Loading state** | What shows while data is fetching |
| **Empty state** | What shows when no data exists |
| **Error state** | What shows when data fails |
| **Stale-data behavior** | How old data is indicated |
| **Evidence/source access** | How to trace claims to source |
| **Permissions** | Role-based access |
| **Dependencies** | Other widgets or context this needs |
| **Safety risks** | What could go wrong |
| **MVP classification** | MUST BUILD / SHOULD BUILD / IF TIME / POST-HACKATHON / DO NOT BUILD |
| **Success measurement** | How to tell if the widget is useful |

**Classification definitions:**
- **MUST BUILD:** Required for the 2–4 minute demo; build in Phase 4
- **SHOULD BUILD:** High value; build if Phase 4 finishes early
- **IF TIME:** Build only after all MUST BUILD and SHOULD BUILD are done
- **POST-HACKATHON:** Build after the hackathon
- **DO NOT BUILD:** Explicitly rejected; do not implement

---

## Category A — Patient context widgets

### A1. Patient Overview

| Field | Specification |
|---|---|
| **Clinical purpose** | Surface patient identity, encounter context, reason for visit, significant alerts, and high-priority information at a glance |
| **Primary user** | Any clinician opening a patient chart |
| **Information displayed** | Patient name, ID, age, sex (fictional/demo), encounter ID, encounter date, reason for visit, active problems count, active medications count, allergies count, unresolved discrepancies count, high-priority alerts |
| **Information hierarchy** | 1. Patient name + ID 2. Encounter context 3. High-priority alerts (allergies, unresolved discrepancies) 4. Summary counts |
| **Data requirements** | Patient identity, encounter record, active conditions, active medications, allergies, unresolved discrepancies |
| **FHIR resources** | `Patient`, `Encounter`, `Condition`, `MedicationStatement`, `AllergyIntolerance` |
| **AI involvement** | None (read-only display) |
| **Clinician actions** | Open patient, open encounter, navigate to another widget |
| **Available sizes** | Medium (default), Large, Full |
| **Loading state** | Skeleton: "Loading patient context…" |
| **Empty state** | "No patient selected. Select a patient from the navigation rail." |
| **Error state** | "Unable to load patient context. Check data connection." |
| **Stale-data behavior** | Show "Data as of [timestamp]" with refresh button |
| **Evidence/source access** | Source label and date shown under each count |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context (selected patient, selected encounter) |
| **Safety risks** | Showing wrong patient's data; missing allergy alert |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician can identify patient and encounter within 5 seconds; allergy alert visible without scrolling |

### A2. Patient Timeline

| Field | Specification |
|---|---|
| **Clinical purpose** | Chronological view of clinical events: admissions, encounters, results, care transitions |
| **Primary user** | Clinician reviewing longitudinal history |
| **Information displayed** | Date, event type, source, summary, linked widget |
| **Information hierarchy** | 1. Most recent event 2. Event date 3. Event type 4. Summary |
| **Data requirements** | Encounter records, diagnostic reports, document references, care plans |
| **FHIR resources** | `Encounter`, `DiagnosticReport`, `DocumentReference`, `CarePlan` |
| **AI involvement** | None |
| **Clinician actions** | Click event to navigate to source; filter by event type |
| **Available sizes** | Large (default), Full |
| **Loading state** | Skeleton timeline |
| **Empty state** | "No timeline events available for this patient." |
| **Error state** | "Unable to load timeline." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source label and date per event |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Missing a recent hospitalization; showing events out of order |
| **MVP classification** | DO NOT BUILD (out of MVP scope; not needed for medication-focused demo) |
| **Success measurement** | N/A (not built) |

### A3. Problem List

| Field | Specification |
|---|---|
| **Clinical purpose** | Active and historical conditions with links to supporting history; organized around active problems |
| **Primary user** | Any clinician |
| **Information displayed** | Condition name, onset date, status (active/resolved), source, related medications, related problems |
| **Information hierarchy** | 1. Active conditions (top) 2. Historical conditions 3. Related medications per condition |
| **Data requirements** | Conditions, onset dates, status, related medications |
| **FHIR resources** | `Condition`, `MedicationStatement` |
| **AI involvement** | None |
| **Clinician actions** | Click condition to see related medications; filter active/resolved |
| **Available sizes** | Medium (default), Large |
| **Loading state** | Skeleton list |
| **Empty state** | "No conditions documented." |
| **Error state** | "Unable to load problem list." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source encounter and date per condition |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Missing an active condition; showing resolved condition as active |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician can identify active conditions within 10 seconds; condition→medication link works |

### A4. Problem-Oriented Context

| Field | Specification |
|---|---|
| **Clinical purpose** | Information organized around active clinical problems rather than EHR menu categories |
| **Primary user** | Clinician managing complex patients |
| **Information displayed** | Problem-centered cards: condition, related medications, recent results, open tasks |
| **Information hierarchy** | 1. Primary problem 2. Related data 3. Secondary problems |
| **Data requirements** | Conditions, medications, observations, tasks |
| **FHIR resources** | `Condition`, `MedicationStatement`, `Observation`, `CarePlan` |
| **AI involvement** | None |
| **Clinician actions** | Click problem to focus; add related task |
| **Available sizes** | Large, Full |
| **Loading state** | Skeleton cards |
| **Empty state** | "No active problems." |
| **Error state** | "Unable to load problem-oriented context." |
| **Stale-data behavior** | Show "Data as of [timestamp]" per card |
| **Evidence/source access** | Source per data point |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Problem List widget |
| **Safety risks** | Duplicating Problem List; splitting attention |
| **MVP classification** | DO NOT BUILD (folded into Problem List for MVP; see ANTIGRAVITY_HANDOFF.md rejection rationale) |
| **Success measurement** | N/A (not built as separate widget) |

### A5. Since Last Visit

| Field | Specification |
|---|---|
| **Clinical purpose** | Changes since the last encounter: new results, hospitalizations, medication changes, unresolved follow-up |
| **Primary user** | Clinician preparing for follow-up |
| **Information displayed** | Change type, date, description, source, action needed |
| **Information hierarchy** | 1. Medication changes 2. New results 3. Hospitalizations 4. Unresolved follow-up |
| **Data requirements** | Prior encounter, current encounter, medication changes, results |
| **FHIR resources** | `Encounter`, `MedicationStatement`, `Observation`, `DiagnosticReport` |
| **AI involvement** | None |
| **Clinician actions** | Click change to review; mark as addressed |
| **Available sizes** | Medium, Large |
| **Loading state** | Skeleton list |
| **Empty state** | "No changes since last visit." |
| **Error state** | "Unable to load changes." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source encounter per change |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context (two encounters needed) |
| **Safety risks** | Missing a change; showing a change that isn't clinically significant |
| **MVP classification** | IF TIME |
| **Success measurement** | Clinician can identify top 3 changes within 15 seconds |

### A6. Patient Goals and Preferences

| Field | Specification |
|---|---|
| **Clinical purpose** | Patient goals, social context, preferences, care priorities |
| **Primary user** | Clinician during care planning |
| **Information displayed** | Goal, target date, status, preference, source |
| **Information hierarchy** | 1. Active goals 2. Preferences 3. Social context |
| **Data requirements** | Care plans, patient preferences |
| **FHIR resources** | `CarePlan`, `Patient` |
| **AI involvement** | None |
| **Clinician actions** | View goal; add note |
| **Available sizes** | Small, Medium |
| **Loading state** | Skeleton |
| **Empty state** | "No goals or preferences documented." |
| **Error state** | "Unable to load goals." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source care plan |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Showing outdated preference as current |
| **MVP classification** | DO NOT BUILD (out of MVP scope) |
| **Success measurement** | N/A |

---

## Category B — Medication and safety widgets

### B7. Medication Workspace

| Field | Specification |
|---|---|
| **Clinical purpose** | Current documented medications, patient-reported medications, prescription information, and unresolved discrepancies |
| **Primary user** | Any clinician managing medications |
| **Information displayed** | Medication name, dose, unit, route, frequency, duration, status (chart/current/patient-reported), source, discrepancy flag |
| **Information hierarchy** | 1. Chart medications (authoritative) 2. Patient-reported (observation, not order) 3. Discrepancies (highlighted) |
| **Data requirements** | Medications, doses, routes, frequencies, sources, discrepancy flags |
| **FHIR resources** | `MedicationStatement`, `MedicationRequest` |
| **AI involvement** | None for display; AI may flag discrepancies (clinician reviews) |
| **Clinician actions** | Click medication to edit; mark discrepancy as reviewed; separate patient-reported from chart |
| **Available sizes** | Large (default), Full |
| **Loading state** | Skeleton table |
| **Empty state** | "No medications documented." |
| **Error state** | "Unable to load medications." |
| **Stale-data behavior** | Show "Data as of [timestamp]" per medication |
| **Evidence/source access** | Source snapshot/encounter per medication; evidence span link |
| **Permissions** | Read: any authenticated clinician; Write: prescribing clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Confusing patient-reported with chart-authorized; missing a discrepancy |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician can distinguish chart vs. patient-reported meds within 10 seconds; discrepancies highlighted |

### B8. Allergy Workspace

| Field | Specification |
|---|---|
| **Clinical purpose** | Documented allergies, reactions, confidence/verification, source evidence |
| **Primary user** | Any clinician before prescribing |
| **Information displayed** | Allergen, reaction, severity, confidence, verification status, source, date |
| **Information hierarchy** | 1. Active allergies (high severity first) 2. Historical allergies 3. Verification status |
| **Data requirements** | Allergen, reaction, severity, confidence, source |
| **FHIR resources** | `AllergyIntolerance` |
| **AI involvement** | None |
| **Clinician actions** | Click allergy to view source; mark as reviewed |
| **Available sizes** | Small (default), Medium |
| **Loading state** | Skeleton list |
| **Empty state** | "No allergies documented." |
| **Error state** | "Unable to load allergies." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source encounter per allergy |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Missing a high-severity allergy; showing unverified allergy as confirmed |
| **MVP classification** | SHOULD BUILD |
| **Success measurement** | Allergy visible within 5 seconds of opening patient; severity color-coded (not color-only meaning) |

### B9. Medication Changes

| Field | Specification |
|---|---|
| **Clinical purpose** | Review recent medication-related changes without conflating prescriptions, dispensing, and actual reported use |
| **Primary user** | Clinician during medication reconciliation |
| **Information displayed** | Medication, change type (started/stopped/dosed changed/continued), date, source, rationale |
| **Information hierarchy** | 1. Most recent change 2. Change type 3. Rationale |
| **Data requirements** | Medication changes, dates, sources, rationales |
| **FHIR resources** | `MedicationRequest`, `MedicationStatement` |
| **AI involvement** | None |
| **Clinician actions** | Click change to view source; mark as reviewed |
| **Available sizes** | Medium, Large |
| **Loading state** | Skeleton list |
| **Empty state** | "No recent medication changes." |
| **Error state** | "Unable to load changes." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source per change |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Medication Workspace |
| **Safety risks** | Showing a change that didn't happen; missing a real change |
| **MVP classification** | IF TIME |
| **Success measurement** | Clinician can identify most recent change within 10 seconds |

### B10. Clinical Alerts

| Field | Specification |
|---|---|
| **Clinical purpose** | Focused view of relevant safety concerns without alert overload |
| **Primary user** | Any clinician |
| **Information displayed** | Alert type, severity, description, source, action required, dismiss option |
| **Information hierarchy** | 1. High severity (red, not color-only) 2. Medium severity 3. Low severity |
| **Data requirements** | Allergies, drug interactions, contraindications, discrepancies |
| **FHIR resources** | `AllergyIntolerance`, `MedicationStatement` |
| **AI involvement** | None (rule-based) |
| **Clinician actions** | Acknowledge; dismiss; view source |
| **Available sizes** | Small, Medium |
| **Loading state** | Skeleton |
| **Empty state** | "No active alerts." |
| **Error state** | "Unable to load alerts." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source per alert |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Allergy Workspace, Medication Workspace |
| **Safety risks** | Alert fatigue (too many alerts); missing a critical alert |
| **MVP classification** | IF TIME |
| **Success measurement** | Clinician acknowledges alerts within 30 seconds; alert count < 5 per encounter |

---

## Category C — Clinical information widgets

### C11. Vitals

| Field | Specification |
|---|---|
| **Clinical purpose** | Current measurements and relevant trends |
| **Primary user** | Any clinician |
| **Information displayed** | Vital type, value, unit, date, status (normal/abnormal), reference range |
| **Information hierarchy** | 1. Abnormal values (highlighted) 2. Most recent 3. Historical trend |
| **Data requirements** | Vital signs, values, units, dates, reference ranges |
| **FHIR resources** | `Observation` |
| **AI involvement** | None |
| **Clinician actions** | Click vital to see trend; filter by type |
| **Available sizes** | Medium, Large |
| **Loading state** | Skeleton table |
| **Empty state** | "No vital signs documented." |
| **Error state** | "Unable to load vitals." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source encounter per vital |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Showing abnormal as normal; missing a recent vital |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician can identify abnormal vitals within 10 seconds |

### C12. Laboratory Results

| Field | Specification |
|---|---|
| **Clinical purpose** | Recent, abnormal, pending, and problem-relevant results |
| **Primary user** | Clinician reviewing labs |
| **Information displayed** | Test name, value, unit, reference range, status (normal/abnormal/pending), date, source |
| **Information hierarchy** | 1. Abnormal results 2. Pending results 3. Recent normal results |
| **Data requirements** | Lab tests, values, units, reference ranges, dates, statuses |
| **FHIR resources** | `Observation` |
| **AI involvement** | None |
| **Clinician actions** | Click result to see trend; mark as reviewed |
| **Available sizes** | Large, Full |
| **Loading state** | Skeleton table |
| **Empty state** | "No laboratory results." |
| **Error state** | "Unable to load lab results." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source encounter per result |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Showing pending as normal; missing a critical value |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician can identify abnormal results within 10 seconds |

### C13. Imaging and Reports

| Field | Specification |
|---|---|
| **Clinical purpose** | Diagnostic reports with concise summaries and direct source access |
| **Primary user** | Clinician reviewing imaging |
| **Information displayed** | Study type, date, result, impression, source link |
| **Information hierarchy** | 1. Most recent study 2. Impression 3. Source |
| **Data requirements** | Imaging studies, results, impressions |
| **FHIR resources** | `DiagnosticReport` |
| **AI involvement** | None |
| **Clinician actions** | Click report to view source |
| **Available sizes** | Medium, Large |
| **Loading state** | Skeleton list |
| **Empty state** | "No imaging reports." |
| **Error state** | "Unable to load imaging reports." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source document link |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Showing outdated report as current |
| **MVP classification** | DO NOT BUILD (out of MVP scope) |
| **Success measurement** | N/A |

### C14. Clinical Notes

| Field | Specification |
|---|---|
| **Clinical purpose** | Relevant historical documentation, source retrieval, search |
| **Primary user** | Clinician reviewing documentation |
| **Information displayed** | Note title, date, author, type, excerpt, source link |
| **Information hierarchy** | 1. Most recent note 2. Note type 3. Excerpt |
| **Data requirements** | Clinical notes, dates, authors, excerpts |
| **FHIR resources** | `DocumentReference` |
| **AI involvement** | None |
| **Clinician actions** | Click note to view full text; search notes |
| **Available sizes** | Large, Full |
| **Loading state** | Skeleton list |
| **Empty state** | "No clinical notes." |
| **Error state** | "Unable to load notes." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source document |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Showing wrong patient's note |
| **MVP classification** | DO NOT BUILD (out of MVP scope; notes widget not needed for medication demo) |
| **Success measurement** | N/A |

### C15. Longitudinal Trends

| Field | Specification |
|---|---|
| **Clinical purpose** | Patient-specific graphical trends when clinically meaningful |
| **Primary user** | Clinician managing chronic conditions |
| **Information displayed** | Metric, value over time, trend direction, target range |
| **Information hierarchy** | 1. Current value 2. Trend direction 3. Historical chart |
| **Data requirements** | Time-series observations |
| **FHIR resources** | `Observation` |
| **AI involvement** | None |
| **Clinician actions** | Click trend point to see details; change time range |
| **Available sizes** | Large, Full |
| **Loading state** | Skeleton chart |
| **Empty state** | "No trend data available." |
| **Error state** | "Unable to load trends." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source per data point |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Misleading trend (small sample); wrong scale |
| **MVP classification** | DO NOT BUILD (out of MVP scope) |
| **Success measurement** | N/A |

---

## Category D — Encounter workflow widgets

### D16. Encounter Checklist

| Field | Specification |
|---|---|
| **Clinical purpose** | Tasks that genuinely must be completed for this encounter; avoid arbitrary extra clicks |
| **Primary user** | Clinician during encounter |
| **Information displayed** | Task, status (pending/in progress/complete), required/optional, due |
| **Information hierarchy** | 1. Required incomplete tasks 2. Required complete tasks 3. Optional tasks |
| **Data requirements** | Encounter tasks, statuses, due dates |
| **FHIR resources** | `CarePlan`, `Task` |
| **AI involvement** | None |
| **Clinician actions** | Mark task complete; view task details |
| **Available sizes** | Small (default), Medium |
| **Loading state** | Skeleton list |
| **Empty state** | "No tasks for this encounter." |
| **Error state** | "Unable to load tasks." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source encounter per task |
| **Permissions** | Read/Write: encounter clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Marking task complete without doing it; missing a required task |
| **MVP classification** | IF TIME |
| **Success measurement** | Clinician completes all required tasks before encounter completion |

### D17. AI Encounter Preparation

| Field | Specification |
|---|---|
| **Clinical purpose** | Source-linked, clinician-reviewable preparation summary generated by AI |
| **Primary user** | Clinician preparing for encounter |
| **Information displayed** | Summary, source references, confidence, uncertainty, proposed actions |
| **Information hierarchy** | 1. Summary 2. Key findings 3. Source references 4. Proposed actions |
| **Data requirements** | Patient context, encounter context, medications, conditions |
| **FHIR resources** | All (read-only aggregation) |
| **AI involvement** | AI generates summary; clinician must accept/edit/reject |
| **Clinician actions** | Accept summary; edit summary; reject summary; view source for each claim |
| **Available sizes** | Medium (default), Large |
| **Loading state** | "Preparing encounter summary…" |
| **Empty state** | "No preparation summary available. Run AI preparation." |
| **Error state** | "AI preparation unavailable. Continue without AI." |
| **Stale-data behavior** | Show "Generated [timestamp]" |
| **Evidence/source access** | Each claim links to source text/snapshot |
| **Permissions** | Read: any authenticated clinician; Generate: any clinician |
| **Dependencies** | Shared clinical context; AI provider abstraction |
| **Safety risks** | AI summary contains error; clinician accepts without review |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician reviews summary within 60 seconds; accept/edit/reject rate tracked |

### D18. Documentation Workspace

| Field | Specification |
|---|---|
| **Clinical purpose** | Structured or problem-oriented documentation with optional AI-assisted draft generation |
| **Primary user** | Clinician documenting encounter |
| **Information displayed** | Draft documentation, problem sections, AI suggestions, source links |
| **Information hierarchy** | 1. Current draft 2. Problem sections 3. AI suggestions 4. Source references |
| **Data requirements** | Encounter context, existing documentation, AI drafts |
| **FHIR resources** | `DocumentReference` |
| **AI involvement** | AI generates draft; clinician edits before commit |
| **Clinician actions** | Edit draft; accept AI suggestion; reject AI suggestion; commit documentation |
| **Available sizes** | Large, Full |
| **Loading state** | "Loading documentation…" |
| **Empty state** | "No documentation started. Create draft." |
| **Error state** | "Unable to save documentation." |
| **Stale-data behavior** | Show "Last saved [timestamp]" |
| **Evidence/source access** | Source link per section |
| **Permissions** | Read/Write: encounter clinician |
| **Dependencies** | Shared clinical context; AI provider abstraction |
| **Safety risks** | AI draft contains error; clinician commits without review |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician completes documentation within 3 minutes; AI suggestion accept/reject rate tracked |

### D19. Orders & Proposed Actions

| Field | Specification |
|---|---|
| **Clinical purpose** | Display draft actions for clinician review; clear distinction between suggestions, drafts, and committed EHR state |
| **Primary user** | Clinician reviewing proposed changes |
| **Information displayed** | Action, medication, current state, proposed state, evidence, authority, uncertainty, disposition |
| **Information hierarchy** | 1. Pending actions 2. Committed actions 3. Rejected actions |
| **Data requirements** | Proposed changes, current state, proposed state, evidence |
| **FHIR resources** | `MedicationRequest`, `CarePlan`, `Task` |
| **AI involvement** | AI proposes actions; clinician accepts/edits/rejects |
| **Clinician actions** | Accept; Edit (re-validation required); Reject; Defer |
| **Available sizes** | Medium, Large |
| **Loading state** | Skeleton list |
| **Empty state** | "No proposed actions." |
| **Error state** | "Unable to load proposed actions." |
| **Stale-data behavior** | Show "Generated [timestamp]" |
| **Evidence/source access** | Evidence span per action |
| **Permissions** | Read: any authenticated clinician; Write/Commit: prescribing clinician |
| **Dependencies** | Clinical Diff widget; AI provider abstraction |
| **Safety risks** | Clinician accepts unsafe action; edited action not re-validated |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician reviews all proposed actions before completion; edited actions re-validated |

### D20. Clinical Diff

| Field | Specification |
|---|---|
| **Clinical purpose** | Meaningful proposed changes with evidence; exception-oriented; not every trivial edit |
| **Primary user** | Clinician reviewing changes |
| **Information displayed** | Current state vs. proposed state, evidence linked to source text, authority, uncertainty, disposition |
| **Information hierarchy** | 1. Changes requiring review 2. Changes already reviewed 3. Unchanged items (collapsed) |
| **Data requirements** | Current state, proposed state, diff fields, evidence |
| **FHIR resources** | `MedicationRequest`, `MedicationStatement`, `Provenance` |
| **AI involvement** | None for display; AI may flag discrepancies |
| **Clinician actions** | Accept; Edit; Reject; Defer; View evidence |
| **Available sizes** | Large, Full |
| **Loading state** | Skeleton diff view |
| **Empty state** | "No changes to review." |
| **Error state** | "Unable to load clinical diff." |
| **Stale-data behavior** | Show "Compared as of [timestamp]" |
| **Evidence/source access** | Evidence span per change; source text link |
| **Permissions** | Read: any authenticated clinician; Write: encounter clinician |
| **Dependencies** | Medication Workspace; Orders & Proposed Actions |
| **Safety risks** | Clinician accepts incorrect diff; evidence not actually supporting |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician reviews all non-trivial changes; evidence linkage rate tracked |

### D21. Follow-Up and Instructions

| Field | Specification |
|---|---|
| **Clinical purpose** | Draft or manage follow-up instructions, outstanding work, patient communication |
| **Primary user** | Clinician completing encounter |
| **Information displayed** | Follow-up task, due date, patient communication, status |
| **Information hierarchy** | 1. Overdue 2. Due soon 3. Future |
| **Data requirements** | Follow-up tasks, due dates, statuses |
| **FHIR resources** | `CarePlan`, `Task` |
| **AI involvement** | AI may draft follow-up; clinician edits |
| **Clinician actions** | Create follow-up; edit; mark complete |
| **Available sizes** | Small, Medium |
| **Loading state** | Skeleton |
| **Empty state** | "No follow-up tasks." |
| **Error state** | "Unable to load follow-up." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source encounter per task |
| **Permissions** | Read/Write: encounter clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Missing follow-up; wrong due date |
| **MVP classification** | DO NOT BUILD (out of MVP scope) |
| **Success measurement** | N/A |

### D22. Encounter Completion

| Field | Specification |
|---|---|
| **Clinical purpose** | Show outstanding required tasks before encounter can be considered completed |
| **Primary user** | Clinician ending encounter |
| **Information displayed** | Required tasks, completion status, blocking items, commit button |
| **Information hierarchy** | 1. Blocking items (must resolve) 2. Completed items 3. Optional items |
| **Data requirements** | Encounter tasks, documentation status, proposed actions status |
| **FHIR resources** | `Encounter`, `Task`, `CarePlan` |
| **AI involvement** | None |
| **Clinician actions** | Complete encounter; defer; view blocking items |
| **Available sizes** | Small (default), Medium |
| **Loading state** | Skeleton |
| **Empty state** | "No active encounter." |
| **Error state** | "Unable to load encounter completion status." |
| **Stale-data behavior** | Show "Status as of [timestamp]" |
| **Evidence/source access** | Source per task |
| **Permissions** | Read/Write: encounter clinician |
| **Dependencies** | Encounter Checklist; Documentation Workspace; Orders & Proposed Actions |
| **Safety risks** | Completing encounter with unresolved discrepancies |
| **MVP classification** | MUST BUILD |
| **Success measurement** | Clinician cannot complete encounter with blocking items unresolved |

---

## Category D (continued) — Productivity widgets

### D23. Search and Command Palette

| Field | Specification |
|---|---|
| **Clinical purpose** | Unified contextual navigation and information retrieval |
| **Primary user** | Any clinician |
| **Information displayed** | Search results, actions, widgets, patients |
| **Information hierarchy** | 1. Exact matches 2. Partial matches 3. Recent |
| **Data requirements** | All widget data, patient index, action index |
| **FHIR resources** | All (search index) |
| **AI involvement** | None |
| **Clinician actions** | Search; execute action; open widget; navigate |
| **Available sizes** | Full (overlay) |
| **Loading state** | "Searching…" |
| **Empty state** | "No results." |
| **Error state** | "Search unavailable." |
| **Stale-data behavior** | Show "Index as of [timestamp]" |
| **Evidence/source access** | Source per result |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | Shared clinical context |
| **Safety risks** | Returning wrong patient's data in search |
| **MVP classification** | IF TIME |
| **Success measurement** | Clinician finds target within 10 seconds |

### D24. Inbox / Task Priorities

| Field | Specification |
|---|---|
| **Clinical purpose** | Relevant messages, results, outstanding tasks scoped by role and workflow |
| **Primary user** | Any clinician |
| **Information displayed** | Task, source, priority, due date, status |
| **Information hierarchy** | 1. Overdue/high priority 2. Due soon 3. Routine |
| **Data requirements** | Tasks, messages, results, priorities |
| **FHIR resources** | `Task`, `Communication` |
| **AI involvement** | None |
| **Clinician actions** | Complete task; defer; view source |
| **Available sizes** | Small, Medium |
| **Loading state** | Skeleton |
| **Empty state** | "No tasks." |
| **Error state** | "Unable to load tasks." |
| **Stale-data behavior** | Show "Data as of [timestamp]" |
| **Evidence/source access** | Source per task |
| **Permissions** | Read/Write: role-scoped |
| **Dependencies** | Shared clinical context (clinician role) |
| **Safety risks** | Missing a high-priority task |
| **MVP classification** | DO NOT BUILD (out of MVP scope) |
| **Success measurement** | N/A |

### D25. AI Assistant

| Field | Specification |
|---|---|
| **Clinical purpose** | Contextual assistant for retrieval, drafting, proposing actions |
| **Primary user** | Any clinician |
| **Information displayed** | Chat history, AI responses, source references, actions |
| **Information hierarchy** | 1. Most recent message 2. Source references 3. Proposed actions |
| **Data requirements** | Patient context, chat history, AI responses |
| **FHIR resources** | All (context) |
| **AI involvement** | AI generates responses; clinician reviews |
| **Clinician actions** | Ask question; accept/reject proposed action; view source |
| **Available sizes** | Medium (side panel), Full |
| **Loading state** | "Thinking…" |
| **Empty state** | "No conversation yet." |
| **Error state** | "AI assistant unavailable." |
| **Stale-data behavior** | Show "Generated [timestamp]" |
| **Evidence/source access** | Source per AI claim |
| **Permissions** | Read: any authenticated clinician |
| **Dependencies** | AI provider abstraction |
| **Safety risks** | AI gives wrong answer; clinician acts on it |
| **MVP classification** | DO NOT BUILD (folded into AI Encounter Preparation for MVP) |
| **Success measurement** | N/A |

### D26. Quick Actions

| Field | Specification |
|---|---|
| **Clinical purpose** | Common clinician actions without creating an unsafe parallel EHR write path |
| **Primary user** | Any clinician |
| **Information displayed** | Action buttons (e.g., "Refresh data", "Export summary") |
| **Information hierarchy** | 1. Most common 2. Less common |
| **Data requirements** | None (actions only) |
| **FHIR resources** | None |
| **AI involvement** | None |
| **Clinician actions** | Click action |
| **Available sizes** | Small |
| **Loading state** | N/A |
| **Empty state** | N/A |
| **Error state** | "Action unavailable." |
| **Stale-data behavior** | N/A |
| **Evidence/source access** | N/A |
| **Permissions** | Role-scoped |
| **Dependencies** | None |
| **Safety risks** | Unsafe parallel write path; confusing draft vs. committed |
| **MVP classification** | DO NOT BUILD (explicitly rejected in ANTIGRAVITY_HANDOFF.md) |
| **Success measurement** | N/A |

---

## Widget registry schema reference

Each widget definition in the registry contains:

```typescript
interface WidgetDefinition {
  id: string;                    // e.g., "patient-overview"
  displayName: string;
  category: 'patient-context' | 'medication-safety' | 'clinical-information' | 'encounter-workflow' | 'productivity';
  supportedSizes: ('small' | 'medium' | 'large' | 'full')[];
  defaultSize: 'small' | 'medium' | 'large' | 'full';
  minDimensions: { width: number; height: number };
  maxDimensions: { width: number; height: number };
  supportedRoles: string[];
  dataDependencies: string[];    // required context fields
  requiredPermissions: string[]; // e.g., ['read:medications']
  refreshStrategy: 'on-demand' | 'on-patient-change' | 'periodic';
  configurationSchema: Record<string, any>;
  supportedActions: string[];    // e.g., ['view', 'edit', 'accept', 'reject']
  safetyRequirements: string[];  // e.g., ['evidence-sufficiency-gate']
  version: string;
  featureFlags: string[];
}
```

**Widget instance** (separate from definition):
```typescript
interface WidgetInstance {
  id: string;                    // unique instance ID
  definitionId: string;          // references WidgetDefinition
  position: { x: number; y: number; width: number; height: number };
  configuration: Record<string, any>;
  isVisible: boolean;
  isMinimized: boolean;
  lastRefreshed: string | null;
  error: string | null;
}
```

---

## Layout constraints

- **Grid:** 12-column virtual grid with grid snapping
- **Column constraints:** Left rail fixed; center flexible; right rail fixed
- **Density controls:** compact/comfortable/spacious (MVP: comfortable only)
- **Responsive:** Desktop-first; tablet considered; phone not assumed
- **Avoid:** Nested scrolling surfaces; widget overlap; unpredictable widget disappearance

---

## Rejected widgets summary (DO NOT BUILD)

| Widget | Reason for rejection |
|---|---|
| Patient Timeline | Out of MVP scope |
| Problem-Oriented Context | Folded into Problem List |
| Patient Goals & Preferences | Out of MVP scope |
| Imaging & Reports | Out of MVP scope |
| Clinical Notes | Out of MVP scope |
| Longitudinal Trends | Out of MVP scope |
| Follow-Up & Instructions | Out of MVP scope |
| Quick Actions | Safety risk (unsafe parallel write path) |
| Inbox / Task Priorities | Out of MVP scope |
| AI Assistant (separate widget) | Folded into AI Encounter Preparation |

---

**Last updated:** 2026-11-15
**Status:** Proposal — awaiting human project owner review (ANTIGRAVITY_HANDOFF.md question #2)
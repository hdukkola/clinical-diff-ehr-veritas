# DiffMD widget reachability and evidence audit

**Baseline:** `work/firebase-release-unified` at `aae0f70` · 2026-11-15 · source review only. This is an evidence map, not 100 completed features or a production/clinical validation. Browser actions, deployed parity and individual accessibility were not independently re-tested. The launch owner remains responsible for release integration.

## Read this before the matrix

- **Visible / partial** means a related route, widget, or control exists in `src/app/page.tsx`, backed by Morgan’s synthetic snapshots, source records, or session state. It does not mean the entire backlog acceptance criterion is complete. Morgan’s chart is fictional; new patients and notes are tab-local, not a live EHR.
- **Disconnected example** means catalog metadata, static illustrative rows, or a builder exists, but no visible release route was found for the 100-item drawer. A dynamic builder may consume a context if integrated; that does not make it available or verified today.
- **Internal** marks evaluation, benchmark and QA results that the user has requested remain internal. Do not restore an Evaluations page or expose held-out cases as patient-facing widgets. This is a product scope requirement, not an authentication or security guarantee.

The UI imports `WorkspaceWidgets` and `CockpitWidgets`, not `BacklogCatalogDrawer` (`src/app/page.tsx`). `BacklogCatalogDrawer.tsx` is the only UI consumer of the catalog/builders in `src/`; the drawer imports clinical and specialty builders. The in-code catalog assigns `verified` to most entries by ownership (`backlog-widgets.ts` `item()`), which is metadata, not evidence of reachability or acceptance. The Home “Customize workspace” opens six cockpit cards; page-specific “Add widgets” selects from each page’s own widget list and defaults to three. These are not the 100-item drawer.

The separate `/design-preview` is a static fictional design mock and explicitly calls `notFound()` in production; it is not the release widget catalog. `ViewId` has no `eval` and the visible navigation has no Evaluations screen. `docs/EHR_WIDGET_RESEARCH.md` describes vendor workflows and inspirations; a source documenting another vendor’s feature does not establish this app implements it. Its first queue prioritizes evidence, timeline, reconciliation, and follow-up before unsupported specialty surfaces.

## Item-by-item matrix

Codes: **V** = visible related workflow, partial unless stated; **D** = disconnected catalog example / static data; **I** = internal only or internal QA. More than one code indicates an existing visible path plus disconnected catalog code. “Missing” means the named outcome is not demonstrated by the visible path, not that no source code exists.

| # | Backlog outcome | Classification | Evidence and remaining gap |
|---:|---|---|---|
| 01 | Source evidence drill-down | V | Home → Customize workspace → Provenance & Evidence Health → medication; linked Snapshot review. |
| 02 | Evidence state labels | V | Snapshot review shows classified evidence states and excerpts; confirm each state with a targeted fixture. |
| 03 | Note navigator | V | Compare and source drill-down expose cited text; sequential navigation across all mentions remains unproven. |
| 04 | Encounter timeline | V | Snapshot review → Timeline derives dated/undated events from the two snapshots. |
| 05 | Patient context | V | Home / Patient overview scopes Morgan and tab-created patients; validate switching and reload boundaries. |
| 06 | Chart search | V | Chart search finds indexed synthetic records and opens a selected match; scope is not a full EHR. |
| 07 | Document index | V | Snapshot review → Documents uses buildDocumentIndex with revisions and source metadata. |
| 08 | External record viewer | V | Documents → Outside reports opens Morgan’s synthetic pharmacy/clinic report. |
| 09 | Widget placement controls | V | Add widgets and Home → Customize workspace support page layout/reordering; two separate systems, not all 100. |
| 10 | Review audit | V | Session Activity records review events; item-linked navigation depends on stored target metadata. |
| 11 | Medication reconciliation worklist | V | Snapshot review → Worklist groups comparison changes and decisions; verify all requested categories. |
| 12 | Before/after regimen | V | Snapshot review → Snapshots / difference detail uses the two structured lists and available evidence. |
| 13 | Medication history | V | Snapshot review timeline/history derives dates from snapshots; not prescription or administration history. |
| 14 | Duplicate mentions | V + D | Evidence detail exposes linked mentions; detached builder groups report links but complete deduplication is unproven. Catalog: Report-derived rows in disconnected clinical builder; no verified complete duplicate grouping. |
| 15 | Name and alias evidence | D | Static alias example; no verified chart terminology mapping. |
| 16 | Missing regimen details | V + D | Snapshot comparison marks missing fields such as Morgan’s discharge frequency; detached catalog also computes gaps. Catalog: Report-derived gap rows in disconnected clinical builder; no complete field-coverage proof. |
| 17 | Conflicting medication evidence | V | Snapshot review conflict/evidence detail can show source disagreements where fixture supplies them; not a diagnosis. |
| 18 | Prescription history | D | Static prescription example; Morgan’s outside report is not a full prescribing history. |
| 19 | Administration record | D | Static MAR rows; no charted administrations or operational MAR. |
| 20 | Pharmacy verification queue | D | Static pharmacy queue; no pharmacy verification workflow. |
| 21 | Allergies and reactions | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 22 | Intolerances | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 23 | Problem list | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 24 | Diagnosis history | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 25 | Medical and surgical history | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 26 | Family history | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 27 | Social history | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 28 | Care team | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 29 | Preferences and accessibility | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 30 | Advance directives | D | Disconnected `widgets-clinical.ts` chart-basics static rows; not sourced from Morgan’s active chart; outcome missing. |
| 31 | Vitals summary | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 32 | Vital trends | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 33 | Flowsheet | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 34 | Intake and output | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 35 | Lab results table | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 36 | Lab trends | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 37 | Critical result review | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 38 | Specimen tracking | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 39 | Imaging reports | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 40 | Microbiology and pathology | D | Disconnected `widgets-clinical.ts` results/trends static rows; no verified chart observation feed; outcome missing. |
| 41 | Visit preparation | V + D | Patient overview has encounter and review links; no full scheduled visit preparation workflow. Catalog: Mixes report-derived counts with scripted preparation items. |
| 42 | Rooming checklist | D | Disconnected encounter/planning example in `widgets-clinical.ts`; no matching complete workflow established. |
| 43 | Encounter overview | V + D | Patient overview and scripted encounter provide an encounter summary; not a complete encounter record. Catalog: Combines active report count with prewritten encounter content. |
| 44 | Note sections | D | Disconnected encounter/planning example in `widgets-clinical.ts`; no matching complete workflow established. |
| 45 | Draft comparison | V + D | Patient overview → encounter note draft has source-linked review; not a complete general draft-version comparator. Catalog: Static draft example; separate encounter draft review exists. |
| 46 | Order review | D | Disconnected encounter/planning example in `widgets-clinical.ts`; no matching complete workflow established. |
| 47 | Referral status | D | Disconnected encounter/planning example in `widgets-clinical.ts`; no matching complete workflow established. |
| 48 | Care plan goals | D | Disconnected encounter/planning example in `widgets-clinical.ts`; no matching complete workflow established. |
| 49 | Immunization history | D | Disconnected encounter/planning example in `widgets-clinical.ts`; no matching complete workflow established. |
| 50 | Discharge summary | V + D | Morgan discharge note and comparison are available; complete discharge instructions and follow-up are not established. Catalog: Mixes report change rows with a hard-coded follow-up; do not treat the latter as Morgan chart evidence. |
| 51 | Follow-up worklist | V + D | Snapshot worklist plus follow-up export support review; no persistent care-team ownership or outbound task. Catalog: Report/review-derived rows; builder is not connected to release. |
| 52 | Results inbox | D | Disconnected queue/coordination example in `widgets-clinical.ts`; no matching integrated workflow established. |
| 53 | Documentation queue | D | Disconnected queue/coordination example in `widgets-clinical.ts`; no matching integrated workflow established. |
| 54 | Chart review queue | V + D | Evidence/provenance gaps are shown in comparison and document views; no separate integrated queue established. Catalog: Report provenance-derived rows; builder is not connected to release. |
| 55 | Care-team handoff | D | Mixed active counts and static handoff text; no care-team messaging. |
| 56 | Rounds list | D | Mixed active counts and static rounds content. |
| 57 | Visit schedule | D | Disconnected queue/coordination example in `widgets-clinical.ts`; no matching integrated workflow established. |
| 58 | Transition tracker | D | Disconnected queue/coordination example in `widgets-clinical.ts`; no matching integrated workflow established. |
| 59 | Reminders and recalls | D | Disconnected queue/coordination example in `widgets-clinical.ts`; no matching integrated workflow established. |
| 60 | Communications history | D | Disconnected queue/coordination example in `widgets-clinical.ts`; no matching integrated workflow established. |
| 61 | Emergency tracking | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 62 | ICU timeline | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 63 | Perioperative checklist | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 64 | Anesthesia record | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 65 | Labor and delivery board | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 66 | Oncology regimen tracker | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 67 | Pediatric growth | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 68 | Behavioral health assessments | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 69 | Rehab goals | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 70 | Dental chart | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 71 | Home care visits | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 72 | Long-term care dashboard | D | Disconnected static specialty preset in `widgets-specialty.ts`; not Morgan’s documented care or a specialty workspace. |
| 73 | Plain-language visit summary | D | Generated from comparison in disconnected specialty builder; no integrated patient-facing summary or validation. |
| 74 | Patient medication list | D | Generated from report in disconnected specialty builder; not an actual patient portal. |
| 75 | Patient results timeline | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 76 | Patient forms | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 77 | Appointment details | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 78 | Proxy access preview | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 79 | Visit preparation checklist | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 80 | Education resources | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 81 | Registration summary | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 82 | Coverage overview | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 83 | Prior authorization tracker | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 84 | Coding review queue | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 85 | Billing status | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 86 | Capacity board | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 87 | Staffing view | D | Disconnected patient/operations fixture in `widgets-specialty.ts`; no verified patient-facing or operations workflow. |
| 88 | Privacy and access audit | D | Static access audit; session activity is not a privacy access audit. |
| 89 | Chart completeness dashboard | V + D | Snapshot provenance and missing fields are surfaced; a full cross-chart completeness denominator is not established. Catalog: Report-derived counts in disconnected builder; not comprehensive chart completeness. |
| 90 | Surveillance board | D | Fixture-derived surveillance; no monitoring service. |
| 91 | Suggestion explanation | V + D | Review suggestions display available evidence and explanations; suggestion output and model availability must be labeled. Catalog: Report-derived explanation example; actual suggestion UI is separately implemented. |
| 92 | Suggestion review outcomes | V + D | Review suggestions support accept/skip/override locally and activity records; verify audit linking and all dispositions. Catalog: Derived demo status, not validated across all dispositions. |
| 93 | Model status card | V + D | Developer settings and connection widgets show status; model identity and live status require actual service verification. Catalog: Derived socket state; do not represent as verified model readiness. |
| 94 | Evaluation breakdown | I | Benchmark/evaluation counts and breakdown stay in internal tests and artifacts; no Evaluations view in release ViewId. |
| 95 | Evaluation failure drill-down | I | Evaluation failure drill-down stays internal; no release navigation to evaluation cases. |
| 96 | Assistant evidence rendering | V | Patient/assistant evidence rendering has citation and abstention paths; hosted availability and correctness need verification. |
| 97 | Workflow presets | D | Static preset examples; current widget placement is separate. |
| 98 | Cross-widget accessibility check | I | Accessibility findings are internal test artifacts; checklist example is not evidence. |
| 99 | Performance check | I | Performance benchmarks and 50,000-case runs are internal test artifacts, not patient widgets. |
| 100 | Demo walkthrough | I + V | Walkthrough test evidence belongs in internal QA; do not promote fixture checklist as a measured result. Actual Home → encounter → compare → evidence → review path exists; fixture checklist is not a verified walkthrough. |

## Prioritized work for review

1. **Evidence and context first (01–08, 11–13, 16–17).** Verify the real Morgan path at Home → patient encounter → Compare / Snapshot review → source excerpt → disposition. Test missing source, unavailable source, conflict and undocumented frequency. Separately test a tab-created patient to ensure Morgan data never appears in that chart. Keep the evidence stationary and include a return route.
2. **Actionable review and follow-up (10, 51, 54, 91–92).** Make current-review scope and unreviewed counts explicit, preserve human review, and ensure links lead to actual source or item. Do not imply a tab-local decision sends a task or updates an EHR.
3. **Widget discoverability (09).** Reconcile the page widget selector with the six Home cockpit cards; identify widget/source/empty state and keep per-page layouts. Any integration of the separate catalog needs explicit product review, patient scoping and action-by-action validation. Do not expose disconnected static rows as Morgan chart facts.
4. **New clinical areas (18–50, 52–90).** Establish a documented user job, a patient-scoped synthetic data contract, provenance and missing states before implementation. Prioritize allergies, problems and results only when there is actual chart data; specialty/operations can remain unimplemented. Static examples may inspire layout but cannot provide clinical evidence.
5. **Internal quality (94–95, 98–100).** Keep benchmark cases, failure details, performance and QA evidence in internal tests/artifacts; report actual denominator, build, conditions and timeouts. Ensure production exposure is checked separately; hiding a navigation link alone is not access control.

## Sources and constraints

- Navigation, page widgets, patient scoping and the six-card Home cockpit: `src/app/page.tsx`, `src/components/WorkspaceWidgets.tsx`, `src/components/CockpitWidgets.tsx`.
- Morgan snapshots/outside report: `src/lib/fixtures.ts`; evidence, document index, worklist and timeline helpers: `src/lib/diff.ts`; scripted encounter: `src/components/EncounterTranscript.tsx`.
- Detached catalog and routing order: `src/components/BacklogCatalogDrawer.tsx`, `src/lib/backlog-widgets.ts`, `src/lib/widgets-clinical.ts`, `src/lib/widgets-specialty.ts`. Static and report-derived rows coexist; check each item, not only the label. In particular `buildClinicalWidgetData` takes precedence over the generic builder, and `buildDynamicSpecialtyPreset` takes precedence over static specialty presets.
- Backlog acceptance and vendor source attribution: `docs/EHR_WIDGET_BACKLOG.md`, `docs/EHR_WIDGET_RESEARCH.md`; design-only reference: `docs/WIDGET_DESIGN_SONNET.md`. This review did not revalidate external vendor claims or assert differentiation.
- Design preview scope: `src/app/design-preview/page.tsx`. Internal-evaluation direction is recorded in `COMMUNICATION.md` (Firebase patients handoff: benchmark cases stay internal) and in this task handoff.

**Handoff:** This audit updates documentation only. It does not change claims, page behavior, access controls, releases, or deployment. Independently review source paths and perform end-to-end tests before promoting any outcome to verified.

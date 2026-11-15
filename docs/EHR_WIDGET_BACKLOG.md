# Clinical Diff widget backlog

Start at **01**. Each numbered item is one proposed delivery with an observable completion condition. The later sections cover specialty, patient, and operational surfaces so their research and build work can be planned alongside the clinical cockpit.

## How the swarm works

1. Run one swarm on one numbered item at a time. Assign an implementer, a reviewer, and a verifier within that swarm. Each contributes an equal recommendation. Himnish makes the final decision on scope and tradeoffs.
2. Start from the latest agreed GitHub base. Claim exact files and fill out the [widget build template](WIDGET_BUILD_TEMPLATE.md). Check the [research catalog](EHR_WIDGET_RESEARCH.md) for primary evidence. The first subtask for an undocumented pattern is to verify its workflow and acceptance criteria.
3. Reuse the existing widget or screen when it already serves the workflow. Place new surfaces where the job happens. Keep the original Graphite palette, shared drag/keyboard/touch behavior, and one selectable patient, Morgan Lee (Synthetic), DEMO-001.
4. Use synthetic data throughout. Keep care actions read-only or local simulations. Clinical writes, outbound messages, decision support, real integrations, and billing require explicit human decisions. Keep live model use behind the verified testing gate.
5. Close an item with one reviewable PR, its browser and test evidence, and a short handoff. Verify affected paths, 390/768/desktop layouts, keyboard and touch navigation, reduced motion where applicable, source links, and unknown/error states. Start the next item only after review closes the current one or Himnish explicitly defers it.

## Foundations and evidence

01. **Source evidence drill-down** — Open exact earlier/later excerpts behind a selected medication change from the existing provenance widget and return focus to the trigger.
02. **Evidence state labels** — Distinguish a missing reference, an unavailable document, an explicitly documented negative, and conflicting excerpts.
03. **Note navigator** — Jump between cited mentions while keeping note identity, timestamp, and source position visible.
04. **Encounter timeline** — Lay out synthetic notes, encounters, and documented changes chronologically and show undated records separately.
05. **Patient context** — Reconcile identity and active encounter display across chart views using the existing synthetic patient.
06. **Chart search** — Find text in synthetic notes and results, label the source, and open the exact match.
07. **Document index** — List notes by source and date and show revisions, duplicates, and unavailable documents.
08. **External record viewer** — Open a synthetic outside report with origin and import date prominently visible.
09. **Widget placement controls** — Add optional placement and restore defaults through the existing accessible layout controls.
10. **Review audit** — Extend Session Activity so each simulated review decision links to its item and timestamp.

## Medication reconciliation

11. **Medication reconciliation worklist** — Group unresolved medication changes by added, removed, changed, and unclear.
12. **Before/after regimen** — Show documented dose, route, frequency, and status changes with direct evidence.
13. **Medication history** — Show dated regimen entries and flag unknown dates separately.
14. **Duplicate mentions** — Group repeated references with all original citations available.
15. **Name and alias evidence** — Show the original name and any verified synthetic mapping when both are available.
16. **Missing regimen details** — Surface missing units, dose, route, or frequency explicitly.
17. **Conflicting medication evidence** — Present differing statements side by side for a reviewer decision.
18. **Prescription history** — Show date, source, and documented lifecycle state separately from actual administration.
19. **Administration record** — Show synthetic scheduled, given, missed, and overdue entries as documented with timestamps.
20. **Pharmacy verification queue** — Review mock orders with missing fields and link each item back to its source.

## Patient chart basics

21. **Allergies and reactions** — Display documented allergen, reaction, severity, and status, including explicit negatives and unknowns.
22. **Intolerances** — Distinguish source-labeled intolerances from allergies and surface ambiguous records.
23. **Problem list** — Show active, historical, and unclear status with the supporting entry.
24. **Diagnosis history** — Group documented diagnoses by encounter and display source labels.
25. **Medical and surgical history** — List dated events with procedures and conditions clearly distinguished.
26. **Family history** — Show documented relationships and preserve unknown status where detail is absent.
27. **Social history** — Present dated, attributed statements and keep conflicting values visible.
28. **Care team** — List synthetic roles, participation, and documented contact routes.
29. **Preferences and accessibility** — Display recorded language, interpreter, and accessibility needs.
30. **Advance directives** — Show documented status, date, and source document when available.

## Results and trends

31. **Vitals summary** — Show most recent documented values with units, source, and measurement time.
32. **Vital trends** — Plot synthetic observations and provide an accessible table.
33. **Flowsheet** — Align dated measurements across encounters while leaving gaps visible.
34. **Intake and output** — Show documented inputs and outputs within a clearly bounded time window.
35. **Lab results table** — Display result, unit, source range, status, and date.
36. **Lab trends** — Plot comparable results and show unit changes or noncomparable entries explicitly.
37. **Critical result review** — Surface source-provided flags and mock acknowledgment history.
38. **Specimen tracking** — Show collection, receipt, processing, and final status when recorded.
39. **Imaging reports** — Show dated impressions and original synthetic text with preliminary/final labels.
40. **Microbiology and pathology** — Show synthetic report history, preliminary states, and final amendments.

## Encounters and care planning

41. **Visit preparation** — Summarize upcoming encounter details and outstanding documented items.
42. **Rooming checklist** — Simulate completion of synthetic intake tasks and show remaining work.
43. **Encounter overview** — Bring the active visit, note, results, and outstanding tasks into one view with links.
44. **Note sections** — Navigate a long structured note by headings and preserve its source metadata.
45. **Draft comparison** — Compare a synthetic draft against its source and report review state.
46. **Order review** — Display synthetic order details, origin, and lifecycle state.
47. **Referral status** — Show pending, scheduled, completed, and closed synthetic referrals with dates.
48. **Care plan goals** — Show documented goals, review dates, and source-linked progress.
49. **Immunization history** — Display recorded administrations with dates and origins.
50. **Discharge summary** — Show instructions, follow-ups, and documented medication differences with source links.

## Queues and coordination

51. **Follow-up worklist** — Extend the review flow with unresolved items, synthetic owner, and next action.
52. **Results inbox** — Filter mock incoming results by workflow state and open the source.
53. **Documentation queue** — Show draft, pending review, and complete states from fixture records.
54. **Chart review queue** — Show unresolved source links and conflicting items with jump targets.
55. **Care-team handoff** — Summarize unresolved items and source-linked changes for simulated shift review.
56. **Rounds list** — Show work for the synthetic patient by encounter while retaining one selectable chart.
57. **Visit schedule** — Show dated synthetic appointment entries and appointment status.
58. **Transition tracker** — Display admission, transfer, and discharge events in source order.
59. **Reminders and recalls** — Show known dates, owners, and documented completion states.
60. **Communications history** — Display synthetic portal and care-team messages with threads and timestamps.

## Specialty surfaces

61. **Emergency tracking** — Show mock arrival, triage, testing, and disposition milestones.
62. **ICU timeline** — Align documented vitals, interventions, and medication administrations by time.
63. **Perioperative checklist** — Show documented pre-op, procedure, and recovery milestones.
64. **Anesthesia record** — Align synthetic medications, observations, and procedural timestamps.
65. **Labor and delivery board** — Show maternity encounter milestones and documented care-team actions.
66. **Oncology regimen tracker** — Show synthetic cycles, planned dates, completed administrations, and documented changes.
67. **Pediatric growth** — Plot dated synthetic measurements with units and an accessible tabular view.
68. **Behavioral health assessments** — Display documented assessment dates, results, and source provenance.
69. **Rehab goals** — Track synthetic therapy sessions and documented progress toward goals.
70. **Dental chart** — Display synthetic tooth/site, finding, and procedure history.
71. **Home care visits** — Show visit schedule, visit outcome, and outstanding follow-up.
72. **Long-term care dashboard** — Show resident care goals, review schedule, and relevant documented events.

## Patient-facing views

73. **Plain-language visit summary** — Display a reviewed synthetic summary with original chart references.
74. **Patient medication list** — Show documented names and regimen details in a read-only, plain-language layout.
75. **Patient results timeline** — Show synthetic results with dates and release state.
76. **Patient forms** — Present mock intake forms with accessible controls and local-only submission states.
77. **Appointment details** — Show synthetic status, location, and check-in instructions.
78. **Proxy access preview** — Demonstrate synthetic patient and proxy views with explicit access state.
79. **Visit preparation checklist** — Show documented preparation tasks for the synthetic appointment.
80. **Education resources** — Show fixture-linked educational material and its source.

## Operations and oversight

81. **Registration summary** — Show synthetic registration fields and any missing data.
82. **Coverage overview** — Display mock coverage status and recorded dates.
83. **Prior authorization tracker** — Show mock submission, pending, and resolved states with provenance.
84. **Coding review queue** — Show synthetic coding suggestions beside their source for human review.
85. **Billing status** — Present synthetic claim stages and status history.
86. **Capacity board** — Display mock occupancy, availability, and timestamp without exposing patient records.
87. **Staffing view** — Show mock shifts and role assignments by unit.
88. **Privacy and access audit** — Show synthetic access events, actor role, and recorded action.
89. **Chart completeness dashboard** — Count missing and unresolved fixture fields and link each count to affected records.
90. **Surveillance board** — Present pre-labeled synthetic events and explain which fixture supplied each flag.

## Model quality and platform follow-through

91. **Suggestion explanation** — Explain the evidence behind an existing synthetic suggestion and show uncertainty.
92. **Suggestion review outcomes** — Extend the existing triage view with evidence-linked accept, reject, and defer outcomes in the session log.
93. **Model status card** — Distinguish unavailable, local, replay, and verified hosted states with accurate labels.
94. **Evaluation breakdown** — Show exact tested denominators, passes, failures, timeouts, and case-family counts.
95. **Evaluation failure drill-down** — Open a synthetic failed case and display expected result, actual result, and error type.
96. **Assistant evidence rendering** — Verify question responses can display sources and abstentions using synthetic test responses. Live enablement requires the agreed threshold and verified remote model identity.
97. **Workflow presets** — Validate focused layouts for review, results, and care coordination with a predictable default.
98. **Cross-widget accessibility check** — Verify tab order, announcements, readable charts, focus return, and reduced motion across presets.
99. **Performance check** — Measure existing chart interactions with a larger synthetic fixture and address any regression.
100. **Demo walkthrough** — Verify one synthetic medication change from note comparison through evidence review, follow-up, and audit in the browser.

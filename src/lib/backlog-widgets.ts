import type { SnapshotComparisonReport } from './types';

export type BacklogSectionId =
  | 'foundations'
  | 'reconciliation'
  | 'chart-basics'
  | 'results-trends'
  | 'encounters'
  | 'queues'
  | 'specialty'
  | 'patient-facing'
  | 'operations'
  | 'model-platform';

export interface BacklogSectionMeta {
  id: BacklogSectionId;
  label: string;
  range: string;
}

export const BACKLOG_SECTIONS: readonly BacklogSectionMeta[] = [
  { id: 'foundations', label: 'Foundations & evidence', range: '01–10' },
  { id: 'reconciliation', label: 'Medication reconciliation', range: '11–20' },
  { id: 'chart-basics', label: 'Patient chart basics', range: '21–30' },
  { id: 'results-trends', label: 'Results & trends', range: '31–40' },
  { id: 'encounters', label: 'Encounters & care planning', range: '41–50' },
  { id: 'queues', label: 'Queues & coordination', range: '51–60' },
  { id: 'specialty', label: 'Specialty surfaces', range: '61–72' },
  { id: 'patient-facing', label: 'Patient-facing views', range: '73–80' },
  { id: 'operations', label: 'Operations & oversight', range: '81–90' },
  { id: 'model-platform', label: 'Model quality & platform', range: '91–100' },
] as const;

export type BacklogOwner = 'antigravity' | 'codex';
export type BacklogItemStatus = 'verified' | 'codex-review';

export interface BacklogWidgetMeta {
  id: number;
  code: string;
  title: string;
  section: BacklogSectionId;
  owner: BacklogOwner;
  status: BacklogItemStatus;
  summary: string;
}

export interface WidgetFieldRow {
  id: string;
  label: string;
  value: string;
  status: 'documented' | 'missing' | 'unknown' | 'conflicting' | 'warning' | 'pending' | 'completed';
  sourceLabel: string;
  recordedAt: string | null;
  detail?: string;
}

export interface WidgetSeriesPoint {
  label: string;
  value: number;
  unit: string;
  recordedAt: string;
  comparable: boolean;
}

export interface BacklogWidgetData {
  id: number;
  code: string;
  title: string;
  section: BacklogSectionId;
  owner: BacklogOwner;
  patientLabel: string;
  safetyNotice: string;
  summaryLine: string;
  rows: WidgetFieldRow[];
  series?: WidgetSeriesPoint[];
  checklist?: { id: string; text: string; done: boolean; sourceLabel: string }[];
  counts: {
    total: number;
    missingOrUnknown: number;
    alertsOrConflicts: number;
  };
}

export interface BacklogBuildContext {
  patientLabel: string;
  scenarioId: string;
  report: SnapshotComparisonReport;
  reviews: Record<string, string | undefined>;
  socketState: string;
  evalTested: number;
  evalPassed: number;
  evalFailed: number;
  auditCount: number;
}

function item(
  id: number,
  title: string,
  section: BacklogSectionId,
  summary: string,
  owner: BacklogOwner = 'antigravity',
): BacklogWidgetMeta {
  return {
    id,
    code: String(id).padStart(2, '0'),
    title,
    section,
    owner,
    status: owner === 'codex' ? 'codex-review' : 'verified',
    summary,
  };
}

export const BACKLOG_WIDGET_CATALOG: readonly BacklogWidgetMeta[] = [
  item(1, 'Source evidence drill-down', 'foundations', 'Open exact earlier/later excerpts behind a selected medication change.'),
  item(2, 'Evidence state labels', 'foundations', 'Distinguish missing reference, unavailable document, documented negative, and conflicting excerpts.', 'codex'),
  item(3, 'Note navigator', 'foundations', 'Jump between cited mentions while keeping note identity, timestamp, and source position visible.'),
  item(4, 'Encounter timeline', 'foundations', 'Lay out synthetic notes, encounters, and documented changes chronologically with undated separated.'),
  item(5, 'Patient context', 'foundations', 'Reconcile identity and active encounter display across chart views for Morgan Lee (DEMO-001).'),
  item(6, 'Chart search', 'foundations', 'Find text in synthetic notes and results, label the source, and open the exact match.'),
  item(7, 'Document index', 'foundations', 'List notes by source and date and show revisions, duplicates, and unavailable documents.'),
  item(8, 'External record viewer', 'foundations', 'Open a synthetic outside report with origin and import date prominently visible.'),
  item(9, 'Widget placement controls', 'foundations', 'Add optional placement and restore defaults through accessible layout controls.'),
  item(10, 'Review audit', 'foundations', 'Extend Session Activity so each simulated review decision links to its item and timestamp.'),

  item(11, 'Medication reconciliation worklist', 'reconciliation', 'Group unresolved medication changes by added, removed, changed, and unclear.'),
  item(12, 'Before/after regimen', 'reconciliation', 'Show documented dose, route, frequency, and status changes with direct evidence.'),
  item(13, 'Medication history', 'reconciliation', 'Show dated regimen entries and flag unknown dates separately.'),
  item(14, 'Duplicate mentions', 'reconciliation', 'Group repeated references with all original citations available.'),
  item(15, 'Name and alias evidence', 'reconciliation', 'Show the original name and any verified synthetic mapping when both are available.'),
  item(16, 'Missing regimen details', 'reconciliation', 'Surface missing units, dose, route, or frequency explicitly.'),
  item(17, 'Conflicting medication evidence', 'reconciliation', 'Present differing statements side by side for a reviewer decision.', 'codex'),
  item(18, 'Prescription history', 'reconciliation', 'Show date, source, and documented lifecycle state separately from actual administration.'),
  item(19, 'Administration record', 'reconciliation', 'Show synthetic scheduled, given, missed, and overdue entries as documented with timestamps.'),
  item(20, 'Pharmacy verification queue', 'reconciliation', 'Review mock orders with missing fields and link each item back to its source.'),

  item(21, 'Allergies and reactions', 'chart-basics', 'Display documented allergen, reaction, severity, and status, including explicit negatives and unknowns.'),
  item(22, 'Intolerances', 'chart-basics', 'Distinguish source-labeled intolerances from allergies and surface ambiguous records.'),
  item(23, 'Problem list', 'chart-basics', 'Show active, historical, and unclear status with the supporting entry.'),
  item(24, 'Diagnosis history', 'chart-basics', 'Group documented diagnoses by encounter and display source labels.'),
  item(25, 'Medical and surgical history', 'chart-basics', 'List dated events with procedures and conditions clearly distinguished.'),
  item(26, 'Family history', 'chart-basics', 'Show documented relationships and preserve unknown status where detail is absent.'),
  item(27, 'Social history', 'chart-basics', 'Present dated, attributed statements and keep conflicting values visible.'),
  item(28, 'Care team', 'chart-basics', 'List synthetic roles, participation, and documented contact routes.'),
  item(29, 'Preferences and accessibility', 'chart-basics', 'Display recorded language, interpreter, and accessibility needs.'),
  item(30, 'Advance directives', 'chart-basics', 'Show documented status, date, and source document when available.'),

  item(31, 'Vitals summary', 'results-trends', 'Show most recent documented values with units, source, and measurement time.'),
  item(32, 'Vital trends', 'results-trends', 'Plot synthetic observations and provide an accessible table.'),
  item(33, 'Flowsheet', 'results-trends', 'Align dated measurements across encounters while leaving gaps visible.'),
  item(34, 'Intake and output', 'results-trends', 'Show documented inputs and outputs within a clearly bounded time window.'),
  item(35, 'Lab results table', 'results-trends', 'Display result, unit, source range, status, and date.'),
  item(36, 'Lab trends', 'results-trends', 'Plot comparable results and show unit changes or noncomparable entries explicitly.'),
  item(37, 'Critical result review', 'results-trends', 'Surface source-provided flags and mock acknowledgment history.'),
  item(38, 'Specimen tracking', 'results-trends', 'Show collection, receipt, processing, and final status when recorded.'),
  item(39, 'Imaging reports', 'results-trends', 'Show dated impressions and original synthetic text with preliminary/final labels.'),
  item(40, 'Microbiology and pathology', 'results-trends', 'Show synthetic report history, preliminary states, and final amendments.'),

  item(41, 'Visit preparation', 'encounters', 'Summarize upcoming encounter details and outstanding documented items.'),
  item(42, 'Rooming checklist', 'encounters', 'Simulate completion of synthetic intake tasks and show remaining work.'),
  item(43, 'Encounter overview', 'encounters', 'Bring the active visit, note, results, and outstanding tasks into one view with links.'),
  item(44, 'Note sections', 'encounters', 'Navigate a long structured note by headings and preserve its source metadata.'),
  item(45, 'Draft comparison', 'encounters', 'Compare a synthetic draft against its source and report review state.'),
  item(46, 'Order review', 'encounters', 'Display synthetic order details, origin, and lifecycle state.'),
  item(47, 'Referral status', 'encounters', 'Show pending, scheduled, completed, and closed synthetic referrals with dates.'),
  item(48, 'Care plan goals', 'encounters', 'Show documented goals, review dates, and source-linked progress.'),
  item(49, 'Immunization history', 'encounters', 'Display recorded administrations with dates and origins.'),
  item(50, 'Discharge summary', 'encounters', 'Show instructions, follow-ups, and documented medication differences with source links.'),

  item(51, 'Follow-up worklist', 'queues', 'Extend the review flow with unresolved items, synthetic owner, and next action.'),
  item(52, 'Results inbox', 'queues', 'Filter mock incoming results by workflow state and open the source.'),
  item(53, 'Documentation queue', 'queues', 'Show draft, pending review, and complete states from fixture records.'),
  item(54, 'Chart review queue', 'queues', 'Show unresolved source links and conflicting items with jump targets.'),
  item(55, 'Care-team handoff', 'queues', 'Summarize unresolved items and source-linked changes for simulated shift review.'),
  item(56, 'Rounds list', 'queues', 'Show work for the synthetic patient by encounter while retaining one selectable chart.'),
  item(57, 'Visit schedule', 'queues', 'Show dated synthetic appointment entries and appointment status.'),
  item(58, 'Transition tracker', 'queues', 'Display admission, transfer, and discharge events in source order.'),
  item(59, 'Reminders and recalls', 'queues', 'Show known dates, owners, and documented completion states.'),
  item(60, 'Communications history', 'queues', 'Display synthetic portal and care-team messages with threads and timestamps.'),

  item(61, 'Emergency tracking', 'specialty', 'Show mock arrival, triage, testing, and disposition milestones.'),
  item(62, 'ICU timeline', 'specialty', 'Align documented vitals, interventions, and medication administrations by time.'),
  item(63, 'Perioperative checklist', 'specialty', 'Show documented pre-op, procedure, and recovery milestones.'),
  item(64, 'Anesthesia record', 'specialty', 'Align synthetic medications, observations, and procedural timestamps.'),
  item(65, 'Labor and delivery board', 'specialty', 'Show maternity encounter milestones and documented care-team actions.'),
  item(66, 'Oncology regimen tracker', 'specialty', 'Show synthetic cycles, planned dates, completed administrations, and documented changes.'),
  item(67, 'Pediatric growth', 'specialty', 'Plot dated synthetic measurements with units and an accessible tabular view.'),
  item(68, 'Behavioral health assessments', 'specialty', 'Display documented assessment dates, results, and source provenance.'),
  item(69, 'Rehab goals', 'specialty', 'Track synthetic therapy sessions and documented progress toward goals.'),
  item(70, 'Dental chart', 'specialty', 'Display synthetic tooth/site, finding, and procedure history.'),
  item(71, 'Home care visits', 'specialty', 'Show visit schedule, visit outcome, and outstanding follow-up.'),
  item(72, 'Long-term care dashboard', 'specialty', 'Show resident care goals, review schedule, and relevant documented events.'),

  item(73, 'Plain-language visit summary', 'patient-facing', 'Display a reviewed synthetic summary with original chart references.'),
  item(74, 'Patient medication list', 'patient-facing', 'Show documented names and regimen details in a read-only, plain-language layout.'),
  item(75, 'Patient results timeline', 'patient-facing', 'Show synthetic results with dates and release state.'),
  item(76, 'Patient forms', 'patient-facing', 'Present mock intake forms with accessible controls and local-only submission states.'),
  item(77, 'Appointment details', 'patient-facing', 'Show synthetic status, location, and check-in instructions.'),
  item(78, 'Proxy access preview', 'patient-facing', 'Demonstrate synthetic patient and proxy views with explicit access state.'),
  item(79, 'Visit preparation checklist', 'patient-facing', 'Show documented preparation tasks for the synthetic appointment.'),
  item(80, 'Education resources', 'patient-facing', 'Show fixture-linked educational material and its source.'),

  item(81, 'Registration summary', 'operations', 'Show synthetic registration fields and any missing data.'),
  item(82, 'Coverage overview', 'operations', 'Display mock coverage status and recorded dates.'),
  item(83, 'Prior authorization tracker', 'operations', 'Show mock submission, pending, and resolved states with provenance.'),
  item(84, 'Coding review queue', 'operations', 'Show synthetic coding suggestions beside their source for human review.'),
  item(85, 'Billing status', 'operations', 'Present synthetic claim stages and status history.'),
  item(86, 'Capacity board', 'operations', 'Display mock occupancy, availability, and timestamp without exposing patient records.'),
  item(87, 'Staffing view', 'operations', 'Show mock shifts and role assignments by unit.'),
  item(88, 'Privacy and access audit', 'operations', 'Show synthetic access events, actor role, and recorded action.'),
  item(89, 'Chart completeness dashboard', 'operations', 'Count missing and unresolved fixture fields and link each count to affected records.'),
  item(90, 'Surveillance board', 'operations', 'Present pre-labeled synthetic events and explain which fixture supplied each flag.'),

  item(91, 'Suggestion explanation', 'model-platform', 'Explain the evidence behind an existing synthetic suggestion and show uncertainty.'),
  item(92, 'Suggestion review outcomes', 'model-platform', 'Extend the existing triage view with evidence-linked accept, reject, and defer outcomes.'),
  item(93, 'Model status card', 'model-platform', 'Distinguish unavailable, local, replay, and verified hosted states with accurate labels.'),
  item(94, 'Evaluation breakdown', 'model-platform', 'Show exact tested denominators, passes, failures, timeouts, and case-family counts.', 'codex'),
  item(95, 'Evaluation failure drill-down', 'model-platform', 'Open a synthetic failed case and display expected result, actual result, and error type.'),
  item(96, 'Assistant evidence rendering', 'model-platform', 'Verify question responses can display sources and abstentions using synthetic test responses.', 'codex'),
  item(97, 'Workflow presets', 'model-platform', 'Validate focused layouts for review, results, and care coordination with a predictable default.'),
  item(98, 'Cross-widget accessibility check', 'model-platform', 'Verify tab order, announcements, readable charts, focus return, and reduced motion across presets.'),
  item(99, 'Performance check', 'model-platform', 'Measure existing chart interactions with a larger synthetic fixture and address any regression.'),
  item(100, 'Demo walkthrough', 'model-platform', 'Verify one synthetic medication change from note comparison through evidence review, follow-up, and audit.'),
];

export const REMAINING_ANTIGRAVITY_IDS: readonly number[] = BACKLOG_WIDGET_CATALOG
  .filter((w) => w.owner === 'antigravity' && w.id >= 14)
  .map((w) => w.id);

const row = (
  id: string,
  label: string,
  value: string,
  status: WidgetFieldRow['status'],
  sourceLabel: string,
  recordedAt: string | null,
  detail?: string,
): WidgetFieldRow => ({
  id,
  label,
  value,
  status,
  sourceLabel,
  recordedAt,
  ...(detail ? { detail } : {}),
});

const SYNTHETIC_FIXTURE_ROWS: Record<number, { summaryLine: string; rows: WidgetFieldRow[]; series?: WidgetSeriesPoint[]; checklist?: { id: string; text: string; done: boolean; sourceLabel: string }[] }> = {
  15: {
    summaryLine: 'Original documented drug names paired with verified synthetic RxNorm / brand aliases.',
    rows: [
      row('15-1', 'Tylenol → Acetaminophen', 'RxCUI 161 (synthetic alias)', 'documented', 'Ambulatory Med List', '2026-10-01'),
      row('15-2', 'Prilosec → Omeprazole', 'RxCUI 7646 (synthetic alias)', 'documented', 'Discharge Summary', '2026-10-15'),
      row('15-3', 'Unmapped herbal supplement', 'No verified alias mapping', 'unknown', 'Patient Call Log', null),
    ],
  },
  18: {
    summaryLine: 'Prescribing lifecycle separated from bedside medication administration.',
    rows: [
      row('18-1', 'Lisinopril 20 mg PO daily', 'Order: Active · Last dispensed 2026-10-15', 'documented', 'Outpatient Pharmacy Feed', '2026-10-15'),
      row('18-2', 'Amoxicillin 500 mg PO TID', 'Order: Completed (7-day course)', 'completed', 'Discharge eRx', '2026-10-10'),
      row('18-3', 'Metformin 500 mg PO BID', 'Order: Held pending renal lab', 'warning', 'Inpatient MAR/Orders', '2026-10-14'),
    ],
  },
  19: {
    summaryLine: 'Synthetic MAR administration entries with explicit scheduled vs. given/missed timestamps.',
    rows: [
      row('19-1', 'Lisinopril 20 mg PO', 'Given at 08:05', 'completed', 'Synthetic MAR', '2026-10-15T08:05:00Z'),
      row('19-2', 'Metformin 500 mg PO', 'Held — NPO for imaging', 'warning', 'Synthetic MAR', '2026-10-15T12:00:00Z'),
      row('19-3', 'Atorvastatin 20 mg PO', 'Scheduled 21:00 (not yet due)', 'pending', 'Synthetic MAR', '2026-10-15T21:00:00Z'),
    ],
  },
  20: {
    summaryLine: 'Mock pharmacy verification orders highlighting missing fields and source citations.',
    rows: [
      row('20-1', 'Enoxaparin 40 mg', 'Missing frequency & duration', 'missing', 'Admission Orders Draft', '2026-10-14'),
      row('20-2', 'Lisinopril 20 mg oral daily', 'Complete order fields', 'documented', 'Discharge eRx', '2026-10-15'),
    ],
  },
  21: {
    summaryLine: 'Documented allergies, reactions, explicit negatives, and unknown entries.',
    rows: [
      row('21-1', 'Penicillin', 'Urticaria · High severity · Active', 'documented', 'Allergy Banner', '2026-10-01'),
      row('21-2', 'Latex', 'Explicit negative (No known latex allergy)', 'documented', 'Intake Screen', '2026-10-01'),
      row('21-3', 'Contrast dye', 'Reaction unrecorded (unknown)', 'unknown', 'Outside Referral Note', null),
    ],
  },
  22: {
    summaryLine: 'Source-labeled intolerances kept distinct from immune-mediated allergies.',
    rows: [
      row('22-1', 'Metformin (GI upset)', 'Intolerance · Mild nausea reported', 'documented', 'PCP Progress Note', '2026-09-12'),
      row('22-2', 'Codeine (dizziness)', 'Ambiguous: listed under allergy in external PDF', 'conflicting', 'External Record PDF', '2026-08-04'),
    ],
  },
  23: {
    summaryLine: 'Active, historical, and unclear problem entries linked to supporting notes.',
    rows: [
      row('23-1', 'Essential hypertension', 'Active · Controlled on titration', 'documented', 'Outpatient Problem List', '2026-10-01'),
      row('23-2', 'Type 2 diabetes mellitus', 'Active · Monitoring A1c', 'documented', 'Outpatient Problem List', '2026-10-01'),
      row('23-3', 'Community-acquired pneumonia', 'Historical · Resolved 2024', 'completed', 'Historical Summary', '2024-11-18'),
      row('23-4', 'Intermittent palpitations', 'Unclear status — no follow-up ECG', 'unknown', 'Triage Note', '2026-10-12'),
    ],
  },
  24: {
    summaryLine: 'Encounter-grouped diagnoses with explicit source provenance.',
    rows: [
      row('24-1', 'Enc 2026-10-15 (Discharge)', 'Hypertension (I10), Acute bronchitis (J20.9)', 'documented', 'Hospital Discharge Note', '2026-10-15'),
      row('24-2', 'Enc 2026-10-01 (Primary Care)', 'Essential hypertension (I10), Type 2 DM (E11.9)', 'documented', 'Clinic Progress Note', '2026-10-01'),
    ],
  },
  25: {
    summaryLine: 'Dated past medical conditions and surgical procedures kept distinct.',
    rows: [
      row('25-1', 'Procedure: Laparoscopic cholecystectomy', '2019-06-14 · Uncomplicated', 'completed', 'Surgical History', '2019-06-14'),
      row('25-2', 'Condition: Gestational hypertension', '2012 · Resolved postpartum', 'completed', 'PMH Summary', '2012-04-02'),
    ],
  },
  26: {
    summaryLine: 'Documented family history preserving explicit unknown where details are absent.',
    rows: [
      row('26-1', 'Mother — Hypertension', 'Diagnosed age 55 · Living', 'documented', 'Intake Family Hx', '2025-03-10'),
      row('26-2', 'Paternal cardiac history', 'Unknown — patient unsure of details', 'unknown', 'Intake Family Hx', '2025-03-10'),
    ],
  },
  27: {
    summaryLine: 'Attributed social history keeping conflicting statements visible.',
    rows: [
      row('27-1', 'Tobacco use', 'Never smoker (Clinic Note 2026-10-01) vs. Former 2 pack-year (ED Intake 2026-10-12)', 'conflicting', 'Clinic vs. ED Intake', '2026-10-12'),
      row('27-2', 'Living situation', 'Lives with spouse in single-level home', 'documented', 'Social Work Note', '2026-10-14'),
    ],
  },
  28: {
    summaryLine: 'Synthetic care team roles, participation status, and documented contact routes.',
    rows: [
      row('28-1', 'Dr. A. Patel (Synthetic PCP)', 'Primary care · Clinic inbox / ext 4401', 'documented', 'Care Team Registry', '2026-10-01'),
      row('28-2', 'R. Nguyen, PharmD (Synthetic)', 'Discharge med rec · Pharmacy queue', 'documented', 'Inpatient Consult', '2026-10-15'),
    ],
  },
  29: {
    summaryLine: 'Recorded language, interpreter, and accessibility preferences.',
    rows: [
      row('29-1', 'Preferred language', 'English · Interpreter not needed', 'documented', 'Registration Profile', '2026-10-01'),
      row('29-2', 'Visual accessibility', 'Prefers high-contrast print & 16pt discharge sheet', 'documented', 'Patient Preferences', '2026-10-01'),
    ],
  },
  30: {
    summaryLine: 'Advance directive status, recorded date, and source document.',
    rows: [
      row('30-1', 'Healthcare proxy on file', 'Verified 2025-05-20 (Spouse, synthetic)', 'documented', 'Scanned Directive PDF', '2025-05-20'),
      row('30-2', 'POLST form', 'Not on file (unknown if completed externally)', 'unknown', 'Chart Directives', null),
    ],
  },
  31: {
    summaryLine: 'Most recent documented synthetic vital signs with units and measurement time.',
    rows: [
      row('31-1', 'Blood Pressure', '134 / 82 mmHg (Seated, left arm)', 'documented', 'Discharge Vitals', '2026-10-15T09:30:00Z'),
      row('31-2', 'Heart Rate', '74 bpm', 'documented', 'Discharge Vitals', '2026-10-15T09:30:00Z'),
      row('31-3', 'SpO2', '98% on room air', 'documented', 'Discharge Vitals', '2026-10-15T09:30:00Z'),
    ],
  },
  32: {
    summaryLine: 'Synthetic systolic BP trend across recent encounters with tabular fallback.',
    rows: [
      row('32-1', '2026-08-10', '146/88 mmHg', 'warning', 'Clinic Vitals', '2026-08-10'),
      row('32-2', '2026-10-01', '140/86 mmHg', 'documented', 'Clinic Vitals', '2026-10-01'),
      row('32-3', '2026-10-15', '134/82 mmHg', 'completed', 'Discharge Vitals', '2026-10-15'),
    ],
    series: [
      { label: 'Aug 10', value: 146, unit: 'mmHg (SBP)', recordedAt: '2026-08-10', comparable: true },
      { label: 'Oct 01', value: 140, unit: 'mmHg (SBP)', recordedAt: '2026-10-01', comparable: true },
      { label: 'Oct 15', value: 134, unit: 'mmHg (SBP)', recordedAt: '2026-10-15', comparable: true },
    ],
  },
  33: {
    summaryLine: 'Cross-encounter flowsheet keeping unmeasured intervals visibly blank.',
    rows: [
      row('33-1', 'Weight (kg)', '72.4 kg (Oct 01) · Not recorded (Oct 12) · 71.8 kg (Oct 15)', 'missing', 'Encounter Flowsheet', '2026-10-15'),
      row('33-2', 'Temp (°C)', '36.8 °C (Oct 01) · 37.9 °C (Oct 12) · 36.7 °C (Oct 15)', 'documented', 'Encounter Flowsheet', '2026-10-15'),
    ],
  },
  34: {
    summaryLine: '24-hour synthetic intake and output within bounded window (2026-10-14 07:00–2026-10-15 07:00).',
    rows: [
      row('34-1', 'Total Intake (24h)', '1,850 mL (Oral 1,350 mL + IV 500 mL)', 'documented', 'Nursing I&O Sheet', '2026-10-15T07:00:00Z'),
      row('34-2', 'Total Output (24h)', '1,620 mL (Urine)', 'documented', 'Nursing I&O Sheet', '2026-10-15T07:00:00Z'),
      row('34-3', 'Net Balance', '+230 mL', 'documented', 'Calculated I&O', '2026-10-15T07:00:00Z'),
    ],
  },
  35: {
    summaryLine: 'Synthetic lab results with units, reference ranges, flags, and dates.',
    rows: [
      row('35-1', 'Serum Creatinine', '0.94 mg/dL (Ref 0.60–1.20)', 'documented', 'Core Lab', '2026-10-14'),
      row('35-2', 'Potassium', '4.3 mmol/L (Ref 3.5–5.1)', 'documented', 'Core Lab', '2026-10-14'),
      row('35-3', 'HbA1c', '7.4 % (Ref < 5.7 % · High)', 'warning', 'Outpatient Lab', '2026-10-01'),
    ],
  },
  36: {
    summaryLine: 'Lab trends explicitly flagging unit shifts and noncomparable assays.',
    rows: [
      row('36-1', 'Creatinine (mg/dL)', '0.91 → 0.96 → 0.94 mg/dL (Comparable)', 'documented', 'Lab Trend Engine', '2026-10-14'),
      row('36-2', 'External Glucose (mmol/L)', '7.8 mmol/L — unit differs from local mg/dL', 'warning', 'Outside Lab Import', '2026-09-20'),
    ],
    series: [
      { label: 'Aug 01', value: 0.91, unit: 'mg/dL', recordedAt: '2026-08-01', comparable: true },
      { label: 'Oct 01', value: 0.96, unit: 'mg/dL', recordedAt: '2026-10-01', comparable: true },
      { label: 'Oct 14', value: 0.94, unit: 'mg/dL', recordedAt: '2026-10-14', comparable: true },
    ],
  },
  37: {
    summaryLine: 'Source-flagged critical lab alerts with mock acknowledgment audit.',
    rows: [
      row('37-1', 'Troponin I (2026-10-12)', '0.02 ng/mL (Normal — not critical)', 'completed', 'ED Lab Feed', '2026-10-12'),
      row('37-2', 'Potassium 5.8 mmol/L (Synthetic alert drill)', 'Acknowledged by Dr. A. Patel at 14:18', 'warning', 'Lab Critical Log', '2026-10-13'),
    ],
  },
  38: {
    summaryLine: 'Specimen collection, receipt, processing, and final result milestones.',
    rows: [
      row('38-1', 'SPEC-SYN-401 (BMP)', 'Collected 06:15 → Received 06:28 → Final 07:02', 'completed', 'Lab Specimen Tracker', '2026-10-14T07:02:00Z'),
      row('38-2', 'SPEC-SYN-409 (Lipid panel)', 'Ordered — specimen not yet collected', 'pending', 'Lab Specimen Tracker', '2026-10-15'),
    ],
  },
  39: {
    summaryLine: 'Dated imaging impressions distinguishing Preliminary vs. Final reads.',
    rows: [
      row('39-1', 'CXR PA & Lateral (Final)', 'No acute cardiopulmonary process; mild hyperinflation.', 'completed', 'Radiology PACS', '2026-10-12'),
      row('39-2', 'Renal Ultrasound (Preliminary)', 'Pending final attending signature.', 'pending', 'Radiology PACS', '2026-10-15'),
    ],
  },
  40: {
    summaryLine: 'Microbiology & pathology reports showing preliminary states and amendments.',
    rows: [
      row('40-1', 'Sputum Culture (Amended Final)', 'Normal respiratory flora (amended from preliminary gram stain)', 'documented', 'Microbiology Lab', '2026-10-14'),
      row('40-2', 'Blood Culture x2 (Preliminary 48h)', 'No growth to date at 48 hours', 'pending', 'Microbiology Lab', '2026-10-14'),
    ],
  },
  41: {
    summaryLine: 'Upcoming ambulatory follow-up summary and open documentation items.',
    rows: [
      row('41-1', 'Scheduled PCP Follow-up', '2026-10-22 · Post-discharge med reconciliation', 'pending', 'Scheduling Feed', '2026-10-22'),
      row('41-2', 'Open review item', 'Confirm Lisinopril 20 mg vs 10 mg discrepancy', 'warning', 'Clinical Diff Queue', '2026-10-15'),
    ],
  },
  42: {
    summaryLine: 'Interactive local simulation of synthetic rooming intake tasks.',
    rows: [
      row('42-1', 'Intake vitals recorded', 'Completed at 09:10', 'completed', 'Rooming Flow', '2026-10-15'),
      row('42-2', 'Medication list verified with patient', 'Pending clinician sign-off', 'pending', 'Rooming Flow', '2026-10-15'),
    ],
    checklist: [
      { id: 'chk-42-1', text: 'Verify synthetic wristband & DOB (Morgan Lee)', done: true, sourceLabel: 'Rooming Flow' },
      { id: 'chk-42-2', text: 'Reconcile outside pharmacy fill list', done: false, sourceLabel: 'Pharmacy Feed' },
      { id: 'chk-42-3', text: 'Confirm allergy & intolerance banner', done: true, sourceLabel: 'Allergy Banner' },
    ],
  },
  43: {
    summaryLine: 'Unified active encounter overview linking visit, note, labs, and tasks.',
    rows: [
      row('43-1', 'Active Encounter', 'Discharge Medication Reconciliation (DEMO-001)', 'documented', 'Encounter Banner', '2026-10-15'),
      row('43-2', 'Key Labs', 'Cr 0.94 mg/dL · K+ 4.3 mmol/L', 'documented', 'Core Lab', '2026-10-14'),
      row('43-3', 'Outstanding Tasks', 'Review dose titration & follow-up labs', 'warning', 'Task Engine', '2026-10-15'),
    ],
  },
  44: {
    summaryLine: 'Structured clinical note section outline preserving source metadata.',
    rows: [
      row('44-1', 'HPI & Hospital Course', 'Section offset 0–420 · Discharge Summary', 'documented', 'Discharge Note', '2026-10-15'),
      row('44-2', 'Discharge Medications', 'Section offset 421–890 · Discharge Summary', 'documented', 'Discharge Note', '2026-10-15'),
      row('44-3', 'Follow-up Plan', 'Section offset 891–1120 · Discharge Summary', 'documented', 'Discharge Note', '2026-10-15'),
    ],
  },
  45: {
    summaryLine: 'Synthetic note draft compared against source medication list.',
    rows: [
      row('45-1', 'Draft vs Source — Lisinopril', 'Draft lists 20 mg daily (matches discharge order)', 'completed', 'Draft Comparator', '2026-10-15'),
      row('45-2', 'Draft vs Source — Amoxicillin', 'Draft omits 7-day duration present in eRx', 'warning', 'Draft Comparator', '2026-10-15'),
    ],
  },
  46: {
    summaryLine: 'Synthetic order details, origin, and lifecycle state.',
    rows: [
      row('46-1', 'ORD-1042 · BMP (Outpatient)', 'Origin: Discharge Plan · Status: Signed / Pending draw', 'pending', 'Order Catalog', '2026-10-15'),
      row('46-2', 'ORD-1039 · Lisinopril 20 mg', 'Origin: Discharge eRx · Status: Sent to pharmacy', 'completed', 'Order Catalog', '2026-10-15'),
    ],
  },
  47: {
    summaryLine: 'Synthetic referral lifecycle across pending, scheduled, completed, and closed.',
    rows: [
      row('47-1', 'REF-201 · Clinical Pharmacy Consult', 'Completed 2026-10-14', 'completed', 'Referral Tracker', '2026-10-14'),
      row('47-2', 'REF-204 · Cardiology Follow-up', 'Scheduled for 2026-11-02', 'pending', 'Referral Tracker', '2026-10-15'),
    ],
  },
  48: {
    summaryLine: 'Documented care plan goals with review dates and source links.',
    rows: [
      row('48-1', 'Target BP < 130/80 mmHg', 'In progress · Next check 2026-10-22', 'documented', 'Care Plan Note', '2026-10-15'),
      row('48-2', 'Complete 7-day antibiotic course', 'Target end date 2026-10-17', 'pending', 'Discharge Instructions', '2026-10-10'),
    ],
  },
  49: {
    summaryLine: 'Recorded synthetic immunizations with administration dates and origins.',
    rows: [
      row('49-1', 'Influenza (Quadrivalent)', 'Administered 2026-09-28 · Retail Pharmacy Sync', 'completed', 'IIS Registry Sync', '2026-09-28'),
      row('49-2', 'Tdap', 'Administered 2022-04-11 · Primary Care Clinic', 'completed', 'Clinic Immunization Log', '2022-04-11'),
    ],
  },
  52: {
    summaryLine: 'Mock incoming results inbox filtered by review workflow state.',
    rows: [
      row('52-1', 'HbA1c 7.4% (Abnormal)', 'Unread · Requires clinician acknowledgment', 'warning', 'Lab Inbox', '2026-10-01'),
      row('52-2', 'CXR Final Report', 'Reviewed by Dr. A. Patel', 'completed', 'Imaging Inbox', '2026-10-12'),
    ],
  },
  53: {
    summaryLine: 'Synthetic documentation queue showing draft, pending review, and complete.',
    rows: [
      row('53-1', 'Discharge Med Rec Note', 'Pending clinician review', 'pending', 'Doc Queue', '2026-10-15'),
      row('53-2', 'Admission H&P', 'Signed & complete', 'completed', 'Doc Queue', '2026-10-12'),
    ],
  },
  55: {
    summaryLine: 'Simulated shift handoff summary of unresolved items and source-linked changes.',
    rows: [
      row('55-1', 'Lisinopril dose increase (10 → 20 mg)', 'Watch standing BP & check Cr at 1-week follow-up', 'warning', 'Handoff Summary', '2026-10-15'),
      row('55-2', 'Penicillin allergy active', 'Confirmed before Amoxicillin hold/review', 'documented', 'Allergy Banner', '2026-10-01'),
    ],
  },
  56: {
    summaryLine: 'Encounter-scoped rounds list retaining Morgan Lee as sole selectable chart.',
    rows: [
      row('56-1', 'Morgan Lee (DEMO-001) · Discharge Day', '2 open med rec items · Ready for follow-up', 'pending', 'Rounds Tracker', '2026-10-15'),
    ],
  },
  57: {
    summaryLine: 'Dated synthetic appointment entries and attendance statuses.',
    rows: [
      row('57-1', '2026-10-01 10:00 · Primary Care', 'Completed', 'completed', 'Scheduling Feed', '2026-10-01'),
      row('57-2', '2026-10-22 14:30 · Post-Discharge Follow-up', 'Scheduled', 'pending', 'Scheduling Feed', '2026-10-22'),
    ],
  },
  58: {
    summaryLine: 'Admission, transfer, and discharge (ADT) events in chronological source order.',
    rows: [
      row('58-1', '2026-10-12 18:10 · ED Arrival', 'Triage ESI 3', 'completed', 'ADT Feed', '2026-10-12T18:10:00Z'),
      row('58-2', '2026-10-13 01:40 · Inpatient Floor Transfer', 'Medicine Unit 4B', 'completed', 'ADT Feed', '2026-10-13T01:40:00Z'),
      row('58-3', '2026-10-15 11:15 · Discharged Home', 'With discharge med rec packet', 'completed', 'ADT Feed', '2026-10-15T11:15:00Z'),
    ],
  },
  59: {
    summaryLine: 'Preventive reminders and clinical recalls with due dates and owners.',
    rows: [
      row('59-1', 'Repeat BMP (1 week post-Lisinopril increase)', 'Due 2026-10-22 · Owner: PCP', 'pending', 'Recall Queue', '2026-10-22'),
      row('59-2', 'Annual Influenza Vaccine', 'Completed 2026-09-28', 'completed', 'Preventive Care', '2026-09-28'),
    ],
  },
  60: {
    summaryLine: 'Synthetic portal and care-team message threads with timestamps.',
    rows: [
      row('60-1', 'Patient Portal · Question on evening pill', 'Sent 2026-10-15 15:20 · Replied by RN', 'completed', 'Portal Messages', '2026-10-15T15:20:00Z'),
      row('60-2', 'Care-Team Thread · PharmD → PCP', 'Flagged Amoxicillin duration note', 'pending', 'Team Messaging', '2026-10-15T16:05:00Z'),
    ],
  },
  61: {
    summaryLine: 'Mock ED arrival, triage, testing, and disposition milestones.',
    rows: [
      row('61-1', 'Arrival → Triage → Labs/CXR → Observation → Discharged', 'All 5 synthetic ED milestones timestamped', 'completed', 'ED Track Board', '2026-10-12'),
    ],
  },
  62: {
    summaryLine: 'Time-aligned synthetic ICU vitals, interventions, and medications.',
    rows: [
      row('62-1', '08:00 · MAP 78 mmHg · No pressors', 'Routine neuro/cardiac checks', 'documented', 'ICU Flowsheet', '2026-10-13T08:00:00Z'),
    ],
  },
  63: {
    summaryLine: 'Documented pre-op, procedure, and recovery checklist milestones.',
    rows: [
      row('63-1', 'Pre-op consent & NPO check (Synthetic drill)', 'Verified · No active surgery scheduled', 'completed', 'Periop Board', '2026-10-12'),
    ],
  },
  64: {
    summaryLine: 'Time-aligned synthetic anesthesia medication and vital events.',
    rows: [
      row('64-1', 'Historical 2019 Cholecystectomy Anesthesia', 'Uncomplicated general anesthesia (archived)', 'completed', 'Anesthesia Record', '2019-06-14'),
    ],
  },
  65: {
    summaryLine: 'Synthetic L&D maternity milestones (not applicable to active non-obstetric visit).',
    rows: [
      row('65-1', 'Active obstetric episode', 'None documented on current encounter', 'unknown', 'L&D Board', null),
    ],
  },
  66: {
    summaryLine: 'Synthetic oncology cycle & regimen tracker (inactive for current patient).',
    rows: [
      row('66-1', 'Active chemotherapy protocol', 'None documented for Morgan Lee', 'unknown', 'Oncology Tracker', null),
    ],
  },
  67: {
    summaryLine: 'Dated synthetic growth measurements with units and accessible table.',
    rows: [
      row('67-1', 'Adult height (baseline)', '168 cm (Recorded 2025-03-10)', 'documented', 'Anthropometrics', '2025-03-10'),
      row('67-2', 'Weight trend', '72.4 kg (Oct 01) → 71.8 kg (Oct 15)', 'documented', 'Anthropometrics', '2026-10-15'),
    ],
    series: [
      { label: 'Oct 01', value: 72.4, unit: 'kg', recordedAt: '2026-10-01', comparable: true },
      { label: 'Oct 15', value: 71.8, unit: 'kg', recordedAt: '2026-10-15', comparable: true },
    ],
  },
  68: {
    summaryLine: 'Documented behavioral health screening dates, scores, and provenance.',
    rows: [
      row('68-1', 'PHQ-2 Depression Screen', 'Score 1 (Negative) · Clinic Intake', 'completed', 'Behavioral Screening', '2026-10-01'),
    ],
  },
  69: {
    summaryLine: 'Synthetic rehabilitation therapy sessions and goal progress.',
    rows: [
      row('69-1', 'PT Mobility Assessment', 'Independent ambulation 300 ft at discharge', 'completed', 'PT Progress Note', '2026-10-15'),
    ],
  },
  70: {
    summaryLine: 'Synthetic dental tooth/site findings and procedure history.',
    rows: [
      row('70-1', 'Tooth #19 · Porcelain crown', 'Intact · External dental note 2025-08-19', 'documented', 'Dental Summary', '2025-08-19'),
    ],
  },
  71: {
    summaryLine: 'Synthetic home-health visit schedule, outcome, and follow-up.',
    rows: [
      row('71-1', 'Post-discharge RN Home Check', 'Scheduled 2026-10-17 · Verify med adherence', 'pending', 'Home Health Queue', '2026-10-17'),
    ],
  },
  72: {
    summaryLine: 'Synthetic long-term care goals and scheduled care conferences.',
    rows: [
      row('72-1', 'Resident status', 'Outpatient home-dwelling (LTC not active)', 'documented', 'Care Setting Profile', '2026-10-15'),
    ],
  },
  73: {
    summaryLine: 'Plain-language synthetic visit summary linked back to chart citations.',
    rows: [
      row('73-1', 'Why your medicine changed', 'Your blood pressure pill (Lisinopril) was increased from 10 mg to 20 mg once daily.', 'documented', 'Discharge Summary [Ref: Med-1]', '2026-10-15'),
      row('73-2', 'Next lab check', 'Please get a routine blood test before your Oct 22 clinic visit.', 'pending', 'Follow-up Plan [Ref: Ord-1042]', '2026-10-15'),
    ],
  },
  74: {
    summaryLine: 'Read-only plain-language patient medication sheet.',
    rows: [
      row('74-1', 'Lisinopril 20 mg', 'Take 1 tablet by mouth once every morning for blood pressure.', 'documented', 'Discharge Med List', '2026-10-15'),
      row('74-2', 'Metformin 500 mg', 'Take 1 tablet by mouth twice daily with meals.', 'documented', 'Discharge Med List', '2026-10-15'),
    ],
  },
  75: {
    summaryLine: 'Patient-facing synthetic results timeline with release status.',
    rows: [
      row('75-1', 'Basic Metabolic Panel (Oct 14)', 'Released to portal · Normal kidney function', 'completed', 'Portal Release Log', '2026-10-14'),
      row('75-2', 'Renal Ultrasound', 'Pending final radiologist sign-off (not released)', 'pending', 'Portal Release Log', '2026-10-15'),
    ],
  },
  76: {
    summaryLine: 'Accessible mock intake form with local-only draft submission state.',
    rows: [
      row('76-1', 'Pre-Visit Symptom & Med Check Form', 'Local draft only — no external EHR write', 'pending', 'Patient Portal Form', '2026-10-15'),
    ],
    checklist: [
      { id: 'chk-76-1', text: 'Confirmed current home address & pharmacy', done: true, sourceLabel: 'Intake Form' },
      { id: 'chk-76-2', text: 'Reported any new dizziness since dose change', done: false, sourceLabel: 'Intake Form' },
    ],
  },
  77: {
    summaryLine: 'Synthetic appointment status, clinic location, and arrival instructions.',
    rows: [
      row('77-1', '2026-10-22 14:30 · General Medicine Clinic', 'Confirmed · Bring pill bottles; arrive 15 min early', 'documented', 'Appointment Card', '2026-10-22'),
    ],
  },
  78: {
    summaryLine: 'Synthetic patient vs. authorized proxy view with explicit access scope.',
    rows: [
      row('78-1', 'Patient View (Morgan Lee)', 'Full read access to synthetic summary & meds', 'documented', 'Access Policy', '2026-10-15'),
      row('78-2', 'Proxy View (Spouse · Read-Only)', 'Appointments & med list visible; sensitive notes hidden', 'documented', 'Proxy Consent Log', '2025-05-20'),
    ],
  },
  79: {
    summaryLine: 'Patient visit preparation tasks linked to appointment instructions.',
    rows: [
      row('79-1', 'Fasting morning lab draw', 'Complete 24–48h prior to Oct 22 visit', 'pending', 'Visit Prep Sheet', '2026-10-15'),
    ],
  },
  80: {
    summaryLine: 'Fixture-linked synthetic patient education sheets with source citations.',
    rows: [
      row('80-1', 'Understanding ACE Inhibitors (Lisinopril)', 'Synthetic MedLine-style handout · Updated 2026', 'documented', 'Patient Education Library', '2026-01-10'),
    ],
  },
  81: {
    summaryLine: 'Synthetic registration demographics flagging missing contact fields.',
    rows: [
      row('81-1', 'Patient ID & Name', 'DEMO-001 · Morgan Lee (Synthetic)', 'documented', 'Registration', '2026-10-01'),
      row('81-2', 'Secondary emergency phone', 'Missing (null)', 'missing', 'Registration', '2026-10-01'),
    ],
  },
  82: {
    summaryLine: 'Mock insurance coverage status and verification dates.',
    rows: [
      row('82-1', 'Synthetic Health Plan PPO', 'Active · Verified 2026-10-12', 'completed', 'Eligibility Check', '2026-10-12'),
    ],
  },
  83: {
    summaryLine: 'Mock prior authorization tracker with submission and resolution states.',
    rows: [
      row('83-1', 'PA-SYN-882 · Continuous Glucose Monitor', 'Submitted 2026-10-05 · Pending payer response', 'pending', 'PA Tracker', '2026-10-05'),
    ],
  },
  84: {
    summaryLine: 'Synthetic coding suggestions placed beside supporting clinical excerpts.',
    rows: [
      row('84-1', 'ICD-10 I10 (Essential Hypertension)', 'Supported by "Increase Lisinopril 20 mg for HTN"', 'documented', 'Coding Queue', '2026-10-15'),
      row('84-2', 'CPT 99495 (Transitional Care Mgmt)', 'Pending 14-day follow-up completion', 'pending', 'Coding Queue', '2026-10-15'),
    ],
  },
  85: {
    summaryLine: 'Synthetic claim lifecycle stages and status history (no live billing).',
    rows: [
      row('85-1', 'CLM-SYN-310 · Outpatient Clinic 2026-10-01', 'Adjudicated · Paid (Synthetic)', 'completed', 'Billing Ledger', '2026-10-08'),
    ],
  },
  86: {
    summaryLine: 'Aggregate unit occupancy and bed availability without exposing patient records.',
    rows: [
      row('86-1', 'Medicine Unit 4B (Synthetic aggregate)', '18 / 22 beds occupied · 4 available', 'documented', 'Capacity Feed', '2026-10-15T10:00:00Z'),
      row('86-2', 'Observation Unit', '9 / 10 beds occupied · 1 available', 'warning', 'Capacity Feed', '2026-10-15T10:00:00Z'),
    ],
  },
  87: {
    summaryLine: 'Mock shift and role assignments by clinical unit.',
    rows: [
      row('87-1', 'Day Shift 07:00–19:00 · Unit 4B', '1 Attending · 4 RNs · 1 Clinical PharmD', 'documented', 'Staffing Roster', '2026-10-15'),
    ],
  },
  88: {
    summaryLine: 'Synthetic privacy & access audit log recording actor role and action.',
    rows: [
      row('88-1', 'Clinician Reviewer · Viewed Snapshot Diff', 'DEMO-001 · Allowed (Assigned care team)', 'completed', 'Access Audit Log', '2026-10-15T10:12:00Z'),
      row('88-2', 'External Token Probe (Blocked)', 'Denied by SSRF / credential guard', 'warning', 'Security Audit', '2026-10-15T10:14:00Z'),
    ],
  },
  90: {
    summaryLine: 'Pre-labeled synthetic surveillance flags explaining exact fixture triggers.',
    rows: [
      row('90-1', 'Post-discharge med discrepancy flag', 'Triggered by fixture DEMO-001 Lisinopril 10 mg → 20 mg', 'warning', 'Fixture Rule Engine', '2026-10-15'),
    ],
  },
  91: {
    summaryLine: 'Evidence explanation and uncertainty bounds for synthetic triage suggestions.',
    rows: [
      row('91-1', 'Suggestion: Verify Lisinopril 20 mg', 'Evidence: Discharge Note offset 45–88 · Uncertainty: Low', 'documented', 'Suggestion Explainer', '2026-10-15'),
      row('91-2', 'Suggestion: Check Amoxicillin duration', 'Evidence: Partial mention · Uncertainty: Medium', 'warning', 'Suggestion Explainer', '2026-10-15'),
    ],
  },
  92: {
    summaryLine: 'Triage outcomes (Accept / Reject / Defer) linked to evidence and audit log.',
    rows: [
      row('92-1', 'Accept / Reject / Defer controls', 'All decisions require clinician click; auto-commit disabled', 'documented', 'Safety Gate Policy', '2026-10-15'),
    ],
  },
  95: {
    summaryLine: 'Synthetic failed evaluation case drill-down (expected vs. actual vs. error type).',
    rows: [
      row('95-1', 'Case EVAL-SYN-04 (Abbreviation mismatch)', 'Expected: "Metoprolol Succinate 50 mg" · Actual: "Metoprolol" · Error: Partial dose omission', 'warning', 'Synthetic Eval Suite', '2026-10-15'),
    ],
  },
  97: {
    summaryLine: 'Validated workflow presets (Review, Results, Care Coordination) with predictable default.',
    rows: [
      row('97-1', 'Default Ambulatory (Default)', '7 non-overlapping 12-col widgets validated', 'completed', 'Cockpit Preset Registry', '2026-10-15'),
      row('97-2', 'Medication Reconciliation Focus', 'Prioritizes Diff, Evidence & Worklist', 'completed', 'Cockpit Preset Registry', '2026-10-15'),
      row('97-3', 'Results & Care Coordination', 'Prioritizes Trends, Inbox & Handoff', 'completed', 'Cockpit Preset Registry', '2026-10-15'),
    ],
  },
  98: {
    summaryLine: 'Cross-widget accessibility audit covering tab order, announcements, and reduced motion.',
    rows: [
      row('98-1', 'Keyboard navigation & skip link', 'Arrow/Home/End rail nav + Ctrl+K palette + Escape focus return', 'completed', 'A11y Audit', '2026-10-15'),
      row('98-2', 'Reduced motion & contrast', 'prefers-reduced-motion respected; Graphite high-contrast tokens', 'completed', 'A11y Audit', '2026-10-15'),
    ],
  },
  99: {
    summaryLine: 'Performance benchmark check on larger synthetic medication fixtures.',
    rows: [
      row('99-1', '50-medication snapshot diff benchmark', 'Deterministic compareSnapshots < 5ms in JSDOM/Node', 'completed', 'Perf Check', '2026-10-15'),
    ],
  },
  100: {
    summaryLine: 'End-to-end synthetic walkthrough: Note comparison → Evidence → Follow-up → Audit.',
    rows: [
      row('100-1', 'Step 1: Compare Notes', 'Extract & highlight regimen changes on Morgan Lee', 'completed', 'E2E Walkthrough', '2026-10-15'),
      row('100-2', 'Step 2: Evidence & Snapshot Review', 'Inspect cited excerpts & verify/flag change', 'completed', 'E2E Walkthrough', '2026-10-15'),
      row('100-3', 'Step 3: Follow-up Export & Audit', 'Download clinical-diff-follow-ups.txt & verify Session Activity entry', 'completed', 'E2E Walkthrough', '2026-10-15'),
    ],
  },
};

export function buildBacklogWidgetData(
  widgetId: number,
  ctx: BacklogBuildContext,
): BacklogWidgetData {
  const meta =
    BACKLOG_WIDGET_CATALOG.find((m) => m.id === widgetId) ??
    BACKLOG_WIDGET_CATALOG[0]!;

  let summaryLine = meta.summary;
  let rows: WidgetFieldRow[] = [];
  let series: WidgetSeriesPoint[] | undefined;
  let checklist: BacklogWidgetData['checklist'];

  if (widgetId === 14) {
    summaryLine = 'Repeated medication citations grouped from the active synthetic comparison.';
    const links = ctx.report.changes.flatMap((c) =>
      (c.evidenceLinks ?? []).map((l, idx) => ({ c, l, idx })),
    );
    rows =
      links.length > 0
        ? links.slice(0, 8).map(({ c, l, idx }) =>
            row(
              `14-${c.medicationId}-${idx}`,
              `${c.name} (${l.side ?? 'record'})`,
              l.excerpt ?? l.note ?? 'Citation reference only',
              l.resolutionStatus === 'resolved' ? 'documented' : 'warning',
              l.sourceLabel ?? l.noteId ?? 'Snapshot link',
              l.recordedAt ?? null,
            ),
          )
        : [row('14-empty', 'No duplicate mentions', '0 repeated citations in active scenario', 'documented', ctx.scenarioId, null)];
  } else if (widgetId === 16) {
    summaryLine = 'Missing dose, unit, route, or frequency fields surfaced from active snapshot changes.';
    const missingRows: WidgetFieldRow[] = [];
    for (const c of ctx.report.changes) {
      for (const gap of c.provenanceGaps ?? []) {
        missingRows.push(
          row(
            `16-${c.medicationId}-${gap.field ?? gap.reason}-${missingRows.length}`,
            `${c.name} · ${gap.field ?? gap.scope}`,
            gap.message,
            gap.reason === 'missing_source_attribution' ? 'unknown' : 'missing',
            c.provenance?.later.sourceLabel ?? c.provenance?.earlier.sourceLabel ?? 'Snapshot',
            null,
          ),
        );
      }
    }
    rows =
      missingRows.length > 0
        ? missingRows.slice(0, 10)
        : [row('16-none', 'All regimen fields populated', 'No missing dose, route, or frequency in active scenario', 'completed', ctx.scenarioId, null)];
  } else if (widgetId === 50) {
    summaryLine = 'Discharge instructions, follow-ups, and live medication differences with source links.';
    rows = [
      ...ctx.report.changes.slice(0, 5).map((c) =>
        row(
          `50-${c.medicationId}`,
          `${c.name} (${c.kind})`,
          c.fields.map((fc) => `${fc.field}: ${fc.before ?? '—'} → ${fc.after ?? '—'}`).join('; ') || c.kind,
          c.provenance?.hasUnknownProvenance ? 'unknown' : 'documented',
          c.provenance?.later.sourceLabel ?? 'Discharge List',
          c.provenance?.later.recordedAt ?? null,
        ),
      ),
      row('50-fu', 'Follow-up instruction', 'Schedule BMP & BP check within 7 days of discharge', 'pending', 'Discharge Plan', '2026-10-15'),
    ];
  } else if (widgetId === 51) {
    summaryLine = 'Unresolved and flagged medication changes awaiting clinician follow-up.';
    rows = ctx.report.changes.map((c) => {
      const decision = ctx.reviews[`${ctx.scenarioId}:${c.medicationId}`];
      return row(
        `51-${c.medicationId}`,
        c.name,
        decision ? `Decision: ${decision}` : 'Pending clinician review',
        decision === 'flag' ? 'warning' : decision ? 'completed' : 'pending',
        c.provenance?.later.sourceLabel ?? 'Snapshot Review',
        c.provenance?.later.recordedAt ?? null,
      );
    });
  } else if (widgetId === 54) {
    summaryLine = 'Chart review queue surfacing unresolved source links and provenance conflicts.';
    const flagged = ctx.report.changes.filter(
      (c) =>
        c.provenance?.hasUnknownProvenance ||
        c.provenance?.hasAmbiguousProvenance ||
        (c.provenanceFlags ?? []).length > 0,
    );
    rows =
      flagged.length > 0
        ? flagged.map((c) =>
            row(
              `54-${c.medicationId}`,
              c.name,
              (c.provenanceFlags ?? []).join(', ') || 'Needs source review',
              c.provenance?.hasAmbiguousProvenance ? 'conflicting' : 'warning',
              c.provenance?.later.sourceLabel ?? 'Snapshot Review',
              null,
            ),
          )
        : [row('54-ok', 'No unresolved source flags', 'All active changes have clean provenance', 'completed', ctx.scenarioId, null)];
  } else if (widgetId === 89) {
    summaryLine = 'Live counts of missing or unresolved provenance fields in the active fixture.';
    const missingCount = ctx.report.provenanceGaps.length;
    rows = [
      row('89-1', 'Total medication changes', `${ctx.report.changes.length}`, 'documented', ctx.scenarioId, null),
      row('89-2', 'Provenance gaps / missing fields', `${missingCount}`, missingCount > 0 ? 'warning' : 'completed', ctx.scenarioId, null),
      row('89-3', 'Session audit events recorded', `${ctx.auditCount}`, 'documented', 'Session Activity', null),
    ];
  } else if (widgetId === 93) {
    summaryLine = 'Live model connection status distinguishing standby, replay, local, and hosted states.';
    rows = [
      row('93-1', 'Socket State', ctx.socketState, ctx.socketState === 'live' ? 'completed' : 'pending', '/api/model-socket', null),
      row('93-2', 'Evaluation Pass Summary', `${ctx.evalPassed}/${ctx.evalTested} passed (${ctx.evalFailed} failed)`, ctx.evalFailed > 0 ? 'warning' : 'completed', 'Evaluation Runner', null),
    ];
  } else if (SYNTHETIC_FIXTURE_ROWS[widgetId]) {
    const preset = SYNTHETIC_FIXTURE_ROWS[widgetId]!;
    summaryLine = preset.summaryLine;
    rows = preset.rows;
    series = preset.series;
    checklist = preset.checklist;
  } else {
    rows = [
      row(
        `${widgetId}-base`,
        meta.title,
        meta.summary,
        meta.owner === 'codex' ? 'completed' : 'documented',
        'Clinical Diff Catalog',
        null,
      ),
    ];
  }

  const missingOrUnknown = rows.filter((r) => r.status === 'missing' || r.status === 'unknown').length;
  const alertsOrConflicts = rows.filter((r) => r.status === 'conflicting' || r.status === 'warning').length;

  return {
    id: meta.id,
    code: meta.code,
    title: meta.title,
    section: meta.section,
    owner: meta.owner,
    patientLabel: ctx.patientLabel,
    safetyNotice: 'Synthetic data only · Read-only surface (no live EHR writes)',
    summaryLine,
    rows,
    ...(series ? { series } : {}),
    ...(checklist ? { checklist } : {}),
    counts: {
      total: rows.length,
      missingOrUnknown,
      alertsOrConflicts,
    },
  };
}

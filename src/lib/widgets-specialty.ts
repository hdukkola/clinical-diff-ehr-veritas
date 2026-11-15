import {
  BACKLOG_WIDGET_CATALOG,
  buildBacklogWidgetData,
  type BacklogBuildContext,
  type BacklogWidgetData,
  type WidgetFieldRow,
  type WidgetSeriesPoint,
} from './backlog-widgets';

/**
 * Backlog widget IDs owned by the specialty, patient-facing, operations,
 * and model-quality/platform follow-through builder (items 61-93, 95, 97-100).
 */
export const SPECIALTY_WIDGET_IDS: readonly number[] = [
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72,
  73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
  91, 92, 93, 95, 97, 98, 99, 100,
] as const;

type ChecklistItem = NonNullable<BacklogWidgetData['checklist']>[number];

interface SpecialtyPreset {
  summaryLine: string;
  rows: WidgetFieldRow[];
  series?: WidgetSeriesPoint[];
  checklist?: ChecklistItem[];
}

const SAFETY_NOTICE = 'Synthetic data only · Read-only surface (no live EHR writes)';

function row(
  id: string,
  label: string,
  value: string,
  status: WidgetFieldRow['status'],
  sourceLabel: string,
  recordedAt: string | null,
  detail?: string,
): WidgetFieldRow {
  return {
    id,
    label,
    value,
    status,
    sourceLabel,
    recordedAt,
    ...(detail ? { detail } : {}),
  };
}

function buildStaticSpecialtyPreset(id: number): SpecialtyPreset | null {
  switch (id) {
    // ── Specialty surfaces (61–72) ───────────────────────────────────────────
    case 61:
      return {
        summaryLine: 'Mock ED arrival, triage, diagnostic testing, and disposition milestones.',
        rows: [
          row('61-1', '18:10 · ED Arrival', 'Walk-in · Chief complaint: elevated BP & cough', 'completed', 'ED Track Board', '2026-10-12T18:10:00Z'),
          row('61-2', '18:18 · Triage Assessment', 'ESI Level 3 · Vitals 148/90, HR 82, SpO2 97%', 'completed', 'ED Triage Note', '2026-10-12T18:18:00Z'),
          row('61-3', '19:20 · Labs & CXR Resulted', 'BMP normal · Troponin I 0.02 ng/mL · CXR clear', 'completed', 'ED Diagnostics', '2026-10-12T19:20:00Z'),
          row('61-4', '20:10 · Observation Hold', 'Serial BP checks & oral antihypertensive review', 'completed', 'ED Observation Log', '2026-10-12T20:10:00Z'),
          row('61-5', '01:40 · Disposition: Admit Unit 4B', 'Transferred to Medicine Unit 4B for med rec', 'completed', 'ADT / ED Disposition', '2026-10-13T01:40:00Z'),
        ],
      };

    case 62:
      return {
        summaryLine: 'Time-aligned synthetic ICU vitals, interventions, and medication administrations.',
        rows: [
          row('62-1', '08:00 · Hemodynamics', 'MAP 78 mmHg · HR 76 bpm · No vasopressors', 'documented', 'ICU Flowsheet', '2026-10-13T08:00:00Z'),
          row('62-2', '10:00 · Respiratory Check', 'SpO2 98% on room air · Q2h incentive spirometry', 'documented', 'ICU Flowsheet', '2026-10-13T10:00:00Z'),
          row('62-3', '12:00 · Medication Hold', 'Metformin 500 mg PO held (NPO for renal imaging)', 'warning', 'Synthetic MAR', '2026-10-13T12:00:00Z'),
          row('62-4', '14:00 · Telemetry & Electrolytes', 'Sinus rhythm · K+ 4.3 mmol/L · Step-down cleared', 'completed', 'ICU Progress Note', '2026-10-13T14:00:00Z'),
        ],
        series: [
          { label: '08:00', value: 78, unit: 'mmHg (MAP)', recordedAt: '2026-10-13T08:00:00Z', comparable: true },
          { label: '10:00', value: 81, unit: 'mmHg (MAP)', recordedAt: '2026-10-13T10:00:00Z', comparable: true },
          { label: '12:00', value: 76, unit: 'mmHg (MAP)', recordedAt: '2026-10-13T12:00:00Z', comparable: true },
          { label: '14:00', value: 79, unit: 'mmHg (MAP)', recordedAt: '2026-10-13T14:00:00Z', comparable: true },
        ],
      };

    case 63:
      return {
        summaryLine: 'Documented pre-op, procedure, and recovery checklist milestones (no active surgery).',
        rows: [
          row('63-1', 'Pre-op consent & NPO status', 'Verified in synthetic drill · No active procedure scheduled', 'completed', 'Periop Board', '2026-10-12T19:00:00Z'),
          row('63-2', 'Anticoagulation / allergy screen', 'Penicillin allergy confirmed; no active anticoagulant', 'documented', 'Periop Med Screen', '2026-10-12T19:15:00Z'),
          row('63-3', 'Intra-op / PACU handoff', 'Not applicable (non-operative inpatient stay)', 'unknown', 'Periop Board', null),
        ],
        checklist: [
          { id: 'chk-63-1', text: 'Verify synthetic patient identity & allergy banner', done: true, sourceLabel: 'Periop Board' },
          { id: 'chk-63-2', text: 'Confirm NPO window prior to contrast/imaging', done: true, sourceLabel: 'Periop Board' },
          { id: 'chk-63-3', text: 'Complete surgical site marking (N/A, no procedure)', done: false, sourceLabel: 'Periop Board' },
        ],
      };

    case 64:
      return {
        summaryLine: 'Time-aligned synthetic anesthesia medication and vital events (archived 2019 case).',
        rows: [
          row('64-1', '2019-06-14 08:15 · Induction', 'Propofol 150 mg IV + Fentanyl 100 mcg IV · ETT secured', 'completed', 'Anesthesia Record', '2019-06-14T08:15:00Z'),
          row('64-2', '2019-06-14 08:30–09:20 · Maintenance', 'Sevoflurane 1.8% · MAP 72–80 mmHg · Stable', 'completed', 'Anesthesia Record', '2019-06-14T09:20:00Z'),
          row('64-3', '2019-06-14 09:35 · Emergence & PACU', 'Extubated awake · Aldrete score 9/10', 'completed', 'PACU Flowsheet', '2019-06-14T09:35:00Z'),
          row('64-4', 'External pre-op airway Mallampati score', 'Missing from imported 2019 archive', 'missing', 'External Anesthesia PDF', null),
        ],
        series: [
          { label: '08:15', value: 78, unit: 'mmHg (MAP)', recordedAt: '2019-06-14T08:15:00Z', comparable: true },
          { label: '08:45', value: 72, unit: 'mmHg (MAP)', recordedAt: '2019-06-14T08:45:00Z', comparable: true },
          { label: '09:15', value: 75, unit: 'mmHg (MAP)', recordedAt: '2019-06-14T09:15:00Z', comparable: true },
          { label: '09:35', value: 80, unit: 'mmHg (MAP)', recordedAt: '2019-06-14T09:35:00Z', comparable: true },
        ],
      };

    case 65:
      return {
        summaryLine: 'Synthetic L&D maternity board (explicitly inactive for non-obstetric encounter).',
        rows: [
          row('65-1', 'Active obstetric episode', 'None documented on current encounter (not applicable)', 'unknown', 'L&D Board', null),
          row('65-2', 'Gestational age & delivery milestones', 'Not recorded (no maternity workflow active)', 'unknown', 'L&D Board', null),
          row('65-3', 'Historical PMH reference', 'Gestational hypertension (2012, resolved postpartum)', 'completed', 'PMH Summary', '2012-04-02'),
        ],
      };

    case 66:
      return {
        summaryLine: 'Synthetic oncology cycle & regimen tracker (explicitly inactive for current chart).',
        rows: [
          row('66-1', 'Active chemotherapy protocol', 'None documented for current synthetic patient', 'unknown', 'Oncology Tracker', null),
          row('66-2', 'Planned cycle & infusion dates', 'Not applicable (no oncology orders on file)', 'unknown', 'Oncology Tracker', null),
          row('66-3', 'Pathology / staging summary', 'No active malignancy documented', 'documented', 'Problem List', '2026-10-01'),
        ],
      };

    case 67:
      return {
        summaryLine: 'Dated synthetic growth and anthropometric measurements with accessible tabular view.',
        rows: [
          row('67-1', 'Adult height (baseline)', '168 cm (Recorded 2025-03-10)', 'documented', 'Anthropometrics', '2025-03-10'),
          row('67-2', '2026-08-10 · Weight', '73.1 kg (BMI 25.9 kg/m²)', 'documented', 'Clinic Vitals', '2026-08-10'),
          row('67-3', '2026-10-01 · Weight', '72.4 kg (BMI 25.6 kg/m²)', 'documented', 'Clinic Vitals', '2026-10-01'),
          row('67-4', '2026-10-15 · Weight', '71.8 kg (BMI 25.4 kg/m²)', 'completed', 'Discharge Vitals', '2026-10-15'),
          row('67-5', 'Pediatric percentile curve', 'Not applicable (adult patient baseline)', 'unknown', 'Growth Engine', null),
        ],
        series: [
          { label: 'Aug 10', value: 73.1, unit: 'kg', recordedAt: '2026-08-10', comparable: true },
          { label: 'Oct 01', value: 72.4, unit: 'kg', recordedAt: '2026-10-01', comparable: true },
          { label: 'Oct 15', value: 71.8, unit: 'kg', recordedAt: '2026-10-15', comparable: true },
        ],
      };

    case 68:
      return {
        summaryLine: 'Documented behavioral health screening dates, scores, and source provenance.',
        rows: [
          row('68-1', 'PHQ-2 Depression Screen', 'Score 1 (Negative) · Screened at clinic intake', 'completed', 'Behavioral Screening', '2026-10-01'),
          row('68-2', 'AUDIT-C Alcohol Screen', 'Score 0 (Negative) · Self-reported at intake', 'completed', 'Behavioral Screening', '2026-10-01'),
          row('68-3', 'GAD-7 Anxiety Screen', 'Not administered (score unknown)', 'unknown', 'Behavioral Screening', null),
        ],
      };

    case 69:
      return {
        summaryLine: 'Synthetic rehabilitation therapy sessions and documented progress toward mobility goals.',
        rows: [
          row('69-1', 'PT Ambulation Goal (300 ft)', 'Achieved: Independent ambulation 300 ft at discharge', 'completed', 'PT Progress Note', '2026-10-15'),
          row('69-2', 'Stair Negotiation (12 steps)', 'In progress: 12 steps with single-hand rail', 'pending', 'PT Progress Note', '2026-10-15'),
          row('69-3', 'OT Home Safety / ADL Screen', 'Independent with bathing & pillbox setup', 'completed', 'OT Evaluation', '2026-10-14'),
        ],
        checklist: [
          { id: 'chk-69-1', text: 'Ambulate 300 ft independently on level surface', done: true, sourceLabel: 'PT Progress Note' },
          { id: 'chk-69-2', text: 'Complete 12-step stair assessment without dizziness', done: false, sourceLabel: 'PT Progress Note' },
          { id: 'chk-69-3', text: 'Verify daily home blood pressure cuff & pillbox routine', done: true, sourceLabel: 'OT Evaluation' },
        ],
      };

    case 70:
      return {
        summaryLine: 'Synthetic dental tooth/site findings, restorations, and missing external records.',
        rows: [
          row('70-1', 'Tooth #19 · Porcelain crown', 'Intact · External dental summary', 'documented', 'Dental Summary', '2025-08-19'),
          row('70-2', 'Tooth #30 · Occlusal amalgam', 'Stable restoration · No acute caries', 'documented', 'Dental Summary', '2025-08-19'),
          row('70-3', 'Periodontal probing chart', 'Unknown (external perio chart not imported)', 'unknown', 'External Dental Feed', null),
        ],
      };

    case 71:
      return {
        summaryLine: 'Synthetic home-health visit schedule, outcome, and post-discharge follow-up.',
        rows: [
          row('71-1', '2026-10-17 · RN Home Med Check', 'Scheduled · Verify Lisinopril 20 mg & standing BP', 'pending', 'Home Health Queue', '2026-10-17'),
          row('71-2', '2026-10-20 · Tele-RN Follow-up', 'Planned · Review home BP log prior to PCP visit', 'pending', 'Home Health Queue', '2026-10-20'),
          row('71-3', 'Prior home health episode', 'None documented in past 12 months', 'documented', 'Care Coordination', '2026-10-15'),
        ],
      };

    case 72:
      return {
        summaryLine: 'Synthetic long-term care goals and review schedule (outpatient setting profile).',
        rows: [
          row('72-1', 'Care setting profile', 'Outpatient home-dwelling (LTC facility not active)', 'documented', 'Care Setting Profile', '2026-10-15'),
          row('72-2', 'Quarterly LTC care conference', 'Not applicable (non-resident outpatient chart)', 'unknown', 'LTC Registry', null),
          row('72-3', 'Fall-risk & ADL baseline', 'Low fall risk · Independent ADLs documented', 'completed', 'Nursing Assessment', '2026-10-15'),
        ],
      };

    // ── Patient-facing views (73–80) ─────────────────────────────────────────
    case 75:
      return {
        summaryLine: 'Patient-facing synthetic results timeline distinguishing released vs. pending items.',
        rows: [
          row('75-1', 'Basic Metabolic Panel (Oct 14)', 'Released to portal · Kidney & electrolyte values normal', 'completed', 'Portal Release Log', '2026-10-14'),
          row('75-2', 'Chest X-Ray (Oct 12)', 'Released to portal · No acute findings', 'completed', 'Portal Release Log', '2026-10-12'),
          row('75-3', 'Renal Ultrasound (Oct 15)', 'Pending final radiologist sign-off (not yet released)', 'pending', 'Portal Release Log', '2026-10-15'),
        ],
      };

    case 76:
      return {
        summaryLine: 'Accessible mock intake forms with local-only draft submission state (no EHR write).',
        rows: [
          row('76-1', 'Pre-Visit Symptom & Med Check', 'Local draft only (requires patient submit click)', 'pending', 'Patient Portal Form', '2026-10-15'),
          row('76-2', 'Demographics & Pharmacy Confirm', 'Verified in local session', 'completed', 'Patient Portal Form', '2026-10-15'),
        ],
        checklist: [
          { id: 'chk-76-1', text: 'Confirm home address and preferred pharmacy', done: true, sourceLabel: 'Intake Form' },
          { id: 'chk-76-2', text: 'Report any new dizziness since medication change', done: false, sourceLabel: 'Intake Form' },
          { id: 'chk-76-3', text: 'Confirm preferred communication language (English)', done: true, sourceLabel: 'Intake Form' },
        ],
      };

    case 77:
      return {
        summaryLine: 'Synthetic appointment status, clinic location, and arrival instructions.',
        rows: [
          row('77-1', '2026-10-22 14:30 · General Medicine Clinic', 'Confirmed · Building B, Suite 210 · Dr. A. Patel', 'documented', 'Appointment Card', '2026-10-22'),
          row('77-2', 'Check-in instructions', 'Arrive 15 min early; bring all current pill bottles', 'documented', 'Clinic Instructions', '2026-10-15'),
          row('77-3', 'Video visit fallback', 'Available if transport unavailable (request 24h prior)', 'pending', 'Scheduling Feed', '2026-10-15'),
        ],
      };

    case 78:
      return {
        summaryLine: 'Synthetic patient vs. authorized proxy view with explicit access scope.',
        rows: [
          row('78-1', 'Patient View (Full Read-Only)', 'Can view visit summary, med list, labs, and messages', 'documented', 'Access Policy', '2026-10-15'),
          row('78-2', 'Proxy View (Spouse · Limited)', 'Can view appointments & med list; sensitive notes hidden', 'documented', 'Proxy Consent Log', '2025-05-20'),
          row('78-3', 'Secondary proxy request', 'None pending · No unverified proxy delegates', 'completed', 'Proxy Consent Log', '2026-10-15'),
        ],
      };

    case 79:
      return {
        summaryLine: 'Documented preparation tasks for the upcoming synthetic follow-up appointment.',
        rows: [
          row('79-1', 'Fasting morning lab draw (BMP)', 'Complete 24–48 hours before Oct 22 clinic visit', 'pending', 'Visit Prep Sheet', '2026-10-15'),
          row('79-2', 'Home blood pressure log', 'Record morning & evening readings for 3 days', 'pending', 'Visit Prep Sheet', '2026-10-15'),
        ],
        checklist: [
          { id: 'chk-79-1', text: 'Complete outpatient BMP blood draw 24–48h prior', done: false, sourceLabel: 'Visit Prep Sheet' },
          { id: 'chk-79-2', text: 'Bring 3-day home blood pressure log', done: false, sourceLabel: 'Visit Prep Sheet' },
          { id: 'chk-79-3', text: 'Pack current medication bottles for clinician review', done: true, sourceLabel: 'Visit Prep Sheet' },
        ],
      };

    case 80:
      return {
        summaryLine: 'Fixture-linked synthetic patient education handouts with explicit source provenance.',
        rows: [
          row('80-1', 'Understanding ACE Inhibitors (Lisinopril)', 'Plain-language guide · Watch for dizziness or dry cough', 'documented', 'Patient Education Library', '2026-01-10'),
          row('80-2', 'Taking Metformin Safely with Meals', 'Take with food; hold before contrast imaging if advised', 'documented', 'Patient Education Library', '2026-01-10'),
          row('80-3', 'When to Call Clinic vs. Urgent Care', 'Red-flag symptoms & clinic nurse line ext 4401', 'documented', 'Discharge Packet', '2026-10-15'),
        ],
      };

    // ── Operations and oversight (81–90) ─────────────────────────────────────
    case 81:
      return {
        summaryLine: 'Synthetic registration demographics flagging missing contact fields explicitly.',
        rows: [
          row('81-1', 'Synthetic Identifier', 'DEMO-001 · Registered outpatient/inpatient profile', 'documented', 'Registration', '2026-10-01'),
          row('81-2', 'Preferred Language & Accessibility', 'English · 16pt high-contrast print requested', 'documented', 'Registration', '2026-10-01'),
          row('81-3', 'Secondary emergency phone', 'Missing (null); needs front-desk verification', 'missing', 'Registration', null),
          row('81-4', 'Primary Care Attribution', 'Dr. A. Patel (Synthetic PCP)', 'documented', 'Care Team Registry', '2026-10-01'),
        ],
      };

    case 82:
      return {
        summaryLine: 'Mock insurance coverage status, pharmacy benefit, and verification dates.',
        rows: [
          row('82-1', 'Primary: Synthetic Health Plan PPO', 'Active · Verified 2026-10-12 · Copay $25', 'completed', 'Eligibility Check', '2026-10-12'),
          row('82-2', 'Pharmacy Benefit (Synthetic PBM)', 'Active · RxBIN 004336 · Tier 1 generics covered', 'completed', 'Eligibility Check', '2026-10-12'),
          row('82-3', 'Secondary coordination of benefits', 'Unknown (not verified in current encounter)', 'unknown', 'Eligibility Check', null),
        ],
      };

    case 83:
      return {
        summaryLine: 'Mock prior authorization tracker with submission, pending, and resolved states.',
        rows: [
          row('83-1', 'PA-SYN-882 · Continuous Glucose Monitor', 'Submitted 2026-10-05 · Pending payer response', 'pending', 'PA Tracker', '2026-10-05'),
          row('83-2', 'PA-SYN-871 · Outpatient PT Evaluation', 'Approved 2026-10-13 (6 visits authorized)', 'completed', 'PA Tracker', '2026-10-13'),
          row('83-3', 'PA-SYN-860 · Brand Statin Exception', 'Denied 2026-09-22 · Generic Atorvastatin covered', 'warning', 'PA Tracker', '2026-09-22'),
        ],
      };

    case 84:
      return {
        summaryLine: 'Synthetic coding suggestions placed beside supporting clinical excerpts for human review.',
        rows: [
          row('84-1', 'ICD-10 I10 · Essential Hypertension', 'Supported by "Increase Lisinopril 20 mg for HTN"', 'documented', 'Coding Queue', '2026-10-15'),
          row('84-2', 'ICD-10 E11.9 · Type 2 DM w/o complications', 'Supported by "Continue Metformin 500 mg BID"', 'documented', 'Coding Queue', '2026-10-15'),
          row('84-3', 'CPT 99495 · Transitional Care Mgmt', 'Pending 14-day face-to-face follow-up completion', 'pending', 'Coding Queue', '2026-10-15'),
        ],
      };

    case 85:
      return {
        summaryLine: 'Synthetic claim lifecycle stages and status history (read-only; no live billing).',
        rows: [
          row('85-1', 'CLM-SYN-310 · Clinic Visit 2026-10-01', 'Adjudicated · Paid (Synthetic ledger)', 'completed', 'Billing Ledger', '2026-10-08'),
          row('85-2', 'CLM-SYN-318 · Inpatient Stay 2026-10-12', 'Draft · Pending coding review (no live submission)', 'pending', 'Billing Ledger', '2026-10-15'),
        ],
      };

    case 86:
      return {
        summaryLine: 'Aggregate unit occupancy and bed availability (no-PHI unit-level counts only).',
        rows: [
          row('86-1', 'Medicine Unit 4B (Unit aggregate)', '18 / 22 beds occupied · 4 available', 'documented', 'Capacity Feed', '2026-10-15T10:00:00Z'),
          row('86-2', 'Observation Unit (Unit aggregate)', '9 / 10 beds occupied · 1 available (near capacity)', 'warning', 'Capacity Feed', '2026-10-15T10:00:00Z'),
          row('86-3', 'Medical ICU (Unit aggregate)', '11 / 12 beds occupied · 1 available', 'documented', 'Capacity Feed', '2026-10-15T10:00:00Z'),
        ],
      };

    case 87:
      return {
        summaryLine: 'Mock shift and role assignments by clinical unit (no-PHI unit-level roster).',
        rows: [
          row('87-1', 'Day Shift 07:00–19:00 · Medicine Unit 4B', '1 Attending · 4 RNs · 1 Clinical PharmD', 'documented', 'Staffing Roster', '2026-10-15'),
          row('87-2', 'Night Shift 19:00–07:00 · Medicine Unit 4B', '1 Hospitalist · 3 RNs · On-call PharmD', 'documented', 'Staffing Roster', '2026-10-15'),
          row('87-3', 'ED Triage & Pod A · Current Shift', '2 Attendings · 6 RNs · 1 ED Tech', 'documented', 'Staffing Roster', '2026-10-15'),
        ],
      };

    // ── Model quality & platform follow-through (97–100) ─────────────────────
    case 97:
      return {
        summaryLine: 'Validated workflow presets (Review, Results, Care Coordination) with predictable default.',
        rows: [
          row('97-1', 'Default Ambulatory (Default)', '7 non-overlapping 12-col widgets validated', 'completed', 'Cockpit Preset Registry', '2026-10-15'),
          row('97-2', 'Medication Reconciliation Focus', 'Prioritizes Diff, Provenance, and Worklist', 'completed', 'Cockpit Preset Registry', '2026-10-15'),
          row('97-3', 'Results & Care Coordination', 'Prioritizes Trends, Inbox, and Shift Handoff', 'completed', 'Cockpit Preset Registry', '2026-10-15'),
        ],
      };

    case 98:
      return {
        summaryLine: 'Cross-widget accessibility audit covering tab order, announcements, and reduced motion.',
        rows: [
          row('98-1', 'Keyboard navigation & focus return', 'Arrow/Home/End rail nav + Ctrl+K palette + Escape focus return', 'completed', 'A11y Audit', '2026-10-15'),
          row('98-2', 'Readable charts & tabular fallback', 'All trend series paired with accessible data rows', 'completed', 'A11y Audit', '2026-10-15'),
          row('98-3', 'Reduced motion & contrast', 'prefers-reduced-motion respected; Graphite high-contrast tokens', 'completed', 'A11y Audit', '2026-10-15'),
        ],
        checklist: [
          { id: 'chk-98-1', text: 'Verify skip-to-content and tab order across presets', done: true, sourceLabel: 'A11y Audit' },
          { id: 'chk-98-2', text: 'Confirm aria-live announcements on review actions', done: true, sourceLabel: 'A11y Audit' },
          { id: 'chk-98-3', text: 'Pair every trend chart with accessible tabular rows', done: true, sourceLabel: 'A11y Audit' },
          { id: 'chk-98-4', text: 'Restore focus to trigger on drawer/modal close', done: true, sourceLabel: 'A11y Audit' },
        ],
      };

    case 99:
      return {
        summaryLine: 'Performance benchmark check on larger synthetic medication fixtures.',
        rows: [
          row('99-1', '50-medication snapshot diff benchmark', 'Deterministic analyzeSnapshots < 5 ms in Node/JSDOM', 'completed', 'Perf Check', '2026-10-15'),
          row('99-2', '100-item catalog filter & render', 'O(N) client-side filter without layout thrash', 'completed', 'Perf Check', '2026-10-15'),
        ],
      };

    case 100:
      return {
        summaryLine: 'End-to-end synthetic walkthrough: Note comparison -> Evidence -> Follow-up -> Audit.',
        rows: [
          row('100-1', 'Step 1: Compare Notes', 'Extract & highlight regimen changes on Morgan Lee (DEMO-001)', 'completed', 'E2E Walkthrough', '2026-10-15'),
          row('100-2', 'Step 2: Evidence & Snapshot Review', 'Inspect cited excerpts & verify/flag medication change', 'completed', 'E2E Walkthrough', '2026-10-15'),
          row('100-3', 'Step 3: Follow-up Export & Audit', 'Export follow-up list & verify Session Activity timestamp', 'completed', 'E2E Walkthrough', '2026-10-15'),
        ],
        checklist: [
          { id: 'chk-100-1', text: 'Compare earlier vs. later synthetic medication snapshots', done: true, sourceLabel: 'E2E Walkthrough' },
          { id: 'chk-100-2', text: 'Inspect exact cited excerpt in evidence drill-down', done: true, sourceLabel: 'E2E Walkthrough' },
          { id: 'chk-100-3', text: 'Record clinician verify/flag decision in Session Activity', done: true, sourceLabel: 'E2E Walkthrough' },
          { id: 'chk-100-4', text: 'Verify follow-up export & read-only safety banner', done: true, sourceLabel: 'E2E Walkthrough' },
        ],
      };

    default:
      return null;
  }
}

function buildDynamicSpecialtyPreset(id: number, ctx: BacklogBuildContext): SpecialtyPreset | null {
  const changes = ctx.report.changes;
  const gaps = ctx.report.provenanceGaps;

  switch (id) {
    case 73: {
      const changeRows = changes.slice(0, 4).map((c, idx) => {
        const fieldSummary =
          c.fields.length > 0
            ? c.fields.map((f) => `${f.field}: ${f.before ?? 'not listed'} -> ${f.after ?? 'not listed'}`).join('; ')
            : `Marked as ${c.kind}`;
        return row(
          `73-${c.medicationId}-${idx}`,
          `Medicine update: ${c.name}`,
          `Plain-language summary: ${fieldSummary}`,
          c.provenance?.hasUnknownProvenance ? 'unknown' : 'documented',
          `${c.provenance?.later.sourceLabel ?? 'Discharge Summary'} [Ref: ${c.medicationId}]`,
          c.provenance?.later.recordedAt ?? null,
        );
      });
      return {
        summaryLine: 'Reviewed plain-language synthetic visit summary linked back to original chart citations.',
        rows: [
          ...(changeRows.length > 0
            ? changeRows
            : [row('73-none', 'No medication changes', 'Your medication list did not change in this visit.', 'documented', ctx.scenarioId, null)]),
          row('73-fu', 'Next blood test & visit', 'Complete routine lab check before your Oct 22 follow-up visit.', 'pending', 'Follow-up Plan [Ref: Ord-1042]', '2026-10-15'),
        ],
      };
    }

    case 74: {
      const medRows = changes.slice(0, 5).map((c, idx) => {
        const hasMissing = (c.provenanceGaps ?? []).some((g) => g.reason === 'undocumented_field' || g.reason === 'blank_field_value');
        const detailText =
          c.fields.length > 0
            ? c.fields.map((f) => `${f.field}: ${f.after ?? f.before ?? 'unknown'}`).join(' · ')
            : `${c.kind} in latest chart`;
        return row(
          `74-${c.medicationId}-${idx}`,
          c.name,
          hasMissing ? `${detailText} (some details missing; ask pharmacist)` : detailText,
          hasMissing ? 'missing' : 'documented',
          c.provenance?.later.sourceLabel ?? 'Discharge Med List',
          c.provenance?.later.recordedAt ?? null,
        );
      });
      return {
        summaryLine: 'Read-only, plain-language patient medication list preserving missing-detail warnings.',
        rows:
          medRows.length > 0
            ? medRows
            : [row('74-empty', 'No active medications documented', 'Medication list is empty in this synthetic snapshot.', 'unknown', ctx.scenarioId, null)],
      };
    }

    case 88:
      return {
        summaryLine: 'Synthetic privacy & access audit log recording actor role, action, and session count.',
        rows: [
          row('88-1', 'Clinician Reviewer · Snapshot Diff View', `Scenario ${ctx.scenarioId} · Allowed (Assigned care team)`, 'completed', 'Access Audit Log', '2026-10-15T10:12:00Z'),
          row('88-2', 'External Token Probe (Blocked)', 'Denied by SSRF / credential guard (no outbound leak)', 'warning', 'Security Audit', '2026-10-15T10:14:00Z'),
          row('88-3', 'Session Audit Events Recorded', `${ctx.auditCount} local session review/export events`, 'documented', 'Session Activity', null),
        ],
      };

    case 89: {
      const gapRows = gaps.slice(0, 3).map((g, idx) =>
        row(
          `89-gap-${idx}`,
          `Affected record (${g.side} · ${g.scope})`,
          g.message,
          g.reason === 'missing_source_attribution' ? 'unknown' : 'missing',
          ctx.scenarioId,
          null,
        ),
      );
      return {
        summaryLine: 'Counts missing and unresolved fixture fields and links each count to affected records.',
        rows: [
          row('89-1', 'Total medication changes', `${changes.length}`, 'documented', ctx.scenarioId, null),
          row('89-2', 'Provenance gaps / missing fields', `${gaps.length}`, gaps.length > 0 ? 'warning' : 'completed', ctx.scenarioId, null),
          row('89-3', 'Session audit events recorded', `${ctx.auditCount}`, 'documented', 'Session Activity', null),
          ...gapRows,
        ],
      };
    }

    case 90: {
      const flaggedCount = changes.filter((c) => (c.provenanceFlags ?? []).length > 0).length;
      return {
        summaryLine: 'Pre-labeled synthetic surveillance flags explaining which fixture supplied each trigger.',
        rows: [
          row(
            '90-1',
            'Regimen change surveillance flag',
            `Triggered by fixture ${ctx.scenarioId}: ${changes.length} medication change(s) detected`,
            changes.length > 0 ? 'warning' : 'completed',
            'Fixture Rule Engine',
            '2026-10-15',
          ),
          row(
            '90-2',
            'Provenance / missing-field flag',
            `Triggered by ${flaggedCount} change(s) with provenance flags (${gaps.length} total gaps)`,
            flaggedCount > 0 ? 'warning' : 'completed',
            'Fixture Rule Engine',
            '2026-10-15',
          ),
        ],
      };
    }

    case 91: {
      const topChanges = changes.slice(0, 3);
      return {
        summaryLine: 'Evidence explanation and explicit uncertainty bounds for synthetic triage suggestions.',
        rows:
          topChanges.length > 0
            ? topChanges.map((c, idx) => {
                const uncertain = Boolean(c.provenance?.hasUnknownProvenance || c.provenance?.hasAmbiguousProvenance);
                return row(
                  `91-${c.medicationId}-${idx}`,
                  `Suggestion: Review ${c.name} (${c.kind})`,
                  `Evidence: ${c.provenance?.later.sourceLabel ?? 'Snapshot diff'} · Uncertainty: ${uncertain ? 'High (missing/ambiguous provenance)' : 'Low'}`,
                  uncertain ? 'warning' : 'documented',
                  'Suggestion Explainer',
                  c.provenance?.later.recordedAt ?? null,
                );
              })
            : [row('91-abstain', 'No active suggestion', 'Abstaining: 0 medication changes in active synthetic scenario.', 'unknown', 'Suggestion Explainer', null)],
      };
    }

    case 92: {
      const entries = Object.entries(ctx.reviews);
      const verified = entries.filter(([, v]) => v === 'verify' || v === 'accept').length;
      const flagged = entries.filter(([, v]) => v === 'flag' || v === 'reject').length;
      const deferred = entries.filter(([, v]) => v === 'defer').length;
      return {
        summaryLine: 'Evidence-linked accept, reject, and defer triage outcomes recorded in the session log.',
        rows: [
          row('92-1', 'Accepted / Verified decisions', `${verified} item(s)`, verified > 0 ? 'completed' : 'pending', 'Session Review Log', null),
          row('92-2', 'Flagged / Rejected decisions', `${flagged} item(s)`, flagged > 0 ? 'warning' : 'documented', 'Session Review Log', null),
          row('92-3', 'Deferred decisions', `${deferred} item(s)`, deferred > 0 ? 'pending' : 'documented', 'Session Review Log', null),
          row('92-4', 'Human-in-the-loop gate', `Auto-commit disabled · ${ctx.auditCount} total audit entries`, 'documented', 'Safety Gate Policy', '2026-10-15'),
        ],
      };
    }

    case 93: {
      const normalized = ctx.socketState.toLowerCase();
      const stateLabel =
        normalized === 'live'
          ? 'Verified hosted (live remote adapter)'
          : normalized === 'replay'
            ? 'Replay mode (deterministic fixture trace)'
            : normalized === 'local'
              ? 'Local mode (on-device model)'
              : `Unavailable / Standby (${ctx.socketState})`;
      return {
        summaryLine: 'Model status card distinguishing unavailable, local, replay, and verified hosted states.',
        rows: [
          row('93-1', 'Model Connection State', stateLabel, normalized === 'live' ? 'completed' : 'pending', '/api/model-socket', null),
          row(
            '93-2',
            'Evaluation Pass Summary',
            `${ctx.evalPassed}/${ctx.evalTested} passed (${ctx.evalFailed} failed)`,
            ctx.evalFailed > 0 ? 'warning' : 'completed',
            'Evaluation Runner',
            null,
          ),
        ],
      };
    }

    case 95:
      return {
        summaryLine: 'Synthetic failed evaluation case drill-down showing expected, actual, and error type.',
        rows: [
          row(
            '95-1',
            'Case EVAL-SYN-04 (Abbreviation mismatch)',
            'Expected: "Metoprolol Succinate 50 mg" · Actual: "Metoprolol" · Error: Partial dose omission',
            'warning',
            'Synthetic Eval Suite',
            '2026-10-15',
          ),
          row(
            '95-2',
            'Case EVAL-SYN-11 (Null frequency handling)',
            'Expected: "frequency: null (missing)" · Actual: "daily (inferred)" · Error: Hallucinated frequency',
            'conflicting',
            'Synthetic Eval Suite',
            '2026-10-15',
          ),
          row(
            '95-3',
            'Active Run Failure Count',
            `${ctx.evalFailed} failure(s) out of ${ctx.evalTested} tested case(s)`,
            ctx.evalFailed > 0 ? 'warning' : 'completed',
            'Evaluation Runner',
            null,
          ),
        ],
      };

    default:
      return null;
  }
}

/**
 * Builds deterministic, synthetic-only, read-only widget data for backlog items
 * 61-93, 95, and 97-100. Falls back to `buildBacklogWidgetData` for other IDs.
 */
export function buildSpecialtyWidgetData(
  id: number,
  ctx: BacklogBuildContext,
): BacklogWidgetData {
  const meta = BACKLOG_WIDGET_CATALOG.find((m) => m.id === id);
  if (!meta) {
    return buildBacklogWidgetData(id, ctx);
  }

  const preset = buildDynamicSpecialtyPreset(id, ctx) ?? buildStaticSpecialtyPreset(id);
  if (!preset) {
    return buildBacklogWidgetData(id, ctx);
  }

  const missingOrUnknown = preset.rows.filter(
    (r) => r.status === 'missing' || r.status === 'unknown',
  ).length;
  const alertsOrConflicts = preset.rows.filter(
    (r) => r.status === 'conflicting' || r.status === 'warning',
  ).length;

  return {
    id: meta.id,
    code: meta.code,
    title: meta.title,
    section: meta.section,
    owner: meta.owner,
    patientLabel: ctx.patientLabel,
    safetyNotice: SAFETY_NOTICE,
    summaryLine: preset.summaryLine,
    rows: preset.rows,
    ...(preset.series ? { series: preset.series } : {}),
    ...(preset.checklist ? { checklist: preset.checklist } : {}),
    counts: {
      total: preset.rows.length,
      missingOrUnknown,
      alertsOrConflicts,
    },
  };
}

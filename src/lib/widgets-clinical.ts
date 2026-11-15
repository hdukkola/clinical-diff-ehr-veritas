import {
  BACKLOG_WIDGET_CATALOG,
  type BacklogBuildContext,
  type BacklogWidgetData,
  type WidgetFieldRow,
  type WidgetSeriesPoint,
} from './backlog-widgets';

export const CLINICAL_WIDGET_IDS: readonly number[] = [
  14, 15, 16, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
] as const;

const CLINICAL_WIDGET_ID_SET = new Set<number>(CLINICAL_WIDGET_IDS);

const SAFETY_NOTICE =
  'Synthetic data only · Read-only surface (no live EHR writes)';

interface WidgetContent {
  summaryLine: string;
  rows: WidgetFieldRow[];
  series?: WidgetSeriesPoint[];
  checklist?: BacklogWidgetData['checklist'];
}

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

function buildMedicationReconciliation(
  id: number,
  ctx: BacklogBuildContext,
): WidgetContent | null {
  switch (id) {
    case 14: {
      const links = ctx.report.changes.flatMap((c) =>
        (c.evidenceLinks ?? []).map((l, idx) => ({ c, l, idx })),
      );
      const rows =
        links.length > 0
          ? links.slice(0, 10).map(({ c, l, idx }) =>
              row(
                `14-${c.medicationId}-${idx}`,
                `${c.name} (${l.side ?? 'record'})`,
                l.excerpt ?? l.note ?? 'Citation reference only',
                l.resolutionStatus === 'resolved' ? 'documented' : 'warning',
                l.sourceLabel ?? l.noteId ?? 'Snapshot link',
                l.recordedAt ?? null,
                l.span
                  ? `Span ${l.span.start}–${l.span.end}${l.recordedAt ? '' : ' · Date unknown'}`
                  : l.recordedAt
                    ? undefined
                    : 'Date unknown',
              ),
            )
          : [
              row(
                '14-empty',
                'No duplicate mentions',
                '0 repeated citations in active scenario',
                'documented',
                ctx.scenarioId,
                null,
                'Date unknown',
              ),
            ];
      return {
        summaryLine:
          'Repeated medication citations grouped from the active synthetic comparison with all original excerpts.',
        rows,
      };
    }

    case 15:
      return {
        summaryLine:
          'Original documented drug names paired with verified synthetic RxNorm / brand aliases.',
        rows: [
          row(
            '15-1',
            'Tylenol → Acetaminophen',
            'RxCUI 161 (verified synthetic alias)',
            'documented',
            'Ambulatory Med List',
            '2026-10-01',
            'Original text: "Tylenol 500 mg PRN"',
          ),
          row(
            '15-2',
            'Prilosec → Omeprazole',
            'RxCUI 7646 (verified synthetic alias)',
            'documented',
            'Discharge Summary',
            '2026-10-15',
            'Original text: "Prilosec 20 mg daily"',
          ),
          row(
            '15-3',
            'Unmapped herbal supplement',
            'No verified alias mapping · Date unknown',
            'unknown',
            'Patient Call Log',
            null,
            'Requires pharmacist verification before mapping',
          ),
        ],
      };

    case 16: {
      const missingRows: WidgetFieldRow[] = [];
      for (const c of ctx.report.changes) {
        for (const gap of c.provenanceGaps ?? []) {
          missingRows.push(
            row(
              `16-${c.medicationId}-${gap.field ?? gap.reason}-${missingRows.length}`,
              `${c.name} · ${gap.field ?? gap.scope}`,
              gap.message,
              gap.reason === 'missing_source_attribution' ||
              gap.reason === 'explicit_unknown_provenance'
                ? 'unknown'
                : 'missing',
              c.provenance?.later.sourceLabel ??
                c.provenance?.earlier.sourceLabel ??
                'Snapshot',
              c.provenance?.later.recordedAt ??
                c.provenance?.earlier.recordedAt ??
                null,
              gap.reason,
            ),
          );
        }
      }
      return {
        summaryLine:
          'Missing dose, unit, route, or frequency fields surfaced from active snapshot changes.',
        rows:
          missingRows.length > 0
            ? missingRows.slice(0, 12)
            : [
                row(
                  '16-none',
                  'All regimen fields populated',
                  'No missing dose, route, or frequency in active scenario',
                  'completed',
                  ctx.scenarioId,
                  null,
                ),
              ],
      };
    }

    case 18:
      return {
        summaryLine:
          'Prescribing lifecycle separated from bedside medication administration.',
        rows: [
          row(
            '18-1',
            'Lisinopril 20 mg PO daily',
            'Order: Active · Last dispensed 2026-10-15 (30-day supply)',
            'documented',
            'Outpatient Pharmacy Feed',
            '2026-10-15',
          ),
          row(
            '18-2',
            'Amoxicillin 500 mg PO TID',
            'Order: Completed (7-day course)',
            'completed',
            'Discharge eRx',
            '2026-10-10',
          ),
          row(
            '18-3',
            'Metformin 500 mg PO BID',
            'Order: Held pending renal lab',
            'warning',
            'Inpatient MAR/Orders',
            '2026-10-14',
          ),
          row(
            '18-4',
            'Hydrochlorothiazide 12.5 mg PO',
            'Order: Discontinued · Prior fill date unknown',
            'unknown',
            'Historical eRx Archive',
            null,
            'Date unknown in imported pharmacy feed',
          ),
        ],
      };

    case 19:
      return {
        summaryLine:
          'Synthetic MAR administration entries with explicit scheduled, given, missed, and overdue timestamps.',
        rows: [
          row(
            '19-1',
            'Lisinopril 20 mg PO',
            'Given at 08:05 by R. Torres, RN',
            'completed',
            'Synthetic MAR',
            '2026-10-15T08:05:00Z',
          ),
          row(
            '19-2',
            'Metformin 500 mg PO',
            'Missed / Held — NPO for imaging',
            'warning',
            'Synthetic MAR',
            '2026-10-15T12:00:00Z',
          ),
          row(
            '19-3',
            'Atorvastatin 20 mg PO',
            'Scheduled 21:00 (not yet due)',
            'pending',
            'Synthetic MAR',
            '2026-10-15T21:00:00Z',
          ),
          row(
            '19-4',
            'Aspirin 81 mg PO',
            'Overdue (scheduled 09:00, not charted)',
            'warning',
            'Synthetic MAR',
            '2026-10-15T09:00:00Z',
          ),
        ],
      };

    case 20:
      return {
        summaryLine:
          'Mock pharmacy verification orders highlighting missing fields and source citations.',
        rows: [
          row(
            '20-1',
            'Enoxaparin 40 mg',
            'Missing frequency & duration — verification blocked',
            'missing',
            'Admission Orders Draft',
            '2026-10-14',
            'Source: Admission Orders Draft § Meds',
          ),
          row(
            '20-2',
            'Gabapentin 300 mg',
            'Missing route · Date unknown',
            'unknown',
            'Outside Transfer Packet',
            null,
            'Source: Outside Transfer Packet · Date unknown',
          ),
          row(
            '20-3',
            'Lisinopril 20 mg oral daily',
            'Complete order fields — verified',
            'completed',
            'Discharge eRx',
            '2026-10-15',
          ),
        ],
      };

    default:
      return null;
  }
}

function buildChartBasics(id: number): WidgetContent | null {
  switch (id) {
    case 21:
      return {
        summaryLine:
          'Documented allergies, reactions, explicit negatives, and unknown entries.',
        rows: [
          row(
            '21-1',
            'Penicillin',
            'Urticaria · High severity · Active',
            'documented',
            'Allergy Banner',
            '2026-10-01',
          ),
          row(
            '21-2',
            'Latex',
            'Explicit negative (No known latex allergy)',
            'documented',
            'Intake Screen',
            '2026-10-01',
          ),
          row(
            '21-3',
            'Sulfa drugs',
            'Explicit negative (Patient denies reaction)',
            'documented',
            'Allergy Banner',
            '2026-10-01',
          ),
          row(
            '21-4',
            'Contrast dye',
            'Reaction unrecorded (unknown) · Date unknown',
            'unknown',
            'Outside Referral Note',
            null,
          ),
        ],
      };

    case 22:
      return {
        summaryLine:
          'Source-labeled intolerances kept distinct from immune-mediated allergies.',
        rows: [
          row(
            '22-1',
            'Metformin (GI upset)',
            'Intolerance · Mild nausea reported',
            'documented',
            'PCP Progress Note',
            '2026-09-12',
          ),
          row(
            '22-2',
            'Codeine (dizziness)',
            'Ambiguous: listed under allergy in external PDF vs. intolerance locally',
            'conflicting',
            'External Record PDF',
            '2026-08-04',
          ),
          row(
            '22-3',
            'Erythromycin (dyspepsia)',
            'Intolerance · Date unknown',
            'unknown',
            'Historical Intake',
            null,
          ),
        ],
      };

    case 23:
      return {
        summaryLine:
          'Active, historical, and unclear problem entries linked to supporting notes.',
        rows: [
          row(
            '23-1',
            'Essential hypertension (I10)',
            'Active · Controlled on titration',
            'documented',
            'Outpatient Problem List',
            '2026-10-01',
          ),
          row(
            '23-2',
            'Type 2 diabetes mellitus (E11.9)',
            'Active · Monitoring HbA1c',
            'documented',
            'Outpatient Problem List',
            '2026-10-01',
          ),
          row(
            '23-3',
            'Community-acquired pneumonia',
            'Historical · Resolved 2024',
            'completed',
            'Historical Summary',
            '2024-11-18',
          ),
          row(
            '23-4',
            'Intermittent palpitations',
            'Unclear status — no follow-up ECG',
            'unknown',
            'Triage Note',
            '2026-10-12',
          ),
        ],
      };

    case 24:
      return {
        summaryLine: 'Encounter-grouped diagnoses with explicit source provenance.',
        rows: [
          row(
            '24-1',
            'Enc 2026-10-15 (Hospital Discharge)',
            'Essential hypertension (I10), Acute bronchitis (J20.9)',
            'documented',
            'Hospital Discharge Note',
            '2026-10-15',
          ),
          row(
            '24-2',
            'Enc 2026-10-12 (Emergency Dept)',
            'Acute cough (R05.9), Elevated BP without HTN diagnosis',
            'documented',
            'ED Provider Note',
            '2026-10-12',
          ),
          row(
            '24-3',
            'Enc 2026-10-01 (Primary Care)',
            'Essential hypertension (I10), Type 2 DM (E11.9)',
            'documented',
            'Clinic Progress Note',
            '2026-10-01',
          ),
        ],
      };

    case 25:
      return {
        summaryLine:
          'Dated past medical conditions and surgical procedures kept distinct.',
        rows: [
          row(
            '25-1',
            'Procedure: Laparoscopic cholecystectomy',
            '2019-06-14 · Uncomplicated',
            'completed',
            'Surgical History',
            '2019-06-14',
          ),
          row(
            '25-2',
            'Procedure: Screening colonoscopy',
            '2023-09-08 · Normal findings',
            'completed',
            'GI Procedure Report',
            '2023-09-08',
          ),
          row(
            '25-3',
            'Condition: Gestational hypertension',
            '2012-04-02 · Resolved postpartum',
            'completed',
            'PMH Summary',
            '2012-04-02',
          ),
          row(
            '25-4',
            'Procedure: Childhood tonsillectomy',
            'Patient-reported · Date unknown',
            'unknown',
            'Intake Questionnaire',
            null,
          ),
        ],
      };

    case 26:
      return {
        summaryLine:
          'Documented family history preserving explicit unknown where details are absent.',
        rows: [
          row(
            '26-1',
            'Mother — Hypertension',
            'Diagnosed age 55 · Living',
            'documented',
            'Intake Family Hx',
            '2025-03-10',
          ),
          row(
            '26-2',
            'Sibling — Type 2 diabetes',
            'Diagnosed age 48 · Living',
            'documented',
            'Intake Family Hx',
            '2025-03-10',
          ),
          row(
            '26-3',
            'Paternal cardiac history',
            'Unknown — patient unsure of details',
            'unknown',
            'Intake Family Hx',
            null,
          ),
        ],
      };

    case 27:
      return {
        summaryLine:
          'Attributed social history keeping conflicting statements visible.',
        rows: [
          row(
            '27-1',
            'Tobacco use',
            'Never smoker (Clinic Note 2026-10-01) vs. Former 2 pack-year (ED Intake 2026-10-12)',
            'conflicting',
            'Clinic vs. ED Intake',
            '2026-10-12',
          ),
          row(
            '27-2',
            'Living situation',
            'Lives with spouse in single-level home',
            'documented',
            'Social Work Note',
            '2026-10-14',
          ),
          row(
            '27-3',
            'Alcohol use',
            'Occasional (1–2 drinks/month)',
            'documented',
            'Clinic Progress Note',
            '2026-10-01',
          ),
        ],
      };

    case 28:
      return {
        summaryLine:
          'Synthetic care team roles, participation status, and documented contact routes.',
        rows: [
          row(
            '28-1',
            'Dr. A. Patel (Synthetic PCP)',
            'Active · Primary care · Clinic inbox / ext 4401',
            'documented',
            'Care Team Registry',
            '2026-10-01',
          ),
          row(
            '28-2',
            'R. Nguyen, PharmD (Synthetic)',
            'Active · Discharge med rec · Pharmacy queue',
            'documented',
            'Inpatient Consult',
            '2026-10-15',
          ),
          row(
            '28-3',
            'M. Alvarez, RN (Synthetic)',
            'Active · Care coordination · Secure team thread',
            'documented',
            'Discharge Plan',
            '2026-10-15',
          ),
        ],
      };

    case 29:
      return {
        summaryLine:
          'Recorded language, interpreter, and accessibility preferences.',
        rows: [
          row(
            '29-1',
            'Preferred language',
            'English · Interpreter not needed',
            'documented',
            'Registration Profile',
            '2026-10-01',
          ),
          row(
            '29-2',
            'Visual accessibility',
            'Prefers high-contrast print & 16pt discharge sheet',
            'documented',
            'Patient Preferences',
            '2026-10-01',
          ),
          row(
            '29-3',
            'Mobility / hearing needs',
            'Explicit negative (None reported)',
            'documented',
            'Intake Screen',
            '2026-10-01',
          ),
        ],
      };

    case 30:
      return {
        summaryLine:
          'Advance directive status, recorded date, and source document.',
        rows: [
          row(
            '30-1',
            'Healthcare proxy on file',
            'Verified 2025-05-20 (Spouse, synthetic)',
            'documented',
            'Scanned Directive PDF',
            '2025-05-20',
          ),
          row(
            '30-2',
            'POLST form',
            'Not on file (unknown if completed externally) · Date unknown',
            'unknown',
            'Chart Directives',
            null,
          ),
        ],
      };

    default:
      return null;
  }
}

function buildResultsAndTrends(id: number): WidgetContent | null {
  switch (id) {
    case 31:
      return {
        summaryLine:
          'Most recent documented synthetic vital signs with units, source, and measurement time.',
        rows: [
          row(
            '31-1',
            'Blood Pressure',
            '134 / 82 mmHg (Seated, left arm)',
            'documented',
            'Discharge Vitals',
            '2026-10-15T09:30:00Z',
          ),
          row(
            '31-2',
            'Heart Rate',
            '74 bpm',
            'documented',
            'Discharge Vitals',
            '2026-10-15T09:30:00Z',
          ),
          row(
            '31-3',
            'SpO2',
            '98% on room air',
            'documented',
            'Discharge Vitals',
            '2026-10-15T09:30:00Z',
          ),
          row(
            '31-4',
            'Temperature',
            '36.7 °C (Oral)',
            'documented',
            'Discharge Vitals',
            '2026-10-15T09:30:00Z',
          ),
        ],
      };

    case 32:
      return {
        summaryLine:
          'Synthetic systolic BP trend across recent encounters with accessible tabular fallback.',
        rows: [
          row(
            '32-1',
            '2026-08-10 · Systolic BP',
            '146/88 mmHg (Elevated)',
            'warning',
            'Clinic Vitals',
            '2026-08-10',
          ),
          row(
            '32-2',
            '2026-10-01 · Systolic BP',
            '140/86 mmHg',
            'documented',
            'Clinic Vitals',
            '2026-10-01',
          ),
          row(
            '32-3',
            '2026-10-15 · Systolic BP',
            '134/82 mmHg (Improving)',
            'completed',
            'Discharge Vitals',
            '2026-10-15',
          ),
        ],
        series: [
          {
            label: 'Aug 10',
            value: 146,
            unit: 'mmHg (SBP)',
            recordedAt: '2026-08-10',
            comparable: true,
          },
          {
            label: 'Oct 01',
            value: 140,
            unit: 'mmHg (SBP)',
            recordedAt: '2026-10-01',
            comparable: true,
          },
          {
            label: 'Oct 15',
            value: 134,
            unit: 'mmHg (SBP)',
            recordedAt: '2026-10-15',
            comparable: true,
          },
        ],
      };

    case 33:
      return {
        summaryLine:
          'Cross-encounter flowsheet keeping unmeasured intervals visibly blank.',
        rows: [
          row(
            '33-1',
            'Weight (kg)',
            '72.4 kg (Oct 01) · Not recorded (Oct 12) · 71.8 kg (Oct 15)',
            'missing',
            'Encounter Flowsheet',
            '2026-10-15',
          ),
          row(
            '33-2',
            'Temp (°C)',
            '36.8 °C (Oct 01) · 37.9 °C (Oct 12) · 36.7 °C (Oct 15)',
            'documented',
            'Encounter Flowsheet',
            '2026-10-15',
          ),
          row(
            '33-3',
            'Pain Score (0–10)',
            '0/10 (Oct 01) · 3/10 (Oct 12) · Not recorded (Oct 15)',
            'missing',
            'Encounter Flowsheet',
            '2026-10-15',
          ),
        ],
      };

    case 34:
      return {
        summaryLine:
          '24-hour synthetic intake and output within bounded window (2026-10-14 07:00–2026-10-15 07:00).',
        rows: [
          row(
            '34-1',
            'Total Intake (24h)',
            '1,850 mL (Oral 1,350 mL + IV 500 mL)',
            'documented',
            'Nursing I&O Sheet',
            '2026-10-15T07:00:00Z',
          ),
          row(
            '34-2',
            'Total Output (24h)',
            '1,620 mL (Urine)',
            'documented',
            'Nursing I&O Sheet',
            '2026-10-15T07:00:00Z',
          ),
          row(
            '34-3',
            'Net Balance (24h)',
            '+230 mL',
            'documented',
            'Calculated I&O',
            '2026-10-15T07:00:00Z',
          ),
        ],
      };

    case 35:
      return {
        summaryLine:
          'Synthetic lab results with units, reference ranges, flags, and dates.',
        rows: [
          row(
            '35-1',
            'Serum Creatinine',
            '0.94 mg/dL (Ref 0.60–1.20 · Normal)',
            'documented',
            'Core Lab',
            '2026-10-14',
          ),
          row(
            '35-2',
            'Potassium',
            '4.3 mmol/L (Ref 3.5–5.1 · Normal)',
            'documented',
            'Core Lab',
            '2026-10-14',
          ),
          row(
            '35-3',
            'HbA1c',
            '7.4 % (Ref < 5.7 % · High)',
            'warning',
            'Outpatient Lab',
            '2026-10-01',
          ),
        ],
      };

    case 36:
      return {
        summaryLine:
          'Lab trends explicitly flagging unit shifts and noncomparable assays.',
        rows: [
          row(
            '36-1',
            'Creatinine (mg/dL)',
            '0.91 → 0.96 → 0.94 mg/dL (Comparable)',
            'documented',
            'Lab Trend Engine',
            '2026-10-14',
          ),
          row(
            '36-2',
            'External Glucose (mmol/L)',
            '7.8 mmol/L — unit change vs. local mg/dL (noncomparable without conversion)',
            'warning',
            'Outside Lab Import',
            '2026-09-20',
          ),
        ],
        series: [
          {
            label: 'Aug 01',
            value: 0.91,
            unit: 'mg/dL',
            recordedAt: '2026-08-01',
            comparable: true,
          },
          {
            label: 'Sep 20 (Ext)',
            value: 7.8,
            unit: 'mmol/L (unit change)',
            recordedAt: '2026-09-20',
            comparable: false,
          },
          {
            label: 'Oct 01',
            value: 0.96,
            unit: 'mg/dL',
            recordedAt: '2026-10-01',
            comparable: true,
          },
          {
            label: 'Oct 14',
            value: 0.94,
            unit: 'mg/dL',
            recordedAt: '2026-10-14',
            comparable: true,
          },
        ],
      };

    case 37:
      return {
        summaryLine:
          'Source-flagged critical lab alerts with mock acknowledgment audit.',
        rows: [
          row(
            '37-1',
            'Troponin I (2026-10-12)',
            '0.02 ng/mL (Normal — not critical)',
            'completed',
            'ED Lab Feed',
            '2026-10-12',
          ),
          row(
            '37-2',
            'Potassium 5.8 mmol/L (Synthetic alert drill)',
            'Critical High · Acknowledged by Dr. A. Patel at 14:18',
            'warning',
            'Lab Critical Log',
            '2026-10-13T14:18:00Z',
          ),
        ],
      };

    case 38:
      return {
        summaryLine:
          'Specimen collection, receipt, processing, and final result milestones.',
        rows: [
          row(
            '38-1',
            'SPEC-SYN-401 (BMP)',
            'Collected 06:15 → Received 06:28 → Processing 06:40 → Final 07:02',
            'completed',
            'Lab Specimen Tracker',
            '2026-10-14T07:02:00Z',
          ),
          row(
            '38-2',
            'SPEC-SYN-409 (Lipid panel)',
            'Ordered — specimen not yet collected',
            'pending',
            'Lab Specimen Tracker',
            '2026-10-15',
          ),
        ],
      };

    case 39:
      return {
        summaryLine:
          'Dated imaging impressions distinguishing Preliminary vs. Final reads.',
        rows: [
          row(
            '39-1',
            'CXR PA & Lateral (Final)',
            'No acute cardiopulmonary process; mild hyperinflation.',
            'completed',
            'Radiology PACS',
            '2026-10-12',
          ),
          row(
            '39-2',
            'Renal Ultrasound (Preliminary)',
            'Preliminary: no hydronephrosis · Pending final attending signature.',
            'pending',
            'Radiology PACS',
            '2026-10-15',
          ),
        ],
      };

    case 40:
      return {
        summaryLine:
          'Microbiology & pathology reports showing preliminary states and final amendments.',
        rows: [
          row(
            '40-1',
            'Sputum Culture (Amended Final)',
            'Normal respiratory flora (amended from preliminary gram stain)',
            'documented',
            'Microbiology Lab',
            '2026-10-14',
          ),
          row(
            '40-2',
            'Blood Culture x2 (Preliminary 48h)',
            'No growth to date at 48 hours',
            'pending',
            'Microbiology Lab',
            '2026-10-14',
          ),
        ],
      };

    default:
      return null;
  }
}

function buildEncountersAndCarePlanning(
  id: number,
  ctx: BacklogBuildContext,
): WidgetContent | null {
  switch (id) {
    case 41: {
      const unreviewed = ctx.report.changes.filter(
        (c) => !ctx.reviews[`${ctx.scenarioId}:${c.medicationId}`],
      ).length;
      return {
        summaryLine:
          'Upcoming ambulatory follow-up summary and open documentation items.',
        rows: [
          row(
            '41-1',
            'Scheduled PCP Follow-up',
            '2026-10-22 · Post-discharge med reconciliation',
            'pending',
            'Scheduling Feed',
            '2026-10-22',
          ),
          row(
            '41-2',
            'Open medication diff items',
            `${unreviewed} unreviewed of ${ctx.report.changes.length} active changes`,
            unreviewed > 0 ? 'warning' : 'completed',
            'Clinical Diff Queue',
            '2026-10-15',
          ),
        ],
      };
    }

    case 42:
      return {
        summaryLine:
          'Interactive local simulation of synthetic rooming intake tasks.',
        rows: [
          row(
            '42-1',
            'Intake vitals recorded',
            'Completed at 09:10',
            'completed',
            'Rooming Flow',
            '2026-10-15',
          ),
          row(
            '42-2',
            'Medication list verified with patient',
            'Pending clinician sign-off',
            'pending',
            'Rooming Flow',
            '2026-10-15',
          ),
        ],
        checklist: [
          {
            id: 'chk-42-1',
            text: `Verify synthetic wristband & DOB (${ctx.patientLabel})`,
            done: true,
            sourceLabel: 'Rooming Flow',
          },
          {
            id: 'chk-42-2',
            text: 'Reconcile outside pharmacy fill list',
            done: false,
            sourceLabel: 'Pharmacy Feed',
          },
          {
            id: 'chk-42-3',
            text: 'Confirm allergy & intolerance banner',
            done: true,
            sourceLabel: 'Allergy Banner',
          },
        ],
      };

    case 43:
      return {
        summaryLine:
          'Unified active encounter overview linking visit, note, labs, and tasks.',
        rows: [
          row(
            '43-1',
            'Active Encounter',
            `Discharge Medication Reconciliation (${ctx.patientLabel})`,
            'documented',
            'Encounter Banner',
            '2026-10-15',
          ),
          row(
            '43-2',
            'Key Labs',
            'Cr 0.94 mg/dL · K+ 4.3 mmol/L · HbA1c 7.4%',
            'documented',
            'Core Lab',
            '2026-10-14',
          ),
          row(
            '43-3',
            'Outstanding Diff Tasks',
            `${ctx.report.changes.length} medication changes linked to source notes`,
            ctx.report.changes.length > 0 ? 'warning' : 'completed',
            'Task Engine',
            '2026-10-15',
          ),
        ],
      };

    case 44:
      return {
        summaryLine:
          'Structured clinical note section outline preserving source metadata.',
        rows: [
          row(
            '44-1',
            'HPI & Hospital Course',
            'Section offset 0–420 · Discharge Summary',
            'documented',
            'Discharge Note',
            '2026-10-15',
          ),
          row(
            '44-2',
            'Discharge Medications',
            'Section offset 421–890 · Discharge Summary',
            'documented',
            'Discharge Note',
            '2026-10-15',
          ),
          row(
            '44-3',
            'Follow-up Plan',
            'Section offset 891–1120 · Discharge Summary',
            'documented',
            'Discharge Note',
            '2026-10-15',
          ),
        ],
      };

    case 45:
      return {
        summaryLine:
          'Synthetic note draft compared against source medication list.',
        rows: [
          row(
            '45-1',
            'Draft vs Source — Lisinopril',
            'Draft lists 20 mg daily (matches discharge order)',
            'completed',
            'Draft Comparator',
            '2026-10-15',
          ),
          row(
            '45-2',
            'Draft vs Source — Amoxicillin',
            'Draft omits 7-day duration present in eRx',
            'warning',
            'Draft Comparator',
            '2026-10-15',
          ),
        ],
      };

    case 46:
      return {
        summaryLine: 'Synthetic order details, origin, and lifecycle state.',
        rows: [
          row(
            '46-1',
            'ORD-1042 · BMP (Outpatient)',
            'Origin: Discharge Plan · Status: Signed / Pending draw',
            'pending',
            'Order Catalog',
            '2026-10-15',
          ),
          row(
            '46-2',
            'ORD-1039 · Lisinopril 20 mg',
            'Origin: Discharge eRx · Status: Sent to pharmacy',
            'completed',
            'Order Catalog',
            '2026-10-15',
          ),
        ],
      };

    case 47:
      return {
        summaryLine:
          'Synthetic referral lifecycle across pending, scheduled, completed, and closed.',
        rows: [
          row(
            '47-1',
            'REF-201 · Clinical Pharmacy Consult',
            'Completed 2026-10-14',
            'completed',
            'Referral Tracker',
            '2026-10-14',
          ),
          row(
            '47-2',
            'REF-204 · Cardiology Follow-up',
            'Scheduled for 2026-11-02',
            'pending',
            'Referral Tracker',
            '2026-10-15',
          ),
          row(
            '47-3',
            'REF-188 · Physical Therapy (2025)',
            'Closed — patient completed course',
            'completed',
            'Referral Tracker',
            '2025-11-20',
          ),
        ],
      };

    case 48:
      return {
        summaryLine:
          'Documented care plan goals with review dates and source links.',
        rows: [
          row(
            '48-1',
            'Target BP < 130/80 mmHg',
            'In progress · Next review 2026-10-22',
            'documented',
            'Care Plan Note',
            '2026-10-15',
          ),
          row(
            '48-2',
            'Complete 7-day antibiotic course',
            'Target end date 2026-10-17',
            'pending',
            'Discharge Instructions',
            '2026-10-10',
          ),
        ],
      };

    case 49:
      return {
        summaryLine:
          'Recorded synthetic immunizations with administration dates and origins.',
        rows: [
          row(
            '49-1',
            'Influenza (Quadrivalent)',
            'Administered 2026-09-28 · Retail Pharmacy Sync',
            'completed',
            'IIS Registry Sync',
            '2026-09-28',
          ),
          row(
            '49-2',
            'Tdap',
            'Administered 2022-04-11 · Primary Care Clinic',
            'completed',
            'Clinic Immunization Log',
            '2022-04-11',
          ),
          row(
            '49-3',
            'Pneumococcal (PCV20)',
            'Prior vaccination date unknown',
            'unknown',
            'IIS Registry Sync',
            null,
          ),
        ],
      };

    case 50: {
      const changeRows = ctx.report.changes.slice(0, 6).map((c) => {
        const recordedAt = c.provenance?.later.recordedAt ?? null;
        return row(
          `50-${c.medicationId}`,
          `${c.name} (${c.kind})`,
          c.fields
            .map((fc) => `${fc.field}: ${fc.before ?? '—'} → ${fc.after ?? '—'}`)
            .join('; ') || c.kind,
          c.provenance?.hasUnknownProvenance ? 'unknown' : 'documented',
          c.provenance?.later.sourceLabel ?? 'Discharge List',
          recordedAt,
          recordedAt ? undefined : 'Date unknown',
        );
      });
      return {
        summaryLine:
          'Discharge instructions, follow-ups, and live medication differences with source links.',
        rows: [
          ...changeRows,
          row(
            '50-fu',
            'Follow-up instruction',
            'Schedule BMP & BP check within 7 days of discharge',
            'pending',
            'Discharge Plan',
            '2026-10-15',
          ),
        ],
      };
    }

    default:
      return null;
  }
}

function buildQueuesAndCoordination(
  id: number,
  ctx: BacklogBuildContext,
): WidgetContent | null {
  switch (id) {
    case 51:
      return {
        summaryLine:
          'Unresolved and flagged medication changes awaiting clinician follow-up.',
        rows:
          ctx.report.changes.length > 0
            ? ctx.report.changes.map((c) => {
                const decision =
                  ctx.reviews[`${ctx.scenarioId}:${c.medicationId}`];
                const recordedAt = c.provenance?.later.recordedAt ?? null;
                return row(
                  `51-${c.medicationId}`,
                  c.name,
                  decision
                    ? `Decision: ${decision} · Owner: Dr. A. Patel`
                    : 'Pending clinician review · Next: verify source',
                  decision === 'flag'
                    ? 'warning'
                    : decision
                      ? 'completed'
                      : 'pending',
                  c.provenance?.later.sourceLabel ?? 'Snapshot Review',
                  recordedAt,
                  recordedAt ? undefined : 'Date unknown',
                );
              })
            : [
                row(
                  '51-empty',
                  'No pending follow-ups',
                  '0 unresolved changes in active scenario',
                  'completed',
                  ctx.scenarioId,
                  null,
                ),
              ],
      };

    case 52:
      return {
        summaryLine:
          'Mock incoming results inbox filtered by review workflow state.',
        rows: [
          row(
            '52-1',
            'HbA1c 7.4% (Abnormal)',
            'Unread · Requires clinician acknowledgment',
            'warning',
            'Lab Inbox',
            '2026-10-01',
          ),
          row(
            '52-2',
            'Renal Ultrasound (Preliminary)',
            'Pending final signature',
            'pending',
            'Imaging Inbox',
            '2026-10-15',
          ),
          row(
            '52-3',
            'CXR Final Report',
            'Reviewed by Dr. A. Patel',
            'completed',
            'Imaging Inbox',
            '2026-10-12',
          ),
        ],
      };

    case 53:
      return {
        summaryLine:
          'Synthetic documentation queue showing draft, pending review, and complete.',
        rows: [
          row(
            '53-1',
            'Discharge Med Rec Note',
            'Pending clinician review',
            'pending',
            'Doc Queue',
            '2026-10-15',
          ),
          row(
            '53-2',
            'PCP Post-Discharge Addendum',
            'Draft (unsaved local simulation)',
            'warning',
            'Doc Queue',
            '2026-10-15',
          ),
          row(
            '53-3',
            'Admission H&P',
            'Signed & complete',
            'completed',
            'Doc Queue',
            '2026-10-12',
          ),
        ],
      };

    case 54: {
      const flagged = ctx.report.changes.filter(
        (c) =>
          c.provenance?.hasUnknownProvenance ||
          c.provenance?.hasAmbiguousProvenance ||
          (c.provenanceFlags ?? []).length > 0,
      );
      return {
        summaryLine:
          'Chart review queue surfacing unresolved source links and provenance conflicts.',
        rows:
          flagged.length > 0
            ? flagged.map((c) => {
                const recordedAt = c.provenance?.later.recordedAt ?? null;
                return row(
                  `54-${c.medicationId}`,
                  c.name,
                  (c.provenanceFlags ?? []).join(', ') || 'Needs source review',
                  c.provenance?.hasAmbiguousProvenance
                    ? 'conflicting'
                    : 'warning',
                  c.provenance?.later.sourceLabel ?? 'Snapshot Review',
                  recordedAt,
                  `Jump target: #med-${c.medicationId}${recordedAt ? '' : ' · Date unknown'}`,
                );
              })
            : [
                row(
                  '54-ok',
                  'No unresolved source flags',
                  'All active changes have clean provenance',
                  'completed',
                  ctx.scenarioId,
                  null,
                ),
              ],
      };
    }

    case 55: {
      const unresolvedCount = ctx.report.changes.filter(
        (c) => !ctx.reviews[`${ctx.scenarioId}:${c.medicationId}`],
      ).length;
      return {
        summaryLine:
          'Simulated shift handoff summary of unresolved items and source-linked changes.',
        rows: [
          row(
            '55-1',
            'Open medication diff items',
            `${unresolvedCount} of ${ctx.report.changes.length} awaiting review`,
            unresolvedCount > 0 ? 'warning' : 'completed',
            'Handoff Summary',
            '2026-10-15',
          ),
          row(
            '55-2',
            'Lisinopril dose increase (10 → 20 mg)',
            'Watch standing BP & check Cr at 1-week follow-up',
            'warning',
            'Handoff Summary',
            '2026-10-15',
          ),
          row(
            '55-3',
            'Penicillin allergy active',
            'Confirmed before Amoxicillin hold/review',
            'documented',
            'Allergy Banner',
            '2026-10-01',
          ),
        ],
      };
    }

    case 56:
      return {
        summaryLine:
          'Encounter-scoped rounds list retaining single selectable synthetic chart.',
        rows: [
          row(
            '56-1',
            `${ctx.patientLabel} · Discharge Day`,
            `${ctx.report.changes.length} med rec items · Ready for follow-up`,
            'pending',
            'Rounds Tracker',
            '2026-10-15',
          ),
        ],
      };

    case 57:
      return {
        summaryLine: 'Dated synthetic appointment entries and attendance statuses.',
        rows: [
          row(
            '57-1',
            '2026-10-01 10:00 · Primary Care',
            'Completed',
            'completed',
            'Scheduling Feed',
            '2026-10-01',
          ),
          row(
            '57-2',
            '2026-10-22 14:30 · Post-Discharge Follow-up',
            'Scheduled',
            'pending',
            'Scheduling Feed',
            '2026-10-22',
          ),
        ],
      };

    case 58:
      return {
        summaryLine:
          'Admission, transfer, and discharge (ADT) events in chronological source order.',
        rows: [
          row(
            '58-1',
            '2026-10-12 18:10 · ED Arrival',
            'Triage ESI 3',
            'completed',
            'ADT Feed',
            '2026-10-12T18:10:00Z',
          ),
          row(
            '58-2',
            '2026-10-13 01:40 · Inpatient Floor Transfer',
            'Medicine Unit 4B',
            'completed',
            'ADT Feed',
            '2026-10-13T01:40:00Z',
          ),
          row(
            '58-3',
            '2026-10-15 11:15 · Discharged Home',
            'With discharge med rec packet',
            'completed',
            'ADT Feed',
            '2026-10-15T11:15:00Z',
          ),
        ],
      };

    case 59:
      return {
        summaryLine:
          'Preventive reminders and clinical recalls with due dates and owners.',
        rows: [
          row(
            '59-1',
            'Repeat BMP (1 week post-Lisinopril increase)',
            'Due 2026-10-22 · Owner: PCP',
            'pending',
            'Recall Queue',
            '2026-10-22',
          ),
          row(
            '59-2',
            'Annual Influenza Vaccine',
            'Completed 2026-09-28 · Owner: Pharmacy',
            'completed',
            'Preventive Care',
            '2026-09-28',
          ),
        ],
      };

    case 60:
      return {
        summaryLine:
          'Synthetic portal and care-team message threads with timestamps.',
        rows: [
          row(
            '60-1',
            'Patient Portal · Question on evening pill',
            'Sent 2026-10-15 15:20 · Replied by RN',
            'completed',
            'Portal Messages',
            '2026-10-15T15:20:00Z',
          ),
          row(
            '60-2',
            'Care-Team Thread · PharmD → PCP',
            'Flagged Amoxicillin duration note',
            'pending',
            'Team Messaging',
            '2026-10-15T16:05:00Z',
          ),
        ],
      };

    default:
      return null;
  }
}

export function buildClinicalWidgetData(
  id: number,
  ctx: BacklogBuildContext,
): BacklogWidgetData | null {
  if (!CLINICAL_WIDGET_ID_SET.has(id)) {
    return null;
  }

  const meta = BACKLOG_WIDGET_CATALOG.find((m) => m.id === id);
  if (!meta) {
    return null;
  }

  const content =
    buildMedicationReconciliation(id, ctx) ??
    buildChartBasics(id) ??
    buildResultsAndTrends(id) ??
    buildEncountersAndCarePlanning(id, ctx) ??
    buildQueuesAndCoordination(id, ctx);

  if (!content) {
    return null;
  }

  const { summaryLine, rows, series, checklist } = content;
  const missingOrUnknown = rows.filter(
    (r) => r.status === 'missing' || r.status === 'unknown',
  ).length;
  const alertsOrConflicts = rows.filter(
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

import type { PatientBrief } from './types';

/**
 * One fictional patient for the end-to-end demonstration. All content is
 * synthetic. Fields that the fixture does not define are null and rendered as
 * "Not documented". Unresolved discrepancies are listed explicitly so the
 * workspace never implies a difference is a confirmed error.
 */
export const patientBrief: PatientBrief = {
  id: 'DEMO-001',
  name: 'Morgan Lee',
  age: 64,
  sex: 'Fictional (not clinically meaningful)',
  activeProblems: [
    { name: 'Hypertension (fictional)', since: '2024' },
    { name: 'Type 2 diabetes (fictional)', since: '2023' },
  ],
  allergies: [{ substance: 'Penicillin (fictional)', reaction: 'Urticaria (fictional)' }],
  activeMedications: [
    { id: 'm1', name: 'Lisinopril', dose: '20 mg', route: 'oral', frequency: 'daily' },
    { id: 'm2', name: 'Metformin', dose: '500 mg', route: 'oral', frequency: null },
    { id: 'm4', name: 'Atorvastatin', dose: '20 mg', route: 'oral', frequency: 'daily' },
  ],
  encounters: [
    {
      id: 'enc-2026-10-15',
      date: '2026-10-15',
      kind: 'Fictional discharge summary',
      summary: 'Discharge medication list recorded; Metformin frequency not documented.',
      sourceRef: 's2',
    },
    {
      id: 'enc-2026-10-01',
      date: '2026-10-01',
      kind: 'Fictional outpatient visit',
      summary: 'Outpatient medication list recorded; Aspirin present, later absent.',
      sourceRef: 's1',
    },
  ],
  unresolvedDiscrepancies: [
    {
      id: 'disc-aspirin',
      summary: 'Aspirin appears in the earlier list but not the later list; reason unknown.',
      sourceRef: 's1→s2',
    },
    {
      id: 'disc-metformin-freq',
      summary: 'Metformin frequency is documented earlier but missing in the later snapshot.',
      sourceRef: 's1→s2',
    },
  ],
  missing: [
    'No prescriber authorization or rationale is recorded in the fixtures.',
    'No clinical note explains the reason for any difference.',
    'Patient-reported medication use is not confirmed against a fill history.',
  ],
};
import { describe, expect, it } from 'vitest';
import {
  buildProposal,
  classifyStatement,
  diffFields,
  evidenceGate,
  recordDecision,
  toFhirPreview,
} from './proposals';
import { extractFromNote, parseStatements } from './encounter';
import type { ExtractedMedication, Medication, Proposal, Statement } from './types';

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'm1', name: 'Lisinopril', dose: '10 mg', route: 'oral', frequency: 'daily', ...over,
});

const extract = (over: Partial<ExtractedMedication> = {}): ExtractedMedication => ({
  id: 'ex-0', name: 'Lisinopril', dose: '20 mg', route: 'oral', frequency: 'daily', status: 'changed',
  evidence: { start: 0, end: 10 }, ...over,
});

const stmts = (texts: string[]): Statement[] => texts.map((text, i) => ({
  id: `s${i}`, text, kind: 'chart_fact', authority: 'chart_fact',
  evidence: { start: 0, end: text.length }, medicationName: 'Lisinopril', sourceRef: 'encounter-note',
}));

describe('classifyStatement', () => {
  it('treats patient-reported use as an observation, never an order', () => {
    const r = classifyStatement('Patient reports taking lisinopril 20 mg daily', { patientReported: true });
    expect(r.authority).toBe('patient_reported');
    expect(r.kind).toBe('observation');
  });
  it('flags uncertain and historical statements', () => {
    expect(classifyStatement('Dose is unclear', { patientReported: true }).authority).toBe('uncertain');
    expect(classifyStatement('She previously took aspirin', { patientReported: true }).authority).toBe('historical');
  });
  it('defaults chart statements to chart_fact', () => {
    expect(classifyStatement('Lisinopril 20 mg daily').authority).toBe('chart_fact');
  });
});

describe('evidenceGate', () => {
  const base = { action: 'start' as const, authority: 'chart_fact' as const, evidenceCount: 1, proposed: [] };
  it('passes when evidence exists and required fields are present', () => {
    const proposed = [
      { field: 'medication' as const, label: 'Medication', before: null, after: 'Lisinopril' },
      { field: 'dose' as const, label: 'Dose', before: null, after: '20 mg' },
      { field: 'route' as const, label: 'Route', before: null, after: 'oral' },
      { field: 'frequency' as const, label: 'Frequency', before: null, after: 'daily' },
    ];
    expect(evidenceGate({ ...base, proposed }).passed).toBe(true);
  });
  it('fails without evidence', () => {
    expect(evidenceGate({ ...base, evidenceCount: 0 }).passed).toBe(false);
  });
  it('refuses to invent missing required fields', () => {
    const proposed = [
      { field: 'medication' as const, label: 'Medication', before: null, after: 'Lisinopril' },
      { field: 'dose' as const, label: 'Dose', before: null, after: '20 mg' },
      { field: 'route' as const, label: 'Route', before: null, after: null },
      { field: 'frequency' as const, label: 'Frequency', before: null, after: null },
    ];
    const g = evidenceGate({ ...base, proposed });
    expect(g.passed).toBe(false);
    expect(g.reasons.join(' ')).toMatch(/route/);
  });
  it('blocks patient-reported starts', () => {
    const proposed = [
      { field: 'medication' as const, label: 'Medication', before: null, after: 'Lisinopril' },
      { field: 'dose' as const, label: 'Dose', before: null, after: '20 mg' },
      { field: 'route' as const, label: 'Route', before: null, after: 'oral' },
      { field: 'frequency' as const, label: 'Frequency', before: null, after: 'daily' },
    ];
    expect(evidenceGate({ ...base, authority: 'patient_reported', proposed }).passed).toBe(false);
  });
});

describe('buildProposal', () => {
  it('abstains instead of guessing when the note lacks required fields', () => {
    const p = buildProposal({
      id: 'p1', extracted: extract({ dose: null, route: null, frequency: null }),
      current: undefined, statements: stmts(['Lisinopril mentioned']), authority: 'chart_fact',
    });
    expect(p.action).toBe('start');
    expect(p.gate.passed).toBe(false);
    expect(p.abstainReason).toBeTruthy();
  });

  it('builds a change proposal when a charted field differs', () => {
    const p = buildProposal({
      id: 'p2', extracted: extract({ dose: '40 mg' }),
      current: med(), statements: stmts(['Lisinopril 40 mg daily']), authority: 'chart_fact',
    });
    expect(p.action).toBe('change');
    expect(p.diff).toContainEqual({ field: 'dose', before: '10 mg', after: '40 mg' });
    expect(p.gate.passed).toBe(true);
  });

  it('continues when nothing differs and evidence exists', () => {
    const p = buildProposal({
      id: 'p3', extracted: extract({ dose: '10 mg', route: 'oral', frequency: 'daily' }),
      current: med(), statements: stmts(['Lisinopril 10 mg daily']), authority: 'chart_fact',
    });
    expect(p.action).toBe('continue');
    expect(p.diff).toEqual([]);
  });
});

describe('diffFields', () => {
  it('reports only changed fields', () => {
    const current = [
      { field: 'dose' as const, label: 'Dose', before: '10 mg', after: '10 mg' },
    ];
    const proposed = [
      { field: 'dose' as const, label: 'Dose', before: null, after: '20 mg' },
    ];
    expect(diffFields(current, proposed)).toEqual([{ field: 'dose', before: '10 mg', after: '20 mg' }]);
  });
});

describe('recordDecision', () => {
  const proposal = buildProposal({
    id: 'p4', extracted: extract({ dose: '40 mg' }), current: med(),
    statements: stmts(['Lisinopril 40 mg daily']), authority: 'chart_fact',
  });

  it('rejected proposals produce no FHIR preview', () => {
    const a = recordDecision({ proposal, decision: 'rejected', actor: 'demo-clinician' });
    expect(a.fhirPreview).toBeNull();
  });

  it('accepted proposals produce a preview', () => {
    const a = recordDecision({ proposal, decision: 'accepted', actor: 'demo-clinician' });
    expect(a.fhirPreview?.resourceType).toBe('MedicationStatement');
  });

  it('edited proposals require revalidation before preview', () => {
    const edited = recordDecision({ proposal, decision: 'edited', actor: 'demo-clinician' });
    expect(edited.fhirPreview).toBeNull();
    const revalidated = recordDecision({ proposal, decision: 'edited', actor: 'demo-clinician', revalidated: true });
    expect(revalidated.fhirPreview).not.toBeNull();
  });
});

describe('toFhirPreview', () => {
  it('parses dose quantity and keeps missing fields null', () => {
    const p = buildProposal({
      id: 'p5', extracted: extract({ frequency: null }), current: undefined,
      statements: stmts(['Lisinopril 20 mg oral']), authority: 'chart_fact',
    });
    const fhir = toFhirPreview({ ...p, gate: { passed: true, reasons: [], abstained: false } });
    expect(fhir.dosage[0].doseQuantity).toEqual({ value: 20, unit: 'mg' });
    expect(fhir.dosage[0].frequency).toBeNull();
  });
});

describe('extractFromNote', () => {
  it('extracts only explicitly stated values and labels simulated mode', () => {
    const note = 'Patient reports taking Lisinopril 20 mg orally once daily. Metformin 500 mg daily.';
    const r = extractFromNote(note);
    expect(r.mode).toBe('simulated');
    expect(r.disclaimer).toMatch(/Simulated/i);
    const lisinopril = r.medications.find((m) => m.name === 'Lisinopril')!;
    expect(lisinopril.dose).toBe('20 mg');
    expect(lisinopril.route).toBe('oral');
    expect(lisinopril.frequency).toBe('daily');
  });

  it('leaves undocumented fields null instead of guessing', () => {
    const r = extractFromNote('Aspirin.');
    const aspirin = r.medications.find((m) => m.name === 'Aspirin')!;
    expect(aspirin.dose).toBeNull();
    expect(aspirin.route).toBeNull();
    expect(aspirin.frequency).toBeNull();
  });

  it('surfaces uncertain statements as unresolved', () => {
    const r = extractFromNote('Lisinopril dose is unclear.');
    expect(r.unresolved.length).toBeGreaterThan(0);
  });
});

describe('parseStatements', () => {
  it('classifies patient-reported statements as observations', () => {
    const stmts = parseStatements('Patient reports taking aspirin daily.');
    expect(stmts[0].authority).toBe('patient_reported');
    expect(stmts[0].medicationName).toBe('Aspirin');
  });
  it('produces literal evidence spans', () => {
    const note = 'Lisinopril 10 mg daily.';
    const stmts = parseStatements(note);
    const span = stmts[0].evidence!;
    expect(note.slice(span.start, span.end)).toBe('Lisinopril 10 mg daily.');
  });
});

describe('extractFromNote: route detection', () => {
  it('does not match short route inside unrelated word (po in hypoglycemia)', () => {
    const r = extractFromNote('Patient has hypoglycemia and takes Lisinopril.');
    const lisinopril = r.medications.find((m) => m.name === 'Lisinopril')!;
    expect(lisinopril.route).toBeNull();
  });

  it('maps orally to oral route', () => {
    const r = extractFromNote('Lisinopril 20 mg orally once daily.');
    const lisinopril = r.medications.find((m) => m.name === 'Lisinopril')!;
    expect(lisinopril.route).toBe('oral');
  });

  it('maps IV to iv route', () => {
    const r = extractFromNote('Insulin IV infusion.');
    const insulin = r.medications.find((m) => m.name === 'Insulin')!;
    expect(insulin.route).toBe('iv');
  });

  it('matches by mouth route', () => {
    const r = extractFromNote('Metformin by mouth twice daily.');
    const metformin = r.medications.find((m) => m.name === 'Metformin')!;
    expect(metformin.route).toBe('by mouth');
  });
});

describe('extractFromNote: medication recognition', () => {
  it('does not extract unknown medications not in formulary', () => {
    const r = extractFromNote('Patient takes Xylocaine 100 mg.');
    expect(r.medications.length).toBe(0);
  });

  it('extracts multiple medications from one note', () => {
    const r = extractFromNote('Lisinopril 20 mg daily. Metformin 500 mg twice daily. Atorvastatin 40 mg nightly.');
    expect(r.medications.length).toBe(3);
    expect(r.medications.map((m) => m.name).sort()).toEqual(['Atorvastatin', 'Lisinopril', 'Metformin']);
  });

  it('parses dose without space before unit (20mg)', () => {
    const r = extractFromNote('Aspirin 81mg daily.');
    const aspirin = r.medications.find((m) => m.name === 'Aspirin')!;
    expect(aspirin.dose).toBe('81 mg');
  });

  it('always labels mode as simulated (never live_ai)', () => {
    const r = extractFromNote('Lisinopril 10 mg daily.');
    expect(r.mode).toBe('simulated');
    expect(r.disclaimer).toMatch(/Simulated/);
    expect(r.disclaimer).not.toMatch(/Live AI/);
  });
});

describe('buildProposal: patient-reported restrictions', () => {
  it('blocks start proposal from patient-reported evidence', () => {
    const p = buildProposal({
      id: 'p-pr',
      extracted: extract({ name: 'Aspirin', dose: '81 mg', route: 'oral', frequency: 'daily' }),
      current: undefined,
      statements: stmts(['Patient reports taking aspirin 81 mg daily.']),
      authority: 'patient_reported',
    });
    expect(p.action).toBe('start');
    expect(p.gate.passed).toBe(false);
    expect(p.abstainReason).toMatch(/patient-reported/i);
  });

  it('allows continue proposal from patient-reported evidence when no change', () => {
    const p = buildProposal({
      id: 'p-pr-cont',
      extracted: extract({ name: 'Aspirin', dose: '81 mg', route: 'oral', frequency: 'daily' }),
      current: med({ name: 'Aspirin', dose: '81 mg', route: 'oral', frequency: 'daily' }),
      statements: stmts(['Patient reports taking aspirin 81 mg daily.']),
      authority: 'patient_reported',
    });
    expect(p.action).toBe('continue');
    expect(p.diff).toEqual([]);
  });
});

describe('buildProposal: evidence gate edge cases', () => {
  it('continue with no evidence fails the gate', () => {
    const p = buildProposal({
      id: 'p-noev',
      extracted: extract({ name: 'Lisinopril', dose: '10 mg', route: 'oral', frequency: 'daily' }),
      current: med(),
      statements: [],
      authority: 'chart_fact',
    });
    expect(p.action).toBe('continue');
    expect(p.gate.passed).toBe(false);
    expect(p.gate.reasons).toContain('No literal evidence supports the continuation.');
  });

  it('change proposal with missing required field abstains', () => {
    const p = buildProposal({
      id: 'p-missing',
      extracted: extract({ name: 'Lisinopril', dose: null, route: 'oral', frequency: 'daily' }),
      current: med({ dose: '10 mg', route: 'oral', frequency: 'daily' }),
      statements: stmts(['Lisinopril route oral daily.']),
      authority: 'chart_fact',
    });
    expect(p.action).toBe('change');
    expect(p.gate.passed).toBe(false);
    expect(p.abstainReason).toMatch(/dose/);
  });

  it('uncertain authority blocks start proposal', () => {
    const p = buildProposal({
      id: 'p-unc',
      extracted: extract({ name: 'Lisinopril', dose: '20 mg', route: 'oral', frequency: 'daily' }),
      current: undefined,
      statements: stmts(['Lisinopril dose is unclear.']),
      authority: 'uncertain',
    });
    expect(p.gate.passed).toBe(false);
    expect(p.gate.reasons).toContain('Source is uncertain or contradictory; resolve before proposing a change.');
  });
});

describe('recordDecision: stop action and revalidation', () => {
  // buildProposal cannot produce action='stop' (extraction never reports a
  // medication as stopped), so construct a stop proposal directly.
  const stopProposal: Proposal = {
    id: 'p-stop',
    medication: 'Aspirin',
    action: 'stop',
    current: [
      { field: 'medication', label: 'Medication', before: 'Aspirin', after: 'Aspirin' },
      { field: 'dose', label: 'Dose', before: '81 mg', after: '81 mg' },
      { field: 'route', label: 'Route', before: 'oral', after: 'oral' },
      { field: 'frequency', label: 'Frequency', before: 'daily', after: 'daily' },
    ],
    proposed: [
      { field: 'medication', label: 'Medication', before: null, after: 'Aspirin' },
      { field: 'dose', label: 'Dose', before: null, after: null },
      { field: 'route', label: 'Route', before: null, after: null },
      { field: 'frequency', label: 'Frequency', before: null, after: null },
    ],
    diff: [
      { field: 'dose', before: '81 mg', after: null },
      { field: 'route', before: 'oral', after: null },
      { field: 'frequency', before: 'daily', after: null },
    ],
    evidence: [{ text: 'Aspirin stopped.', sourceRef: 'encounter-note', start: 0, end: 15 }],
    authority: 'chart_fact',
    uncertainty: 'low',
    gate: { passed: true, reasons: [], abstained: false },
    abstainReason: null,
  };

  it('stop action produces FHIR status stopped', () => {
    const a = recordDecision({ proposal: stopProposal, decision: 'accepted', actor: 'demo-clinician' });
    expect(a.fhirPreview?.status).toBe('stopped');
  });

  it('accepted proposal that was edited but not revalidated produces no FHIR preview', () => {
    const editedFields = [
      { field: 'medication' as const, label: 'Medication', before: null, after: 'Aspirin' },
      { field: 'dose' as const, label: 'Dose', before: null, after: null },
      { field: 'route' as const, label: 'Route', before: null, after: null },
      { field: 'frequency' as const, label: 'Frequency', before: null, after: null },
    ];
    const a = recordDecision({
      proposal: stopProposal,
      decision: 'accepted',
      actor: 'demo-clinician',
      editedFields,
      revalidated: false,
    });
    expect(a.fhirPreview).toBeNull();
  });

  it('accepted proposal that was edited and revalidated produces FHIR preview', () => {
    const editedFields = [
      { field: 'medication' as const, label: 'Medication', before: null, after: 'Aspirin' },
      { field: 'dose' as const, label: 'Dose', before: null, after: '81 mg' },
      { field: 'route' as const, label: 'Route', before: null, after: 'oral' },
      { field: 'frequency' as const, label: 'Frequency', before: null, after: 'daily' },
    ];
    const a = recordDecision({
      proposal: stopProposal,
      decision: 'accepted',
      actor: 'demo-clinician',
      editedFields,
      revalidated: true,
    });
    expect(a.fhirPreview).not.toBeNull();
    expect(a.fhirPreview?.medicationCodeableConcept.text).toBe('Aspirin');
  });
});

describe('evidenceGate: authority restrictions', () => {
  const base = { action: 'start' as const, evidenceCount: 1, proposed: [
    { field: 'medication' as const, label: 'Medication', before: null, after: 'Lisinopril' },
    { field: 'dose' as const, label: 'Dose', before: null, after: '20 mg' },
    { field: 'route' as const, label: 'Route', before: null, after: 'oral' },
    { field: 'frequency' as const, label: 'Frequency', before: null, after: 'daily' },
  ] };

  it('uncertain authority fails gate', () => {
    expect(evidenceGate({ ...base, authority: 'uncertain' }).passed).toBe(false);
  });

  it('patient_reported start fails gate', () => {
    expect(evidenceGate({ ...base, authority: 'patient_reported' }).passed).toBe(false);
  });

  it('chart_fact start passes gate', () => {
    expect(evidenceGate({ ...base, authority: 'chart_fact' }).passed).toBe(true);
  });
});
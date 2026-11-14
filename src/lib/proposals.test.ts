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
import type { ExtractedMedication, Medication, Statement } from './types';

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
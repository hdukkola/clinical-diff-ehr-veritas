import { describe, expect, it } from 'vitest';
import { analyzeSnapshots, compareNoteRegimens, compareSnapshots, normalizeNoteText } from './diff';
import { earlier as fixtureEarlier, later as fixtureLater } from './fixtures';
import type { EvidenceLink, Medication, Snapshot } from './types';

const med = (
  id: string,
  dose: string | null = '10 mg',
  overrides: Partial<Medication> = {},
): Medication => ({
  id,
  name: id,
  dose,
  route: 'oral',
  frequency: 'daily',
  ...overrides,
});

const snapshot = (
  medications: Medication[],
  overrides: Partial<Snapshot> = {},
): Snapshot => ({
  id: 'test',
  source: 'synthetic',
  recordedAt: null,
  medications,
  ...overrides,
});

describe('compareSnapshots', () => {
  it('identifies additions, removals and changes in stable ID order', () => {
    const changes = compareSnapshots(
      snapshot([med('z'), med('b'), med('same')]),
      snapshot([med('a'), med('b', '20 mg'), med('same')]),
    );
    expect(changes.map(c => [c.medicationId, c.kind])).toEqual([
      ['a', 'added'],
      ['b', 'changed'],
      ['z', 'removed'],
    ]);
    expect(changes[1].fields).toEqual([
      { field: 'dose', before: '10 mg', after: '20 mg' },
    ]);
  });

  it('preserves missing values instead of inventing evidence', () => {
    expect(
      compareSnapshots(snapshot([med('a')]), snapshot([med('a', null)]))[0].fields,
    ).toEqual([{ field: 'dose', before: '10 mg', after: null }]);
  });

  it('returns no changes for identical snapshots', () => {
    expect(compareSnapshots(snapshot([med('a')]), snapshot([med('a')]))).toEqual([]);
  });

  it('rejects duplicate identities in either snapshot', () => {
    expect(() =>
      compareSnapshots(snapshot([med('a'), med('a')]), snapshot([])),
    ).toThrow('Duplicate medication ID');
    expect(() =>
      compareSnapshots(snapshot([]), snapshot([med('a'), med('a')])),
    ).toThrow('Duplicate medication ID');
  });

  it('preserves backward compatibility with existing fixtures without fabricating provenance', () => {
    const changes = compareSnapshots(fixtureEarlier, fixtureLater);

    expect(changes.map(c => [c.medicationId, c.kind])).toEqual([
      ['m1', 'changed'],
      ['m2', 'changed'],
      ['m3', 'removed'],
      ['m4', 'added'],
    ]);

    const lisinopril = changes[0];
    expect(lisinopril.fields).toEqual([
      { field: 'dose', before: '10 mg', after: '20 mg' },
    ]);
    expect(lisinopril.provenance?.earlier.status).toBe('unverified');
    expect(lisinopril.provenance?.later.status).toBe('unverified');
    expect(lisinopril.provenance?.overallStatus).toBe('unverified');
    expect(lisinopril.evidenceLinks).toHaveLength(2);
    expect(lisinopril.evidenceLinks?.map(l => l.resolutionStatus)).toEqual([
      'partial',
      'partial',
    ]);
    expect(lisinopril.provenanceFlags).toContain('unverified_provenance');
    expect(lisinopril.provenanceFlags).toContain('missing_supporting_evidence');

    const metformin = changes[1];
    expect(metformin.fields).toEqual([
      { field: 'frequency', before: 'twice daily', after: null },
    ]);
    expect(metformin.provenanceFlags).toContain('undocumented_field');
    expect(metformin.provenanceGaps).toContainEqual(
      expect.objectContaining({
        side: 'later',
        scope: 'field',
        field: 'frequency',
        reason: 'undocumented_field',
      }),
    );

    const aspirin = changes[2];
    expect(aspirin.provenance?.earlier.present).toBe(true);
    expect(aspirin.provenance?.later.present).toBe(false);

    const atorvastatin = changes[3];
    expect(atorvastatin.provenance?.earlier.present).toBe(false);
    expect(atorvastatin.provenance?.later.present).toBe(true);
  });

  it('supports multiple structured evidence links with spans, excerpts, and resolution statuses', () => {
    const noteLink: EvidenceLink = {
      id: 'ev-note-1',
      noteId: 'note-dc-100',
      sourceLabel: 'Discharge summary note',
      sourceKind: 'discharge_summary',
      section: 'Discharge Medications',
      field: 'dose',
      excerpt: 'Increase Lisinopril to 20 mg oral daily.',
      span: { start: 120, end: 159, line: 8, column: 3 },
      recordedAt: '2026-10-15T10:30:00Z',
    };
    const pharmacyLink: EvidenceLink = {
      id: 'ev-rx-2',
      sourceId: 'rx-fill-902',
      sourceLabel: 'Outpatient pharmacy fill history',
      sourceKind: 'pharmacy_fill',
      excerpt: 'Dispensed Lisinopril 20 mg #30',
      recordedAt: '2026-10-16',
    };
    const unavailableLink: EvidenceLink = {
      id: 'ev-ext-3',
      sourceId: 'hie-record-77',
      sourceLabel: 'External HIE record',
      sourceKind: 'external_record',
      resolutionStatus: 'unavailable',
      note: 'External repository timed out during retrospective capture.',
    };

    const earlier = snapshot(
      [
        med('m1', '10 mg', {
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-note-0',
              noteId: 'note-clinic-1',
              sourceKind: 'clinical_note',
              excerpt: 'Continue Lisinopril 10 mg daily.',
              span: { start: 10, end: 42 },
            },
          ],
        }),
      ],
      {
        id: 's-earlier',
        source: 'Primary care clinic note',
        sourceKind: 'clinical_note',
        recordedAt: '2026-10-01',
      },
    );

    const later = snapshot(
      [
        med('m1', '20 mg', {
          evidenceLinks: [noteLink, pharmacyLink, unavailableLink],
        }),
      ],
      {
        id: 's-later',
        source: 'Hospital discharge summary',
        sourceKind: 'discharge_summary',
        recordedAt: '2026-10-15',
      },
    );

    const [change] = compareSnapshots(earlier, later);
    expect(change.provenance?.overallStatus).toBe('documented');
    expect(change.provenance?.earlier.status).toBe('documented');
    expect(change.provenance?.later.status).toBe('documented');
    expect(change.evidenceLinks).toHaveLength(4);

    const resolvedLinks = change.evidenceLinks!.filter(
      l => l.resolutionStatus === 'resolved',
    );
    expect(resolvedLinks).toHaveLength(3);
    expect(resolvedLinks[1]).toMatchObject({
      id: 'ev-note-1',
      noteId: 'note-dc-100',
      section: 'Discharge Medications',
      field: 'dose',
      span: { start: 120, end: 159, line: 8, column: 3 },
      resolutionStatus: 'resolved',
      provenanceStatus: 'documented',
      side: 'later',
    });

    const unavailable = change.evidenceLinks!.find(l => l.id === 'ev-ext-3');
    expect(unavailable?.resolutionStatus).toBe('unavailable');
    expect(change.provenanceFlags).toContain('unresolved_evidence_link');
    expect(change.provenanceFlags).not.toContain('missing_supporting_evidence');
  });

  it('merges snapshot-level evidence links targeted to a medication or snapshot-wide', () => {
    const earlier = snapshot([med('m1', '10 mg')], {
      id: 's1',
      source: 'Clinic encounter',
      recordedAt: '2026-10-01',
      evidenceLinks: [
        {
          id: 'snap-all',
          noteId: 'note-1',
          sourceKind: 'clinical_note',
          excerpt: 'Reviewed outpatient medication list.',
        },
        {
          id: 'snap-other-med',
          medicationId: 'm99',
          noteId: 'note-99',
          sourceKind: 'clinical_note',
          excerpt: 'Unrelated medication note.',
        },
      ],
    });
    const later = snapshot([med('m1', '20 mg')], {
      id: 's2',
      source: 'Discharge list',
      recordedAt: '2026-10-15',
      evidenceLinks: [
        {
          id: 'snap-m1',
          medicationId: 'm1',
          noteId: 'note-2',
          sourceKind: 'discharge_summary',
          excerpt: 'Lisinopril titrated to 20 mg.',
        },
      ],
    });

    const [change] = compareSnapshots(earlier, later);
    const linkIds = change.evidenceLinks?.map(l => l.id);
    expect(linkIds).toEqual(['snap-all', 'snap-m1']);
    expect(change.provenance?.overallStatus).toBe('documented');
  });

  it('downgrades evidence links with blank text or invalid spans instead of claiming resolved', () => {
    const earlier = snapshot([med('m1', '10 mg')], {
      id: 's1',
      source: 'Clinic note',
      recordedAt: '2026-10-01',
    });
    const later = snapshot(
      [
        med('m1', '20 mg', {
          evidenceLinks: [
            {
              id: 'bad-span',
              noteId: 'note-1',
              sourceLabel: '   ',
              excerpt: '   ',
              span: { start: 25, end: 10 },
              resolutionStatus: 'resolved',
            },
            {
              id: 'empty-link',
              noteId: '   ',
              sourceId: '   ',
              sourceLabel: '   ',
              excerpt: null,
            },
          ],
        }),
      ],
      {
        id: 's2',
        source: 'Discharge note',
        recordedAt: '2026-10-15',
      },
    );

    const [change] = compareSnapshots(earlier, later);
    const badSpan = change.evidenceLinks?.find(l => l.id === 'bad-span');
    const emptyLink = change.evidenceLinks?.find(l => l.id === 'empty-link');

    expect(badSpan?.resolutionStatus).toBe('partial');
    expect(badSpan?.span).toBeNull();
    expect(emptyLink?.resolutionStatus).toBe('unresolved');
    expect(emptyLink?.provenanceStatus).toBe('unknown');

    expect(change.provenanceFlags).toContain('blank_source_attribution');
    expect(change.provenanceFlags).toContain('unresolved_evidence_link');
    expect(change.provenanceFlags).toContain('missing_supporting_evidence');
    expect(change.provenanceGaps).toContainEqual(
      expect.objectContaining({
        side: 'later',
        scope: 'evidence',
        reason: 'invalid_evidence_span',
        evidenceId: 'bad-span',
      }),
    );
  });

  it('explicitly distinguishes documented, patient_reported, unverified, and unknown provenance states', () => {
    const earlier = snapshot(
      [
        med('m1', '10 mg', { provenance: 'documented' }),
        med('m2', '200 mg', { provenance: 'patient_reported' }),
        med('m3', '5 mg', { provenance: 'unverified' }),
        med('m4', '50 mg', { provenance: 'unknown' }),
      ],
      {
        id: 's1',
        source: 'Intake reconciliation',
        recordedAt: '2026-10-01',
      },
    );
    const later = snapshot(
      [
        med('m1', '20 mg', { provenance: 'documented' }),
        med('m2', '400 mg', { provenance: 'patient_reported' }),
        med('m3', '10 mg', { provenance: 'unverified' }),
        med('m4', '100 mg', { provenance: 'unknown' }),
      ],
      {
        id: 's2',
        source: 'Follow-up reconciliation',
        recordedAt: '2026-10-10',
      },
    );

    const changes = compareSnapshots(earlier, later);
    expect(changes.map(c => c.provenance?.overallStatus)).toEqual([
      'documented',
      'patient_reported',
      'unverified',
      'unknown',
    ]);

    expect(changes[1].provenance?.hasPatientReportedProvenance).toBe(true);
    expect(changes[1].provenanceFlags).toContain('patient_reported_only');
    expect(changes[2].provenance?.hasUnverifiedProvenance).toBe(true);
    expect(changes[2].provenanceFlags).toContain('unverified_provenance');
    expect(changes[3].provenance?.hasUnknownProvenance).toBe(true);
    expect(changes[3].provenanceFlags).toContain('unknown_provenance');
  });

  it('abstains as unknown when source attribution is missing, blank, whitespace-only, or unknown-token', () => {
    const earlier = snapshot([med('m1', '10 mg')], {
      id: 's1',
      source: '   \u200B  ',
      recordedAt: '   ',
      provenance: 'documented',
    });
    const later = snapshot([med('m1', '20 mg')], {
      id: 's2',
      source: 'Unknown',
      recordedAt: null,
      author: '  ',
    });

    const [change] = compareSnapshots(earlier, later);
    expect(change.provenance?.earlier.status).toBe('unknown');
    expect(change.provenance?.later.status).toBe('unknown');
    expect(change.provenance?.overallStatus).toBe('unknown');
    expect(change.provenance?.hasUnknownProvenance).toBe(true);

    expect(change.provenanceFlags).toContain('unknown_provenance');
    expect(change.provenanceFlags).toContain('blank_source_attribution');
    expect(change.provenanceFlags).toContain('missing_source_attribution');
    expect(change.provenanceFlags).toContain('missing_timestamp');
  });

  it('abstains as unknown and flags ambiguity for conflicting or ambiguous source attribution', () => {
    const earlier = snapshot(
      [
        med('m1', '10 mg', {
          provenance: {
            status: 'documented',
            sourceKind: 'patient_report',
          },
        }),
        med('m2', '50 mg', {
          evidenceLinks: [
            {
              id: 'link-doc',
              noteId: 'n1',
              sourceKind: 'clinical_note',
              provenanceStatus: 'documented',
              excerpt: 'Taking 50 mg daily.',
            },
            {
              id: 'link-pt',
              sourceLabel: 'Patient intake form',
              sourceKind: 'patient_report',
              provenanceStatus: 'patient_reported',
              excerpt: 'Patient states 50 mg.',
            },
          ],
        }),
      ],
      {
        id: 's1',
        source: 'Outpatient chart',
        recordedAt: '2026-10-01',
      },
    );
    const later = snapshot(
      [
        med('m1', '20 mg', {
          provenance: {
            ambiguous: true,
            conflictingSources: ['Discharge summary', 'Patient report'],
          },
        }),
        med('m2', '100 mg', {
          provenance: {
            sourceLabel: 'Clinic note or patient report (unclear)',
          },
        }),
      ],
      {
        id: 's2',
        source: 'Discharge reconciliation',
        recordedAt: '2026-10-15',
      },
    );

    const [m1Change, m2Change] = compareSnapshots(earlier, later);

    expect(m1Change.provenance?.earlier.status).toBe('unknown');
    expect(m1Change.provenance?.earlier.ambiguous).toBe(true);
    expect(m1Change.provenance?.later.status).toBe('unknown');
    expect(m1Change.provenance?.later.ambiguous).toBe(true);
    expect(m1Change.provenance?.hasAmbiguousProvenance).toBe(true);
    expect(m1Change.provenanceFlags).toContain('ambiguous_source_attribution');
    expect(m1Change.provenanceFlags).toContain('conflicting_provenance');

    expect(m2Change.provenance?.earlier.status).toBe('unknown');
    expect(m2Change.provenance?.earlier.ambiguous).toBe(true);
    expect(m2Change.provenance?.later.status).toBe('unknown');
    expect(m2Change.provenance?.later.ambiguous).toBe(true);
    expect(m2Change.provenanceGaps).toContainEqual(
      expect.objectContaining({
        side: 'earlier',
        scope: 'evidence',
        reason: 'conflicting_evidence_provenance',
      }),
    );
  });

  it('handles multi-field changes and flags blank/whitespace-only medication fields', () => {
    const earlier = snapshot(
      [
        med('m1', '10 mg', {
          name: 'Lisinopril',
          route: 'oral',
          frequency: 'daily',
        }),
      ],
      { id: 's1', source: 'Clinic list', recordedAt: '2026-10-01' },
    );
    const later = snapshot(
      [
        med('m1', '   ', {
          name: 'Lisinopril-HCTZ',
          route: '',
          frequency: 'twice daily',
        }),
      ],
      { id: 's2', source: 'Discharge list', recordedAt: '2026-10-15' },
    );

    const [change] = compareSnapshots(earlier, later);
    expect(change.kind).toBe('changed');
    expect(change.fields).toEqual([
      { field: 'name', before: 'Lisinopril', after: 'Lisinopril-HCTZ' },
      { field: 'dose', before: '10 mg', after: '   ' },
      { field: 'route', before: 'oral', after: '' },
      { field: 'frequency', before: 'daily', after: 'twice daily' },
    ]);
    expect(change.provenanceFlags).toContain('blank_field_value');
    expect(change.provenanceGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          side: 'later',
          scope: 'field',
          field: 'dose',
          reason: 'blank_field_value',
        }),
        expect.objectContaining({
          side: 'later',
          scope: 'field',
          field: 'route',
          reason: 'blank_field_value',
        }),
      ]),
    );
  });
});

describe('analyzeSnapshots', () => {
  it('surfaces snapshot-level provenance gaps even when there are no medication changes', () => {
    const earlier = snapshot([med('m1', '10 mg')], {
      id: 's1',
      source: 'Patient-reported intake',
      sourceKind: 'patient_report',
      recordedAt: '2026-10-01',
    });
    const later = snapshot([med('m1', '10 mg')], {
      id: 's2',
      source: '   ',
      recordedAt: null,
    });

    const report = analyzeSnapshots(earlier, later);
    expect(report.changes).toEqual([]);
    expect(report.earlierProvenance.status).toBe('patient_reported');
    expect(report.laterProvenance.status).toBe('unknown');
    expect(report.provenanceFlags).toEqual(
      expect.arrayContaining([
        'patient_reported_only',
        'unknown_provenance',
        'blank_source_attribution',
        'missing_source_attribution',
        'missing_timestamp',
      ]),
    );
  });
});

describe('compareNoteRegimens & normalizeNoteText', () => {
  it('normalizes literal <br> and <br/> markup to newlines', () => {
    expect(normalizeNoteText('Line 1<br>Line 2<br/>Line 3<br />Line 4')).toBe(
      'Line 1\nLine 2\nLine 3\nLine 4',
    );
  });

  it('surfaces amoxicillin frequency and duration changes', () => {
    const report = compareNoteRegimens(
      'put him on amoxicillin 500 mg twice daily n he is takin tylenol for the fever.',
      'Plan: Start Amoxicillin 500 mg three times daily for seven days. Added Albuterol HFA 90 mcg inhalation every 4-6 hours as needed.',
    );

    const amox = report.items.find(i => i.medicationName === 'Amoxicillin');
    expect(amox).toBeDefined();
    expect(amox?.status).toBe('changed');
    expect(amox?.changeCategories).toEqual(['Frequency changed', 'Duration changed']);
    expect(amox?.earlierRegimen?.dose).toBe('500 mg');
    expect(amox?.earlierRegimen?.frequency).toBe('twice daily');
    expect(amox?.laterRegimen?.frequency).toBe('three times daily');
    expect(amox?.laterRegimen?.duration).toBe('7 days');

    const tylenol = report.items.find(i => i.medicationName === 'Tylenol');
    expect(tylenol?.status).toBe('earlier_only');
    expect(tylenol?.statusLabel).toBe('Mentioned only in earlier note');
    expect(tylenol?.absenceNote).toBe('Not mentioned in later note (not explicitly discontinued)');

    const albuterol = report.items.find(i => i.medicationName === 'Albuterol HFA');
    expect(albuterol?.status).toBe('later_only');
    expect(albuterol?.statusLabel).toBe('Mentioned only in later note');
  });

  it('detects dose, route, and explicit clinical discontinuation', () => {
    const report = compareNoteRegimens(
      'Lisinopril 10 mg PO daily. Acebutolol 200 mg PO BID.',
      'Lisinopril 20 mg IV daily. Acebutolol no longer indicated and stopped.',
    );

    const lisinopril = report.items.find(i => i.medicationName === 'Lisinopril');
    expect(lisinopril?.status).toBe('changed');
    expect(lisinopril?.changeCategories).toEqual(['Dose changed', 'Route changed']);

    const acebutolol = report.items.find(i => i.medicationName === 'Acebutolol');
    expect(acebutolol?.status).toBe('discontinued');
    expect(acebutolol?.statusLabel).toBe('Clinically discontinued');
    expect(acebutolol?.changeCategories).toEqual(['Clinically discontinued']);
  });
});

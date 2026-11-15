import { describe, expect, it } from 'vitest';
import { analyzeSnapshots, compareSnapshots } from '@/lib/diff';
import { getSyntheticScenario, syntheticScenarios } from '@/lib/fixtures';
import type {
  EvidenceLink,
  EvidenceSourceKind,
  Medication,
  ProvenanceStatus,
  Snapshot,
  TextSpan,
} from '@/lib/types';
import { SeededRng } from './prng';

const DRUG_POOL = [
  'Lisinopril',
  'Metformin',
  'Atorvastatin',
  'Aspirin',
  'Furosemide',
  'Carvedilol',
  'Levothyroxine',
  'Apixaban',
  'Warfarin',
  'Gabapentin',
  'Sertraline',
  'Omeprazole',
  'Amlodipine',
  'Empagliflozin',
  'Potassium Chloride',
  'Insulin Glargine',
  'Albuterol Sulfate',
  'Trazodone',
  'Sumatriptan',
  'Acetaminophen',
] as const;

const DOSE_POOL = ['5 mg', '10 mg', '20 mg', '50 mcg', '100 mg', '500 mg', '81 mg', null] as const;
const ROUTE_POOL = ['oral', 'subcutaneous', 'inhalation', 'intranasal', 'intravenous', null] as const;
const FREQ_POOL = [
  'daily',
  'twice daily',
  'at bedtime',
  'every 6 hours as needed',
  'weekly',
  null,
] as const;

const PLACEHOLDER_TOKENS = [
  'Unknown',
  'unknown',
  'UNK',
  'N/A',
  'n/a',
  'NA',
  'None',
  'null',
  'undefined',
  'unspecified',
  'missing',
  'TBD',
  'tbd',
  '?',
  '-',
  '--',
  'not documented',
  'Not Specified',
  'source unknown',
  'unknown source',
  'no source',
  'unattributed',
] as const;

const CLINICAL_KINDS: EvidenceSourceKind[] = [
  'clinical_note',
  'discharge_summary',
  'pharmacy_fill',
  'external_record',
];

function makeMed(id: string, rng: SeededRng, overrides: Partial<Medication> = {}): Medication {
  return {
    id,
    name: rng.pick(DRUG_POOL),
    dose: rng.pick(DOSE_POOL),
    route: rng.pick(ROUTE_POOL),
    frequency: rng.pick(FREQ_POOL),
    ...overrides,
  };
}

function makeSnapshot(
  id: string,
  medications: Medication[],
  overrides: Partial<Snapshot> = {},
): Snapshot {
  return {
    id,
    source: 'Synthetic clinical record',
    recordedAt: '2026-10-15',
    medications,
    ...overrides,
  };
}

describe('Core Diff, Evidence & Provenance Simulation (2,500 cases)', () => {
  // ---------------------------------------------------------------------------
  // Group 1: 100 cases — All 10 syntheticScenarios x 10 permutations
  // ---------------------------------------------------------------------------
  const scenarioCases: { caseId: number; scenarioIdx: number; mode: number }[] = [];
  for (let s = 0; s < 10; s++) {
    for (let m = 0; m < 10; m++) {
      scenarioCases.push({ caseId: s * 10 + m + 1, scenarioIdx: s, mode: m });
    }
  }

  it.each(scenarioCases)(
    'scenario-perm #$caseId (scenario=$scenarioIdx mode=$mode)',
    ({ scenarioIdx, mode }) => {
      const scenario = syntheticScenarios[scenarioIdx];
      expect(scenario).toBeDefined();
      expect(getSyntheticScenario(scenario.id)).toBe(scenario);

      if (mode === 0) {
        const changes = compareSnapshots(scenario.earlier, scenario.later);
        const report = analyzeSnapshots(scenario.earlier, scenario.later);
        expect(report.changes).toEqual(changes);
        for (const ch of changes) {
          expect(ch.evidenceLinks?.length).toBeGreaterThanOrEqual(1);
          expect(ch.provenance).toBeDefined();
        }
      } else if (mode === 1) {
        // Reversed snapshots invert added <-> removed and before <-> after
        const fwd = compareSnapshots(scenario.earlier, scenario.later);
        const rev = compareSnapshots(scenario.later, scenario.earlier);
        expect(rev.length).toBe(fwd.length);
        for (let i = 0; i < fwd.length; i++) {
          expect(rev[i].medicationId).toBe(fwd[i].medicationId);
          if (fwd[i].kind === 'added') expect(rev[i].kind).toBe('removed');
          else if (fwd[i].kind === 'removed') expect(rev[i].kind).toBe('added');
          else expect(rev[i].kind).toBe('changed');
        }
      } else if (mode === 2) {
        expect(compareSnapshots(scenario.earlier, scenario.earlier)).toEqual([]);
      } else if (mode === 3) {
        expect(compareSnapshots(scenario.later, scenario.later)).toEqual([]);
      } else if (mode === 4) {
        // Shuffled medication order preserves identical sorted diff output
        const rng = new SeededRng(1000 + scenarioIdx * 10 + mode);
        const eShuf = {
          ...scenario.earlier,
          medications: rng.shuffled(scenario.earlier.medications),
        };
        const lShuf = {
          ...scenario.later,
          medications: rng.shuffled(scenario.later.medications),
        };
        expect(compareSnapshots(eShuf, lShuf)).toEqual(
          compareSnapshots(scenario.earlier, scenario.later),
        );
      } else if (mode === 5) {
        // Clinical note provenance on both snapshots yields documented overall status when both present
        const eDoc: Snapshot = {
          ...scenario.earlier,
          sourceKind: 'clinical_note',
          recordedAt: '2026-10-01',
          provenance: { status: 'documented', verified: true },
        };
        const lDoc: Snapshot = {
          ...scenario.later,
          sourceKind: 'discharge_summary',
          recordedAt: '2026-10-15',
          provenance: { status: 'documented', verified: true },
        };
        const report = analyzeSnapshots(eDoc, lDoc);
        expect(report.earlierProvenance.status).toBe('documented');
        expect(report.laterProvenance.status).toBe('documented');
        for (const ch of report.changes) {
          expect(ch.provenance?.overallStatus).toBe('documented');
        }
      } else if (mode === 6) {
        // Patient-reported snapshots cannot be upgraded to documented
        const ePat: Snapshot = {
          ...scenario.earlier,
          sourceKind: 'patient_report',
          provenance: 'patient_reported',
        };
        const lPat: Snapshot = {
          ...scenario.later,
          sourceKind: 'patient_report',
          provenance: 'patient_reported',
        };
        const report = analyzeSnapshots(ePat, lPat);
        for (const ch of report.changes) {
          expect(ch.provenance?.overallStatus).toBe('patient_reported');
          expect(ch.provenanceFlags).toContain('patient_reported_only');
        }
      } else if (mode === 7) {
        // Unknown provenance on earlier propagates to overallStatus === 'unknown' for present items
        const eUnk: Snapshot = { ...scenario.earlier, provenance: 'unknown' };
        const report = analyzeSnapshots(eUnk, scenario.later);
        expect(report.earlierProvenance.status).toBe('unknown');
        for (const ch of report.changes) {
          if (ch.provenance?.earlier.present) {
            expect(ch.provenance.overallStatus).toBe('unknown');
          }
        }
      } else if (mode === 8) {
        // Resolved evidence links eliminate missing_supporting_evidence on documented snapshots
        const mkLinks = (snap: Snapshot): Snapshot => ({
          ...snap,
          sourceKind: 'clinical_note',
          recordedAt: snap.recordedAt ?? '2026-10-10',
          medications: snap.medications.map((med, idx) => ({
            ...med,
            provenance: 'documented',
            evidenceLinks: [
              {
                id: `ev-${snap.id}-${idx}`,
                noteId: `note-${snap.id}`,
                sourceKind: 'clinical_note',
                excerpt: `Verified entry for ${med.name}`,
                span: { start: 0, end: 12 },
              },
            ],
          })),
        });
        const report = analyzeSnapshots(mkLinks(scenario.earlier), mkLinks(scenario.later));
        for (const ch of report.changes) {
          expect(ch.provenance?.overallStatus).toBe('documented');
          expect(ch.evidenceLinks?.every(l => l.resolutionStatus === 'resolved')).toBe(true);
          expect(ch.provenanceFlags).not.toContain('missing_supporting_evidence');
        }
      } else {
        // Snapshot-level links with medicationId filtering only attach to matching meds
        const med = scenario.later.medications[0];
        if (med) {
          const snapLink: EvidenceLink = {
            id: 'snap-target',
            noteId: 'note-snap',
            medicationId: med.id,
            sourceKind: 'clinical_note',
            excerpt: `Target ${med.name}`,
            span: { start: 1, end: 8 },
          };
          const lWithLink: Snapshot = { ...scenario.later, evidenceLinks: [snapLink] };
          const changes = compareSnapshots(scenario.earlier, lWithLink);
          for (const ch of changes) {
            const hasTargeted = ch.evidenceLinks?.some(l => l.id === 'snap-target') ?? false;
            if (ch.medicationId === med.id) expect(hasTargeted).toBe(true);
            else expect(hasTargeted).toBe(false);
          }
        } else {
          expect(compareSnapshots(scenario.earlier, scenario.later)).toEqual([]);
        }
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Group 2: 700 cases — Randomized polypharmacy transitions
  // ---------------------------------------------------------------------------
  const polyCases = Array.from({ length: 700 }, (_, i) => ({ caseId: i + 1 }));

  it.each(polyCases)('polypharmacy-transition #$caseId', ({ caseId }) => {
    const rng = new SeededRng(20000 + caseId);
    const totalIds = rng.int(2, 24);
    const allIds = Array.from({ length: totalIds }, (_, k) => `med-${String(k).padStart(3, '0')}`);

    const earlierMeds: Medication[] = [];
    const laterMeds: Medication[] = [];
    const expected = new Map<string, 'added' | 'removed' | 'changed'>();

    for (const id of allIds) {
      const inEarlier = rng.chance(0.7);
      const inLater = rng.chance(0.7);
      if (!inEarlier && !inLater) continue;
      const base = makeMed(id, rng);
      if (inEarlier && !inLater) {
        earlierMeds.push(base);
        expected.set(id, 'removed');
      } else if (!inEarlier && inLater) {
        laterMeds.push(base);
        expected.set(id, 'added');
      } else {
        earlierMeds.push(base);
        if (rng.chance(0.55)) {
          const mutated: Medication = {
            ...base,
            name: rng.chance(0.15) ? `${base.name} XR` : base.name,
            dose: rng.chance(0.5) ? rng.pick(DOSE_POOL) : base.dose,
            route: rng.chance(0.25) ? rng.pick(ROUTE_POOL) : base.route,
            frequency: rng.chance(0.45) ? rng.pick(FREQ_POOL) : base.frequency,
          };
          laterMeds.push(mutated);
          const diffCount = (['name', 'dose', 'route', 'frequency'] as const).filter(
            f => base[f] !== mutated[f],
          ).length;
          if (diffCount > 0) expected.set(id, 'changed');
        } else {
          laterMeds.push({ ...base });
        }
      }
    }

    const earlier = makeSnapshot(`e-${caseId}`, rng.shuffled(earlierMeds), {
      sourceKind: rng.pick(['snapshot', 'clinical_note', 'discharge_summary', 'patient_report']),
    });
    const later = makeSnapshot(`l-${caseId}`, rng.shuffled(laterMeds), {
      sourceKind: rng.pick(['snapshot', 'clinical_note', 'discharge_summary', 'pharmacy_fill']),
    });

    const report = analyzeSnapshots(earlier, later);
    const sortedExpectedIds = [...expected.keys()].sort();
    expect(report.changes.map(c => c.medicationId)).toEqual(sortedExpectedIds);

    for (const change of report.changes) {
      expect(change.kind).toBe(expected.get(change.medicationId));
      if (change.kind === 'changed') {
        expect(change.fields.length).toBeGreaterThanOrEqual(1);
        for (const f of change.fields) {
          expect(f.before).not.toBe(f.after);
        }
      } else {
        expect(change.fields).toEqual([]);
      }
      // No-fabrication: absent side never marked present
      if (change.kind === 'added') {
        expect(change.provenance?.earlier.present).toBe(false);
        expect(change.provenance?.later.present).toBe(true);
      } else if (change.kind === 'removed') {
        expect(change.provenance?.earlier.present).toBe(true);
        expect(change.provenance?.later.present).toBe(false);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Group 3: 250 cases — Empty / identical / single-sided snapshots & field boundaries
  // ---------------------------------------------------------------------------
  const emptyIdenticalCases = Array.from({ length: 250 }, (_, i) => ({ caseId: i + 1 }));

  it.each(emptyIdenticalCases)('empty-identical-single-sided #$caseId', ({ caseId }) => {
    const rng = new SeededRng(30000 + caseId);
    const mode = caseId % 5;

    if (mode === 0) {
      // Both empty
      const e = makeSnapshot(`ee-${caseId}`, [], { recordedAt: null });
      const l = makeSnapshot(`el-${caseId}`, [], { recordedAt: '2026-10-20' });
      const report = analyzeSnapshots(e, l);
      expect(report.changes).toEqual([]);
      expect(report.earlierProvenance.present).toBe(true);
      expect(report.earlierProvenance.gaps.some(g => g.reason === 'missing_timestamp')).toBe(true);
      expect(report.laterProvenance.gaps.some(g => g.reason === 'missing_timestamp')).toBe(false);
    } else if (mode === 1) {
      // Identical meds across different snapshot metadata -> 0 changes
      const count = rng.int(1, 8);
      const meds = Array.from({ length: count }, (_, idx) => makeMed(`id-${idx}`, rng));
      const e = makeSnapshot(`ie-${caseId}`, meds, { source: 'Outpatient A', recordedAt: '2026-09-01' });
      const l = makeSnapshot(`il-${caseId}`, meds.map(m => ({ ...m })), {
        source: 'Clinic B',
        recordedAt: '2026-10-01',
      });
      expect(compareSnapshots(e, l)).toEqual([]);
    } else if (mode === 2) {
      // Earlier empty, later populated -> all added
      const count = rng.int(1, 10);
      const meds = Array.from({ length: count }, (_, idx) => makeMed(`add-${idx}`, rng));
      const changes = compareSnapshots(makeSnapshot('e', []), makeSnapshot('l', meds));
      expect(changes.length).toBe(count);
      expect(changes.every(c => c.kind === 'added')).toBe(true);
    } else if (mode === 3) {
      // Earlier populated, later empty -> all removed
      const count = rng.int(1, 10);
      const meds = Array.from({ length: count }, (_, idx) => makeMed(`rem-${idx}`, rng));
      const changes = compareSnapshots(makeSnapshot('e', meds), makeSnapshot('l', []));
      expect(changes.length).toBe(count);
      expect(changes.every(c => c.kind === 'removed')).toBe(true);
    } else {
      // Single-field change across each of the 4 fields
      const field = (['name', 'dose', 'route', 'frequency'] as const)[caseId % 4];
      const base = makeMed('single', rng, {
        name: 'Aspirin',
        dose: '81 mg',
        route: 'oral',
        frequency: 'daily',
      });
      const updated = { ...base, [field]: `${base[field] ?? 'none'}-updated` };
      const changes = compareSnapshots(makeSnapshot('e', [base]), makeSnapshot('l', [updated]));
      expect(changes).toHaveLength(1);
      expect(changes[0].kind).toBe('changed');
      expect(changes[0].fields).toEqual([
        { field, before: base[field], after: updated[field] },
      ]);
    }
  });

  // ---------------------------------------------------------------------------
  // Group 4: 200 cases — Duplicate medication IDs (must throw)
  // ---------------------------------------------------------------------------
  const duplicateIdCases = Array.from({ length: 200 }, (_, i) => ({ caseId: i + 1 }));

  it.each(duplicateIdCases)('duplicate-med-id-throws #$caseId', ({ caseId }) => {
    const rng = new SeededRng(40000 + caseId);
    const dupId = caseId % 4 === 0 ? 'dup-\u00e9' : caseId % 4 === 1 ? 'dup-💊' : `dup-${caseId}`;
    const side = caseId % 3;
    const fillerCount = rng.int(0, 8);
    const fillers = Array.from({ length: fillerCount }, (_, k) => makeMed(`ok-${k}`, rng));
    const dupList = rng.shuffled([
      ...fillers,
      makeMed(dupId, rng, { name: 'DrugA' }),
      makeMed(dupId, rng, { name: 'DrugB' }),
    ]);

    const earlier = makeSnapshot('snap-e', side === 0 || side === 2 ? dupList : fillers);
    const later = makeSnapshot('snap-l', side === 1 || side === 2 ? dupList : fillers);
    const expectedSnap = side === 0 || side === 2 ? 'snap-e' : 'snap-l';

    expect(() => compareSnapshots(earlier, later)).toThrow(
      `Duplicate medication ID in snapshot ${expectedSnap}`,
    );
    expect(() => analyzeSnapshots(earlier, later)).toThrow(
      `Duplicate medication ID in snapshot ${expectedSnap}`,
    );
  });

  // ---------------------------------------------------------------------------
  // Group 5: 350 cases — Unicode, combining marks, Turkish İ/ı, astral, zero-width
  // ---------------------------------------------------------------------------
  const unicodeCases = Array.from({ length: 350 }, (_, i) => ({ caseId: i + 1 }));

  it.each(unicodeCases)('unicode-combining-turkish-astral-zw #$caseId', ({ caseId }) => {
    const rng = new SeededRng(50000 + caseId);
    const variant = caseId % 7;

    if (variant === 0) {
      // NFC vs NFD in medication name is detected as exact string difference
      const e = makeSnapshot('u-e', [
        makeMed('u1', rng, { name: 'Caf\u00e9ine', dose: '100 mg', route: 'oral', frequency: 'daily' }),
      ]);
      const l = makeSnapshot('u-l', [
        makeMed('u1', rng, { name: 'Cafe\u0301ine', dose: '100 mg', route: 'oral', frequency: 'daily' }),
      ]);
      const changes = compareSnapshots(e, l);
      expect(changes).toHaveLength(1);
      expect(changes[0].fields).toContainEqual({
        field: 'name',
        before: 'Caf\u00e9ine',
        after: 'Cafe\u0301ine',
      });
    } else if (variant === 1) {
      // Turkish İ / ı sensitivity in medication fields and attribution
      const e = makeSnapshot(
        'tr-e',
        [makeMed('tr1', rng, { name: 'Aspir\u0130n', dose: '81 mg', route: 'oral', frequency: 'daily' })],
        { source: '\u0130stanbul Clinic' },
      );
      const l = makeSnapshot(
        'tr-l',
        [makeMed('tr1', rng, { name: 'Aspir\u0131n', dose: '81 mg', route: 'oral', frequency: 'daily' })],
        { source: 'Istanbul Clinic' },
      );
      const report = analyzeSnapshots(e, l);
      expect(report.changes).toHaveLength(1);
      expect(report.changes[0].fields[0]).toEqual({
        field: 'name',
        before: 'Aspir\u0130n',
        after: 'Aspir\u0131n',
      });
      expect(report.earlierProvenance.sourceLabel).toBe('\u0130stanbul Clinic');
    } else if (variant === 2) {
      // Astral emoji & subscripts in medication data
      const e = makeSnapshot('ast-e', [
        makeMed('a1', rng, {
          name: 'Vitamin D\u2083 \ud83d\udc8a',
          dose: '50 \u00b5g',
          route: 'oral',
          frequency: 'daily',
        }),
      ]);
      const l = makeSnapshot('ast-l', [
        makeMed('a1', rng, {
          name: 'Vitamin D3 \ud83e\uddec',
          dose: '50 mcg',
          route: 'oral',
          frequency: 'daily',
        }),
      ]);
      const changes = compareSnapshots(e, l);
      expect(changes).toHaveLength(1);
      expect(changes[0].fields.map(f => f.field)).toEqual(['name', 'dose']);
    } else if (variant === 3) {
      // Zero-width characters only in source/author/recordedAt trigger blank_source_attribution & missing_timestamp
      const zw = rng.pick(['\u200b', '\u200c', '\u200d', '\ufeff', ' \u200b\ufeff\t ']);
      const e = makeSnapshot('zw-e', [makeMed('z1', rng)], {
        source: zw,
        author: zw,
        recordedAt: zw,
      });
      const report = analyzeSnapshots(e, makeSnapshot('zw-l', []));
      expect(report.earlierProvenance.sourceLabel).toBeNull();
      expect(report.earlierProvenance.attributedBy).toBeNull();
      expect(report.earlierProvenance.recordedAt).toBeNull();
      expect(report.earlierProvenance.status).toBe('unknown');
      expect(report.provenanceFlags).toContain('blank_source_attribution');
      expect(report.provenanceFlags).toContain('missing_timestamp');
    } else if (variant === 4) {
      // Zero-width chars wrapping an unknown token still map to unknown attribution
      const e = makeSnapshot('zw-unk', [makeMed('z2', rng)], {
        source: '\ufeff Unknown \u200b',
      });
      const report = analyzeSnapshots(e, makeSnapshot('zw-l2', []));
      expect(report.earlierProvenance.status).toBe('unknown');
      expect(report.provenanceFlags).toContain('missing_source_attribution');
    } else if (variant === 5) {
      // Zero-width-only medication fields trigger blank_field_value
      const zw = rng.pick(['\u200b', '\ufeff', ' \u200c ', '\u200d']);
      const e = makeSnapshot('zw-f-e', [
        makeMed('z3', rng, { dose: zw, route: 'oral', frequency: 'daily' }),
      ]);
      const l = makeSnapshot('zw-f-l', []);
      const report = analyzeSnapshots(e, l);
      expect(report.changes[0].provenanceFlags).toContain('blank_field_value');
      expect(report.changes[0].provenanceGaps).toContainEqual(
        expect.objectContaining({ side: 'earlier', scope: 'field', field: 'dose', reason: 'blank_field_value' }),
      );
    } else {
      // Zero-width-only evidence link attribution triggers blank_source_attribution
      const zw = '\u200b\u200d\ufeff';
      const e = makeSnapshot('zw-ev-e', [
        makeMed('z4', rng, {
          evidenceLinks: [{ id: 'ev-zw', sourceLabel: zw, noteId: zw, sourceId: zw }],
        }),
      ]);
      const report = analyzeSnapshots(e, makeSnapshot('zw-ev-l', []));
      expect(report.changes[0].provenanceFlags).toContain('blank_source_attribution');
      expect(report.changes[0].evidenceLinks?.[0].resolutionStatus).toBe('unresolved');
    }
  });

  // ---------------------------------------------------------------------------
  // Group 6: 300 cases — Blank / whitespace / placeholder values & null/undefined recordedAt
  // ---------------------------------------------------------------------------
  const placeholderCases = Array.from({ length: 300 }, (_, i) => ({ caseId: i + 1 }));

  it.each(placeholderCases)('placeholder-blank-timestamp #$caseId', ({ caseId }) => {
    const rng = new SeededRng(60000 + caseId);
    const token = PLACEHOLDER_TOKENS[caseId % PLACEHOLDER_TOKENS.length];
    const mode = caseId % 5;

    if (mode === 0) {
      const e = makeSnapshot('ph-0', [makeMed('p1', rng)], {
        source: `  ${token}  `,
        recordedAt: null,
      });
      const report = analyzeSnapshots(e, makeSnapshot('ph-0b', []));
      expect(report.earlierProvenance.status).toBe('unknown');
      expect(report.earlierProvenance.flags).toContain('missing_source_attribution');
      expect(report.earlierProvenance.flags).toContain('missing_timestamp');
      expect(report.changes[0].provenance?.overallStatus).toBe('unknown');
    } else if (mode === 1) {
      // Valid snapshot source, but med-level provenance has placeholder sourceLabel or unknown status
      const e = makeSnapshot('ph-1', [
        makeMed('p2', rng, {
          provenance: { sourceLabel: token, attributedBy: token },
        }),
      ]);
      const report = analyzeSnapshots(e, makeSnapshot('ph-1b', []));
      expect(report.changes[0].provenance?.earlier.status).toBe('unknown');
      expect(report.changes[0].provenanceFlags).toContain('missing_source_attribution');
    } else if (mode === 2) {
      // Snapshot recordedAt undefined cast / null / blank string
      const blankDate = rng.pick([null, '', '   ', '\t\n']);
      const e = makeSnapshot('ph-2', [makeMed('p3', rng)], {
        recordedAt: blankDate as string | null,
      });
      const report = analyzeSnapshots(e, makeSnapshot('ph-2b', []));
      expect(report.earlierProvenance.recordedAt).toBeNull();
      expect(report.earlierProvenance.flags).toContain('missing_timestamp');
    } else if (mode === 3) {
      // Blank medication fields vs null medication fields
      const e = makeSnapshot('ph-3', [
        makeMed('p4', rng, { dose: null, route: '   ', frequency: '' }),
      ]);
      const report = analyzeSnapshots(e, makeSnapshot('ph-3b', []));
      expect(report.changes[0].provenanceFlags).toContain('undocumented_field');
      expect(report.changes[0].provenanceFlags).toContain('blank_field_value');
    } else {
      // Blank provenance status string
      const e = makeSnapshot('ph-4', [
        makeMed('p5', rng, { provenance: { status: '   ' } }),
      ]);
      const report = analyzeSnapshots(e, makeSnapshot('ph-4b', []));
      expect(report.changes[0].provenanceFlags).toContain('blank_source_attribution');
      expect(report.changes[0].provenance?.overallStatus).toBe('unknown');
    }
  });

  // ---------------------------------------------------------------------------
  // Group 7: 250 cases — Invalid / out-of-bounds / negative TextSpan offsets
  // ---------------------------------------------------------------------------
  const spanCases = Array.from({ length: 250 }, (_, i) => ({ caseId: i + 1 }));

  it.each(spanCases)('text-span-validation #$caseId', ({ caseId }) => {
    const rng = new SeededRng(70000 + caseId);
    const badSpans: TextSpan[] = [
      { start: -1, end: 5 },
      { start: 0, end: 0 },
      { start: 10, end: 10 },
      { start: 15, end: 5 },
      { start: 1.5, end: 10 },
      { start: 0, end: 5.2 },
      { start: Number.NaN, end: 5 },
      { start: 0, end: Number.POSITIVE_INFINITY },
      { start: 0, end: 10, line: 0 },
      { start: 0, end: 10, line: -2 },
      { start: 0, end: 10, column: 0 },
      { start: 0, end: 10, column: 1.5 },
    ];

    const isValidCase = caseId % 5 === 0;
    const span: TextSpan = isValidCase
      ? { start: rng.int(0, 50), end: rng.int(51, 120), line: rng.int(1, 20), column: rng.int(1, 40) }
      : badSpans[caseId % badSpans.length];

    const e = makeSnapshot('sp-e', [
      makeMed('sp1', rng, {
        provenance: 'documented',
        evidenceLinks: [
          {
            id: `ev-span-${caseId}`,
            noteId: 'note-sp',
            sourceKind: 'clinical_note',
            excerpt: 'Aspirin 81 mg daily',
            span,
          },
        ],
      }),
    ]);

    const report = analyzeSnapshots(e, makeSnapshot('sp-l', []));
    const link = report.changes[0].evidenceLinks?.[0];
    expect(link).toBeDefined();
    if (isValidCase) {
      expect(link?.span).toEqual(span);
      expect(link?.resolutionStatus).toBe('resolved');
      expect(report.changes[0].provenanceFlags).not.toContain('unresolved_evidence_link');
    } else {
      expect(link?.span).toBeNull();
      expect(link?.resolutionStatus).toBe('partial');
      expect(report.changes[0].provenanceFlags).toContain('unresolved_evidence_link');
      expect(report.changes[0].provenanceGaps).toContainEqual(
        expect.objectContaining({ reason: 'invalid_evidence_span', evidenceId: `ev-span-${caseId}` }),
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Group 8: 350 cases — Conflicting/ambiguous provenance, multi-link dedupe, no-fabrication
  // ---------------------------------------------------------------------------
  const provenanceCases = Array.from({ length: 350 }, (_, i) => ({ caseId: i + 1 }));

  it.each(provenanceCases)('provenance-conflict-dedupe-invariants #$caseId', ({ caseId }) => {
    const rng = new SeededRng(80000 + caseId);
    const mode = caseId % 7;

    if (mode === 0) {
      // Status vs sourceKind conflict: documented + patient_report OR patient_reported + clinical kind
      const documentedVsPatient = caseId % 2 === 0;
      const e = makeSnapshot('cf-0', [
        makeMed('m-cf', rng, {
          provenance: {
            status: documentedVsPatient ? 'documented' : 'patient_reported',
            sourceKind: documentedVsPatient ? 'patient_report' : rng.pick(CLINICAL_KINDS),
          },
        }),
      ]);
      const report = analyzeSnapshots(e, makeSnapshot('cf-0b', []));
      expect(report.changes[0].provenance?.earlier.ambiguous).toBe(true);
      expect(report.changes[0].provenance?.overallStatus).toBe('unknown');
      expect(report.changes[0].provenanceFlags).toContain('conflicting_provenance');
    } else if (mode === 1) {
      // Multiple evidence links with conflicting provenanceStatus (documented vs patient_reported)
      const e = makeSnapshot('cf-1', [
        makeMed('m-cf1', rng, {
          evidenceLinks: [
            {
              id: 'ev-a',
              noteId: 'n1',
              sourceKind: 'clinical_note',
              provenanceStatus: 'documented',
              excerpt: 'Note A',
              span: { start: 0, end: 6 },
            },
            {
              id: 'ev-b',
              sourceId: 'pat-1',
              sourceKind: 'patient_report',
              provenanceStatus: 'patient_reported',
              excerpt: 'Patient says',
            },
          ],
        }),
      ]);
      const report = analyzeSnapshots(e, makeSnapshot('cf-1b', []));
      expect(report.changes[0].provenance?.earlier.ambiguous).toBe(true);
      expect(report.changes[0].provenance?.overallStatus).toBe('unknown');
      expect(report.changes[0].provenanceGaps).toContainEqual(
        expect.objectContaining({ reason: 'conflicting_evidence_provenance' }),
      );
    } else if (mode === 2) {
      // Ambiguous attribution phrases trigger ambiguous + unknown
      const phrase = rng.pick([
        'ambiguous clinic record',
        'Unclear pharmacy source',
        'Conflicting med list',
        'Clinic vs. patient report',
        'Unknown or discharge summary',
        'Clinic??',
      ]);
      const e = makeSnapshot('cf-2', [makeMed('m-cf2', rng)], { source: phrase });
      const report = analyzeSnapshots(e, makeSnapshot('cf-2b', []));
      expect(report.earlierProvenance.ambiguous).toBe(true);
      expect(report.earlierProvenance.status).toBe('unknown');
      expect(report.changes[0].provenance?.overallStatus).toBe('unknown');
    } else if (mode === 3) {
      // Multi-link ordering and deduplication of identical links
      const dupLink: EvidenceLink = {
        id: 'ev-dup',
        noteId: 'note-1',
        sourceKind: 'clinical_note',
        excerpt: 'Lisinopril 10 mg daily',
        span: { start: 5, end: 25 },
      };
      const secondLink: EvidenceLink = {
        id: 'ev-second',
        sourceId: 'rx-1',
        sourceKind: 'pharmacy_fill',
        excerpt: 'Dispensed #30',
      };
      const e = makeSnapshot('dedup-e', [
        makeMed('m-dd', rng, {
          provenance: 'documented',
          evidenceLinks: [dupLink, { ...dupLink }, secondLink],
        }),
      ]);
      const l = makeSnapshot('dedup-l', [
        makeMed('m-dd', rng, {
          dose: '999 mg',
          provenance: 'documented',
          evidenceLinks: [{ ...secondLink }],
        }),
      ]);
      const changes = compareSnapshots(e, l);
      expect(changes).toHaveLength(1);
      // Earlier has 2 unique links (dupLink + secondLink), later has 1 (different side => preserved)
      expect(changes[0].evidenceLinks?.map(x => x.id)).toEqual([
        'ev-dup',
        'ev-second',
        'ev-second',
      ]);
      expect(changes[0].evidenceLinks?.map(x => x.side)).toEqual(['earlier', 'earlier', 'later']);
    } else if (mode === 4) {
      // conflictingSources array length >= 2 vs length 1
      const len = caseId % 2 === 0 ? 2 : 1;
      const e = makeSnapshot('cs-e', [
        makeMed('m-cs', rng, {
          provenance: {
            status: 'documented',
            conflictingSources: len === 2 ? ['Clinic', 'Portal'] : ['Clinic'],
          },
        }),
      ]);
      const report = analyzeSnapshots(e, makeSnapshot('cs-l', []));
      if (len === 2) {
        expect(report.changes[0].provenance?.earlier.ambiguous).toBe(true);
        expect(report.changes[0].provenance?.overallStatus).toBe('unknown');
      } else {
        expect(report.changes[0].provenance?.earlier.ambiguous).toBe(false);
        expect(report.changes[0].provenance?.overallStatus).toBe('documented');
      }
    } else if (mode === 5) {
      // Unrecognized status string abstains to unknown
      const badStatus = rng.pick(['verified_maybe', 'inferred', 'assumed', 'ai_generated']);
      const e = makeSnapshot('unrec-e', [
        makeMed('m-unrec', rng, { provenance: { status: badStatus } }),
      ]);
      const report = analyzeSnapshots(e, makeSnapshot('unrec-l', []));
      expect(report.changes[0].provenance?.overallStatus).toBe('unknown');
      expect(report.changes[0].provenanceFlags).toContain('unknown_provenance');
    } else {
      // No-fabrication invariant across random combination of earlier/later statuses
      const statuses: ProvenanceStatus[] = ['documented', 'patient_reported', 'unverified', 'unknown'];
      const s1 = rng.pick(statuses);
      const s2 = rng.pick(statuses);
      const e = makeSnapshot('nf-e', [
        makeMed('m-nf', rng, { dose: '10 mg', provenance: s1 }),
      ]);
      const l = makeSnapshot('nf-l', [
        makeMed('m-nf', rng, { dose: '20 mg', provenance: s2 }),
      ]);
      const report = analyzeSnapshots(e, l);
      const ov = report.changes[0].provenance?.overallStatus;
      if (s1 === 'unknown' || s2 === 'unknown') expect(ov).toBe('unknown');
      else if (s1 === 'unverified' || s2 === 'unverified') expect(ov).toBe('unverified');
      else if (s1 === 'patient_reported' || s2 === 'patient_reported') expect(ov).toBe('patient_reported');
      else expect(ov).toBe('documented');
    }
  });
});

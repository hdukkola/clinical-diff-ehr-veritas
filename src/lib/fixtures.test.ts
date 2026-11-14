import { describe, expect, it } from 'vitest';
import { compareSnapshots } from './diff';
import { earlier, getSyntheticScenario, later, syntheticScenarios } from './fixtures';

function isValidIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

describe('synthetic fixture scenarios', () => {
  it('preserves the Morgan Lee baseline exports for existing UI and diff tests', () => {
    expect(earlier.id).toBe('s1');
    expect(earlier.source).toBe('Fictional outpatient medication list');
    expect(earlier.recordedAt).toBe('2026-10-01');
    expect(earlier.medications.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

    expect(later.id).toBe('s2');
    expect(later.source).toBe('Fictional discharge medication list');
    expect(later.recordedAt).toBe('2026-10-15');
    expect(later.medications.map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);

    expect(compareSnapshots(earlier, later)).toEqual([
      {
        medicationId: 'm1',
        name: 'Lisinopril',
        kind: 'changed',
        fields: [{ field: 'dose', before: '10 mg', after: '20 mg' }],
      },
      {
        medicationId: 'm2',
        name: 'Metformin',
        kind: 'changed',
        fields: [{ field: 'frequency', before: 'twice daily', after: null }],
      },
      { medicationId: 'm3', name: 'Aspirin', kind: 'removed', fields: [] },
      { medicationId: 'm4', name: 'Atorvastatin', kind: 'added', fields: [] },
    ]);
  });

  it('enforces unique scenario/snapshot/medication IDs, valid ISO dates, and synthetic labeling', () => {
    expect(syntheticScenarios.length).toBeGreaterThanOrEqual(9);

    const scenarioIds = syntheticScenarios.map((s) => s.id);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);

    const snapshotIds = syntheticScenarios.flatMap((s) => [s.earlier.id, s.later.id]);
    expect(new Set(snapshotIds).size).toBe(snapshotIds.length);

    for (const scenario of syntheticScenarios) {
      expect(scenario.id.trim().length).toBeGreaterThan(0);
      expect(scenario.patientId.trim().length).toBeGreaterThan(0);
      expect(scenario.patientLabel.trim().length).toBeGreaterThan(0);
      expect(scenario.patientLabel).toMatch(/synthetic/i);
      expect(scenario.title.trim().length).toBeGreaterThan(0);
      expect(scenario.summary.trim().length).toBeGreaterThan(0);
      expect(scenario.tags.length).toBeGreaterThan(0);
      expect(getSyntheticScenario(scenario.id)).toBe(scenario);

      for (const snapshot of [scenario.earlier, scenario.later]) {
        expect(snapshot.id.trim().length).toBeGreaterThan(0);
        expect(snapshot.source.trim().length).toBeGreaterThan(0);
        expect(snapshot.source).toMatch(/(fictional|synthetic)/i);

        if (snapshot.recordedAt !== null) {
          expect(isValidIsoCalendarDate(snapshot.recordedAt)).toBe(true);
        }

        const medIds = snapshot.medications.map((m) => m.id);
        expect(new Set(medIds).size).toBe(medIds.length);
        for (const med of snapshot.medications) {
          expect(med.id.trim().length).toBeGreaterThan(0);
          expect(med.name.trim().length).toBeGreaterThan(0);
        }
      }

      expect(() => compareSnapshots(scenario.earlier, scenario.later)).not.toThrow();
    }

    expect(getSyntheticScenario('nonexistent-scenario-id')).toBeUndefined();
  });

  it('covers all required clinical and edge-case scenario categories', () => {
    const categories = new Set(syntheticScenarios.map((s) => s.category));
    expect(categories).toEqual(
      new Set([
        'baseline-reconciliation',
        'polypharmacy-transition',
        'missing-documentation',
        'allergy-hold-restart',
        'unicode-whitespace-case',
        'conflicting-sources',
        'empty-no-change',
      ]),
    );
  });

  it('produces expected compareSnapshots outcomes for polypharmacy, missing-field, and hold/restart scenarios', () => {
    const poly = getSyntheticScenario('scenario-polypharmacy-discharge-followup')!;
    expect(
      compareSnapshots(poly.earlier, poly.later).map((c) => [c.medicationId, c.kind]),
    ).toEqual([
      ['poly-m1', 'changed'],
      ['poly-m2', 'changed'],
      ['poly-m5', 'removed'],
      ['poly-m6', 'changed'],
      ['poly-m7', 'added'],
      ['poly-m8', 'added'],
    ]);

    const missing = getSyntheticScenario('scenario-missing-undocumented-fields')!;
    expect(missing.earlier.recordedAt).toBeNull();
    const missingDiff = compareSnapshots(missing.earlier, missing.later);
    expect(missingDiff.map((c) => [c.medicationId, c.kind])).toEqual([
      ['miss-m1', 'changed'],
      ['miss-m3', 'removed'],
      ['miss-m4', 'changed'],
      ['miss-m5', 'added'],
    ]);
    expect(missingDiff[0].fields).toEqual([
      { field: 'dose', before: null, after: '300 mg' },
      { field: 'route', before: null, after: 'oral' },
      { field: 'frequency', before: null, after: 'at bedtime' },
    ]);

    const holdRestart = getSyntheticScenario('scenario-allergy-hold-restart')!;
    expect(
      compareSnapshots(holdRestart.earlier, holdRestart.later).map((c) => [c.medicationId, c.kind]),
    ).toEqual([
      ['hold-m1', 'removed'],
      ['hold-m2', 'removed'],
      ['hold-m3', 'changed'],
      ['hold-m4', 'removed'],
      ['hold-m5', 'added'],
      ['hold-m6', 'added'],
    ]);
  });

  it('produces expected compareSnapshots outcomes for unicode/whitespace/case, conflicting sources, and empty/no-change pairs', () => {
    const unicodeCase = getSyntheticScenario('scenario-unicode-whitespace-case')!;
    const unicodeDiff = compareSnapshots(unicodeCase.earlier, unicodeCase.later);
    expect(unicodeDiff.map((c) => [c.medicationId, c.fields.map((f) => f.field)])).toEqual([
      ['uni-m1', ['name', 'dose', 'route', 'frequency']],
      ['uni-m2', ['dose', 'frequency']],
      ['uni-m3', ['name']],
    ]);

    const patientVsPharmacy = getSyntheticScenario('scenario-conflicting-patient-vs-pharmacy')!;
    expect(
      compareSnapshots(patientVsPharmacy.earlier, patientVsPharmacy.later).map((c) => [
        c.medicationId,
        c.kind,
      ]),
    ).toEqual([
      ['conf-m1', 'changed'],
      ['conf-m2', 'changed'],
      ['conf-m3', 'removed'],
      ['conf-m4', 'added'],
    ]);

    const pharmacyVsDischarge = getSyntheticScenario('scenario-conflicting-pharmacy-vs-discharge')!;
    expect(
      compareSnapshots(pharmacyVsDischarge.earlier, pharmacyVsDischarge.later).map((c) => [
        c.medicationId,
        c.kind,
      ]),
    ).toEqual([
      ['conf-m1', 'changed'],
      ['conf-m4', 'removed'],
      ['conf-m5', 'added'],
    ]);

    const emptyPair = getSyntheticScenario('scenario-empty-snapshots')!;
    expect(compareSnapshots(emptyPair.earlier, emptyPair.later)).toEqual([]);

    const identicalPair = getSyntheticScenario('scenario-no-change-identical')!;
    expect(compareSnapshots(identicalPair.earlier, identicalPair.later)).toEqual([]);

    const emptyToPopulated = getSyntheticScenario('scenario-empty-to-populated')!;
    expect(
      compareSnapshots(emptyToPopulated.earlier, emptyToPopulated.later).map((c) => [
        c.medicationId,
        c.kind,
      ]),
    ).toEqual([
      ['addonly-m1', 'added'],
      ['addonly-m2', 'added'],
    ]);
  });
});

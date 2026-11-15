// @vitest-environment node
import { deepStrictEqual, equal } from 'node:assert/strict';
import { describe, it } from 'vitest';
import { compareNoteRegimens, compareSnapshots } from './diff';
import type { FieldChange, Medication, Snapshot } from './types';

const casesPerFamily = 10_000;
const names = ['Lisinopril', 'Metformin', 'Aspirin', 'Atorvastatin'];
const routes = ['oral', 'subcutaneous', 'intravenous'];
const frequencies = ['daily', 'twice daily', 'nightly', null] as const;

function medication(index: number, id: string): Medication {
  return {
    id,
    name: names[index % names.length],
    dose: `${index % 250 + 1} mg`,
    route: routes[Math.floor(index / 250) % routes.length],
    frequency: frequencies[Math.floor(index / 750) % frequencies.length],
  };
}

function snapshot(id: string, medications: Medication[]): Snapshot {
  return { id, medications, source: 'Example medication list', recordedAt: null };
}

function compact(earlier: Medication[], later: Medication[]) {
  const left = snapshot('earlier', earlier);
  const right = snapshot('later', later);
  const before = JSON.stringify([left, right]);
  const changes = compareSnapshots(left, right);
  equal(JSON.stringify([left, right]), before, 'comparison mutated a source snapshot');
  return changes.map(({ medicationId, kind, fields }) => ({ medicationId, kind, fields }));
}

const families: [name: string, gradeCase: (index: number) => void][] = [
  ['mixed additions, removals and edits in stable ID order', (index) => {
    const edit = medication(index, `b-${index}`);
    const keep = medication(index + 3, `k-${index}`);
    const before = [medication(index + 1, `z-${index}`), edit, keep];
    const after = [keep, medication(index + 2, `a-${index}`), { ...edit, dose: '1 g' }];
    deepStrictEqual(compact(before, after), [
      { medicationId: `a-${index}`, kind: 'added', fields: [] },
      {
        medicationId: edit.id, kind: 'changed',
        fields: [{ field: 'dose', before: edit.dose, after: '1 g' }],
      },
      { medicationId: `z-${index}`, kind: 'removed', fields: [] },
    ]);
  }],
  ['missing fields remain missing', (index) => {
    const before = medication(index, `m-${index}`);
    const after = { ...before, dose: null, route: null, frequency: null };
    const fields: FieldChange[] = [
      { field: 'dose', before: before.dose, after: null },
      { field: 'route', before: before.route, after: null },
    ];
    if (before.frequency !== null) fields.push({ field: 'frequency', before: before.frequency, after: null });
    deepStrictEqual(compact([before], [after]), [
      { medicationId: before.id, kind: 'changed', fields },
    ]);
  }],
  ['order changes do not create medication differences', (index) => {
    const before = [medication(index, `m-${index}`), medication(index + 1, 'stable')];
    deepStrictEqual(compact(before, before.toReversed().map((item) => ({ ...item }))), []);
  }],
  ['note comparisons preserve exact dose text and source excerpts', (index) => {
    const name = names[index % names.length];
    const beforeDose = index + 1;
    const afterDose = beforeDose + 1;
    const earlier = `${name} ${beforeDose} mg daily.`;
    const later = `${name} ${afterDose} mg daily.`;
    const { items } = compareNoteRegimens(earlier, later);
    equal(items.length, 1);
    equal(items[0].medicationName.toLowerCase(), name.toLowerCase());
    equal(items[0].earlierRegimen?.dose, `${beforeDose} mg`);
    equal(items[0].laterRegimen?.dose, `${afterDose} mg`);
    equal(items[0].earlierExcerpt, earlier);
    equal(items[0].laterExcerpt, later);
  }],
  ['omission and explicit discontinuation stay distinct', (index) => {
    const name = names[index % names.length];
    const earlier = `${name} ${index + 1} mg daily.`;
    const otherName = names[(index + 1) % names.length];
    const later = index % 2 === 0
      ? `${otherName} 5 mg daily.`
      : `Discontinue ${name}.`;
    const { items } = compareNoteRegimens(earlier, later);
    const match = items.find((item) => item.normalizedName === name.toLowerCase());
    equal(match?.status, index % 2 === 0 ? 'earlier_only' : 'discontinued');
    if (index % 2 === 0) {
      equal(match?.laterExcerpt, null);
      equal(items.find((item) => item.normalizedName === otherName.toLowerCase())?.status, 'later_only');
    }
  }],
];

describe('50,000 deterministic medication-comparison cases', () => {
  it.each(families)('%s', (name, gradeCase) => {
    let failures = 0;
    const firstFailures: string[] = [];
    for (let index = 0; index < casesPerFamily; index += 1) {
      try {
        gradeCase(index);
      } catch (error) {
        failures += 1;
        if (firstFailures.length < 3) firstFailures.push(`case ${index}: ${String(error)}`);
      }
    }
    console.info(`${name} — ${casesPerFamily - failures}/${casesPerFamily} passed, ${failures} failed`);
    equal(failures, 0, firstFailures.join('\n'));
  });
});

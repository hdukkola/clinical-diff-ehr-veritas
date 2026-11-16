// @vitest-environment node
import { deepStrictEqual, equal } from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  compareNoteRegimens,
  compareSnapshots,
  extractMedicationRegimensFromNote,
  normalizeNoteText,
  type NoteRegimenChangeCategory,
} from './diff';
import type { FieldChange, Medication, Snapshot } from './types';

const CASES_PER_FAMILY = 12_000;

const MEDICATIONS = [
  'Amoxicillin',
  'Tylenol',
  'Albuterol HFA',
  'Lisinopril',
  'Metformin',
  'Aspirin',
  'Atorvastatin',
  'Prednisone',
  'Glipizide',
  'Metoprolol Succinate',
  'Warfarin',
  'Furosemide',
  'Enoxaparin',
  'Prilosec',
  'Seroquel',
  'Clopidogrel',
  'Verapamil Hydrochloride',
  'Ursodiol',
  'Acebutolol',
  'NaHCO3',
  'Vitamin D',
] as const;

const ALIAS_VARIANTS: ReadonlyArray<{ alias: string; canonical: string }> = [
  { alias: 'Acetaminophen', canonical: 'Tylenol' },
  { alias: 'lsnopril', canonical: 'Lisinopril' },
  { alias: 'asprin', canonical: 'Aspirin' },
  { alias: 'Lipitor', canonical: 'Atorvastatin' },
  { alias: 'Omeprazole', canonical: 'Prilosec' },
  { alias: 'Quetiapine', canonical: 'Seroquel' },
  { alias: 'Sodium bicarbonate', canonical: 'NaHCO3' },
  { alias: 'Metoprolol succinate ER', canonical: 'Metoprolol Succinate' },
  { alias: 'Albuterol sulfate HFA', canonical: 'Albuterol HFA' },
  { alias: 'Amoxicillin-clavulanate', canonical: 'Amoxicillin' },
];

const DOSE_UNITS = ['mg', 'mcg', 'g', 'ml', 'units', 'meq'] as const;

const ROUTES: ReadonlyArray<{ surface: string; canonical: string }> = [
  { surface: 'oral', canonical: 'oral' },
  { surface: 'PO', canonical: 'oral' },
  { surface: 'by mouth', canonical: 'oral' },
  { surface: 'subcutaneous', canonical: 'subcutaneous' },
  { surface: 'SubQ', canonical: 'subcutaneous' },
  { surface: 'intravenous', canonical: 'intravenous' },
  { surface: 'IV', canonical: 'intravenous' },
  { surface: 'intramuscular', canonical: 'intramuscular' },
  { surface: 'IM', canonical: 'intramuscular' },
  { surface: 'topical', canonical: 'topical' },
];

const FREQUENCIES: ReadonlyArray<{ surface: string; canonical: string }> = [
  { surface: 'daily', canonical: 'daily' },
  { surface: 'once daily', canonical: 'daily' },
  { surface: 'QD', canonical: 'daily' },
  { surface: 'twice daily', canonical: 'twice daily' },
  { surface: 'BID', canonical: 'twice daily' },
  { surface: 'three times daily', canonical: 'three times daily' },
  { surface: 'TID', canonical: 'three times daily' },
  { surface: 'at bedtime', canonical: 'at bedtime' },
  { surface: 'QHS', canonical: 'at bedtime' },
  { surface: 'every 4 hours as needed', canonical: 'every 4 hours as needed' },
  { surface: 'q4h prn', canonical: 'every 4 hours as needed' },
  { surface: 'every 6 hours as needed', canonical: 'every 6 hours as needed' },
  { surface: 'q6h prn', canonical: 'every 6 hours as needed' },
  { surface: 'every 4-6 hours as needed', canonical: 'every 4-6 hours as needed' },
];

const CANONICAL_FREQUENCIES = [
  'daily',
  'twice daily',
  'three times daily',
  'at bedtime',
  'every 4 hours as needed',
  'every 6 hours as needed',
  'every 4-6 hours as needed',
] as const;

const CANONICAL_ROUTES = [
  'oral',
  'subcutaneous',
  'intravenous',
  'intramuscular',
  'topical',
] as const;

const DISCONTINUATION_TEMPLATES: ReadonlyArray<(med: string) => string> = [
  (med) => `Discontinue ${med}.`,
  (med) => `Discontinue the ${med}.`,
  (med) => `${med} was discontinued.`,
  (med) => `${med} stopped after clinical review.`,
  (med) => `${med} is no longer indicated.`,
  (med) => `${med} held today.`,
  (med) => `Hold ${med}.`,
];

function deriveSeed(familySeed: number, index: number): number {
  return ((index * 2654435761) ^ familySeed) >>> 0;
}

function makeSnapshot(id: string, medications: Medication[]): Snapshot {
  return {
    id,
    medications,
    source: `Synthetic QA snapshot ${id}`,
    recordedAt: '2026-03-15T10:00:00Z',
  };
}

function compactChanges(earlier: Medication[], later: Medication[]) {
  const left = makeSnapshot('earlier', earlier);
  const right = makeSnapshot('later', later);
  const changes = compareSnapshots(left, right);
  return changes.map(({ medicationId, name, kind, fields }) => ({
    medicationId,
    name,
    kind,
    fields,
  }));
}

const families: [name: string, gradeCase: (index: number) => void][] = [
  [
    '1. dose/unit/frequency changes (12,000 cases)',
    (index) => {
      const seed = deriveSeed(0x1010_0001, index);
      const med = MEDICATIONS[index % MEDICATIONS.length];
      const beforeAmount = (index % 400) + 1;
      const beforeUnit = DOSE_UNITS[Math.floor(index / 21) % DOSE_UNITS.length];
      const beforeFreq =
        CANONICAL_FREQUENCIES[Math.floor(index / 126) % CANONICAL_FREQUENCIES.length];
      const beforeRoute =
        CANONICAL_ROUTES[Math.floor(index / 882) % CANONICAL_ROUTES.length];

      // Mode 0: dose numeric change, Mode 1: dose unit change, Mode 2: frequency change, Mode 3: dose + frequency + route change
      const mode = index % 4;
      const afterAmount = mode === 0 || mode === 3 ? beforeAmount + ((seed % 25) + 1) : beforeAmount;
      const afterUnit =
        mode === 1
          ? DOSE_UNITS[(Math.floor(index / 21) + 1 + (seed % (DOSE_UNITS.length - 1))) % DOSE_UNITS.length]
          : beforeUnit;
      const afterFreq =
        mode === 2 || mode === 3
          ? CANONICAL_FREQUENCIES[
              (Math.floor(index / 126) + 1 + (seed % (CANONICAL_FREQUENCIES.length - 1))) %
                CANONICAL_FREQUENCIES.length
            ]
          : beforeFreq;
      const afterRoute =
        mode === 3
          ? CANONICAL_ROUTES[
              (Math.floor(index / 882) + 1 + (seed % (CANONICAL_ROUTES.length - 1))) %
                CANONICAL_ROUTES.length
            ]
          : beforeRoute;

      const beforeDose = `${beforeAmount} ${beforeUnit}`;
      const afterDose = `${afterAmount} ${afterUnit}`;

      const earlierClause = `${med} ${beforeDose} ${beforeRoute} ${beforeFreq}.`;
      const laterClause = `${med} ${afterDose} ${afterRoute} ${afterFreq}.`;

      const report = compareNoteRegimens(earlierClause, laterClause);
      equal(report.items.length, 1);
      const item = report.items[0];
      equal(item.medicationName, med);
      equal(item.normalizedName, med.toLowerCase());
      equal(item.status, 'changed');
      equal(item.statusLabel, 'Regimen changed');
      equal(item.earlierRegimen?.dose, beforeDose);
      equal(item.laterRegimen?.dose, afterDose);
      equal(item.earlierRegimen?.route, beforeRoute);
      equal(item.laterRegimen?.route, afterRoute);
      equal(item.earlierRegimen?.frequency, beforeFreq);
      equal(item.laterRegimen?.frequency, afterFreq);
      equal(item.earlierExcerpt, earlierClause);
      equal(item.laterExcerpt, laterClause);

      const expectedCategories: NoteRegimenChangeCategory[] = [];
      if (beforeDose !== afterDose) expectedCategories.push('Dose changed');
      if (beforeFreq !== afterFreq) expectedCategories.push('Frequency changed');
      if (beforeRoute !== afterRoute) expectedCategories.push('Route changed');
      deepStrictEqual(item.changeCategories, expectedCategories);

      const expectedFields: FieldChange[] = [];
      if (beforeDose !== afterDose) {
        expectedFields.push({ field: 'dose', before: beforeDose, after: afterDose });
      }
      if (beforeRoute !== afterRoute) {
        expectedFields.push({ field: 'route', before: beforeRoute, after: afterRoute });
      }
      if (beforeFreq !== afterFreq) {
        expectedFields.push({ field: 'frequency', before: beforeFreq, after: afterFreq });
      }

      const snapDiff = compactChanges(
        [
          {
            id: `med-${index}`,
            name: med,
            dose: beforeDose,
            route: beforeRoute,
            frequency: beforeFreq,
          },
        ],
        [
          {
            id: `med-${index}`,
            name: med,
            dose: afterDose,
            route: afterRoute,
            frequency: afterFreq,
          },
        ],
      );
      deepStrictEqual(snapDiff, [
        {
          medicationId: `med-${index}`,
          name: med,
          kind: 'changed',
          fields: expectedFields,
        },
      ]);
    },
  ],
  [
    '2. medication addition/omission/explicit discontinuation (12,000 cases)',
    (index) => {
      const medA = MEDICATIONS[index % MEDICATIONS.length];
      const medB = MEDICATIONS[(index + 5) % MEDICATIONS.length];
      const medC = MEDICATIONS[(index + 11) % MEDICATIONS.length];
      const doseA = `${(index % 150) + 5} mg`;
      const doseB = `${(index % 80) + 10} mg`;
      const doseC = `${(index % 60) + 2} mg`;

      const mode = index % 3;
      if (mode === 0) {
        // Omission of medA + Addition of medC
        const earlier = `${medA} ${doseA} oral daily.`;
        const later = `${medC} ${doseC} oral twice daily.`;
        const report = compareNoteRegimens(earlier, later);
        equal(report.items.length, 2);

        const omitted = report.items.find((i) => i.normalizedName === medA.toLowerCase());
        equal(omitted?.status, 'earlier_only');
        equal(omitted?.statusLabel, 'Mentioned only in earlier note');
        deepStrictEqual(omitted?.changeCategories, ['Mentioned only in earlier note']);
        equal(omitted?.earlierExcerpt, earlier);
        equal(omitted?.laterExcerpt, null);
        equal(omitted?.absenceNote, 'Not mentioned in later note (not explicitly discontinued)');

        const added = report.items.find((i) => i.normalizedName === medC.toLowerCase());
        equal(added?.status, 'later_only');
        equal(added?.statusLabel, 'Mentioned only in later note');
        deepStrictEqual(added?.changeCategories, ['Mentioned only in later note']);
        equal(added?.earlierExcerpt, null);
        equal(added?.laterExcerpt, later);
        equal(added?.absenceNote, 'Not mentioned in earlier note');
      } else if (mode === 1) {
        // Explicit discontinuation of medB using varied clinical phrasing
        const earlier = `${medB} ${doseB} oral daily.`;
        const template =
          DISCONTINUATION_TEMPLATES[
            Math.floor(index / 3) % DISCONTINUATION_TEMPLATES.length
          ];
        const later = template(medB);
        const report = compareNoteRegimens(earlier, later);
        equal(report.items.length, 1);
        const disc = report.items[0];
        equal(disc.medicationName, medB);
        equal(disc.status, 'discontinued');
        equal(disc.statusLabel, 'Clinically discontinued');
        deepStrictEqual(disc.changeCategories, ['Clinically discontinued']);
        equal(disc.earlierExcerpt, earlier);
        equal(disc.laterExcerpt, later);
        equal(disc.absenceNote, 'Explicitly discontinued in later note');
      } else {
        // Simultaneous omission (medA), explicit discontinuation (medB), and addition (medC)
        const earlierA = `${medA} ${doseA} oral daily.`;
        const earlierB = `${medB} ${doseB} oral at bedtime.`;
        const template =
          DISCONTINUATION_TEMPLATES[
            Math.floor(index / 3) % DISCONTINUATION_TEMPLATES.length
          ];
        const laterB = template(medB);
        const laterC = `${medC} ${doseC} oral twice daily.`;

        const report = compareNoteRegimens(`${earlierA}\n${earlierB}`, `${laterB}\n${laterC}`);
        equal(report.items.length, 3);

        const itemA = report.items.find((i) => i.normalizedName === medA.toLowerCase());
        const itemB = report.items.find((i) => i.normalizedName === medB.toLowerCase());
        const itemC = report.items.find((i) => i.normalizedName === medC.toLowerCase());

        equal(itemA?.status, 'earlier_only');
        equal(itemA?.earlierExcerpt, earlierA);
        equal(itemA?.laterExcerpt, null);

        equal(itemB?.status, 'discontinued');
        equal(itemB?.earlierExcerpt, earlierB);
        equal(itemB?.laterExcerpt, laterB);

        equal(itemC?.status, 'later_only');
        equal(itemC?.earlierExcerpt, null);
        equal(itemC?.laterExcerpt, laterC);
      }
    },
  ],
  [
    '3. repeat mentions and reordered entries (12,000 cases)',
    (index) => {
      const med1 = MEDICATIONS[index % MEDICATIONS.length];
      const med2 = MEDICATIONS[(index + 4) % MEDICATIONS.length];
      const med3 = MEDICATIONS[(index + 9) % MEDICATIONS.length];

      const dose1 = `${(index % 100) + 5} mg`;
      const dose2Before = `${(index % 90) + 10} mg`;
      const dose2After = `${(index % 90) + 20} mg`;
      const dose3 = `${(index % 50) + 1} mg`;

      // Earlier note has med1 (with repeat mention), med2, med3 in [1, 2, 3] order
      const earlier1a = `${med1} ${dose1} oral daily.`;
      const earlier1b = `Continue ${med1} as prescribed.`;
      const earlier2 = `${med2} ${dose2Before} oral twice daily.`;
      const earlier3 = `${med3} ${dose3} oral at bedtime.`;

      // Later note reorders to [3, 2 (with repeat mention & dose change), 1]
      const later3 = `${med3} ${dose3} oral at bedtime.`;
      const later2a = `${med2} ${dose2After} oral.`;
      const later2b = `Take ${med2} twice daily.`;
      const later1 = `${med1} ${dose1} oral daily.`;

      const earlierNote = [earlier1a, earlier1b, earlier2, earlier3].join('\n');
      const laterNote = [later3, later2a, later2b, later1].join('\n');

      const report = compareNoteRegimens(earlierNote, laterNote);
      equal(report.items.length, 3);

      const item1 = report.items.find((i) => i.normalizedName === med1.toLowerCase());
      equal(item1?.status, 'unchanged');
      deepStrictEqual(item1?.changeCategories, []);
      equal(item1?.earlierExcerpt, `${earlier1a} | ${earlier1b}`);
      equal(item1?.laterExcerpt, later1);

      const item2 = report.items.find((i) => i.normalizedName === med2.toLowerCase());
      equal(item2?.status, 'changed');
      deepStrictEqual(item2?.changeCategories, ['Dose changed']);
      equal(item2?.earlierRegimen?.dose, dose2Before);
      equal(item2?.laterRegimen?.dose, dose2After);
      equal(item2?.laterRegimen?.route, 'oral');
      equal(item2?.laterRegimen?.frequency, 'twice daily');
      equal(item2?.earlierExcerpt, earlier2);
      equal(item2?.laterExcerpt, `${later2a} | ${later2b}`);

      const item3 = report.items.find((i) => i.normalizedName === med3.toLowerCase());
      equal(item3?.status, 'unchanged');
      deepStrictEqual(item3?.changeCategories, []);
      equal(item3?.earlierExcerpt, earlier3);
      equal(item3?.laterExcerpt, later3);

      // Snapshot reorder check: reordered identical entries yield 0 changes
      const snapMeds: Medication[] = [
        { id: `c-${index}`, name: med1, dose: dose1, route: 'oral', frequency: 'daily' },
        { id: `a-${index}`, name: med2, dose: dose2Before, route: 'oral', frequency: 'twice daily' },
        { id: `b-${index}`, name: med3, dose: dose3, route: 'oral', frequency: 'at bedtime' },
      ];
      deepStrictEqual(compactChanges(snapMeds, [snapMeds[2], snapMeds[0], snapMeds[1]]), []);
    },
  ],
  [
    '4. punctuation/layout noise (12,000 cases)',
    (index) => {
      const aliasPair = ALIAS_VARIANTS[index % ALIAS_VARIANTS.length];
      const otherMed =
        MEDICATIONS[(index + 7) % MEDICATIONS.length] === aliasPair.canonical
          ? MEDICATIONS[(index + 8) % MEDICATIONS.length]
          : MEDICATIONS[(index + 7) % MEDICATIONS.length];

      const routePair = ROUTES[Math.floor(index / 10) % ROUTES.length];
      const freqPairBefore = FREQUENCIES[Math.floor(index / 100) % FREQUENCIES.length];
      // Pick a frequency with a different canonical value for the later note half the time
      const changeFreq = index % 2 === 1;
      const freqPairAfter = changeFreq
        ? FREQUENCIES.find((f) => f.canonical !== freqPairBefore.canonical)!
        : freqPairBefore;

      const beforeAmount = (index % 200) + 5;
      const afterAmount = index % 3 === 0 ? beforeAmount + 5 : beforeAmount;

      const clauseA1 = `${aliasPair.alias} ${beforeAmount} mg ${routePair.surface} ${freqPairBefore.surface}!`;
      const clauseA2 = `${otherMed} 25 mg oral daily;`;

      const clauseB1 = `${aliasPair.canonical} ${afterAmount} mg ${routePair.canonical} ${freqPairAfter.surface}?`;
      const clauseB2 = `${otherMed} 25 mg PO QD.`;

      const lineBreaks = ['\r\n', '<br>', '<br/>', '<BR />', '\r\n\r\n', '\n   \n'] as const;
      const sep = lineBreaks[index % lineBreaks.length];
      const pad = '   \t  ';

      const noisyEarlier = `${pad}${clauseA1}${pad}${sep}${clauseA2}${pad}`;
      const noisyLater = `\r\n${clauseB1}${pad}${sep}${clauseB2}   `;

      const normalizedEarlier = normalizeNoteText(noisyEarlier);
      equal(normalizedEarlier.includes('\r'), false);
      equal(/<br/i.test(normalizedEarlier), false);

      const report = compareNoteRegimens(noisyEarlier, noisyLater);
      equal(report.items.length, 2);

      const primary = report.items.find(
        (i) => i.normalizedName === aliasPair.canonical.toLowerCase(),
      );
      equal(primary?.medicationName, aliasPair.canonical);
      equal(primary?.earlierRegimen?.dose, `${beforeAmount} mg`);
      equal(primary?.laterRegimen?.dose, `${afterAmount} mg`);
      equal(primary?.earlierRegimen?.route, routePair.canonical);
      equal(primary?.laterRegimen?.route, routePair.canonical);
      equal(primary?.earlierRegimen?.frequency, freqPairBefore.canonical);
      equal(primary?.laterRegimen?.frequency, freqPairAfter.canonical);
      equal(primary?.earlierExcerpt, clauseA1);
      equal(primary?.laterExcerpt, clauseB1);

      const expectedCategories: NoteRegimenChangeCategory[] = [];
      if (beforeAmount !== afterAmount) expectedCategories.push('Dose changed');
      if (freqPairBefore.canonical !== freqPairAfter.canonical) {
        expectedCategories.push('Frequency changed');
      }
      equal(primary?.status, expectedCategories.length > 0 ? 'changed' : 'unchanged');
      deepStrictEqual(primary?.changeCategories, expectedCategories);

      const secondary = report.items.find(
        (i) => i.normalizedName === otherMed.toLowerCase(),
      );
      equal(secondary?.status, 'unchanged');
      deepStrictEqual(secondary?.changeCategories, []);
      equal(secondary?.earlierExcerpt, clauseA2);
      equal(secondary?.laterExcerpt, clauseB2);
    },
  ],
  [
    '5. mixed multi-medication lists (12,000 cases)',
    (index) => {
      // Pick 5 distinct medications per case
      const base = index % MEDICATIONS.length;
      const mUnchanged = MEDICATIONS[base];
      const mChanged = MEDICATIONS[(base + 3) % MEDICATIONS.length];
      const mOmitted = MEDICATIONS[(base + 7) % MEDICATIONS.length];
      const mDiscontinued = MEDICATIONS[(base + 11) % MEDICATIONS.length];
      const mAdded = MEDICATIONS[(base + 15) % MEDICATIONS.length];

      const dUnchanged = `${(index % 40) + 5} mg`;
      const dBefore = `${(index % 80) + 10} mg`;
      const dAfter = `${(index % 80) + 25} mg`;
      const dOmitted = `${(index % 30) + 2} mg`;
      const dDiscontinued = `${(index % 60) + 15} mg`;
      const dAdded = `${(index % 50) + 1} mg`;

      const cEarlierUnchanged = `${mUnchanged} ${dUnchanged} oral daily.`;
      const cEarlierChanged = `${mChanged} ${dBefore} oral daily.`;
      const cEarlierOmitted = `${mOmitted} ${dOmitted} subcutaneous daily.`;
      const cEarlierDiscontinued = `${mDiscontinued} ${dDiscontinued} oral at bedtime.`;

      const cLaterChanged = `${mChanged} ${dAfter} oral twice daily.`;
      const cLaterUnchanged = `${mUnchanged} ${dUnchanged} oral daily.`;
      const cLaterDiscontinued =
        DISCONTINUATION_TEMPLATES[index % DISCONTINUATION_TEMPLATES.length](mDiscontinued);
      const cLaterAdded = `${mAdded} ${dAdded} intravenous daily.`;

      const earlierNote = [
        cEarlierUnchanged,
        cEarlierChanged,
        cEarlierOmitted,
        cEarlierDiscontinued,
      ].join('\n');
      const laterNote = [
        cLaterChanged,
        cLaterUnchanged,
        cLaterDiscontinued,
        cLaterAdded,
      ].join('\n');

      const report = compareNoteRegimens(earlierNote, laterNote);
      equal(report.items.length, 5);

      const byName = new Map(report.items.map((item) => [item.medicationName, item]));

      const uItem = byName.get(mUnchanged);
      equal(uItem?.status, 'unchanged');
      deepStrictEqual(uItem?.changeCategories, []);
      equal(uItem?.earlierExcerpt, cEarlierUnchanged);
      equal(uItem?.laterExcerpt, cLaterUnchanged);

      const cItem = byName.get(mChanged);
      equal(cItem?.status, 'changed');
      deepStrictEqual(cItem?.changeCategories, ['Dose changed', 'Frequency changed']);
      equal(cItem?.earlierRegimen?.dose, dBefore);
      equal(cItem?.laterRegimen?.dose, dAfter);
      equal(cItem?.earlierExcerpt, cEarlierChanged);
      equal(cItem?.laterExcerpt, cLaterChanged);

      const oItem = byName.get(mOmitted);
      equal(oItem?.status, 'earlier_only');
      deepStrictEqual(oItem?.changeCategories, ['Mentioned only in earlier note']);
      equal(oItem?.earlierExcerpt, cEarlierOmitted);
      equal(oItem?.laterExcerpt, null);

      const dItem = byName.get(mDiscontinued);
      equal(dItem?.status, 'discontinued');
      deepStrictEqual(dItem?.changeCategories, ['Clinically discontinued']);
      equal(dItem?.earlierExcerpt, cEarlierDiscontinued);
      equal(dItem?.laterExcerpt, cLaterDiscontinued);

      const aItem = byName.get(mAdded);
      equal(aItem?.status, 'later_only');
      deepStrictEqual(aItem?.changeCategories, ['Mentioned only in later note']);
      equal(aItem?.earlierExcerpt, null);
      equal(aItem?.laterExcerpt, cLaterAdded);

      // Verify structured snapshot diff on the same multi-medication set
      const snapChanges = compactChanges(
        [
          { id: `1-unchanged-${index}`, name: mUnchanged, dose: dUnchanged, route: 'oral', frequency: 'daily' },
          { id: `2-changed-${index}`, name: mChanged, dose: dBefore, route: 'oral', frequency: 'daily' },
          { id: `3-omitted-${index}`, name: mOmitted, dose: dOmitted, route: 'subcutaneous', frequency: 'daily' },
        ],
        [
          { id: `2-changed-${index}`, name: mChanged, dose: dAfter, route: 'oral', frequency: 'twice daily' },
          { id: `1-unchanged-${index}`, name: mUnchanged, dose: dUnchanged, route: 'oral', frequency: 'daily' },
          { id: `4-added-${index}`, name: mAdded, dose: dAdded, route: 'intravenous', frequency: 'daily' },
        ],
      );
      deepStrictEqual(snapChanges, [
        {
          medicationId: `2-changed-${index}`,
          name: mChanged,
          kind: 'changed',
          fields: [
            { field: 'dose', before: dBefore, after: dAfter },
            { field: 'frequency', before: 'daily', after: 'twice daily' },
          ],
        },
        {
          medicationId: `3-omitted-${index}`,
          name: mOmitted,
          kind: 'removed',
          fields: [],
        },
        {
          medicationId: `4-added-${index}`,
          name: mAdded,
          kind: 'added',
          fields: [],
        },
      ]);

      // Also verify extractMedicationRegimensFromNote count
      equal(extractMedicationRegimensFromNote(earlierNote).length, 4);
      equal(extractMedicationRegimensFromNote(laterNote).length, 4);
    },
  ],
];

describe('60,000 additional deterministic comparison-engine cases (110,000 total with diff-scale.test.ts)', () => {
  it.each(families)('%s', (name, gradeCase) => {
    let failures = 0;
    const firstFailures: string[] = [];
    for (let index = 0; index < CASES_PER_FAMILY; index += 1) {
      try {
        gradeCase(index);
      } catch (error) {
        failures += 1;
        if (firstFailures.length < 3) {
          firstFailures.push(`case ${index}: ${String(error)}`);
        }
      }
    }
    console.info(
      `${name} — ${CASES_PER_FAMILY - failures}/${CASES_PER_FAMILY} passed, ${failures} failed`,
    );
    equal(failures, 0, firstFailures.join('\n'));
  });
});

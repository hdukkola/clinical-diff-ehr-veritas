// @vitest-environment node
import { equal } from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  analyzeSnapshots,
  classifyChangeEvidenceState,
  compareNoteRegimens,
  compareSnapshots,
  extractMedicationRegimensFromNote,
} from './diff';
import type { Medication, Snapshot } from './types';

const CASES_PER_FAMILY = 6_250; // 4 families * 6,250 = 25,000 total cases

const NAMES = ['Lisinopril', 'Metformin', 'Aspirin', 'Atorvastatin'] as const;
const ROUTES = ['oral', 'subcutaneous', 'intravenous'] as const;
const FREQUENCIES = ['daily', 'twice daily', 'nightly'] as const;
const NON_MED_NOTES = [
  'Patient reports mild fatigue and improved sleep.',
  'Vital signs stable. Follow up in two weeks.',
  'Lab panel ordered for routine annual screening.',
  'No acute distress noted during physical exam.',
  'Discussed diet and exercise goals with patient.',
] as const;

function makeMedication(index: number, id: string, overrides: Partial<Medication> = {}): Medication {
  return {
    id,
    name: NAMES[index % NAMES.length],
    dose: `${(index % 200) + 1} mg`,
    route: ROUTES[Math.floor(index / 200) % ROUTES.length],
    frequency: FREQUENCIES[Math.floor(index / 600) % FREQUENCIES.length],
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
    medications,
    source: 'Clinical reconciliation note',
    recordedAt: null,
    ...overrides,
  };
}

const families: [name: string, gradeCase: (index: number) => void][] = [
  [
    'unsupported medication rejection',
    (index) => {
      const note = `${NON_MED_NOTES[index % NON_MED_NOTES.length]} Visit #${index + 1}.`;
      const extracted = extractMedicationRegimensFromNote(note);
      equal(extracted.length, 0, `expected 0 extracted medications, got ${extracted.length}`);

      const med = makeMedication(index, `u-${index}`);
      const snapA = makeSnapshot('earlier', [med]);
      const snapB = makeSnapshot('later', [{ ...med }]);
      const changes = compareSnapshots(snapA, snapB);
      equal(changes.length, 0, `expected 0 snapshot changes, got ${changes.length}`);
    },
  ],
  [
    'exact excerpt preservation',
    (index) => {
      const name = NAMES[index % NAMES.length];
      const beforeDose = (index % 500) + 1;
      const afterDose = beforeDose + 5;
      const earlier = `${name} ${beforeDose} mg daily.`;
      const later = `${name} ${afterDose} mg daily.`;
      const { items } = compareNoteRegimens(earlier, later);
      equal(items.length, 1);
      equal(items[0].medicationName.toLowerCase(), name.toLowerCase());
      equal(items[0].earlierRegimen?.dose, `${beforeDose} mg`);
      equal(items[0].laterRegimen?.dose, `${afterDose} mg`);
      equal(items[0].earlierExcerpt, earlier);
      equal(items[0].laterExcerpt, later);
    },
  ],
  [
    'omission vs discontinuation distinction',
    (index) => {
      const name = NAMES[index % NAMES.length];
      const otherName = NAMES[(index + 1) % NAMES.length];
      const earlier = `${name} ${(index % 100) + 1} mg daily.`;
      const isOmission = index % 2 === 0;
      const later = isOmission ? `${otherName} 10 mg daily.` : `Discontinue ${name}.`;
      const { items } = compareNoteRegimens(earlier, later);
      const match = items.find((item) => item.normalizedName === name.toLowerCase());
      equal(match?.status, isOmission ? 'earlier_only' : 'discontinued');
      if (isOmission) {
        equal(match?.laterExcerpt, null);
      }
    },
  ],
  [
    'unknown provenance preservation',
    (index) => {
      const earlierMed = makeMedication(index, `p-${index}`, { provenance: 'unknown' });
      const laterMed = makeMedication(index, `p-${index}`, {
        dose: `${(index % 200) + 2} mg`,
        provenance: 'unknown',
      });
      const earlier = makeSnapshot('earlier', [earlierMed], { provenance: 'unknown' });
      const later = makeSnapshot('later', [laterMed], { provenance: 'unknown' });

      const report = analyzeSnapshots(earlier, later);
      equal(report.changes.length, 1);
      const change = report.changes[0];
      equal(change.provenance?.hasUnknownProvenance, true);
      equal(change.provenanceFlags?.includes('unknown_provenance'), true);

      const evidenceState = classifyChangeEvidenceState(change);
      equal(evidenceState !== 'resolved', true, 'unknown provenance must not be classified as resolved');
    },
  ],
];

describe('25,000 deterministic accuracy and hallucination-rate cases', () => {
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

    const passed = CASES_PER_FAMILY - failures;
    const hallucinationRate = ((failures / CASES_PER_FAMILY) * 100).toFixed(2);
    console.info(
      `${name} — ${passed}/${CASES_PER_FAMILY} passed, ${failures} failed (hallucination rate: ${hallucinationRate}%)`,
    );
    equal(failures, 0, firstFailures.join('\n'));
  });
});

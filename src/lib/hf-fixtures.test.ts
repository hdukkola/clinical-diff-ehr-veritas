import { describe, expect, it } from 'vitest';
import { analyzeSnapshots, compareSnapshots } from './diff';
import {
  getSyntheticScenario,
  hfDatasetSources as reexportedSources,
  hfNoteComparisonPairs as reexportedNotePairs,
  hfScenarios as reexportedScenarios,
  syntheticScenarios,
} from './fixtures';
import {
  hfDatasetSources,
  hfNoteComparisonPairs,
  hfScenarios,
} from './hf-fixtures';

const ALLOWED_LICENSES = new Set(['MIT', 'CC BY 4.0']);

describe('Hugging Face synthetic fixtures', () => {
  it('exports audited open-licensed synthetic dataset sources and re-exports them from fixtures.ts', () => {
    expect(hfDatasetSources).toHaveLength(3);
    expect(reexportedSources).toBe(hfDatasetSources);
    expect(reexportedScenarios).toBe(hfScenarios);
    expect(reexportedNotePairs).toBe(hfNoteComparisonPairs);

    const datasetNames = hfDatasetSources.map((s) => s.dataset);
    expect(datasetNames).toEqual([
      'oopere/clinical-ner-qdora',
      'ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1',
      'mirobody/MedTEMPO-Bench',
    ]);

    for (const source of hfDatasetSources) {
      expect(source.syntheticOnly).toBe(true);
      expect(ALLOWED_LICENSES.has(source.license)).toBe(true);
      expect(source.sourceUrl).toMatch(/^https:\/\/huggingface\.co\/datasets\//);
      expect(source.rowCount).toBeGreaterThan(0);
      expect(source.split.trim().length).toBeGreaterThan(0);
    }
  });

  it('includes all HF synthetic scenarios in syntheticScenarios without displacing the 10 baseline scenarios', () => {
    expect(hfScenarios).toHaveLength(8);
    expect(syntheticScenarios).toHaveLength(10 + hfScenarios.length);
    expect(syntheticScenarios.slice(10)).toEqual(hfScenarios);

    const sourceMap = new Map(hfDatasetSources.map((s) => [s.dataset, s]));

    for (const scenario of hfScenarios) {
      expect(getSyntheticScenario(scenario.id)).toBe(scenario);
      expect(scenario.patientLabel).toMatch(/synthetic/i);
      expect(scenario.earlier.source).toMatch(/synthetic/i);
      expect(scenario.later.source).toMatch(/synthetic/i);

      expect(scenario.provenance.syntheticOnly).toBe(true);
      expect(ALLOWED_LICENSES.has(scenario.provenance.license)).toBe(true);
      expect(scenario.provenance.rowIndex).toBeGreaterThanOrEqual(0);
      expect(scenario.provenance.split.trim().length).toBeGreaterThan(0);

      const registeredSource = sourceMap.get(scenario.provenance.dataset);
      expect(registeredSource).toBeDefined();
      expect(scenario.provenance.license).toBe(registeredSource?.license);
      expect(scenario.provenance.sourceUrl).toBe(registeredSource?.sourceUrl);

      // Unique medication names per snapshot pair keep UI article roles unambiguous
      const changes = compareSnapshots(scenario.earlier, scenario.later);
      const changeNames = changes.map((c) => c.name);
      expect(new Set(changeNames).size).toBe(changeNames.length);
    }
  });

  it('produces expected diffs, CD-02 evidence links, and provenance statuses across HF scenarios', () => {
    const htn = hfScenarios.find((s) => s.id === 'hf-qdora-htn-escalation')!;
    const htnReport = analyzeSnapshots(htn.earlier, htn.later);
    expect(htnReport.earlierProvenance.status).toBe('documented');
    expect(htnReport.laterProvenance.status).toBe('documented');
    expect(htnReport.changes).toHaveLength(1);
    expect(htnReport.changes[0]).toMatchObject({
      name: 'Lisinopril',
      kind: 'changed',
      fields: [{ field: 'dose', before: '10 mg', after: '20 mg' }],
    });
    expect(htnReport.changes[0].evidenceLinks?.every((l) => l.resolutionStatus === 'resolved')).toBe(
      true,
    );

    const shorthand = hfScenarios.find((s) => s.id === 'hf-qdora-shorthand-to-clean')!;
    const shorthandReport = analyzeSnapshots(shorthand.earlier, shorthand.later);
    expect(shorthandReport.changes.map((c) => [c.name, c.kind])).toEqual([
      ['Amoxicillin', 'changed'],
      ['Tylenol', 'removed'],
      ['Albuterol HFA', 'added'],
    ]);
    const tylenolChange = shorthandReport.changes.find((c) => c.name === 'Tylenol')!;
    expect(tylenolChange.provenance?.earlier.status).toBe('patient_reported');
    expect(tylenolChange.provenanceFlags).toContain('undocumented_field');

    const diabetes = hfScenarios.find((s) => s.id === 'hf-qdora-diabetes-adherence')!;
    const diabetesReport = analyzeSnapshots(diabetes.earlier, diabetes.later);
    expect(diabetesReport.earlierProvenance.status).toBe('patient_reported');
    expect(diabetesReport.laterProvenance.status).toBe('documented');

    const clarusOmission = hfScenarios.find((s) => s.id === 'hf-clarus-cmrd002-omission')!;
    const clarusOmissionDiff = compareSnapshots(clarusOmission.earlier, clarusOmission.later);
    expect(clarusOmissionDiff.map((c) => [c.name, c.kind])).toEqual([
      ['Metoprolol Succinate', 'removed'],
    ]);

    const clarusUnknown = hfScenarios.find((s) => s.id === 'hf-clarus-cmrd005-unknown-ed')!;
    const clarusUnknownReport = analyzeSnapshots(clarusUnknown.earlier, clarusUnknown.later);
    expect(clarusUnknownReport.earlierProvenance.status).toBe('unknown');
    expect(clarusUnknownReport.laterProvenance.status).toBe('unknown');
    expect(clarusUnknownReport.provenanceFlags).toEqual(
      expect.arrayContaining([
        'unknown_provenance',
        'missing_timestamp',
        'ambiguous_source_attribution',
        'undocumented_field',
      ]),
    );

    const medtempoStent = hfScenarios.find((s) => s.id === 'hf-medtempo-90200091-post-stent')!;
    const stentReport = analyzeSnapshots(medtempoStent.earlier, medtempoStent.later);
    expect(stentReport.changes.map((c) => [c.name, c.kind])).toEqual([
      ['Metoprolol Succinate ER', 'added'],
      ['Lipitor', 'added'],
      ['Clopidogrel', 'added'],
    ]);
    expect(stentReport.changes.every((c) => c.provenance?.later.status === 'documented')).toBe(
      true,
    );

    const medtempoLong = hfScenarios.find((s) => s.id === 'hf-medtempo-90200154-longitudinal')!;
    const longDiff = compareSnapshots(medtempoLong.earlier, medtempoLong.later);
    expect(longDiff.map((c) => [c.name, c.kind])).toEqual([
      ['Verapamil Hydrochloride', 'changed'],
      ['Acebutolol', 'removed'],
    ]);
    expect(longDiff[0].fields).toEqual([
      { field: 'dose', before: '80 mg', after: '120 mg' },
    ]);
  });

  it('exports valid synthetic note comparison pairs and matches verbatim QDORA text spans', () => {
    expect(hfNoteComparisonPairs).toHaveLength(8);
    const pairIds = hfNoteComparisonPairs.map((p) => p.id);
    expect(new Set(pairIds).size).toBe(pairIds.length);

    for (const pair of hfNoteComparisonPairs) {
      expect(pair.syntheticOnly).toBe(true);
      expect(ALLOWED_LICENSES.has(pair.license)).toBe(true);
      expect(pair.provenance.syntheticOnly).toBe(true);
      expect(pair.provenance.dataset).toBe(pair.dataset);
      expect(pair.provenance.license).toBe(pair.license);
      expect(pair.earlierLabel.trim().length).toBeGreaterThan(0);
      expect(pair.earlierNote.trim().length).toBeGreaterThan(0);
      expect(pair.laterLabel.trim().length).toBeGreaterThan(0);
      expect(pair.laterNote.trim().length).toBeGreaterThan(0);
      expect(pair.referenceMedications.length).toBeGreaterThan(0);
    }

    // Verify exact span offsets on QDORA scenarios align with verbatim note strings
    const spanPairMapping: Array<{ scenarioId: string; pairId: string }> = [
      { scenarioId: 'hf-qdora-htn-escalation', pairId: 'hf-note-qdora-htn-escalation' },
      { scenarioId: 'hf-qdora-shorthand-to-clean', pairId: 'hf-note-qdora-typos-vs-clean' },
      { scenarioId: 'hf-qdora-asthma-abbreviations', pairId: 'hf-note-qdora-abbreviations' },
      { scenarioId: 'hf-qdora-diabetes-adherence', pairId: 'hf-note-qdora-diabetes-followup' },
    ];

    for (const { scenarioId, pairId } of spanPairMapping) {
      const scenario = hfScenarios.find((s) => s.id === scenarioId)!;
      const pair = hfNoteComparisonPairs.find((p) => p.id === pairId)!;
      for (const med of scenario.earlier.medications) {
        for (const link of med.evidenceLinks ?? []) {
          if (link.span && link.excerpt) {
            expect(pair.earlierNote.slice(link.span.start, link.span.end)).toBe(link.excerpt);
          }
        }
      }
      for (const med of scenario.later.medications) {
        for (const link of med.evidenceLinks ?? []) {
          if (link.span && link.excerpt) {
            expect(pair.laterNote.slice(link.span.start, link.span.end)).toBe(link.excerpt);
          }
        }
      }
    }
  });
});

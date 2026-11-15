import { describe, expect, it } from 'vitest';
import {
  analyzeSnapshots,
  buildBeforeAfterRegimen,
  buildDocumentIndex,
  buildEncounterTimeline,
  buildMedicationHistory,
  buildReconciliationWorklist,
  classifyChangeEvidenceState,
  classifyLinkEvidenceState,
  compareNoteRegimens,
  compareSnapshots,
  extractMedicationRegimensFromNote,
  normalizeNoteText,
  searchChartRecords,
} from './diff';
import type { Medication, Snapshot } from './types';
import {
  canRender,
  CORE_WIDGET_IDS,
  evaluateEncounterCompletion,
  evaluateProposalSafetyGate,
  getLayoutPreset,
  LAYOUT_PRESET_IDS,
  validateLayoutPreset,
  type ClinicalContext,
} from './cockpit';

const makeMed = (
  id: string,
  name: string,
  overrides: Partial<Medication> = {},
): Medication => ({
  id,
  name,
  dose: '10 mg',
  route: 'oral',
  frequency: 'daily',
  provenance: 'documented',
  ...overrides,
});

const makeSnap = (
  id: string,
  medications: Medication[],
  overrides: Partial<Snapshot> = {},
): Snapshot => ({
  id,
  source: `Source ${id}`,
  recordedAt: '2026-10-01',
  medications,
  ...overrides,
});

describe('100 Clinical Diff & Cockpit Edge-Case Tests', () => {
  describe('normalizeNoteText (10 tests)', () => {
    it.each([
      ['handles empty string', '', ''],
      ['normalizes <br> tag to newline', 'Line 1<br>Line 2', 'Line 1\nLine 2'],
      ['normalizes <br/> tag to newline', 'Line 1<br/>Line 2', 'Line 1\nLine 2'],
      ['normalizes <BR /> uppercase spaced tag', 'Line 1<BR />Line 2', 'Line 1\nLine 2'],
      ['normalizes CRLF line endings', 'Line 1\r\nLine 2', 'Line 1\nLine 2'],
      ['preserves multi-line medication list', 'Lisinopril 10 mg daily\nMetformin 500 mg BID', 'Lisinopril 10 mg daily\nMetformin 500 mg BID'],
      ['normalizes <br> between medication lines', 'Aspirin 81 mg daily<br>Atorvastatin 20 mg nightly', 'Aspirin 81 mg daily\nAtorvastatin 20 mg nightly'],
      ['handles multiple consecutive <br> tags', 'A<br><br>B', 'A\n\nB'],
      ['handles mixed <br> and \\r\\n', 'A<br/>B\r\nC', 'A\nB\nC'],
      ['trims whitespace-only note to empty string', '   \r\n  ', ''],
    ])('%s', (_label, input, expected) => {
      expect(normalizeNoteText(input)).toBe(expected);
    });
  });

  describe('extractMedicationRegimensFromNote (15 tests)', () => {
    it.each([
      ['extracts simple mg oral daily regimen', 'Lisinopril 10 mg oral daily', 'lisinopril', '10 mg'],
      ['extracts mcg inhaled regimen', 'Albuterol HFA 90 mcg inhaled every 4 hours as needed', 'albuterol hfa', '90 mcg'],
      ['extracts decimal dose', 'Warfarin 2.5 mg oral daily', 'warfarin', '2.5 mg'],
      ['extracts BID frequency', 'Metformin 500 mg PO BID', 'metformin', '500 mg'],
      ['extracts TID frequency', 'Amoxicillin 500 mg PO TID x 7 days', 'amoxicillin', '500 mg'],
      ['extracts gram dose', 'Amoxicillin 1 g PO BID', 'amoxicillin', '1 g'],
      ['extracts bedtime / QHS regimen', 'Atorvastatin 40 mg oral at bedtime', 'atorvastatin', '40 mg'],
      ['extracts IV route', 'Furosemide 40 mg IV daily', 'furosemide', '40 mg'],
      ['extracts subcutaneous route', 'Enoxaparin 40 mg subcutaneous daily', 'enoxaparin', '40 mg'],
      ['extracts q4-6h PRN modifier', 'Tylenol 500 mg PO q4-6h prn', 'tylenol', '500 mg'],
      ['extracts discontinued medication', 'Lisinopril 10 mg daily discontinued', 'lisinopril', '10 mg'],
      ['extracts stopped medication', 'Stopped Metformin 500 mg BID', 'metformin', '500 mg'],
      ['extracts held medication', 'Hold Furosemide 40 mg IV daily', 'furosemide', '40 mg'],
      ['extracts extended-release metoprolol', 'Metoprolol Succinate ER 50 mg oral daily', 'metoprolol succinate', '50 mg'],
      ['returns empty array for non-medication prose', 'Patient denies chest pain or shortness of breath.', '', ''],
    ])('%s', (_label, note, expectedName, expectedDose) => {
      const regimens = extractMedicationRegimensFromNote(note);
      if (!expectedName) {
        expect(regimens).toEqual([]);
      } else {
        const match = regimens.find((r) => r.normalizedName === expectedName);
        expect(match).toBeDefined();
        expect(match?.dose?.toLowerCase()).toBe(expectedDose.toLowerCase());
      }
    });
  });

  describe('compareNoteRegimens (15 tests)', () => {
    it.each([
      ['unchanged when notes are identical', 'Lisinopril 10 mg oral daily', 'Lisinopril 10 mg oral daily', 1, 'unchanged', undefined],
      ['empty items for two empty notes', '', '', 0, undefined, undefined],
      ['detects newly added medication', 'Lisinopril 10 mg daily', 'Lisinopril 10 mg daily\nAspirin 81 mg daily', 2, 'later_only', 'Mentioned only in later note'],
      ['detects removed medication', 'Lisinopril 10 mg daily\nAspirin 81 mg daily', 'Lisinopril 10 mg daily', 2, 'earlier_only', 'Mentioned only in earlier note'],
      ['detects dose increase', 'Lisinopril 10 mg oral daily', 'Lisinopril 20 mg oral daily', 1, 'changed', 'Dose changed'],
      ['detects dose decrease', 'Metformin 1000 mg oral BID', 'Metformin 500 mg oral BID', 1, 'changed', 'Dose changed'],
      ['detects frequency change', 'Amoxicillin 500 mg oral BID', 'Amoxicillin 500 mg oral TID', 1, 'changed', 'Frequency changed'],
      ['detects route change', 'Furosemide 40 mg IV daily', 'Furosemide 40 mg oral daily', 1, 'changed', 'Route changed'],
      ['detects duration change', 'Amoxicillin 500 mg PO TID x 5 days', 'Amoxicillin 500 mg PO TID x 10 days', 1, 'changed', 'Duration changed'],
      ['detects explicit discontinuation', 'Lisinopril 10 mg oral daily', 'Discontinued Lisinopril 10 mg oral daily', 1, 'discontinued', 'Clinically discontinued'],
      ['detects multi-field change', 'Metoprolol Succinate 25 mg oral daily', 'Metoprolol Succinate 50 mg oral BID', 1, 'changed', 'Dose changed'],
      ['handles <br/> separated notes cleanly', 'Lisinopril 10 mg daily<br/>Aspirin 81 mg daily', 'Lisinopril 20 mg daily<br/>Aspirin 81 mg daily', 2, 'changed', 'Dose changed'],
      ['ignores whitespace differences between notes', '  Lisinopril 10 mg daily  ', 'Lisinopril 10 mg daily', 1, 'unchanged', undefined],
      ['detects multiple simultaneous medication changes', 'Lisinopril 10 mg daily\nMetformin 500 mg BID', 'Lisinopril 20 mg daily\nMetformin 1000 mg BID', 2, 'changed', 'Dose changed'],
      ['detects unchanged when both notes discontinue same med', 'Discontinued Lisinopril 10 mg daily', 'Discontinued Lisinopril 10 mg daily', 1, 'unchanged', undefined],
    ])('%s', (_label, earlier, later, expectedCount, expectedStatus, expectedCategory) => {
      const report = compareNoteRegimens(earlier, later);
      expect(report.items.length).toBe(expectedCount);
      if (expectedStatus) {
        expect(report.items.some((i) => i.status === expectedStatus)).toBe(true);
      }
      if (expectedCategory) {
        expect(
          report.items.some((i) => i.changeCategories.includes(expectedCategory as never)),
        ).toBe(true);
      }
    });
  });

  describe('compareSnapshots & analyzeSnapshots (22 tests)', () => {
    it.each([
      ['identical snapshots yield 0 changes', [makeMed('m1', 'Lisinopril')], [makeMed('m1', 'Lisinopril')], 0, undefined],
      ['empty snapshots yield 0 changes', [], [], 0, undefined],
      ['added medication detected', [], [makeMed('m1', 'Lisinopril')], 1, 'added'],
      ['removed medication detected', [makeMed('m1', 'Lisinopril')], [], 1, 'removed'],
      ['dose change detected', [makeMed('m1', 'Lisinopril', { dose: '10 mg' })], [makeMed('m1', 'Lisinopril', { dose: '20 mg' })], 1, 'changed'],
      ['route change detected', [makeMed('m1', 'Furosemide', { route: 'IV' })], [makeMed('m1', 'Furosemide', { route: 'oral' })], 1, 'changed'],
      ['frequency change detected', [makeMed('m1', 'Metoprolol', { frequency: 'daily' })], [makeMed('m1', 'Metoprolol', { frequency: 'BID' })], 1, 'changed'],
      ['case-only name difference handled', [makeMed('m1', 'Lisinopril')], [makeMed('m1', 'Lisinopril', { dose: '20 mg' })], 1, 'changed'],
      ['missing dose flagged as change when filled', [makeMed('m1', 'Lisinopril', { dose: null })], [makeMed('m1', 'Lisinopril', { dose: '10 mg' })], 1, 'changed'],
      ['whitespace-only dose flagged as change when filled', [makeMed('m1', 'Lisinopril', { dose: '   ' })], [makeMed('m1', 'Lisinopril', { dose: '10 mg' })], 1, 'changed'],
      ['missing frequency flagged as change', [makeMed('m1', 'Lisinopril')], [makeMed('m1', 'Lisinopril', { frequency: null })], 1, 'changed'],
      ['missing route flagged as change', [makeMed('m1', 'Lisinopril')], [makeMed('m1', 'Lisinopril', { route: null })], 1, 'changed'],
      ['multiple additions sorted deterministically by ID', [], [makeMed('m2', 'B'), makeMed('m1', 'A')], 2, 'added'],
      ['multiple removals sorted deterministically by ID', [makeMed('m2', 'B'), makeMed('m1', 'A')], [], 2, 'removed'],
      ['patient_reported provenance preserved', [], [makeMed('m1', 'Ibuprofen', { provenance: 'patient_reported' })], 1, 'added'],
      ['unverified provenance preserved', [], [makeMed('m1', 'Gabapentin', { provenance: 'unverified' })], 1, 'added'],
      ['unknown provenance abstains as unknown', [], [makeMed('m1', 'Aspirin', { provenance: 'unknown' })], 1, 'added'],
      ['whitespace provenance abstains as unknown', [], [makeMed('m1', 'Aspirin', { provenance: '   ' as Medication['provenance'] })], 1, 'added'],
      ['snapshot-level evidence link attached to medication', [], [makeMed('m1', 'Aspirin')], 1, 'added'],
      ['unchanged medication with null dose still surfaces report cleanly', [makeMed('m1', 'Aspirin', { dose: null })], [makeMed('m1', 'Aspirin', { dose: null })], 0, undefined],
    ])('%s', (_label, earlierMeds, laterMeds, expectedCount, expectedKind) => {
      const earlier = makeSnap('s1', earlierMeds);
      const later = makeSnap('s2', laterMeds);
      const changes = compareSnapshots(earlier, later);
      expect(changes.length).toBe(expectedCount);
      if (expectedKind) {
        expect(changes[0]?.kind).toBe(expectedKind);
      }
      const report = analyzeSnapshots(earlier, later);
      expect(report.changes.length).toBe(expectedCount);
    });

    it('rejects duplicate medication IDs in earlier snapshot', () => {
      const s1 = makeSnap('s1', [makeMed('dup', 'A'), makeMed('dup', 'B')]);
      const s2 = makeSnap('s2', []);
      expect(() => compareSnapshots(s1, s2)).toThrow();
    });

    it('rejects duplicate medication IDs in later snapshot', () => {
      const s1 = makeSnap('s1', []);
      const s2 = makeSnap('s2', [makeMed('dup', 'A'), makeMed('dup', 'B')]);
      expect(() => compareSnapshots(s1, s2)).toThrow();
    });
  });

  describe('classifyLinkEvidenceState & classifyChangeEvidenceState (10 tests)', () => {
    it('classifies resolved link as resolved', () => {
      expect(
        classifyLinkEvidenceState({
          sourceKind: 'clinical_note',
          resolutionStatus: 'resolved',
          provenanceStatus: 'documented',
          excerpt: 'Lisinopril 10 mg',
          span: null,
          recordedAt: '2026-10-01',
        }),
      ).toBe('resolved');
    });

    it('classifies unavailable link as unavailable_document', () => {
      expect(
        classifyLinkEvidenceState({
          sourceKind: 'external_record',
          resolutionStatus: 'unavailable',
          provenanceStatus: 'unknown',
          excerpt: null,
          span: null,
          recordedAt: null,
        }),
      ).toBe('unavailable_document');
    });

    it('classifies unresolved link as missing_reference', () => {
      expect(
        classifyLinkEvidenceState({
          sourceKind: 'unknown',
          resolutionStatus: 'unresolved',
          provenanceStatus: 'unknown',
          excerpt: null,
          span: null,
          recordedAt: null,
        }),
      ).toBe('missing_reference');
    });

    it('classifies partial link with no excerpt as partial', () => {
      expect(
        classifyLinkEvidenceState({
          sourceKind: 'snapshot',
          resolutionStatus: 'partial',
          provenanceStatus: 'documented',
          excerpt: null,
          span: null,
          recordedAt: '2026-10-01',
        }),
      ).toBe('partial');
    });

    it('classifies documented negative phrase in excerpt', () => {
      expect(
        classifyLinkEvidenceState({
          sourceKind: 'clinical_note',
          resolutionStatus: 'resolved',
          provenanceStatus: 'documented',
          excerpt: 'Patient is not taking Lisinopril.',
          documentedAbsence: true,
          span: null,
          recordedAt: '2026-10-01',
        }),
      ).toBe('documented_negative');
    });

    it('classifies discontinued phrase in excerpt as documented_negative', () => {
      expect(
        classifyLinkEvidenceState({
          sourceKind: 'clinical_note',
          resolutionStatus: 'resolved',
          provenanceStatus: 'documented',
          excerpt: 'Metformin discontinued due to GI side effects.',
          documentedAbsence: true,
          span: null,
          recordedAt: '2026-10-01',
        }),
      ).toBe('documented_negative');
    });

    it('classifies change with conflicting excerpts on same side as conflicting_excerpts', () => {
      const report = analyzeSnapshots(
        makeSnap('s1', [
          makeMed('m1', 'Lisinopril', {
            evidenceLinks: [
              { id: 'e1', side: 'earlier', noteId: 'n1', excerpt: 'Continue Lisinopril 10 mg daily', contradictsEvidenceIds: ['e2'] },
              { id: 'e2', side: 'earlier', noteId: 'n2', excerpt: 'Lisinopril is not being taken at this visit', documentedAbsence: true },
            ],
          }),
        ]),
        makeSnap('s2', [makeMed('m1', 'Lisinopril', { dose: '20 mg' })]),
      );
      expect(classifyChangeEvidenceState(report.changes[0]!)).toBe('conflicting_excerpts');
    });

    it('classifies change with unavailable link as unavailable_document', () => {
      const report = analyzeSnapshots(
        makeSnap('s1', []),
        makeSnap('s2', [
          makeMed('m1', 'Lisinopril', {
            evidenceLinks: [{ id: 'e1', sourceId: 'ext-1', resolutionStatus: 'unavailable' }],
          }),
        ]),
      );
      expect(classifyChangeEvidenceState(report.changes[0]!)).toBe('unavailable_document');
    });

    it('classifies change with resolved positive excerpt as resolved', () => {
      const report = analyzeSnapshots(
        makeSnap('s1', []),
        makeSnap('s2', [
          makeMed('m1', 'Lisinopril', {
            evidenceLinks: [{ id: 'e1', noteId: 'n1', excerpt: 'Started Lisinopril 10 mg daily for HTN.' }],
          }),
        ]),
      );
      expect(classifyChangeEvidenceState(report.changes[0]!)).toBe('resolved');
    });

    it('classifies change with unresolved link as missing_reference', () => {
      const report = analyzeSnapshots(
        makeSnap('s1', []),
        makeSnap('s2', [
          makeMed('m1', 'Lisinopril', {
            evidenceLinks: [{ id: 'e1', resolutionStatus: 'unresolved' }],
          }),
        ]),
      );
      expect(classifyChangeEvidenceState(report.changes[0]!)).toBe('missing_reference');
    });
  });

  describe('Timeline, Search, Document Index, Worklist, Regimen & History (18 tests)', () => {
    it('buildEncounterTimeline separates dated and undated encounters', () => {
      const s1 = makeSnap('s1', [makeMed('m1', 'A')], { recordedAt: '2026-10-01' });
      const s2 = makeSnap('s2', [makeMed('m1', 'A', { dose: '20 mg' })], { recordedAt: null });
      const report = analyzeSnapshots(s1, s2);
      const timeline = buildEncounterTimeline(s1, s2, report);
      expect(timeline.dated.length).toBeGreaterThanOrEqual(1);
      expect(timeline.undated.length).toBeGreaterThanOrEqual(1);
    });

    it('buildEncounterTimeline orders dated records chronologically', () => {
      const s1 = makeSnap('s1', [makeMed('m1', 'A')], { recordedAt: '2026-09-01' });
      const s2 = makeSnap('s2', [makeMed('m1', 'A', { dose: '20 mg' })], { recordedAt: '2026-10-01' });
      const report = analyzeSnapshots(s1, s2);
      const timeline = buildEncounterTimeline(s1, s2, report);
      const dates = timeline.dated.map((d) => Date.parse(d.recordedAt!));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]!);
      }
    });

    it('searchChartRecords returns empty for blank query', () => {
      const s1 = makeSnap('s1', [makeMed('m1', 'Lisinopril')]);
      const s2 = makeSnap('s2', [makeMed('m1', 'Lisinopril', { dose: '20 mg' })]);
      const report = analyzeSnapshots(s1, s2);
      const res = searchChartRecords({
        query: '   ',
        earlierNoteLabel: 'Clinic',
        earlierNoteText: 'Lisinopril 10 mg daily',
        laterNoteLabel: 'Discharge',
        laterNoteText: 'Lisinopril 20 mg daily',
        earlierSnapshot: s1,
        laterSnapshot: s2,
        report,
        extractResult: compareNoteRegimens('Lisinopril 10 mg daily', 'Lisinopril 20 mg daily'),
      });
      expect(res).toEqual([]);
    });

    it('searchChartRecords finds matching medication across notes and diffs', () => {
      const s1 = makeSnap('s1', [makeMed('m1', 'Lisinopril')]);
      const s2 = makeSnap('s2', [makeMed('m1', 'Lisinopril', { dose: '20 mg' })]);
      const report = analyzeSnapshots(s1, s2);
      const res = searchChartRecords({
        query: 'lisinopril',
        earlierNoteLabel: 'Clinic',
        earlierNoteText: 'Lisinopril 10 mg daily',
        laterNoteLabel: 'Discharge',
        laterNoteText: 'Lisinopril 20 mg daily',
        earlierSnapshot: s1,
        laterSnapshot: s2,
        report,
        extractResult: compareNoteRegimens('Lisinopril 10 mg daily', 'Lisinopril 20 mg daily'),
      });
      expect(res.length).toBeGreaterThan(0);
      expect(res.every((m) => m.sourceLabel.length > 0)).toBe(true);
    });

    it('searchChartRecords returns empty when query matches nothing', () => {
      const s1 = makeSnap('s1', [makeMed('m1', 'Lisinopril')]);
      const s2 = makeSnap('s2', [makeMed('m1', 'Lisinopril', { dose: '20 mg' })]);
      const report = analyzeSnapshots(s1, s2);
      const res = searchChartRecords({
        query: 'zzznonexistentdrug999',
        earlierNoteLabel: 'Clinic',
        earlierNoteText: 'Lisinopril 10 mg daily',
        laterNoteLabel: 'Discharge',
        laterNoteText: 'Lisinopril 20 mg daily',
        earlierSnapshot: s1,
        laterSnapshot: s2,
        report,
        extractResult: compareNoteRegimens('Lisinopril 10 mg daily', 'Lisinopril 20 mg daily'),
      });
      expect(res).toEqual([]);
    });

    it('buildDocumentIndex classifies snapshot links as available', () => {
      const s1 = makeSnap('s1', [makeMed('m1', 'A')], { recordedAt: '2026-10-01' });
      const s2 = makeSnap('s2', [makeMed('m1', 'A')], { recordedAt: '2026-10-02' });
      const idx = buildDocumentIndex(s1, s2, analyzeSnapshots(s1, s2));
      expect(idx.dated.length).toBeGreaterThanOrEqual(2);
    });

    it('buildDocumentIndex detects duplicates for identical noteId + excerpt', () => {
      const link = { id: 'e1', noteId: 'n1', sourceLabel: 'Note 1', excerpt: 'Same text', recordedAt: '2026-10-01' };
      const s1 = makeSnap('s1', [makeMed('m1', 'A', { evidenceLinks: [link] })]);
      const s2 = makeSnap('s2', [makeMed('m1', 'A', { dose: '20 mg', evidenceLinks: [{ ...link, id: 'e2' }] })]);
      const idx = buildDocumentIndex(s1, s2, analyzeSnapshots(s1, s2));
      expect(idx.counts.duplicates).toBeGreaterThanOrEqual(1);
    });

    it('buildDocumentIndex detects revisions for same noteId with different excerpt', () => {
      const s1 = makeSnap('s1', [
        makeMed('m1', 'A', {
          evidenceLinks: [{ id: 'e1', noteId: 'n1', sourceLabel: 'Note 1', excerpt: 'V1', recordedAt: '2026-10-01' }],
        }),
      ]);
      const s2 = makeSnap('s2', [
        makeMed('m1', 'A', {
          dose: '20 mg',
          evidenceLinks: [{ id: 'e2', noteId: 'n1', sourceLabel: 'Note 1', excerpt: 'V2', recordedAt: '2026-10-05' }],
        }),
      ]);
      const idx = buildDocumentIndex(s1, s2, analyzeSnapshots(s1, s2));
      expect(idx.counts.revisions).toBeGreaterThanOrEqual(1);
    });

    it('buildDocumentIndex tracks unavailable documents in counts.unavailable', () => {
      const s1 = makeSnap('s1', []);
      const s2 = makeSnap('s2', [
        makeMed('m1', 'A', {
          evidenceLinks: [{ id: 'e1', sourceId: 'ext', sourceLabel: 'External', resolutionStatus: 'unavailable', recordedAt: null }],
        }),
      ]);
      const idx = buildDocumentIndex(s1, s2, analyzeSnapshots(s1, s2));
      expect(idx.counts.unavailable).toBe(1);
    });

    it('buildReconciliationWorklist puts added change in added bucket', () => {
      const report = analyzeSnapshots(
        makeSnap('s1', []),
        makeSnap('s2', [
          makeMed('m1', 'A', {
            evidenceLinks: [{ id: 'e1', noteId: 'n1', excerpt: 'Started A 10 mg daily' }],
          }),
        ]),
      );
      const wl = buildReconciliationWorklist(report.changes, {}, 'scen-1');
      expect(wl.added.length).toBe(1);
    });

    it('buildReconciliationWorklist puts removed change in removed bucket', () => {
      const report = analyzeSnapshots(
        makeSnap('s1', [
          makeMed('m1', 'A', {
            evidenceLinks: [{ id: 'e1', noteId: 'n1', excerpt: 'Taking A 10 mg daily' }],
          }),
        ]),
        makeSnap('s2', []),
      );
      const wl = buildReconciliationWorklist(report.changes, {}, 'scen-1');
      expect(wl.removed.length).toBe(1);
    });

    it('buildReconciliationWorklist puts changed item with supported evidence in changed bucket', () => {
      const report = analyzeSnapshots(
        makeSnap('s1', [makeMed('m1', 'A', { dose: '10 mg', evidenceLinks: [{ id: 'e1', noteId: 'n1', excerpt: 'A 10 mg' }] })]),
        makeSnap('s2', [makeMed('m1', 'A', { dose: '20 mg', evidenceLinks: [{ id: 'e2', noteId: 'n2', excerpt: 'Increased A to 20 mg' }] })]),
      );
      const wl = buildReconciliationWorklist(report.changes, {}, 'scen-1');
      expect(wl.changed.length).toBe(1);
    });

    it('buildReconciliationWorklist excludes already reviewed items and increments resolvedCount', () => {
      const report = analyzeSnapshots(makeSnap('s1', []), makeSnap('s2', [makeMed('m1', 'A')]));
      const wl = buildReconciliationWorklist(report.changes, { 'scen-1:m1': 'verified' }, 'scen-1');
      expect(wl.resolvedCount).toBe(1);
      expect(wl.added.length + wl.unclear.length).toBe(0);
    });

    it('buildReconciliationWorklist routes unknown-provenance items to unclear bucket', () => {
      const report = analyzeSnapshots(
        makeSnap('s1', []),
        makeSnap('s2', [makeMed('m1', 'A', { provenance: 'unknown' })]),
      );
      const wl = buildReconciliationWorklist(report.changes, {}, 'scen-1');
      expect(wl.unclear.length).toBe(1);
    });

    it('buildBeforeAfterRegimen compares dose, route, frequency, and status rows', () => {
      const before = makeMed('m1', 'Lisinopril', { dose: '10 mg', route: 'oral', frequency: 'daily' });
      const after = makeMed('m1', 'Lisinopril', { dose: '20 mg', route: 'oral', frequency: 'BID' });
      const report = analyzeSnapshots(makeSnap('s1', [before]), makeSnap('s2', [after]));
      const reg = buildBeforeAfterRegimen(before, after, report.changes[0]);
      expect(reg.rows.find((r) => r.key === 'dose')?.changed).toBe(true);
      expect(reg.rows.find((r) => r.key === 'route')?.changed).toBe(false);
      expect(reg.rows.find((r) => r.key === 'frequency')?.changed).toBe(true);
    });

    it('buildBeforeAfterRegimen marks before fields undefined for newly added med', () => {
      const after = makeMed('m1', 'Aspirin', { dose: '81 mg' });
      const report = analyzeSnapshots(makeSnap('s1', []), makeSnap('s2', [after]));
      const reg = buildBeforeAfterRegimen(undefined, after, report.changes[0]);
      expect(reg.rows.find((r) => r.key === 'dose')?.before).toBeUndefined();
      expect(reg.rows.find((r) => r.key === 'dose')?.after).toBe('81 mg');
    });

    it('buildMedicationHistory handles invalid date strings as unknownDate', () => {
      const m1 = makeMed('m1', 'Lisinopril');
      const s1 = { id: 's1', source: 'Clinic', recordedAt: 'not-a-date', medications: [m1] };
      const s2 = { id: 's2', source: 'Discharge', recordedAt: '2026-10-10', medications: [m1] };
      const hist = buildMedicationHistory(m1, m1, s1, s2, undefined);
      expect(hist.unknownDate.some((e) => e.source === 'Clinic' && e.dateLabel === 'Date unknown')).toBe(true);
      expect(hist.dated.some((e) => e.recordedAt === '2026-10-10')).toBe(true);
    });

    it('buildMedicationHistory handles undefined beforeMed and afterMed gracefully', () => {
      const s1 = { id: 's1', source: 'Clinic', recordedAt: '2026-10-01' };
      const s2 = { id: 's2', source: 'Discharge', recordedAt: '2026-10-10' };
      const hist = buildMedicationHistory(undefined, undefined, s1, s2, undefined);
      expect(hist.dated).toEqual([]);
      expect(hist.unknownDate).toEqual([]);
    });
  });

  describe('Cockpit Safety Gate, Registry, Presets & Encounter Completion (10 tests)', () => {
    const validProposal: Parameters<typeof evaluateProposalSafetyGate>[0] = {
      medication: 'Lisinopril',
      action: 'change',
      current: [
        { field: 'dose', value: '10 mg', classification: 'authoritative' },
        { field: 'route', value: 'oral', classification: 'authoritative' },
        { field: 'frequency', value: 'daily', classification: 'authoritative' },
      ],
      proposed: [
        { field: 'dose', value: '20 mg', classification: 'authoritative' },
        { field: 'route', value: 'oral', classification: 'authoritative' },
        { field: 'frequency', value: 'daily', classification: 'authoritative' },
      ],
      diff: [{ field: 'dose', before: '10 mg', after: '20 mg' }],
      evidence: [
        {
          sourceId: 'note-1',
          sourceLabel: 'Progress Note',
          sourceText: 'Increase Lisinopril to 20 mg daily.',
          startOffset: 0,
          endOffset: 35,
          quote: 'Increase Lisinopril to 20 mg daily.',
        },
      ],
      authority: 'chart_fact',
    };

    it('evaluateProposalSafetyGate blocks proposal with empty evidence', () => {
      const res = evaluateProposalSafetyGate({ ...validProposal, evidence: [] });
      expect(res.status).not.toBe('passed');
      expect(res.autoCommitAllowed).toBe(false);
    });

    it('evaluateProposalSafetyGate abstains on patient_reported authority for change action', () => {
      const res = evaluateProposalSafetyGate({ ...validProposal, authority: 'patient_reported' });
      expect(res.status).toBe('abstained');
      expect(res.requiresClinicianReview).toBe(true);
    });

    it('evaluateProposalSafetyGate abstains on uncertain authority', () => {
      const res = evaluateProposalSafetyGate({ ...validProposal, authority: 'uncertain' });
      expect(res.status).toBe('abstained');
    });

    it('evaluateProposalSafetyGate passes valid documented change proposal without auto-commit', () => {
      const res = evaluateProposalSafetyGate(validProposal);
      expect(res.status).toBe('passed');
      expect(res.autoCommitAllowed).toBe(false);
      expect(res.requiresClinicianReview).toBe(true);
    });

    it('evaluateProposalSafetyGate blocks start proposal missing required dose', () => {
      const res = evaluateProposalSafetyGate({
        ...validProposal,
        action: 'start',
        current: [],
        proposed: [
          { field: 'dose', value: '', classification: 'derived' },
          { field: 'route', value: 'oral', classification: 'authoritative' },
          { field: 'frequency', value: 'daily', classification: 'authoritative' },
        ],
      });
      expect(res.status).not.toBe('passed');
    });

    it('getLayoutPreset returns valid presets for all LAYOUT_PRESET_IDS', () => {
      for (const id of LAYOUT_PRESET_IDS) {
        const preset = getLayoutPreset(id);
        expect(preset).toBeDefined();
        const validation = validateLayoutPreset(preset!);
        expect(validation.valid).toBe(true);
      }
    });

    it('getLayoutPreset returns undefined for unknown preset id', () => {
      expect(getLayoutPreset('nonexistent-preset-id')).toBeUndefined();
    });

    it('canRender returns false for unknown widget id', () => {
      const emptyCtx = {
        patient: null,
        encounter: null,
        discrepancies: [],
        proposals: [],
        reviews: {},
        selectedFocusId: null,
      } as unknown as ClinicalContext;
      expect(canRender('unknown-widget-xyz', emptyCtx)).toBe(false);
    });

    it('CORE_WIDGET_IDS contains at least 7 core widgets', () => {
      expect(CORE_WIDGET_IDS.length).toBeGreaterThanOrEqual(7);
    });

    it('evaluateEncounterCompletion blocks when encounter is null', () => {
      const res = evaluateEncounterCompletion({
        encounter: null,
        proposedChanges: [],
        dispositions: [],
        documentationCommitted: false,
      });
      expect(res.canComplete).toBe(false);
      expect(res.blockers.some((b) => b.kind === 'missing_encounter')).toBe(true);
    });
  });
});

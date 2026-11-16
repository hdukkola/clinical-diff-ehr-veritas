// @vitest-environment node
import { equal, ok } from 'node:assert/strict';
import { describe, it } from 'vitest';
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
  EVIDENCE_STATE_LABELS,
  getConflictingEvidencePairs,
  searchChartRecords,
} from './diff';
import {
  evaluateEncounterCompletion,
  evaluateProposalSafetyGate,
  type EncounterContext,
  type ProposedChange,
  type ReviewDisposition,
} from './cockpit';
import {
  expandFlatReviews,
  flattenReviewsByScenario,
  isValidReviewDecision,
  parseReviewKey,
  type ReviewDecision,
  type ReviewsByScenario,
} from './session-store';
import type {
  EvidenceLink,
  EvidenceSourceKind,
  Medication,
  Snapshot,
} from './types';

const DRUGS = [
  'Lisinopril',
  'Metformin',
  'Aspirin',
  'Atorvastatin',
  'Amoxicillin',
  'Prednisone',
  'Glipizide',
  'Warfarin',
  'Furosemide',
  'Enoxaparin',
  'Clopidogrel',
  'Ursodiol',
] as const;

const ROUTES = ['oral', 'subcutaneous', 'intravenous', 'inhalation'] as const;
const FREQUENCIES = [
  'daily',
  'twice daily',
  'three times daily',
  'at bedtime',
  'every 6 hours as needed',
] as const;

const CLINICAL_KINDS: readonly EvidenceSourceKind[] = [
  'clinical_note',
  'discharge_summary',
  'pharmacy_fill',
  'external_record',
];

const AMBIGUOUS_LABELS = [
  'Outpatient note vs. patient report',
  'Ambiguous clinic attribution',
  'Conflicting medication source ??',
  'Disputed discharge vs. patient report',
  'Unclear external or unknown record',
] as const;

const UNKNOWN_LABELS = [
  'unknown',
  'not documented',
  'unspecified',
  'source unknown',
  'unattributed',
  'n/a',
] as const;

const REVIEW_CYCLE: readonly ReviewDecision[] = ['verified', 'flagged', 'deferred'];

function seededInt(seed: number, step: number): number {
  let t = (seed + step * 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function makeCaseId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(5, '0')}`;
}

function makeBaseMedication(
  index: number,
  id: string,
  overrides: Partial<Medication> = {},
): Medication {
  const h = seededInt(index, 1);
  return {
    id,
    name: DRUGS[h % DRUGS.length]!,
    dose: `${((h >>> 4) % 90) + 5} mg`,
    route: ROUTES[(h >>> 8) % ROUTES.length]!,
    frequency: FREQUENCIES[(h >>> 12) % FREQUENCIES.length]!,
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
    source: 'Outpatient reconciliation record',
    recordedAt: '2026-10-01',
    sourceKind: 'clinical_note',
    medications,
    ...overrides,
  };
}

function formatFollowUpExport(
  items: Array<{
    name: string;
    label: string;
    quotes: string[];
    decision?: 'clarify' | 'reviewed';
  }>,
  simulated = true,
): string | null {
  const flagged = items.filter((item) => item.decision === 'clarify');
  if (flagged.length === 0) return null;
  const mode = simulated ? 'Local standby' : 'Local model';
  const sections = flagged.map((entry) =>
    [
      `Can you confirm whether ${entry.name} belongs on the discharge medication list?`,
      `Source excerpts from ${entry.label.toLowerCase()}:`,
      ...entry.quotes.map((q) => `> ${q.replace(/\r?\n/g, '\n> ')}`),
    ].join('\n'),
  );
  return (
    [
      'Discharge medication follow-ups',
      `${mode} · Review required before chart commit`,
      ...sections,
      'Review both source notes before recording a medication decision.',
    ].join('\n\n') + '\n'
  );
}

function formatAuditCsv(
  audit: Array<{ ts: string; actor: string; action: string; target: string }>,
): string {
  return (
    'time,actor,action,target\n' +
    audit
      .map((a) =>
        [a.ts, a.actor, a.action, a.target]
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n')
  );
}

const families: Array<{
  name: string;
  count: number;
  gradeCase: (index: number) => void;
}> = [
  {
    name: '1. 10,000 exact earlier/later excerpts',
    count: 10_000,
    gradeCase: (index) => {
      const caseId = makeCaseId('EV-EXCERPT', index);
      const h = seededInt(index, 101);
      const drug = DRUGS[index % DRUGS.length]!;
      const route = ROUTES[(h >>> 3) % ROUTES.length]!;
      const freqBefore = FREQUENCIES[(h >>> 6) % FREQUENCIES.length]!;
      const freqAfter = FREQUENCIES[((h >>> 6) + 1) % FREQUENCIES.length]!;
      const doseBeforeNum = (index % 80) + 5;
      const doseAfterNum = doseBeforeNum + ((index % 7) + 1) * 5;
      const doseBefore = `${doseBeforeNum} mg`;
      const doseAfter = `${doseAfterNum} mg`;

      const earlierSentence = `${drug} ${doseBefore} ${route} ${freqBefore}.`;
      const laterSentence =
        index % 5 === 0
          ? `${drug} ${doseAfter} ${route} ${freqAfter}. Continue ${drug} ${doseAfter} ${route} ${freqAfter}.`
          : `${drug} ${doseAfter} ${route} ${freqAfter}.`;

      const noteComparison = compareNoteRegimens(earlierSentence, laterSentence);
      equal(noteComparison.items.length, 1, `${caseId}: expected 1 note regimen item`);
      const noteItem = noteComparison.items[0]!;
      equal(noteItem.status, 'changed', `${caseId}: expected changed note regimen`);
      equal(noteItem.earlierRegimen?.dose, doseBefore, `${caseId}: earlier dose mismatch`);
      equal(noteItem.laterRegimen?.dose, doseAfter, `${caseId}: later dose mismatch`);

      const expectedEarlierExcerpt = earlierSentence;
      const expectedLaterExcerpt =
        index % 5 === 0
          ? `${drug} ${doseAfter} ${route} ${freqAfter}. | Continue ${drug} ${doseAfter} ${route} ${freqAfter}.`
          : laterSentence;
      equal(noteItem.earlierExcerpt, expectedEarlierExcerpt, `${caseId}: earlier excerpt mismatch`);
      equal(noteItem.laterExcerpt, expectedLaterExcerpt, `${caseId}: later excerpt mismatch`);

      const medId = `med-${index}`;
      const earlierKind = CLINICAL_KINDS[index % CLINICAL_KINDS.length]!;
      const laterKind = CLINICAL_KINDS[(index + 1) % CLINICAL_KINDS.length]!;
      const earlierSpan = {
        start: 0,
        end: earlierSentence.length,
        line: (index % 10) + 1,
        column: 1,
      };
      const laterSpan = {
        start: 0,
        end: laterSentence.length,
        line: (index % 12) + 1,
        column: 1,
      };

      const earlierMed: Medication = {
        id: medId,
        name: drug,
        dose: doseBefore,
        route,
        frequency: freqBefore,
        provenance: {
          status: 'documented',
          sourceKind: earlierKind,
          sourceLabel: `Earlier note ${caseId}`,
          recordedAt: '2026-10-01',
          verified: true,
        },
        evidenceLinks: [
          {
            id: `ev-e-${index}`,
            noteId: `note-e-${index}`,
            sourceId: `src-e-${index}`,
            medicationId: medId,
            sourceLabel: `Earlier note ${caseId}`,
            sourceKind: earlierKind,
            section: 'Medications on admission',
            field: 'dose',
            excerpt: earlierSentence,
            span: earlierSpan,
            recordedAt: '2026-10-01',
            side: 'earlier',
          },
        ],
      };

      const laterMed: Medication = {
        id: medId,
        name: drug,
        dose: doseAfter,
        route,
        frequency: freqAfter,
        provenance: {
          status: 'documented',
          sourceKind: laterKind,
          sourceLabel: `Later note ${caseId}`,
          recordedAt: '2026-10-15',
          verified: true,
        },
        evidenceLinks: [
          {
            id: `ev-l-${index}`,
            noteId: `note-l-${index}`,
            sourceId: `src-l-${index}`,
            medicationId: medId,
            sourceLabel: `Later note ${caseId}`,
            sourceKind: laterKind,
            section: 'Discharge medications',
            field: 'dose',
            excerpt: laterSentence,
            span: laterSpan,
            recordedAt: '2026-10-15',
            side: 'later',
          },
        ],
      };

      const earlierSnap = makeSnapshot(`snap-e-${index}`, [earlierMed], {
        source: `Earlier note ${caseId}`,
        recordedAt: '2026-10-01',
        sourceKind: earlierKind,
      });
      const laterSnap = makeSnapshot(`snap-l-${index}`, [laterMed], {
        source: `Later note ${caseId}`,
        recordedAt: '2026-10-15',
        sourceKind: laterKind,
      });

      const report = analyzeSnapshots(earlierSnap, laterSnap);
      equal(report.changes.length, 1, `${caseId}: expected 1 snapshot change`);
      const change = report.changes[0]!;
      equal(classifyChangeEvidenceState(change), 'resolved', `${caseId}: change state must be resolved`);
      equal(change.evidenceLinks?.length, 2, `${caseId}: expected 2 resolved evidence links`);
      equal(change.evidenceLinks?.[0]?.excerpt, earlierSentence, `${caseId}: earlier link excerpt`);
      equal(change.evidenceLinks?.[1]?.excerpt, laterSentence, `${caseId}: later link excerpt`);
      equal(change.evidenceLinks?.[0]?.span?.end, earlierSentence.length);
      equal(change.evidenceLinks?.[1]?.span?.end, laterSentence.length);

      const beforeAfter = buildBeforeAfterRegimen(earlierMed, laterMed, change);
      equal(beforeAfter.earlierEvidence.length, 1);
      equal(beforeAfter.laterEvidence.length, 1);
      equal(beforeAfter.earlierEvidence[0]?.excerpt, earlierSentence);
      equal(beforeAfter.laterEvidence[0]?.excerpt, laterSentence);
      equal(beforeAfter.earlierEvidence[0]?.state, 'resolved');
      equal(beforeAfter.laterEvidence[0]?.state, 'resolved');

      if (index % 4 === 0) {
        const gatePass = evaluateProposalSafetyGate(
          {
            medication: drug,
            action: 'change',
            current: [
              { field: 'dose', value: doseBefore },
              { field: 'route', value: route },
              { field: 'frequency', value: freqBefore },
            ],
            proposed: [
              { field: 'dose', value: doseAfter },
              { field: 'route', value: route },
              { field: 'frequency', value: freqAfter },
            ],
            diff: [{ field: 'dose', before: doseBefore, after: doseAfter }],
            evidence: [
              {
                sourceId: `src-l-${index}`,
                sourceLabel: `Later note ${caseId}`,
                sourceText: laterSentence,
                startOffset: 0,
                endOffset: Array.from(laterSentence).length,
                quote: laterSentence,
              },
            ],
            authority: 'chart_fact',
          },
          {
            sourceTextsById: { [`src-l-${index}`]: laterSentence },
            evaluatedAt: '2026-10-15T12:00:00Z',
          },
        );
        equal(gatePass.passed, true, `${caseId}: exact literal span must pass safety gate`);
      }
    },
  },
  {
    name: '2. 8,000 missing or ambiguous references',
    count: 8_000,
    gradeCase: (index) => {
      const caseId = makeCaseId('EV-MISSING-AMB', index);
      const medId = `m-ma-${index}`;
      const subMode = index % 4;
      const baseEarlier = makeBaseMedication(index, medId, { dose: `${(index % 40) + 10} mg` });
      const baseLater = makeBaseMedication(index, medId, { dose: `${(index % 40) + 25} mg` });

      if (subMode === 0) {
        // Missing reference: unresolved link or invalid span or unknown placeholder without note/excerpt
        const variant = index % 3;
        const brokenLink: EvidenceLink =
          variant === 0
            ? {
                id: `unres-${index}`,
                medicationId: medId,
                resolutionStatus: 'unresolved',
                excerpt: 'Unverified draft excerpt that must not display as resolved.',
              }
            : variant === 1
              ? {
                  id: `badspan-${index}`,
                  medicationId: medId,
                  span: { start: 25, end: 10 },
                }
              : {
                  id: `empty-${index}`,
                  medicationId: medId,
                  sourceLabel: UNKNOWN_LABELS[index % UNKNOWN_LABELS.length]!,
                };

        const earlierSnap = makeSnapshot(`s-e-${index}`, [baseEarlier], {
          source: UNKNOWN_LABELS[index % UNKNOWN_LABELS.length]!,
          recordedAt: null,
          sourceKind: 'unknown',
        });
        const laterSnap = makeSnapshot(
          `s-l-${index}`,
          [{ ...baseLater, evidenceLinks: [brokenLink] }],
          {
            source: UNKNOWN_LABELS[(index + 1) % UNKNOWN_LABELS.length]!,
            recordedAt: null,
            sourceKind: 'unknown',
          },
        );

        const report = analyzeSnapshots(earlierSnap, laterSnap);
        equal(report.changes.length, 1, `${caseId}: expected 1 change`);
        const change = report.changes[0]!;
        const state = classifyChangeEvidenceState(change);
        equal(state, 'missing_reference', `${caseId}: expected missing_reference, got ${state}`);
        equal(EVIDENCE_STATE_LABELS[state], 'Missing reference');
        ok(change.provenanceFlags?.includes('unresolved_evidence_link'));
        ok(change.provenanceFlags?.includes('missing_supporting_evidence'));

        const regimen = buildBeforeAfterRegimen(baseEarlier, baseLater, change);
        for (const ref of [...regimen.earlierEvidence, ...regimen.laterEvidence]) {
          equal(ref.excerpt, null, `${caseId}: unresolved reference must not expose excerpt`);
        }

        const worklist = buildReconciliationWorklist(report.changes, {}, caseId);
        equal(worklist.unclear.length, 1, `${caseId}: must route to unclear worklist bucket`);
        ok(worklist.unclear[0]?.unclearReasons.includes('Missing reference'));
      } else if (subMode === 1) {
        // Unavailable external/clinical document
        const unavailLink: EvidenceLink = {
          id: `unavail-${index}`,
          medicationId: medId,
          sourceId: `ext-doc-${index}`,
          sourceLabel: `Outside hospital discharge ${caseId}`,
          sourceKind: 'external_record',
          resolutionStatus: 'unavailable',
          excerpt: 'Hidden text from unavailable document.',
          note: 'External HIE gateway timed out',
          recordedAt: '2026-10-12',
        };
        const earlierSnap = makeSnapshot(`s-e-${index}`, [baseEarlier]);
        const laterSnap = makeSnapshot(
          `s-l-${index}`,
          [{ ...baseLater, evidenceLinks: [unavailLink] }],
        );

        const report = analyzeSnapshots(earlierSnap, laterSnap);
        const change = report.changes[0]!;
        const state = classifyChangeEvidenceState(change);
        equal(state, 'unavailable_document', `${caseId}: expected unavailable_document`);
        equal(EVIDENCE_STATE_LABELS[state], 'Unavailable document');

        const docIdx = buildDocumentIndex(earlierSnap, laterSnap, report);
        equal(docIdx.counts.unavailable, 1, `${caseId}: document index unavailable count`);

        const regimen = buildBeforeAfterRegimen(baseEarlier, baseLater, change);
        equal(regimen.laterEvidence[0]?.state, 'unavailable_document');
        equal(regimen.laterEvidence[0]?.excerpt, null);

        const worklist = buildReconciliationWorklist(report.changes, {}, caseId);
        equal(worklist.unclear.length, 1);
        ok(worklist.unclear[0]?.unclearReasons.includes('Unavailable document'));
      } else if (subMode === 2) {
        // Ambiguous reference: ambiguous attribution text, status/kind conflict, or conflicting link statuses
        const ambVariant = index % 3;
        const ambLabel = AMBIGUOUS_LABELS[index % AMBIGUOUS_LABELS.length]!;
        const ambMed: Medication =
          ambVariant === 0
            ? {
                ...baseLater,
                provenance: {
                  status: 'ambiguous',
                  sourceLabel: ambLabel,
                  ambiguous: true,
                },
                evidenceLinks: [
                  {
                    id: `amb-link-${index}`,
                    medicationId: medId,
                    sourceLabel: ambLabel,
                    resolutionStatus: 'ambiguous',
                    excerpt: `${baseLater.name} ${baseLater.dose} questioned by patient.`,
                  },
                ],
              }
            : ambVariant === 1
              ? {
                  ...baseLater,
                  provenance: {
                    status: 'documented',
                    sourceKind: 'patient_report',
                    sourceLabel: 'Portal self-report marked documented',
                  },
                  evidenceLinks: [
                    {
                      id: `conflict-kind-${index}`,
                      medicationId: medId,
                      sourceLabel: 'Portal self-report',
                      sourceKind: 'patient_report',
                      provenanceStatus: 'documented',
                      excerpt: `${baseLater.name} ${baseLater.dose}`,
                    },
                  ],
                }
              : {
                  ...baseLater,
                  evidenceLinks: [
                    {
                      id: `amb-a-${index}`,
                      medicationId: medId,
                      noteId: `n-a-${index}`,
                      sourceLabel: ambLabel,
                      sourceKind: 'clinical_note',
                      resolutionStatus: 'ambiguous',
                      excerpt: `${baseLater.name} ${baseLater.dose}`,
                    },
                  ],
                };

        const earlierSnap = makeSnapshot(
          `s-e-${index}`,
          [
            {
              ...baseEarlier,
              evidenceLinks: [
                {
                  id: `e-res-${index}`,
                  medicationId: medId,
                  noteId: `n-e-${index}`,
                  sourceLabel: 'Clinic note',
                  sourceKind: 'clinical_note',
                  excerpt: `${baseEarlier.name} ${baseEarlier.dose}`,
                  span: { start: 0, end: 10 },
                },
              ],
            },
          ],
        );
        const laterSnap = makeSnapshot(`s-l-${index}`, [ambMed], {
          source: ambLabel,
        });

        const report = analyzeSnapshots(earlierSnap, laterSnap);
        const change = report.changes[0]!;
        equal(classifyChangeEvidenceState(change), 'ambiguous_reference', `${caseId}: expected ambiguous_reference`);
        equal(change.provenance?.hasAmbiguousProvenance, true);
        equal(change.provenance?.later.status, 'unknown');
        ok(change.provenanceFlags?.includes('ambiguous_source_attribution'));

        const worklist = buildReconciliationWorklist(report.changes, {}, caseId);
        equal(worklist.unclear.length, 1);
        ok(worklist.unclear[0]?.unclearReasons.includes('Ambiguous provenance'));
      } else {
        // Snapshot-only partial reference without supporting clinical note/span + undated snapshot
        const earlierSnap = makeSnapshot(`s-e-${index}`, [baseEarlier], {
          source: `Outpatient list ${caseId}`,
          recordedAt: null,
          sourceKind: 'snapshot',
        });
        const laterSnap = makeSnapshot(`s-l-${index}`, [baseLater], {
          source: `Discharge list ${caseId}`,
          recordedAt: '2026-10-20',
          sourceKind: 'snapshot',
        });

        const report = analyzeSnapshots(earlierSnap, laterSnap);
        const change = report.changes[0]!;
        equal(classifyChangeEvidenceState(change), 'partial', `${caseId}: snapshot-only should be partial`);
        ok(change.provenanceFlags?.includes('missing_supporting_evidence'));
        ok(change.provenanceFlags?.includes('missing_timestamp'));

        const history = buildMedicationHistory(baseEarlier, baseLater, earlierSnap, laterSnap, change);
        ok(history.unknownDate.length >= 1, `${caseId}: undated snapshot must be separated into unknownDate`);
        ok(history.dated.length >= 1, `${caseId}: dated snapshot must remain in dated`);
      }
    },
  },
  {
    name: '3. 7,000 conflicting excerpts and documented negatives',
    count: 7_000,
    gradeCase: (index) => {
      const caseId = makeCaseId('EV-CONFLICT-NEG', index);
      const medId = `m-cn-${index}`;
      const drug = DRUGS[index % DRUGS.length]!;
      const doseA = `${(index % 50) + 10} mg`;
      const doseB = `${(index % 50) + 40} mg`;

      if (index % 2 === 0) {
        // Conflicting excerpts on the same side (or 'both')
        const linkAId = `ev-clinic-${index}`;
        const linkBId = `ev-pharm-${index}`;
        const sideChoice: 'earlier' | 'later' | 'both' =
          index % 6 === 0 ? 'both' : index % 4 === 0 ? 'earlier' : 'later';

        const linkA: EvidenceLink = {
          id: linkAId,
          medicationId: medId,
          noteId: `note-clinic-${index}`,
          sourceLabel: `Clinic note ${caseId}`,
          sourceKind: 'clinical_note',
          excerpt: `${drug} ${doseA} oral daily per clinic visit.`,
          span: { start: 0, end: 25 },
          recordedAt: '2026-10-10',
          side: sideChoice === 'earlier' ? 'earlier' : 'later',
          contradictsEvidenceIds: [linkBId],
        };
        const linkB: EvidenceLink = {
          id: linkBId,
          medicationId: medId,
          noteId: `note-pharm-${index}`,
          sourceLabel: `Pharmacy fill ${caseId}`,
          sourceKind: 'pharmacy_fill',
          excerpt: `${drug} ${doseB} oral twice daily dispensed.`,
          span: { start: 0, end: 28 },
          recordedAt: '2026-10-11',
          side: sideChoice,
          ...(index % 4 === 0 ? { contradictsEvidenceIds: [linkAId] } : {}),
        };

        const earlierMed = makeBaseMedication(index, medId, {
          name: drug,
          dose: doseA,
          evidenceLinks: sideChoice === 'earlier' ? [linkA, linkB] : [],
        });
        const laterMed = makeBaseMedication(index, medId, {
          name: drug,
          dose: doseB,
          evidenceLinks: sideChoice === 'earlier' ? [] : [linkA, linkB],
        });

        const earlierSnap = makeSnapshot(`s-e-${index}`, [earlierMed]);
        const laterSnap = makeSnapshot(`s-l-${index}`, [laterMed]);
        const report = analyzeSnapshots(earlierSnap, laterSnap);
        const change = report.changes[0]!;

        const pairs = getConflictingEvidencePairs(change.evidenceLinks ?? []);
        equal(pairs.length, 1, `${caseId}: expected 1 conflicting evidence pair`);
        equal(pairs[0]?.[0].id, linkAId);
        equal(pairs[0]?.[1].id, linkBId);
        equal(classifyChangeEvidenceState(change), 'conflicting_excerpts');
        equal(EVIDENCE_STATE_LABELS[classifyChangeEvidenceState(change)], 'Conflicting excerpts');

        const worklist = buildReconciliationWorklist(report.changes, {}, caseId);
        equal(worklist.unclear.length, 1);
        ok(worklist.unclear[0]?.unclearReasons.includes('Conflicting excerpts'));
      } else {
        // Documented negative vs silent omission
        const otherDrug = DRUGS[(index + 1) % DRUGS.length]!;
        const earlierMed = makeBaseMedication(index, medId, {
          name: drug,
          dose: doseA,
          evidenceLinks: [
            {
              id: `ev-pos-${index}`,
              medicationId: medId,
              noteId: `note-adm-${index}`,
              sourceLabel: `Admission note ${caseId}`,
              sourceKind: 'clinical_note',
              excerpt: `Taking ${drug} ${doseA} oral daily prior to admission.`,
              span: { start: 0, end: 30 },
              recordedAt: '2026-10-01',
              side: 'earlier',
            },
          ],
        });

        const negExcerpt = `Patient is no longer taking ${drug}; discontinued at discharge (${caseId}).`;
        const laterNegativeCitation: EvidenceLink = {
          id: `ev-neg-${index}`,
          medicationId: medId,
          noteId: `note-dc-${index}`,
          sourceLabel: `Discharge summary ${caseId}`,
          sourceKind: 'discharge_summary',
          documentedAbsence: true,
          excerpt: negExcerpt,
          span: { start: 0, end: negExcerpt.length },
          recordedAt: '2026-10-15',
          side: 'later',
        };

        const earlierSnap = makeSnapshot(`s-e-${index}`, [earlierMed]);
        const laterSnap = makeSnapshot(`s-l-${index}`, [], {
          source: `Discharge summary ${caseId}`,
          recordedAt: '2026-10-15',
          sourceKind: 'discharge_summary',
          evidenceLinks: [laterNegativeCitation],
        });

        const report = analyzeSnapshots(earlierSnap, laterSnap);
        equal(report.changes.length, 1);
        const change = report.changes[0]!;
        equal(change.kind, 'removed');
        equal(classifyChangeEvidenceState(change), 'documented_negative');
        equal(EVIDENCE_STATE_LABELS[classifyChangeEvidenceState(change)], 'Documented negative');

        const negLink = (change.evidenceLinks ?? []).find((l) => l.id === `ev-neg-${index}`);
        ok(negLink !== undefined);
        equal(classifyLinkEvidenceState(negLink, change), 'documented_negative');

        // Contrast with note comparison: explicit discontinuation vs silent omission
        const silentNoteComp = compareNoteRegimens(
          `${drug} ${doseA} oral daily.`,
          `${otherDrug} 500 mg oral twice daily.`,
        );
        const silentMatch = silentNoteComp.items.find(
          (item) => item.normalizedName === drug.toLowerCase(),
        );
        equal(silentMatch?.status, 'earlier_only');

        const explicitDcComp = compareNoteRegimens(
          `${drug} ${doseA} oral daily.`,
          `Discontinue ${drug} ${doseA} oral daily.`,
        );
        const dcMatch = explicitDcComp.items.find(
          (item) => item.normalizedName === drug.toLowerCase(),
        );
        equal(dcMatch?.status, 'discontinued');
      }
    },
  },
  {
    name: '4. 6,000 Verify/Flag/Defer and notes transitions',
    count: 6_000,
    gradeCase: (index) => {
      const caseId = makeCaseId('EV-REVIEW-TRANS', index);
      const med1Id = `m1-${index}`;
      const med2Id = `m2-${index}`;
      const drug1 = DRUGS[index % DRUGS.length]!;
      const drug2 = DRUGS[(index + 3) % DRUGS.length]!;

      const med1Before = makeBaseMedication(index, med1Id, {
        name: drug1,
        dose: '10 mg',
        provenance: { status: 'documented', sourceKind: 'clinical_note', verified: true },
        evidenceLinks: [
          {
            id: `e1-${index}`,
            medicationId: med1Id,
            noteId: `n1-${index}`,
            sourceLabel: 'Clinic note',
            sourceKind: 'clinical_note',
            excerpt: `${drug1} 10 mg oral daily`,
            span: { start: 0, end: 18 },
          },
        ],
      });
      const med1After = makeBaseMedication(index, med1Id, {
        name: drug1,
        dose: '20 mg',
        provenance: { status: 'documented', sourceKind: 'discharge_summary', verified: true },
        evidenceLinks: [
          {
            id: `l1-${index}`,
            medicationId: med1Id,
            noteId: `n2-${index}`,
            sourceLabel: 'Discharge summary',
            sourceKind: 'discharge_summary',
            excerpt: `${drug1} 20 mg oral daily`,
            span: { start: 0, end: 18 },
          },
        ],
      });
      const med2After = makeBaseMedication(index + 1, med2Id, {
        name: drug2,
        dose: null, // Undocumented field -> unclear bucket when unreviewed
      });

      const earlierSnap = makeSnapshot(`se-${index}`, [med1Before]);
      const laterSnap = makeSnapshot(`sl-${index}`, [med1After, med2After]);
      const report = analyzeSnapshots(earlierSnap, laterSnap);
      equal(report.changes.length, 2);

      // Step 1: Unreviewed state
      const reviews: Record<string, ReviewDecision> = {};
      const reviewerNotes: Record<string, string> = {};
      const key1 = `${caseId}:${med1Id}`;
      const key2 = `${caseId}:${med2Id}`;

      const wlInitial = buildReconciliationWorklist(report.changes, reviews, caseId);
      equal(wlInitial.totalUnresolved, 2);
      equal(wlInitial.resolvedCount, 0);
      equal(wlInitial.changed.length, 1);
      equal(wlInitial.unclear.length, 1);

      // Step 2: Transition med1 through Verify -> Flag -> Defer -> Clear, and attach/edit/clear reviewer note
      const firstDecision = REVIEW_CYCLE[index % REVIEW_CYCLE.length]!;
      const secondDecision = REVIEW_CYCLE[(index + 1) % REVIEW_CYCLE.length]!;
      equal(isValidReviewDecision(firstDecision), true);
      equal(isValidReviewDecision(secondDecision), true);

      reviews[key1] = firstDecision;
      reviewerNotes[key1] = `Initial note for ${caseId}: verify outpatient fill.`;
      const wlAfterFirst = buildReconciliationWorklist(report.changes, reviews, caseId);
      equal(wlAfterFirst.totalUnresolved, 1);
      equal(wlAfterFirst.resolvedCount, 1);
      equal(wlAfterFirst.changed.length, 0);

      // Transition to secondDecision and update reviewer note
      reviews[key1] = secondDecision;
      reviewerNotes[key1] = `Updated note for ${caseId}: escalated to ${secondDecision}.`;
      equal(reviews[key1], secondDecision);
      equal(reviewerNotes[key1].includes(secondDecision), true);

      // Also review med2
      reviews[key2] = 'deferred';
      const wlBothReviewed = buildReconciliationWorklist(report.changes, reviews, caseId);
      equal(wlBothReviewed.totalUnresolved, 0);
      equal(wlBothReviewed.resolvedCount, 2);

      // Toggle off med1 review -> returns to changed bucket while note transitions to cleared
      delete reviews[key1];
      delete reviewerNotes[key1];
      const wlToggledOff = buildReconciliationWorklist(report.changes, reviews, caseId);
      equal(wlToggledOff.totalUnresolved, 1);
      equal(wlToggledOff.resolvedCount, 1);
      equal(wlToggledOff.changed[0]?.medicationId, med1Id);
      equal(reviewerNotes[key1], undefined);

      // Verify encounter completion disposition transitions (pending -> edited unrevalidated -> edited revalidated)
      const encounter: EncounterContext = {
        id: `enc-${index}`,
        patientId: `PAT-${index}`,
        date: '2026-10-15',
        kind: 'reconciliation',
        summary: 'Transition check',
        sourceRef: `sl-${index}`,
        medications: [med1After],
        encounters: [],
        unresolvedDiscrepancies: [],
      };
      const proposal: ProposedChange = {
        id: `prop-${index}`,
        medication: drug1,
        action: 'change',
        current: [{ field: 'dose', value: '10 mg' }],
        proposed: [
          { field: 'dose', value: '20 mg' },
          { field: 'route', value: 'oral' },
          { field: 'frequency', value: 'daily' },
        ],
        diff: [{ field: 'dose', before: '10 mg', after: '20 mg' }],
        evidence: [],
        authority: 'chart_fact',
        uncertainty: 'low',
        gate: {
          passed: true,
          status: 'passed',
          abstained: false,
          abstainReason: null,
          blockers: [],
          checks: [],
          requiresClinicianReview: true,
          autoCommitAllowed: false,
          evaluatedAt: '2026-10-15T12:00:00Z',
        },
        abstainReason: null,
      };

      const pendingEval = evaluateEncounterCompletion({
        encounter,
        proposedChanges: [proposal],
        dispositions: [
          {
            id: `disp-${index}`,
            proposalId: proposal.id,
            decision: 'pending',
            at: '2026-10-15T12:01:00Z',
            actor: 'clin-1',
            note: 'Pending review',
            revalidated: false,
            fhirPreview: null,
          },
        ],
      });
      equal(pendingEval.canComplete, false);
      equal(pendingEval.unreviewedProposalCount, 1);

      const editedUnreval = evaluateEncounterCompletion({
        encounter,
        proposedChanges: [proposal],
        dispositions: [
          {
            id: `disp-${index}`,
            proposalId: proposal.id,
            decision: 'edited',
            at: '2026-10-15T12:02:00Z',
            actor: 'clin-1',
            note: 'Edited dose note',
            revalidated: false,
            fhirPreview: null,
          } satisfies ReviewDisposition,
        ],
      });
      equal(editedUnreval.canComplete, false);
      ok(editedUnreval.blockers.some((b) => b.kind === 'edited_proposal_unrevalidated'));

      const editedReval = evaluateEncounterCompletion({
        encounter,
        proposedChanges: [proposal],
        dispositions: [
          {
            id: `disp-${index}`,
            proposalId: proposal.id,
            decision: 'edited',
            at: '2026-10-15T12:03:00Z',
            actor: 'clin-1',
            note: 'Revalidated dose note',
            revalidated: true,
            fhirPreview: null,
          },
        ],
      });
      equal(editedReval.canComplete, true);
    },
  },
  {
    name: '5. 4,000 case-isolation and export scenarios',
    count: 4_000,
    gradeCase: (index) => {
      const caseA = makeCaseId('EV-ISO-A', index);
      const caseB = makeCaseId('EV-ISO-B', index);
      const medId = `shared-med-${index % 25}`;
      const drugA = DRUGS[index % DRUGS.length]!;
      const drugB = DRUGS[(index + 5) % DRUGS.length]!;

      const decisionA = REVIEW_CYCLE[index % REVIEW_CYCLE.length]!;
      const decisionB = REVIEW_CYCLE[(index + 2) % REVIEW_CYCLE.length]!;

      const grouped: ReviewsByScenario = {
        [caseA]: { [medId]: decisionA, [`only-a-${index}`]: 'flagged' },
        [caseB]: { [medId]: decisionB },
      };

      const flatAll = flattenReviewsByScenario(grouped);
      const flatOnlyA = flattenReviewsByScenario(grouped, caseA);
      const flatOnlyB = flattenReviewsByScenario(grouped, caseB);

      equal(Object.keys(flatOnlyA).length, 2, `${caseA}: isolated flat map must have 2 keys`);
      equal(Object.keys(flatOnlyB).length, 1, `${caseB}: isolated flat map must have 1 key`);
      equal(flatOnlyA[`${caseA}:${medId}`], decisionA);
      equal(flatOnlyB[`${caseB}:${medId}`], decisionB);
      equal(flatOnlyB[`${caseA}:${medId}`], undefined, 'Case A review must not leak into Case B');

      const roundTrip = expandFlatReviews(flatAll);
      equal(roundTrip[caseA]?.[medId], decisionA);
      equal(roundTrip[caseB]?.[medId], decisionB);
      equal(parseReviewKey(`${caseA}:${medId}`).scenarioId, caseA);

      // Verify search, timeline, and worklist isolation between Case A and Case B
      const snapAEarlier = makeSnapshot(`sa-e-${index}`, [
        makeBaseMedication(index, medId, { name: drugA, dose: '10 mg' }),
      ]);
      const snapALater = makeSnapshot(`sa-l-${index}`, [
        makeBaseMedication(index, medId, { name: drugA, dose: '25 mg' }),
      ]);
      const reportA = analyzeSnapshots(snapAEarlier, snapALater);

      const snapBEarlier = makeSnapshot(`sb-e-${index}`, [
        makeBaseMedication(index + 1, medId, { name: drugB, dose: '50 mg' }),
      ]);
      const snapBLater = makeSnapshot(`sb-l-${index}`, [
        makeBaseMedication(index + 1, medId, { name: drugB, dose: '100 mg' }),
      ]);
      const reportB = analyzeSnapshots(snapBEarlier, snapBLater);

      // Removing Case A's review must not alter Case B's worklist resolution
      const partialReviews = { [`${caseB}:${medId}`]: decisionB };
      const wlA = buildReconciliationWorklist(reportA.changes, partialReviews, caseA);
      const wlB = buildReconciliationWorklist(reportB.changes, partialReviews, caseB);
      equal(wlA.resolvedCount, 0);
      equal(wlA.totalUnresolved, 1);
      equal(wlB.resolvedCount, 1);
      equal(wlB.totalUnresolved, 0);

      const matchesA = searchChartRecords({
        query: drugA,
        earlierNoteLabel: `Earlier ${caseA}`,
        earlierNoteText: `${drugA} 10 mg oral daily.`,
        laterNoteLabel: `Later ${caseA}`,
        laterNoteText: `${drugA} 25 mg oral daily.`,
        earlierSnapshot: snapAEarlier,
        laterSnapshot: snapALater,
        report: reportA,
      });
      ok(matchesA.length >= 2);
      ok(matchesA.every((m) => !m.snippet.includes(caseB)));

      const timelineA = buildEncounterTimeline(snapAEarlier, snapALater, reportA);
      equal(timelineA.dated.length, 3);

      // Export verification: follow-ups text + audit CSV/JSON with special quote characters
      const exportTxt = formatFollowUpExport([
        {
          name: drugA,
          label: 'Earlier note',
          quotes: [`${drugA} 10 mg oral daily (${caseA})`],
          decision: 'clarify',
        },
        {
          name: drugB,
          label: 'Discharge note',
          quotes: [`${drugB} 100 mg oral daily (${caseB})`],
          decision: 'reviewed',
        },
      ]);
      ok(exportTxt !== null);
      ok(exportTxt.includes(drugA));
      ok(exportTxt.includes(`> ${drugA} 10 mg oral daily (${caseA})`));
      equal(exportTxt.includes(drugB), false, 'Reviewed (non-flagged) item must not be exported');

      const auditRows = [
        {
          ts: '2026-10-15T10:00:00.000Z',
          actor: 'Clinician',
          action: `Marked ${decisionA}`,
          target: `${caseA} · "${drugA}"`,
        },
      ];
      const csv = formatAuditCsv(auditRows);
      ok(csv.startsWith('time,actor,action,target\n'));
      ok(csv.includes(`"${caseA} · ""${drugA}"""`), 'CSV must escape embedded double quotes');
      const jsonExport = JSON.parse(JSON.stringify(auditRows)) as typeof auditRows;
      equal(jsonExport[0]?.target, `${caseA} · "${drugA}"`);
    },
  },
];

describe('qa-250k-evidence-35k: 35,000 deterministic evidence & reviewer-state QA cases', () => {
  it.each(families)('$name ($count cases)', ({ name, count, gradeCase }) => {
    let failures = 0;
    const firstFailures: string[] = [];

    for (let index = 0; index < count; index += 1) {
      try {
        gradeCase(index);
      } catch (error) {
        failures += 1;
        if (firstFailures.length < 5) {
          firstFailures.push(`case ${index}: ${String(error)}`);
        }
      }
    }

    const passed = count - failures;
    console.info(`${name} — ${passed}/${count} passed, ${failures} failed`);
    equal(failures, 0, firstFailures.join('\n'));
  });
});

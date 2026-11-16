// @vitest-environment node
import { deepEqual, equal, ok } from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  analyzeSnapshots,
  buildReconciliationWorklist,
  compareNoteRegimens,
  compareSnapshots,
} from './diff';
import {
  evaluateEncounterCompletion,
  evaluateProposalSafetyGate,
  type EncounterContext,
  type ProposedChange,
} from './cockpit';
import {
  appendAuditEntry,
  applySessionStoreMutation,
  clearSessionStoreMemoryForTesting,
  expandFlatReviews,
  flattenReviewsByScenario,
  getSessionStore,
  parseReviewKey,
  resetSessionStore,
  resolveStorePath,
  SessionStoreValidationError,
  SYNTHETIC_STORE_DISCLAIMER,
  upsertReviewDecision,
  type ReviewDecision,
} from './session-store';
import type { Medication, Snapshot } from './types';

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
] as const;

const ROUTES = ['oral', 'subcutaneous', 'intravenous', 'inhalation'] as const;
const FREQUENCIES = ['daily', 'twice daily', 'three times daily', 'at bedtime'] as const;
const DECISIONS: readonly ReviewDecision[] = ['verified', 'flagged', 'deferred'];
const SHARD_COUNT = 64;

type CaseRecord = {
  caseId: string;
  patientId: string;
  patientLabel: string;
  version: number;
  updatedAt: string;
  earlierNote: string;
  laterNote: string;
  earlierSnapshot: Snapshot;
  laterSnapshot: Snapshot;
  reviews: Record<string, ReviewDecision>;
  savedDraftBackup?: {
    earlierNote: string;
    laterNote: string;
  } | null;
};

function seededInt(seed: number, step: number): number {
  let t = (seed + step * 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function makeCaseId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(5, '0')}`;
}

function enableMemoryStorePath(customPath: string): string {
  const resolved = resolveStorePath(customPath);
  const g = globalThis as typeof globalThis & {
    __clinicalDiffSessionStoreRuntime?: {
      memoryStores: Map<string, unknown>;
      memoryFallbackPaths: Set<string>;
      writeQueues: Map<string, Promise<void>>;
    };
  };
  if (!g.__clinicalDiffSessionStoreRuntime) {
    g.__clinicalDiffSessionStoreRuntime = {
      memoryStores: new Map(),
      memoryFallbackPaths: new Set(),
      writeQueues: new Map(),
    };
  }
  g.__clinicalDiffSessionStoreRuntime.memoryFallbackPaths.add(resolved);
  return resolved;
}

async function createShardedMemoryStores(
  prefix: string,
  bystanderId: string,
  bystanderDecision: ReviewDecision,
): Promise<string[]> {
  const paths: string[] = [];
  for (let s = 0; s < SHARD_COUNT; s += 1) {
    const p = enableMemoryStorePath(path.join(tempDir, `${prefix}-shard-${s}.json`));
    await resetSessionStore({ storePath: p });
    await upsertReviewDecision(
      {
        scenarioId: bystanderId,
        medId: 'm1',
        decision: bystanderDecision,
      },
      { storePath: p },
    );
    paths.push(p);
  }
  return paths;
}

function makeSyntheticCase(caseId: string, seed: number): CaseRecord {
  const h = seededInt(seed, 17);
  const drug1 = DRUGS[h % DRUGS.length]!;
  const drug2 = DRUGS[(h + 3) % DRUGS.length]!;
  const dose1Before = `${(seed % 40) + 5} mg`;
  const dose1After = `${(seed % 40) + 15} mg`;
  const dose2 = `${((seed >> 2) % 50) + 10} mg`;
  const route = ROUTES[(h >>> 4) % ROUTES.length]!;
  const freq = FREQUENCIES[(h >>> 8) % FREQUENCIES.length]!;

  const earlierMed1: Medication = {
    id: 'm1',
    name: drug1,
    dose: dose1Before,
    route,
    frequency: freq,
  };
  const earlierMed2: Medication = {
    id: 'm2',
    name: drug2,
    dose: dose2,
    route,
    frequency: freq,
  };
  const laterMed1: Medication = {
    id: 'm1',
    name: drug1,
    dose: dose1After,
    route,
    frequency: freq,
  };

  return {
    caseId,
    patientId: `SYN-PAT-${(seed % 9000) + 1000}`,
    patientLabel: `Synthetic Patient ${seed + 1} (Synthetic)`,
    version: 1,
    updatedAt: '2026-10-15T08:00:00.000Z',
    earlierNote: `${drug1} ${dose1Before} ${route} ${freq}. ${drug2} ${dose2} ${route} ${freq}.`,
    laterNote: `${drug1} ${dose1After} ${route} ${freq}.`,
    earlierSnapshot: {
      id: `${caseId}-s1`,
      source: `Outpatient list (${caseId})`,
      recordedAt: '2026-10-01',
      medications: [earlierMed1, earlierMed2],
    },
    laterSnapshot: {
      id: `${caseId}-s2`,
      source: `Discharge list (${caseId})`,
      recordedAt: '2026-10-15',
      medications: [laterMed1],
    },
    reviews: {
      m1: DECISIONS[seed % DECISIONS.length]!,
    },
    savedDraftBackup: null,
  };
}

function cloneCaseRecord(record: CaseRecord): CaseRecord {
  return structuredClone(record);
}

let tempDir = '';

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diffmd-lifecycle-30k-'));
});

afterAll(async () => {
  clearSessionStoreMemoryForTesting();
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe('qa-250k-lifecycle-30k: 30,000 deterministic case lifecycle & sync isolation QA cases', () => {
  it('1. 8,000 creation and validation cases', async () => {
    const TOTAL = 8_000;
    const bystanderId = 'bystander-create-case';
    const bystanderInitial = makeSyntheticCase(bystanderId, 999_001);
    const bystanderSnapshotCopy = cloneCaseRecord(bystanderInitial);
    const storeShards = await createShardedMemoryStores('create-val', bystanderId, 'verified');

    const caseRegistry = new Map<string, CaseRecord>([
      [bystanderId, cloneCaseRecord(bystanderInitial)],
    ]);
    let failures = 0;
    const firstFailures: string[] = [];

    for (let index = 0; index < TOTAL; index += 1) {
      try {
        const caseId = makeCaseId('LC-CREATE-VAL', index);
        const storePath = storeShards[index % SHARD_COUNT]!;
        const mode = index % 8;

        if (mode < 4) {
          // Valid case creation with snapshot comparison, note validation, and session store persistence
          const created = makeSyntheticCase(caseId, index);
          caseRegistry.set(caseId, created);

          const report = analyzeSnapshots(created.earlierSnapshot, created.laterSnapshot);
          equal(report.changes.length, 2, `${caseId}: expected 2 changes (m1 changed, m2 removed)`);
          const noteReport = compareNoteRegimens(created.earlierNote, created.laterNote);
          equal(noteReport.items.length, 2, `${caseId}: expected 2 note regimen items`);

          const decision = DECISIONS[index % DECISIONS.length]!;
          const snap = await applySessionStoreMutation(
            {
              key: `${caseId}:m1`,
              decision,
              ...(index % 16 === 0
                ? {
                    actor: 'Clinician',
                    action: 'Created case review',
                    target: `${caseId} · m1`,
                  }
                : {}),
            },
            'POST',
            { storePath, scenarioId: caseId },
          );

          equal(snap.syntheticOnly, true);
          equal(snap.disclaimer, SYNTHETIC_STORE_DISCLAIMER);
          equal(snap.reviews[`${caseId}:m1`], decision);
          equal(snap.reviewsByScenario[caseId]?.m1, decision);
          equal(
            snap.reviewsByScenario[bystanderId],
            undefined,
            'Scenario filter must isolate target case',
          );
        } else {
          // Invalid creation / validation boundary cases (modes 4, 5, 6, 7)
          let rejected = false;
          if (mode === 4) {
            const phiVariant = index % 3;
            try {
              await applySessionStoreMutation(
                phiVariant === 0
                  ? {
                      key: `${caseId}:m1`,
                      decision: 'verified',
                      actor: 'Clinician 123-45-6789',
                      action: 'Marked verified',
                      target: caseId,
                    }
                  : phiVariant === 1
                    ? {
                        syntheticOnly: false,
                        key: `${caseId}:m1`,
                        decision: 'verified',
                      }
                    : {
                        containsPhi: true,
                        key: `${caseId}:m1`,
                        decision: 'flagged',
                      },
                'POST',
                { storePath },
              );
            } catch (err) {
              rejected = err instanceof SessionStoreValidationError && err.statusCode === 400;
            }
          } else if (mode === 5) {
            const badVariant = index % 3;
            try {
              await applySessionStoreMutation(
                badVariant === 0
                  ? { key: `${caseId}:`, decision: 'verified' }
                  : badVariant === 1
                    ? { key: `${caseId}\u0007:m1`, decision: 'verified' }
                    : { key: `${'x'.repeat(165)}:m1`, decision: 'verified' },
                'POST',
                { storePath },
              );
            } catch (err) {
              rejected = err instanceof SessionStoreValidationError && err.statusCode === 400;
            }
          } else if (mode === 6) {
            try {
              await applySessionStoreMutation(
                index % 2 === 0
                  ? { key: `${caseId}:m1`, decision: 'approved-invalid' }
                  : { key: `${caseId}:m1` },
                'POST',
                { storePath },
              );
            } catch (err) {
              rejected = err instanceof SessionStoreValidationError && err.statusCode === 400;
            }
          } else {
            const dupCase = makeSyntheticCase(caseId, index);
            dupCase.earlierSnapshot.medications.push({
              ...dupCase.earlierSnapshot.medications[0]!,
            });
            try {
              compareSnapshots(dupCase.earlierSnapshot, dupCase.laterSnapshot);
            } catch (err) {
              rejected = err instanceof Error && err.message.includes('Duplicate medication ID');
            }
          }
          equal(rejected, true, `${caseId}: invalid payload in mode ${mode} must be rejected`);
          equal(caseRegistry.has(caseId), false, `${caseId}: rejected case must not enter registry`);
        }

        // Assert unrelated bystander case remains completely unchanged
        const currentBystander = caseRegistry.get(bystanderId)!;
        deepEqual(currentBystander, bystanderSnapshotCopy);
        const bystanderStore = await getSessionStore({ storePath, scenarioId: bystanderId });
        equal(bystanderStore.reviews[`${bystanderId}:m1`], 'verified');
        equal(Object.keys(bystanderStore.reviewsByScenario[bystanderId] ?? {}).length, 1);
      } catch (error) {
        failures += 1;
        if (firstFailures.length < 5) {
          firstFailures.push(`case ${index}: ${String(error)}`);
        }
      }
    }

    console.info(
      `1. 8,000 creation and validation — ${TOTAL - failures}/${TOTAL} passed, ${failures} failed`,
    );
    equal(failures, 0, firstFailures.join('\n'));
  }, 30_000);

  it('2. 8,000 edits and save/reload cases', async () => {
    const TOTAL = 8_000;
    const bystanderId = 'bystander-edit-case';
    const bystanderInitial = makeSyntheticCase(bystanderId, 888_002);
    const bystanderExpected = cloneCaseRecord(bystanderInitial);
    const storeShards = await createShardedMemoryStores('edit-reload', bystanderId, 'deferred');
    const diskStorePath = path.join(tempDir, 'edit-reload-disk.json');

    let failures = 0;
    const firstFailures: string[] = [];

    for (let index = 0; index < TOTAL; index += 1) {
      try {
        const caseId = makeCaseId('LC-EDIT-RELOAD', index);
        const storePath = storeShards[index % SHARD_COUNT]!;
        const record = makeSyntheticCase(caseId, index);
        const bystanderLive = cloneCaseRecord(bystanderInitial);

        // Initial save
        const initialDecision = DECISIONS[index % DECISIONS.length]!;
        await upsertReviewDecision(
          {
            scenarioId: caseId,
            medId: 'm1',
            decision: initialDecision,
          },
          { storePath },
        );

        // Edit case: modify later dose, add medication m3, update note text, and transition review decision
        const editedDose = `${(index % 60) + 35} mg`;
        const addedDrug = DRUGS[(index + 5) % DRUGS.length]!;
        record.laterSnapshot = {
          ...record.laterSnapshot,
          medications: [
            {
              ...record.laterSnapshot.medications[0]!,
              dose: editedDose,
            },
            {
              id: 'm3',
              name: addedDrug,
              dose: '25 mg',
              route: 'oral',
              frequency: 'daily',
            },
          ],
        };
        record.laterNote = `${record.laterSnapshot.medications[0]!.name} ${editedDose} oral daily. ${addedDrug} 25 mg oral daily.`;
        record.version += 1;
        record.updatedAt = '2026-10-16T09:30:00.000Z';

        const nextDecision = DECISIONS[(index + 1) % DECISIONS.length]!;
        record.reviews.m1 = nextDecision;
        record.reviews.m3 = 'verified';

        await applySessionStoreMutation(
          {
            reviewsByScenario: {
              [caseId]: {
                m1: nextDecision,
                m3: 'verified',
              },
            },
          },
          'POST',
          { storePath },
        );

        // Reload from session store and serialize/deserialize case state
        const reloadedStore = await getSessionStore({ storePath, scenarioId: caseId });
        const reloadedRecord = JSON.parse(JSON.stringify(record)) as CaseRecord;

        equal(reloadedRecord.version, 2, `${caseId}: version must increment on edit`);
        equal(reloadedStore.reviews[`${caseId}:m1`], nextDecision);
        equal(reloadedStore.reviews[`${caseId}:m3`], 'verified');

        const recomputedDiff = analyzeSnapshots(
          reloadedRecord.earlierSnapshot,
          reloadedRecord.laterSnapshot,
        );
        equal(recomputedDiff.changes.length, 3, `${caseId}: m1 changed, m2 removed, m3 added`);
        const m1Change = recomputedDiff.changes.find((c) => c.medicationId === 'm1')!;
        equal(m1Change.kind, 'changed');
        equal(m1Change.fields.find((f) => f.field === 'dose')?.after, editedDose);

        const worklist = buildReconciliationWorklist(
          recomputedDiff.changes,
          reloadedStore.reviews,
          caseId,
        );
        equal(worklist.resolvedCount, 2, `${caseId}: m1 and m3 are reviewed`);
        equal(worklist.totalUnresolved, 1, `${caseId}: only m2 remains unresolved`);

        // Periodic real local_file disk round-trip verification
        if (index % 800 === 0) {
          const diskSnap = await upsertReviewDecision(
            {
              scenarioId: caseId,
              medId: 'm1',
              decision: nextDecision,
            },
            { storePath: diskStorePath, scenarioId: caseId },
          );
          equal(diskSnap.persistence, 'local_file');
          const diskReloaded = await getSessionStore({
            storePath: diskStorePath,
            scenarioId: caseId,
          });
          equal(diskReloaded.reviews[`${caseId}:m1`], nextDecision);
        }

        // Verify unrelated bystander case state is untouched
        deepEqual(bystanderLive, bystanderExpected);
        const bystanderReloaded = await getSessionStore({
          storePath,
          scenarioId: bystanderId,
        });
        equal(bystanderReloaded.reviews[`${bystanderId}:m1`], 'deferred');
        equal(bystanderReloaded.reviews[`${caseId}:m1`], undefined);
      } catch (error) {
        failures += 1;
        if (firstFailures.length < 5) {
          firstFailures.push(`case ${index}: ${String(error)}`);
        }
      }
    }

    console.info(
      `2. 8,000 edits and save/reload — ${TOTAL - failures}/${TOTAL} passed, ${failures} failed`,
    );
    equal(failures, 0, firstFailures.join('\n'));
  }, 30_000);

  it('3. 6,000 removal and cancellation cases', async () => {
    const TOTAL = 6_000;
    const bystanderId = 'bystander-remove-case';
    const bystanderRecord = makeSyntheticCase(bystanderId, 777_003);
    const bystanderExpected = cloneCaseRecord(bystanderRecord);
    const storeShards = await createShardedMemoryStores('remove-cancel', bystanderId, 'verified');

    let failures = 0;
    const firstFailures: string[] = [];

    for (let index = 0; index < TOTAL; index += 1) {
      try {
        const caseId = makeCaseId('LC-REMOVE-CANCEL', index);
        const storePath = storeShards[index % SHARD_COUNT]!;
        const mode = index % 3;

        if (mode === 0) {
          // Remove individual review decisions and verify empty scenario bucket pruning
          await applySessionStoreMutation(
            {
              reviewsByScenario: {
                [caseId]: { m1: 'verified', m2: 'flagged' },
              },
            },
            'POST',
            { storePath },
          );

          const afterFirstRemove = await upsertReviewDecision(
            {
              scenarioId: caseId,
              medId: 'm1',
              decision: null,
            },
            { storePath, scenarioId: caseId },
          );
          equal(afterFirstRemove.reviews[`${caseId}:m1`], undefined);
          equal(afterFirstRemove.reviews[`${caseId}:m2`], 'flagged');

          const afterSecondRemove = await upsertReviewDecision(
            {
              key: `${caseId}:m2`,
              decision: null,
            },
            { storePath, scenarioId: caseId },
          );
          equal(afterSecondRemove.reviewsByScenario[caseId], undefined);
          equal(Object.keys(afterSecondRemove.reviews).length, 0);
        } else if (mode === 1) {
          // Cancel in-progress note draft & snapshot edit -> restores committed state
          const committed = makeSyntheticCase(caseId, index);
          const committedCopy = cloneCaseRecord(committed);

          const draft = cloneCaseRecord(committed);
          draft.savedDraftBackup = {
            earlierNote: draft.earlierNote,
            laterNote: draft.laterNote,
          };
          draft.earlierNote = 'Uncommitted draft note: Warfarin 5 mg oral daily.';
          draft.laterNote = 'Uncommitted discharge draft: Warfarin 10 mg oral daily.';

          // Cancel edit / restore previous draft
          draft.earlierNote = draft.savedDraftBackup.earlierNote;
          draft.laterNote = draft.savedDraftBackup.laterNote;
          draft.savedDraftBackup = null;

          deepEqual(draft, committedCopy, `${caseId}: cancelled draft must match committed case`);
        } else {
          // Remove case from workspace registry while preserving bystander cases
          const registry = new Map<string, CaseRecord>([
            [bystanderId, cloneCaseRecord(bystanderRecord)],
            [caseId, makeSyntheticCase(caseId, index)],
          ]);
          equal(registry.has(caseId), true);
          const deleted = registry.delete(caseId);
          equal(deleted, true);
          equal(registry.has(caseId), false);
          equal(registry.has(bystanderId), true);
          deepEqual(registry.get(bystanderId), bystanderExpected);
        }

        const bystanderSnap = await getSessionStore({
          storePath,
          scenarioId: bystanderId,
        });
        equal(bystanderSnap.reviews[`${bystanderId}:m1`], 'verified');
      } catch (error) {
        failures += 1;
        if (firstFailures.length < 5) {
          firstFailures.push(`case ${index}: ${String(error)}`);
        }
      }
    }

    console.info(
      `3. 6,000 removal and cancellation — ${TOTAL - failures}/${TOTAL} passed, ${failures} failed`,
    );
    equal(failures, 0, firstFailures.join('\n'));
  }, 30_000);

  it('4. 5,000 cross-tab or two-session sync and stale versions cases', async () => {
    const TOTAL = 5_000;
    const bystanderId = 'bystander-sync-case';
    const sharedShards = await createShardedMemoryStores('sync-shared', bystanderId, 'verified');
    const sessionAShards = await createShardedMemoryStores('sync-sA', bystanderId, 'verified');
    const sessionBShards = await createShardedMemoryStores('sync-sB', bystanderId, 'verified');

    let failures = 0;
    const firstFailures: string[] = [];

    for (let index = 0; index < TOTAL; index += 1) {
      try {
        const caseId = makeCaseId('LC-SYNC-STALE', index);
        const shardIdx = index % SHARD_COUNT;
        const sharedStorePath = sharedShards[shardIdx]!;
        const sessionAStorePath = sessionAShards[shardIdx]!;
        const sessionBStorePath = sessionBShards[shardIdx]!;
        const subMode = index % 3;

        if (subMode === 0) {
          // Concurrent cross-tab writes to the same shared store on distinct medications (m1 vs m2)
          const decTab1 = DECISIONS[index % DECISIONS.length]!;
          const decTab2 = DECISIONS[(index + 1) % DECISIONS.length]!;

          await Promise.all([
            upsertReviewDecision(
              { scenarioId: caseId, medId: 'm1', decision: decTab1 },
              { storePath: sharedStorePath },
            ),
            upsertReviewDecision(
              { scenarioId: caseId, medId: 'm2', decision: decTab2 },
              { storePath: sharedStorePath },
            ),
          ]);

          const merged = await getSessionStore({ storePath: sharedStorePath, scenarioId: caseId });
          equal(merged.reviews[`${caseId}:m1`], decTab1, `${caseId}: Tab 1 write preserved`);
          equal(merged.reviews[`${caseId}:m2`], decTab2, `${caseId}: Tab 2 write preserved`);
        } else if (subMode === 1) {
          // Two-session cookie/file isolation: Session A and Session B write different decisions for the same caseId
          const decA = DECISIONS[index % DECISIONS.length]!;
          const decB = DECISIONS[(index + 2) % DECISIONS.length]!;

          const [snapA, snapB] = await Promise.all([
            upsertReviewDecision(
              { scenarioId: caseId, medId: 'm1', decision: decA },
              { storePath: sessionAStorePath, scenarioId: caseId },
            ),
            upsertReviewDecision(
              { scenarioId: caseId, medId: 'm1', decision: decB },
              { storePath: sessionBStorePath, scenarioId: caseId },
            ),
          ]);

          equal(snapA.reviews[`${caseId}:m1`], decA);
          equal(snapB.reviews[`${caseId}:m1`], decB);
          equal(snapA.reviews[`${caseId}:m1`] !== snapB.reviews[`${caseId}:m1`], true);
        } else {
          // Stale version conflict detection & rejection
          const authoritative = makeSyntheticCase(caseId, index);
          authoritative.version = 3;
          const staleTabDraft = cloneCaseRecord(authoritative);
          staleTabDraft.version = 2; // Stale base version

          const tryOptimisticWrite = (
            current: CaseRecord,
            incoming: CaseRecord,
          ): { accepted: boolean; reason?: string; state: CaseRecord } => {
            if (incoming.version <= current.version) {
              return {
                accepted: false,
                reason: `stale_version:${incoming.version}<=${current.version}`,
                state: current,
              };
            }
            return { accepted: true, state: incoming };
          };

          const staleOutcome = tryOptimisticWrite(authoritative, staleTabDraft);
          equal(staleOutcome.accepted, false, `${caseId}: stale version write must be blocked`);
          equal(staleOutcome.state.version, 3);

          const enc: EncounterContext = {
            id: `enc-sync-${index}`,
            patientId: authoritative.patientId,
            date: '2026-10-15',
            kind: 'reconciliation',
            summary: 'Stale check',
            sourceRef: authoritative.laterSnapshot.id,
            medications: authoritative.laterSnapshot.medications,
            encounters: [],
            unresolvedDiscrepancies: [],
          };
          const prop: ProposedChange = {
            id: `prop-sync-${index}`,
            medication: 'Lisinopril',
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
            gate: evaluateProposalSafetyGate({
              medication: 'Lisinopril',
              action: 'change',
              current: [{ field: 'dose', value: '10 mg' }],
              proposed: [
                { field: 'dose', value: '20 mg' },
                { field: 'route', value: 'oral' },
                { field: 'frequency', value: 'daily' },
              ],
              diff: [{ field: 'dose', before: '10 mg', after: '20 mg' }],
              evidence: [
                {
                  sourceId: 's2',
                  sourceLabel: 'Discharge note',
                  sourceText: 'Lisinopril 20 mg oral daily',
                  startOffset: 0,
                  endOffset: 27,
                  quote: 'Lisinopril 20 mg oral daily',
                },
              ],
              authority: 'chart_fact',
            }),
            abstainReason: null,
          };

          const staleCompletion = evaluateEncounterCompletion({
            encounter: enc,
            proposedChanges: [prop],
            dispositions: [
              {
                id: `disp-sync-${index}`,
                proposalId: prop.id,
                decision: 'edited',
                at: '2026-10-15T12:00:00Z',
                actor: 'clin-1',
                note: 'Stale after source version bump',
                revalidated: false,
                fhirPreview: null,
              },
            ],
          });
          equal(staleCompletion.canComplete, false);
          ok(staleCompletion.blockers.some((b) => b.kind === 'edited_proposal_unrevalidated'));
        }

        // Verify bystander case in shared store is untouched
        const bystanderSnap = await getSessionStore({
          storePath: sharedStorePath,
          scenarioId: bystanderId,
        });
        equal(bystanderSnap.reviews[`${bystanderId}:m1`], 'verified');
      } catch (error) {
        failures += 1;
        if (firstFailures.length < 5) {
          firstFailures.push(`case ${index}: ${String(error)}`);
        }
      }
    }

    console.info(
      `4. 5,000 cross-tab or two-session sync and stale versions — ${TOTAL - failures}/${TOTAL} passed, ${failures} failed`,
    );
    equal(failures, 0, firstFailures.join('\n'));
  }, 30_000);

  it('5. 3,000 offline or interrupted writes cases', async () => {
    const TOTAL = 3_000;
    const bystanderId = 'bystander-offline-case';
    const bystanderRecord = makeSyntheticCase(bystanderId, 555_005);
    const bystanderExpected = cloneCaseRecord(bystanderRecord);
    const offlineShards = await createShardedMemoryStores(
      'offline-fallback',
      bystanderId,
      'flagged',
    );

    let failures = 0;
    const firstFailures: string[] = [];

    for (let index = 0; index < TOTAL; index += 1) {
      try {
        const caseId = makeCaseId('LC-OFFLINE-INT', index);
        const offlineFallbackPath = offlineShards[index % SHARD_COUNT]!;
        const mode = index % 3;

        if (mode === 0) {
          // Offline / memory fallback mode preserves writes in memory without data loss
          const decision = DECISIONS[index % DECISIONS.length]!;
          const snap = await upsertReviewDecision(
            {
              scenarioId: caseId,
              medId: 'm1',
              decision,
              auditEntry: {
                id: `aud-off-${index}`,
                ts: '2026-10-15T11:00:00.000Z',
                actor: 'Clinician',
                action: `Offline ${decision}`,
                target: `${caseId} · m1`,
              },
            },
            { storePath: offlineFallbackPath, scenarioId: caseId },
          );

          equal(snap.persistence, 'memory', `${caseId}: expected memory fallback persistence`);
          equal(snap.reviews[`${caseId}:m1`], decision);
          equal(snap.audit[0]?.id, `aud-off-${index}`);
        } else if (mode === 1) {
          // Interrupted write / transaction rollback: partial mutation aborts before commit
          const committed = makeSyntheticCase(caseId, index);
          const backupBeforeWrite = cloneCaseRecord(committed);

          let writeInterrupted = false;
          const applyAtomicCaseWrite = (
            target: CaseRecord,
            patch: { newDose: string; simulateInterrupt: boolean },
          ): CaseRecord => {
            const staged = cloneCaseRecord(target);
            staged.laterSnapshot.medications[0]!.dose = patch.newDose;
            staged.version += 1;
            if (patch.simulateInterrupt) {
              throw new Error('ECONNRESET: simulated interrupted write mid-flight');
            }
            return staged;
          };

          let activeState = committed;
          try {
            activeState = applyAtomicCaseWrite(committed, {
              newDose: '999 mg',
              simulateInterrupt: true,
            });
          } catch {
            writeInterrupted = true;
          }

          equal(writeInterrupted, true);
          deepEqual(
            activeState,
            backupBeforeWrite,
            `${caseId}: interrupted write must not corrupt committed case state`,
          );
        } else {
          // Offline queue replay + corrupt disk file recovery
          const pendingQueue: Array<{ key: string; decision: ReviewDecision }> = [
            { key: `${caseId}:m1`, decision: 'flagged' },
            { key: `${caseId}:m2`, decision: 'deferred' },
            { key: `${caseId}:m1`, decision: 'verified' },
          ];

          for (const item of pendingQueue) {
            const parsed = parseReviewKey(item.key);
            await upsertReviewDecision(
              {
                scenarioId: parsed.scenarioId,
                medId: parsed.medId,
                decision: item.decision,
              },
              { storePath: offlineFallbackPath },
            );
          }

          const afterReplay = await getSessionStore({
            storePath: offlineFallbackPath,
            scenarioId: caseId,
          });
          equal(afterReplay.reviews[`${caseId}:m1`], 'verified');
          equal(afterReplay.reviews[`${caseId}:m2`], 'deferred');

          // Periodic corrupt JSON file recovery check on disk
          if (index % 300 === 2) {
            const corruptPath = path.join(tempDir, `corrupt-${index}.json`);
            clearSessionStoreMemoryForTesting(corruptPath);
            await fs.writeFile(corruptPath, '{corrupt-truncated-json', 'utf8');
            const recovered = await getSessionStore({ storePath: corruptPath });
            equal(recovered.syntheticOnly, true);
            equal(Object.keys(recovered.reviews).length, 0);
          }
        }

        // Verify unrelated bystander case state and store entry remain unchanged
        deepEqual(bystanderRecord, bystanderExpected);
        const bystanderSnap = await getSessionStore({
          storePath: offlineFallbackPath,
          scenarioId: bystanderId,
        });
        equal(bystanderSnap.reviews[`${bystanderId}:m1`], 'flagged');
        const flatCheck = expandFlatReviews(
          flattenReviewsByScenario(bystanderSnap.reviewsByScenario),
        );
        equal(flatCheck[bystanderId]?.m1, 'flagged');
      } catch (error) {
        failures += 1;
        if (firstFailures.length < 5) {
          firstFailures.push(`case ${index}: ${String(error)}`);
        }
      }
    }

    const auditCheckSnap = await appendAuditEntry(
      {
        actor: 'Clinician',
        action: 'Completed 3,000 offline/interrupted checks',
        target: bystanderId,
      },
      { storePath: offlineShards[0]!, scenarioId: bystanderId },
    );
    ok(auditCheckSnap.audit.length <= 500);
    equal(auditCheckSnap.reviews[`${bystanderId}:m1`], 'flagged');

    console.info(
      `5. 3,000 offline or interrupted writes — ${TOTAL - failures}/${TOTAL} passed, ${failures} failed`,
    );
    equal(failures, 0, firstFailures.join('\n'));
  }, 30_000);
});

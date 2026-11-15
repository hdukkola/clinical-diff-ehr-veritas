// @vitest-environment node
import { equal, ok } from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  BACKLOG_WIDGET_CATALOG,
  buildBacklogWidgetData,
  type BacklogBuildContext,
} from './backlog-widgets';
import {
  buildClinicalWidgetData,
  CLINICAL_WIDGET_IDS,
} from './widgets-clinical';
import {
  buildSpecialtyWidgetData,
  SPECIALTY_WIDGET_IDS,
} from './widgets-specialty';
import {
  canRender,
  CORE_WIDGET_IDS,
  createWidgetRegistry,
  evaluateEncounterCompletion,
  evaluateProposalSafetyGate,
  getAllLayoutPresets,
  LAYOUT_PRESET_IDS,
  validateLayoutPreset,
  type ClinicalContext,
  type EncounterContext,
  type EncounterState,
  type LayoutPreset,
  type ProposedChange,
  type ReviewDisposition,
} from './cockpit';
import {
  expandFlatReviews,
  flattenReviewsByScenario,
  isValidReviewDecision,
  parseReviewKey,
  SessionStoreValidationError,
  type ReviewDecision,
  type ReviewsByScenario,
} from './session-store';
import {
  SYNTHETIC_ASSISTANT_NOTES,
  validateSyntheticAssistantResult,
  type SyntheticAssistantNote,
} from './assistant-evidence';
import { analyzeSnapshots, compareNoteRegimens } from './diff';
import { getSyntheticScenario, syntheticScenarios } from './fixtures';
import { GET as healthGet, OPTIONS as healthOptions } from '@/app/api/health/route';
import { POST as comparePost } from '@/app/api/compare/route';
import { POST as assistantPost } from '@/app/api/assistant/route';

const CASES_PER_FAMILY = 10_000; // 5 families * 10,000 = 50,000 cases

const SOCKET_STATES = ['live', 'replay', 'standby'] as const;
const ROLES = ['clinician', 'nurse', 'pharmacist', 'reviewer', 'admin'] as const;
const ENCOUNTER_STATES: readonly EncounterState[] = ['open', 'in_review', 'ready_for_commit', 'completed'];
const REVIEW_DECISIONS: readonly ReviewDecision[] = ['verified', 'flagged', 'deferred'];
const CLINICAL_ID_SET = new Set(CLINICAL_WIDGET_IDS);
const SPECIALTY_ID_SET = new Set(SPECIALTY_WIDGET_IDS);

function makeBacklogContext(index: number): BacklogBuildContext {
  const scenario = syntheticScenarios[index % syntheticScenarios.length]!;
  const report = analyzeSnapshots(scenario.earlier, scenario.later);
  const firstChangeId = report.changes[0]?.medicationId ?? `m-${index % 5}`;
  const reviewCycle = ['verified', 'flag', 'deferred', undefined] as const;
  const decision = reviewCycle[index % reviewCycle.length];
  return {
    patientLabel: scenario.patientLabel,
    scenarioId: scenario.id,
    report,
    reviews: decision ? { [`${scenario.id}:${firstChangeId}`]: decision } : {},
    socketState: SOCKET_STATES[index % SOCKET_STATES.length]!,
    evalTested: 20 + (index % 30),
    evalPassed: 18 + (index % 20),
    evalFailed: index % 3,
    auditCount: index % 12,
  };
}

function makeClinicalContext(index: number): ClinicalContext {
  const role = ROLES[index % ROLES.length]!;
  const hasReadPatient = index % 11 !== 0;
  const hasReadMeds = index % 13 !== 0;
  const hasWriteProposals = index % 7 !== 0;
  const granted: string[] = [];
  if (hasReadPatient) granted.push('read:patient');
  if (hasReadMeds) granted.push('read:medications');
  if (hasWriteProposals) granted.push('write:proposed-actions');
  if (index % 5 === 0) granted.push('commit:documentation');

  return {
    patient: {
      id: `PAT-${1000 + (index % 500)}`,
      name: 'Synthetic Case',
      age: 35 + (index % 55),
      sex: index % 2 === 0 ? 'F' : 'M',
      activeProblems: [],
      allergies: [],
      activeMedications: [
        { id: 'm1', name: 'Lisinopril', dose: '10 mg', route: 'oral', frequency: 'daily' },
      ],
      missing: [],
    },
    encounter: index % 17 === 0 ? null : {
      id: `enc-${index}`,
      patientId: `PAT-${1000 + (index % 500)}`,
      date: '2026-11-15',
      kind: 'outpatient-follow-up',
      summary: 'Synthetic encounter summary',
      sourceRef: 's2',
      medications: [],
      encounters: [],
      unresolvedDiscrepancies: [],
    },
    clinician: { id: `clin-${index % 20}`, name: 'Dr. Synthetic', role },
    dataPermissions: { grantedPermissions: granted },
    encounterState: ENCOUNTER_STATES[index % ENCOUNTER_STATES.length]!,
    sourceVersions: { s1: 'v1', s2: 'v2' },
    proposedChanges: [],
    committedChanges: [],
    featureFlags: index % 4 === 0 ? ['experimental-widgets'] : [],
  };
}

function makeEncounter(hasHighDiscrepancy: boolean): EncounterContext {
  return {
    id: 'enc-gate',
    patientId: 'PAT-1',
    date: '2026-11-15',
    kind: 'outpatient-follow-up',
    summary: 'Follow-up',
    sourceRef: 's2',
    medications: [],
    encounters: [],
    unresolvedDiscrepancies: hasHighDiscrepancy
      ? [
          {
            id: 'disc-hi',
            medication: 'Lisinopril',
            kind: 'dose_change',
            description: 'High priority discrepancy',
            priority: 'high',
            status: 'unresolved',
            sourceVersion: 's2',
            recordedAt: '2026-11-15',
          },
        ]
      : [],
  };
}

function makeProposal(id: string, passed: boolean): ProposedChange {
  return {
    id,
    medication: 'Lisinopril',
    action: 'change',
    current: [{ field: 'dose', value: '10 mg' }],
    proposed: [
      { field: 'dose', value: '20 mg' },
      { field: 'route', value: 'oral' },
      { field: 'frequency', value: passed ? 'daily' : null },
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
    uncertainty: passed ? 'low' : 'high',
    gate: {
      passed,
      status: passed ? 'passed' : 'abstained',
      abstained: !passed,
      abstainReason: passed ? null : 'Missing required frequency',
      blockers: passed ? [] : ['Missing required frequency'],
      checks: [],
      requiresClinicianReview: true,
      autoCommitAllowed: false,
      evaluatedAt: '2026-11-15T10:00:00Z',
    },
    abstainReason: passed ? null : 'Missing required frequency',
  };
}

describe('app-features-50k: 50,000 deterministic app, widget, login/access & route tests', () => {
  it('1. 10,000 deterministic widget catalog & clinical/specialty widget builder cases', () => {
    // Precompute contexts per scenario+socket+review combo so 10,000 checks run fast
    const contexts = Array.from({ length: 12 }, (_, idx) => makeBacklogContext(idx));
    for (let i = 0; i < CASES_PER_FAMILY; i++) {
      const widgetMeta = BACKLOG_WIDGET_CATALOG[i % BACKLOG_WIDGET_CATALOG.length]!;
      const ctx = contexts[i % contexts.length]!;
      const data = buildBacklogWidgetData(widgetMeta.id, ctx);

      equal(data.id, widgetMeta.id);
      ok(data.title.length > 0);
      ok(data.safetyNotice.length > 0);
      ok(data.summaryLine.length > 0);
      ok(Array.isArray(data.rows));

      if (CLINICAL_ID_SET.has(widgetMeta.id)) {
        const clinical = buildClinicalWidgetData(widgetMeta.id, ctx);
        ok(clinical !== null);
        equal(clinical.id, widgetMeta.id);
      } else if (SPECIALTY_ID_SET.has(widgetMeta.id)) {
        const specialty = buildSpecialtyWidgetData(widgetMeta.id, ctx);
        ok(specialty !== null);
        equal(specialty.id, widgetMeta.id);
      }
    }
  });

  it('2. 10,000 deterministic cockpit registry, layout preset & permission cases', () => {
    const registry = createWidgetRegistry();
    const presets = getAllLayoutPresets();
    equal(presets.length, LAYOUT_PRESET_IDS.length);

    for (let i = 0; i < CASES_PER_FAMILY; i++) {
      const widgetId = CORE_WIDGET_IDS[i % CORE_WIDGET_IDS.length]!;
      const ctx = makeClinicalContext(i);
      const allowed = canRender(widgetId, ctx);
      const def = registry.getWidget(widgetId);
      ok(def !== undefined);

      // Verify missing patient read permission blocks patient-dependent widgets
      if (!ctx.dataPermissions.grantedPermissions.includes('read:patient')) {
        if (def.requiredPermissions.includes('read:patient')) {
          equal(allowed, false);
        }
      }

      const preset = presets[i % presets.length]!;
      const valid = validateLayoutPreset(preset, registry);
      equal(valid.valid, true);

      if (i % 5 === 0) {
        const badPreset: LayoutPreset = {
          ...preset,
          widgetInstances: [
            ...preset.widgetInstances,
            {
              id: `bad-${i}`,
              definitionId: `unknown-${i}`,
              position: { x: 0, y: 99, width: 4, height: 2 },
              configuration: {},
              isVisible: true,
              isMinimized: false,
              lastRefreshed: null,
              error: null,
            },
          ],
        };
        const invalid = validateLayoutPreset(badPreset, registry);
        equal(invalid.valid, false);
      }
    }
  });

  it('3. 10,000 deterministic safety gate & encounter completion blocker cases', () => {
    for (let i = 0; i < CASES_PER_FAMILY; i++) {
      const mode = i % 4;
      if (mode === 0) {
        const gate = evaluateProposalSafetyGate({
          medication: 'Lisinopril',
          action: 'change',
          current: [
            { field: 'dose', value: '10 mg' },
            { field: 'route', value: 'oral' },
            { field: 'frequency', value: 'daily' },
          ],
          proposed: [
            { field: 'dose', value: `${15 + (i % 30)} mg` },
            { field: 'route', value: 'oral' },
            { field: 'frequency', value: 'daily' },
          ],
          diff: [{ field: 'dose', before: '10 mg', after: `${15 + (i % 30)} mg` }],
          evidence: [
            {
              sourceId: 's2',
              sourceLabel: 'Discharge note',
              sourceText: `Lisinopril ${15 + (i % 30)} mg oral daily`,
              startOffset: 0,
              endOffset: `Lisinopril ${15 + (i % 30)} mg oral daily`.length,
              quote: `Lisinopril ${15 + (i % 30)} mg oral daily`,
            },
          ],
          authority: 'chart_fact',
        });
        equal(gate.passed, true);
        equal(gate.autoCommitAllowed, false);
        equal(gate.requiresClinicianReview, true);
      } else if (mode === 1) {
        // Missing evidence must never pass
        const gate = evaluateProposalSafetyGate({
          medication: 'Metformin',
          action: 'start',
          current: [],
          proposed: [
            { field: 'dose', value: '500 mg' },
            { field: 'route', value: 'oral' },
            { field: 'frequency', value: 'twice daily' },
          ],
          diff: [{ field: 'name', before: null, after: 'Metformin' }],
          evidence: [],
          authority: 'chart_fact',
        });
        equal(gate.passed, false);
        equal(gate.autoCommitAllowed, false);
      } else if (mode === 2) {
        // Unresolved high-priority discrepancy blocks encounter completion
        const completion = evaluateEncounterCompletion({
          encounter: makeEncounter(true),
          proposedChanges: [makeProposal(`p-${i}`, true)],
          dispositions: [
            {
              id: `d-${i}`,
              proposalId: `p-${i}`,
              decision: 'accepted',
              at: '2026-11-15T10:15:00Z',
              actor: 'clin-1',
              note: null,
              revalidated: true,
              fhirPreview: null,
            },
          ],
        });
        equal(completion.canComplete, false);
        equal(completion.requiresExplicitCommit, true);
        ok(completion.blockers.some((b) => b.kind === 'unresolved_high_priority_discrepancy'));
      } else {
        // Complete, validated, committed encounter succeeds
        const completion = evaluateEncounterCompletion({
          encounter: makeEncounter(false),
          proposedChanges: [makeProposal(`p-${i}`, true)],
          dispositions: [
            {
              id: `d-${i}`,
              proposalId: `p-${i}`,
              decision: 'accepted',
              at: '2026-11-15T10:15:00Z',
              actor: 'clin-1',
              note: null,
              revalidated: true,
              fhirPreview: null,
            } satisfies ReviewDisposition,
          ],
          documentationCommitted: true,
          requireDocumentationCommitted: true,
        });
        equal(completion.canComplete, true);
        equal(completion.blockers.length, 0);
      }
    }
  });

  it('4. 10,000 deterministic session store isolation, review key & assistant grounding cases', () => {
    const notes: readonly SyntheticAssistantNote[] = ['earlier', 'later'];
    for (let i = 0; i < CASES_PER_FAMILY; i++) {
      const scenarioA = `scenario-a-${i % 50}`;
      const scenarioB = `scenario-b-${i % 50}`;
      const decisionA = REVIEW_DECISIONS[i % REVIEW_DECISIONS.length]!;
      const decisionB = REVIEW_DECISIONS[(i + 1) % REVIEW_DECISIONS.length]!;

      const grouped: ReviewsByScenario = {
        [scenarioA]: { [`med-${i}`]: decisionA },
        [scenarioB]: { [`med-${i}`]: decisionB },
      };

      const flatA = flattenReviewsByScenario(grouped, scenarioA);
      equal(Object.keys(flatA).length, 1);
      equal(flatA[`${scenarioA}:med-${i}`], decisionA);

      const expanded = expandFlatReviews(flattenReviewsByScenario(grouped));
      equal(expanded[scenarioA]?.[`med-${i}`], decisionA);
      equal(expanded[scenarioB]?.[`med-${i}`], decisionB);

      const parsed = parseReviewKey(`${scenarioA}:med-${i}`);
      equal(parsed.scenarioId, scenarioA);
      equal(parsed.medId, `med-${i}`);
      equal(isValidReviewDecision(decisionA), true);
      equal(isValidReviewDecision(`invalid-${i}`), false);

      // Invalid key separator guard
      if (i % 10 === 0) {
        let threw = false;
        try {
          parseReviewKey(':missing-scenario');
        } catch (err) {
          threw = err instanceof SessionStoreValidationError;
        }
        equal(threw, true);
      }

      // Assistant evidence grounding contract
      const noteKey = notes[i % notes.length]!;
      const noteObj = SYNTHETIC_ASSISTANT_NOTES[noteKey];
      const med = noteObj.medications[i % noteObj.medications.length]!;
      const validResult = validateSyntheticAssistantResult(
        {
          mode: 'synthetic-test',
          note: noteKey,
          status: 'answered',
          evidence: [{ medication: med, excerpt: noteObj.text }],
        },
        noteKey,
      );
      ok(validResult !== null && validResult.status === 'answered');
    }
  });

  it('5. 10,000 deterministic fixture diff & scenario lookup cases', () => {
    for (let i = 0; i < CASES_PER_FAMILY; i++) {
      const scenario = syntheticScenarios[i % syntheticScenarios.length]!;
      const lookedUp = getSyntheticScenario(scenario.id);
      equal(lookedUp?.id, scenario.id);

      const report = analyzeSnapshots(scenario.earlier, scenario.later);
      ok(Array.isArray(report.changes));
      ok(Array.isArray(report.evidenceLinks));
      ok(Array.isArray(report.provenanceFlags));

      const medName = i % 2 === 0 ? 'Lisinopril' : 'Metformin';
      const doseA = (i % 40) + 5;
      const doseB = doseA + 10;
      const noteDiff = compareNoteRegimens(
        `${medName} ${doseA} mg daily.`,
        `${medName} ${doseB} mg daily.`,
      );
      equal(noteDiff.items.length, 1);
      equal(noteDiff.items[0]?.status, 'changed');
      equal(noteDiff.items[0]?.earlierRegimen?.dose, `${doseA} mg`);
      equal(noteDiff.items[0]?.laterRegimen?.dose, `${doseB} mg`);
    }
  });

  it('6. API route contract checks (/api/health, /api/compare, /api/assistant)', async () => {
    const healthRes = await healthGet(new NextRequest('http://localhost/api/health'));
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('Cache-Control')).toContain('no-store');

    const healthOpt = await healthOptions();
    expect([200, 204]).toContain(healthOpt.status);

    const badCompare = await comparePost(
      new NextRequest('http://localhost/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      }),
    );
    expect(badCompare.status).toBe(400);

    const badAssistant = await assistantPost(
      new NextRequest('http://localhost/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '' }),
      }),
    );
    expect([400, 422, 503]).toContain(badAssistant.status);
  });
});

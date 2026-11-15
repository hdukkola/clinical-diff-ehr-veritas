import { describe, expect, it } from 'vitest';
import {
  canRender,
  createWidgetRegistry,
  evaluateEncounterCompletion,
  evaluateProposalSafetyGate,
  getAllLayoutPresets,
  getAllWidgets,
  getLayoutPreset,
  getWidget,
  LAYOUT_PRESET_IDS,
  CORE_WIDGET_IDS,
  registerWidget,
  resetWidgetRegistry,
  validateLayoutPreset,
  type AIService,
  type AuditRecord,
  type ClinicalContext,
  type ClinicalDiffEntry,
  type ClinicalFact,
  type ClinicalSourceReference,
  type EncounterContext,
  type GeneratedSummary,
  type LayoutPreset,
  type ModelOutputMetadata,
  type PatientContext,
  type ProposedChange,
  type ReviewDisposition,
  type WidgetDefinition,
} from './cockpit';

function buildSamplePatient(): PatientContext {
  return {
    id: 'PAT-1001',
    name: 'Morgan Lee',
    age: 64,
    sex: 'F',
    activeProblems: [
      {
        id: 'prob-htn',
        name: 'Hypertension',
        status: 'active',
        onsetDate: '2018-04-12',
        sourceLabel: 'Outpatient problem list',
        sourceVersion: 'v1',
        recordedAt: '2026-10-01',
        relatedMedicationIds: ['m1'],
      },
      {
        id: 'prob-t2d',
        name: 'Type 2 diabetes',
        status: 'active',
        onsetDate: '2020-02-01',
        sourceLabel: 'Outpatient problem list',
        sourceVersion: 'v1',
        recordedAt: '2026-10-01',
        relatedMedicationIds: ['m2'],
      },
    ],
    allergies: [
      {
        id: 'alg-1',
        substance: 'Penicillin',
        reaction: 'Urticaria',
        severity: 'high',
        verificationStatus: 'confirmed',
        sourceLabel: 'Outpatient allergy record',
        sourceVersion: 'v1',
        recordedAt: '2025-05-10',
      },
    ],
    activeMedications: [
      { id: 'm1', name: 'Lisinopril', dose: '10 mg', route: 'oral', frequency: 'daily' },
      { id: 'm2', name: 'Metformin', dose: '500 mg', route: 'oral', frequency: 'twice daily' },
      { id: 'm3', name: 'Aspirin', dose: '81 mg', route: 'oral', frequency: 'daily' },
    ],
    missing: [],
  };
}

function buildSampleEncounter(overrides: Partial<EncounterContext> = {}): EncounterContext {
  return {
    id: 'enc-2026-11-15',
    patientId: 'PAT-1001',
    date: '2026-11-15',
    kind: 'outpatient-follow-up',
    summary: 'Follow-up after hospital discharge',
    sourceRef: 's2',
    medications: [
      { id: 'm1', name: 'Lisinopril', dose: '20 mg', route: 'oral', frequency: 'daily' },
      { id: 'm2', name: 'Metformin', dose: '500 mg', route: 'oral', frequency: null },
    ],
    encounters: [
      {
        id: 'enc-2026-10-01',
        date: '2026-10-01',
        kind: 'outpatient',
        sourceLabel: 'Outpatient medication list',
      },
    ],
    unresolvedDiscrepancies: [
      {
        id: 'disc-lisinopril',
        medication: 'Lisinopril',
        kind: 'dose_change',
        description: 'Dose increased 10 mg -> 20 mg at discharge',
        priority: 'high',
        status: 'unresolved',
        sourceVersion: 's2',
        recordedAt: '2026-10-15',
      },
    ],
    ...overrides,
  };
}

function buildClinicalContext(overrides: Partial<ClinicalContext> = {}): ClinicalContext {
  return {
    patient: buildSamplePatient(),
    encounter: buildSampleEncounter(),
    clinician: { id: 'clin-1', name: 'Dr. Jordan Avery', role: 'clinician' },
    dataPermissions: {
      grantedPermissions: [
        'read:patient',
        'read:medications',
        'write:proposed-actions',
        'commit:documentation',
      ],
    },
    encounterState: 'open',
    sourceVersions: { s1: '2026-10-01', s2: '2026-10-15' },
    proposedChanges: [],
    committedChanges: [],
    featureFlags: [],
    ...overrides,
  };
}

describe('cockpit core data contracts', () => {
  it('supports all core domain contracts and AIService interface shape', async () => {
    const sourceRef: ClinicalSourceReference = {
      sourceId: 's2',
      sourceLabel: 'Hospital discharge medication list',
      sourceType: 'discharge_summary',
      recordedAt: '2026-10-15',
      textSpan: { start: 0, end: 29 },
    };

    const fact: ClinicalFact = {
      id: 'fact-1',
      type: 'medication',
      value: { name: 'Lisinopril', dose: '20 mg', route: 'oral', frequency: 'daily' },
      source: sourceRef,
      authority: 'chart_fact',
      confidence: 0.98,
      status: 'authoritative',
    };

    const summary: GeneratedSummary = {
      id: 'sum-1',
      text: 'Discharge summary documents Lisinopril 20 mg oral daily.',
      sourceReferences: [sourceRef],
      authority: 'chart_fact',
      uncertainty: 'low',
      generatedAt: '2026-11-15T10:00:00Z',
      status: 'pending_clinician_review',
    };

    const metadata: ModelOutputMetadata = {
      modelId: 'deterministic-replay',
      modelVersion: '1.0.0',
      promptHash: 'abc123',
      generatedAt: '2026-11-15T10:00:00Z',
      confidence: 1,
      uncertainty: 'low',
      safetyChecks: ['evidence-sufficiency', 'required-fields', 'no-auto-commit'],
    };

    const audit: AuditRecord = {
      id: 'aud-1',
      timestamp: '2026-11-15T10:05:00Z',
      actor: 'clin-1',
      action: 'review_proposal',
      target: 'prop-1',
      before: 'pending',
      after: 'accepted',
      rationale: 'Verified against discharge medication list.',
    };

    const gate = evaluateProposalSafetyGate({
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
          sourceLabel: 'Discharge list',
          sourceText: 'Lisinopril 20 mg oral daily',
          startOffset: 0,
          endOffset: 27,
          quote: 'Lisinopril 20 mg oral daily',
        },
      ],
      authority: 'chart_fact',
    });

    const diffEntry: ClinicalDiffEntry = {
      id: 'prop-1',
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
          sourceLabel: 'Discharge list',
          sourceText: 'Lisinopril 20 mg oral daily',
          startOffset: 0,
          endOffset: 27,
          quote: 'Lisinopril 20 mg oral daily',
        },
      ],
      authority: 'chart_fact',
      uncertainty: 'low',
      gate,
      abstainReason: null,
    };

    const aiService: AIService = {
      id: 'clinical-ai',
      label: 'Clinical AI Service',
      health: async () => ({
        ok: true,
        mode: 'deterministic_replay',
        deterministicFallback: true,
        liveAi: false,
      }),
      summarizeChart: async () => summary,
      prepareEncounter: async () => summary,
      extractMedications: async () => [],
      proposeActions: async () => [diffEntry],
    };

    expect(fact.status).toBe('authoritative');
    expect(summary.status).toBe('pending_clinician_review');
    expect(metadata.safetyChecks).toContain('no-auto-commit');
    expect(audit.after).toBe('accepted');
    expect((await aiService.health()).deterministicFallback).toBe(true);
    expect((await aiService.proposeActions(buildSampleEncounter()))).toHaveLength(1);
  });
});

describe('curated 10-widget core registry', () => {
  it('registers all 10 curated core widgets with required metadata', () => {
    resetWidgetRegistry();
    const widgets = getAllWidgets();
    expect(widgets).toHaveLength(10);
    expect(widgets.map((w) => w.id)).toEqual([...CORE_WIDGET_IDS]);

    for (const id of CORE_WIDGET_IDS) {
      const def = getWidget(id);
      expect(def).toBeDefined();
      expect(def?.supportedSizes).toContain(def?.defaultSize);
      expect(def?.minDimensions.width).toBeGreaterThan(0);
      expect(def?.minDimensions.height).toBeGreaterThan(0);
      expect(def?.maxDimensions.width).toBeGreaterThanOrEqual(def!.minDimensions.width);
      expect(def?.maxDimensions.height).toBeGreaterThanOrEqual(def!.minDimensions.height);
      expect(def?.safetyRequirements.length).toBeGreaterThan(0);
    }
  });

  it('supports isolated registry creation and widget registration', () => {
    const customRegistry = createWidgetRegistry([]);
    expect(customRegistry.getAllWidgets()).toHaveLength(0);

    const customWidget: WidgetDefinition = {
      ...getWidget('patient-overview')!,
      id: 'custom-test-widget',
      displayName: 'Custom Test Widget',
      featureFlags: ['experimental-cockpit'],
    };

    customRegistry.registerWidget(customWidget);
    expect(customRegistry.getWidget('custom-test-widget')?.displayName).toBe('Custom Test Widget');

    expect(() =>
      registerWidget({ ...customWidget, id: '   ' }),
    ).toThrow('WidgetDefinition id must be non-empty');

    const ctxWithoutFlag = buildClinicalContext({ featureFlags: [] });
    expect(customRegistry.canRender('custom-test-widget', ctxWithoutFlag)).toBe(false);

    const ctxWithFlag = buildClinicalContext({ featureFlags: ['experimental-cockpit'] });
    expect(customRegistry.canRender('custom-test-widget', ctxWithFlag)).toBe(true);
  });

  it('enforces roles, permissions, and data dependencies in canRender', () => {
    const fullContext = buildClinicalContext();
    for (const id of CORE_WIDGET_IDS) {
      expect(canRender(id, fullContext)).toBe(true);
    }

    expect(canRender('non-existent-widget', fullContext)).toBe(false);

    const noPatientCtx = buildClinicalContext({ patient: null });
    expect(canRender('patient-overview', noPatientCtx)).toBe(false);

    const noEncounterCtx = buildClinicalContext({ encounter: null });
    expect(canRender('medication-workspace', noEncounterCtx)).toBe(false);
    expect(canRender('problem-list', noEncounterCtx)).toBe(true);

    const readOnlyCtx = buildClinicalContext({
      clinician: { id: 'ro-1', name: 'Read Only Viewer', role: 'read-only' },
      dataPermissions: { grantedPermissions: ['read:patient', 'read:medications'] },
    });
    expect(canRender('clinical-diff', readOnlyCtx)).toBe(true);
    expect(canRender('documentation-workspace', readOnlyCtx)).toBe(false);
    expect(canRender('orders-proposed-actions', readOnlyCtx)).toBe(false);
    expect(canRender('encounter-completion', readOnlyCtx)).toBe(false);

    const unauthCtx = buildClinicalContext({ clinician: null });
    expect(canRender('patient-overview', unauthCtx)).toBe(false);
  });
});

describe('layout presets', () => {
  it('exposes default-ambulatory and medication-reconciliation presets with valid non-overlapping 12-col grids', () => {
    const presets = getAllLayoutPresets();
    expect(presets.map((p) => p.id)).toEqual([...LAYOUT_PRESET_IDS]);
    expect(getLayoutPreset('unknown-preset')).toBeUndefined();

    for (const presetId of LAYOUT_PRESET_IDS) {
      const preset = getLayoutPreset(presetId);
      expect(preset).toBeDefined();
      expect(preset!.widgetInstances).toHaveLength(10);

      const definedIds = new Set(preset!.widgetInstances.map((w) => w.definitionId));
      expect(definedIds.size).toBe(10);
      for (const widgetId of CORE_WIDGET_IDS) {
        expect(definedIds.has(widgetId)).toBe(true);
      }

      const validation = validateLayoutPreset(preset!);
      expect(validation.errors).toEqual([]);
      expect(validation.valid).toBe(true);
    }
  });

  it('detects overlapping widgets, out-of-bounds widths, and unknown widget definitions', () => {
    const basePreset = getLayoutPreset('default-ambulatory')!;
    const invalidPreset: LayoutPreset = {
      ...basePreset,
      id: 'broken-preset',
      widgetInstances: [
        {
          ...basePreset.widgetInstances[0],
          position: { x: 0, y: 0, width: 10, height: 2 },
        },
        {
          ...basePreset.widgetInstances[1],
          position: { x: 8, y: 0, width: 6, height: 2 },
        },
        {
          ...basePreset.widgetInstances[2],
          definitionId: 'missing-widget',
          position: { x: 0, y: 2, width: 2, height: 1 },
        },
      ],
    };

    const validation = validateLayoutPreset(invalidPreset);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('evaluateProposalSafetyGate', () => {
  const dischargeText = 'Discharge medications: Lisinopril 20 mg oral daily; Metformin 500 mg oral.';

  it('passes a valid change proposal with literal evidence, required posology, and chart_fact authority', () => {
    const start = Array.from('Discharge medications: ').length;
    const quote = 'Lisinopril 20 mg oral daily';
    const end = start + Array.from(quote).length;

    const gate = evaluateProposalSafetyGate(
      {
        medication: 'Lisinopril',
        action: 'change',
        current: [
          { field: 'dose', value: '10 mg' },
          { field: 'route', value: 'oral' },
          { field: 'frequency', value: 'daily' },
        ],
        proposed: [
          { field: 'dose', value: '20 mg' },
          { field: 'route', value: 'oral' },
          { field: 'frequency', value: 'daily' },
        ],
        diff: [{ field: 'dose', before: '10 mg', after: '20 mg' }],
        evidence: [
          {
            sourceId: 's2',
            sourceLabel: 'Discharge medication list',
            sourceText: dischargeText,
            startOffset: start,
            endOffset: end,
            quote,
          },
        ],
        authority: 'chart_fact',
      },
      {
        sourceTextsById: { s2: dischargeText },
        evaluatedAt: '2026-11-15T12:00:00Z',
      },
    );

    expect(gate.passed).toBe(true);
    expect(gate.status).toBe('passed');
    expect(gate.abstained).toBe(false);
    expect(gate.abstainReason).toBeNull();
    expect(gate.blockers).toEqual([]);
    expect(gate.requiresClinicianReview).toBe(true);
    expect(gate.autoCommitAllowed).toBe(false);
    expect(gate.evaluatedAt).toBe('2026-11-15T12:00:00Z');
  });

  it('verifies Unicode code-point offsets accurately when surrogate-pair emoji precede the evidence span', () => {
    const emojiNote = '📋 Note: Lisinopril 20 mg oral daily';
    const prefixCodePoints = Array.from('📋 Note: ').length;
    const quote = 'Lisinopril 20 mg oral daily';
    const endCodePoint = prefixCodePoints + Array.from(quote).length;

    const gate = evaluateProposalSafetyGate(
      {
        medication: 'Lisinopril',
        action: 'start',
        current: [],
        proposed: [
          { field: 'dose', value: '20 mg' },
          { field: 'route', value: 'oral' },
          { field: 'frequency', value: 'daily' },
        ],
        diff: [{ field: 'dose', before: null, after: '20 mg' }],
        evidence: [
          {
            sourceId: 'note-emoji',
            sourceLabel: 'Emoji test note',
            sourceText: emojiNote,
            startOffset: prefixCodePoints,
            endOffset: endCodePoint,
            quote,
          },
        ],
        authority: 'chart_fact',
      },
      { sourceTextsById: { 'note-emoji': emojiNote } },
    );

    expect(gate.passed).toBe(true);
    expect(gate.autoCommitAllowed).toBe(false);
  });

  it('abstains when evidence is missing or fails literal span matching', () => {
    const missingEvidence = evaluateProposalSafetyGate({
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
    });

    expect(missingEvidence.passed).toBe(false);
    expect(missingEvidence.status).toBe('abstained');
    expect(missingEvidence.abstained).toBe(true);
    expect(missingEvidence.autoCommitAllowed).toBe(false);

    const hallucinatedQuote = evaluateProposalSafetyGate(
      {
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
            sourceLabel: 'Discharge list',
            sourceText: dischargeText,
            startOffset: 0,
            endOffset: 10,
            quote: 'Not in source',
          },
        ],
        authority: 'chart_fact',
      },
      { sourceTextsById: { s2: dischargeText } },
    );

    expect(hallucinatedQuote.passed).toBe(false);
    expect(hallucinatedQuote.status).toBe('abstained');
    expect(hallucinatedQuote.abstained).toBe(true);
    expect(hallucinatedQuote.autoCommitAllowed).toBe(false);
  });

  it('abstains on start or change when required dose, route, or frequency is missing or Not documented', () => {
    const start = Array.from('Discharge medications: Lisinopril 20 mg oral daily; ').length;
    const quote = 'Metformin 500 mg oral';
    const end = start + Array.from(quote).length;

    const missingFreqGate = evaluateProposalSafetyGate(
      {
        medication: 'Metformin',
        action: 'change',
        current: [
          { field: 'dose', value: '500 mg' },
          { field: 'route', value: 'oral' },
          { field: 'frequency', value: 'twice daily' },
        ],
        proposed: [
          { field: 'dose', value: '500 mg' },
          { field: 'route', value: 'oral' },
          { field: 'frequency', value: null },
        ],
        diff: [{ field: 'frequency', before: 'twice daily', after: null }],
        evidence: [
          {
            sourceId: 's2',
            sourceLabel: 'Discharge list',
            sourceText: dischargeText,
            startOffset: start,
            endOffset: end,
            quote,
          },
        ],
        authority: 'chart_fact',
      },
      { sourceTextsById: { s2: dischargeText } },
    );

    expect(missingFreqGate.passed).toBe(false);
    expect(missingFreqGate.status).toBe('abstained');
    expect(missingFreqGate.abstained).toBe(true);
    expect(missingFreqGate.abstainReason).toContain('frequency');
    expect(missingFreqGate.autoCommitAllowed).toBe(false);

    const notDocStartGate = evaluateProposalSafetyGate({
      medication: 'Metformin',
      action: 'start',
      current: [],
      proposed: [
        { field: 'dose', value: 'Not documented' },
        { field: 'route', value: 'oral' },
        { field: 'frequency', value: '' },
      ],
      diff: [{ field: 'route', before: null, after: 'oral' }],
      evidence: [
        {
          sourceId: 's2',
          sourceLabel: 'Discharge list',
          sourceText: dischargeText,
          startOffset: start,
          endOffset: end,
          quote,
        },
      ],
      authority: 'chart_fact',
    });

    expect(notDocStartGate.passed).toBe(false);
    expect(notDocStartGate.status).toBe('abstained');
    expect(notDocStartGate.abstainReason).toContain('dose');
    expect(notDocStartGate.abstainReason).toContain('frequency');
  });

  it('blocks patient_reported start/change, uncertain authority, and no-op change proposals', () => {
    const patientReportedStart = evaluateProposalSafetyGate({
      medication: 'Aspirin',
      action: 'start',
      current: [],
      proposed: [
        { field: 'dose', value: '81 mg' },
        { field: 'route', value: 'oral' },
        { field: 'frequency', value: 'daily' },
      ],
      diff: [{ field: 'name', before: null, after: 'Aspirin' }],
      evidence: [
        {
          sourceId: 'pr-1',
          sourceLabel: 'Patient report',
          sourceText: 'Patient takes Aspirin 81 mg oral daily',
          startOffset: 14,
          endOffset: 40,
          quote: 'Aspirin 81 mg oral daily',
        },
      ],
      authority: 'patient_reported',
    });

    expect(patientReportedStart.passed).toBe(false);
    expect(patientReportedStart.status).toBe('abstained');
    expect(patientReportedStart.abstainReason).toContain('observation, not an order');

    const uncertainStop = evaluateProposalSafetyGate({
      medication: 'Aspirin',
      action: 'stop',
      current: [{ field: 'dose', value: '81 mg' }],
      proposed: [],
      diff: [{ field: 'name', before: 'Aspirin', after: null }],
      evidence: [
        {
          sourceId: 's2',
          sourceLabel: 'Discharge list',
          sourceText: 'Aspirin not listed',
          startOffset: 0,
          endOffset: 18,
          quote: 'Aspirin not listed',
        },
      ],
      authority: 'uncertain',
    });

    expect(uncertainStop.passed).toBe(false);
    expect(uncertainStop.status).toBe('abstained');

    const noOpChange = evaluateProposalSafetyGate({
      medication: 'Lisinopril',
      action: 'change',
      current: [
        { field: 'dose', value: '10 mg' },
        { field: 'route', value: 'oral' },
        { field: 'frequency', value: 'daily' },
      ],
      proposed: [
        { field: 'dose', value: '10 mg' },
        { field: 'route', value: 'oral' },
        { field: 'frequency', value: 'daily' },
      ],
      diff: [],
      evidence: [
        {
          sourceId: 's1',
          sourceLabel: 'Outpatient list',
          sourceText: 'Lisinopril 10 mg oral daily',
          startOffset: 0,
          endOffset: 27,
          quote: 'Lisinopril 10 mg oral daily',
        },
      ],
      authority: 'chart_fact',
    });

    expect(noOpChange.passed).toBe(false);
    expect(noOpChange.status).toBe('blocked');
    expect(noOpChange.autoCommitAllowed).toBe(false);
  });

  it('allows stop action with valid literal evidence and chart_fact authority without full posology', () => {
    const stopGate = evaluateProposalSafetyGate({
      medication: 'Aspirin',
      action: 'stop',
      current: [{ field: 'dose', value: '81 mg' }],
      proposed: [],
      diff: [{ field: 'name', before: 'Aspirin', after: null }],
      evidence: [
        {
          sourceId: 's2',
          sourceLabel: 'Discharge plan',
          sourceText: 'Discontinue Aspirin 81 mg.',
          startOffset: 0,
          endOffset: 19,
          quote: 'Discontinue Aspirin',
        },
      ],
      authority: 'chart_fact',
    });

    expect(stopGate.passed).toBe(true);
    expect(stopGate.status).toBe('passed');
    expect(stopGate.autoCommitAllowed).toBe(false);
    expect(stopGate.requiresClinicianReview).toBe(true);
  });
});

describe('evaluateEncounterCompletion', () => {
  function makeProposal(id: string, medication: string, passed: boolean): ProposedChange {
    return {
      id,
      medication,
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
          sourceLabel: 'Discharge list',
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

  function makeDisposition(
    proposalId: string,
    decision: ReviewDisposition['decision'],
    revalidated = false,
  ): ReviewDisposition {
    return {
      id: `disp-${proposalId}`,
      proposalId,
      decision,
      at: '2026-11-15T10:15:00Z',
      actor: 'clin-1',
      note: null,
      revalidated,
      fhirPreview: null,
    };
  }

  it('blocks completion when no active encounter is present', () => {
    const result = evaluateEncounterCompletion({
      encounter: null,
      proposedChanges: [],
      dispositions: [],
    });

    expect(result.canComplete).toBe(false);
    expect(result.requiresExplicitCommit).toBe(true);
    expect(result.blockers.map((b) => b.kind)).toContain('missing_encounter');
  });

  it('blocks completion when unresolved high-priority discrepancies or unreviewed proposals remain', () => {
    const encounter = buildSampleEncounter({
      unresolvedDiscrepancies: [
        {
          id: 'disc-1',
          medication: 'Lisinopril',
          kind: 'dose_change',
          description: 'Dose 10 mg -> 20 mg unaddressed',
          priority: 'high',
          status: 'unresolved',
          sourceVersion: 's2',
          recordedAt: '2026-10-15',
        },
        {
          id: 'disc-low',
          medication: 'Vitamin D3',
          kind: 'other',
          description: 'Brand formulation note',
          priority: 'low',
          status: 'unresolved',
          sourceVersion: 's2',
          recordedAt: '2026-10-15',
        },
      ],
    });

    const p1 = makeProposal('prop-1', 'Lisinopril', true);
    const p2 = makeProposal('prop-2', 'Metformin', false);

    const result = evaluateEncounterCompletion({
      encounter,
      proposedChanges: [p1, p2],
      dispositions: [makeDisposition('prop-1', 'pending')],
    });

    expect(result.canComplete).toBe(false);
    expect(result.unresolvedHighPriorityCount).toBe(1);
    expect(result.unreviewedProposalCount).toBe(2);
    expect(result.blockers.map((b) => b.kind)).toEqual([
      'unresolved_high_priority_discrepancy',
      'unreviewed_proposal',
      'unreviewed_proposal',
    ]);
    expect(result.warnings).toHaveLength(1);
  });

  it('blocks edited proposals without revalidation, unsafe accepted proposals, and uncommitted required documentation', () => {
    const encounter = buildSampleEncounter({ unresolvedDiscrepancies: [] });
    const validProposal = makeProposal('prop-edit', 'Lisinopril', true);
    const unsafeProposal = makeProposal('prop-unsafe', 'Metformin', false);

    const result = evaluateEncounterCompletion({
      encounter,
      proposedChanges: [validProposal, unsafeProposal],
      dispositions: [
        makeDisposition('prop-edit', 'edited', false),
        makeDisposition('prop-unsafe', 'accepted', false),
      ],
      documentationCommitted: false,
      requireDocumentationCommitted: true,
    });

    expect(result.canComplete).toBe(false);
    expect(result.blockers.map((b) => b.kind)).toEqual([
      'edited_proposal_unrevalidated',
      'unsafe_accepted_proposal',
      'uncommitted_documentation',
    ]);
  });

  it('allows explicit clinician completion once high-priority discrepancies are resolved/deferred and all proposals are reviewed safely', () => {
    const encounter = buildSampleEncounter({
      unresolvedDiscrepancies: [
        {
          id: 'disc-1',
          medication: 'Lisinopril',
          kind: 'dose_change',
          description: 'Dose 10 mg -> 20 mg verified',
          priority: 'high',
          status: 'resolved',
          sourceVersion: 's2',
          recordedAt: '2026-10-15',
        },
        {
          id: 'disc-2',
          medication: 'Aspirin',
          kind: 'absent_medication',
          description: 'Deferred for outpatient pharmacy verification',
          priority: 'high',
          status: 'deferred',
          sourceVersion: 's2',
          recordedAt: '2026-10-15',
        },
      ],
    });

    const p1 = makeProposal('prop-1', 'Lisinopril', true);
    const p2 = makeProposal('prop-2', 'Metformin', false);
    const p3 = makeProposal('prop-3', 'Aspirin', true);

    const result = evaluateEncounterCompletion({
      encounter,
      proposedChanges: [p1, p2, p3],
      dispositions: [
        makeDisposition('prop-1', 'accepted', false),
        makeDisposition('prop-2', 'rejected', false),
        makeDisposition('prop-3', 'deferred', false),
      ],
      documentationCommitted: true,
      requireDocumentationCommitted: true,
    });

    expect(result.canComplete).toBe(true);
    expect(result.requiresExplicitCommit).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.unresolvedHighPriorityCount).toBe(0);
    expect(result.unreviewedProposalCount).toBe(0);
  });
});

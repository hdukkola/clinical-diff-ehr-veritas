/**
 * Phase 1 Repository Foundation & Core Contracts for the Clinical Cockpit.
 *
 * Aligns with `docs/TECHNICAL_ARCHITECTURE.md`, `docs/MVP_SPECIFICATION.md`,
 * and `docs/WIDGET_CATALOG.md`. All clinical records are 100% synthetic.
 * AI proposes; humans commit. No auto-commit path is permitted.
 */

import type { Medication } from './types';

// ---------------------------------------------------------------------------
// Core classifications & shared primitives
// ---------------------------------------------------------------------------

export type FieldClassification =
  | 'authoritative'
  | 'derived'
  | 'synthetic'
  | 'generated'
  | 'pending_clinician_review';

export type SourceAuthority =
  | 'patient_reported'
  | 'chart_fact'
  | 'historical'
  | 'uncertain'
  | 'clinician_decision';

export type UncertaintyLevel = 'low' | 'medium' | 'high';

export type ProposalAction =
  | 'start'
  | 'stop'
  | 'continue'
  | 'change'
  | 'restart'
  | 'taper';

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';

export type WidgetCategory =
  | 'patient-context'
  | 'medication-safety'
  | 'clinical-information'
  | 'encounter-workflow'
  | 'productivity';

export type RefreshStrategy = 'on-demand' | 'on-patient-change' | 'periodic';

// ---------------------------------------------------------------------------
// Patient & encounter data contracts
// ---------------------------------------------------------------------------

export interface Problem {
  id: string;
  name: string;
  status: 'active' | 'resolved' | 'historical';
  onsetDate: string | null;
  sourceLabel: string;
  sourceVersion: string;
  recordedAt: string | null;
  relatedMedicationIds?: string[];
}

export interface Allergy {
  id: string;
  substance: string;
  reaction: string | null;
  severity: 'high' | 'medium' | 'low' | 'unknown';
  verificationStatus: 'confirmed' | 'unconfirmed' | 'patient_reported';
  sourceLabel: string;
  sourceVersion: string;
  recordedAt: string | null;
}

export interface EncounterRef {
  id: string;
  date: string;
  kind: string;
  sourceLabel: string;
}

export type DiscrepancyPriority = 'high' | 'medium' | 'low';
export type DiscrepancyStatus = 'unresolved' | 'resolved' | 'deferred';

export interface Discrepancy {
  id: string;
  medication: string;
  kind: 'dose_change' | 'missing_field' | 'absent_medication' | 'added_medication' | 'other';
  description: string;
  priority: DiscrepancyPriority;
  status: DiscrepancyStatus;
  sourceVersion: string;
  recordedAt: string | null;
}

export interface PatientContext {
  id: string;
  name: string;
  age: number | null;
  sex: string | null;
  activeProblems: Problem[];
  allergies: Allergy[];
  activeMedications: Medication[];
  missing: string[];
}

export interface EncounterContext {
  id: string;
  patientId: string;
  date: string;
  kind: string;
  summary: string;
  sourceRef: string;
  medications: Medication[];
  encounters: EncounterRef[];
  unresolvedDiscrepancies: Discrepancy[];
}

// ---------------------------------------------------------------------------
// Widget registry & layout contracts
// ---------------------------------------------------------------------------

export interface WidgetDimensions {
  width: number;
  height: number;
}

export interface WidgetDefinition {
  id: string;
  displayName: string;
  category: WidgetCategory;
  supportedSizes: WidgetSize[];
  defaultSize: WidgetSize;
  minDimensions: WidgetDimensions;
  maxDimensions: WidgetDimensions;
  supportedRoles: string[];
  dataDependencies: string[];
  requiredPermissions: string[];
  refreshStrategy: RefreshStrategy;
  configurationSchema: Record<string, unknown>;
  supportedActions: string[];
  safetyRequirements: string[];
  version: string;
  featureFlags: string[];
}

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetInstance {
  id: string;
  definitionId: string;
  position: WidgetPosition;
  configuration: Record<string, unknown>;
  isVisible: boolean;
  isMinimized: boolean;
  lastRefreshed: string | null;
  error: string | null;
}

export type LayoutPresetId = 'default-ambulatory' | 'medication-reconciliation';

export interface LayoutPreset {
  id: LayoutPresetId | string;
  name: string;
  description: string;
  widgetInstances: WidgetInstance[];
  supportedRoles: string[];
}

// ---------------------------------------------------------------------------
// Provenance, AI output & safety gate contracts
// ---------------------------------------------------------------------------

export interface ClinicalSourceReference {
  sourceId: string;
  sourceLabel: string;
  sourceType: string;
  recordedAt: string | null;
  textSpan: { start: number; end: number };
}

export interface ClinicalFact {
  id: string;
  type: 'medication' | 'condition' | 'allergy' | 'observation' | string;
  value: unknown;
  source: ClinicalSourceReference;
  authority: SourceAuthority;
  confidence: number;
  status: FieldClassification;
}

export interface GeneratedSummary {
  id: string;
  text: string;
  sourceReferences: ClinicalSourceReference[];
  authority: SourceAuthority;
  uncertainty: UncertaintyLevel;
  generatedAt: string;
  status: 'pending_clinician_review';
}

export interface ProposalField {
  field: 'name' | 'dose' | 'route' | 'frequency' | string;
  value: string | null;
  classification?: FieldClassification;
}

export interface ProposalDiff {
  field: string;
  before: string | null;
  after: string | null;
}

export interface ClinicalEvidence {
  sourceId: string;
  sourceLabel: string;
  sourceText: string;
  startOffset: number;
  endOffset: number;
  quote?: string;
}

export type GateStatus = 'passed' | 'blocked' | 'abstained';

export type SafetyCheckName =
  | 'evidence-sufficiency'
  | 'required-fields'
  | 'authority-check'
  | 'non-trivial-diff'
  | 'no-auto-commit';

export interface SafetyCheckResult {
  check: SafetyCheckName;
  passed: boolean;
  message: string;
}

export interface GateResult {
  passed: boolean;
  status: GateStatus;
  abstained: boolean;
  abstainReason: string | null;
  blockers: string[];
  checks: SafetyCheckResult[];
  requiresClinicianReview: true;
  autoCommitAllowed: false;
  evaluatedAt: string;
}

export interface ProposedChange {
  id: string;
  medication: string;
  action: ProposalAction;
  current: ProposalField[];
  proposed: ProposalField[];
  diff: ProposalDiff[];
  evidence: ClinicalEvidence[];
  authority: SourceAuthority;
  uncertainty: UncertaintyLevel;
  gate: GateResult;
  abstainReason: string | null;
}

export interface ClinicalDiffEntry {
  id: string;
  medication: string;
  action: ProposalAction;
  current: ProposalField[];
  proposed: ProposalField[];
  diff: ProposalDiff[];
  evidence: ClinicalEvidence[];
  authority: SourceAuthority;
  uncertainty: UncertaintyLevel;
  gate: GateResult;
  abstainReason: string | null;
}

export type ReviewDecision =
  | 'accepted'
  | 'edited'
  | 'rejected'
  | 'deferred'
  | 'pending';

export interface FhirMedicationStatement {
  resourceType: 'MedicationStatement';
  status: 'active' | 'stopped' | 'intended' | 'unknown';
  medicationCodeableConcept: {
    text: string;
  };
  dosage?: Array<{
    text: string;
    route?: string;
    doseAndRate?: string;
    timing?: string;
  }>;
  simulatedPreviewOnly: true;
}

export interface ReviewDisposition {
  id: string;
  proposalId: string;
  decision: ReviewDecision;
  at: string;
  actor: string;
  note: string | null;
  revalidated: boolean;
  fhirPreview: FhirMedicationStatement | null;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  before: unknown | null;
  after: unknown | null;
  rationale: string | null;
}

export interface ModelOutputMetadata {
  modelId: string;
  modelVersion: string;
  promptHash: string;
  generatedAt: string;
  confidence: number;
  uncertainty: UncertaintyLevel;
  safetyChecks: string[];
}

// ---------------------------------------------------------------------------
// Shared application context & AI service abstraction
// ---------------------------------------------------------------------------

export interface ClinicianContext {
  id: string;
  name: string;
  role: 'clinician' | 'read-only' | 'admin' | string;
}

export interface DataPermissions {
  grantedPermissions: string[];
}

export type EncounterState =
  | 'idle'
  | 'open'
  | 'in_review'
  | 'ready_for_commit'
  | 'completed';

export interface CommittedChange {
  id: string;
  proposalId: string;
  dispositionId: string;
  committedAt: string;
  actor: string;
  fhirPreview: FhirMedicationStatement | null;
}

export interface ClinicalContext {
  patient: PatientContext | null;
  encounter: EncounterContext | null;
  clinician: ClinicianContext | null;
  dataPermissions: DataPermissions;
  encounterState: EncounterState;
  sourceVersions: Record<string, string>;
  proposedChanges: ProposedChange[];
  committedChanges: CommittedChange[];
  featureFlags?: string[];
}

export interface ServiceHealth {
  ok: boolean;
  mode: 'deterministic_replay' | 'local_mlx' | 'unavailable' | string;
  simulated: boolean;
  liveAi: boolean;
  detail?: string;
}

export interface ExtractedMedication {
  name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  evidence: ClinicalEvidence;
}

export interface AIService {
  id: string;
  label: string;
  health(): Promise<ServiceHealth>;
  summarizeChart(context: ClinicalContext): Promise<GeneratedSummary>;
  prepareEncounter(context: EncounterContext): Promise<GeneratedSummary>;
  extractMedications(noteText: string): Promise<ExtractedMedication[]>;
  proposeActions(context: EncounterContext): Promise<ProposedChange[]>;
}

// ---------------------------------------------------------------------------
// Curated 10-widget MVP registry
// ---------------------------------------------------------------------------

export const MVP_WIDGET_IDS = [
  'patient-overview',
  'problem-list',
  'medication-workspace',
  'allergy-workspace',
  'vitals-labs',
  'ai-encounter-prep',
  'documentation-workspace',
  'orders-proposed-actions',
  'clinical-diff',
  'encounter-completion',
] as const;

export type MvpWidgetId = (typeof MVP_WIDGET_IDS)[number];

export const GRID_COLUMN_COUNT = 12;

export const MVP_WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  {
    id: 'patient-overview',
    displayName: 'Patient Overview',
    category: 'patient-context',
    supportedSizes: ['medium', 'large', 'full'],
    defaultSize: 'medium',
    minDimensions: { width: 4, height: 2 },
    maxDimensions: { width: 12, height: 4 },
    supportedRoles: ['clinician', 'read-only', 'admin'],
    dataDependencies: ['patient', 'encounter'],
    requiredPermissions: ['read:patient'],
    refreshStrategy: 'on-patient-change',
    configurationSchema: {
      showAlertsBanner: { type: 'boolean', default: true },
    },
    supportedActions: ['view', 'refresh', 'navigate'],
    safetyRequirements: ['synthetic-only-banner', 'always-visible-allergy-alert'],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'problem-list',
    displayName: 'Problem List',
    category: 'patient-context',
    supportedSizes: ['medium', 'large'],
    defaultSize: 'medium',
    minDimensions: { width: 4, height: 2 },
    maxDimensions: { width: 8, height: 6 },
    supportedRoles: ['clinician', 'read-only', 'admin'],
    dataDependencies: ['patient'],
    requiredPermissions: ['read:patient'],
    refreshStrategy: 'on-patient-change',
    configurationSchema: {
      includeHistorical: { type: 'boolean', default: true },
    },
    supportedActions: ['view', 'filter', 'select-problem'],
    safetyRequirements: ['source-version-tag'],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'medication-workspace',
    displayName: 'Medication Workspace',
    category: 'medication-safety',
    supportedSizes: ['medium', 'large', 'full'],
    defaultSize: 'large',
    minDimensions: { width: 6, height: 3 },
    maxDimensions: { width: 12, height: 8 },
    supportedRoles: ['clinician', 'read-only', 'admin'],
    dataDependencies: ['patient', 'encounter'],
    requiredPermissions: ['read:medications'],
    refreshStrategy: 'on-patient-change',
    configurationSchema: {
      highlightDiscrepancies: { type: 'boolean', default: true },
    },
    supportedActions: ['view', 'filter', 'inspect-evidence'],
    safetyRequirements: [
      'separate-patient-reported-observation',
      'explicit-not-documented-label',
    ],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'allergy-workspace',
    displayName: 'Allergy Workspace',
    category: 'medication-safety',
    supportedSizes: ['small', 'medium'],
    defaultSize: 'small',
    minDimensions: { width: 3, height: 2 },
    maxDimensions: { width: 6, height: 4 },
    supportedRoles: ['clinician', 'read-only', 'admin'],
    dataDependencies: ['patient'],
    requiredPermissions: ['read:patient'],
    refreshStrategy: 'on-patient-change',
    configurationSchema: {},
    supportedActions: ['view', 'mark-reviewed', 'inspect-evidence'],
    safetyRequirements: ['non-color-only-severity-label'],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'vitals-labs',
    displayName: 'Vitals & Labs',
    category: 'clinical-information',
    supportedSizes: ['medium', 'large', 'full'],
    defaultSize: 'medium',
    minDimensions: { width: 4, height: 2 },
    maxDimensions: { width: 12, height: 6 },
    supportedRoles: ['clinician', 'read-only', 'admin'],
    dataDependencies: ['patient', 'encounter'],
    requiredPermissions: ['read:patient'],
    refreshStrategy: 'on-patient-change',
    configurationSchema: {
      abnormalFirst: { type: 'boolean', default: true },
    },
    supportedActions: ['view', 'filter', 'select-observation'],
    safetyRequirements: ['explicit-not-documented-label', 'non-color-only-abnormal-label'],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'ai-encounter-prep',
    displayName: 'AI Encounter Preparation',
    category: 'encounter-workflow',
    supportedSizes: ['medium', 'large'],
    defaultSize: 'medium',
    minDimensions: { width: 4, height: 2 },
    maxDimensions: { width: 8, height: 6 },
    supportedRoles: ['clinician', 'admin'],
    dataDependencies: ['patient', 'encounter'],
    requiredPermissions: ['read:patient', 'read:medications'],
    refreshStrategy: 'on-demand',
    configurationSchema: {
      deterministicReplayFallback: { type: 'boolean', default: true },
    },
    supportedActions: ['generate', 'accept', 'edit', 'reject', 'inspect-evidence'],
    safetyRequirements: [
      'pending-clinician-review-badge',
      'source-reference-required',
      'service-unavailable-fallback',
    ],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'documentation-workspace',
    displayName: 'Documentation Workspace',
    category: 'encounter-workflow',
    supportedSizes: ['large', 'full'],
    defaultSize: 'large',
    minDimensions: { width: 6, height: 3 },
    maxDimensions: { width: 12, height: 8 },
    supportedRoles: ['clinician', 'admin'],
    dataDependencies: ['patient', 'encounter'],
    requiredPermissions: ['read:patient', 'commit:documentation'],
    refreshStrategy: 'on-demand',
    configurationSchema: {
      problemOrientedTemplate: { type: 'boolean', default: true },
    },
    supportedActions: ['draft', 'edit', 'accept-suggestion', 'reject-suggestion', 'commit'],
    safetyRequirements: ['clinician-edit-before-commit', 'no-auto-commit'],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'orders-proposed-actions',
    displayName: 'Orders & Proposed Actions',
    category: 'encounter-workflow',
    supportedSizes: ['medium', 'large'],
    defaultSize: 'medium',
    minDimensions: { width: 4, height: 2 },
    maxDimensions: { width: 8, height: 6 },
    supportedRoles: ['clinician', 'admin'],
    dataDependencies: ['patient', 'encounter', 'proposedChanges'],
    requiredPermissions: ['read:medications', 'write:proposed-actions'],
    refreshStrategy: 'on-demand',
    configurationSchema: {},
    supportedActions: ['accept', 'edit', 'reject', 'defer', 'inspect-evidence'],
    safetyRequirements: [
      'evidence-sufficiency-gate',
      'revalidate-on-edit',
      'no-auto-commit',
    ],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'clinical-diff',
    displayName: 'Clinical Diff',
    category: 'encounter-workflow',
    supportedSizes: ['large', 'full'],
    defaultSize: 'large',
    minDimensions: { width: 6, height: 3 },
    maxDimensions: { width: 12, height: 8 },
    supportedRoles: ['clinician', 'read-only', 'admin'],
    dataDependencies: ['patient', 'encounter', 'proposedChanges'],
    requiredPermissions: ['read:medications'],
    refreshStrategy: 'on-patient-change',
    configurationSchema: {
      exceptionOrientedOnly: { type: 'boolean', default: true },
    },
    supportedActions: ['view', 'accept', 'edit', 'reject', 'defer', 'inspect-evidence'],
    safetyRequirements: [
      'evidence-sufficiency-gate',
      'uncertainty-badge',
      'no-auto-commit',
    ],
    version: '1.0.0',
    featureFlags: [],
  },
  {
    id: 'encounter-completion',
    displayName: 'Encounter Completion',
    category: 'encounter-workflow',
    supportedSizes: ['small', 'medium'],
    defaultSize: 'small',
    minDimensions: { width: 3, height: 2 },
    maxDimensions: { width: 6, height: 4 },
    supportedRoles: ['clinician', 'admin'],
    dataDependencies: ['patient', 'encounter'],
    requiredPermissions: ['commit:documentation'],
    refreshStrategy: 'on-demand',
    configurationSchema: {},
    supportedActions: ['review-blockers', 'commit', 'defer'],
    safetyRequirements: [
      'block-unresolved-high-priority-discrepancies',
      'block-unreviewed-proposals',
      'audit-record-on-commit',
    ],
    version: '1.0.0',
    featureFlags: [],
  },
];

export interface WidgetRegistry {
  registerWidget(definition: WidgetDefinition): void;
  getWidget(id: string): WidgetDefinition | undefined;
  getAllWidgets(): WidgetDefinition[];
  canRender(widgetId: string, context: ClinicalContext): boolean;
}

function hasDataDependency(dependency: string, context: ClinicalContext): boolean {
  switch (dependency) {
    case 'patient':
      return context.patient !== null;
    case 'encounter':
      return context.encounter !== null;
    case 'proposedChanges':
      return Array.isArray(context.proposedChanges);
    case 'committedChanges':
      return Array.isArray(context.committedChanges);
    default:
      return dependency in context.sourceVersions;
  }
}

export function createWidgetRegistry(
  initialDefinitions: readonly WidgetDefinition[] = MVP_WIDGET_DEFINITIONS,
): WidgetRegistry {
  const definitions = new Map<string, WidgetDefinition>();
  for (const def of initialDefinitions) {
    definitions.set(def.id, def);
  }

  return {
    registerWidget(definition: WidgetDefinition): void {
      if (!definition.id.trim()) {
        throw new Error('WidgetDefinition id must be non-empty');
      }
      definitions.set(definition.id, definition);
    },
    getWidget(id: string): WidgetDefinition | undefined {
      return definitions.get(id);
    },
    getAllWidgets(): WidgetDefinition[] {
      return Array.from(definitions.values());
    },
    canRender(widgetId: string, context: ClinicalContext): boolean {
      const definition = definitions.get(widgetId);
      if (!definition) return false;

      if (definition.supportedRoles.length > 0) {
        if (!context.clinician) return false;
        if (!definition.supportedRoles.includes(context.clinician.role)) {
          return false;
        }
      }

      const granted = new Set(context.dataPermissions.grantedPermissions);
      for (const permission of definition.requiredPermissions) {
        if (!granted.has(permission)) return false;
      }

      for (const dependency of definition.dataDependencies) {
        if (!hasDataDependency(dependency, context)) return false;
      }

      if (definition.featureFlags.length > 0) {
        const enabledFlags = new Set(context.featureFlags ?? []);
        for (const flag of definition.featureFlags) {
          if (!enabledFlags.has(flag)) return false;
        }
      }

      return true;
    },
  };
}

let defaultWidgetRegistry: WidgetRegistry = createWidgetRegistry(MVP_WIDGET_DEFINITIONS);

export function registerWidget(definition: WidgetDefinition): void {
  defaultWidgetRegistry.registerWidget(definition);
}

export function getWidget(id: string): WidgetDefinition | undefined {
  return defaultWidgetRegistry.getWidget(id);
}

export function getAllWidgets(): WidgetDefinition[] {
  return defaultWidgetRegistry.getAllWidgets();
}

export function resetWidgetRegistry(): void {
  defaultWidgetRegistry = createWidgetRegistry(MVP_WIDGET_DEFINITIONS);
}

export function canRender(widgetId: string, context: ClinicalContext): boolean {
  return defaultWidgetRegistry.canRender(widgetId, context);
}

// ---------------------------------------------------------------------------
// Curated 2 layout presets
// ---------------------------------------------------------------------------

export const LAYOUT_PRESET_IDS = [
  'default-ambulatory',
  'medication-reconciliation',
] as const;

function makeInstance(
  presetId: LayoutPresetId,
  definitionId: MvpWidgetId,
  position: WidgetPosition,
): WidgetInstance {
  return {
    id: `${presetId}:${definitionId}`,
    definitionId,
    position,
    configuration: {},
    isVisible: true,
    isMinimized: false,
    lastRefreshed: null,
    error: null,
  };
}

export const MVP_LAYOUT_PRESETS: Record<LayoutPresetId, LayoutPreset> = {
  'default-ambulatory': {
    id: 'default-ambulatory',
    name: 'Default Ambulatory',
    description:
      'Standard outpatient follow-up cockpit with patient context and longitudinal workflow in the primary column and safety/completion controls in the right rail.',
    supportedRoles: ['clinician', 'admin'],
    widgetInstances: [
      makeInstance('default-ambulatory', 'patient-overview', { x: 0, y: 0, width: 8, height: 2 }),
      makeInstance('default-ambulatory', 'problem-list', { x: 0, y: 2, width: 8, height: 2 }),
      makeInstance('default-ambulatory', 'medication-workspace', { x: 0, y: 4, width: 8, height: 4 }),
      makeInstance('default-ambulatory', 'vitals-labs', { x: 0, y: 8, width: 8, height: 3 }),
      makeInstance('default-ambulatory', 'documentation-workspace', { x: 0, y: 11, width: 8, height: 4 }),
      makeInstance('default-ambulatory', 'clinical-diff', { x: 0, y: 15, width: 8, height: 4 }),
      makeInstance('default-ambulatory', 'allergy-workspace', { x: 8, y: 0, width: 4, height: 2 }),
      makeInstance('default-ambulatory', 'ai-encounter-prep', { x: 8, y: 2, width: 4, height: 3 }),
      makeInstance('default-ambulatory', 'orders-proposed-actions', { x: 8, y: 5, width: 4, height: 3 }),
      makeInstance('default-ambulatory', 'encounter-completion', { x: 8, y: 8, width: 4, height: 3 }),
    ],
  },
  'medication-reconciliation': {
    id: 'medication-reconciliation',
    name: 'Medication Reconciliation',
    description:
      'Medication-focused layout elevating Medication Workspace, Clinical Diff, and Orders & Proposed Actions for discrepancy review.',
    supportedRoles: ['clinician', 'admin'],
    widgetInstances: [
      makeInstance('medication-reconciliation', 'medication-workspace', { x: 0, y: 0, width: 8, height: 4 }),
      makeInstance('medication-reconciliation', 'clinical-diff', { x: 0, y: 4, width: 8, height: 4 }),
      makeInstance('medication-reconciliation', 'orders-proposed-actions', { x: 0, y: 8, width: 8, height: 3 }),
      makeInstance('medication-reconciliation', 'documentation-workspace', { x: 0, y: 11, width: 8, height: 3 }),
      makeInstance('medication-reconciliation', 'patient-overview', { x: 8, y: 0, width: 4, height: 2 }),
      makeInstance('medication-reconciliation', 'allergy-workspace', { x: 8, y: 2, width: 4, height: 2 }),
      makeInstance('medication-reconciliation', 'vitals-labs', { x: 8, y: 4, width: 4, height: 3 }),
      makeInstance('medication-reconciliation', 'problem-list', { x: 8, y: 7, width: 4, height: 2 }),
      makeInstance('medication-reconciliation', 'ai-encounter-prep', { x: 8, y: 9, width: 4, height: 2 }),
      makeInstance('medication-reconciliation', 'encounter-completion', { x: 8, y: 11, width: 4, height: 3 }),
    ],
  },
};

export function getLayoutPreset(id: string): LayoutPreset | undefined {
  if (id === 'default-ambulatory' || id === 'medication-reconciliation') {
    return MVP_LAYOUT_PRESETS[id];
  }
  return undefined;
}

export function getAllLayoutPresets(): LayoutPreset[] {
  return [
    MVP_LAYOUT_PRESETS['default-ambulatory'],
    MVP_LAYOUT_PRESETS['medication-reconciliation'],
  ];
}

export function validateLayoutPreset(
  preset: LayoutPreset,
  registry: WidgetRegistry = defaultWidgetRegistry,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const boxes: Array<{ id: string; pos: WidgetPosition }> = [];

  for (const instance of preset.widgetInstances) {
    const def = registry.getWidget(instance.definitionId);
    if (!def) {
      errors.push(`Unknown widget definition "${instance.definitionId}" in preset "${preset.id}"`);
      continue;
    }

    const { x, y, width, height } = instance.position;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > GRID_COLUMN_COUNT) {
      errors.push(
        `Widget "${instance.id}" position (${x},${y},${width}x${height}) is outside 12-column grid bounds`,
      );
    }

    if (
      width < def.minDimensions.width ||
      height < def.minDimensions.height ||
      width > def.maxDimensions.width ||
      height > def.maxDimensions.height
    ) {
      errors.push(
        `Widget "${instance.id}" size ${width}x${height} violates definition bounds (${def.minDimensions.width}x${def.minDimensions.height}..${def.maxDimensions.width}x${def.maxDimensions.height})`,
      );
    }

    for (const other of boxes) {
      const overlapsX = x < other.pos.x + other.pos.width && x + width > other.pos.x;
      const overlapsY = y < other.pos.y + other.pos.height && y + height > other.pos.y;
      if (overlapsX && overlapsY) {
        errors.push(`Widget "${instance.id}" overlaps with "${other.id}"`);
      }
    }

    boxes.push({ id: instance.id, pos: instance.position });
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Deterministic safety gates
// ---------------------------------------------------------------------------

const MISSING_VALUE_TOKENS = new Set([
  '',
  'unknown',
  'not documented',
  'not specified',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'tbd',
]);

const REQUIRED_FIELDS_FOR_START_OR_CHANGE = ['dose', 'route', 'frequency'] as const;

function normalizeFieldValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (MISSING_VALUE_TOKENS.has(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

function sliceByCodePoints(text: string, start: number, end: number): string | null {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end <= start) return null;
  const codePoints = Array.from(text);
  if (end > codePoints.length) return null;
  return codePoints.slice(start, end).join('');
}

export interface SafetyGateOptions {
  /** Optional authoritative source texts keyed by `sourceId` for literal span verification. */
  sourceTextsById?: Record<string, string>;
  /** Deterministic evaluation timestamp override (defaults to current ISO timestamp). */
  evaluatedAt?: string;
}

function hasValidEvidenceItem(
  ev: ClinicalEvidence,
  sourceTextsById?: Record<string, string>,
): { valid: boolean; reason?: string } {
  if (!ev.sourceId || !ev.sourceId.trim()) {
    return { valid: false, reason: 'Evidence is missing sourceId' };
  }

  const authoritativeSourceText = sourceTextsById?.[ev.sourceId];
  if (sourceTextsById && authoritativeSourceText === undefined) {
    return {
      valid: false,
      reason: `No source text found for sourceId "${ev.sourceId}"`,
    };
  }

  const candidateText = authoritativeSourceText ?? ev.sourceText;
  if (!candidateText || !candidateText.trim()) {
    return { valid: false, reason: 'Evidence sourceText is empty' };
  }

  const extracted = sliceByCodePoints(candidateText, ev.startOffset, ev.endOffset);
  if (extracted === null || !extracted.trim()) {
    return {
      valid: false,
      reason: `Invalid Unicode code-point span [${ev.startOffset}, ${ev.endOffset}) for sourceId "${ev.sourceId}"`,
    };
  }

  if (ev.quote !== undefined) {
    if (!ev.quote.trim() || extracted !== ev.quote) {
      return {
        valid: false,
        reason: `Evidence quote does not literally match span [${ev.startOffset}, ${ev.endOffset}) in sourceId "${ev.sourceId}"`,
      };
    }
  }

  if (authoritativeSourceText !== undefined && ev.sourceText && ev.sourceText !== authoritativeSourceText) {
    if (!authoritativeSourceText.includes(ev.sourceText)) {
      return {
        valid: false,
        reason: `Evidence sourceText is not a literal substring of authoritative source "${ev.sourceId}"`,
      };
    }
  }

  return { valid: true };
}

function toFieldMap(fields: ProposalField[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const item of fields) {
    map.set(item.field.toLowerCase(), normalizeFieldValue(item.value));
  }
  return map;
}

function hasActualStateDifference(proposal: ProposedChange): boolean {
  if (proposal.diff.some((d) => normalizeFieldValue(d.before) !== normalizeFieldValue(d.after))) {
    return true;
  }

  const currentMap = toFieldMap(proposal.current);
  const proposedMap = toFieldMap(proposal.proposed);
  const allKeys = new Set([...currentMap.keys(), ...proposedMap.keys()]);

  for (const key of allKeys) {
    if ((currentMap.get(key) ?? null) !== (proposedMap.get(key) ?? null)) {
      return true;
    }
  }

  return false;
}

/**
 * Deterministic safety gate for AI-proposed medication changes.
 *
 * Enforces:
 * 1. Evidence sufficiency (literal Unicode code-point span in source text).
 * 2. Abstention on missing required `dose`, `route`, or `frequency` for `start` / `change`.
 * 3. Authority restrictions (`patient_reported` and `uncertain` blocked for `start` / `change`,
 *    and `uncertain` blocked across all proposals).
 * 4. Non-trivial diff for `change` proposals.
 * 5. No auto-commit (`autoCommitAllowed` is always `false`, `requiresClinicianReview` is always `true`).
 */
export function evaluateProposalSafetyGate(
  proposal: Pick<
    ProposedChange,
    'medication' | 'action' | 'current' | 'proposed' | 'diff' | 'evidence' | 'authority'
  >,
  options: SafetyGateOptions = {},
): GateResult {
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const checks: SafetyCheckResult[] = [];
  const blockers: string[] = [];
  let shouldAbstain = false;

  // 1. Evidence-sufficiency check
  if (!proposal.evidence || proposal.evidence.length === 0) {
    const msg = 'No supporting clinical evidence provided; abstaining without guessing.';
    checks.push({ check: 'evidence-sufficiency', passed: false, message: msg });
    blockers.push(msg);
    shouldAbstain = true;
  } else {
    const failures: string[] = [];
    let validCount = 0;
    for (const ev of proposal.evidence) {
      const res = hasValidEvidenceItem(ev, options.sourceTextsById);
      if (res.valid) {
        validCount += 1;
      } else if (res.reason) {
        failures.push(res.reason);
      }
    }

    if (validCount === 0 || failures.length > 0) {
      const msg =
        failures.length > 0
          ? `Insufficient literal evidence: ${failures.join('; ')}`
          : 'No valid literal evidence span found.';
      checks.push({ check: 'evidence-sufficiency', passed: false, message: msg });
      blockers.push(msg);
      shouldAbstain = true;
    } else {
      checks.push({
        check: 'evidence-sufficiency',
        passed: true,
        message: `${validCount} literal evidence span(s) verified.`,
      });
    }
  }

  // 2. Required fields check for start / change
  const isStartOrChange = proposal.action === 'start' || proposal.action === 'change';
  if (isStartOrChange) {
    const proposedMap = toFieldMap(proposal.proposed);
    const missingFields = REQUIRED_FIELDS_FOR_START_OR_CHANGE.filter(
      (field) => proposedMap.get(field) === null || proposedMap.get(field) === undefined,
    );

    if (missingFields.length > 0) {
      const msg = `Abstaining on ${proposal.action} for ${proposal.medication}: missing required field(s) (${missingFields.join(', ')}).`;
      checks.push({ check: 'required-fields', passed: false, message: msg });
      blockers.push(msg);
      shouldAbstain = true;
    } else {
      checks.push({
        check: 'required-fields',
        passed: true,
        message: 'Required dose, route, and frequency are present.',
      });
    }
  } else {
    checks.push({
      check: 'required-fields',
      passed: true,
      message: `Action "${proposal.action}" does not require full posology fields.`,
    });
  }

  // 3. Authority check
  if (proposal.authority === 'uncertain') {
    const msg = `Abstaining on ${proposal.medication}: source authority is uncertain.`;
    checks.push({ check: 'authority-check', passed: false, message: msg });
    blockers.push(msg);
    shouldAbstain = true;
  } else if (isStartOrChange && proposal.authority === 'patient_reported') {
    const msg = `Blocked ${proposal.action} for ${proposal.medication}: patient-reported medication is an observation, not an order.`;
    checks.push({ check: 'authority-check', passed: false, message: msg });
    blockers.push(msg);
    shouldAbstain = true;
  } else {
    checks.push({
      check: 'authority-check',
      passed: true,
      message: `Authority "${proposal.authority}" is permitted for "${proposal.action}".`,
    });
  }

  // 4. Non-trivial diff check for 'change'
  if (proposal.action === 'change') {
    const dummyProposal = { ...proposal, id: '', uncertainty: 'low' as const, gate: {} as GateResult, abstainReason: null };
    if (!hasActualStateDifference(dummyProposal)) {
      const msg = `Blocked change proposal for ${proposal.medication}: no difference detected between current and proposed state.`;
      checks.push({ check: 'non-trivial-diff', passed: false, message: msg });
      blockers.push(msg);
    } else {
      checks.push({
        check: 'non-trivial-diff',
        passed: true,
        message: 'Meaningful field difference detected.',
      });
    }
  } else {
    checks.push({
      check: 'non-trivial-diff',
      passed: true,
      message: `Action "${proposal.action}" is not a no-op change.`,
    });
  }

  // 5. Explicit no-auto-commit invariant
  checks.push({
    check: 'no-auto-commit',
    passed: true,
    message: 'Auto-commit disabled; explicit clinician disposition required.',
  });

  const passed = blockers.length === 0;
  const status: GateStatus = passed ? 'passed' : shouldAbstain ? 'abstained' : 'blocked';

  return {
    passed,
    status,
    abstained: !passed && shouldAbstain,
    abstainReason: !passed && shouldAbstain ? blockers.join(' ') : null,
    blockers,
    checks,
    requiresClinicianReview: true,
    autoCommitAllowed: false,
    evaluatedAt,
  };
}

// ---------------------------------------------------------------------------
// Encounter completion gate
// ---------------------------------------------------------------------------

export type EncounterCompletionBlockerKind =
  | 'missing_encounter'
  | 'unresolved_high_priority_discrepancy'
  | 'unreviewed_proposal'
  | 'edited_proposal_unrevalidated'
  | 'unsafe_accepted_proposal'
  | 'uncommitted_documentation';

export interface EncounterCompletionBlocker {
  kind: EncounterCompletionBlockerKind;
  targetId: string;
  message: string;
}

export interface EncounterCompletionInput {
  encounter: EncounterContext | null;
  proposedChanges: ProposedChange[];
  dispositions: ReviewDisposition[];
  documentationCommitted?: boolean;
  requireDocumentationCommitted?: boolean;
}

export interface EncounterCompletionResult {
  canComplete: boolean;
  requiresExplicitCommit: true;
  blockers: EncounterCompletionBlocker[];
  warnings: string[];
  unresolvedHighPriorityCount: number;
  unreviewedProposalCount: number;
}

/**
 * Evaluates whether an encounter can be completed by the clinician.
 *
 * Blocks completion when:
 * - No active encounter is present.
 * - Any unresolved high-priority discrepancy remains in `encounter.unresolvedDiscrepancies`.
 * - Any proposed change lacks a clinician disposition or remains `'pending'`.
 * - Any `'edited'` disposition has not been revalidated (`revalidated: false`).
 * - Any `'accepted'` disposition references a proposal whose safety gate failed.
 * - Documentation commit is required and not yet committed.
 */
export function evaluateEncounterCompletion(
  input: EncounterCompletionInput,
): EncounterCompletionResult {
  const blockers: EncounterCompletionBlocker[] = [];
  const warnings: string[] = [];
  let unresolvedHighPriorityCount = 0;
  let unreviewedProposalCount = 0;

  if (!input.encounter) {
    blockers.push({
      kind: 'missing_encounter',
      targetId: 'encounter',
      message: 'No active encounter is loaded.',
    });
    return {
      canComplete: false,
      requiresExplicitCommit: true,
      blockers,
      warnings,
      unresolvedHighPriorityCount,
      unreviewedProposalCount,
    };
  }

  for (const discrepancy of input.encounter.unresolvedDiscrepancies) {
    if (discrepancy.status === 'unresolved') {
      if (discrepancy.priority === 'high') {
        unresolvedHighPriorityCount += 1;
        blockers.push({
          kind: 'unresolved_high_priority_discrepancy',
          targetId: discrepancy.id,
          message: `Unresolved high-priority discrepancy for ${discrepancy.medication}: ${discrepancy.description}`,
        });
      } else {
        warnings.push(
          `Unresolved ${discrepancy.priority}-priority discrepancy for ${discrepancy.medication}: ${discrepancy.description}`,
        );
      }
    }
  }

  const dispositionByProposalId = new Map<string, ReviewDisposition>();
  for (const disposition of input.dispositions) {
    dispositionByProposalId.set(disposition.proposalId, disposition);
  }

  for (const proposal of input.proposedChanges) {
    const disposition = dispositionByProposalId.get(proposal.id);

    if (!disposition || disposition.decision === 'pending') {
      unreviewedProposalCount += 1;
      blockers.push({
        kind: 'unreviewed_proposal',
        targetId: proposal.id,
        message: `Proposed ${proposal.action} for ${proposal.medication} requires clinician review.`,
      });
      continue;
    }

    if (disposition.decision === 'edited' && !disposition.revalidated) {
      blockers.push({
        kind: 'edited_proposal_unrevalidated',
        targetId: proposal.id,
        message: `Edited proposal for ${proposal.medication} must be re-validated before completion.`,
      });
      continue;
    }

    if (
      (disposition.decision === 'accepted' || disposition.decision === 'edited') &&
      !proposal.gate.passed
    ) {
      blockers.push({
        kind: 'unsafe_accepted_proposal',
        targetId: proposal.id,
        message: `Proposal for ${proposal.medication} failed safety gate (${proposal.gate.status}) and cannot be committed.`,
      });
    }
  }

  if (input.requireDocumentationCommitted && !input.documentationCommitted) {
    blockers.push({
      kind: 'uncommitted_documentation',
      targetId: input.encounter.id,
      message: 'Encounter documentation has not been committed by the clinician.',
    });
  }

  return {
    canComplete: blockers.length === 0,
    requiresExplicitCommit: true,
    blockers,
    warnings,
    unresolvedHighPriorityCount,
    unreviewedProposalCount,
  };
}

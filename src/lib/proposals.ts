import type {
  AuditEntry,
  Decision,
  ExtractedMedication,
  FhirMedicationStatement,
  GateResult,
  Medication,
  Proposal,
  ProposalAction,
  ProposalField,
  SourceAuthority,
  Statement,
} from './types';

/**
 * Deterministic proposal engine. It never prescribes and never invents values:
 *   * Missing fields stay null.
 *   * A proposal that lacks the required evidence or required fields abstains
 *     instead of guessing.
 *   * Only a clinician decision (accept/edit) can produce an audit entry that
 *     previews a chart change; a rejected proposal produces no chart change.
 *
 * This module performs no model inference. It is pure and unit-testable.
 */

export const ACTION_LABEL: Record<ProposalAction, string> = {
  start: 'Start',
  stop: 'Stop',
  continue: 'Continue',
  change: 'Change',
  restart: 'Restart',
  taper: 'Taper',
};

export const AUTHORITY_LABEL: Record<SourceAuthority, string> = {
  patient_reported: 'Patient-reported (observation, not an order)',
  chart_fact: 'Existing chart fact',
  historical: 'Historical statement (not necessarily current)',
  uncertain: 'Uncertain / contradictory',
  clinician_decision: 'Clinician-authorized decision (demo)',
};

/** Fields that must be present (non-null and non-empty) for a start/change. */
const REQUIRED_FOR_START = ['dose', 'route', 'frequency'] as const;
const REQUIRED_FOR_CHANGE = ['dose', 'route', 'frequency'] as const;

/**
 * Classify an encounter-note statement into one of the workspace's authority
 * buckets. Deterministic keyword heuristics on fictional text only.
 */
export function classifyStatement(text: string, opts: { patientReported?: boolean; historical?: boolean } = {}): {
  kind: Statement['kind'];
  authority: SourceAuthority;
} {
  const t = text.toLowerCase();
  const isHistorical = opts.historical || /\b(previously|prior|past|history of|used to|formerly|in the past)\b/.test(t);
  const isUncertain = /\b(unclear|not sure|confus|discrepan|unknown|unclear|maybe|possibly|can't recall|cannot recall|unsure)\b/.test(t);
  if (opts.patientReported) {
    if (isUncertain) return { kind: 'uncertain', authority: 'uncertain' };
    if (isHistorical) return { kind: 'historical', authority: 'historical' };
    return { kind: 'observation', authority: 'patient_reported' };
  }
  if (isUncertain) return { kind: 'uncertain', authority: 'uncertain' };
  if (isHistorical) return { kind: 'historical', authority: 'historical' };
  return { kind: 'chart_fact', authority: 'chart_fact' };
}

function labelFor(field: ProposalField['field']): string {
  switch (field) {
    case 'medication': return 'Medication';
    case 'dose': return 'Dose';
    case 'route': return 'Route';
    case 'frequency': return 'Frequency';
    case 'timing': return 'Timing';
    case 'action': return 'Action';
  }
}

function currentFieldsFor(med: Medication | undefined): ProposalField[] {
  return [
    { field: 'medication', label: labelFor('medication'), before: med?.name ?? null, after: med?.name ?? null },
    { field: 'dose', label: labelFor('dose'), before: med?.dose ?? null, after: med?.dose ?? null },
    { field: 'route', label: labelFor('route'), before: med?.route ?? null, after: med?.route ?? null },
    { field: 'frequency', label: labelFor('frequency'), before: med?.frequency ?? null, after: med?.frequency ?? null },
  ];
}

function proposedFromExtraction(ex: ExtractedMedication): ProposalField[] {
  return [
    { field: 'medication', label: labelFor('medication'), before: null, after: ex.name },
    { field: 'dose', label: labelFor('dose'), before: null, after: ex.dose },
    { field: 'route', label: labelFor('route'), before: null, after: ex.route },
    { field: 'frequency', label: labelFor('frequency'), before: null, after: ex.frequency },
  ];
}

/**
 * Evidence-sufficiency gate. A proposal may be *proposed* only if it is backed
 * by literal evidence in the source and has the fields required for its action.
 * Patient-reported-only evidence is insufficient to authorize a start/change.
 */
export function evidenceGate(args: {
  action: ProposalAction;
  authority: SourceAuthority;
  evidenceCount: number;
  proposed: ProposalField[];
}): GateResult {
  const reasons: string[] = [];
  const { action, authority, evidenceCount, proposed } = args;

  if (evidenceCount === 0) {
    reasons.push('No literal evidence span links this proposal to the source text.');
  }
  if (authority === 'patient_reported' && (action === 'start' || action === 'change')) {
    reasons.push('Patient-reported use is an observation, not authorization; a clinician must confirm before any change.');
  }
  if (authority === 'uncertain') {
    reasons.push('Source is uncertain or contradictory; resolve before proposing a change.');
  }

  const required = action === 'start' ? REQUIRED_FOR_START : action === 'change' ? REQUIRED_FOR_CHANGE : [];
  for (const field of required) {
    const value = proposed.find((p) => p.field === field)?.after ?? null;
    if (value === null || value.trim() === '') {
      reasons.push(`Required field "${field}" is not documented; the system will not invent it.`);
    }
  }

  return { passed: reasons.length === 0, reasons, abstained: false };
}

/** Compute a field-level diff between current and proposed. */
export function diffFields(current: ProposalField[], proposed: ProposalField[]): Proposal['diff'] {
  const out: Proposal['diff'] = [];
  for (const p of proposed) {
    const before = current.find((c) => c.field === p.field)?.before ?? null;
    if (before !== p.after) out.push({ field: p.field, before, after: p.after });
  }
  return out;
}

function uncertaintyFor(action: ProposalAction, authority: SourceAuthority, proposed: ProposalField[]): Proposal['uncertainty'] {
  if (authority === 'uncertain') return 'high';
  if (authority === 'patient_reported' && (action === 'start' || action === 'change')) return 'high';
  const missing = proposed.filter((p) => p.after === null || p.after.trim() === '').length;
  if (missing > 0) return 'medium';
  return 'low';
}

/**
 * Build a reviewable proposal from one extracted medication statement against
 * the current chart. The result is always safe to render: it either passes the
 * evidence gate or abstains with reasons.
 */
export function buildProposal(args: {
  id: string;
  extracted: ExtractedMedication;
  current: Medication | undefined;
  statements: Statement[];
  authority: SourceAuthority;
}): Proposal {
  const { id, extracted, current, statements, authority } = args;

  // Action: if the med is absent from the chart -> start; if present and any
  // field differs -> change; if present and identical -> continue.
  let action: ProposalAction;
  if (!current) action = 'start';
  else {
    const diff = diffFields(currentFieldsFor(current), proposedFromExtraction(extracted));
    action = diff.length > 0 ? 'change' : 'continue';
  }

  const evidence = statements
    .filter((s) => s.evidence && s.medicationName && s.medicationName.toLowerCase() === extracted.name.toLowerCase())
    .map((s) => ({
      text: s.text,
      sourceRef: s.sourceRef ?? 'encounter-note',
      start: s.evidence!.start,
      end: s.evidence!.end,
    }));

  const proposed = proposedFromExtraction(extracted);
  const currentFields = currentFieldsFor(current);
  const gate = evidenceGate({ action, authority, evidenceCount: evidence.length, proposed });
  const diff = diffFields(currentFields, proposed);

  // An "continue" action with no field change needs no field-level gate.
  const effectiveGate: GateResult =
    action === 'continue' && diff.length === 0
      ? { passed: evidence.length > 0, reasons: evidence.length > 0 ? [] : ['No literal evidence supports the continuation.'], abstained: false }
      : gate;

  const abstain = !effectiveGate.passed && diff.length > 0;

  return {
    id,
    medication: extracted.name,
    action,
    current: currentFields,
    proposed,
    diff,
    evidence,
    authority,
    uncertainty: uncertaintyFor(action, authority, proposed),
    gate: effectiveGate,
    abstainReason: abstain ? effectiveGate.reasons.join(' ') : null,
  };
}

/** Convert an accepted proposal into a FHIR-shaped preview (never written to an EHR). */
export function toFhirPreview(proposal: Proposal): FhirMedicationStatement {
  const doseField = proposal.proposed.find((p) => p.field === 'dose')?.after ?? null;
  const routeField = proposal.proposed.find((p) => p.field === 'route')?.after ?? null;
  const freqField = proposal.proposed.find((p) => p.field === 'frequency')?.after ?? null;
  const timingField = proposal.proposed.find((p) => p.field === 'timing')?.after ?? null;

  const doseQuantity = parseDoseQuantity(doseField);
  const status: FhirMedicationStatement['status'] =
    proposal.action === 'stop' ? 'stopped' : proposal.action === 'start' || proposal.action === 'restart' ? 'intended' : 'active';

  return {
    resourceType: 'MedicationStatement',
    id: `preview-${proposal.id}`,
    status,
    medicationCodeableConcept: { text: proposal.medication },
    dosage: [
      {
        doseQuantity,
        route: routeField ? { text: routeField } : null,
        frequency: freqField ? { text: freqField } : null,
        timing: timingField ? { text: timingField } : null,
      },
    ],
    note: 'Synthetic preview only. Not written to any EHR.',
  };
}

/** Parse a "10 mg" style string into a FHIR quantity, or null if not parsable. */
function parseDoseQuantity(dose: string | null): { value: number; unit: string } | null {
  if (!dose) return null;
  const m = dose.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+.*)$/);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: m[2].trim() };
}

/**
 * Record a clinician decision. Only accept/edited produce a chart-change preview;
 * rejected decisions produce an audit entry with no preview. Edited proposals
 * must be revalidated before they can be committed.
 */
export function recordDecision(args: {
  proposal: Proposal;
  decision: Decision;
  actor: string;
  editedFields?: ProposalField[];
  revalidated?: boolean;
}): AuditEntry {
  const { proposal, decision, actor, editedFields, revalidated } = args;
  const isMutation = decision === 'accepted' || decision === 'edited';
  const needsRevalidation = decision === 'edited';
  const canPreview = isMutation && (!needsRevalidation || revalidated === true);

  return {
    id: `audit-${proposal.id}-${Date.now()}`,
    proposalId: proposal.id,
    medication: proposal.medication,
    decision,
    at: new Date().toISOString(),
    actor,
    note: null,
    fhirPreview: canPreview ? toFhirPreview({ ...proposal, proposed: editedFields ?? proposal.proposed }) : null,
    revalidated: revalidated === true,
  };
}
/** All records in this prototype are fictional. Null means not documented. */
export type Medication = { id: string; name: string; dose: string | null; route: string | null; frequency: string | null };
export type Snapshot = { id: string; source: string; recordedAt: string | null; medications: Medication[] };
export type MedicationChange = { medicationId: string; name: string; kind: 'added' | 'removed' | 'changed'; fields: { field: string; before: string | null; after: string | null }[] };

// ---------------------------------------------------------------------------
// Clinical workspace contracts (Patient Brief, Encounter Workspace, Review &
// Clinical Diff, Commit / Aftercare preview).
//
// Safety invariants enforced by these types and the engine that produces them:
//   * AI proposes; humans commit. Nothing here is an authorized order.
//   * Missing values stay null. The system never invents dose/route/frequency/time.
//   * Every proposal carries evidence linked to the source text plus an
//     explicit authority and uncertainty, and passes an evidence-sufficiency gate.
// ---------------------------------------------------------------------------

/** How a statement was obtained and how much it can be relied on. */
export type SourceAuthority =
  | 'patient_reported' // what the patient said; an observation, never an order
  | 'chart_fact' // documented in the existing synthetic record
  | 'historical' // a past statement, not necessarily current
  | 'uncertain' // contradictory or unclear
  | 'clinician_decision'; // an authorized human decision (demo only)

export type StatementKind =
  | 'observation'
  | 'chart_fact'
  | 'historical'
  | 'uncertain'
  | 'decision';

export type Statement = {
  id: string;
  text: string;
  kind: StatementKind;
  authority: SourceAuthority;
  /** Literal span in the encounter note, when the statement came from the note. */
  evidence: { start: number; end: number } | null;
  medicationName: string | null;
  /** Present only for chart facts, copied from the existing record. */
  sourceRef: string | null;
};

export type ExtractedMedication = {
  id: string;
  name: string;
  /** Each field is null when the note does not state it; never guessed. */
  dose: string | null;
  route: string | null;
  frequency: string | null;
  /** Whether the note stated a change vs. the current chart for this medication. */
  status: 'current' | 'changed' | 'unknown';
  evidence: { start: number; end: number } | null;
};

export type ExtractionMode = 'simulated' | 'live_ai' | 'unavailable';

export type ExtractionResult = {
  mode: ExtractionMode;
  medications: ExtractedMedication[];
  /** Unresolved or contradictory items the clinician must review. */
  unresolved: string[];
  disclaimer: string;
};

/** A field-level proposal for one medication attribute. */
export type ProposalField = {
  field: 'medication' | 'dose' | 'route' | 'frequency' | 'timing' | 'action';
  label: string;
  before: string | null;
  after: string | null;
};

export type ProposalAction = 'start' | 'stop' | 'continue' | 'change' | 'restart' | 'taper';

export type GateResult = {
  passed: boolean;
  /** Human-readable reasons the gate failed; empty when it passed. */
  reasons: string[];
  /** True when the proposal had to abstain for missing required information. */
  abstained: boolean;
};

export type Proposal = {
  id: string;
  medication: string;
  action: ProposalAction;
  current: ProposalField[];
  proposed: ProposalField[];
  /** Raw difference between current and proposed, per field. */
  diff: { field: string; before: string | null; after: string | null }[];
  evidence: { text: string; sourceRef: string; start: number | null; end: number | null }[];
  authority: SourceAuthority;
  uncertainty: 'low' | 'medium' | 'high';
  gate: GateResult;
  /** Populated when gate.passed is false and no safe proposal can be made. */
  abstainReason: string | null;
};

export type Decision = 'accepted' | 'edited' | 'rejected' | 'pending';

export type AuditEntry = {
  id: string;
  proposalId: string;
  medication: string;
  decision: Decision;
  /** ISO timestamp; display only, not a clinical event time. */
  at: string;
  actor: string;
  note: string | null;
  /** FHIR-shaped preview of the intended change, only for accepted/edited. */
  fhirPreview: FhirMedicationStatement | null;
  /** True when an edited proposal was revalidated before commit. */
  revalidated: boolean;
};

/** Minimal FHIR R4-ish MedicationStatement used only as a preview. */
export type FhirMedicationStatement = {
  resourceType: 'MedicationStatement';
  id: string;
  status: 'active' | 'intended' | 'stopped' | 'unknown';
  medicationCodeableConcept: { text: string };
  dosage: {
    doseQuantity?: { value: number; unit: string } | null;
    route?: { text: string } | null;
    frequency?: { text: string } | null;
    timing?: { text: string } | null;
  }[];
  note?: string;
};

export type PatientBrief = {
  id: string;
  name: string;
  age: number | null;
  sex: string | null;
  activeProblems: { name: string; since: string | null }[];
  allergies: { substance: string; reaction: string | null }[];
  activeMedications: Medication[];
  encounters: { id: string; date: string; kind: string; summary: string; sourceRef: string }[];
  unresolvedDiscrepancies: { id: string; summary: string; sourceRef: string }[];
  /** Explicit gaps so the UI can show missing/uncertain information. */
  missing: string[];
};
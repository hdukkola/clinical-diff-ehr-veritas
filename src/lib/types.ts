/** All records in this prototype are fictional. Null means not documented. */

export type MedicationFieldName = 'name' | 'dose' | 'route' | 'frequency';

export type ProvenanceStatus =
  | 'documented'
  | 'patient_reported'
  | 'unverified'
  | 'unknown';

export type EvidenceSourceKind =
  | 'snapshot'
  | 'clinical_note'
  | 'discharge_summary'
  | 'pharmacy_fill'
  | 'patient_report'
  | 'external_record'
  | 'unknown';

export type EvidenceResolutionStatus =
  | 'resolved'
  | 'partial'
  | 'unresolved'
  | 'ambiguous'
  | 'unavailable';

export type TextSpan = {
  start: number;
  end: number;
  line?: number;
  column?: number;
};

export type EvidenceLink = {
  id?: string;
  snapshotId?: string;
  noteId?: string;
  sourceId?: string;
  medicationId?: string;
  sourceLabel?: string;
  sourceKind?: EvidenceSourceKind;
  section?: string;
  field?: MedicationFieldName;
  excerpt?: string | null;
  span?: TextSpan | null;
  recordedAt?: string | null;
  resolutionStatus?: EvidenceResolutionStatus;
  provenanceStatus?: ProvenanceStatus;
  side?: 'earlier' | 'later' | 'both';
  note?: string;
};

export type ResolvedEvidenceLink = EvidenceLink & {
  resolutionStatus: EvidenceResolutionStatus;
  provenanceStatus: ProvenanceStatus;
};

export type ProvenanceMetadata = {
  status?: ProvenanceStatus | string | null;
  sourceKind?: EvidenceSourceKind;
  sourceLabel?: string | null;
  attributedBy?: string | null;
  recordedAt?: string | null;
  verified?: boolean;
  ambiguous?: boolean;
  conflictingSources?: string[];
  note?: string | null;
};

export type ProvenanceFlag =
  | 'unknown_provenance'
  | 'unverified_provenance'
  | 'patient_reported_only'
  | 'missing_source_attribution'
  | 'blank_source_attribution'
  | 'ambiguous_source_attribution'
  | 'conflicting_provenance'
  | 'missing_timestamp'
  | 'blank_field_value'
  | 'undocumented_field'
  | 'missing_supporting_evidence'
  | 'unresolved_evidence_link'
  | 'ambiguous_evidence_link';

export type ProvenanceGapReason =
  | 'missing_source_attribution'
  | 'blank_source_attribution'
  | 'ambiguous_source_attribution'
  | 'explicit_unknown_provenance'
  | 'unverified_source'
  | 'patient_reported_unverified'
  | 'conflicting_evidence_provenance'
  | 'missing_timestamp'
  | 'blank_field_value'
  | 'undocumented_field'
  | 'missing_supporting_evidence'
  | 'unresolved_evidence_link'
  | 'invalid_evidence_span';

export type ProvenanceGap = {
  side: 'earlier' | 'later' | 'both';
  scope: 'snapshot' | 'medication' | 'field' | 'evidence';
  reason: ProvenanceGapReason;
  message: string;
  field?: MedicationFieldName;
  evidenceId?: string;
};

export type SideProvenance = {
  present: boolean;
  status: ProvenanceStatus;
  sourceKind: EvidenceSourceKind;
  sourceLabel: string | null;
  attributedBy: string | null;
  recordedAt: string | null;
  ambiguous: boolean;
  flags: ProvenanceFlag[];
  gaps: ProvenanceGap[];
};

export type ChangeProvenance = {
  earlier: SideProvenance;
  later: SideProvenance;
  overallStatus: ProvenanceStatus;
  hasUnknownProvenance: boolean;
  hasAmbiguousProvenance: boolean;
  hasUnverifiedProvenance: boolean;
  hasPatientReportedProvenance: boolean;
};

export type Medication = {
  id: string;
  name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  provenance?: ProvenanceStatus | ProvenanceMetadata | null;
  evidenceLinks?: EvidenceLink[];
};

export type Snapshot = {
  id: string;
  source: string;
  recordedAt: string | null;
  medications: Medication[];
  sourceKind?: EvidenceSourceKind;
  author?: string | null;
  provenance?: ProvenanceStatus | ProvenanceMetadata | null;
  evidenceLinks?: EvidenceLink[];
};

export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type MedicationChange = {
  medicationId: string;
  name: string;
  kind: 'added' | 'removed' | 'changed';
  fields: FieldChange[];
  evidenceLinks?: ResolvedEvidenceLink[];
  provenance?: ChangeProvenance;
  provenanceGaps?: ProvenanceGap[];
  provenanceFlags?: ProvenanceFlag[];
};

export type SnapshotComparisonReport = {
  changes: MedicationChange[];
  earlierProvenance: SideProvenance;
  laterProvenance: SideProvenance;
  provenanceGaps: ProvenanceGap[];
  provenanceFlags: ProvenanceFlag[];
  evidenceLinks: ResolvedEvidenceLink[];
};

export type ExternalRecordReport = {
  id: string;
  title: string;
  origin: string;
  importedAt: string;
  recordedAt: string | null;
  summary: string;
  body: string;
};

import type {
  ChangeProvenance,
  EvidenceLink,
  EvidenceResolutionStatus,
  EvidenceSourceKind,
  FieldChange,
  Medication,
  MedicationChange,
  MedicationFieldName,
  ProvenanceFlag,
  ProvenanceGap,
  ProvenanceMetadata,
  ProvenanceStatus,
  ResolvedEvidenceLink,
  SideProvenance,
  Snapshot,
  SnapshotComparisonReport,
  TextSpan,
} from './types';

const MEDICATION_FIELDS: MedicationFieldName[] = [
  'name',
  'dose',
  'route',
  'frequency',
];

const VALID_PROVENANCE_STATUSES = new Set<ProvenanceStatus>([
  'documented',
  'patient_reported',
  'unverified',
  'unknown',
]);

const UNKNOWN_ATTRIBUTION_TOKENS = new Set([
  'unknown',
  'unk',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'unspecified',
  'missing',
  'tbd',
  '?',
  '-',
  '--',
  'not documented',
  'not specified',
  'source unknown',
  'unknown source',
  'no source',
  'unattributed',
]);

const AMBIGUOUS_ATTRIBUTION_RE =
  /\b(ambiguous|unclear|conflicting|contradictory|disputed|uncertain|unknown\s+or\s+|or\s+unknown|vs\.?\s+patient|or\s+patient\s+report)\b|\?{2,}/i;

const FORMAT_CHARS_RE = /[\u200B-\u200D\uFEFF]/g;

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(FORMAT_CHARS_RE, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function isBlankProvidedText(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && normalizeOptionalText(value) === null;
}

function isUnknownAttributionText(value: string | null): boolean {
  if (!value) return false;
  return UNKNOWN_ATTRIBUTION_TOKENS.has(value.toLowerCase());
}

function isAmbiguousAttributionText(value: string | null): boolean {
  if (!value) return false;
  return AMBIGUOUS_ATTRIBUTION_RE.test(value);
}

function isClinicalSourceKind(kind: EvidenceSourceKind | undefined): boolean {
  return (
    kind === 'clinical_note' ||
    kind === 'discharge_summary' ||
    kind === 'pharmacy_fill' ||
    kind === 'external_record'
  );
}

function hasStatusKindConflict(
  status: ProvenanceStatus | null,
  sourceKind: EvidenceSourceKind | undefined,
): boolean {
  if (!status || !sourceKind) return false;
  return (
    (status === 'documented' && sourceKind === 'patient_report') ||
    (status === 'patient_reported' && isClinicalSourceKind(sourceKind))
  );
}

function toProvenanceMetadata(
  provenance: ProvenanceStatus | ProvenanceMetadata | null | undefined,
): ProvenanceMetadata | null {
  if (provenance === null || provenance === undefined) return null;
  if (typeof provenance === 'string') {
    return { status: provenance };
  }
  return provenance;
}

type ParsedStatusResult = {
  status: ProvenanceStatus | null;
  wasBlank: boolean;
  wasAmbiguousString: boolean;
  wasUnrecognizedString: boolean;
};

function parseProvenanceStatusValue(
  raw: ProvenanceStatus | string | null | undefined,
): ParsedStatusResult {
  if (raw === null || raw === undefined) {
    return {
      status: null,
      wasBlank: false,
      wasAmbiguousString: false,
      wasUnrecognizedString: false,
    };
  }
  if (isBlankProvidedText(raw)) {
    return {
      status: 'unknown',
      wasBlank: true,
      wasAmbiguousString: false,
      wasUnrecognizedString: false,
    };
  }
  const normalized = normalizeOptionalText(raw)!.toLowerCase();
  if (VALID_PROVENANCE_STATUSES.has(normalized as ProvenanceStatus)) {
    return {
      status: normalized as ProvenanceStatus,
      wasBlank: false,
      wasAmbiguousString: false,
      wasUnrecognizedString: false,
    };
  }
  if (normalized === 'ambiguous' || normalized === 'conflicting') {
    return {
      status: 'unknown',
      wasBlank: false,
      wasAmbiguousString: true,
      wasUnrecognizedString: false,
    };
  }
  return {
    status: 'unknown',
    wasBlank: false,
    wasAmbiguousString: false,
    wasUnrecognizedString: true,
  };
}

function isValidSpan(span: TextSpan | null | undefined): span is TextSpan {
  if (!span) return false;
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) return false;
  if (span.start < 0 || span.end <= span.start) return false;
  if (span.line !== undefined && (!Number.isInteger(span.line) || span.line < 1)) {
    return false;
  }
  if (span.column !== undefined && (!Number.isInteger(span.column) || span.column < 1)) {
    return false;
  }
  return true;
}

function hasInvalidSpan(span: TextSpan | null | undefined): boolean {
  return span !== null && span !== undefined && !isValidSpan(span);
}

function dedupeFlags(flags: ProvenanceFlag[]): ProvenanceFlag[] {
  return [...new Set(flags)];
}

function dedupeGaps(gaps: ProvenanceGap[]): ProvenanceGap[] {
  const seen = new Set<string>();
  const result: ProvenanceGap[] = [];
  for (const gap of gaps) {
    const key = `${gap.side}|${gap.scope}|${gap.reason}|${gap.field ?? ''}|${gap.evidenceId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(gap);
    }
  }
  return result;
}

function dedupeEvidenceLinks(links: ResolvedEvidenceLink[]): ResolvedEvidenceLink[] {
  const seen = new Set<string>();
  const result: ResolvedEvidenceLink[] = [];
  for (const link of links) {
    const key = [
      link.side ?? '',
      link.id ?? '',
      link.snapshotId ?? '',
      link.noteId ?? '',
      link.sourceId ?? '',
      link.medicationId ?? '',
      link.sourceLabel ?? '',
      link.sourceKind ?? '',
      link.section ?? '',
      link.field ?? '',
      link.excerpt ?? '',
      link.span ? `${link.span.start}:${link.span.end}` : '',
      link.recordedAt ?? '',
      link.resolutionStatus,
      link.provenanceStatus,
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(link);
    }
  }
  return result;
}

function resolveEvidenceLink(
  link: EvidenceLink,
  snapshot: Snapshot,
  side: 'earlier' | 'later',
  fallbackStatus: ProvenanceStatus,
): {
  resolved: ResolvedEvidenceLink;
  gaps: ProvenanceGap[];
  flags: ProvenanceFlag[];
} {
  const gaps: ProvenanceGap[] = [];
  const flags: ProvenanceFlag[] = [];

  const linkId = normalizeOptionalText(link.id) ?? undefined;
  const snapshotId =
    normalizeOptionalText(link.snapshotId) ??
    normalizeOptionalText(snapshot.id) ??
    undefined;
  const noteId = normalizeOptionalText(link.noteId) ?? undefined;
  const sourceId = normalizeOptionalText(link.sourceId) ?? undefined;
  const explicitLabelBlank = isBlankProvidedText(link.sourceLabel);
  const explicitLinkLabel = normalizeOptionalText(link.sourceLabel);
  const snapshotLabel = normalizeOptionalText(snapshot.source);
  const sourceLabel = explicitLabelBlank
    ? undefined
    : (explicitLinkLabel ?? snapshotLabel ?? undefined);
  const excerpt = normalizeOptionalText(link.excerpt);
  const recordedAt =
    normalizeOptionalText(link.recordedAt) ??
    normalizeOptionalText(snapshot.recordedAt);
  const section = normalizeOptionalText(link.section) ?? undefined;
  const note = normalizeOptionalText(link.note) ?? undefined;

  if (
    explicitLabelBlank ||
    isBlankProvidedText(link.noteId) ||
    isBlankProvidedText(link.sourceId)
  ) {
    flags.push('blank_source_attribution');
    gaps.push({
      side,
      scope: 'evidence',
      reason: 'blank_source_attribution',
      evidenceId: linkId,
      message: 'Evidence link contains blank/whitespace-only source attribution.',
    });
  }

  const invalidSpan = hasInvalidSpan(link.span);
  if (invalidSpan) {
    flags.push('unresolved_evidence_link');
    gaps.push({
      side,
      scope: 'evidence',
      reason: 'invalid_evidence_span',
      evidenceId: linkId,
      message: 'Evidence link span has invalid or empty offsets.',
    });
  }

  const sourceKind: EvidenceSourceKind =
    link.sourceKind ??
    snapshot.sourceKind ??
    (noteId ? 'clinical_note' : sourceLabel ? 'snapshot' : 'unknown');

  const labelIsUnknown = isUnknownAttributionText(sourceLabel ?? null);
  const labelIsAmbiguous = isAmbiguousAttributionText(sourceLabel ?? null);
  const parsedLinkProv = parseProvenanceStatusValue(link.provenanceStatus);
  const linkConflict = hasStatusKindConflict(parsedLinkProv.status, link.sourceKind);
  const linkAmbiguous =
    labelIsAmbiguous || link.resolutionStatus === 'ambiguous' || linkConflict;

  let provenanceStatus: ProvenanceStatus;
  if (linkAmbiguous) {
    provenanceStatus = 'unknown';
    flags.push('ambiguous_evidence_link', 'ambiguous_source_attribution');
    if (linkConflict) {
      flags.push('conflicting_provenance');
    }
  } else if (labelIsUnknown || (!noteId && !sourceId && !sourceLabel)) {
    provenanceStatus = 'unknown';
    flags.push('missing_source_attribution');
  } else if (parsedLinkProv.status) {
    provenanceStatus = parsedLinkProv.status;
  } else if (sourceKind === 'patient_report') {
    provenanceStatus = 'patient_reported';
  } else if (isClinicalSourceKind(sourceKind)) {
    provenanceStatus = 'documented';
  } else {
    provenanceStatus = fallbackStatus;
  }

  const hasValidTarget = Boolean(
    noteId || sourceId || (sourceLabel && !labelIsUnknown && !labelIsAmbiguous),
  );
  const hasValidExcerpt = Boolean(excerpt);
  const validSpan = isValidSpan(link.span) ? link.span : null;

  let resolutionStatus: EvidenceResolutionStatus;
  if (linkAmbiguous) {
    resolutionStatus = 'ambiguous';
    flags.push('ambiguous_evidence_link');
  } else if (link.resolutionStatus === 'unavailable') {
    resolutionStatus = 'unavailable';
    flags.push('unresolved_evidence_link');
    gaps.push({
      side,
      scope: 'evidence',
      reason: 'unresolved_evidence_link',
      evidenceId: linkId,
      message: 'Referenced evidence source is unavailable.',
    });
  } else if (link.resolutionStatus === 'unresolved') {
    resolutionStatus = 'unresolved';
    flags.push('unresolved_evidence_link');
    gaps.push({
      side,
      scope: 'evidence',
      reason: 'unresolved_evidence_link',
      evidenceId: linkId,
      message: 'Evidence link is marked unresolved.',
    });
  } else if (
    hasValidTarget &&
    hasValidExcerpt &&
    !invalidSpan &&
    (noteId !== undefined ||
      sourceId !== undefined ||
      isClinicalSourceKind(sourceKind) ||
      validSpan !== null) &&
    link.resolutionStatus !== 'partial'
  ) {
    resolutionStatus = 'resolved';
  } else if (hasValidTarget || hasValidExcerpt || validSpan !== null) {
    resolutionStatus = 'partial';
  } else {
    resolutionStatus = 'unresolved';
    flags.push('unresolved_evidence_link');
    gaps.push({
      side,
      scope: 'evidence',
      reason: 'unresolved_evidence_link',
      evidenceId: linkId,
      message: 'Evidence link has no resolvable source reference or excerpt.',
    });
  }

  const resolved: ResolvedEvidenceLink = {
    ...(linkId ? { id: linkId } : {}),
    ...(snapshotId ? { snapshotId } : {}),
    ...(noteId ? { noteId } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(link.medicationId ? { medicationId: link.medicationId } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    sourceKind,
    ...(section ? { section } : {}),
    ...(link.field ? { field: link.field } : {}),
    excerpt,
    span: invalidSpan ? null : validSpan,
    recordedAt,
    resolutionStatus,
    provenanceStatus,
    side: link.side ?? side,
    ...(note ? { note } : {}),
  };

  return { resolved, gaps, flags };
}

function collectCandidateEvidenceLinks(
  snapshot: Snapshot,
  medication: Medication,
): EvidenceLink[] {
  const medLinks = medication.evidenceLinks ?? [];
  const snapLinks = snapshot.evidenceLinks ?? [];
  if (medLinks.length > 0) {
    const matchingSnapLinks = snapLinks.filter(
      link => link.medicationId === medication.id,
    );
    return [...medLinks, ...matchingSnapLinks];
  }
  return snapLinks.filter(
    link => link.medicationId === undefined || link.medicationId === medication.id,
  );
}

function inferSourceKind(
  explicitKind: EvidenceSourceKind | undefined,
  status: ProvenanceStatus,
): EvidenceSourceKind {
  if (explicitKind) return explicitKind;
  if (status === 'patient_reported') return 'patient_report';
  if (status === 'unknown') return 'unknown';
  return 'snapshot';
}

function evaluateSide(
  snapshot: Snapshot,
  medication: Medication | undefined,
  side: 'earlier' | 'later',
): { provenance: SideProvenance; evidenceLinks: ResolvedEvidenceLink[] } {
  const snapshotSourceBlank = isBlankProvidedText(snapshot.source);
  const snapshotSourceLabel = normalizeOptionalText(snapshot.source);
  const snapshotRecordedAt = normalizeOptionalText(snapshot.recordedAt);
  const snapshotMeta = toProvenanceMetadata(snapshot.provenance);
  const snapshotAuthor = normalizeOptionalText(
    snapshotMeta?.attributedBy ?? snapshot.author,
  );

  if (!medication) {
    return {
      provenance: {
        present: false,
        status: 'unknown',
        sourceKind: snapshotMeta?.sourceKind ?? snapshot.sourceKind ?? 'unknown',
        sourceLabel: snapshotSourceLabel,
        attributedBy: snapshotAuthor,
        recordedAt: snapshotRecordedAt,
        ambiguous: false,
        flags: [],
        gaps: [],
      },
      evidenceLinks: [],
    };
  }

  const flags: ProvenanceFlag[] = [];
  const gaps: ProvenanceGap[] = [];

  const medMeta = toProvenanceMetadata(medication.provenance);
  const medSourceBlank = isBlankProvidedText(medMeta?.sourceLabel);
  const medAuthorBlank = isBlankProvidedText(medMeta?.attributedBy);
  const snapshotAuthorBlank = isBlankProvidedText(
    snapshotMeta?.attributedBy ?? snapshot.author,
  );
  const medRecordedAtBlank = isBlankProvidedText(medMeta?.recordedAt);
  const snapshotRecordedAtBlank = isBlankProvidedText(snapshot.recordedAt);

  if (snapshotSourceBlank || medSourceBlank || medAuthorBlank || snapshotAuthorBlank) {
    flags.push('blank_source_attribution');
    gaps.push({
      side,
      scope: medSourceBlank || medAuthorBlank ? 'medication' : 'snapshot',
      reason: 'blank_source_attribution',
      message: 'Source or author attribution is blank or whitespace-only.',
    });
  }

  const effectiveSourceLabel =
    normalizeOptionalText(medMeta?.sourceLabel) ?? snapshotSourceLabel;
  const effectiveAuthor =
    normalizeOptionalText(medMeta?.attributedBy) ?? snapshotAuthor;
  const effectiveRecordedAt =
    normalizeOptionalText(medMeta?.recordedAt) ?? snapshotRecordedAt;

  if (!effectiveRecordedAt || medRecordedAtBlank || snapshotRecordedAtBlank) {
    flags.push('missing_timestamp');
    gaps.push({
      side,
      scope: 'snapshot',
      reason: 'missing_timestamp',
      message: 'Snapshot or medication timestamp is missing or blank.',
    });
  }

  const parsedMedStatus = parseProvenanceStatusValue(medMeta?.status);
  const parsedSnapshotStatus = parseProvenanceStatusValue(snapshotMeta?.status);

  if (parsedMedStatus.wasBlank || parsedSnapshotStatus.wasBlank) {
    flags.push('blank_source_attribution');
    gaps.push({
      side,
      scope: parsedMedStatus.wasBlank ? 'medication' : 'snapshot',
      reason: 'blank_source_attribution',
      message: 'Provenance status string is blank or whitespace-only.',
    });
  }

  const explicitSourceKind =
    medMeta?.sourceKind ?? snapshotMeta?.sourceKind ?? snapshot.sourceKind;
  const explicitStatus = parsedMedStatus.status ?? parsedSnapshotStatus.status;

  const preliminaryStatus: ProvenanceStatus =
    explicitStatus ??
    (explicitSourceKind === 'patient_report'
      ? 'patient_reported'
      : isClinicalSourceKind(explicitSourceKind)
        ? 'documented'
        : effectiveSourceLabel && !isUnknownAttributionText(effectiveSourceLabel)
          ? 'unverified'
          : 'unknown');

  const rawCandidateLinks = collectCandidateEvidenceLinks(snapshot, medication);
  const resolvedExplicitLinks: ResolvedEvidenceLink[] = [];

  for (const rawLink of rawCandidateLinks) {
    const { resolved, gaps: linkGaps, flags: linkFlags } = resolveEvidenceLink(
      rawLink,
      snapshot,
      side,
      preliminaryStatus,
    );
    resolvedExplicitLinks.push(resolved);
    gaps.push(...linkGaps);
    flags.push(...linkFlags);
  }

  const statusConflictsWithKind = hasStatusKindConflict(
    explicitStatus,
    explicitSourceKind,
  );
  const explicitLinkStatuses = new Set(
    resolvedExplicitLinks
      .filter(l => l.provenanceStatus !== 'unknown')
      .map(l => l.provenanceStatus),
  );
  const hasConflictingLinkProvenance =
    !parsedMedStatus.status && explicitLinkStatuses.size > 1;
  const hasAmbiguousLink = resolvedExplicitLinks.some(
    l => l.resolutionStatus === 'ambiguous',
  );

  const ambiguous = Boolean(
    medMeta?.ambiguous ||
      snapshotMeta?.ambiguous ||
      (medMeta?.conflictingSources?.length ?? 0) > 1 ||
      (snapshotMeta?.conflictingSources?.length ?? 0) > 1 ||
      parsedMedStatus.wasAmbiguousString ||
      parsedSnapshotStatus.wasAmbiguousString ||
      isAmbiguousAttributionText(effectiveSourceLabel) ||
      isAmbiguousAttributionText(effectiveAuthor) ||
      statusConflictsWithKind ||
      hasConflictingLinkProvenance ||
      hasAmbiguousLink,
  );

  if (ambiguous) {
    flags.push('ambiguous_source_attribution');
    if (
      statusConflictsWithKind ||
      hasConflictingLinkProvenance ||
      (medMeta?.conflictingSources?.length ?? 0) > 1 ||
      (snapshotMeta?.conflictingSources?.length ?? 0) > 1
    ) {
      flags.push('conflicting_provenance');
    }
    gaps.push({
      side,
      scope: hasConflictingLinkProvenance ? 'evidence' : 'medication',
      reason: hasConflictingLinkProvenance
        ? 'conflicting_evidence_provenance'
        : 'ambiguous_source_attribution',
      message: hasConflictingLinkProvenance
        ? 'Multiple evidence links assert conflicting provenance; abstaining as unknown.'
        : 'Source attribution is ambiguous or conflicting; abstaining as unknown.',
    });
  }

  const hasValidResolvedEvidenceTarget = resolvedExplicitLinks.some(
    l =>
      l.resolutionStatus === 'resolved' ||
      Boolean(l.noteId || l.sourceId || l.sourceLabel),
  );
  const sourceIsUnknownPlaceholder =
    isUnknownAttributionText(effectiveSourceLabel) ||
    isUnknownAttributionText(effectiveAuthor);
  const lacksAnyAttribution =
    (!effectiveSourceLabel || isUnknownAttributionText(effectiveSourceLabel)) &&
    (!effectiveAuthor || isUnknownAttributionText(effectiveAuthor)) &&
    !hasValidResolvedEvidenceTarget;

  if (sourceIsUnknownPlaceholder || lacksAnyAttribution) {
    flags.push('missing_source_attribution');
    gaps.push({
      side,
      scope: 'snapshot',
      reason: 'missing_source_attribution',
      message: 'No valid non-blank source attribution is present.',
    });
  }

  let finalStatus: ProvenanceStatus;
  if (ambiguous || lacksAnyAttribution || sourceIsUnknownPlaceholder) {
    finalStatus = 'unknown';
  } else if (
    parsedMedStatus.wasUnrecognizedString ||
    parsedSnapshotStatus.wasUnrecognizedString
  ) {
    finalStatus = 'unknown';
  } else if (explicitStatus) {
    finalStatus = explicitStatus;
  } else if (explicitSourceKind === 'patient_report') {
    finalStatus = 'patient_reported';
  } else if (medMeta?.verified === true || snapshotMeta?.verified === true) {
    finalStatus = 'documented';
  } else if (isClinicalSourceKind(explicitSourceKind)) {
    finalStatus = 'documented';
  } else if (
    resolvedExplicitLinks.some(
      l => l.resolutionStatus === 'resolved' && l.provenanceStatus === 'documented',
    )
  ) {
    finalStatus = 'documented';
  } else if (
    resolvedExplicitLinks.some(l => l.provenanceStatus === 'patient_reported') &&
    !resolvedExplicitLinks.some(l => l.provenanceStatus === 'documented')
  ) {
    finalStatus = 'patient_reported';
  } else {
    finalStatus = 'unverified';
  }

  if (finalStatus === 'unknown') {
    flags.push('unknown_provenance');
    if (!ambiguous && !lacksAnyAttribution && !sourceIsUnknownPlaceholder) {
      gaps.push({
        side,
        scope: parsedMedStatus.status === 'unknown' ? 'medication' : 'snapshot',
        reason: 'explicit_unknown_provenance',
        message: 'Provenance is explicitly marked unknown.',
      });
    }
  } else if (finalStatus === 'unverified') {
    flags.push('unverified_provenance');
    gaps.push({
      side,
      scope: 'snapshot',
      reason: 'unverified_source',
      message: 'Source label is present without verified clinical provenance.',
    });
  } else if (finalStatus === 'patient_reported') {
    flags.push('patient_reported_only');
    gaps.push({
      side,
      scope: 'medication',
      reason: 'patient_reported_unverified',
      message: 'Entry is patient-reported without clinician or pharmacy verification.',
    });
  }

  for (const field of MEDICATION_FIELDS) {
    const val = medication[field];
    if (val === null) {
      flags.push('undocumented_field');
      gaps.push({
        side,
        scope: 'field',
        field,
        reason: 'undocumented_field',
        message: `Medication ${field} is not documented (null).`,
      });
    } else if (isBlankProvidedText(val)) {
      flags.push('blank_field_value');
      gaps.push({
        side,
        scope: 'field',
        field,
        reason: 'blank_field_value',
        message: `Medication ${field} is blank or whitespace-only.`,
      });
    }
  }

  const finalLinks: ResolvedEvidenceLink[] =
    resolvedExplicitLinks.length > 0
      ? resolvedExplicitLinks
      : [
          {
            snapshotId: normalizeOptionalText(snapshot.id) ?? undefined,
            ...(effectiveSourceLabel ? { sourceLabel: effectiveSourceLabel } : {}),
            sourceKind: inferSourceKind(explicitSourceKind, finalStatus),
            excerpt: null,
            span: null,
            recordedAt: effectiveRecordedAt,
            resolutionStatus:
              effectiveSourceLabel &&
              !isUnknownAttributionText(effectiveSourceLabel) &&
              !ambiguous
                ? 'partial'
                : ambiguous
                  ? 'ambiguous'
                  : 'unresolved',
            provenanceStatus: finalStatus,
            side,
            note:
              effectiveSourceLabel && !isUnknownAttributionText(effectiveSourceLabel)
                ? 'Snapshot entry only; no supporting clinical note, excerpt, or span provided.'
                : 'No supporting clinical note, excerpt, or valid source attribution provided.',
          },
        ];

  if (!finalLinks.some(l => l.resolutionStatus === 'resolved')) {
    flags.push('missing_supporting_evidence');
    gaps.push({
      side,
      scope: 'evidence',
      reason: 'missing_supporting_evidence',
      message: 'No resolved clinical note or excerpt supports this entry.',
    });
  }

  return {
    provenance: {
      present: true,
      status: finalStatus,
      sourceKind: inferSourceKind(explicitSourceKind, finalStatus),
      sourceLabel: effectiveSourceLabel,
      attributedBy: effectiveAuthor,
      recordedAt: effectiveRecordedAt,
      ambiguous,
      flags: dedupeFlags(flags),
      gaps: dedupeGaps(gaps),
    },
    evidenceLinks: dedupeEvidenceLinks(finalLinks),
  };
}

function evaluateSnapshotBaseline(
  snapshot: Snapshot,
  side: 'earlier' | 'later',
): SideProvenance {
  const sourceBlank = isBlankProvidedText(snapshot.source);
  const sourceLabel = normalizeOptionalText(snapshot.source);
  const recordedAt = normalizeOptionalText(snapshot.recordedAt);
  const meta = toProvenanceMetadata(snapshot.provenance);
  const attributedBy = normalizeOptionalText(meta?.attributedBy ?? snapshot.author);
  const flags: ProvenanceFlag[] = [];
  const gaps: ProvenanceGap[] = [];

  if (sourceBlank || isBlankProvidedText(meta?.attributedBy ?? snapshot.author)) {
    flags.push('blank_source_attribution');
    gaps.push({
      side,
      scope: 'snapshot',
      reason: 'blank_source_attribution',
      message: 'Snapshot source or author attribution is blank or whitespace-only.',
    });
  }

  if (!recordedAt || isBlankProvidedText(snapshot.recordedAt)) {
    flags.push('missing_timestamp');
    gaps.push({
      side,
      scope: 'snapshot',
      reason: 'missing_timestamp',
      message: 'Snapshot timestamp is missing or blank.',
    });
  }

  const parsedStatus = parseProvenanceStatusValue(meta?.status);
  const explicitKind = meta?.sourceKind ?? snapshot.sourceKind;
  const statusKindConflict = hasStatusKindConflict(parsedStatus.status, explicitKind);
  const ambiguous = Boolean(
    meta?.ambiguous ||
      (meta?.conflictingSources?.length ?? 0) > 1 ||
      parsedStatus.wasAmbiguousString ||
      isAmbiguousAttributionText(sourceLabel) ||
      isAmbiguousAttributionText(attributedBy) ||
      statusKindConflict,
  );

  const missingOrUnknownSource =
    !sourceLabel ||
    isUnknownAttributionText(sourceLabel) ||
    isUnknownAttributionText(attributedBy);

  if (ambiguous) {
    flags.push('ambiguous_source_attribution');
    if (statusKindConflict || (meta?.conflictingSources?.length ?? 0) > 1) {
      flags.push('conflicting_provenance');
    }
    gaps.push({
      side,
      scope: 'snapshot',
      reason: 'ambiguous_source_attribution',
      message: 'Snapshot source attribution is ambiguous or conflicting.',
    });
  }
  if (missingOrUnknownSource) {
    flags.push('missing_source_attribution');
    gaps.push({
      side,
      scope: 'snapshot',
      reason: 'missing_source_attribution',
      message: 'Snapshot source attribution is missing or unknown.',
    });
  }

  let status: ProvenanceStatus;
  if (ambiguous || missingOrUnknownSource || parsedStatus.wasUnrecognizedString) {
    status = 'unknown';
  } else if (parsedStatus.status) {
    status = parsedStatus.status;
  } else if (explicitKind === 'patient_report') {
    status = 'patient_reported';
  } else if (meta?.verified === true || isClinicalSourceKind(explicitKind)) {
    status = 'documented';
  } else {
    status = 'unverified';
  }

  if (status === 'unknown') flags.push('unknown_provenance');
  if (status === 'unverified') flags.push('unverified_provenance');
  if (status === 'patient_reported') flags.push('patient_reported_only');

  return {
    present: true,
    status,
    sourceKind: inferSourceKind(explicitKind, status),
    sourceLabel,
    attributedBy,
    recordedAt,
    ambiguous,
    flags: dedupeFlags(flags),
    gaps: dedupeGaps(gaps),
  };
}

function computeOverallProvenanceStatus(
  earlier: SideProvenance,
  later: SideProvenance,
): ProvenanceStatus {
  const presentStatuses = [earlier, later]
    .filter(side => side.present)
    .map(side => side.status);

  if (presentStatuses.length === 0 || presentStatuses.includes('unknown')) {
    return 'unknown';
  }
  if (presentStatuses.includes('unverified')) {
    return 'unverified';
  }
  if (presentStatuses.includes('patient_reported')) {
    return 'patient_reported';
  }
  return 'documented';
}

function buildChangeProvenance(
  earlierSide: SideProvenance,
  laterSide: SideProvenance,
): ChangeProvenance {
  const presentSides = [earlierSide, laterSide].filter(s => s.present);
  return {
    earlier: earlierSide,
    later: laterSide,
    overallStatus: computeOverallProvenanceStatus(earlierSide, laterSide),
    hasUnknownProvenance: presentSides.some(s => s.status === 'unknown'),
    hasAmbiguousProvenance: presentSides.some(s => s.ambiguous),
    hasUnverifiedProvenance: presentSides.some(s => s.status === 'unverified'),
    hasPatientReportedProvenance: presentSides.some(
      s => s.status === 'patient_reported',
    ),
  };
}

function buildMedicationChange(
  medicationId: string,
  name: string,
  kind: MedicationChange['kind'],
  fields: FieldChange[],
  earlier: Snapshot,
  before: Medication | undefined,
  later: Snapshot,
  after: Medication | undefined,
): MedicationChange {
  const earlierEval = evaluateSide(earlier, before, 'earlier');
  const laterEval = evaluateSide(later, after, 'later');
  const provenance = buildChangeProvenance(
    earlierEval.provenance,
    laterEval.provenance,
  );

  return {
    medicationId,
    name,
    kind,
    fields,
    evidenceLinks: dedupeEvidenceLinks([
      ...earlierEval.evidenceLinks,
      ...laterEval.evidenceLinks,
    ]),
    provenance,
    provenanceGaps: dedupeGaps([
      ...earlierEval.provenance.gaps,
      ...laterEval.provenance.gaps,
    ]),
    provenanceFlags: dedupeFlags([
      ...earlierEval.provenance.flags,
      ...laterEval.provenance.flags,
    ]),
  };
}

/** IDs are fixture-supplied identity links, not inferred from drug names. */
export function compareSnapshots(earlier: Snapshot, later: Snapshot): MedicationChange[] {
  for (const snapshot of [earlier, later]) {
    const ids = snapshot.medications.map(m => m.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Duplicate medication ID in snapshot ${snapshot.id}`);
    }
  }

  const old = new Map(earlier.medications.map(m => [m.id, m]));
  const current = new Map(later.medications.map(m => [m.id, m]));
  const ids = [...new Set([...old.keys(), ...current.keys()])].sort();

  return ids.flatMap<MedicationChange>(id => {
    const before = old.get(id);
    const after = current.get(id);

    if (!before || !after) {
      return [
        buildMedicationChange(
          id,
          (after ?? before)!.name,
          before ? 'removed' : 'added',
          [],
          earlier,
          before,
          later,
          after,
        ),
      ];
    }

    const changed: FieldChange[] = MEDICATION_FIELDS.filter(
      field => before[field] !== after[field],
    ).map(field => ({
      field,
      before: before[field],
      after: after[field],
    }));

    if (changed.length === 0) {
      return [];
    }

    return [
      buildMedicationChange(
        id,
        after.name,
        'changed',
        changed,
        earlier,
        before,
        later,
        after,
      ),
    ];
  });
}

/**
 * Compares two snapshots and returns medication changes together with snapshot-level
 * provenance assessments, gaps, flags, and deduplicated evidence links.
 */
export function analyzeSnapshots(
  earlier: Snapshot,
  later: Snapshot,
): SnapshotComparisonReport {
  const changes = compareSnapshots(earlier, later);
  const earlierProvenance = evaluateSnapshotBaseline(earlier, 'earlier');
  const laterProvenance = evaluateSnapshotBaseline(later, 'later');

  const provenanceGaps = dedupeGaps([
    ...earlierProvenance.gaps,
    ...laterProvenance.gaps,
    ...changes.flatMap(c => c.provenanceGaps ?? []),
  ]);
  const provenanceFlags = dedupeFlags([
    ...earlierProvenance.flags,
    ...laterProvenance.flags,
    ...changes.flatMap(c => c.provenanceFlags ?? []),
  ]);
  const evidenceLinks = dedupeEvidenceLinks(
    changes.flatMap(c => c.evidenceLinks ?? []),
  );

  return {
    changes,
    earlierProvenance,
    laterProvenance,
    provenanceGaps,
    provenanceFlags,
    evidenceLinks,
  };
}

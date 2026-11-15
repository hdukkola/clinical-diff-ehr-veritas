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

export type ExtractedMedicationRegimen = {
  name: string;
  normalizedName: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  discontinued: boolean;
  excerpt: string;
};

export type NoteRegimenChangeCategory =
  | 'Mentioned only in earlier note'
  | 'Mentioned only in later note'
  | 'Clinically discontinued'
  | 'Dose changed'
  | 'Frequency changed'
  | 'Route changed'
  | 'Duration changed';

export type NoteRegimenChange = {
  medicationName: string;
  normalizedName: string;
  status: 'unchanged' | 'changed' | 'earlier_only' | 'later_only' | 'discontinued';
  statusLabel: string;
  changeCategories: NoteRegimenChangeCategory[];
  earlierRegimen: ExtractedMedicationRegimen | null;
  laterRegimen: ExtractedMedicationRegimen | null;
  earlierExcerpt: string | null;
  laterExcerpt: string | null;
  absenceNote: string | null;
};

export type NoteRegimenComparisonReport = {
  normalizedEarlierNote: string;
  normalizedLaterNote: string;
  items: NoteRegimenChange[];
};

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  fourteen: '14',
};

const KNOWN_MEDICATIONS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\bamoxicillin(?:\s*-\s*clavulanate)?\b/i, canonical: 'Amoxicillin' },
  { pattern: /\btylenol\b|\bacetaminophen\b/i, canonical: 'Tylenol' },
  { pattern: /\balbuterol(?:\s+sulfate)?(?:\s+hfa)?\b/i, canonical: 'Albuterol HFA' },
  { pattern: /\blisinopril\b|\blsnopril\b/i, canonical: 'Lisinopril' },
  { pattern: /\bmetformin\b/i, canonical: 'Metformin' },
  { pattern: /\baspirin\b|\basprin\b/i, canonical: 'Aspirin' },
  { pattern: /\batorvastatin\b|\blipitor\b/i, canonical: 'Atorvastatin' },
  { pattern: /\bprednisone\b/i, canonical: 'Prednisone' },
  { pattern: /\bglipizide\b/i, canonical: 'Glipizide' },
  { pattern: /\bmetoprolol(?:\s+succinate(?:\s+er)?)?\b/i, canonical: 'Metoprolol Succinate' },
  { pattern: /\bwarfarin\b/i, canonical: 'Warfarin' },
  { pattern: /\bfurosemide\b/i, canonical: 'Furosemide' },
  { pattern: /\benoxaparin\b/i, canonical: 'Enoxaparin' },
  { pattern: /\bprilosec\b|\bomeprazole\b/i, canonical: 'Prilosec' },
  { pattern: /\bseroquel\b|\bquetiapine\b/i, canonical: 'Seroquel' },
  { pattern: /\bclopidogrel\b/i, canonical: 'Clopidogrel' },
  { pattern: /\bverapamil(?:\s+hydrochloride)?\b/i, canonical: 'Verapamil Hydrochloride' },
  { pattern: /\bursodiol\b/i, canonical: 'Ursodiol' },
  { pattern: /\bacebutolol\b/i, canonical: 'Acebutolol' },
  { pattern: /\bnahco3\b|\bsodium\s+bicarbonate\b/i, canonical: 'NaHCO3' },
  { pattern: /\bvitamin\s+d\b/i, canonical: 'Vitamin D' },
];

const DISCONTINUED_CUE_RE =
  /\b(stopped|discontinued|no\s+longer\s+indicated|d\/c|dc'd|held|hold)\b/i;

/**
 * Normalizes literal `<br>` / `<br/>` markup and CRLF line endings to `\n`.
 */
export function normalizeNoteText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

function normalizeDoseText(clause: string): string | null {
  const match = clause.match(
    /\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?|meq|puffs?)\b/i,
  );
  if (!match) return null;
  const amount = match[1];
  const unit = match[2].toLowerCase();
  return `${amount} ${unit}`;
}

function normalizeRouteText(clause: string): string | null {
  if (/\b(?:po|by\s+mouth|oral)\b/i.test(clause)) return 'oral';
  if (/\b(?:subcutaneous|subq|sq|sc)\b/i.test(clause)) return 'subcutaneous';
  if (/\b(?:inhaler|inhalation|inhaled|puffs?)\b/i.test(clause)) return 'inhalation';
  if (/\b(?:iv|intravenous)\b/i.test(clause)) return 'intravenous';
  if (/\b(?:im|intramuscular)\b/i.test(clause)) return 'intramuscular';
  if (/\btopical\b/i.test(clause)) return 'topical';
  return null;
}

function normalizeFrequencyText(clause: string): string | null {
  if (/\b(?:three\s+times\s+(?:a\s+day|daily)|tid)\b/i.test(clause)) {
    return 'three times daily';
  }
  if (/\b(?:twice\s+(?:a\s+day|daily)|bid)\b/i.test(clause)) {
    return 'twice daily';
  }
  if (/\b(?:every\s+4\s*-\s*6\s*hours(?:\s+as\s+needed)?|q4-6h(?:\s+prn)?)\b/i.test(clause)) {
    return 'every 4-6 hours as needed';
  }
  if (/\b(?:every\s+4\s*hours(?:\s+as\s+needed)?|q4h(?:\s+prn)?)\b/i.test(clause)) {
    return 'every 4 hours as needed';
  }
  if (/\b(?:every\s+6\s*hours(?:\s+as\s+needed)?|q6h(?:\s+prn)?)\b/i.test(clause)) {
    return 'every 6 hours as needed';
  }
  if (/\b(?:at\s+bedtime|qhs)\b/i.test(clause)) {
    return 'at bedtime';
  }
  if (/\b(?:once\s+(?:a\s+day|daily)|daily|qd)\b/i.test(clause)) {
    return 'daily';
  }
  return null;
}

function normalizeDurationText(clause: string): string | null {
  const match = clause.match(
    /\b(?:for|x)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen)\s+(days?|weeks?|months?)\b/i,
  );
  if (!match) return null;
  const rawCount = match[1].toLowerCase();
  const count = NUMBER_WORDS[rawCount] ?? rawCount;
  const unit = match[2].toLowerCase().replace(/s$/, '');
  const plural = count === '1' ? unit : `${unit}s`;
  return `${count} ${plural}`;
}

/**
 * Deterministically extracts medication regimens (dose, route, frequency, duration,
 * and explicit discontinuation cues) from a clinical note.
 */
export function extractMedicationRegimensFromNote(
  noteText: string,
): ExtractedMedicationRegimen[] {
  const normalized = normalizeNoteText(noteText);
  if (!normalized) return [];

  const clauses = normalized
    .split(/(?<=[.!?\n;])\s+|\n+/)
    .map(c => c.trim())
    .filter(Boolean);

  const byMed = new Map<string, ExtractedMedicationRegimen>();

  for (const clause of clauses) {
    for (const { pattern, canonical } of KNOWN_MEDICATIONS) {
      const match = clause.match(pattern);
      if (!match || match.index === undefined) continue;

      const tail = clause.slice(match.index);
      const nextMedMatch = KNOWN_MEDICATIONS
        .filter(k => k.canonical !== canonical)
        .map(k => tail.slice(match[0].length).search(k.pattern))
        .filter(idx => idx > 0)
        .sort((a, b) => a - b)[0];

      const medSegment =
        nextMedMatch !== undefined
          ? tail.slice(0, match[0].length + nextMedMatch).trim()
          : tail.trim();

      const key = canonical.toLowerCase();
      const existing = byMed.get(key);
      const extracted: ExtractedMedicationRegimen = {
        name: canonical,
        normalizedName: key,
        dose: normalizeDoseText(medSegment) ?? existing?.dose ?? null,
        route: normalizeRouteText(medSegment) ?? existing?.route ?? null,
        frequency: normalizeFrequencyText(medSegment) ?? existing?.frequency ?? null,
        duration: normalizeDurationText(medSegment) ?? existing?.duration ?? null,
        discontinued:
          DISCONTINUED_CUE_RE.test(clause) || (existing?.discontinued ?? false),
        excerpt: existing ? `${existing.excerpt} | ${clause}` : clause,
      };
      byMed.set(key, extracted);
    }
  }

  return Array.from(byMed.values());
}

/**
 * Compares two clinical notes deterministically at the medication-regimen level,
 * surfacing dose, frequency, route, and duration changes as well as presence/absence
 * vs. explicit clinical discontinuation.
 */
export function compareNoteRegimens(
  earlierNote: string,
  laterNote: string,
): NoteRegimenComparisonReport {
  const normalizedEarlierNote = normalizeNoteText(earlierNote);
  const normalizedLaterNote = normalizeNoteText(laterNote);

  const earlierRegimens = extractMedicationRegimensFromNote(normalizedEarlierNote);
  const laterRegimens = extractMedicationRegimensFromNote(normalizedLaterNote);

  const earlierMap = new Map(earlierRegimens.map(r => [r.normalizedName, r]));
  const laterMap = new Map(laterRegimens.map(r => [r.normalizedName, r]));

  const allKeys = Array.from(new Set([...earlierMap.keys(), ...laterMap.keys()]));
  const items: NoteRegimenChange[] = [];

  for (const key of allKeys) {
    const earlier = earlierMap.get(key) ?? null;
    const later = laterMap.get(key) ?? null;
    const medicationName = earlier?.name ?? later?.name ?? key;

    if (earlier && !later) {
      items.push({
        medicationName,
        normalizedName: key,
        status: 'earlier_only',
        statusLabel: 'Mentioned only in earlier note',
        changeCategories: ['Mentioned only in earlier note'],
        earlierRegimen: earlier,
        laterRegimen: null,
        earlierExcerpt: earlier.excerpt,
        laterExcerpt: null,
        absenceNote: 'Not mentioned in later note (not explicitly discontinued)',
      });
      continue;
    }

    if (!earlier && later) {
      items.push({
        medicationName,
        normalizedName: key,
        status: 'later_only',
        statusLabel: 'Mentioned only in later note',
        changeCategories: ['Mentioned only in later note'],
        earlierRegimen: null,
        laterRegimen: later,
        earlierExcerpt: null,
        laterExcerpt: later.excerpt,
        absenceNote: 'Not mentioned in earlier note',
      });
      continue;
    }

    if (earlier && later) {
      if (later.discontinued && !earlier.discontinued) {
        items.push({
          medicationName,
          normalizedName: key,
          status: 'discontinued',
          statusLabel: 'Clinically discontinued',
          changeCategories: ['Clinically discontinued'],
          earlierRegimen: earlier,
          laterRegimen: later,
          earlierExcerpt: earlier.excerpt,
          laterExcerpt: later.excerpt,
          absenceNote: 'Explicitly discontinued in later note',
        });
        continue;
      }

      const changeCategories: NoteRegimenChangeCategory[] = [];
      if (earlier.dose !== later.dose && (earlier.dose || later.dose)) {
        changeCategories.push('Dose changed');
      }
      if (earlier.frequency !== later.frequency && (earlier.frequency || later.frequency)) {
        changeCategories.push('Frequency changed');
      }
      if (earlier.route !== later.route && (earlier.route || later.route)) {
        changeCategories.push('Route changed');
      }
      if (earlier.duration !== later.duration && (earlier.duration || later.duration)) {
        changeCategories.push('Duration changed');
      }

      items.push({
        medicationName,
        normalizedName: key,
        status: changeCategories.length > 0 ? 'changed' : 'unchanged',
        statusLabel: changeCategories.length > 0 ? 'Regimen changed' : 'Unchanged',
        changeCategories,
        earlierRegimen: earlier,
        laterRegimen: later,
        earlierExcerpt: earlier.excerpt,
        laterExcerpt: later.excerpt,
        absenceNote: null,
      });
    }
  }

  return {
    normalizedEarlierNote,
    normalizedLaterNote,
    items,
  };
}

export type EvidenceStateKind =
  | 'resolved'
  | 'partial'
  | 'missing_reference'
  | 'unavailable_document'
  | 'documented_negative'
  | 'conflicting_excerpts';

export const EVIDENCE_STATE_LABELS: Record<EvidenceStateKind, string> = {
  resolved: 'Resolved',
  partial: 'Partial',
  missing_reference: 'Missing reference',
  unavailable_document: 'Unavailable document',
  documented_negative: 'Documented negative',
  conflicting_excerpts: 'Conflicting excerpts',
};

const EXPLICIT_NEGATIVE_PATTERN =
  /\b(discontinued|stopped|held|not taking|no longer taking|documented negative|explicitly absent|denied|withheld|omitted)\b/i;

function isExplicitNegativeLink(link: ResolvedEvidenceLink): boolean {
  if (link.provenanceStatus !== 'documented') {
    return false;
  }
  const text = `${link.excerpt ?? ''} ${link.note ?? ''}`.trim();
  return text.length > 0 && EXPLICIT_NEGATIVE_PATTERN.test(text);
}

function hasConflictingExcerpts(links: ReadonlyArray<ResolvedEvidenceLink>): boolean {
  const bySide: Record<'earlier' | 'later', Set<string>> = {
    earlier: new Set<string>(),
    later: new Set<string>(),
  };

  for (const link of links) {
    const excerpt = link.excerpt?.trim().toLowerCase();
    if (!excerpt) continue;
    if (link.side === 'earlier' || link.side === 'later') {
      bySide[link.side].add(excerpt);
    }
  }

  return bySide.earlier.size > 1 || bySide.later.size > 1;
}

/**
 * Classify a single resolved evidence link into one of the user-facing
 * evidence states, distinguishing unavailable documents, missing references,
 * conflicting excerpts, and documented negatives.
 */
export function classifyLinkEvidenceState(
  link: ResolvedEvidenceLink,
  change?: Pick<MedicationChange, 'kind' | 'provenance' | 'provenanceFlags' | 'evidenceLinks'>,
): EvidenceStateKind {
  if (link.resolutionStatus === 'unavailable') {
    return 'unavailable_document';
  }
  if (
    link.resolutionStatus === 'ambiguous' ||
    change?.provenanceFlags?.includes('conflicting_provenance') ||
    (change?.evidenceLinks ? hasConflictingExcerpts(change.evidenceLinks) : false)
  ) {
    return 'conflicting_excerpts';
  }
  if (link.resolutionStatus === 'unresolved') {
    return 'missing_reference';
  }
  if (isExplicitNegativeLink(link)) {
    return 'documented_negative';
  }
  return link.resolutionStatus === 'resolved' ? 'resolved' : 'partial';
}

/**
 * Classify a medication change's overall evidence state for provenance-health
 * drill-down and Snapshot review headers.
 */
export function classifyChangeEvidenceState(
  change: Pick<MedicationChange, 'kind' | 'provenance' | 'provenanceFlags' | 'evidenceLinks'>,
): EvidenceStateKind {
  const links = change.evidenceLinks ?? [];
  if (links.some((l) => l.resolutionStatus === 'unavailable')) {
    return 'unavailable_document';
  }
  if (
    links.some((l) => l.resolutionStatus === 'ambiguous') ||
    change.provenance?.hasAmbiguousProvenance ||
    change.provenanceFlags?.includes('conflicting_provenance') ||
    hasConflictingExcerpts(links)
  ) {
    return 'conflicting_excerpts';
  }
  if (links.length === 0 || links.some((l) => l.resolutionStatus === 'unresolved')) {
    return 'missing_reference';
  }
  if (
    (change.kind === 'removed' && change.provenance?.later.status === 'documented') ||
    (change.kind === 'added' && change.provenance?.earlier.status === 'documented') ||
    links.some(isExplicitNegativeLink)
  ) {
    return 'documented_negative';
  }
  if (links.every((l) => l.resolutionStatus === 'resolved')) {
    return 'resolved';
  }
  return 'partial';
}

export type EncounterTimelineKind = 'encounter' | 'note' | 'change';

export interface EncounterTimelineEntry {
  id: string;
  kind: EncounterTimelineKind;
  recordedAt: string | null;
  title: string;
  sourceLabel: string;
  detail: string;
  medicationId?: string;
}

export interface EncounterTimelineResult {
  dated: EncounterTimelineEntry[];
  undated: EncounterTimelineEntry[];
}

const TIMELINE_KIND_ORDER: Record<EncounterTimelineKind, number> = {
  encounter: 0,
  note: 1,
  change: 2,
};

function formatTimelineChangeDetail(change: MedicationChange): string {
  if (change.kind === 'changed' && change.fields.length > 0) {
    return change.fields
      .map((f) => `${f.field}: ${f.before ?? 'Not documented'} → ${f.after ?? 'Not documented'}`)
      .join(' · ');
  }
  if (change.kind === 'removed') {
    return 'Not listed in later snapshot';
  }
  return 'Added in later snapshot';
}

/**
 * Lay out synthetic encounters, cited notes, and documented changes
 * chronologically, keeping undated records in a separate bucket without
 * fabricating dates.
 */
export function buildEncounterTimeline(
  earlier: Snapshot,
  later: Snapshot,
  report: Pick<SnapshotComparisonReport, 'changes'>,
): EncounterTimelineResult {
  const entries: EncounterTimelineEntry[] = [];

  entries.push({
    id: `enc-earlier-${earlier.id}`,
    kind: 'encounter',
    recordedAt: normalizeOptionalText(earlier.recordedAt),
    title: 'Earlier snapshot',
    sourceLabel: earlier.source,
    detail: `${earlier.medications.length} documented ${
      earlier.medications.length === 1 ? 'medication' : 'medications'
    }`,
  });

  const seenNotes = new Set<string>();
  for (const change of report.changes) {
    for (const link of change.evidenceLinks ?? []) {
      if (!link.noteId && !link.excerpt) continue;
      const recordedAt = normalizeOptionalText(
        link.recordedAt ??
          (link.side === 'earlier'
            ? earlier.recordedAt
            : link.side === 'later'
              ? later.recordedAt
              : null),
      );
      const noteIdentity = link.sourceLabel ?? link.noteId ?? 'Synthetic clinical note';
      const dedupeKey = `${change.medicationId}|${noteIdentity}|${recordedAt ?? 'undated'}|${link.excerpt ?? ''}`;
      if (seenNotes.has(dedupeKey)) continue;
      seenNotes.add(dedupeKey);

      entries.push({
        id: `note-${change.medicationId}-${seenNotes.size}`,
        kind: 'note',
        recordedAt,
        title: `${change.name} · ${
          link.section ??
          (link.side === 'earlier'
            ? 'Earlier note'
            : link.side === 'later'
              ? 'Later note'
              : 'Clinical note')
        }`,
        sourceLabel: noteIdentity,
        detail: link.excerpt ?? link.note ?? 'Cited note reference',
        medicationId: change.medicationId,
      });
    }
  }

  entries.push({
    id: `enc-later-${later.id}`,
    kind: 'encounter',
    recordedAt: normalizeOptionalText(later.recordedAt),
    title: 'Later snapshot',
    sourceLabel: later.source,
    detail: `${later.medications.length} documented ${
      later.medications.length === 1 ? 'medication' : 'medications'
    }`,
  });

  const laterDate = normalizeOptionalText(later.recordedAt);
  for (const change of report.changes) {
    entries.push({
      id: `chg-${change.medicationId}`,
      kind: 'change',
      recordedAt: laterDate,
      title: `${change.name} (${change.kind})`,
      sourceLabel: later.source,
      detail: formatTimelineChangeDetail(change),
      medicationId: change.medicationId,
    });
  }

  const dated: EncounterTimelineEntry[] = [];
  const undated: EncounterTimelineEntry[] = [];

  for (const entry of entries) {
    if (entry.recordedAt) {
      dated.push(entry);
    } else {
      undated.push(entry);
    }
  }

  dated.sort((a, b) => {
    const timeA = Date.parse(a.recordedAt!);
    const timeB = Date.parse(b.recordedAt!);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    if (a.recordedAt !== b.recordedAt) {
      return (a.recordedAt ?? '').localeCompare(b.recordedAt ?? '');
    }
    return TIMELINE_KIND_ORDER[a.kind] - TIMELINE_KIND_ORDER[b.kind];
  });

  return { dated, undated };
}

export type ChartSearchSourceKind =
  | 'earlier_note'
  | 'later_note'
  | 'earlier_snapshot'
  | 'later_snapshot'
  | 'medication_diff'
  | 'evidence_link';

export interface ChartSearchMatch {
  id: string;
  sourceKind: ChartSearchSourceKind;
  sourceLabel: string;
  recordedAt: string | null;
  title: string;
  snippet: string;
  targetView: 'extract' | 'diff';
  medicationId?: string;
  citationIdx?: number;
}

export interface SearchChartParams {
  query: string;
  earlierNoteLabel: string;
  earlierNoteText: string;
  laterNoteLabel: string;
  laterNoteText: string;
  earlierSnapshot: Snapshot;
  laterSnapshot: Snapshot;
  report: Pick<SnapshotComparisonReport, 'changes'>;
  extractResult?: NoteRegimenComparisonReport | null;
}

function extractMatchSnippet(text: string, queryLower: string, maxLen = 110): string {
  const idx = text.toLowerCase().indexOf(queryLower);
  if (idx < 0) return text.slice(0, maxLen);
  if (text.length <= maxLen) return text;
  const half = Math.floor((maxLen - queryLower.length) / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(text.length, start + maxLen);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * Search across synthetic notes, structured snapshots, diff changes, and
 * cited evidence links, returning source-labeled matches with jump targets.
 */
export function searchChartRecords(params: SearchChartParams): ChartSearchMatch[] {
  const trimmed = params.query.trim();
  if (!trimmed) return [];
  const q = trimmed.toLowerCase();
  const matches: ChartSearchMatch[] = [];

  if (params.earlierNoteText.toLowerCase().includes(q)) {
    matches.push({
      id: 'match-earlier-note',
      sourceKind: 'earlier_note',
      sourceLabel: `Earlier note · ${params.earlierNoteLabel}`,
      recordedAt: normalizeOptionalText(params.earlierSnapshot.recordedAt),
      title: params.earlierNoteLabel,
      snippet: extractMatchSnippet(params.earlierNoteText, q),
      targetView: 'extract',
    });
  }

  if (params.laterNoteText.toLowerCase().includes(q)) {
    matches.push({
      id: 'match-later-note',
      sourceKind: 'later_note',
      sourceLabel: `Later note · ${params.laterNoteLabel}`,
      recordedAt: normalizeOptionalText(params.laterSnapshot.recordedAt),
      title: params.laterNoteLabel,
      snippet: extractMatchSnippet(params.laterNoteText, q),
      targetView: 'extract',
    });
  }

  if (params.extractResult) {
    for (const item of params.extractResult.items) {
      const searchable = [
        item.medicationName,
        item.statusLabel,
        ...item.changeCategories,
        item.earlierExcerpt ?? '',
        item.laterExcerpt ?? '',
      ]
        .join(' ')
        .trim();
      if (searchable.toLowerCase().includes(q)) {
        matches.push({
          id: `match-extract-${item.normalizedName}`,
          sourceKind: 'medication_diff',
          sourceLabel: 'Compare notes result',
          recordedAt: null,
          title: `${item.medicationName} (${item.statusLabel})`,
          snippet: extractMatchSnippet(searchable, q),
          targetView: 'extract',
        });
      }
    }
  }

  const matchedDiffMedIds = new Set<string>();
  for (const change of params.report.changes) {
    const fieldSummary = change.fields
      .map((f) => `${f.field}: ${f.before ?? 'Not documented'} → ${f.after ?? 'Not documented'}`)
      .join(' · ');
    const diffText = `${change.name} ${change.kind} ${fieldSummary}`.trim();
    if (diffText.toLowerCase().includes(q)) {
      matchedDiffMedIds.add(change.medicationId);
      matches.push({
        id: `match-diff-${change.medicationId}`,
        sourceKind: 'medication_diff',
        sourceLabel: `Medication diff · ${params.laterSnapshot.source}`,
        recordedAt: normalizeOptionalText(params.laterSnapshot.recordedAt),
        title: `${change.name} (${change.kind})`,
        snippet: extractMatchSnippet(fieldSummary || diffText, q),
        targetView: 'diff',
        medicationId: change.medicationId,
      });
    }

    (change.evidenceLinks ?? []).forEach((link, idx) => {
      const linkText = [
        link.excerpt ?? '',
        link.note ?? '',
        link.sourceLabel ?? '',
        link.section ?? '',
      ]
        .join(' ')
        .trim();
      if (linkText && linkText.toLowerCase().includes(q)) {
        matches.push({
          id: `match-ev-${change.medicationId}-${idx}`,
          sourceKind: 'evidence_link',
          sourceLabel: `Evidence · ${
            link.sourceLabel ??
            (link.side === 'earlier'
              ? params.earlierSnapshot.source
              : params.laterSnapshot.source)
          }`,
          recordedAt: normalizeOptionalText(link.recordedAt),
          title: `${change.name} · citation ${idx + 1}`,
          snippet: extractMatchSnippet(link.excerpt ?? linkText, q),
          targetView: 'diff',
          medicationId: change.medicationId,
          citationIdx: idx,
        });
      }
    });
  }

  for (const [kind, snap, labelPrefix] of [
    ['earlier_snapshot', params.earlierSnapshot, 'Earlier snapshot'] as const,
    ['later_snapshot', params.laterSnapshot, 'Later snapshot'] as const,
  ]) {
    for (const m of snap.medications) {
      if (matchedDiffMedIds.has(m.id)) continue;
      const medText = [m.name, m.dose ?? '', m.route ?? '', m.frequency ?? ''].join(' ').trim();
      if (medText.toLowerCase().includes(q)) {
        matches.push({
          id: `match-${kind}-${m.id}`,
          sourceKind: kind,
          sourceLabel: `${labelPrefix} · ${snap.source}`,
          recordedAt: normalizeOptionalText(snap.recordedAt),
          title: m.name,
          snippet: extractMatchSnippet(medText, q),
          targetView: 'diff',
          medicationId: m.id,
        });
      }
    }
  }

  return matches;
}

export type DocumentIndexStatus = 'available' | 'revision' | 'duplicate' | 'unavailable';

export interface DocumentIndexEntry {
  id: string;
  sourceLabel: string;
  recordedAt: string | null;
  sourceKind: EvidenceSourceKind;
  status: DocumentIndexStatus;
  statusLabel: string;
  detail: string;
  medicationId?: string;
  citationIdx?: number;
  targetView?: 'extract' | 'diff';
}

export interface DocumentIndexResult {
  dated: DocumentIndexEntry[];
  undated: DocumentIndexEntry[];
  counts: {
    total: number;
    revisions: number;
    duplicates: number;
    unavailable: number;
  };
}

const REVISION_TEXT_PATTERN = /\b(revision|revised|amended|amendment|addendum|updated)\b/i;

const DOCUMENT_STATUS_LABELS: Record<DocumentIndexStatus, string> = {
  available: 'Available',
  revision: 'Revision',
  duplicate: 'Duplicate',
  unavailable: 'Unavailable document',
};

/**
 * List synthetic notes and snapshot documents by source and date,
 * surfacing revisions, duplicates, and unavailable documents while keeping
 * undated records separate.
 */
export function buildDocumentIndex(
  earlier: Snapshot,
  later: Snapshot,
  report: Pick<SnapshotComparisonReport, 'changes'>,
): DocumentIndexResult {
  interface RawDoc {
    id: string;
    identityKey: string;
    contentKey: string;
    sourceLabel: string;
    recordedAt: string | null;
    sourceKind: EvidenceSourceKind;
    isUnavailable: boolean;
    explicitRevision: boolean;
    detail: string;
    medicationId?: string;
    citationIdx?: number;
  }

  const rawDocs: RawDoc[] = [
    {
      id: `doc-snap-${earlier.id}`,
      identityKey: `snap:${earlier.source.trim().toLowerCase()}`,
      contentKey: `snap:${earlier.medications.map((m) => `${m.id}:${m.dose ?? ''}`).join('|')}`,
      sourceLabel: earlier.source,
      recordedAt: normalizeOptionalText(earlier.recordedAt),
      sourceKind: earlier.sourceKind ?? 'snapshot',
      isUnavailable: false,
      explicitRevision: REVISION_TEXT_PATTERN.test(earlier.source),
      detail: `${earlier.medications.length} documented ${
        earlier.medications.length === 1 ? 'medication' : 'medications'
      }`,
    },
    {
      id: `doc-snap-${later.id}`,
      identityKey: `snap:${later.source.trim().toLowerCase()}`,
      contentKey: `snap:${later.medications.map((m) => `${m.id}:${m.dose ?? ''}`).join('|')}`,
      sourceLabel: later.source,
      recordedAt: normalizeOptionalText(later.recordedAt),
      sourceKind: later.sourceKind ?? 'snapshot',
      isUnavailable: false,
      explicitRevision: REVISION_TEXT_PATTERN.test(later.source),
      detail: `${later.medications.length} documented ${
        later.medications.length === 1 ? 'medication' : 'medications'
      }`,
    },
  ];

  for (const change of report.changes) {
    (change.evidenceLinks ?? []).forEach((link, idx) => {
      const hasDocIdentity = Boolean(
        link.noteId || link.sourceId || link.excerpt || link.resolutionStatus === 'unavailable',
      );
      if (!hasDocIdentity) return;

      const sourceLabel =
        link.sourceLabel ??
        link.noteId ??
        link.sourceId ??
        (link.side === 'earlier'
          ? earlier.source
          : link.side === 'later'
            ? later.source
            : 'Unattributed document');

      const recordedAt = normalizeOptionalText(
        link.recordedAt ??
          (link.side === 'earlier'
            ? earlier.recordedAt
            : link.side === 'later'
              ? later.recordedAt
              : null),
      );

      const identityKey = (link.noteId ?? link.sourceId ?? sourceLabel).trim().toLowerCase();
      const contentKey = `${(link.excerpt ?? '').trim().toLowerCase()}|${(link.section ?? '').trim().toLowerCase()}`;
      const isUnavailable = link.resolutionStatus === 'unavailable';

      rawDocs.push({
        id: `doc-link-${change.medicationId}-${idx}`,
        identityKey,
        contentKey,
        sourceLabel,
        recordedAt,
        sourceKind: link.sourceKind ?? 'clinical_note',
        isUnavailable,
        explicitRevision: REVISION_TEXT_PATTERN.test(
          `${sourceLabel} ${link.section ?? ''} ${link.note ?? ''}`,
        ),
        detail: isUnavailable
          ? `Source unavailable${link.note ? ` — ${link.note}` : ''}`
          : link.excerpt
            ? `${change.name}: "${link.excerpt}"`
            : `${change.name}: ${link.note ?? 'Document reference'}`,
        medicationId: change.medicationId,
        citationIdx: idx,
      });
    });
  }

  const seenExact = new Map<string, number>();
  const seenIdentity = new Map<string, string>();
  const dated: DocumentIndexEntry[] = [];
  const undated: DocumentIndexEntry[] = [];

  let revisions = 0;
  let duplicates = 0;
  let unavailable = 0;

  for (const doc of rawDocs) {
    const exactKey = `${doc.identityKey}|${doc.recordedAt ?? 'undated'}|${doc.contentKey}`;
    const exactCount = seenExact.get(exactKey) ?? 0;
    seenExact.set(exactKey, exactCount + 1);

    const prevContent = seenIdentity.get(doc.identityKey);
    let status: DocumentIndexStatus = 'available';
    if (doc.isUnavailable) {
      status = 'unavailable';
      unavailable += 1;
    } else if (exactCount > 0) {
      status = 'duplicate';
      duplicates += 1;
    } else if (doc.explicitRevision || (prevContent !== undefined && prevContent !== doc.contentKey)) {
      status = 'revision';
      revisions += 1;
    }

    if (prevContent === undefined) {
      seenIdentity.set(doc.identityKey, doc.contentKey);
    }

    const entry: DocumentIndexEntry = {
      id: doc.id,
      sourceLabel: doc.sourceLabel,
      recordedAt: doc.recordedAt,
      sourceKind: doc.sourceKind,
      status,
      statusLabel: DOCUMENT_STATUS_LABELS[status],
      detail: doc.detail,
      ...(doc.medicationId ? { medicationId: doc.medicationId } : {}),
      ...(doc.citationIdx !== undefined ? { citationIdx: doc.citationIdx } : {}),
      ...(doc.medicationId ? { targetView: 'diff' as const } : {}),
    };

    if (entry.recordedAt) {
      dated.push(entry);
    } else {
      undated.push(entry);
    }
  }

  dated.sort((a, b) => {
    const timeA = Date.parse(a.recordedAt!);
    const timeB = Date.parse(b.recordedAt!);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.sourceLabel.localeCompare(b.sourceLabel);
  });

  return {
    dated,
    undated,
    counts: {
      total: dated.length + undated.length,
      revisions,
      duplicates,
      unavailable,
    },
  };
}

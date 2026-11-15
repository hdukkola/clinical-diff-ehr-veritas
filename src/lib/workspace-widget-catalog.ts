/** Data-only widget definitions for the workspace. This module does not fetch,
 * interpret, persist, or generate clinical information. Callers must supply
 * the active case and the exact note inputs used by the comparison. */

export type WorkspaceWidgetPage = 'home' | 'patient' | 'extract' | 'diff' | 'triage' | 'audit' | 'chat';
export type WorkspaceWidgetState = 'ready' | 'empty' | 'unavailable' | 'stale';
export type WorkspaceWidgetTarget = 'patient' | 'extract' | 'diff' | 'triage' | 'audit' | 'chat';
export type WorkspaceWidgetRow = { id: string; label: string; detail?: string };

export type WorkspaceCatalogItem = {
  id: string;
  title: string;
  pages: WorkspaceWidgetPage[];
  state: WorkspaceWidgetState;
  value: string | number;
  detail: string;
  /** Describes the provided data's scope, not a verified external source. */
  source: string;
  rows?: WorkspaceWidgetRow[];
  action?: { label: string; target: WorkspaceWidgetTarget };
};

export type WorkspaceCatalogDifference = {
  key: string;
  name: string;
  kind: 'earlier_only' | 'later_only' | 'regimen_changed' | 'discontinued';
};

export type WorkspaceCatalogComparison = {
  caseId: string;
  /** Exact inputs used to generate these results, before any edits. */
  earlierText: string;
  laterText: string;
  differences: readonly WorkspaceCatalogDifference[];
  modeLabel: string;
  simulated: boolean;
};

export type WorkspaceCatalogContext = {
  activeCase: { id: string; name: string } | null;
  /** null means unavailable, while an empty string is an empty note. */
  notes: { caseId: string; earlier: string; later: string } | null;
  comparison: WorkspaceCatalogComparison | null;
  /** Decisions must be for the same case and exact comparison inputs. */
  reviews: { caseId: string; earlierText: string; laterText: string; decisions: Readonly<Record<string, 'reviewed' | 'clarify' | undefined>> } | null;
  /** Already ownership-filtered by the caller; null means not loaded. */
  ownedCases: readonly { id: string; name: string }[] | null;
};

const presence = (text: string) => text.trim().length > 0;
const action = (label: string, target: WorkspaceWidgetTarget) => ({ label, target });

/** Build per-page cards without inventing measurements, medication status, or
 * cross-case associations. A stale result is not counted as a current result. */
export function buildWorkspaceWidgetCatalog(context: WorkspaceCatalogContext): WorkspaceCatalogItem[] {
  const { activeCase, notes, comparison, reviews, ownedCases } = context;
  const scopedNotes = activeCase && notes?.caseId === activeCase.id ? notes : null;
  const noteCount = scopedNotes ? Number(presence(scopedNotes.earlier)) + Number(presence(scopedNotes.later)) : null;
  const comparisonSameCase = Boolean(activeCase && comparison?.caseId === activeCase.id);
  const comparisonCurrent = Boolean(comparisonSameCase && scopedNotes && comparison &&
    comparison.earlierText === scopedNotes.earlier && comparison.laterText === scopedNotes.later &&
    presence(scopedNotes.earlier) && presence(scopedNotes.later));
  const comparisonState: WorkspaceWidgetState = comparisonCurrent ? 'ready' : comparisonSameCase ? 'stale' : 'unavailable';
  const currentComparison = comparisonCurrent ? comparison : null;
  const uniqueKeys = new Set(currentComparison?.differences.map((item) => item.key));
  // Duplicate result keys cannot be safely associated with distinct decisions.
  const reviewKeysValid = Boolean(currentComparison && uniqueKeys.size === currentComparison.differences.length &&
    currentComparison.differences.every((item) => item.key.trim().length > 0));
  const reviewsCurrent = Boolean(reviewKeysValid && reviews && currentComparison && reviews.caseId === currentComparison.caseId &&
    reviews.earlierText === currentComparison.earlierText && reviews.laterText === currentComparison.laterText);
  const differences = currentComparison?.differences ?? [];
  const decided = reviewsCurrent ? differences.filter((item) => reviews?.decisions[item.key] === 'reviewed' || reviews?.decisions[item.key] === 'clarify').length : null;
  const flagged = reviewsCurrent ? differences.filter((item) => reviews?.decisions[item.key] === 'clarify').length : null;
  const source = 'Active case · note comparison';
  const unavailableDetail = comparisonState === 'stale' ? 'Notes changed since this comparison. Run it again.' : 'Run a comparison for this case to see results.';
  const result = (id: string, title: string, value: number | null, detail: string, pages: WorkspaceWidgetPage[], target: WorkspaceWidgetTarget = 'extract'): WorkspaceCatalogItem => ({
    id, title, pages, state: comparisonCurrent ? 'ready' : comparisonState,
    value: comparisonCurrent && value !== null ? value : 'Unavailable',
    detail: comparisonCurrent ? detail : unavailableDetail, source,
    action: action('Open comparison', target),
  });
  const reviewState: WorkspaceWidgetState = !comparisonCurrent ? comparisonState : reviewsCurrent ? 'ready' : 'unavailable';
  const reviewDetail = !comparisonCurrent ? unavailableDetail : !reviewsCurrent ? 'Review decisions are unavailable for these note versions.' : '';
  const reviewItem = (id: string, title: string, value: number | null, detail: string): WorkspaceCatalogItem => ({
    id, title, pages: ['home', 'patient', 'extract'], state: reviewState,
    value: value === null ? 'Unavailable' : value, detail: reviewState === 'ready' ? detail : reviewDetail,
    source: 'Active case · comparison review decisions', action: action('Review differences', 'extract'),
  });
  const caseNames = ownedCases?.map((item) => ({ id: item.id, label: item.name })) ?? [];
  return [
    { id: 'active-case', title: 'Active case', pages: ['home', 'patient', 'chat'], state: activeCase ? 'ready' : 'unavailable', value: activeCase?.name ?? 'Unavailable', detail: activeCase ? 'Selected case' : 'Select a case to view its workspace.', source: 'Active case selection', action: action('Open patient', 'patient') },
    { id: 'owned-cases', title: 'Your cases', pages: ['home'], state: ownedCases === null ? 'unavailable' : ownedCases.length ? 'ready' : 'empty', value: ownedCases?.length ?? 'Unavailable', detail: ownedCases === null ? 'Case list unavailable.' : 'Cases provided by the current workspace.', source: 'Caller-provided owned-case list', rows: ownedCases === null ? undefined : caseNames, action: action('Open patient', 'patient') },
    { id: 'notes-present', title: 'Notes entered', pages: ['home', 'patient', 'extract'], state: noteCount === null ? 'unavailable' : noteCount ? 'ready' : 'empty', value: noteCount === null ? 'Unavailable' : `${noteCount} / 2`, detail: noteCount === null ? 'Notes are unavailable for this case.' : 'Earlier and later notes with nonblank text; not a completeness assessment.', source: 'Active case · note drafts', action: action('Open notes', 'extract') },
    ...(['earlier', 'later'] as const).map((side): WorkspaceCatalogItem => ({ id: `${side}-note`, title: side === 'earlier' ? 'Earlier note' : 'Later note', pages: ['patient', 'extract'], state: scopedNotes ? presence(scopedNotes[side]) ? 'ready' : 'empty' : 'unavailable', value: scopedNotes ? presence(scopedNotes[side]) ? 'Entered' : 'Empty' : 'Unavailable', detail: scopedNotes ? `${Array.from(scopedNotes[side]).length} characters in the current draft.` : 'Note unavailable for this case.', source: `Active case · ${side} note draft`, action: action('Open notes', 'extract') })),
    result('comparison-differences', 'Differences to review', differences.length, 'Compare each difference with its source notes.', ['home', 'patient', 'extract']),
    result('earlier-only', 'Only in earlier note', differences.filter((item) => item.kind === 'earlier_only').length, 'Check for explicit documentation before treating a medication as stopped.', ['extract', 'diff']),
    result('later-only', 'Only in later note', differences.filter((item) => item.kind === 'later_only').length, 'Check the source for when each medication was started.', ['extract', 'diff']),
    result('regimen-changed', 'Different regimen statements', differences.filter((item) => item.kind === 'regimen_changed').length, 'Different statements need source and human review.', ['extract', 'diff']),
    result('explicit-discontinuation', 'Discontinuation statements', differences.filter((item) => item.kind === 'discontinued').length, 'Comparison-labeled statements require source and human review.', ['extract', 'diff']),
    reviewItem('reviewed-count', 'Decisions recorded', decided, `${decided ?? 0} of ${differences.length} differences have a review decision, including clarification requests.`),
    reviewItem('awaiting-review', 'Awaiting decision', decided === null ? null : differences.length - decided, 'Differences without a recorded review decision.'),
    reviewItem('clarifications', 'Clarifications', flagged, 'Differences flagged for clarification; no message is sent.'),
    { id: 'comparison-mode', title: 'Comparison mode', pages: ['extract'], state: comparisonCurrent ? 'ready' : comparisonState, value: currentComparison?.modeLabel || 'Unavailable', detail: currentComparison ? currentComparison.simulated ? 'Simulated result; human review required.' : 'Caller-reported mode; human review required.' : unavailableDetail, source, action: action('Open comparison', 'extract') },
    { id: 'difference-list', title: 'Comparison items', pages: ['extract', 'diff'], state: comparisonCurrent ? differences.length ? 'ready' : 'empty' : comparisonState, value: comparisonCurrent ? differences.length : 'Unavailable', detail: comparisonCurrent ? 'Source statements require human review.' : unavailableDetail, source, rows: comparisonCurrent ? differences.map((item) => ({ id: item.key, label: item.name, detail: item.kind.replaceAll('_', ' ') })) : undefined, action: action('Open comparison', 'extract') },
    { id: 'observations-unavailable', title: 'Vitals and lab results', pages: ['patient'], state: 'unavailable', value: 'Unavailable', detail: 'No observation data was supplied to this catalog.', source: 'No observation source supplied' },
  ];
}

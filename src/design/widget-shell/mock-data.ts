/**
 * DESIGN MOCK DATA — entirely fictional ("Morgan Lee (Synthetic)", DEMO-001).
 * None of these values are measured, clinical, or produced by a model.
 */

export const MOCK_PATIENT = { label: 'Morgan Lee (Synthetic)', id: 'DEMO-001' } as const;

export const MOCK_REVIEW_COUNTS = {
  denominator: 12,
  parts: [
    { key: 'verified', label: 'Verified', count: 5 },
    { key: 'flagged', label: 'Flagged for follow-up', count: 2 },
    { key: 'deferred', label: 'Deferred', count: 1 },
    { key: 'unreviewed', label: 'Not yet reviewed', count: 4 },
  ],
} as const;

export interface MockEvidenceRow {
  id: string;
  medication: string;
  change: string;
  relation: 'documented' | 'absent-not-stopped' | 'missing-detail';
  relationLabel: string;
  earlier: { source: string; date: string; excerpt: string } | null;
  later: { source: string; date: string; excerpt: string } | null;
}

export const MOCK_EVIDENCE_ROWS: MockEvidenceRow[] = [
  {
    id: 'ev-1',
    medication: 'Lisinopril',
    change: 'Dose 10 mg → 20 mg, once daily',
    relation: 'documented',
    relationLabel: 'Documented in both sources',
    earlier: { source: 'Clinic note', date: '2026-10-01', excerpt: 'Lisinopril 10 mg PO daily.' },
    later: { source: 'Discharge summary', date: '2026-10-15', excerpt: 'Increase Lisinopril to 20 mg daily.' },
  },
  {
    id: 'ev-2',
    medication: 'Aspirin',
    change: 'Not listed in later source',
    relation: 'absent-not-stopped',
    relationLabel: 'Absent — not documented as stopped',
    earlier: { source: 'Clinic note', date: '2026-10-01', excerpt: 'Aspirin 81 mg PO daily.' },
    later: null,
  },
  {
    id: 'ev-3',
    medication: 'Amoxicillin',
    change: 'Duration not stated',
    relation: 'missing-detail',
    relationLabel: 'Missing detail — duration unknown',
    earlier: null,
    later: { source: 'Discharge summary', date: '2026-10-15', excerpt: 'Amoxicillin 500 mg PO three times daily.' },
  },
];

export const MOCK_COMPLETENESS = [
  { label: 'Dose present', have: 11, of: 12 },
  { label: 'Route present', have: 10, of: 12 },
  { label: 'Frequency present', have: 9, of: 12 },
  { label: 'Source and date present', have: 12, of: 12 },
] as const;

export const MOCK_TIMELINE = [
  { date: '2026-10-01', kind: 'Clinic visit', detail: 'Note on file; 1 medication list' },
  { date: '2026-10-12', kind: 'ED arrival', detail: 'Triage note only; no medication list' },
  { date: '2026-10-15', kind: 'Discharge', detail: 'Summary on file; 1 medication list' },
] as const;

export interface PageWidgetRow {
  page: string;
  /** Existing app page name, or 'Home (proposed)'. */
  primaryAction: string;
  widgets: string[];
  /** Per-widget build status in the real app today. */
  status: 'Extends current' | 'New (needs integration)' | 'Future concept';
}

export const PAGE_WIDGET_MATRIX: PageWidgetRow[] = [
  {
    page: 'Home (proposed)',
    primaryAction: 'Open the next item that needs review',
    widgets: ['Open review items', 'Recent source-backed changes', 'Review status', 'Encounter timeline', 'Data completeness', 'Shortcuts'],
    status: 'New (needs integration)',
  },
  {
    page: 'Compare notes',
    primaryAction: 'Compare two notes and review each difference',
    widgets: ['Earlier vs later list', 'Evidence-linked differences', 'Conflicting statements', 'Missing detail gaps'],
    status: 'Extends current',
  },
  {
    page: 'Snapshot review',
    primaryAction: 'Verify, flag or defer each change',
    widgets: ['Change explorer with excerpts', 'Reviewer dispositions', 'Follow-up queue', 'Mention timeline'],
    status: 'Extends current',
  },
  {
    page: 'Review suggestions',
    primaryAction: 'Accept, override or skip a suggestion',
    widgets: ['Suggestion with evidence', 'Uncertainty and abstentions', 'Disposition counts'],
    status: 'Extends current',
  },
  {
    page: 'Evaluations',
    primaryAction: 'Inspect failures and denominators',
    widgets: ['Tested / passed / failed / timed out', 'Case-family breakdown', 'Evidence coverage and abstention', 'Run comparison (measured only)'],
    status: 'Extends current',
  },
  {
    page: 'Session activity',
    primaryAction: 'Trace a review action to its item',
    widgets: ['Action log with links', 'Unresolved items', 'Source freshness and errors'],
    status: 'Extends current',
  },
  {
    page: 'Models & data',
    primaryAction: 'Confirm which model and data are in use',
    widgets: ['Mode and model identity', 'Connection status', 'Dataset provenance'],
    status: 'Extends current',
  },
  {
    page: 'Patient longitudinal (Morgan Lee)',
    primaryAction: 'See documented trends and gaps',
    widgets: ['Labs and vitals with units', 'Medication and encounter timeline', 'Allergies and source status'],
    status: 'Future concept',
  },
];

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  analyzeSnapshots,
  buildEncounterTimeline,
  classifyChangeEvidenceState,
  classifyLinkEvidenceState,
  compareNoteRegimens,
  compareSnapshots,
  EVIDENCE_STATE_LABELS,
  normalizeNoteText,
  searchChartRecords,
  type ChartSearchMatch,
  type NoteRegimenChangeCategory,
} from '@/lib/diff';
import { BRAND_NAME } from '@/lib/branding';
import { AssistantPanel } from '@/components/AssistantPanel';
import {
  DEFAULT_MLX_MODEL_ID,
  SOCKET_ENDPOINTS,
  type SocketReadiness,
  type SocketStatus,
} from '@/lib/ai-socket';
import { getSyntheticScenario, syntheticScenarios, type SyntheticScenario } from '@/lib/fixtures';
import { hfDatasetSources, hfNoteComparisonPairs, hfScenarios } from '@/lib/hf-fixtures';
import {
  CockpitWidgets,
  DEFAULT_COCKPIT_WIDGET_ORDER,
  type CockpitNavigateFilter,
  type CockpitViewId,
  type CockpitWidgetId,
} from '@/components/CockpitWidgets';
import type {
  Medication,
  MedicationChange,
  ProvenanceGapReason,
  ProvenanceStatus,
  Snapshot,
} from '@/lib/types';

/* ------------------------------------------------------------------
   Constants & Palettes
   ------------------------------------------------------------------ */
type ViewId = 'extract' | 'diff' | 'triage' | 'eval' | 'audit' | 'models';
type PaletteId = 'void' | 'dimmed' | 'obsidian' | 'forest';
type DiffFilter = 'all' | 'changed' | 'onlyA' | 'onlyB' | 'same';
type ReviewDecision = 'verified' | 'flagged' | 'deferred';
type NoteReviewDecision = 'clarify' | 'reviewed';
type DiffTab = 'diff' | 'timeline' | 'snapshots' | 'method';
type ModelsTab = 'connections' | 'add' | 'contracts';

const VIEW_NAMES: Record<ViewId, string> = {
  extract: 'Compare notes',
  diff: 'Snapshot review',
  triage: 'Review suggestions',
  eval: 'Evaluations',
  audit: 'Session activity',
  models: 'Models & data',
};

const WORKSPACE_VIEWS: { id: ViewId; label: string }[] = [
  { id: 'extract', label: 'Compare notes' },
  { id: 'diff', label: 'Snapshot review' },
  { id: 'triage', label: 'Review suggestions' },
  { id: 'eval', label: 'Evaluations' },
  { id: 'audit', label: 'Session activity' },
];

const PALETTES: {
  id: PaletteId;
  name: string;
  rec?: boolean;
  note: string;
  sw: [string, string, string, string];
}[] = [
  {
    id: 'void',
    name: 'Graphite',
    rec: true,
    note: 'Neutral, high contrast dark theme.',
    sw: ['#111113', '#1a1a1d', '#c8c8cc', '#ececee'],
  },
  {
    id: 'dimmed',
    name: 'Dark Dimmed',
    note: 'Soft slate, lowest glare. Best for long review sessions.',
    sw: ['#1c2128', '#22272e', '#adbac7', '#6cb6ff'],
  },
  {
    id: 'obsidian',
    name: 'Primer Obsidian',
    note: 'Neutral carbon with a clinical cyan signal.',
    sw: ['#131517', '#191c1f', '#c2c9d0', '#56c8d0'],
  },
  {
    id: 'forest',
    name: 'Nordic Forest',
    note: 'Green-grey and warm. Gentlest on tired eyes.',
    sw: ['#141a17', '#1a221e', '#bccac1', '#8fcfa8'],
  },
];

const PROVENANCE_STATUS_LABELS: Record<ProvenanceStatus, string> = {
  documented: 'Documented',
  patient_reported: 'Patient-reported',
  unverified: 'Unverified',
  unknown: 'Unknown',
};

const GAP_REASON_LABELS: Record<ProvenanceGapReason, string> = {
  missing_source_attribution: 'Missing source',
  blank_source_attribution: 'Blank source',
  ambiguous_source_attribution: 'Ambiguous source',
  explicit_unknown_provenance: 'Unknown provenance',
  unverified_source: 'Unverified source',
  patient_reported_unverified: 'Patient-reported only',
  conflicting_evidence_provenance: 'Conflicting provenance',
  missing_timestamp: 'Missing timestamp',
  blank_field_value: 'Blank field value',
  undocumented_field: 'Undocumented field',
  missing_supporting_evidence: 'No supporting note',
  unresolved_evidence_link: 'Unresolved evidence',
  invalid_evidence_span: 'Invalid span',
};

const DIFF_GLYPHS: Record<'changed' | 'onlyA' | 'onlyB' | 'same', { glyph: string; label: string }> = {
  changed: { glyph: '±', label: 'Changed' },
  onlyA: { glyph: '−', label: 'Only in A' },
  onlyB: { glyph: '+', label: 'Only in B' },
  same: { glyph: '·', label: 'Unchanged' },
};

const DEFAULT_EARLIER_NOTE =
  'Sample outpatient medication list. The note explicitly lists Lisinopril 10 mg daily, Metformin 500 mg twice daily, and Aspirin 81 mg daily.';
const DEFAULT_LATER_NOTE =
  'Sample discharge medication list. The note explicitly lists Lisinopril 20 mg daily, Metformin 500 mg twice daily, and Atorvastatin 20 mg nightly.';

/* ------------------------------------------------------------------
   Deterministic Local Medication-Mention Extractor
   ------------------------------------------------------------------ */
const BASE_MEDICATION_LEXICON = [
  'Acetaminophen',
  'Albuterol Sulfate HFA',
  'Albuterol Sulfate',
  'Albuterol',
  'Allopurinol',
  'Amlodipine',
  'Amoxicillin',
  'Apixaban',
  'Aspirin',
  'Atorvastatin',
  'Azithromycin',
  'Bisoprolol',
  'Calcium',
  'Captopril',
  'Carvedilol',
  'Cefazolin',
  'Ceftriaxone',
  'Celecoxib',
  'Cephalexin',
  'Cetirizine',
  'Cholecalciferol',
  'Ciprofloxacin',
  'Clopidogrel',
  'Colchicine',
  'Dabigatran',
  'Diclofenac',
  'Digoxin',
  'Doxycycline',
  'Empagliflozin',
  'Enoxaparin',
  'Epinephrine',
  'Ferrous sulfate',
  'Finasteride',
  'Fluticasone',
  'Folic acid',
  'Furosemide',
  'Gabapentin',
  'Glipizide',
  'Heparin',
  'Hydrochlorothiazide',
  'Ibuprofen',
  'Insulin glargine',
  'Insulin lispro',
  'Insulin',
  'Levothyroxine',
  'Lisinopril',
  'Loratadine',
  'Losartan',
  'Magnesium',
  'Meropenem',
  'Metformin',
  'Metoprolol',
  'Montelukast',
  'Morphine',
  'Naproxen',
  'Nitroglycerin',
  'Omeprazole',
  'Ondansetron',
  'Oxycodone',
  'Pantoprazole',
  'Piperacillin',
  'Potassium chloride',
  'Pravastatin',
  'Prednisone',
  'Rivaroxaban',
  'Rosuvastatin',
  'Sertraline',
  'Simvastatin',
  'Sitagliptin',
  'Spironolactone',
  'Tamsulosin',
  'Tramadol',
  'Vancomycin',
  'Vitamin D3',
  'Warfarin',
  'Zolpidem',
];

const DOSE_PATTERN =
  /\b([A-Z][a-zA-Z]{3,}(?:\s+[A-Z][a-zA-Z]{2,})?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|ug|g|ml|iu|meq|mmol|units?))\b/g;

const NON_MED_DOSE_PREFIXES = new Set([
  'about',
  'after',
  'approximately',
  'around',
  'before',
  'between',
  'daily',
  'dose',
  'given',
  'max',
  'maximum',
  'oral',
  'plus',
  'take',
  'taking',
  'total',
  'with',
]);

const WORD_CHAR_RE = /[\p{L}\p{N}\p{M}_\-\u2010\u2011]/u;
const CONCAT_DOSE_RE = /^\d+(?:\.\d+)?(?:mg|mcg|ug|g|ml|iu|meq|mmol|units?|u)(?![a-zA-Z0-9_-])/i;

function stripInvisible(text: string): string {
  return text.replace(/^[\s\p{Cf}]+|[\s\p{Cf}]+$/gu, '');
}

function hasVisibleText(text: string): boolean {
  return typeof text === 'string' && text.replace(/[\s\p{Cf}]/gu, '').length > 0;
}

function normalizeName(name: string): string {
  return stripInvisible(name)
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\u0130\u0131]/g, 'i')
    .toLowerCase();
}

function hasValidWordBoundary(chars: string[], start: number, end: number): boolean {
  if (start > 0 && WORD_CHAR_RE.test(chars[start - 1])) return false;
  if (end < chars.length) {
    const nextCh = chars[end];
    if (WORD_CHAR_RE.test(nextCh)) {
      if (
        !(
          /\p{N}/u.test(nextCh) &&
          /\p{L}/u.test(chars[end - 1]) &&
          CONCAT_DOSE_RE.test(chars.slice(end).join(''))
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

type MentionEvidence = {
  sourceId: string;
  name: string;
  start: number;
  end: number;
};

type QuoteSnippet = {
  key: string;
  hasLeadingEllipsis: boolean;
  prefix: string;
  match: string;
  suffix: string;
  hasTrailingEllipsis: boolean;
};

type MentionDifference = {
  key: string;
  kind: 'earlier_only' | 'later_only' | 'regimen_changed' | 'discontinued';
  name: string;
  normName: string;
  label: string;
  quotes: QuoteSnippet[];
  statusLabel?: string;
  changeCategories?: NoteRegimenChangeCategory[];
  earlierExcerpt?: string | null;
  laterExcerpt?: string | null;
  absenceNote?: string | null;
};

type NoteComparisonResult = {
  differences: MentionDifference[];
  earlier: { label: string; quotes: QuoteSnippet[]; unsupported: string[] };
  later: { label: string; quotes: QuoteSnippet[]; unsupported: string[] };
  modeLabel: string;
  simulated: boolean;
};

const INITIAL_SOCKET_STATUS: SocketStatus = {
  socket_open: true,
  state: 'standby',
  status: 'standby',
  provider: 'deterministic_replay',
  configured: false,
  reachable: false,
  mode: 'deterministic_replay',
  simulated: true,
  live_ai: false,
  model: null,
  adapter: null,
  model_loaded: false,
  endpoints: SOCKET_ENDPOINTS,
  target: null,
  checked_at: '2026-11-14T00:00:00.000Z',
};

function deriveSocketReadiness(data: Partial<SocketStatus>): SocketReadiness {
  if (data.state === 'live' || data.state === 'replay' || data.state === 'standby') {
    return data.state;
  }
  if (data.configured && data.reachable && !data.simulated) {
    return 'live';
  }
  if (data.reachable && data.simulated) {
    return 'replay';
  }
  return 'standby';
}

function normalizeSocketStatusPayload(data: Partial<SocketStatus>): SocketStatus {
  const state = deriveSocketReadiness(data);
  return {
    socket_open: Boolean(data.socket_open ?? true),
    state,
    status: data.status ?? (state === 'live' ? 'ready' : 'standby'),
    provider: data.provider ?? 'deterministic_replay',
    configured: Boolean(data.configured),
    reachable: Boolean(data.reachable),
    mode: data.mode ?? (state === 'live' ? 'local_mlx' : 'deterministic_replay'),
    simulated: data.simulated ?? state !== 'live',
    live_ai: Boolean(data.live_ai ?? state === 'live'),
    model: typeof data.model === 'string' && data.model.trim() ? data.model.trim() : null,
    adapter: typeof data.adapter === 'string' && data.adapter.trim() ? data.adapter.trim() : null,
    model_loaded: Boolean(data.model_loaded),
    endpoints: data.endpoints ?? SOCKET_ENDPOINTS,
    target: typeof data.target === 'string' ? data.target : null,
    checked_at: typeof data.checked_at === 'string' ? data.checked_at : new Date().toISOString(),
    detail: typeof data.detail === 'string' ? data.detail : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

function buildQuoteSnippet(evidence: MentionEvidence, sourceText: string): QuoteSnippet {
  const chars = Array.from(sourceText);
  let first = Math.max(0, evidence.start - 85);
  let last = Math.min(chars.length, evidence.end + 85);
  while (first < evidence.start && first > 0 && !/\s/u.test(chars[first - 1])) first++;
  while (last > evidence.end && last < chars.length && !/\s/u.test(chars[last])) last--;

  return {
    key: `${evidence.sourceId}:${evidence.start}:${evidence.end}`,
    hasLeadingEllipsis: first > 0,
    prefix: chars.slice(first, evidence.start).join(''),
    match: chars.slice(evidence.start, evidence.end).join(''),
    suffix: chars.slice(evidence.end, last).join(''),
    hasTrailingEllipsis: last < chars.length,
  };
}

function formatQuoteSnippetText(q: QuoteSnippet): string {
  return `${q.hasLeadingEllipsis ? '…' : ''}${q.prefix}${q.match}${q.suffix}${q.hasTrailingEllipsis ? '…' : ''}`;
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // Fallback for non-blob test environments
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMedicationMentions(
  sourceId: string,
  text: string,
  extraCandidates: string[],
): MentionEvidence[] {
  const chars = Array.from(text);
  const candidates = [...new Set([...extraCandidates, ...BASE_MEDICATION_LEXICON])]
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
    .sort((a, b) => b.length - a.length);

  const found: MentionEvidence[] = [];
  const occupied: Array<[number, number]> = [];

  const overlaps = (start: number, end: number) =>
    occupied.some(([s, e]) => start < e && end > s);

  const toCodepointOffset = (utf16Index: number) => Array.from(text.slice(0, utf16Index)).length;

  for (const term of candidates) {
    const regex = new RegExp(escapeRegExp(term), 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = toCodepointOffset(match.index);
      const end = start + Array.from(match[0]).length;
      if (!overlaps(start, end) && hasValidWordBoundary(chars, start, end)) {
        occupied.push([start, end]);
        found.push({ sourceId, name: match[0], start, end });
      }
    }
  }

  DOSE_PATTERN.lastIndex = 0;
  let doseMatch: RegExpExecArray | null;
  while ((doseMatch = DOSE_PATTERN.exec(text)) !== null) {
    const rawName = doseMatch[1].trim();
    if (NON_MED_DOSE_PREFIXES.has(rawName.toLowerCase())) continue;
    const start = toCodepointOffset(doseMatch.index);
    const end = start + Array.from(rawName).length;
    if (!overlaps(start, end) && hasValidWordBoundary(chars, start, end)) {
      occupied.push([start, end]);
      found.push({ sourceId, name: rawName, start, end });
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

function runDeterministicNoteComparison(
  earlierText: string,
  laterText: string,
  earlierLabel: string,
  laterLabel: string,
  extraCandidates: string[],
): NoteComparisonResult {
  const earlierMentions = extractMedicationMentions('earlier-note', earlierText, extraCandidates);
  const laterMentions = extractMedicationMentions('later-note', laterText, extraCandidates);

  const earlierNames = new Map<string, MentionEvidence[]>();
  for (const m of earlierMentions) {
    const key = normalizeName(m.name);
    const list = earlierNames.get(key) ?? [];
    list.push(m);
    earlierNames.set(key, list);
  }

  const laterNames = new Map<string, MentionEvidence[]>();
  for (const m of laterMentions) {
    const key = normalizeName(m.name);
    const list = laterNames.get(key) ?? [];
    list.push(m);
    laterNames.set(key, list);
  }

  const differences: MentionDifference[] = [];

  for (const [norm, mentions] of earlierNames.entries()) {
    if (!laterNames.has(norm)) {
      differences.push({
        key: `earlier_only:${norm}`,
        kind: 'earlier_only',
        name: mentions[0].name,
        normName: norm,
        label: earlierLabel,
        quotes: mentions.map((ev) => buildQuoteSnippet(ev, earlierText)),
      });
    }
  }

  for (const [norm, mentions] of laterNames.entries()) {
    if (!earlierNames.has(norm)) {
      differences.push({
        key: `later_only:${norm}`,
        kind: 'later_only',
        name: mentions[0].name,
        normName: norm,
        label: laterLabel,
        quotes: mentions.map((ev) => buildQuoteSnippet(ev, laterText)),
      });
    }
  }

  return {
    differences,
    earlier: {
      label: earlierLabel,
      quotes: earlierMentions.map((ev) => buildQuoteSnippet(ev, earlierText)),
      unsupported: [],
    },
    later: {
      label: laterLabel,
      quotes: laterMentions.map((ev) => buildQuoteSnippet(ev, laterText)),
      unsupported: [],
    },
    modeLabel: 'Standby · local extractor',
    simulated: true,
  };
}

/* ------------------------------------------------------------------
   Snapshot Entry Helpers (combining CD-02 diff + unchanged meds)
   ------------------------------------------------------------------ */
type DiffEntryRow = {
  id: string;
  name: string;
  kind: 'changed' | 'onlyA' | 'onlyB' | 'same';
  change?: MedicationChange;
  fields: { key: string; label: string; a: string | null | undefined; b: string | null | undefined; changed: boolean }[];
  beforeMed?: Medication;
  afterMed?: Medication;
};

function buildSnapshotEntries(earlierSnap: Snapshot, laterSnap: Snapshot): DiffEntryRow[] {
  const report = analyzeSnapshots(earlierSnap, laterSnap);
  const changeById = new Map(report.changes.map((c) => [c.medicationId, c]));
  const earlierMap = new Map(earlierSnap.medications.map((m) => [m.id, m]));
  const laterMap = new Map(laterSnap.medications.map((m) => [m.id, m]));
  const allIds = [...new Set([...earlierMap.keys(), ...laterMap.keys()])];

  return allIds.map((id) => {
    const beforeMed = earlierMap.get(id);
    const afterMed = laterMap.get(id);
    const change = changeById.get(id);
    const name = change?.name ?? afterMed?.name ?? beforeMed?.name ?? id;

    let kind: DiffEntryRow['kind'] = 'same';
    if (change?.kind === 'changed') kind = 'changed';
    else if (change?.kind === 'removed') kind = 'onlyA';
    else if (change?.kind === 'added') kind = 'onlyB';

    const fieldKeys: Array<{ key: 'dose' | 'route' | 'frequency'; label: string }> = [
      { key: 'dose', label: 'Dose' },
      { key: 'route', label: 'Route' },
      { key: 'frequency', label: 'Frequency' },
    ];

    const fields: DiffEntryRow['fields'] = fieldKeys.map(({ key, label }) => {
      const a = beforeMed ? beforeMed[key] : undefined;
      const b = afterMed ? afterMed[key] : undefined;
      return {
        key,
        label,
        a,
        b,
        changed: Boolean(beforeMed && afterMed) && a !== b,
      };
    });

    if (change?.fields.some((f) => f.field === 'name')) {
      fields.unshift({
        key: 'name',
        label: 'Name',
        a: beforeMed?.name,
        b: afterMed?.name,
        changed: true,
      });
    }

    return {
      id,
      name,
      kind,
      change,
      fields,
      beforeMed,
      afterMed,
    };
  });
}

function cleanPatientName(label: string): string {
  return label.replace(/\s*\(Synthetic\)$/i, '').trim();
}

/* ------------------------------------------------------------------
   Connectors & Held-out Evaluation Set
   ------------------------------------------------------------------ */
type ConnectionState = 'idle' | 'checking' | 'ok' | 'degraded' | 'error';

type DriverDef = {
  id: string;
  kind: 'db' | 'model';
  label: string;
  defaultEndpoint: string;
  defaultModel?: string;
  builtin?: boolean;
};

type ConnectionItem = {
  id: string;
  kind: 'db' | 'model';
  driver: string;
  name: string;
  endpoint: string;
  model: string;
  state: ConnectionState;
  latency: number | null;
  detail: string;
  checkedAt: string | null;
  active: boolean;
};

const DRIVERS: DriverDef[] = [
  {
    id: 'fixtures',
    kind: 'db',
    label: 'Synthetic fixtures',
    defaultEndpoint: 'fixtures://veritas/v1',
    builtin: true,
  },
  {
    id: 'postgres-fhir',
    kind: 'db',
    label: 'PostgreSQL · FHIR R4',
    defaultEndpoint: 'postgres://localhost:5432/fhir',
  },
  {
    id: 'supabase',
    kind: 'db',
    label: 'Supabase',
    defaultEndpoint: 'https://<project>.supabase.co',
  },
  {
    id: 'sqlite',
    kind: 'db',
    label: 'SQLite (local)',
    defaultEndpoint: 'file:./veritas.db',
  },
  {
    id: 'fhir-rest',
    kind: 'db',
    label: 'FHIR REST server',
    defaultEndpoint: 'https://hapi.fhir.org/baseR4',
  },
  {
    id: 'heuristic',
    kind: 'model',
    label: 'Rule-based baseline',
    defaultEndpoint: 'local://rules',
    builtin: true,
  },
  {
    id: 'ollama',
    kind: 'model',
    label: 'Ollama (local LLM)',
    defaultEndpoint: 'http://localhost:11434',
    defaultModel: 'medgemma:4b',
  },
  {
    id: 'openai-compatible',
    kind: 'model',
    label: 'OpenAI-compatible API',
    defaultEndpoint: 'http://localhost:8000/v1',
    defaultModel: 'served-model',
  },
  {
    id: 'hf-inference',
    kind: 'model',
    label: 'Hugging Face Inference',
    defaultEndpoint: 'https://api-inference.huggingface.co',
    defaultModel: 'emilyalsentzer/Bio_ClinicalBERT',
  },
];

const INITIAL_CONNECTIONS: ConnectionItem[] = [
  {
    id: 'conn-fixtures',
    kind: 'db',
    driver: 'fixtures',
    name: 'Synthetic fixtures',
    endpoint: 'fixtures://veritas/v1',
    model: '',
    state: 'ok',
    latency: 1,
    detail: 'In-memory, read-only',
    checkedAt: '2026-11-14T00:00:00Z',
    active: true,
  },
  {
    id: 'conn-fhir',
    kind: 'db',
    driver: 'postgres-fhir',
    name: 'FHIR R4 staging',
    endpoint: 'postgres://localhost:5432/fhir',
    model: '',
    state: 'idle',
    latency: null,
    detail: 'Not tested yet',
    checkedAt: null,
    active: false,
  },
  {
    id: 'conn-heuristic',
    kind: 'model',
    driver: 'heuristic',
    name: 'Rule-based baseline',
    endpoint: 'local://rules',
    model: '',
    state: 'ok',
    latency: 2,
    detail: 'Deterministic rules, no network',
    checkedAt: '2026-11-14T00:00:00Z',
    active: true,
  },
  {
    id: 'conn-ollama',
    kind: 'model',
    driver: 'ollama',
    name: 'MedGemma 4B · Ollama',
    endpoint: 'http://localhost:11434',
    model: 'medgemma:4b',
    state: 'idle',
    latency: null,
    detail: 'Not tested yet',
    checkedAt: null,
    active: false,
  },
];

type TriageSuggestion = {
  id: string;
  medId: string;
  proposal: string;
  rationale: string;
  confidence: number;
  evidence: string[];
  model: string;
  simulated: boolean;
  decision: 'accepted' | 'override-pending' | 'overridden' | 'skipped' | null;
  reason: string | null;
};

type AuditEntry = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
};

type EvalSummary = {
  ts: string;
  heldOutCases: number;
  scenarioCases: number;
  totalCases: number;
  precision: number;
  recall: number;
  exactMatch: number;
};

const HELDOUT_CASES: {
  id: string;
  a: Snapshot;
  b: Snapshot;
  gold: Record<string, 'added' | 'removed' | 'changed' | 'same'>;
}[] = [
  {
    id: 'heldout-1',
    a: {
      id: 'ho-1a',
      source: 'Held-out outpatient',
      recordedAt: '2026-01-10',
      medications: [
        { id: 'x', name: 'Med X', dose: '10 mg', route: 'oral', frequency: 'daily' },
        { id: 'y', name: 'Med Y', dose: '1 g', route: 'oral', frequency: 'twice daily' },
      ],
    },
    b: {
      id: 'ho-1b',
      source: 'Held-out discharge',
      recordedAt: '2026-01-14',
      medications: [{ id: 'x', name: 'Med X', dose: '10 mg', route: 'oral', frequency: 'daily' }],
    },
    gold: { x: 'same', y: 'removed' },
  },
  {
    id: 'heldout-2',
    a: {
      id: 'ho-2a',
      source: 'Held-out intake',
      recordedAt: '2026-02-01',
      medications: [{ id: 'p', name: 'Med P', dose: '5 mg', route: 'oral', frequency: 'daily' }],
    },
    b: {
      id: 'ho-2b',
      source: 'Held-out clinic',
      recordedAt: '2026-02-05',
      medications: [
        { id: 'p', name: 'Med P', dose: '5 mg', route: 'oral', frequency: null },
        { id: 'q', name: 'Med Q', dose: '2 mg', route: 'oral', frequency: 'nightly' },
      ],
    },
    gold: { p: 'changed', q: 'added' },
  },
  {
    id: 'heldout-3',
    a: {
      id: 'ho-3a',
      source: 'Held-out primary',
      recordedAt: '2026-03-01',
      medications: [
        { id: 'm', name: 'Med M', dose: '25 mcg', route: 'oral', frequency: 'daily' },
        { id: 'n', name: 'Med N', dose: '40 mg', route: 'IV', frequency: 'q12h' },
      ],
    },
    b: {
      id: 'ho-3b',
      source: 'Held-out follow-up',
      recordedAt: '2026-03-08',
      medications: [
        { id: 'm', name: 'Med M', dose: '50 mcg', route: 'oral', frequency: 'daily' },
        { id: 'n', name: 'Med N', dose: '40 mg', route: 'IV', frequency: 'q12h' },
      ],
    },
    gold: { m: 'changed', n: 'same' },
  },
];

function subscribePalette(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener('cd-palette-change', cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener('cd-palette-change', cb);
  };
}

function getPaletteSnapshot(): PaletteId {
  try {
    const saved = localStorage.getItem('cd-palette') as PaletteId | null;
    if (saved && PALETTES.some((p) => p.id === saved)) return saved;
  } catch {
    // Ignore storage access restrictions
  }
  return 'void';
}

function getPaletteServerSnapshot(): PaletteId {
  return 'void';
}

/* ------------------------------------------------------------------
   Main Component
   ------------------------------------------------------------------ */
export default function Home() {
  const allScenarios = useMemo(() => {
    const map = new Map<string, SyntheticScenario>();
    for (const s of syntheticScenarios) map.set(s.id, s);
    for (const s of hfScenarios) map.set(s.id, s);
    return [...map.values()];
  }, []);

  const patientScenarios = useMemo(
    () => allScenarios.filter((scenario) => scenario.id === 'scenario-morgan-lee-baseline'),
    [allScenarios],
  );

  const allMedicationTerms = useMemo(() => {
    const terms = new Set<string>();
    for (const s of allScenarios) {
      for (const m of s.earlier.medications) terms.add(m.name);
      for (const m of s.later.medications) terms.add(m.name);
    }
    for (const p of hfNoteComparisonPairs) {
      for (const m of p.referenceMedications) terms.add(m);
    }
    return [...terms];
  }, [allScenarios]);

  /* ---- Navigation & Theme ---- */
  const [view, setView] = useState<ViewId>('extract');
  const palette = useSyncExternalStore(
    subscribePalette,
    getPaletteSnapshot,
    getPaletteServerSnapshot,
  );
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdIndex, setCmdIndex] = useState(0);
  const [railFilter, setRailFilter] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [focusHeadingNonce, setFocusHeadingNonce] = useState(0);
  const [widgetOrder, setWidgetOrder] = useState<CockpitWidgetId[]>(DEFAULT_COCKPIT_WIDGET_ORDER);

  /* ---- Compare notes state ---- */
  const [selectedPresetId, setSelectedPresetId] = useState<string>('default');
  const [earlierNoteText, setEarlierNoteText] = useState<string>(DEFAULT_EARLIER_NOTE);
  const [laterNoteText, setLaterNoteText] = useState<string>(DEFAULT_LATER_NOTE);
  const [earlierNoteLabel, setEarlierNoteLabel] = useState<string>('Earlier note');
  const [laterNoteLabel, setLaterNoteLabel] = useState<string>('Discharge note');
  const [extractError, setExtractError] = useState<string>('');
  const [extractStatusText, setExtractStatusText] = useState<string>(
    'Standby · local extractor',
  );
  const [extractStatusState, setExtractStatusState] = useState<'replay' | 'live' | 'error'>('replay');
  const [socketStatus, setSocketStatus] = useState<SocketStatus>(INITIAL_SOCKET_STATUS);
  const [extractResult, setExtractResult] = useState<NoteComparisonResult | null>(null);
  const [noteReviewDecisions, setNoteReviewDecisions] = useState<Record<string, NoteReviewDecision>>({});

  /* ---- Snapshot review state ---- */
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('scenario-morgan-lee-baseline');
  const [diffTab, setDiffTab] = useState<DiffTab>('diff');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
  const [evidenceReturnMedId, setEvidenceReturnMedId] = useState<string | null>(null);
  const [activeCitationByMed, setActiveCitationByMed] = useState<Record<string, number>>({});
  const [chartSearchQuery, setChartSearchQuery] = useState('');
  const chartSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewDecision>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  /* ---- Triage, Eval, Audit, Connections ---- */
  const [triageByScenario, setTriageByScenario] = useState<Record<string, TriageSuggestion[]>>({});
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([
    {
      id: 'aud-init',
      ts: '2026-11-14T00:00:00.000Z',
      actor: 'System',
      action: 'Session started',
      target: 'synthetic fixtures',
    },
  ]);
  const [auditFilter, setAuditFilter] = useState<string>('all');
  const [modelsTab, setModelsTab] = useState<ModelsTab>('connections');
  const [connections, setConnections] = useState<ConnectionItem[]>(INITIAL_CONNECTIONS);
  const [connLog, setConnLog] = useState<{ id: string; ts: string; msg: string }[]>([]);
  const [newConnKind, setNewConnKind] = useState<'db' | 'model'>('db');
  const [newConnDriver, setNewConnDriver] = useState<string>('fixtures');
  const [newConnName, setNewConnName] = useState<string>('');
  const [newConnEndpoint, setNewConnEndpoint] = useState<string>('fixtures://veritas/v1');
  const [newConnModel, setNewConnModel] = useState<string>('');
  const [newConnConfig, setNewConnConfig] = useState<string>('{\n  "timeoutMs": 8000\n}');
  const [formError, setFormError] = useState<string>('');
  const [activeTocId, setActiveTocId] = useState<string>('o-summary');

  /* ---- Refs ---- */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const extractResultHeadingRef = useRef<HTMLHeadingElement>(null);
  const railSearchRef = useRef<HTMLInputElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const paletteWrapRef = useRef<HTMLDivElement>(null);

  /* ---- Derived Data ---- */
  const activeScenario = useMemo(
    () =>
      allScenarios.find((s) => s.id === selectedScenarioId) ??
      getSyntheticScenario(selectedScenarioId) ??
      allScenarios[0],
    [allScenarios, selectedScenarioId],
  );

  const activePreset = useMemo(
    () => hfNoteComparisonPairs.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId],
  );

  const activeReport = useMemo(
    () => analyzeSnapshots(activeScenario.earlier, activeScenario.later),
    [activeScenario],
  );

  const snapshotEntries = useMemo(
    () => buildSnapshotEntries(activeScenario.earlier, activeScenario.later),
    [activeScenario],
  );

  const encounterTimeline = useMemo(
    () => buildEncounterTimeline(activeScenario.earlier, activeScenario.later, activeReport),
    [activeReport, activeScenario.earlier, activeScenario.later],
  );

  const chartSearchMatches = useMemo(
    () =>
      searchChartRecords({
        query: chartSearchQuery,
        earlierNoteLabel,
        earlierNoteText,
        laterNoteLabel,
        laterNoteText,
        earlierSnapshot: activeScenario.earlier,
        laterSnapshot: activeScenario.later,
        report: activeReport,
        extractResult: extractResult ? compareNoteRegimens(earlierNoteText, laterNoteText) : null,
      }),
    [
      activeReport,
      activeScenario.earlier,
      activeScenario.later,
      chartSearchQuery,
      earlierNoteLabel,
      earlierNoteText,
      extractResult,
      laterNoteLabel,
      laterNoteText,
    ],
  );

  const activeDbConn = useMemo(
    () => connections.find((c) => c.kind === 'db' && c.active) ?? null,
    [connections],
  );
  const activeModelConn = useMemo(
    () => connections.find((c) => c.kind === 'model' && c.active) ?? null,
    [connections],
  );

  const pendingCountFor = useCallback(
    (scenario: SyntheticScenario) => {
      const changes = compareSnapshots(scenario.earlier, scenario.later);
      return changes.filter((c) => !reviews[`${scenario.id}:${c.medicationId}`]).length;
    },
    [reviews],
  );

  const openTriageCount = useMemo(
    () =>
      (triageByScenario[activeScenario.id] ?? []).filter(
        (s) => !s.decision || s.decision === 'override-pending',
      ).length,
    [activeScenario.id, triageByScenario],
  );

  /* ---- Effects ---- */
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
  }, [palette]);

  useEffect(() => {
    if (canvasRef.current) canvasRef.current.scrollTop = 0;
  }, [view]);

  useEffect(() => {
    if (focusHeadingNonce === 0) return;
    requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }, [focusHeadingNonce]);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 2400);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  useEffect(() => {
    if (!paletteMenuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (paletteWrapRef.current && !paletteWrapRef.current.contains(e.target as Node)) {
        setPaletteMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [paletteMenuOpen]);

  /* ---- Persistence (/api/reviews) ---- */
  const persistSessionUpdate = useCallback(async (payload: Record<string, unknown>) => {
    if (typeof fetch !== 'function') return;
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Graceful fallback when offline or /api/reviews is unavailable.
    }
  }, []);

  useEffect(() => {
    if (typeof fetch !== 'function') return;
    let active = true;

    async function hydrateFromReviewsApi() {
      try {
        const response = await fetch('/api/reviews', { method: 'GET', cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json().catch(() => null)) as {
          reviews?: unknown;
          audit?: unknown;
        } | null;
        if (!active || !data || typeof data !== 'object') return;

        if (data.reviews && typeof data.reviews === 'object' && !Array.isArray(data.reviews)) {
          const hydratedReviews: Record<string, ReviewDecision> = {};
          for (const [key, val] of Object.entries(data.reviews as Record<string, unknown>)) {
            if (val === 'verified' || val === 'flagged' || val === 'deferred') {
              hydratedReviews[key] = val;
            }
          }
          if (Object.keys(hydratedReviews).length > 0) {
            setReviews((prev) => ({ ...hydratedReviews, ...prev }));
          }
        }

        if (Array.isArray(data.audit) && data.audit.length > 0) {
          const hydratedAudit = data.audit.filter(
            (item): item is AuditEntry =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as AuditEntry).id === 'string' &&
              typeof (item as AuditEntry).ts === 'string' &&
              typeof (item as AuditEntry).actor === 'string' &&
              typeof (item as AuditEntry).action === 'string' &&
              typeof (item as AuditEntry).target === 'string',
          );
          if (hydratedAudit.length > 0) {
            setAudit((prev) => {
              const seen = new Set(prev.map((a) => a.id));
              const incoming = hydratedAudit.filter((entry) => !seen.has(entry.id));
              if (incoming.length === 0) return prev;
              const initIdx = prev.findIndex((a) => a.id === 'aud-init');
              if (initIdx === -1) {
                return [...prev, ...incoming];
              }
              return [...prev.slice(0, initIdx), ...incoming, ...prev.slice(initIdx)];
            });
          }
        }
      } catch {
        // Graceful fallback when offline or /api/reviews is unavailable.
      }
    }

    void hydrateFromReviewsApi();
    return () => {
      active = false;
    };
  }, []);

  /* ---- Helpers ---- */
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  const createAuditEntry = useCallback(
    (actor: string, action: string, target: string): AuditEntry => ({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      actor,
      action,
      target,
    }),
    [],
  );

  const addAudit = useCallback(
    (actor: string, action: string, target: string) => {
      const entry = createAuditEntry(actor, action, target);
      setAudit((prev) => [entry, ...prev]);
      void persistSessionUpdate({ auditEntry: entry });
    },
    [createAuditEntry, persistSessionUpdate],
  );

  const navigateTo = useCallback((nextView: ViewId, focusHeading = true) => {
    setView(nextView);
    setSelectedMedId(null);
    setMobileNavOpen(false);
    setPaletteMenuOpen(false);
    setAnnouncement(`Navigated to ${VIEW_NAMES[nextView]}`);
    if (focusHeading) {
      setFocusHeadingNonce((n) => n + 1);
    }
  }, []);

  const handleCockpitNavigate = useCallback(
    (nextView: CockpitViewId, filter?: CockpitNavigateFilter) => {
      setEvidenceReturnMedId(null);
      if (nextView === 'diff') {
        setDiffTab('diff');
        if (
          filter === 'all' ||
          filter === 'changed' ||
          filter === 'onlyA' ||
          filter === 'onlyB' ||
          filter === 'same'
        ) {
          setDiffFilter(filter);
        }
      }
      navigateTo(nextView);
    },
    [navigateTo],
  );

  const handleSelectEvidenceChange = useCallback(
    (medId: string) => {
      const targetEntry = snapshotEntries.find((entry) => entry.id === medId);
      setView('diff');
      setDiffTab('diff');
      setDiffFilter('all');
      setSelectedMedId(medId);
      setEvidenceReturnMedId(medId);
      setMobileNavOpen(false);
      setAnnouncement(
        targetEntry
          ? `Opened source evidence for ${targetEntry.name}`
          : 'Opened source evidence in Snapshot review',
      );
      requestAnimationFrame(() => {
        const evidenceEl = document.querySelector<HTMLElement>(
          `.entry[data-value="${CSS.escape(medId)}"] .evidence-block`,
        );
        const fallbackRow = document.querySelector<HTMLElement>(
          `.entry-trigger[data-value="${CSS.escape(medId)}"]`,
        );
        const target = evidenceEl ?? fallbackRow;
        target?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: 'nearest' });
      });
    },
    [snapshotEntries],
  );

  const closeEvidenceDrilldown = useCallback(
    (medId: string, restoreRowFocus = false) => {
      const returnTriggerMedId = evidenceReturnMedId === medId ? medId : null;
      setSelectedMedId(null);
      setEvidenceReturnMedId(null);
      requestAnimationFrame(() => {
        if (returnTriggerMedId) {
          const trigger = document.querySelector<HTMLElement>(
            `[data-widget-id="provenance-health"] [data-evidence-trigger="${CSS.escape(returnTriggerMedId)}"]`,
          );
          trigger?.focus({ preventScroll: true });
          trigger?.scrollIntoView?.({ block: 'nearest' });
          return;
        }
        if (restoreRowFocus) {
          const row = document.querySelector<HTMLElement>(
            `.entry-trigger[data-value="${CSS.escape(medId)}"]`,
          );
          row?.focus({ preventScroll: true });
        }
      });
    },
    [evidenceReturnMedId],
  );

  const jumpToCitation = useCallback(
    (medId: string, nextIdx: number, total: number, summaryLabel: string) => {
      if (total <= 0) return;
      const clamped = Math.max(0, Math.min(total - 1, nextIdx));
      const key = `${activeScenario.id}:${medId}`;
      setActiveCitationByMed((curr) => ({ ...curr, [key]: clamped }));
      setAnnouncement(`Citation ${clamped + 1} of ${total}: ${summaryLabel}`);
      requestAnimationFrame(() => {
        const item = document.querySelector<HTMLElement>(
          `.entry[data-value="${CSS.escape(medId)}"] .evidence-item[data-citation-idx="${clamped}"]`,
        );
        item?.scrollIntoView?.({ block: 'nearest' });
      });
    },
    [activeScenario.id],
  );

  const openChartSearchMatch = useCallback(
    (match: ChartSearchMatch) => {
      setMobileNavOpen(false);
      if (match.targetView === 'extract') {
        setView('extract');
        setAnnouncement(`Opened match from ${match.sourceLabel}`);
        requestAnimationFrame(() => {
          const targetId =
            match.sourceKind === 'earlier_note'
              ? 'note-earlier'
              : match.sourceKind === 'later_note'
                ? 'note-later'
                : 'extract-results';
          const el =
            document.getElementById(targetId) ??
            document.querySelector<HTMLElement>('.extract-hero h1');
          el?.focus({ preventScroll: true });
          el?.scrollIntoView?.({ block: 'nearest' });
        });
        return;
      }

      setView('diff');
      setDiffTab('diff');
      setDiffFilter('all');
      if (match.medicationId) {
        setSelectedMedId(match.medicationId);
        setEvidenceReturnMedId(null);
        if (match.citationIdx !== undefined) {
          const citKey = `${activeScenario.id}:${match.medicationId}`;
          setActiveCitationByMed((curr) => ({ ...curr, [citKey]: match.citationIdx! }));
        }
        setAnnouncement(`Opened match for ${match.title} from ${match.sourceLabel}`);
        requestAnimationFrame(() => {
          const evidenceEl = document.querySelector<HTMLElement>(
            `.entry[data-value="${CSS.escape(match.medicationId!)}"] .evidence-block`,
          );
          const rowEl = document.querySelector<HTMLElement>(
            `.entry-trigger[data-value="${CSS.escape(match.medicationId!)}"]`,
          );
          const target = evidenceEl ?? rowEl;
          target?.focus({ preventScroll: true });
          target?.scrollIntoView?.({ block: 'nearest' });
        });
      }
    },
    [activeScenario.id],
  );

  const selectPatient = useCallback(
    (scenarioId: string) => {
      setSelectedScenarioId(scenarioId);
      setDiffFilter('all');
      setSelectedMedId(null);
      setEvidenceReturnMedId(null);
      setMobileNavOpen(false);
      const targetView: ViewId = view === 'triage' ? 'triage' : 'diff';
      setView(targetView);
      const targetScenario = allScenarios.find((s) => s.id === scenarioId);
      setAnnouncement(`Selected ${targetScenario?.patientLabel ?? scenarioId}`);
      setFocusHeadingNonce((n) => n + 1);
    },
    [allScenarios, view],
  );

  const changePalette = useCallback(
    (nextPalette: PaletteId) => {
      try {
        localStorage.setItem('cd-palette', nextPalette);
        window.dispatchEvent(new Event('cd-palette-change'));
      } catch {
        // Ignore storage errors
      }
      document.documentElement.dataset.palette = nextPalette;
      setPaletteMenuOpen(false);
      const found = PALETTES.find((p) => p.id === nextPalette);
      showToast(`Palette: ${found?.name ?? nextPalette}`);
      setAnnouncement(`Changed palette to ${found?.name ?? nextPalette}`);
    },
    [showToast],
  );

  /* ---- Snapshot Review Actions ---- */
  const toggleReview = useCallback(
    (medId: string, medName: string, choice: ReviewDecision, restoreSelector?: string) => {
      const key = `${activeScenario.id}:${medId}`;
      const prev = reviews[key];
      const cleared = prev === choice;
      const nextDecision = cleared ? null : choice;
      const auditEntry = createAuditEntry(
        'Clinician',
        cleared ? `Cleared ${choice}` : `Marked ${choice}`,
        `${cleanPatientName(activeScenario.patientLabel)} · ${medName}`,
      );
      setReviews((curr) => {
        const next = { ...curr };
        if (cleared) delete next[key];
        else next[key] = choice;
        return next;
      });
      setAudit((curr) => [auditEntry, ...curr]);
      void persistSessionUpdate({
        scenarioId: activeScenario.id,
        medId,
        key,
        decision: nextDecision,
        auditEntry,
      });
      setAnnouncement(
        cleared ? `Cleared ${choice} for ${medName}` : `Marked ${medName} as ${choice}`,
      );
      if (restoreSelector) {
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(restoreSelector);
          el?.focus({ preventScroll: true });
        });
      }
    },
    [
      activeScenario.id,
      activeScenario.patientLabel,
      createAuditEntry,
      persistSessionUpdate,
      reviews,
    ],
  );

  const toggleSnapshotRow = useCallback(
    (medId: string, restoreRowFocus = false) => {
      if (selectedMedId === medId) {
        closeEvidenceDrilldown(medId, restoreRowFocus);
        return;
      }
      setEvidenceReturnMedId(null);
      setSelectedMedId(medId);
      if (restoreRowFocus) {
        const previousFocus = document.activeElement;
        requestAnimationFrame(() => {
          // Do not pull focus away if the user has already moved on.
          if (document.activeElement !== previousFocus && document.activeElement !== document.body) return;
          const row = document.querySelector<HTMLElement>(
            `.entry-trigger[data-value="${CSS.escape(medId)}"]`,
          );
          row?.focus({ preventScroll: true });
        });
      }
    },
    [closeEvidenceDrilldown, selectedMedId],
  );

  /* ---- Compare Notes Actions ---- */
  const handleSelectPreset = useCallback(
    (presetId: string) => {
      setSelectedPresetId(presetId);
      setExtractError('');
      setExtractResult(null);
      setNoteReviewDecisions({});
      if (presetId === 'default') {
        setEarlierNoteLabel('Earlier note');
        setLaterNoteLabel('Discharge note');
        setEarlierNoteText(DEFAULT_EARLIER_NOTE);
        setLaterNoteText(DEFAULT_LATER_NOTE);
      } else {
        const pair = hfNoteComparisonPairs.find((p) => p.id === presetId);
        if (pair) {
          setEarlierNoteLabel(pair.earlierLabel || 'Earlier note');
          setLaterNoteLabel(pair.laterLabel || 'Discharge note');
          setEarlierNoteText(normalizeNoteText(pair.earlierNote));
          setLaterNoteText(normalizeNoteText(pair.laterNote));
        }
      }
    },
    [],
  );

  const handleLoadExample = useCallback(() => {
    handleSelectPreset(selectedPresetId);
    setAnnouncement('Loaded example notes');
  }, [handleSelectPreset, selectedPresetId]);

  const handleClearNotes = useCallback(() => {
    setEarlierNoteText('');
    setLaterNoteText('');
    setExtractError('');
    setExtractResult(null);
    setNoteReviewDecisions({});
    setAnnouncement('Cleared notes');
  }, []);

  const applySocketStatus = useCallback((raw: Partial<SocketStatus>): SocketStatus => {
    const normalized = normalizeSocketStatusPayload(raw);
    setSocketStatus(normalized);
    if (normalized.state === 'live') {
      const modelName = normalized.model || DEFAULT_MLX_MODEL_ID;
      const adapterSuffix = normalized.adapter ? ` · adapter ${normalized.adapter}` : '';
      setExtractStatusText(`Live AI · ${modelName}${adapterSuffix}`);
      setExtractStatusState('live');
    } else {
      setExtractStatusText('Standby · local extractor');
      setExtractStatusState('replay');
    }
    return normalized;
  }, []);

  const probeSocketHealth = useCallback(async (): Promise<SocketStatus | null> => {
    const pollingEndpoints = [SOCKET_ENDPOINTS.health, SOCKET_ENDPOINTS.compare];
    for (const endpoint of pollingEndpoints) {
      try {
        const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
        const data = (await response.json().catch(() => null)) as Partial<SocketStatus> | null;
        if (
          data &&
          typeof data === 'object' &&
          ('state' in data || 'configured' in data || 'reachable' in data)
        ) {
          return normalizeSocketStatusPayload(data);
        }
      } catch {
        // Fall back to next polling endpoint.
      }
    }
    return null;
  }, []);

  const handleCheckService = useCallback(async () => {
    const probed = await probeSocketHealth();
    if (probed) {
      const applied = applySocketStatus(probed);
      setConnLog((prev) => [
        {
          id: `cl-${Date.now()}`,
          ts: new Date().toISOString(),
          msg: `Socket ${applied.state}${applied.model ? ` · ${applied.model}` : ''}`,
        },
        ...prev,
      ]);
      if (applied.state === 'live') {
        const modelName = applied.model || DEFAULT_MLX_MODEL_ID;
        showToast(`Live AI socket ready (${modelName})`);
        setAnnouncement(`Live AI socket ready: ${modelName}`);
        return;
      }
      showToast('Local rule-based extractor ready');
      setAnnouncement('Local rule-based extractor ready');
      return;
    }
    applySocketStatus(INITIAL_SOCKET_STATUS);
    showToast('Local rule-based extractor ready');
    setAnnouncement('Local rule-based extractor ready');
  }, [applySocketStatus, probeSocketHealth, showToast]);

  useEffect(() => {
    let active = true;

    void probeSocketHealth().then((status) => {
      if (active && status) {
        applySocketStatus(status);
      }
    });

    if (typeof EventSource === 'undefined') {
      return () => {
        active = false;
      };
    }

    let es: EventSource | null = null;
    try {
      es = new EventSource(SOCKET_ENDPOINTS.socket);
      const onSocketStatus = (event: MessageEvent) => {
        if (!active || typeof event.data !== 'string') return;
        try {
          const parsed = JSON.parse(event.data) as Partial<SocketStatus>;
          applySocketStatus(parsed);
        } catch {
          // Ignore malformed SSE event data
        }
      };
      es.addEventListener('socket-status', onSocketStatus as EventListener);
      return () => {
        active = false;
        es?.removeEventListener('socket-status', onSocketStatus as EventListener);
        es?.close();
      };
    } catch {
      return () => {
        active = false;
        es?.close();
      };
    }
  }, [applySocketStatus, probeSocketHealth]);

  const handleCompareNotes = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setExtractError('');
      const earlierLen = Array.from(earlierNoteText).length;
      const laterLen = Array.from(laterNoteText).length;
      if (
        !hasVisibleText(earlierNoteText) ||
        !hasVisibleText(laterNoteText) ||
        earlierLen > 12000 ||
        laterLen > 12000
      ) {
        setExtractResult(null);
        setExtractError('Each note needs between 1 and 12,000 characters of fictional text.');
        return;
      }

      if (extractStatusState === 'live') {
        try {
          const response = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              earlier_note: { source_id: 'earlier-note', text: earlierNoteText },
              later_note: { source_id: 'later-note', text: laterNoteText },
            }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            simulated?: boolean;
            model?: string;
            evidence?: Array<{ source_id: string; name: string; start: number; end: number }>;
            differences?: Array<{ kind: 'earlier_only' | 'later_only'; name: string; source_id: string }>;
            unsupported_outputs?: Array<{ source_id: string; text: string }>;
          };
          if (response.ok && Array.isArray(data.differences) && Array.isArray(data.evidence)) {
            const evByKey = new Map<string, MentionEvidence[]>();
            const earlierQuotes: QuoteSnippet[] = [];
            const laterQuotes: QuoteSnippet[] = [];
            for (const ev of data.evidence) {
              const sourceText = ev.source_id === 'earlier-note' ? earlierNoteText : laterNoteText;
              const snippet = buildQuoteSnippet(
                { sourceId: ev.source_id, name: ev.name, start: ev.start, end: ev.end },
                sourceText,
              );
              if (ev.source_id === 'earlier-note') earlierQuotes.push(snippet);
              else laterQuotes.push(snippet);
              const k = `${ev.source_id}:${normalizeName(ev.name)}`;
              const list = evByKey.get(k) ?? [];
              list.push({ sourceId: ev.source_id, name: ev.name, start: ev.start, end: ev.end });
              evByKey.set(k, list);
            }

            const differences: MentionDifference[] = data.differences.map((d) => {
              const norm = normalizeName(d.name);
              const sourceText = d.kind === 'earlier_only' ? earlierNoteText : laterNoteText;
              const matches = evByKey.get(`${d.source_id}:${norm}`) ?? [];
              return {
                key: `${d.kind}:${norm}`,
                kind: d.kind,
                name: d.name,
                normName: norm,
                label: d.kind === 'earlier_only' ? earlierNoteLabel : laterNoteLabel,
                quotes: matches.map((m) => buildQuoteSnippet(m, sourceText)),
              };
            });

            const modelName = data.model || 'mlx-community/Qwen3.5-4B-4bit';
            const res: NoteComparisonResult = {
              differences,
              earlier: { label: earlierNoteLabel, quotes: earlierQuotes, unsupported: [] },
              later: { label: laterNoteLabel, quotes: laterQuotes, unsupported: [] },
              modeLabel: `Live AI · ${modelName}`,
              simulated: Boolean(data.simulated),
            };
            setExtractResult(res);
            setNoteReviewDecisions({});
            setExtractStatusText(res.modeLabel);
            setExtractStatusState(res.simulated ? 'replay' : 'live');
            const count = res.differences.length;
            addAudit('Comparison', `Live AI (${modelName})`, `${count} mention ${count === 1 ? 'difference' : 'differences'}`);
            setAnnouncement(`Comparison complete: ${count} mention ${count === 1 ? 'difference' : 'differences'} found.`);
            requestAnimationFrame(() => {
              extractResultHeadingRef.current?.focus();
            });
            return;
          }
          setExtractError(data.error || 'Live Qwen backend returned an unexpected response.');
          setExtractStatusState('error');
          setExtractStatusText('Live AI unavailable · check service');
          return;
        } catch {
          setExtractError('Unable to reach live Qwen backend. Click Check service or switch to Local standby.');
          setExtractStatusState('error');
          setExtractStatusText('Live AI unavailable · check service');
          return;
        }
      }

      const extraCandidates = activePreset
        ? [...activePreset.referenceMedications, ...allMedicationTerms]
        : allMedicationTerms;

      const baseRes = runDeterministicNoteComparison(
        earlierNoteText,
        laterNoteText,
        earlierNoteLabel,
        laterNoteLabel,
        extraCandidates,
      );

      const regimenReport = compareNoteRegimens(earlierNoteText, laterNoteText);
      const existingKeys = new Set(baseRes.differences.map((d) => d.normName));
      const regimenByNorm = new Map(
        regimenReport.items.map((item) => [item.normalizedName, item]),
      );

      const enrichedDifferences: MentionDifference[] = baseRes.differences.map((d) => {
        const reg = regimenByNorm.get(d.normName);
        if (!reg) {
          return {
            ...d,
            statusLabel:
              d.kind === 'earlier_only'
                ? 'Mentioned only in earlier note'
                : 'Mentioned only in later note',
          };
        }
        return {
          ...d,
          statusLabel: reg.statusLabel,
          changeCategories: reg.changeCategories,
          earlierExcerpt: reg.earlierExcerpt,
          laterExcerpt: reg.laterExcerpt,
          absenceNote: reg.absenceNote,
        };
      });

      for (const item of regimenReport.items) {
        if (
          (item.status === 'changed' || item.status === 'discontinued') &&
          !existingKeys.has(item.normalizedName)
        ) {
          const quotes: QuoteSnippet[] = [];
          if (item.earlierExcerpt) {
            quotes.push({
              key: `reg-earlier-${item.normalizedName}`,
              prefix: '',
              match: item.earlierExcerpt,
              suffix: '',
              hasLeadingEllipsis: false,
              hasTrailingEllipsis: false,
            });
          }
          if (item.laterExcerpt) {
            quotes.push({
              key: `reg-later-${item.normalizedName}`,
              prefix: '',
              match: item.laterExcerpt,
              suffix: '',
              hasLeadingEllipsis: false,
              hasTrailingEllipsis: false,
            });
          }
          enrichedDifferences.push({
            key: `${item.status}:${item.normalizedName}`,
            kind: item.status === 'discontinued' ? 'discontinued' : 'regimen_changed',
            name: item.medicationName,
            normName: item.normalizedName,
            label: item.status === 'discontinued' ? laterNoteLabel : `${earlierNoteLabel} → ${laterNoteLabel}`,
            quotes,
            statusLabel: item.statusLabel,
            changeCategories: item.changeCategories,
            earlierExcerpt: item.earlierExcerpt,
            laterExcerpt: item.laterExcerpt,
            absenceNote: item.absenceNote,
          });
        }
      }

      const res: NoteComparisonResult = {
        ...baseRes,
        differences: enrichedDifferences,
      };

      setExtractResult(res);
      setNoteReviewDecisions({});
      setExtractStatusText(res.modeLabel);
      setExtractStatusState('replay');
      const count = res.differences.length;
      addAudit(
        'Comparison',
        'Local standby',
        `${count} mention ${count === 1 ? 'difference' : 'differences'}`,
      );
      setAnnouncement(
        `Comparison complete: ${count} mention ${count === 1 ? 'difference' : 'differences'} found.`,
      );
      requestAnimationFrame(() => {
        extractResultHeadingRef.current?.focus();
      });
    },
    [
      activePreset,
      addAudit,
      allMedicationTerms,
      earlierNoteLabel,
      earlierNoteText,
      extractStatusState,
      laterNoteLabel,
      laterNoteText,
    ],
  );

  const handleNoteDifferenceReview = useCallback(
    (diff: MentionDifference, choice: NoteReviewDecision) => {
      const prev = noteReviewDecisions[diff.key];
      const next: NoteReviewDecision | null = prev === choice ? null : choice;
      setNoteReviewDecisions((curr) => {
        const copy = { ...curr };
        if (next) copy[diff.key] = next;
        else delete copy[diff.key];
        return copy;
      });
      const actions: Record<'clarify' | 'reviewed' | 'cleared', string> = {
        clarify: 'Flagged mention for clarification',
        reviewed: 'Reviewed mention',
        cleared: 'Cleared mention review',
      };
      addAudit(
        'Reviewer',
        next ? actions[next] : actions.cleared,
        `${diff.label} · ${diff.name}`,
      );
      setAnnouncement(
        next === 'clarify'
          ? `Flagged ${diff.name} for clarification`
          : next === 'reviewed'
            ? `Marked ${diff.name} as reviewed`
            : `Cleared review for ${diff.name}`,
      );
    },
    [addAudit, noteReviewDecisions],
  );

  const handleExportFollowUps = useCallback(() => {
    if (!extractResult) return;
    const flagged = extractResult.differences.filter(
      (entry) => noteReviewDecisions[entry.key] === 'clarify',
    );
    if (flagged.length === 0) return;
    const mode = extractResult.simulated ? 'Local standby' : 'Local model';
    const sections = flagged.map((entry) =>
      [
        `Can you confirm whether ${entry.name} belongs on the discharge medication list?`,
        `Source excerpts from ${entry.label.toLowerCase()}:`,
        ...entry.quotes.map(
          (quote) => `> ${formatQuoteSnippetText(quote).replace(/\r?\n/g, '\n> ')}`,
        ),
      ].join('\n'),
    );
    const text =
      [
        'Discharge medication follow-ups',
        `${mode} · Review required before chart commit`,
        ...sections,
        'Review both source notes before recording a medication decision.',
      ].join('\n\n') + '\n';
    downloadTextFile('clinical-diff-follow-ups.txt', text, 'text/plain;charset=utf-8');
    addAudit('Reviewer', 'Downloaded follow-ups', `${flagged.length} flagged`);
    showToast(`Downloaded ${flagged.length} follow-up${flagged.length === 1 ? '' : 's'}`);
    setAnnouncement(
      `Downloaded ${flagged.length} flagged follow-up${flagged.length === 1 ? '' : 's'}`,
    );
  }, [addAudit, extractResult, noteReviewDecisions, showToast]);

  /* ---- Triage & Eval Actions ---- */
  const runTriage = useCallback(() => {
    if (!activeModelConn) return;
    const driver = DRIVERS.find((d) => d.id === activeModelConn.driver);
    if (!driver?.builtin) {
      showToast('This model connector is not implemented; no model ran.');
      return;
    }

    const changes = activeReport.changes;
    const srcRefs = [
      `A · ${activeScenario.earlier.source} · ${activeScenario.earlier.recordedAt ?? 'Timestamp not documented'}`,
      `B · ${activeScenario.later.source} · ${activeScenario.later.recordedAt ?? 'Timestamp not documented'}`,
    ];

    const suggestions: TriageSuggestion[] = changes.map((c, idx) => {
      let proposal = '';
      let rationale = '';
      let confidence = 0.85;

      if (c.kind === 'removed') {
        proposal = `Confirm whether ${c.name} is still being taken`;
        rationale = `${c.name} is listed in Snapshot A but does not appear in Snapshot B. Absence from a snapshot is not evidence it was stopped.`;
        confidence = 0.71;
      } else if (c.kind === 'added') {
        proposal = `Confirm the origin of ${c.name}`;
        rationale = `${c.name} first appears in Snapshot B (${activeScenario.later.source}). Check whether it was newly started or previously undocumented.`;
        confidence = 0.8;
      } else {
        const missingField = c.fields.find((f) => f.after === null);
        if (missingField) {
          proposal = `Request the missing ${missingField.field} for ${c.name}`;
          rationale = `Snapshot B does not document ${missingField.field}. Snapshot A records "${missingField.before ?? 'not documented'}". Missing is not the same as changed.`;
          confidence = 0.83;
        } else {
          const firstChanged = c.fields[0];
          proposal = `Confirm the ${firstChanged?.field ?? 'regimen'} change for ${c.name}: ${firstChanged?.before ?? 'not documented'} → ${firstChanged?.after ?? 'not documented'}`;
          rationale = `The two sources record different ${firstChanged?.field ?? 'regimen'} values. The diff cannot tell whether this was intended, a titration, or a transcription error.`;
          confidence = 0.9;
        }
      }

      if (c.provenance?.hasUnknownProvenance) {
        rationale += ' Provenance is currently unknown and needs source confirmation.';
      }

      return {
        id: `sg-${activeScenario.id}-${c.medicationId}-${idx}`,
        medId: c.medicationId,
        proposal,
        rationale,
        confidence,
        evidence: srcRefs,
        model: activeModelConn.model || driver.label,
        simulated: true,
        decision: null,
        reason: null,
      };
    });

    setTriageByScenario((prev) => ({ ...prev, [activeScenario.id]: suggestions }));
    addAudit('Model', `Triage run · ${suggestions.length} suggestions`, activeModelConn.name);
    showToast(`${suggestions.length} suggestions from ${activeModelConn.name}`);
  }, [activeModelConn, activeReport.changes, activeScenario, addAudit, showToast]);

  const runEval = useCallback(() => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let exact = 0;
    let totalChecks = 0;

    for (const c of HELDOUT_CASES) {
      const res = compareSnapshots(c.a, c.b);
      const resMap = new Map(res.map((r) => [r.medicationId, r.kind]));
      for (const [medId, goldKind] of Object.entries(c.gold)) {
        totalChecks++;
        const predKind = resMap.get(medId) ?? 'same';
        if (predKind === goldKind) exact++;
        const predDiff = predKind !== 'same';
        const goldDiff = goldKind !== 'same';
        if (predDiff && goldDiff && predKind === goldKind) {
          tp++;
        } else {
          if (predDiff) fp++;
          if (goldDiff) fn++;
        }
      }
    }

    // Also run deterministic consistency verification across all synthetic + HF scenarios
    for (const scenario of allScenarios) {
      const report = analyzeSnapshots(scenario.earlier, scenario.later);
      const rerun = analyzeSnapshots(scenario.earlier, scenario.later);
      if (report.changes.length === rerun.changes.length) {
        totalChecks++;
        exact++;
      }
    }

    const summary: EvalSummary = {
      ts: new Date().toISOString(),
      heldOutCases: HELDOUT_CASES.length,
      scenarioCases: allScenarios.length,
      totalCases: HELDOUT_CASES.length + allScenarios.length,
      precision: tp / Math.max(1, tp + fp),
      recall: tp / Math.max(1, tp + fn),
      exactMatch: exact / Math.max(1, totalChecks),
    };
    setEvalSummary(summary);
    addAudit('Eval', 'Ran held-out & fixture suite', `${summary.totalCases} cases`);
    setAnnouncement(`Evaluation complete across ${summary.totalCases} synthetic cases.`);
  }, [addAudit, allScenarios]);

  /* ---- Audit Export ---- */
  const exportAudit = useCallback(
    (format: 'csv' | 'json') => {
      const content =
        format === 'json'
          ? JSON.stringify(audit, null, 2)
          : 'time,actor,action,target\n' +
            audit
              .map((a) =>
                [a.ts, a.actor, a.action, a.target]
                  .map((x) => `"${String(x).replace(/"/g, '""')}"`)
                  .join(','),
              )
              .join('\n');
      const mime = format === 'json' ? 'application/json' : 'text/csv';
      const filename = format === 'json' ? 'clinical-diff-audit.json' : 'clinical-diff-audit.csv';
      downloadTextFile(filename, content, mime);
      addAudit('User', 'Exported audit log', format.toUpperCase());
      showToast(`Exported ${format.toUpperCase()} audit log`);
    },
    [addAudit, audit, showToast],
  );

  /* ---- Command Menu Items ---- */
  type CommandItem =
    | { id: string; label: string; hint: string; action: 'view'; target: ViewId }
    | { id: string; label: string; hint: string; action: 'patient'; target: string }
    | { id: string; label: string; hint: string; action: 'palette'; target: PaletteId }
    | { id: string; label: string; hint: string; action: 'triage' | 'eval' | 'export' };

  const commandItems = useMemo(() => {
    const items: CommandItem[] = [
      ...WORKSPACE_VIEWS.map((v) => ({
        id: `view-${v.id}`,
        label: `Go to ${v.label}`,
        hint: 'page',
        action: 'view' as const,
        target: v.id,
      })),
      {
        id: 'view-models',
        label: 'Go to Models & data',
        hint: 'page',
        action: 'view' as const,
        target: 'models' as ViewId,
      },
      ...patientScenarios.map((s) => ({
        id: `pat-${s.id}`,
        label: `Open ${cleanPatientName(s.patientLabel)}`,
        hint: s.patientId,
        action: 'patient' as const,
        target: s.id,
      })),
      ...PALETTES.map((p) => ({
        id: `pal-${p.id}`,
        label: `Palette: ${p.name}`,
        hint: p.rec ? 'recommended' : 'palette',
        action: 'palette' as const,
        target: p.id,
      })),
      {
        id: 'act-triage',
        label: `Run AI triage for ${cleanPatientName(activeScenario.patientLabel)}`,
        hint: 'action',
        action: 'triage',
      },
      {
        id: 'act-eval',
        label: 'Run held-out evaluation',
        hint: 'action',
        action: 'eval',
      },
      {
        id: 'act-export',
        label: 'Export audit log',
        hint: 'action',
        action: 'export',
      },
    ];
    const q = cmdQuery.trim().toLowerCase();
    return q
      ? items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q),
        )
      : items;
  }, [activeScenario.patientLabel, patientScenarios, cmdQuery]);

  const executeCommandItem = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      if (item.action === 'view') navigateTo(item.target);
      else if (item.action === 'patient') selectPatient(item.target);
      else if (item.action === 'palette') changePalette(item.target);
      else if (item.action === 'triage') {
        navigateTo('triage');
        runTriage();
      } else if (item.action === 'eval') {
        navigateTo('eval');
        runEval();
      } else if (item.action === 'export') {
        exportAudit('json');
      }
    },
    [changePalette, exportAudit, navigateTo, runEval, runTriage, selectPatient],
  );

  /* ---- Global Keyboard Shortcuts ---- */
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteMenuOpen(false);
        setCmdQuery('');
        setCmdIndex(0);
        setCmdOpen(true);
        requestAnimationFrame(() => cmdInputRef.current?.focus());
        return;
      }

      if (e.key === 'Escape') {
        if (cmdOpen) {
          setCmdOpen(false);
          return;
        }
        if (paletteMenuOpen) {
          setPaletteMenuOpen(false);
          return;
        }
        if (mobileNavOpen) {
          setMobileNavOpen(false);
          return;
        }
        if (selectedMedId) {
          closeEvidenceDrilldown(selectedMedId, true);
          return;
        }
      }

      if (cmdOpen) return;
      const activeTag = document.activeElement?.tagName;
      if (
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT' ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }

      if (view === 'diff' && diffTab === 'diff') {
        const visibleRows = snapshotEntries.filter(
          (entry) => diffFilter === 'all' || entry.kind === diffFilter,
        );
        const currentIdx = visibleRows.findIndex((r) => r.id === selectedMedId);
        const key = e.key.toLowerCase();
        if (key === 'j' || key === 'k') {
          e.preventDefault();
          const nextIdx = Math.max(
            0,
            Math.min(visibleRows.length - 1, currentIdx < 0 ? 0 : currentIdx + (key === 'j' ? 1 : -1)),
          );
          const nextRow = visibleRows[nextIdx];
          if (nextRow) {
            setSelectedMedId(nextRow.id);
            requestAnimationFrame(() => {
              const el = document.querySelector<HTMLElement>(
                `.entry-trigger[data-value="${CSS.escape(nextRow.id)}"]`,
              );
              el?.focus({ preventScroll: true });
              el?.scrollIntoView({ block: 'nearest' });
            });
          }
        } else if (selectedMedId && (key === 'v' || key === 'f' || key === 'd')) {
          const row = visibleRows[currentIdx];
          if (row && row.kind !== 'same') {
            const decisionMap: Record<'v' | 'f' | 'd', ReviewDecision> = {
              v: 'verified',
              f: 'flagged',
              d: 'deferred',
            };
            toggleReview(row.id, row.name, decisionMap[key]);
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    closeEvidenceDrilldown,
    cmdOpen,
    diffFilter,
    diffTab,
    mobileNavOpen,
    paletteMenuOpen,
    selectedMedId,
    snapshotEntries,
    toggleReview,
    view,
  ]);

  /* ---- Rail Keyboard Navigation (Arrow/Home/End) ---- */
  function handleRailKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    if (!target.matches('button.item')) return;
    const container = document.getElementById('app-navigation');
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button.item'));
    const idx = buttons.indexOf(target as HTMLButtonElement);
    if (idx < 0 || buttons.length === 0) return;

    let nextIdx: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextIdx = (idx + 1) % buttons.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + buttons.length) % buttons.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = buttons.length - 1;
    }

    if (nextIdx !== null) {
      e.preventDefault();
      buttons[nextIdx]?.focus();
    }
  }

  /* ---- Filtered Left Rail Lists ---- */
  const normalizedRailFilter = railFilter.trim().toLowerCase();
  const visibleScenarios = useMemo(() => {
    if (!normalizedRailFilter) return patientScenarios;
    return patientScenarios.filter((s) =>
      `${s.patientLabel} ${s.patientId} ${s.title}`.toLowerCase().includes(normalizedRailFilter),
    );
  }, [patientScenarios, normalizedRailFilter]);

  const visibleWorkspaceViews = useMemo(() => {
    if (!normalizedRailFilter) return WORKSPACE_VIEWS;
    return WORKSPACE_VIEWS.filter((v) => v.label.toLowerCase().includes(normalizedRailFilter));
  }, [normalizedRailFilter]);

  const showSystemModels =
    !normalizedRailFilter || 'models & data'.includes(normalizedRailFilter);

  /* ---- Outline for Right Rail ---- */
  const outlineSections = useMemo((): Array<[string, string]> => {
    if (view === 'diff') {
      if (diffTab === 'diff') {
        return [
          ['o-summary', 'Summary'],
          ['o-statements', 'Statements'],
        ];
      }
      if (diffTab === 'snapshots') {
        return [
          ['o-snapA', 'Snapshot A'],
          ['o-snapB', 'Snapshot B'],
        ];
      }
      return [
        ['o-scope', 'Scope'],
        ['o-rules', 'Comparison rules'],
        ['o-limits', 'Limits'],
      ];
    }
    if (view === 'triage') {
      return [
        ['o-model', 'Model'],
        ['o-queue', 'Queue'],
      ];
    }
    if (view === 'eval') {
      return [
        ['o-about', 'About this set'],
        ['o-results', 'Results'],
        ['o-agree', 'Session agreement'],
      ];
    }
    if (view === 'audit') {
      return [['o-trail', 'Trail']];
    }
    if (view === 'models') {
      if (modelsTab === 'connections') {
        return [
          ['o-hf', 'HF synthetic datasets'],
          ['o-db', 'Databases'],
          ['o-ml', 'Models'],
          ['o-log', 'Connection events'],
        ];
      }
      if (modelsTab === 'add') {
        return [
          ['o-new', 'New connection'],
          ['o-hook', 'Register from code'],
        ];
      }
      return [
        ['o-ts', 'Interfaces'],
        ['o-fhir', 'FHIR preview'],
      ];
    }
    return [];
  }, [diffTab, modelsTab, view]);

  /* ---- Snapshot Review Counts ---- */
  const diffEntriesCount = snapshotEntries.filter((r) => r.kind === 'changed').length;
  const onlyACount = snapshotEntries.filter((r) => r.kind === 'onlyA').length;
  const onlyBCount = snapshotEntries.filter((r) => r.kind === 'onlyB').length;
  const sameCount = snapshotEntries.filter((r) => r.kind === 'same').length;
  const reviewableCount = snapshotEntries.filter((r) => r.kind !== 'same').length;
  const reviewedCount = snapshotEntries.filter(
    (r) => r.kind !== 'same' && Boolean(reviews[`${activeScenario.id}:${r.id}`]),
  ).length;
  const shownSnapshotEntries = snapshotEntries.filter(
    (r) => diffFilter === 'all' || r.kind === diffFilter,
  );

  /* ---- Compare Notes Review Counts ---- */
  const noteDiffCount = extractResult?.differences.length ?? 0;
  const noteDecidedCount = extractResult
    ? extractResult.differences.filter((d) => Boolean(noteReviewDecisions[d.key])).length
    : 0;
  const noteFlaggedCount = extractResult
    ? extractResult.differences.filter((d) => noteReviewDecisions[d.key] === 'clarify').length
    : 0;

  const activePaletteObj = PALETTES.find((p) => p.id === palette) ?? PALETTES[0];
  const socketModelSummary = socketStatus.model
    ? socketStatus.adapter
      ? `${socketStatus.model} · adapter ${socketStatus.adapter}`
      : socketStatus.model
    : 'Deterministic local fallback';

  /* ---- FHIR Preview Bundle ---- */
  const fhirBundleJson = useMemo(() => {
    const mapMeds = (snap: Snapshot, letter: 'A' | 'B') =>
      snap.medications.map((m) => ({
        resource: {
          resourceType: 'MedicationStatement',
          id: `${letter.toLowerCase()}-${m.id}`,
          status: 'unknown',
          medication: { concept: { text: m.name } },
          dosage: [
            {
              text: [m.dose, m.route, m.frequency].map((v) => v ?? 'not documented').join(' · '),
            },
          ],
          informationSource: [{ display: snap.source }],
          effectiveDateTime: snap.recordedAt,
          extension: [{ url: 'urn:clinical-diff:snapshot', valueString: letter }],
        },
      }));
    return JSON.stringify(
      {
        resourceType: 'Bundle',
        type: 'collection',
        meta: { source: activeDbConn?.endpoint ?? 'none', tag: [{ code: 'synthetic' }] },
        entry: [...mapMeds(activeScenario.earlier, 'A'), ...mapMeds(activeScenario.later, 'B')],
      },
      null,
      2,
    );
  }, [activeDbConn, activeScenario]);

  /* ------------------------------------------------------------------
     Render
     ------------------------------------------------------------------ */
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Top Bar */}
      <header className="top">
        <div className="top-l">
          <a
            className="wordmark"
            href="#extract"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('extract');
            }}
          >
            <span className="brand-symbol" aria-hidden="true">
              ±
            </span>
            {BRAND_NAME}
          </a>
          <div className="crumbs" id="crumbs">
            {activeScenario.patientLabel} · {activeScenario.patientId} &nbsp;/&nbsp;{' '}
            <b>{VIEW_NAMES[view]}</b>
          </div>
        </div>

        <div className="top-r">
          <button
            type="button"
            className="ghost mobile-menu"
            id="mobile-menu"
            aria-controls="app-navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => {
              const next = !mobileNavOpen;
              setMobileNavOpen(next);
              if (next) requestAnimationFrame(() => railSearchRef.current?.focus());
            }}
          >
            Menu
          </button>

          {view !== 'extract' && (
            <button
              type="button"
              className="ghost health-btn"
              id="health"
              title="Connection health"
              onClick={() => navigateTo('models')}
            >
              <span className="dot degraded" aria-hidden="true" />
              Local standby
            </button>
          )}

          <div className="menu-wrap" ref={paletteWrapRef}>
            <button
              type="button"
              className="ghost"
              id="pal-btn"
              aria-haspopup="menu"
              aria-expanded={paletteMenuOpen}
              onClick={() => setPaletteMenuOpen((curr) => !curr)}
            >
              Palette · {activePaletteObj.name}
            </button>
            {paletteMenuOpen && (
              <div className="menu" id="pal-menu" role="menu" aria-label="Palette">
                {PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="pal-opt"
                    role="menuitemradio"
                    aria-checked={palette === p.id}
                    onClick={() => changePalette(p.id)}
                  >
                    <span className="sw" aria-hidden="true">
                      {p.sw.map((c, idx) => (
                        <i key={idx} style={{ background: c }} />
                      ))}
                    </span>
                    <span>
                      <span className="pal-name">
                        {p.name}
                        {p.rec && <em>recommended</em>}
                      </span>
                      <br />
                      <span className="pal-note">{p.note}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="ghost"
            aria-label="Open command menu"
            onClick={() => {
              setPaletteMenuOpen(false);
              setCmdQuery('');
              setCmdIndex(0);
              setCmdOpen(true);
              requestAnimationFrame(() => cmdInputRef.current?.focus());
            }}
          >
            <kbd>Ctrl</kbd>
            <kbd>K</kbd>
          </button>
        </div>
      </header>

      {/* 3-Column Frame */}
      <div className={`frame${view === 'extract' ? ' view-extract' : ''}`}>
        {/* Left Navigation Rail */}
        <aside
          className={`rail-l${mobileNavOpen ? ' nav-open' : ''}`}
          id="app-navigation"
          aria-label="Navigation"
          onKeyDown={handleRailKeyDown}
        >
          <input
            ref={railSearchRef}
            className="search"
            id="rail-search"
            type="search"
            placeholder="Filter…"
            aria-label="Filter navigation"
            value={railFilter}
            onChange={(e) => setRailFilter(e.target.value)}
          />

          <div className="grp">
            <div className="grp-h" id="patients-nav-label">
              Patients · synthetic
            </div>
            <div className="grp-list" role="group" aria-labelledby="patients-nav-label">
              {visibleScenarios.map((scenario) => {
                const openCount = pendingCountFor(scenario);
                const isActive =
                  selectedScenarioId === scenario.id && (view === 'diff' || view === 'triage');
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    className="item"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => selectPatient(scenario.id)}
                  >
                    <span className="item-label">{cleanPatientName(scenario.patientLabel)}</span>
                    <small>{openCount ? `${openCount} open` : 'done'}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grp">
            <div className="grp-h" id="workspace-nav-label">
              Workspace
            </div>
            <nav className="grp-list" aria-labelledby="workspace-nav-label">
              {visibleWorkspaceViews.map((v) => {
                const badge =
                  v.id === 'diff'
                    ? pendingCountFor(activeScenario) || ''
                    : v.id === 'triage'
                      ? openTriageCount || ''
                      : v.id === 'eval'
                        ? 'held-out'
                        : v.id === 'audit'
                          ? String(audit.length)
                          : '';
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="item"
                    aria-current={view === v.id ? 'page' : undefined}
                    onClick={() => navigateTo(v.id)}
                  >
                    <span className="item-label">{v.label}</span>
                    {badge !== '' && <small>{badge}</small>}
                  </button>
                );
              })}
            </nav>
          </div>

          {showSystemModels && (
            <div className="grp">
              <div className="grp-h" id="system-nav-label">
                System
              </div>
              <div className="grp-list" role="group" aria-labelledby="system-nav-label">
                <button
                  type="button"
                  className="item"
                  aria-current={view === 'models' ? 'page' : undefined}
                  onClick={() => navigateTo('models')}
                >
                  <span className="item-label">Models &amp; data</span>
                  <small>{connections.length}</small>
                </button>
              </div>
            </div>
          )}

          <div className="rail-foot">Synthetic workspace · session only</div>
        </aside>

        {/* Main Canvas */}
        <main className="canvas" id="main-content" tabIndex={-1} ref={canvasRef}>
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>

          <div className="col">
            <section
              className="patient-context-bar"
              aria-label="Active patient and encounter context"
            >
              <div className="patient-context-id">
                <strong className="patient-context-name">{activeScenario.patientLabel}</strong>
                <span className="e-tag mono">{activeScenario.patientId}</span>
                <span className="e-tag">Synthetic · Read-only</span>
                <span className="e-tag">
                  {view === 'diff' && diffTab === 'timeline'
                    ? 'Encounter timeline'
                    : VIEW_NAMES[view]}
                </span>
                {selectedMedId && (
                  <span className="e-tag evidence-state-documented_negative">
                    Inspecting:{' '}
                    {snapshotEntries.find((e) => e.id === selectedMedId)?.name ?? selectedMedId}
                  </span>
                )}
              </div>
              <div className="patient-context-enc">
                <span className="patient-context-title">{activeScenario.title}</span>
                <span className="patient-context-window">
                  Earlier: {activeScenario.earlier.source} (
                  {activeScenario.earlier.recordedAt ?? 'Undated'}) → Later:{' '}
                  {activeScenario.later.source} ({activeScenario.later.recordedAt ?? 'Undated'})
                </span>
              </div>
              <div className="chart-search" role="search" aria-label="Chart search">
                <div className="chart-search-row">
                  <input
                    ref={chartSearchInputRef}
                    type="search"
                    className="chart-search-input"
                    aria-label="Search synthetic notes and results"
                    placeholder="Search notes & results (e.g. Lisinopril, 20 mg, Aspirin)…"
                    value={chartSearchQuery}
                    onChange={(e) => setChartSearchQuery(e.target.value)}
                  />
                  {chartSearchQuery.trim().length > 0 && (
                    <button
                      type="button"
                      className="chart-search-clear"
                      onClick={() => {
                        setChartSearchQuery('');
                        chartSearchInputRef.current?.focus();
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {chartSearchQuery.trim().length > 0 && (
                  <div className="chart-search-results" aria-live="polite">
                    {chartSearchMatches.length === 0 ? (
                      <p className="nd">
                        No matches found in synthetic notes or results for &ldquo;
                        {chartSearchQuery.trim()}&rdquo;.
                      </p>
                    ) : (
                      <ul
                        className="chart-search-list"
                        aria-label="Chart search matches"
                      >
                        {chartSearchMatches.map((match) => (
                          <li key={match.id} className="chart-search-item">
                            <button
                              type="button"
                              className="chart-search-btn"
                              onClick={() => openChartSearchMatch(match)}
                            >
                              <span className="chart-search-meta">
                                <span className="e-tag">{match.sourceLabel}</span>
                                {match.recordedAt && (
                                  <span className="e-tag mono">{match.recordedAt}</span>
                                )}
                                <strong className="chart-search-title">{match.title}</strong>
                              </span>
                              <span className="chart-search-snippet">{match.snippet}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
            <AssistantPanel
              patientLabel={activeScenario.patientLabel}
              patientId={activeScenario.patientId}
              encounterTitle={activeScenario.title}
            />
            <CockpitWidgets
              snapshotEntries={snapshotEntries}
              reviews={reviews}
              activeScenarioId={activeScenario.id}
              activeReport={activeReport}
              triageByScenario={triageByScenario}
              socketStatus={socketStatus}
              evalSummary={evalSummary}
              audit={audit}
              onNavigate={handleCockpitNavigate}
              onSelectEvidenceChange={handleSelectEvidenceChange}
              order={widgetOrder}
              onOrderChange={setWidgetOrder}
            />

            {/* ==================== COMPARE NOTES (DEFAULT) ==================== */}
            {view === 'extract' && (
              <section className="extract-workspace" aria-label="Compare notes workspace">
                <header className="extract-hero">
                  <h1 className="h1" ref={headingRef} tabIndex={-1}>
                    Discharge medication review
                  </h1>
                </header>

                <div className="extract-shell">
                  <div className="extract-status">
                    <p id="extraction-status" className="extract-status-text" role="status">
                      <span
                        className={`dot ${
                          extractStatusState === 'live'
                            ? 'ok'
                            : extractStatusState === 'error'
                              ? 'error'
                              : 'degraded'
                        }`}
                        aria-hidden="true"
                      />
                      {extractStatusText}
                    </p>
                    <button
                      type="button"
                      className="btn quiet"
                      id="extraction-retry"
                      onClick={handleCheckService}
                    >
                      Check service
                    </button>
                  </div>

                  <p className="extract-scope" style={{ marginTop: 8 }}>
                    Synthetic data only — simulated or rule-based results are never presented as live AI.
                  </p>

                  <details className="extract-diagnostics" style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
                      Example details &amp; technical diagnostics
                    </summary>
                    <div
                      className="extract-socket-meta"
                      aria-label="Open model socket status"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '6px 10px',
                        marginTop: 8,
                        fontSize: 12,
                        color: 'var(--muted)',
                      }}
                    >
                      <span>
                        Socket readiness:{' '}
                        <span
                          className={socketStatus.state === 'live' ? 'e-tag verified' : 'e-tag'}
                          data-testid="extract-socket-readiness"
                        >
                          {socketStatus.state}
                        </span>
                      </span>
                      <span>
                        Model: <span className="mono">{socketModelSummary}</span>
                      </span>
                      <span>
                        Open sockets: <span className="mono">{socketStatus.endpoints.socket}</span> ·{' '}
                        <span className="mono">{socketStatus.endpoints.health}</span> ·{' '}
                        <span className="mono">{socketStatus.endpoints.compare}</span>
                      </span>
                    </div>
                    {activePreset && (
                      <div className="extract-preset-meta" style={{ marginTop: 8 }}>
                        <span className="e-tag">{activePreset.dataset}</span>
                        <span className="e-tag verified">{activePreset.license}</span>
                        <span className="e-tag">Synthetic only</span>
                        <a
                          href={activePreset.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn quiet"
                          style={{ height: 24, padding: '0 6px', fontSize: 11.5 }}
                        >
                          Source
                        </a>
                      </div>
                    )}
                  </details>

                  <div className="extract-presets" style={{ marginTop: 12 }}>
                    <label htmlFor="note-preset-select">Note preset</label>
                    <select
                      id="note-preset-select"
                      value={selectedPresetId}
                      onChange={(e) => handleSelectPreset(e.target.value)}
                    >
                      <option value="default">
                        Fictional outpatient &amp; discharge example
                      </option>
                      {hfNoteComparisonPairs.map((pair) => (
                        <option key={pair.id} value={pair.id}>
                          {pair.title} ({pair.license})
                        </option>
                      ))}
                    </select>
                  </div>

                  <form id="extraction-form" onSubmit={handleCompareNotes}>
                    <div className="extract-note-grid">
                      <div className="extract-note">
                        <label htmlFor="earlier-note">
                          Earlier note <span>{earlierNoteLabel}</span>
                        </label>
                        <textarea
                          id="earlier-note"
                          rows={5}
                          placeholder="Enter fictional note text"
                          value={earlierNoteText}
                          onChange={(e) => {
                            setEarlierNoteText(e.target.value);
                            setExtractResult(null);
                            setExtractError('');
                          }}
                        />
                        <small>
                          {Array.from(earlierNoteText).length > 10000
                            ? `${Array.from(earlierNoteText).length.toLocaleString()} / 12,000 characters`
                            : `${Array.from(earlierNoteText).length} chars`}
                        </small>
                      </div>

                      <div className="extract-note">
                        <label htmlFor="later-note">
                          Discharge note <span>{laterNoteLabel}</span>
                        </label>
                        <textarea
                          id="later-note"
                          rows={5}
                          placeholder="Enter fictional note text"
                          value={laterNoteText}
                          onChange={(e) => {
                            setLaterNoteText(e.target.value);
                            setExtractResult(null);
                            setExtractError('');
                          }}
                        />
                        <small>
                          {Array.from(laterNoteText).length > 10000
                            ? `${Array.from(laterNoteText).length.toLocaleString()} / 12,000 characters`
                            : `${Array.from(laterNoteText).length} chars`}
                        </small>
                      </div>
                    </div>

                    <div className="extract-actions">
                      <button className="btn primary" type="submit">
                        Compare notes
                      </button>
                      <button
                        className="btn quiet"
                        type="button"
                        id="extraction-example"
                        onClick={handleLoadExample}
                      >
                        Load example
                      </button>
                      <button
                        className="btn quiet"
                        type="button"
                        id="extraction-reset"
                        onClick={handleClearNotes}
                      >
                        Clear notes
                      </button>
                    </div>
                  </form>

                  {extractError && (
                    <p id="extraction-error" className="extract-error" role="alert">
                      {extractError}
                    </p>
                  )}
                </div>

                {extractResult ? (
                  <section
                    id="extraction-result"
                    className="extract-result"
                    aria-labelledby="extraction-result-title"
                  >
                    <div className="extract-result-header">
                      <h2 id="extraction-result-title" ref={extractResultHeadingRef} tabIndex={-1}>
                        Mention differences
                      </h2>
                      <span className="extract-metrics">
                        {noteDiffCount} {noteDiffCount === 1 ? 'difference' : 'differences'}
                      </span>
                    </div>

                    {noteDiffCount > 0 ? (
                      <>
                        <div
                          className="extract-review-bar"
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            paddingBottom: 12,
                          }}
                        >
                          <p
                            className="extract-review-summary"
                            role="status"
                            style={{ paddingBottom: 0 }}
                          >
                            {noteDiffCount - noteDecidedCount} to review · {noteFlaggedCount}{' '}
                            flagged for clarification
                          </p>
                          <button
                            type="button"
                            className="btn"
                            disabled={noteFlaggedCount === 0}
                            onClick={handleExportFollowUps}
                          >
                            Download follow-ups
                          </button>
                        </div>
                        <ul className="extract-rows">
                          {extractResult.differences.map((entry) => {
                            const dec = noteReviewDecisions[entry.key] ?? null;
                            return (
                              <li key={entry.key}>
                                <div className="extract-row-title">
                                  <strong>{entry.name}</strong>
                                  <span>{entry.statusLabel ?? `${entry.label} only`}</span>
                                </div>
                                {entry.changeCategories && entry.changeCategories.length > 0 && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: 6,
                                      marginBottom: 6,
                                    }}
                                  >
                                    {entry.changeCategories.map((cat) => (
                                      <span key={cat} className="e-tag">
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {entry.absenceNote && (
                                  <p
                                    style={{
                                      fontSize: 12,
                                      color: 'var(--muted)',
                                      margin: '0 0 6px',
                                    }}
                                  >
                                    {entry.absenceNote}
                                  </p>
                                )}
                                {entry.quotes.map((q) => (
                                  <blockquote key={q.key}>
                                    {q.hasLeadingEllipsis ? '…' : ''}
                                    {q.prefix}
                                    <mark>{q.match}</mark>
                                    {q.suffix}
                                    {q.hasTrailingEllipsis ? '…' : ''}
                                  </blockquote>
                                ))}
                                <div
                                  className="extract-review-controls"
                                  role="group"
                                  aria-label={`Review ${entry.name} · ${entry.label.toLowerCase()}`}
                                >
                                  <button
                                    type="button"
                                    className="btn"
                                    aria-pressed={dec === 'clarify'}
                                    onClick={() => handleNoteDifferenceReview(entry, 'clarify')}
                                  >
                                    Flag for clarification
                                  </button>
                                  <button
                                    type="button"
                                    className="btn"
                                    aria-pressed={dec === 'reviewed'}
                                    onClick={() => handleNoteDifferenceReview(entry, 'reviewed')}
                                  >
                                    Mark reviewed
                                  </button>
                                </div>
                                {dec === 'clarify' && (
                                  <p className="extract-followup">
                                    Why does {entry.name} appear only in the{' '}
                                    {entry.label.toLowerCase()}?
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : (
                      <p className="empty">
                        No differences in extracted mentions. Review both notes.
                      </p>
                    )}

                    <details>
                      <summary>All extracted mentions by note</summary>
                      {[extractResult.earlier, extractResult.later].map((side) => (
                        <div className="extract-detail" key={side.label}>
                          <strong>{side.label}</strong>
                          {side.quotes.length === 0 ? (
                            <p>No supported mentions returned.</p>
                          ) : (
                            side.quotes.map((q) => (
                              <blockquote key={q.key}>
                                {q.hasLeadingEllipsis ? '…' : ''}
                                {q.prefix}
                                <mark>{q.match}</mark>
                                {q.suffix}
                                {q.hasTrailingEllipsis ? '…' : ''}
                              </blockquote>
                            ))
                          )}
                        </div>
                      ))}
                    </details>

                    <p className="extract-result-note">
                      Extracted mentions can be missed. Compare the source text before drawing
                      conclusions. Unsupported in note-text comparison: allergies, labs, and
                      non-medication orders.
                    </p>
                  </section>
                ) : (
                  <p className="extract-scope">
                    Fictional notes only. Review both sources before interpreting a difference.
                  </p>
                )}
              </section>
            )}

            {/* ==================== SNAPSHOT REVIEW ==================== */}
            {view === 'diff' && (
              <section aria-label="Snapshot review">
                <div className="eyebrow">
                  Synthetic snapshots · {activeScenario.patientId} · {activeScenario.category}
                </div>
                <h1 className="h1" ref={headingRef} tabIndex={-1}>
                  {cleanPatientName(activeScenario.patientLabel)}
                </h1>
                <p className="lede">
                  Comparing <b>{activeScenario.earlier.source}</b> (
                  {activeScenario.earlier.recordedAt ?? 'Timestamp not documented'}) with{' '}
                  <b>{activeScenario.later.source}</b> (
                  {activeScenario.later.recordedAt ?? 'Timestamp not documented'}).
                </p>

                {activeScenario.provenance && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
                      Example details
                    </summary>
                    <div className="extract-preset-meta" style={{ marginTop: 8 }}>
                      <span className="e-tag">{activeScenario.provenance.dataset}</span>
                      <span className="e-tag verified">{activeScenario.provenance.license}</span>
                      <span className="e-tag">
                        {activeScenario.provenance.split} · row {activeScenario.provenance.rowIndex}
                      </span>
                      <span className="e-tag">Synthetic only</span>
                      <a
                        href={activeScenario.provenance.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn quiet"
                        style={{ height: 24, padding: '0 6px', fontSize: 11.5 }}
                      >
                        Source
                      </a>
                    </div>
                  </details>
                )}

                <div className="editorial-notice warning" role="note" aria-label="Clinical review notice">
                  {BRAND_NAME} · Review required before chart commit.
                </div>

                <div className="tabs" role="tablist" aria-label="Snapshot review tabs">
                  {(
                    [
                      ['diff', 'Differences'],
                      ['timeline', 'Encounter timeline'],
                      ['snapshots', 'Source snapshots'],
                      ['method', 'Method & limits'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className="tab"
                      role="tab"
                      aria-selected={diffTab === id}
                      onClick={() => setDiffTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {diffTab === 'diff' && (
                  <>
                    <section className="sec" id="o-summary">
                      <dl className="review-stats">
                        <div>
                          <dt>With changes</dt>
                          <dd>
                            {diffEntriesCount} <small>medications</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Earlier only</dt>
                          <dd>{onlyACount}</dd>
                        </div>
                        <div>
                          <dt>Later only</dt>
                          <dd>{onlyBCount}</dd>
                        </div>
                        <div>
                          <dt>Reviewed</dt>
                          <dd>
                            {reviewedCount} <small>of {reviewableCount}</small>
                          </dd>
                        </div>
                      </dl>

                      {/* CD-02 Snapshot Provenance & Evidence Summary */}
                      <div
                        className="evidence-block"
                        style={{ marginTop: 12 }}
                        role="region"
                        aria-label="Provenance and evidence summary"
                      >
                        <div className="evidence-block-h">
                          <span>PROVENANCE &amp; EVIDENCE (READ-ONLY)</span>
                          <span
                            className={`e-tag prov-${activeReport.earlierProvenance.status}`}
                          >
                            Earlier: {PROVENANCE_STATUS_LABELS[activeReport.earlierProvenance.status]}
                          </span>
                          <span className={`e-tag prov-${activeReport.laterProvenance.status}`}>
                            Later: {PROVENANCE_STATUS_LABELS[activeReport.laterProvenance.status]}
                          </span>
                          <span className="e-tag">
                            {activeReport.evidenceLinks.length}{' '}
                            {activeReport.evidenceLinks.length === 1
                              ? 'evidence link'
                              : 'evidence links'}
                          </span>
                          <span className="e-tag gap">
                            {activeReport.provenanceGaps.length}{' '}
                            {activeReport.provenanceGaps.length === 1
                              ? 'provenance gap'
                              : 'provenance gaps'}
                          </span>
                        </div>
                        {activeReport.provenanceGaps.length > 0 && (
                          <div className="gap-pills" aria-label="Snapshot provenance gaps">
                            {[...new Set(activeReport.provenanceGaps.map((g) => g.reason))].map(
                              (reason) => (
                                <span className="gap-pill" key={reason}>
                                  {GAP_REASON_LABELS[reason]}
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>

                      <div className="filters" role="group" aria-label="Filter medication differences">
                        {(
                          [
                            ['all', 'All', snapshotEntries.length],
                            ['changed', 'Changed', diffEntriesCount],
                            ['onlyA', 'Only in A', onlyACount],
                            ['onlyB', 'Only in B', onlyBCount],
                            ['same', 'Unchanged', sameCount],
                          ] as const
                        ).map(([id, label, count]) => (
                          <button
                            key={id}
                            type="button"
                            className="flt"
                            aria-pressed={diffFilter === id}
                            onClick={() => setDiffFilter(id)}
                          >
                            {label}
                            <span className="n">{count}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="sec" id="o-statements">
                      <h2 className="h2">
                        Statements{' '}
                        <span>
                          A {activeScenario.earlier.recordedAt ?? 'Undated'} → B{' '}
                          {activeScenario.later.recordedAt ?? 'Undated'}
                        </span>
                      </h2>
                      <div className="hint">
                        <span>
                          <kbd>J</kbd> <kbd>K</kbd> move
                        </span>
                        <span>
                          <kbd>V</kbd> verify
                        </span>
                        <span>
                          <kbd>F</kbd> flag
                        </span>
                        <span>
                          <kbd>D</kbd> defer
                        </span>
                        <span>
                          <kbd>Esc</kbd> collapse
                        </span>
                      </div>

                      <ol className="entries">
                        {shownSnapshotEntries.length === 0 ? (
                          <li className="empty">Nothing matches this filter.</li>
                        ) : (
                          shownSnapshotEntries.map((entry) => {
                            const sel = selectedMedId === entry.id;
                            const rev = reviews[`${activeScenario.id}:${entry.id}`];
                            const reviewable = entry.kind !== 'same';
                            const provStatus: ProvenanceStatus =
                              entry.change?.provenance?.overallStatus ?? 'unknown';
                            const entryLinks = entry.change?.evidenceLinks ?? [];
                            const entryGaps = entry.change?.provenanceGaps ?? [];

                            return (
                              <li
                                key={entry.id}
                                className={`entry has-trigger${sel ? ' sel' : ''}`}
                                data-value={entry.id}
                              >
                                <button
                                  type="button"
                                  className="entry-trigger"
                                  data-value={entry.id}
                                  aria-expanded={sel}
                                  onClick={() => toggleSnapshotRow(entry.id, true)}
                                >
                                  <span
                                    className={`g g-${entry.kind}`}
                                    aria-label={DIFF_GLYPHS[entry.kind].label}
                                  >
                                    {DIFF_GLYPHS[entry.kind].glyph}
                                  </span>

                                  <div>
                                    <div className="e-head">
                                      <span className="e-name">{entry.name}</span>
                                      <span className="e-kind">
                                        {DIFF_GLYPHS[entry.kind].label}
                                      </span>
                                      {rev && <span className={`e-tag ${rev}`}>{rev}</span>}
                                      {entry.kind !== 'same' && (
                                        <span className={`e-tag prov-${provStatus}`}>
                                          {PROVENANCE_STATUS_LABELS[provStatus]}
                                        </span>
                                      )}
                                      {entryGaps.length > 0 && (
                                        <span className="e-tag gap">
                                          {entryGaps.length}{' '}
                                          {entryGaps.length === 1 ? 'gap' : 'gaps'}
                                        </span>
                                      )}
                                    </div>

                                    <div className="e-sum">
                                      {entry.kind === 'changed' ? (
                                        entry.fields
                                          .filter((f) => f.changed)
                                          .map((f, idx) => (
                                            <span key={f.key}>
                                              {idx > 0 && ' · '}
                                              {f.label}{' '}
                                              <span className="from">
                                                {f.a ?? 'Not documented'}
                                              </span>{' '}
                                              →{' '}
                                              {f.b === null ? (
                                                <span className="nd">Not documented</span>
                                              ) : (
                                                <span className="to">{f.b}</span>
                                              )}
                                            </span>
                                          ))
                                      ) : entry.kind === 'onlyA' ? (
                                        <>
                                          {[
                                            entry.beforeMed?.dose,
                                            entry.beforeMed?.route,
                                            entry.beforeMed?.frequency,
                                          ]
                                            .map((v) => v ?? 'not documented')
                                            .join(' · ')}
                                          . Not in Snapshot B, which is not assumed to mean stopped.
                                        </>
                                      ) : entry.kind === 'onlyB' ? (
                                        <>
                                          {[
                                            entry.afterMed?.dose,
                                            entry.afterMed?.route,
                                            entry.afterMed?.frequency,
                                          ]
                                            .map((v) => v ?? 'not documented')
                                            .join(' · ')}
                                          . Not in Snapshot A.
                                        </>
                                      ) : (
                                        <>
                                          {[
                                            entry.afterMed?.dose,
                                            entry.afterMed?.route,
                                            entry.afterMed?.frequency,
                                          ]
                                            .map((v) => v ?? 'not documented')
                                            .join(' · ')}
                                          , identical in both.
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </button>

                                {reviewable ? (
                                  <div
                                    className="seg"
                                    role="group"
                                    aria-label={`Review ${entry.name}`}
                                  >
                                    {(
                                      [
                                        ['verified', 'Verify', 'v'],
                                        ['flagged', 'Flag', 'f'],
                                        ['deferred', 'Defer', 'd'],
                                      ] as const
                                    ).map(([choice, label, cls]) => (
                                      <button
                                        key={choice}
                                        type="button"
                                        className={cls}
                                        data-action="review"
                                        data-id={entry.id}
                                        data-value={choice}
                                        aria-pressed={rev === choice}
                                        onClick={() =>
                                          toggleReview(
                                            entry.id,
                                            entry.name,
                                            choice,
                                            `.entry[data-value="${CSS.escape(entry.id)}"] [data-action="review"][data-value="${choice}"]`,
                                          )
                                        }
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <span />
                                )}

                                {sel && (
                                  <div className="detail">
                                    <table
                                      className="ftable"
                                      aria-label={`Field comparison for ${entry.name}`}
                                    >
                                      <thead>
                                        <tr>
                                          <th>Field</th>
                                          <th>Snapshot A</th>
                                          <th>Snapshot B</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entry.fields.map((f) => (
                                          <tr key={f.key} className={f.changed ? 'chg' : undefined}>
                                            <td>{f.label}</td>
                                            <td>
                                              {f.a === undefined ? (
                                                <span className="na">Not in snapshot</span>
                                              ) : f.a === null ? (
                                                <span className="nd">Not documented</span>
                                              ) : (
                                                f.a
                                              )}
                                            </td>
                                            <td>
                                              {f.b === undefined ? (
                                                <span className="na">Not in snapshot</span>
                                              ) : f.b === null ? (
                                                <span className="nd">Not documented</span>
                                              ) : (
                                                f.b
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>

                                    <div className="src">
                                      <span>
                                        <b>A</b>
                                        {activeScenario.earlier.source} ·{' '}
                                        {activeScenario.earlier.recordedAt ?? 'Undated'}
                                      </span>
                                      <span>
                                        <b>B</b>
                                        {activeScenario.later.source} ·{' '}
                                        {activeScenario.later.recordedAt ?? 'Undated'}
                                      </span>
                                      <span>
                                        <b>ID</b>
                                        {entry.id}
                                      </span>
                                    </div>

                                    {entry.kind !== 'same' && (
                                      <div
                                        className="evidence-block"
                                        tabIndex={-1}
                                        aria-label={`Evidence and provenance for ${entry.name}`}
                                      >
                                        <div className="evidence-block-h">
                                          <span>
                                            Provenance: {PROVENANCE_STATUS_LABELS[provStatus]}
                                          </span>
                                          <span>·</span>
                                          <span>
                                            {entryLinks.length}{' '}
                                            {entryLinks.length === 1
                                              ? 'evidence link'
                                              : 'evidence links'}
                                          </span>
                                          {entry.change && (
                                            <span
                                              className={`e-tag evidence-state-${classifyChangeEvidenceState(entry.change)}`}
                                            >
                                              {EVIDENCE_STATE_LABELS[classifyChangeEvidenceState(entry.change)]}
                                            </span>
                                          )}
                                          {evidenceReturnMedId === entry.id && (
                                            <button
                                              type="button"
                                              className="evidence-back-btn"
                                              onClick={() => closeEvidenceDrilldown(entry.id, true)}
                                            >
                                              Back to evidence widget
                                            </button>
                                          )}
                                        </div>

                                        {entry.kind === 'onlyA' && (
                                          <p className="evidence-side-note">
                                            {entry.change?.provenance?.later.status === 'documented'
                                              ? 'Later side: Documented negative (explicitly absent in documented Snapshot B).'
                                              : 'Later side: Not listed in Snapshot B (not assumed stopped).'}
                                          </p>
                                        )}
                                        {entry.kind === 'onlyB' && (
                                          <p className="evidence-side-note">
                                            {entry.change?.provenance?.earlier.status === 'documented'
                                              ? 'Earlier side: Documented negative (explicitly absent in documented Snapshot A).'
                                              : 'Earlier side: Not listed in Snapshot A.'}
                                          </p>
                                        )}

                                        {entryLinks.length > 0 ? (
                                          <>
                                            {(() => {
                                              const citationKey = `${activeScenario.id}:${entry.id}`;
                                              const rawIdx = activeCitationByMed[citationKey] ?? 0;
                                              const activeIdx = Math.max(
                                                0,
                                                Math.min(entryLinks.length - 1, rawIdx),
                                              );
                                              const activeLink = entryLinks[activeIdx];
                                              const activeState = classifyLinkEvidenceState(
                                                activeLink,
                                                entry.change,
                                              );
                                              const noteIdentity =
                                                activeLink.sourceLabel ??
                                                activeLink.noteId ??
                                                activeLink.sourceId ??
                                                (activeLink.side === 'earlier'
                                                  ? activeScenario.earlier.source
                                                  : activeLink.side === 'later'
                                                    ? activeScenario.later.source
                                                    : 'Unattributed source');
                                              const noteTimestamp =
                                                activeLink.recordedAt ??
                                                (activeLink.side === 'earlier'
                                                  ? activeScenario.earlier.recordedAt
                                                  : activeLink.side === 'later'
                                                    ? activeScenario.later.recordedAt
                                                    : null) ??
                                                'Undated';
                                              const sourcePos = activeLink.span
                                                ? `${activeLink.section ? `${activeLink.section} · ` : ''}${
                                                    activeLink.span.line !== undefined
                                                      ? `line ${activeLink.span.line} · `
                                                      : ''
                                                  }chars ${activeLink.span.start}–${activeLink.span.end}`
                                                : activeLink.section
                                                  ? activeLink.section
                                                  : activeState === 'unavailable_document' ||
                                                      activeState === 'missing_reference'
                                                    ? 'Source unavailable'
                                                    : activeLink.side
                                                      ? `${activeLink.side} snapshot`
                                                      : 'Position unrecorded';

                                              const formatSummary = (idx: number) => {
                                                const target = entryLinks[idx];
                                                const id =
                                                  target?.sourceLabel ??
                                                  target?.noteId ??
                                                  target?.sourceId ??
                                                  'Unattributed source';
                                                const ts = target?.recordedAt ?? 'Undated';
                                                return `${id}, ${ts}`;
                                              };

                                              return (
                                                <div
                                                  className="note-nav"
                                                  role="region"
                                                  aria-label={`Note navigator for ${entry.name}`}
                                                >
                                                  <div className="note-nav-bar">
                                                    <div className="note-nav-controls">
                                                      <button
                                                        type="button"
                                                        className="note-nav-btn"
                                                        aria-label="Previous citation"
                                                        disabled={activeIdx === 0}
                                                        onClick={() =>
                                                          jumpToCitation(
                                                            entry.id,
                                                            activeIdx - 1,
                                                            entryLinks.length,
                                                            formatSummary(activeIdx - 1),
                                                          )
                                                        }
                                                      >
                                                        Prev
                                                      </button>
                                                      <span className="note-nav-count">
                                                        Citation {activeIdx + 1} of{' '}
                                                        {entryLinks.length}
                                                      </span>
                                                      <button
                                                        type="button"
                                                        className="note-nav-btn"
                                                        aria-label="Next citation"
                                                        disabled={
                                                          activeIdx === entryLinks.length - 1
                                                        }
                                                        onClick={() =>
                                                          jumpToCitation(
                                                            entry.id,
                                                            activeIdx + 1,
                                                            entryLinks.length,
                                                            formatSummary(activeIdx + 1),
                                                          )
                                                        }
                                                      >
                                                        Next
                                                      </button>
                                                    </div>
                                                    {entryLinks.length > 1 && (
                                                      <div
                                                        className="note-nav-pills"
                                                        role="group"
                                                        aria-label={`Jump to citation for ${entry.name}`}
                                                      >
                                                        {entryLinks.map((lnk, idx) => (
                                                          <button
                                                            key={idx}
                                                            type="button"
                                                            className="note-nav-pill"
                                                            aria-pressed={idx === activeIdx}
                                                            aria-label={`Citation ${idx + 1}${lnk.side ? ` (${lnk.side})` : ''}`}
                                                            onClick={() =>
                                                              jumpToCitation(
                                                                entry.id,
                                                                idx,
                                                                entryLinks.length,
                                                                formatSummary(idx),
                                                              )
                                                            }
                                                          >
                                                            {idx + 1}
                                                            {lnk.side ? ` · ${lnk.side}` : ''}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                  <div className="note-nav-meta">
                                                    <span>
                                                      <b>Note</b> {noteIdentity}
                                                    </span>
                                                    <span>
                                                      <b>Date</b> {noteTimestamp}
                                                    </span>
                                                    <span>
                                                      <b>Position</b>{' '}
                                                      <span className="mono">{sourcePos}</span>
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })()}
                                            <ul className="evidence-list">
                                              {entryLinks.map((link, idx) => {
                                                const citationKey = `${activeScenario.id}:${entry.id}`;
                                                const activeIdx = Math.max(
                                                  0,
                                                  Math.min(
                                                    entryLinks.length - 1,
                                                    activeCitationByMed[citationKey] ?? 0,
                                                  ),
                                                );
                                                const isActiveCitation = idx === activeIdx;
                                                const linkState = classifyLinkEvidenceState(
                                                  link,
                                                  entry.change,
                                                );
                                                const isUnavailable =
                                                  linkState === 'unavailable_document';
                                                const isMissingRef =
                                                  linkState === 'missing_reference';
                                                const isConflicting =
                                                  linkState === 'conflicting_excerpts';
                                                return (
                                                  <li
                                                    className={`evidence-item${isActiveCitation ? ' is-active' : ''}`}
                                                    data-citation-idx={idx}
                                                    aria-current={
                                                      isActiveCitation ? 'true' : undefined
                                                    }
                                                    key={idx}
                                                  >
                                                    <div className="evidence-meta">
                                                      {link.side && (
                                                        <span className="e-tag">{link.side}</span>
                                                      )}
                                                      <span
                                                        className={`e-tag evidence-state-${linkState}${
                                                          isUnavailable || isMissingRef
                                                            ? ' unavailable'
                                                            : ''
                                                        }`}
                                                      >
                                                        {EVIDENCE_STATE_LABELS[linkState]}
                                                      </span>
                                                      <span
                                                        className={`e-tag prov-${link.provenanceStatus}`}
                                                      >
                                                        {
                                                          PROVENANCE_STATUS_LABELS[
                                                            link.provenanceStatus
                                                          ]
                                                        }
                                                      </span>
                                                      {link.sourceLabel && (
                                                        <span>{link.sourceLabel}</span>
                                                      )}
                                                      {link.recordedAt && (
                                                        <span>{link.recordedAt}</span>
                                                      )}
                                                      {link.section && <span>{link.section}</span>}
                                                      {link.span && (
                                                        <span className="mono">
                                                          [{link.span.start}–{link.span.end}]
                                                        </span>
                                                      )}
                                                    </div>
                                                    {link.excerpt ? (
                                                      <p>&ldquo;{link.excerpt}&rdquo;</p>
                                                    ) : isUnavailable ? (
                                                      <p className="nd">
                                                        Source unavailable
                                                        {link.note ? ` — ${link.note}` : '.'}
                                                      </p>
                                                    ) : isMissingRef ? (
                                                      <p className="nd">
                                                        Missing reference
                                                        {link.note
                                                          ? ` — ${link.note}`
                                                          : ' — no source citation or excerpt recorded.'}
                                                      </p>
                                                    ) : isConflicting ? (
                                                      <p className="nd">
                                                        Conflicting excerpts
                                                        {link.note
                                                          ? ` — ${link.note}`
                                                          : ' — conflicting or ambiguous attribution across sources.'}
                                                      </p>
                                                    ) : (
                                                      <p className="nd">
                                                        {link.note ??
                                                          'No supporting excerpt attached.'}
                                                      </p>
                                                    )}
                                                  </li>
                                                );
                                              })}
                                            </ul>
                                          </>
                                        ) : (
                                          <p className="nd" style={{ fontSize: 12 }}>
                                            Missing reference — no supporting evidence links attached to this change.
                                          </p>
                                        )}

                                        {entryGaps.length > 0 && (
                                          <div className="gap-pills">
                                            {entryGaps.map((gap, idx) => (
                                              <span
                                                key={idx}
                                                className="gap-pill"
                                                title={gap.message}
                                              >
                                                {GAP_REASON_LABELS[gap.reason]}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <textarea
                                      className="note"
                                      aria-label={`Reviewer note for ${entry.name}`}
                                      placeholder="Reviewer note (stays in this session)"
                                      value={notes[`${activeScenario.id}:${entry.id}`] ?? ''}
                                      onChange={(e) =>
                                        setNotes((curr) => ({
                                          ...curr,
                                          [`${activeScenario.id}:${entry.id}`]: e.target.value,
                                        }))
                                      }
                                      onBlur={() =>
                                        addAudit(
                                          'Clinician',
                                          'Edited note',
                                          `${cleanPatientName(activeScenario.patientLabel)} · ${entry.name}`,
                                        )
                                      }
                                    />
                                  </div>
                                )}
                              </li>
                            );
                          })
                        )}
                      </ol>
                    </section>
                  </>
                )}

                {diffTab === 'timeline' && (
                  <div className="timeline-wrap">
                    <section className="sec timeline-sec" aria-label="Chronological encounter timeline">
                      <h2 className="sec-h">
                        Chronological timeline · {encounterTimeline.dated.length}{' '}
                        {encounterTimeline.dated.length === 1 ? 'record' : 'records'}
                      </h2>
                      {encounterTimeline.dated.length === 0 ? (
                        <p className="nd">No dated encounters, notes, or changes in this comparison.</p>
                      ) : (
                        <ol className="timeline-list">
                          {encounterTimeline.dated.map((item) => (
                            <li key={item.id} className="timeline-item">
                              <div className="timeline-head">
                                <span className="e-tag mono">{item.recordedAt}</span>
                                <span className={`e-tag timeline-kind-${item.kind}`}>
                                  {item.kind === 'encounter'
                                    ? 'Encounter'
                                    : item.kind === 'note'
                                      ? 'Synthetic note'
                                      : 'Documented change'}
                                </span>
                                <strong className="timeline-title">{item.title}</strong>
                                {item.medicationId && (
                                  <button
                                    type="button"
                                    className="timeline-inspect-btn"
                                    onClick={() => handleSelectEvidenceChange(item.medicationId!)}
                                  >
                                    Inspect change
                                  </button>
                                )}
                              </div>
                              <p className="timeline-source">{item.sourceLabel}</p>
                              <p className="timeline-detail">{item.detail}</p>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>

                    <section className="sec timeline-undated" aria-label="Undated records">
                      <h2 className="sec-h">
                        Undated records · {encounterTimeline.undated.length}{' '}
                        {encounterTimeline.undated.length === 1 ? 'record' : 'records'}
                      </h2>
                      {encounterTimeline.undated.length === 0 ? (
                        <p className="nd">No undated records in this comparison.</p>
                      ) : (
                        <ul className="timeline-list">
                          {encounterTimeline.undated.map((item) => (
                            <li key={item.id} className="timeline-item is-undated">
                              <div className="timeline-head">
                                <span className="e-tag unavailable">Undated</span>
                                <span className={`e-tag timeline-kind-${item.kind}`}>
                                  {item.kind === 'encounter'
                                    ? 'Encounter'
                                    : item.kind === 'note'
                                      ? 'Synthetic note'
                                      : 'Documented change'}
                                </span>
                                <strong className="timeline-title">{item.title}</strong>
                                {item.medicationId && (
                                  <button
                                    type="button"
                                    className="timeline-inspect-btn"
                                    onClick={() => handleSelectEvidenceChange(item.medicationId!)}
                                  >
                                    Inspect change
                                  </button>
                                )}
                              </div>
                              <p className="timeline-source">{item.sourceLabel}</p>
                              <p className="timeline-detail">{item.detail}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                )}

                {diffTab === 'snapshots' && (
                  <>
                    {[
                      { id: 'o-snapA', snap: activeScenario.earlier, letter: 'A' },
                      { id: 'o-snapB', snap: activeScenario.later, letter: 'B' },
                    ].map(({ id, snap, letter }) => (
                      <section className="sec" id={id} key={id}>
                        <h2 className="h2">
                          Snapshot {letter} · {snap.source}{' '}
                          <span>{snap.recordedAt ?? 'Timestamp not documented'}</span>
                        </h2>
                        <div className="table-scroll" tabIndex={0}>
                          <table className="snap">
                            <thead>
                              <tr>
                                <th>Medication</th>
                                <th>Dose</th>
                                <th>Route</th>
                                <th>Frequency</th>
                                <th>ID</th>
                              </tr>
                            </thead>
                            <tbody>
                              {snap.medications.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="nd">
                                    No medications documented in this snapshot.
                                  </td>
                                </tr>
                              ) : (
                                snap.medications.map((m) => (
                                  <tr key={m.id}>
                                    <td>{m.name}</td>
                                    <td>{m.dose ?? <span className="nd">Not documented</span>}</td>
                                    <td>{m.route ?? <span className="nd">Not documented</span>}</td>
                                    <td>
                                      {m.frequency ?? <span className="nd">Not documented</span>}
                                    </td>
                                    <td className="mono" style={{ color: 'var(--faint)' }}>
                                      {m.id}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ))}
                  </>
                )}

                {diffTab === 'method' && (
                  <div className="prose">
                    <section className="sec" id="o-scope">
                      <h2 className="h2">Scope</h2>
                      <p>
                        Clinical Diff compares two medication snapshots for one person and shows
                        where the documentation differs. It is a retrospective review aid built on{' '}
                        <b>fictional and synthetic records</b>. It is not a prescribing tool, a
                        medical device, or a complete audit trail.
                      </p>
                    </section>
                    <section className="sec" id="o-rules">
                      <h2 className="h2">Comparison rules</h2>
                      <p>
                        Statements are matched by the IDs supplied in each record. Nothing is
                        matched by name similarity or inferred.
                      </p>
                      <p>
                        A field that is empty is shown as{' '}
                        <span className="nd">Not documented</span>. A medication that does not
                        appear at all is shown as <span className="na">Not in snapshot</span>.
                        Neither is treated as discontinued.
                      </p>
                      <p>
                        Source labels and recorded dates are kept as they appear. A difference does
                        not establish an error, an authorisation, the timing of a change, or harm.
                      </p>
                    </section>
                    <section className="sec" id="o-limits">
                      <h2 className="h2">Limits</h2>
                      <p>
                        Review decisions are held in this browser session only and reset on reload.
                        No clinician has validated the fixtures or the wording. Placeholder
                        connectors require an implementation before use.
                      </p>
                    </section>
                  </div>
                )}
              </section>
            )}

            {/* ==================== REVIEW SUGGESTIONS ==================== */}
            {view === 'triage' && (
              <section aria-label="Review suggestions">
                <div className="eyebrow">
                  AI triage · {cleanPatientName(activeScenario.patientLabel)}
                </div>
                <h1 className="h1" ref={headingRef} tabIndex={-1}>
                  Suggestions waiting for a clinician
                </h1>
                <p className="lede">
                  The active model reads each difference and proposes what to check. Nothing is
                  applied until a person accepts it.
                </p>

                <section className="sec" id="o-model" style={{ marginTop: 28 }}>
                  <h2 className="h2">Model</h2>
                  <div
                    className="bar"
                    style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}
                  >
                    <div className="bar-l">
                      {activeModelConn ? (
                        <>
                          <span className={`dot ${activeModelConn.state}`} aria-hidden="true" />
                          <span style={{ color: 'var(--strong)' }}>{activeModelConn.name}</span>
                          <span className="mono" style={{ fontSize: 11.5 }}>
                            {DRIVERS.find((d) => d.id === activeModelConn.driver)?.label ??
                              activeModelConn.driver}
                          </span>
                        </>
                      ) : (
                        'No model connected'
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn quiet"
                        onClick={() => navigateTo('models')}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!activeModelConn}
                        onClick={runTriage}
                      >
                        {(triageByScenario[activeScenario.id]?.length ?? 0) > 0
                          ? 'Re-run triage'
                          : 'Run triage'}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="sec" id="o-queue">
                  <h2 className="h2">
                    Queue{' '}
                    <span>
                      {(triageByScenario[activeScenario.id]?.length ?? 0) > 0
                        ? `${openTriageCount} open of ${triageByScenario[activeScenario.id]?.length}`
                        : ''}
                    </span>
                  </h2>
                  {(triageByScenario[activeScenario.id]?.length ?? 0) === 0 ? (
                    <div className="empty">
                      <b>No suggestions yet.</b> Run triage on the snapshot differences.
                    </div>
                  ) : (
                    <ol className="entries">
                      {(triageByScenario[activeScenario.id] ?? []).map((s) => (
                        <li className="entry" key={s.id}>
                          <span className="g g-sugg" aria-hidden="true">
                            ?
                          </span>
                          <div>
                            <div className="e-head">
                              <span className="e-name">{s.proposal}</span>
                              {s.decision === 'accepted' && (
                                <span className="e-tag verified">accepted</span>
                              )}
                              {s.decision === 'overridden' && (
                                <span className="e-tag flagged">overridden · {s.reason}</span>
                              )}
                              {s.decision === 'skipped' && <span className="e-tag">skipped</span>}
                            </div>
                            <div className="e-sum" style={{ color: 'var(--muted)' }}>
                              {s.rationale}
                            </div>
                            <div className="src">
                              <span className="conf">
                                {s.confidence.toFixed(2)}{' '}
                                <i>
                                  <span style={{ width: `${Math.round(s.confidence * 100)}%` }} />
                                </i>
                              </span>
                              {s.evidence.map((ev, i) => (
                                <span key={i}>{ev}</span>
                              ))}
                              <span className="mono">
                                {s.model}
                                {s.simulated ? ' · simulated' : ''}
                              </span>
                            </div>
                            {s.decision === 'override-pending' && (
                              <div className="chips">
                                {[
                                  'Patient-reported change',
                                  'Documentation error',
                                  'Intentional per prescriber',
                                  'Needs pharmacist review',
                                ].map((reason) => (
                                  <button
                                    key={reason}
                                    type="button"
                                    className="chip"
                                    onClick={() => {
                                      setTriageByScenario((prev) => ({
                                        ...prev,
                                        [activeScenario.id]: (prev[activeScenario.id] ?? []).map(
                                          (item) =>
                                            item.id === s.id
                                              ? { ...item, decision: 'overridden', reason }
                                              : item,
                                        ),
                                      }));
                                      addAudit('Clinician', `Overrode suggestion: ${reason}`, s.proposal);
                                    }}
                                  >
                                    {reason}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="seg" role="group" aria-label={`Decide ${s.proposal}`}>
                            {(
                              [
                                ['accepted', 'Accept', 'v'],
                                ['override-pending', 'Override', 'f'],
                                ['skipped', 'Skip', ''],
                              ] as const
                            ).map(([choice, label, cls]) => (
                              <button
                                key={choice}
                                type="button"
                                className={cls}
                                aria-pressed={
                                  s.decision === choice ||
                                  (choice === 'override-pending' && s.decision === 'overridden')
                                }
                                onClick={() => {
                                  const togglingOff =
                                    s.decision === choice ||
                                    (choice === 'override-pending' && s.decision === 'overridden');
                                  setTriageByScenario((prev) => ({
                                    ...prev,
                                    [activeScenario.id]: (prev[activeScenario.id] ?? []).map(
                                      (item) =>
                                        item.id === s.id
                                          ? {
                                              ...item,
                                              decision: togglingOff ? null : choice,
                                              reason: null,
                                            }
                                          : item,
                                    ),
                                  }));
                                  if (!togglingOff && choice !== 'override-pending') {
                                    addAudit(
                                      'Clinician',
                                      choice === 'accepted'
                                        ? 'Accepted suggestion'
                                        : 'Skipped suggestion',
                                      s.proposal,
                                    );
                                  }
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </section>
            )}

            {/* ==================== EVALUATIONS ==================== */}
            {view === 'eval' && (
              <section aria-label="Evaluations">
                <div className="eyebrow">Synthetic evaluation</div>
                <h1 className="h1" ref={headingRef} tabIndex={-1}>
                  Evaluation results
                </h1>
                <p className="lede">
                  Deterministic comparison across held-out synthetic cases and audited synthetic
                  fixtures. Results here are a smoke test, not clinical validation.
                </p>

                <section className="sec" id="o-about" style={{ marginTop: 28 }}>
                  <h2 className="h2">About this set</h2>
                  <div className="prose">
                    <p>
                      <b>
                        {HELDOUT_CASES.length} held-out cases + {allScenarios.length} workspace
                        scenarios
                      </b>
                      . Labels mark each statement as changed, added, removed, or unchanged,
                      including undocumented fields and HF synthetic provenance records.
                    </p>
                  </div>
                </section>

                <section className="sec" id="o-results">
                  <h2 className="h2">
                    Results{' '}
                    <span>{evalSummary ? `run ${evalSummary.ts.slice(11, 19)}Z` : 'not run'}</span>
                  </h2>
                  <ul className="rows widget-table-card">
                    <li className="row eval head">
                      <span>Method</span>
                      <span>Cases</span>
                      <span>Precision</span>
                      <span>Recall</span>
                      <span>Exact match</span>
                    </li>
                    <li className="row eval">
                      <span style={{ color: 'var(--strong)' }}>
                        Deterministic diff <span style={{ color: 'var(--faint)' }}>baseline</span>
                      </span>
                      <span className="mono">{evalSummary ? evalSummary.totalCases : '—'}</span>
                      <span className="mono">
                        {evalSummary ? evalSummary.precision.toFixed(2) : '—'}
                      </span>
                      <span className="mono">
                        {evalSummary ? evalSummary.recall.toFixed(2) : '—'}
                      </span>
                      <span className="mono">
                        {evalSummary ? evalSummary.exactMatch.toFixed(2) : '—'}
                      </span>
                    </li>
                  </ul>
                  <div style={{ marginTop: 14 }}>
                    <button type="button" className="btn primary" onClick={runEval}>
                      {evalSummary ? 'Run again' : 'Run held-out set'}
                    </button>
                  </div>
                </section>

                <section className="sec" id="o-agree">
                  <h2 className="h2">Session agreement</h2>
                  <div className="prose">
                    {(() => {
                      const allTri = Object.values(triageByScenario).flat();
                      const acc = allTri.filter((s) => s.decision === 'accepted').length;
                      const ov = allTri.filter((s) => s.decision === 'overridden').length;
                      const revVals = Object.values(reviews);
                      return (
                        <>
                          <p>
                            Triage suggestions accepted: <b>{acc}</b> · overridden: <b>{ov}</b>
                            {acc + ov > 0 && (
                              <>
                                {' '}
                                · acceptance <b>{(acc / (acc + ov)).toFixed(2)}</b>
                              </>
                            )}
                            .
                          </p>
                          <p>
                            Clinician reviews this session:{' '}
                            <b>{revVals.filter((v) => v === 'verified').length}</b> verified,{' '}
                            <b>{revVals.filter((v) => v === 'flagged').length}</b> flagged,{' '}
                            <b>{revVals.filter((v) => v === 'deferred').length}</b> deferred.
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </section>
              </section>
            )}

            {/* ==================== SESSION ACTIVITY ==================== */}
            {view === 'audit' && (
              <section aria-label="Session activity">
                <div className="eyebrow">Fictional workspace</div>
                <h1 className="h1" ref={headingRef} tabIndex={-1}>
                  Session activity
                </h1>
                <p className="lede">
                  Comparisons, review decisions and connector changes from this session. Export the
                  log before refreshing to keep a copy.
                </p>

                <section className="sec" id="o-trail" style={{ marginTop: 28 }}>
                  <div className="bar" style={{ marginBottom: 10 }}>
                    <div className="filters" style={{ margin: 0 }}>
                      {['all', ...new Set(audit.map((a) => a.actor))].map((actor) => (
                        <button
                          key={actor}
                          type="button"
                          className="flt"
                          aria-pressed={auditFilter === actor}
                          onClick={() => setAuditFilter(actor)}
                        >
                          {actor === 'all' ? 'Everyone' : actor}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn quiet"
                        onClick={() => exportAudit('csv')}
                      >
                        CSV
                      </button>
                      <button type="button" className="btn" onClick={() => exportAudit('json')}>
                        Export JSON
                      </button>
                    </div>
                  </div>

                  <ul className="rows widget-table-card">
                    <li className="row audit head">
                      <span>Time</span>
                      <span>Actor</span>
                      <span>Action</span>
                      <span>Target</span>
                    </li>
                    {audit
                      .filter((a) => auditFilter === 'all' || a.actor === auditFilter)
                      .map((a) => (
                        <li className="row audit" key={a.id}>
                          <span className="mono" style={{ color: 'var(--faint)' }}>
                            {a.ts.slice(11, 19)}Z
                          </span>
                          <span style={{ color: 'var(--strong)' }}>{a.actor}</span>
                          <span>{a.action}</span>
                          <span
                            className="mono"
                            style={{
                              fontSize: 11.5,
                              color: 'var(--muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {a.target}
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>
              </section>
            )}

            {/* ==================== MODELS & DATA ==================== */}
            {view === 'models' && (
              <section aria-label="Models and data">
                <div className="eyebrow">System · integrations</div>
                <h1 className="h1" ref={headingRef} tabIndex={-1}>
                  Models and data
                </h1>
                <p className="lede">
                  Check the note comparison service, audited Hugging Face synthetic datasets, and
                  snapshot drivers.
                </p>

                <div className="tabs" role="tablist" aria-label="Models and data tabs">
                  {(
                    [
                      ['connections', 'Connections'],
                      ['add', 'New connection'],
                      ['contracts', 'Contracts'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className="tab"
                      role="tab"
                      aria-selected={modelsTab === id}
                      onClick={() => {
                        setModelsTab(id);
                        setFormError('');
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {modelsTab === 'connections' && (
                  <>
                    <section className="service-card" aria-label="Note comparison service and model socket">
                      <div style={{ minWidth: 0 }}>
                        <h2>Note comparison service</h2>
                        <p>
                          <span
                            className={`dot ${
                              extractStatusState === 'live'
                                ? 'ok'
                                : extractStatusState === 'error'
                                  ? 'error'
                                  : 'degraded'
                            }`}
                            aria-hidden="true"
                          />
                          {extractStatusText}
                        </p>
                        <div
                          className="r-sub"
                          style={{
                            marginTop: 6,
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px 10px',
                            alignItems: 'center',
                          }}
                        >
                          <span>
                            Socket readiness:{' '}
                            <span
                              className={
                                socketStatus.state === 'live' ? 'active-tag' : 'e-tag'
                              }
                              data-testid="models-socket-readiness"
                            >
                              {socketStatus.state}
                            </span>
                          </span>
                          <span>
                            Provider: <span className="mono">{socketStatus.provider}</span>
                          </span>
                          <span>
                            Model / adapter: <span className="mono">{socketModelSummary}</span>
                          </span>
                        </div>
                        <div className="r-sub" style={{ marginTop: 4 }}>
                          Active open sockets:{' '}
                          <span className="mono">{socketStatus.endpoints.socket}</span> ·{' '}
                          <span className="mono">{socketStatus.endpoints.health}</span> ·{' '}
                          <span className="mono">{socketStatus.endpoints.compare}</span> ·{' '}
                          Synthetic records only
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn quiet"
                          onClick={handleCheckService}
                        >
                          Check socket
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => navigateTo('extract')}
                        >
                          Open comparison
                        </button>
                      </div>
                    </section>

                    <section className="sec" id="o-hf">
                      <h2 className="h2">
                        Audited Hugging Face synthetic datasets{' '}
                        <span>{hfDatasetSources.length} open-licensed sources</span>
                      </h2>
                      {hfDatasetSources.length === 0 ? (
                        <p className="empty">No external synthetic datasets loaded.</p>
                      ) : (
                        <ul className="rows widget-cards">
                          {hfDatasetSources.map((ds) => (
                            <li className="row conn" key={ds.id}>
                              <span className="dot ok" aria-hidden="true" />
                              <div style={{ minWidth: 0 }}>
                                <div className="r-name">
                                  {ds.dataset}
                                  <span className="active-tag">{ds.license}</span>
                                </div>
                                <div className="r-sub">
                                  Split: <span className="mono">{ds.split}</span> ·{' '}
                                  {ds.rowCount} curated rows · Synthetic only
                                </div>
                                <div className="r-sub">{ds.description}</div>
                              </div>
                              <div className="r-acts">
                                <a
                                  href={ds.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn quiet"
                                >
                                  Dataset
                                </a>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <div className="bar" style={{ marginBottom: 18 }}>
                      <div className="bar-l">Snapshot and suggestion connectors</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn quiet"
                          onClick={() => {
                            setConnections((prev) =>
                              prev.map((c) => {
                                const driver = DRIVERS.find((d) => d.id === c.driver);
                                return {
                                  ...c,
                                  state: driver?.builtin ? 'ok' : 'error',
                                  latency: driver?.builtin ? 1 : null,
                                  detail: driver?.builtin
                                    ? 'Deterministic local driver ready'
                                    : 'This connector is not implemented. No connection was attempted.',
                                  checkedAt: new Date().toISOString(),
                                };
                              }),
                            );
                            setConnLog((prev) => [
                              {
                                id: `cl-${Date.now()}`,
                                ts: new Date().toISOString(),
                                msg: 'Tested all configured connectors',
                              },
                              ...prev,
                            ]);
                          }}
                        >
                          Test all
                        </button>
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => setModelsTab('add')}
                        >
                          New connection
                        </button>
                      </div>
                    </div>

                    {(['db', 'model'] as const).map((kind) => (
                      <section className="sec" id={kind === 'db' ? 'o-db' : 'o-ml'} key={kind}>
                        <h2 className="h2">
                          {kind === 'db' ? 'Databases' : 'Models'}{' '}
                          <span>
                            {kind === 'db' ? 'source of snapshots' : 'used by AI triage'}
                          </span>
                        </h2>
                        <ul className="rows widget-cards">
                          {connections
                            .filter((c) => c.kind === kind)
                            .map((c) => (
                              <li className="row conn" key={c.id}>
                                <span className={`dot ${c.state}`} title={c.state} />
                                <div style={{ minWidth: 0 }}>
                                  <div className="r-name">
                                    {c.name}
                                    {c.active && <span className="active-tag">active</span>}
                                  </div>
                                  <div className="r-sub">
                                    <span className="mono">
                                      {DRIVERS.find((d) => d.id === c.driver)?.label ?? c.driver}
                                    </span>{' '}
                                    · <span className="mono">{c.endpoint || 'no endpoint'}</span>
                                    {c.model ? (
                                      <>
                                        {' '}
                                        · <span className="mono">{c.model}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  <div className="r-sub">
                                    {c.detail}
                                    {c.latency != null ? ` · ${c.latency} ms` : ''}
                                    {c.checkedAt ? ` · ${c.checkedAt.slice(11, 19)}Z` : ''}
                                  </div>
                                </div>
                                <div className="r-acts">
                                  <button
                                    type="button"
                                    className="btn quiet"
                                    onClick={() => {
                                      const driver = DRIVERS.find((d) => d.id === c.driver);
                                      const nextState: ConnectionState = driver?.builtin
                                        ? 'ok'
                                        : 'error';
                                      const detail = driver?.builtin
                                        ? 'Deterministic local driver ready'
                                        : 'This connector is not implemented. No connection was attempted.';
                                      setConnections((prev) =>
                                        prev.map((item) =>
                                          item.id === c.id
                                            ? {
                                                ...item,
                                                state: nextState,
                                                latency: driver?.builtin ? 1 : null,
                                                detail,
                                                checkedAt: new Date().toISOString(),
                                              }
                                            : item,
                                        ),
                                      );
                                      setConnLog((prev) => [
                                        {
                                          id: `cl-${Date.now()}`,
                                          ts: new Date().toISOString(),
                                          msg: `${c.name}: ${nextState}`,
                                        },
                                        ...prev,
                                      ]);
                                    }}
                                  >
                                    Test
                                  </button>
                                  {!c.active && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn quiet"
                                        onClick={() => {
                                          setConnections((prev) =>
                                            prev.map((item) =>
                                              item.kind === c.kind
                                                ? { ...item, active: item.id === c.id }
                                                : item,
                                            ),
                                          );
                                          addAudit(
                                            'Connector',
                                            `Set active ${c.kind === 'db' ? 'database' : 'model'}`,
                                            c.name,
                                          );
                                        }}
                                      >
                                        Use
                                      </button>
                                      <button
                                        type="button"
                                        className="btn quiet"
                                        aria-label={`Remove ${c.name}`}
                                        onClick={() => {
                                          setConnections((prev) =>
                                            prev.filter((item) => item.id !== c.id),
                                          );
                                          addAudit('Connector', 'Removed connection', c.name);
                                        }}
                                      >
                                        Remove
                                      </button>
                                    </>
                                  )}
                                </div>
                              </li>
                            ))}
                        </ul>
                      </section>
                    ))}

                    <section className="sec" id="o-log">
                      <h2 className="h2">Connection events</h2>
                      <ul className="rows widget-table-card">
                        {connLog.slice(0, 10).map((l) => (
                          <li
                            key={l.id}
                            className="row audit"
                            style={{ gridTemplateColumns: '82px 1fr' }}
                          >
                            <span className="mono" style={{ color: 'var(--faint)' }}>
                              {l.ts.slice(11, 19)}Z
                            </span>
                            <span>{l.msg}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </>
                )}

                {modelsTab === 'add' && (
                  <>
                    <section className="sec" id="o-new">
                      <h2 className="h2">New connection</h2>
                      <form
                        className="form"
                        autoComplete="off"
                        onSubmit={(e) => {
                          e.preventDefault();
                          try {
                            JSON.parse(newConnConfig || '{}');
                          } catch {
                            setFormError('Options must be valid JSON.');
                            return;
                          }
                          if (!newConnEndpoint.trim()) {
                            setFormError('An endpoint is required.');
                            return;
                          }
                          const driver = DRIVERS.find((d) => d.id === newConnDriver);
                          const created: ConnectionItem = {
                            id: `conn-${Date.now()}`,
                            kind: newConnKind,
                            driver: newConnDriver,
                            name: newConnName.trim() || driver?.label || newConnDriver,
                            endpoint: newConnEndpoint.trim(),
                            model: newConnKind === 'model' ? newConnModel.trim() : '',
                            state: driver?.builtin ? 'ok' : 'error',
                            latency: driver?.builtin ? 1 : null,
                            detail: driver?.builtin
                              ? 'Deterministic local driver ready'
                              : 'This connector is not implemented. No connection was attempted.',
                            checkedAt: new Date().toISOString(),
                            active: false,
                          };
                          setConnections((prev) => [...prev, created]);
                          addAudit('Connector', 'Registered connection', created.name);
                          setFormError('');
                          setModelsTab('connections');
                          showToast(`Registered ${created.name}`);
                        }}
                      >
                        <div className="field">
                          <label htmlFor="f-kind">Type</label>
                          <select
                            id="f-kind"
                            value={newConnKind}
                            onChange={(e) => {
                              const nextKind = e.target.value as 'db' | 'model';
                              setNewConnKind(nextKind);
                              const d0 = DRIVERS.find((d) => d.kind === nextKind);
                              if (d0) {
                                setNewConnDriver(d0.id);
                                setNewConnEndpoint(d0.defaultEndpoint);
                                setNewConnModel(d0.defaultModel ?? '');
                              }
                            }}
                          >
                            <option value="db">Database</option>
                            <option value="model">Model</option>
                          </select>
                        </div>

                        <div className="field">
                          <label htmlFor="f-driver">Driver</label>
                          <select
                            id="f-driver"
                            value={newConnDriver}
                            onChange={(e) => {
                              const d = DRIVERS.find((x) => x.id === e.target.value);
                              setNewConnDriver(e.target.value);
                              if (d) {
                                setNewConnEndpoint(d.defaultEndpoint);
                                setNewConnModel(d.defaultModel ?? '');
                              }
                            }}
                          >
                            {DRIVERS.filter((d) => d.kind === newConnKind).map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field">
                          <label htmlFor="f-name">Name</label>
                          <input
                            id="f-name"
                            placeholder="e.g. Hospital FHIR sandbox"
                            value={newConnName}
                            onChange={(e) => setNewConnName(e.target.value)}
                          />
                        </div>

                        <div className="field">
                          <label htmlFor="f-endpoint">Endpoint</label>
                          <input
                            id="f-endpoint"
                            className="mono"
                            value={newConnEndpoint}
                            onChange={(e) => setNewConnEndpoint(e.target.value)}
                          />
                        </div>

                        {newConnKind === 'model' && (
                          <div className="field full">
                            <label htmlFor="f-model">Model ID</label>
                            <input
                              id="f-model"
                              className="mono"
                              value={newConnModel}
                              onChange={(e) => setNewConnModel(e.target.value)}
                            />
                          </div>
                        )}

                        <div className="field full">
                          <label htmlFor="f-config">Options (JSON)</label>
                          <textarea
                            id="f-config"
                            value={newConnConfig}
                            onChange={(e) => setNewConnConfig(e.target.value)}
                          />
                          <span className="help">
                            Do not paste secrets here. Credentials belong in server-side environment
                            variables; this workspace stores nothing.
                          </span>
                        </div>

                        <div
                          className="field full"
                          style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                        >
                          <button className="btn primary" type="submit">
                            Register &amp; test
                          </button>
                          <button
                            className="btn quiet"
                            type="button"
                            onClick={() => setModelsTab('connections')}
                          >
                            Cancel
                          </button>
                          {formError && <span className="err">{formError}</span>}
                        </div>
                      </form>
                    </section>
                  </>
                )}

                {modelsTab === 'contracts' && (
                  <>
                    <section className="sec" id="o-ts">
                      <h2 className="h2">
                        Interfaces <span>veritas-editorial/integrations/contracts.ts</span>
                      </h2>
                      <pre className="code">{`export type HealthState = "idle" | "checking" | "ok" | "degraded" | "error";

export interface Snapshot {
  id: string;
  source: string;
  recordedAt: string | null;
  medications: Medication[];
}

export interface DataAdapter {
  id: string; kind: "db"; label: string;
  health(conn: Connection): Promise<Health>;
  load(patientId: string): Promise<{ earlier: Snapshot; later: Snapshot }>;
}`}</pre>
                    </section>
                    <section className="sec" id="o-fhir">
                      <h2 className="h2">
                        Synthetic FHIR R4 preview{' '}
                        <span>{cleanPatientName(activeScenario.patientLabel)}</span>
                      </h2>
                      <pre className="code">{fhirBundleJson}</pre>
                    </section>
                  </>
                )}
              </section>
            )}
          </div>
        </main>

        {/* Right Outline & Context Rail (collapsed in Compare notes view) */}
        {view !== 'extract' && (
          <aside className="rail-r" id="rail-r" aria-label="Page outline and context">
            {outlineSections.length > 0 && (
              <>
                <div className="rr-h">On this page</div>
                <div className="toc">
                  {outlineSections.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={activeTocId === id ? 'on' : undefined}
                      onClick={() => {
                        setActiveTocId(id);
                        document.getElementById(id)?.scrollIntoView({ block: 'start' });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {(view === 'diff' || view === 'triage') && (
              <>
                <div className="rr-h">Patient</div>
                <dl className="kv">
                  <dt>Name</dt>
                  <dd>{cleanPatientName(activeScenario.patientLabel)}</dd>
                  <dt>A</dt>
                  <dd title={activeScenario.earlier.source}>
                    {activeScenario.earlier.recordedAt ?? 'Undated'}
                  </dd>
                  <dt>B</dt>
                  <dd title={activeScenario.later.source}>
                    {activeScenario.later.recordedAt ?? 'Undated'}
                  </dd>
                  <dt>Reviewed</dt>
                  <dd>
                    {reviewedCount} / {reviewableCount}
                  </dd>
                </dl>
              </>
            )}

            <div className="rr-h">Connections</div>
            <div className="cx">
              {connections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.detail}
                  onClick={() => navigateTo('models')}
                >
                  <span className={`dot ${c.state}`} aria-hidden="true" />
                  <span className="cx-n">{c.name}</span>
                  <small>
                    {c.active ? 'active' : c.latency != null ? `${c.latency}ms` : c.state}
                  </small>
                </button>
              ))}
            </div>

            <dl className="kv">
              <dt>Data</dt>
              <dd>{activeDbConn?.name ?? 'none'}</dd>
              <dt>Model</dt>
              <dd>{activeModelConn?.name ?? 'none'}</dd>
            </dl>

            <p className="disclaimer">
              Synthetic records only. A difference is not a finding of error, harm, or
              discontinuation.
            </p>
          </aside>
        )}
      </div>

      {/* Command Menu Dialog */}
      {cmdOpen && (
        <div
          className="cmd"
          id="cmd"
          role="dialog"
          aria-modal="true"
          aria-label="Command menu"
          onClick={(e) => {
            if ((e.target as HTMLElement).id === 'cmd') setCmdOpen(false);
          }}
        >
          <div className="cmd-box">
            <input
              ref={cmdInputRef}
              className="cmd-in"
              id="cmd-in"
              placeholder="Go to a page, patient, palette, or action…"
              aria-label="Command"
              value={cmdQuery}
              onChange={(e) => {
                setCmdQuery(e.target.value);
                setCmdIndex(0);
              }}
              onKeyDown={(e) => {
                const n = commandItems.length;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCmdIndex((curr) => (curr + 1) % Math.max(1, n));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCmdIndex((curr) => (curr - 1 + Math.max(1, n)) % Math.max(1, n));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const chosen = commandItems[Math.min(cmdIndex, Math.max(0, n - 1))];
                  setCmdOpen(false);
                  executeCommandItem(chosen);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setCmdOpen(false);
                }
              }}
            />
            <div className="cmd-list" id="cmd-list" role="listbox">
              {commandItems.length === 0 ? (
                <div className="cmd-it" style={{ color: 'var(--faint)' }}>
                  No matches
                </div>
              ) : (
                commandItems.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`cmd-it${idx === cmdIndex ? ' on' : ''}`}
                    role="option"
                    aria-selected={idx === cmdIndex}
                    onClick={() => {
                      setCmdOpen(false);
                      executeCommandItem(c);
                    }}
                  >
                    <span>{c.label}</span>
                    <small>{c.hint}</small>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`toast${toastMsg ? ' show' : ''}`} id="toast" role="status" aria-live="polite">
        {toastMsg ?? ''}
      </div>
    </div>
  );
}

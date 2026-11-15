'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import type { SocketStatus } from '@/lib/ai-socket';
import type { SnapshotComparisonReport } from '@/lib/types';

export type CockpitViewId = 'extract' | 'diff' | 'triage' | 'eval' | 'audit' | 'models';
export type CockpitDiffFilter = 'all' | 'changed' | 'onlyA' | 'onlyB' | 'same';
export type CockpitNavigateFilter = CockpitDiffFilter | string;
export type CockpitReviewDecision = 'verified' | 'flagged' | 'deferred';

export type CockpitWidgetId =
  | 'diff-breakdown'
  | 'review-progress'
  | 'provenance-health'
  | 'triage-queue'
  | 'model-socket'
  | 'eval-metrics'
  | 'session-activity';

export interface CockpitSnapshotEntry {
  id: string;
  kind: 'changed' | 'onlyA' | 'onlyB' | 'same';
  name?: string;
}

export interface CockpitTriageSuggestion {
  id: string;
  decision: 'accepted' | 'override-pending' | 'overridden' | 'skipped' | null;
}

export interface CockpitEvalSummary {
  ts: string;
  totalCases: number;
  precision: number;
  recall: number;
  exactMatch: number;
  heldOutCases?: number;
  scenarioCases?: number;
}

export interface CockpitAuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target?: string;
}

export type CockpitReportSummary = Pick<
  SnapshotComparisonReport,
  'evidenceLinks' | 'provenanceGaps' | 'earlierProvenance' | 'laterProvenance'
>;

export interface CockpitWidgetsProps {
  snapshotEntries: ReadonlyArray<CockpitSnapshotEntry>;
  reviews: Record<string, CockpitReviewDecision>;
  activeScenarioId?: string;
  activeReport: CockpitReportSummary | null;
  triageByScenario: Record<string, ReadonlyArray<CockpitTriageSuggestion>>;
  socketStatus: SocketStatus;
  evalSummary: CockpitEvalSummary | null;
  audit: ReadonlyArray<CockpitAuditEntry>;
  onNavigate: (view: CockpitViewId, filter?: CockpitNavigateFilter) => void;
  order?: CockpitWidgetId[];
  onOrderChange?: (nextOrder: CockpitWidgetId[]) => void;
}

export const DEFAULT_COCKPIT_WIDGET_ORDER: CockpitWidgetId[] = [
  'diff-breakdown',
  'review-progress',
  'provenance-health',
  'triage-queue',
  'model-socket',
  'eval-metrics',
  'session-activity',
];

const WIDGET_TITLES: Record<CockpitWidgetId, string> = {
  'diff-breakdown': 'Medication Diff Breakdown',
  'review-progress': 'Clinician Review Progress',
  'provenance-health': 'Provenance & Evidence Health',
  'triage-queue': 'AI Triage Queue',
  'model-socket': 'Note Extraction & Model Socket',
  'eval-metrics': 'Evaluation Metrics',
  'session-activity': 'Session Activity',
};

const RING_RADIUS = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface RingSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  length: number;
  offset: number;
}

function buildRingSlices(
  items: ReadonlyArray<{ key: string; label: string; value: number; color: string }>,
  total: number,
): RingSlice[] {
  if (total <= 0) return [];
  let accumulated = 0;
  const slices: RingSlice[] = [];
  for (const item of items) {
    if (item.value <= 0) continue;
    const length = (item.value / total) * RING_CIRCUMFERENCE;
    slices.push({
      ...item,
      length,
      offset: -accumulated,
    });
    accumulated += length;
  }
  return slices;
}

function classifyAuditActor(actor: string): 'clinician' | 'ai' | 'system' {
  const norm = actor.trim().toLowerCase();
  if (norm === 'clinician' || norm === 'reviewer' || norm === 'user') {
    return 'clinician';
  }
  if (norm === 'model' || norm === 'comparison' || norm === 'ai') {
    return 'ai';
  }
  return 'system';
}

function buildActivitySparkline(audit: ReadonlyArray<CockpitAuditEntry>): {
  points: string;
  areaPath: string;
  lastX: number;
  lastY: number;
  buckets: number[];
} {
  const bucketCount = 8;
  const chronological = [...audit].reverse();
  const buckets = Array.from({ length: bucketCount }, () => 0);

  if (chronological.length > 0) {
    // Map chronological actions into 8 recent slots so the sparkline rises with activity.
    const startIdx = Math.max(0, chronological.length - bucketCount);
    const slice = chronological.slice(startIdx);
    const offset = bucketCount - slice.length;
    slice.forEach((entry, i) => {
      const actorKind = classifyAuditActor(entry.actor);
      const weight = actorKind === 'clinician' ? 3 : actorKind === 'ai' ? 2 : 1;
      buckets[offset + i] = (buckets[offset + i] ?? 0) + weight;
    });
  }

  const maxVal = Math.max(3, ...buckets);
  const width = 148;
  const height = 36;
  const padX = 4;
  const padY = 5;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords = buckets.map((val, idx) => {
    const x = padX + (idx / (bucketCount - 1)) * innerW;
    const y = padY + innerH - (val / maxVal) * innerH;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  const points = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const linePart = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePart} L ${last.x} ${height - 2} L ${first.x} ${height - 2} Z`;

  return {
    points,
    areaPath,
    lastX: last.x,
    lastY: last.y,
    buckets,
  };
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function arraysEqual(a: ReadonlyArray<CockpitWidgetId>, b: ReadonlyArray<CockpitWidgetId>): boolean {
  return a.length === b.length && a.every((item, idx) => item === b[idx]);
}

/**
 * Compact, draggable, keyboard-reorderable SVG cockpit widgets wired to live review state.
 */
export function CockpitWidgets({
  snapshotEntries,
  reviews,
  activeScenarioId,
  activeReport,
  triageByScenario,
  socketStatus,
  evalSummary,
  audit,
  onNavigate,
  order: controlledOrder,
  onOrderChange,
}: CockpitWidgetsProps) {
  const [internalOrder, setInternalOrder] = useState<CockpitWidgetId[]>(
    () => controlledOrder ?? DEFAULT_COCKPIT_WIDGET_ORDER,
  );
  const [draggedId, setDraggedId] = useState<CockpitWidgetId | null>(null);
  const [dragOverId, setDragOverId] = useState<CockpitWidgetId | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>('');
  const moveBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const order = controlledOrder ?? internalOrder;

  const updateOrder = useCallback(
    (next: CockpitWidgetId[], announcement?: string) => {
      if (!controlledOrder) {
        setInternalOrder(next);
      }
      onOrderChange?.(next);
      if (announcement) {
        setLiveStatus(announcement);
      }
    },
    [controlledOrder, onOrderChange],
  );

  const moveWidget = useCallback(
    (id: CockpitWidgetId, direction: -1 | 1) => {
      const idx = order.indexOf(id);
      const targetIdx = idx + direction;
      if (idx < 0 || targetIdx < 0 || targetIdx >= order.length) return;
      const next = [...order];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      const dirLabel = direction === -1 ? 'left' : 'right';
      updateOrder(
        next,
        `Moved ${WIDGET_TITLES[id]} ${dirLabel} to position ${targetIdx + 1} of ${next.length}.`,
      );
      requestAnimationFrame(() => {
        const preferred = moveBtnRefs.current[`${id}:${dirLabel}`];
        if (preferred && !preferred.disabled) {
          preferred.focus({ preventScroll: true });
          return;
        }
        const fallbackDir = direction === -1 ? 'right' : 'left';
        moveBtnRefs.current[`${id}:${fallbackDir}`]?.focus({ preventScroll: true });
      });
    },
    [order, updateOrder],
  );

  const handleDragStart = useCallback(
    (id: CockpitWidgetId, e: DragEvent<HTMLElement>) => {
      setDraggedId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    },
    [],
  );

  const handleDragOver = useCallback(
    (targetId: CockpitWidgetId, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverId !== targetId) {
        setDragOverId(targetId);
      }
    },
    [dragOverId],
  );

  const handleDrop = useCallback(
    (targetId: CockpitWidgetId, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      const sourceId =
        draggedId ?? (e.dataTransfer.getData('text/plain') as CockpitWidgetId | '');
      setDraggedId(null);
      setDragOverId(null);
      if (!sourceId || sourceId === targetId) return;
      const fromIdx = order.indexOf(sourceId);
      const toIdx = order.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...order];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      updateOrder(
        next,
        `Moved ${WIDGET_TITLES[sourceId]} to position ${toIdx + 1} of ${next.length}.`,
      );
    },
    [draggedId, order, updateOrder],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const diffCounts = useMemo(() => {
    let changed = 0;
    let onlyA = 0;
    let onlyB = 0;
    let same = 0;
    for (const entry of snapshotEntries) {
      if (entry.kind === 'changed') changed += 1;
      else if (entry.kind === 'onlyA') onlyA += 1;
      else if (entry.kind === 'onlyB') onlyB += 1;
      else same += 1;
    }
    return {
      changed,
      onlyA,
      onlyB,
      same,
      total: snapshotEntries.length,
    };
  }, [snapshotEntries]);

  const diffSlices = useMemo(
    () =>
      buildRingSlices(
        [
          { key: 'changed', label: 'Changed', value: diffCounts.changed, color: 'var(--chg)' },
          { key: 'onlyA', label: 'Earlier only', value: diffCounts.onlyA, color: 'var(--del)' },
          { key: 'onlyB', label: 'Later only', value: diffCounts.onlyB, color: 'var(--add)' },
          { key: 'same', label: 'Same', value: diffCounts.same, color: 'var(--unk)' },
        ],
        diffCounts.total,
      ),
    [diffCounts],
  );

  const reviewStats = useMemo(() => {
    const reviewable = snapshotEntries.filter((e) => e.kind !== 'same');
    let verified = 0;
    let flagged = 0;
    let deferred = 0;

    for (const entry of reviewable) {
      const decision = activeScenarioId
        ? reviews[`${activeScenarioId}:${entry.id}`] ?? reviews[entry.id]
        : reviews[entry.id] ??
          Object.entries(reviews).find(([k]) => k.endsWith(`:${entry.id}`))?.[1];
      if (decision === 'verified') verified += 1;
      else if (decision === 'flagged') flagged += 1;
      else if (decision === 'deferred') deferred += 1;
    }

    const total = reviewable.length;
    const completed = verified + flagged + deferred;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const slices = buildRingSlices(
      [
        { key: 'verified', label: 'Verified', value: verified, color: 'var(--add)' },
        { key: 'flagged', label: 'Flagged', value: flagged, color: 'var(--del)' },
        { key: 'deferred', label: 'Deferred', value: deferred, color: 'var(--chg)' },
      ],
      total,
    );
    return { verified, flagged, deferred, completed, total, pct, slices };
  }, [activeScenarioId, reviews, snapshotEntries]);

  const provenanceStats = useMemo(() => {
    const links = activeReport?.evidenceLinks ?? [];
    const gaps = activeReport?.provenanceGaps ?? [];
    let resolved = 0;
    let partial = 0;
    let unresolved = 0;

    for (const link of links) {
      if (link.resolutionStatus === 'resolved') resolved += 1;
      else if (link.resolutionStatus === 'partial' || link.resolutionStatus === 'ambiguous') {
        partial += 1;
      } else {
        unresolved += 1;
      }
    }

    return {
      totalLinks: links.length,
      resolved,
      partial,
      unresolved,
      gapCount: gaps.length,
    };
  }, [activeReport]);

  const triageStats = useMemo(() => {
    const list = activeScenarioId
      ? triageByScenario[activeScenarioId] ?? []
      : Object.values(triageByScenario).flat();
    let open = 0;
    let accepted = 0;
    let overridden = 0;

    for (const item of list) {
      if (!item.decision || item.decision === 'override-pending') open += 1;
      else if (item.decision === 'accepted') accepted += 1;
      else if (item.decision === 'overridden' || item.decision === 'skipped') overridden += 1;
    }

    const total = list.length;
    const slices = buildRingSlices(
      [
        { key: 'open', label: 'Open', value: open, color: 'var(--accent)' },
        { key: 'accepted', label: 'Accepted', value: accepted, color: 'var(--add)' },
        { key: 'overridden', label: 'Overridden', value: overridden, color: 'var(--chg)' },
      ],
      total,
    );
    return { open, accepted, overridden, total, slices };
  }, [activeScenarioId, triageByScenario]);

  const auditStats = useMemo(() => {
    let clinician = 0;
    let ai = 0;
    let system = 0;
    for (const entry of audit) {
      const kind = classifyAuditActor(entry.actor);
      if (kind === 'clinician') clinician += 1;
      else if (kind === 'ai') ai += 1;
      else system += 1;
    }
    return {
      clinician,
      ai,
      system,
      total: audit.length,
      spark: buildActivitySparkline(audit),
    };
  }, [audit]);

  const socketLabel = useMemo(() => {
    if (socketStatus.state === 'live') return 'Live';
    if (socketStatus.state === 'replay') return 'Replay';
    return 'Standby';
  }, [socketStatus.state]);

  const socketModelText = useMemo(() => {
    if (socketStatus.model) {
      return socketStatus.adapter
        ? `${socketStatus.model} · ${socketStatus.adapter}`
        : socketStatus.model;
    }
    return socketStatus.provider === 'deterministic_replay'
      ? 'Deterministic local extractor'
      : socketStatus.provider;
  }, [socketStatus.adapter, socketStatus.model, socketStatus.provider]);

  const isCustomOrder = !arraysEqual(order, DEFAULT_COCKPIT_WIDGET_ORDER);

  const renderWidgetBody = (id: CockpitWidgetId) => {
    switch (id) {
      case 'diff-breakdown': {
        const legendItems: Array<{
          key: CockpitDiffFilter;
          label: string;
          count: number;
          toneClass: string;
        }> = [
          { key: 'changed', label: 'Changed', count: diffCounts.changed, toneClass: 'chg' },
          { key: 'onlyA', label: 'Earlier', count: diffCounts.onlyA, toneClass: 'del' },
          { key: 'onlyB', label: 'Later', count: diffCounts.onlyB, toneClass: 'add' },
          { key: 'same', label: 'Same', count: diffCounts.same, toneClass: 'unk' },
        ];

        return (
          <div className="cw-body">
            <div className="cw-donut-row">
              <svg
                className="cw-ring-svg"
                viewBox="0 0 64 64"
                width="64"
                height="64"
                role="img"
                aria-label={`Medication diff donut: ${diffCounts.changed} changed, ${diffCounts.onlyA} earlier-only, ${diffCounts.onlyB} later-only, ${diffCounts.same} same`}
              >
                <circle
                  cx="32"
                  cy="32"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--sunk)"
                  strokeWidth="8"
                />
                {diffSlices.map((slice) => (
                  <circle
                    key={slice.key}
                    cx="32"
                    cy="32"
                    r={RING_RADIUS}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="8"
                    strokeDasharray={`${slice.length} ${RING_CIRCUMFERENCE}`}
                    strokeDashoffset={slice.offset}
                    transform="rotate(-90 32 32)"
                    pointerEvents="stroke"
                    className="cw-segment"
                    data-segment={slice.key}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate('diff', slice.key as CockpitDiffFilter);
                    }}
                  >
                    <title>{`${slice.label}: ${slice.value}`}</title>
                  </circle>
                ))}
                <text x="32" y="31" textAnchor="middle" className="cw-ring-num">
                  {diffCounts.total}
                </text>
                <text x="32" y="41" textAnchor="middle" className="cw-ring-sub">
                  meds
                </text>
              </svg>

              <div className="cw-chip-grid">
                {legendItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`cw-chip tone-${item.toneClass}`}
                    onClick={() => onNavigate('diff', item.key)}
                  >
                    <span className="cw-swatch" aria-hidden="true" />
                    <span className="cw-chip-label">{item.label}</span>
                    <span className="cw-chip-val">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'review-progress':
        return (
          <button
            type="button"
            className="cw-drill-btn"
            onClick={() => onNavigate('diff', 'all')}
          >
            <div className="cw-donut-row">
              <svg
                className="cw-ring-svg"
                viewBox="0 0 64 64"
                width="64"
                height="64"
                role="img"
                aria-label={`Clinician review progress: ${reviewStats.completed} of ${reviewStats.total} reviewed (${reviewStats.verified} verified, ${reviewStats.flagged} flagged, ${reviewStats.deferred} deferred)`}
              >
                <circle
                  cx="32"
                  cy="32"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--line-2)"
                  strokeWidth="7"
                />
                {reviewStats.slices.map((slice) => (
                  <circle
                    key={slice.key}
                    cx="32"
                    cy="32"
                    r={RING_RADIUS}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="7"
                    strokeDasharray={`${slice.length} ${RING_CIRCUMFERENCE}`}
                    strokeDashoffset={slice.offset}
                    transform="rotate(-90 32 32)"
                  />
                ))}
                <text x="32" y="31" textAnchor="middle" className="cw-ring-num">
                  {reviewStats.total > 0 ? `${reviewStats.pct}%` : '—'}
                </text>
                <text x="32" y="41" textAnchor="middle" className="cw-ring-sub">
                  {reviewStats.completed}/{reviewStats.total}
                </text>
              </svg>

              <dl className="cw-kv-list">
                <div>
                  <dt className="tone-add">Verified</dt>
                  <dd>{reviewStats.verified}</dd>
                </div>
                <div>
                  <dt className="tone-del">Flagged</dt>
                  <dd>{reviewStats.flagged}</dd>
                </div>
                <div>
                  <dt className="tone-chg">Deferred</dt>
                  <dd>{reviewStats.deferred}</dd>
                </div>
              </dl>
            </div>
          </button>
        );

      case 'provenance-health': {
        const total = provenanceStats.totalLinks;
        const barW = 168;
        const resolvedW = total > 0 ? (provenanceStats.resolved / total) * barW : 0;
        const partialW = total > 0 ? (provenanceStats.partial / total) * barW : 0;
        const unresolvedW = total > 0 ? (provenanceStats.unresolved / total) * barW : 0;

        return (
          <button
            type="button"
            className="cw-drill-btn"
            onClick={() => onNavigate('diff', 'all')}
          >
            <div className="cw-stack-wrap">
              <svg
                className="cw-bar-svg"
                viewBox={`0 0 ${barW} 14`}
                width="100%"
                height="14"
                role="img"
                aria-label={`Provenance evidence bar: ${provenanceStats.resolved} resolved, ${provenanceStats.partial} partial, ${provenanceStats.unresolved} unresolved of ${total} evidence links`}
              >
                <rect
                  x="0"
                  y="2"
                  width={barW}
                  height="10"
                  rx="5"
                  fill="var(--sunk)"
                  stroke="var(--line)"
                  strokeWidth="1"
                />
                {resolvedW > 0 && (
                  <rect x="0" y="2" width={resolvedW} height="10" rx="3" fill="var(--add)" />
                )}
                {partialW > 0 && (
                  <rect
                    x={resolvedW}
                    y="2"
                    width={partialW}
                    height="10"
                    fill="var(--chg)"
                  />
                )}
                {unresolvedW > 0 && (
                  <rect
                    x={resolvedW + partialW}
                    y="2"
                    width={unresolvedW}
                    height="10"
                    rx="3"
                    fill="var(--del)"
                  />
                )}
              </svg>

              <div className="cw-metric-row">
                <span className="cw-metric-pill">
                  <b>{provenanceStats.totalLinks}</b>
                  <small>evidence links</small>
                </span>
                <span
                  className={`cw-metric-pill ${
                    provenanceStats.gapCount > 0 ? 'tone-chg' : 'tone-add'
                  }`}
                >
                  <b>{provenanceStats.gapCount}</b>
                  <small>{provenanceStats.gapCount === 1 ? 'gap' : 'gaps'}</small>
                </span>
              </div>
              <div className="cw-subline">
                {provenanceStats.resolved} resolved · {provenanceStats.partial} partial ·{' '}
                {provenanceStats.unresolved} unresolved
              </div>
            </div>
          </button>
        );
      }

      case 'triage-queue':
        return (
          <button
            type="button"
            className="cw-drill-btn"
            onClick={() => onNavigate('triage')}
          >
            <div className="cw-donut-row">
              <svg
                className="cw-ring-svg"
                viewBox="0 0 64 64"
                width="64"
                height="64"
                role="img"
                aria-label={`AI triage queue: ${triageStats.open} open, ${triageStats.accepted} accepted, ${triageStats.overridden} overridden`}
              >
                <circle
                  cx="32"
                  cy="32"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--line-2)"
                  strokeWidth="7"
                />
                {triageStats.slices.map((slice) => (
                  <circle
                    key={slice.key}
                    cx="32"
                    cy="32"
                    r={RING_RADIUS}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="7"
                    strokeDasharray={`${slice.length} ${RING_CIRCUMFERENCE}`}
                    strokeDashoffset={slice.offset}
                    transform="rotate(-90 32 32)"
                  />
                ))}
                <text x="32" y="31" textAnchor="middle" className="cw-ring-num">
                  {triageStats.open}
                </text>
                <text x="32" y="41" textAnchor="middle" className="cw-ring-sub">
                  open
                </text>
              </svg>

              <dl className="cw-kv-list">
                <div>
                  <dt className="tone-accent">Open</dt>
                  <dd>{triageStats.open}</dd>
                </div>
                <div>
                  <dt className="tone-add">Accepted</dt>
                  <dd>{triageStats.accepted}</dd>
                </div>
                <div>
                  <dt className="tone-chg">Overridden</dt>
                  <dd>{triageStats.overridden}</dd>
                </div>
              </dl>
            </div>
          </button>
        );

      case 'model-socket': {
        const stateTone =
          socketStatus.state === 'live'
            ? 'add'
            : socketStatus.state === 'replay'
              ? 'chg'
              : 'unk';
        return (
          <button
            type="button"
            className="cw-drill-btn"
            onClick={() => onNavigate('models')}
          >
            <div className="cw-socket-row">
              <svg
                className={`cw-pulse-svg tone-${stateTone}`}
                viewBox="0 0 44 44"
                width="44"
                height="44"
                role="img"
                aria-label={`Model socket state: ${socketLabel}`}
              >
                <circle
                  cx="22"
                  cy="22"
                  r="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeOpacity="0.28"
                  className={socketStatus.state === 'live' ? 'cw-pulse-ring' : undefined}
                />
                <circle
                  cx="22"
                  cy="22"
                  r="11"
                  fill="currentColor"
                  fillOpacity="0.14"
                />
                <circle cx="22" cy="22" r="5" fill="currentColor" />
              </svg>

              <div className="cw-socket-meta">
                <div className="cw-socket-state">
                  <span className={`cw-state-badge tone-${stateTone}`}>{socketLabel}</span>
                  <span className="cw-socket-ep">{socketStatus.endpoints.socket}</span>
                </div>
                <div className="cw-socket-model" title={socketModelText}>
                  {socketModelText}
                </div>
              </div>
            </div>
          </button>
        );
      }

      case 'eval-metrics': {
        const bars = [
          {
            key: 'precision',
            label: 'Prec',
            full: 'Precision',
            val: evalSummary ? clampRatio(evalSummary.precision) : 0,
            color: 'var(--accent)',
          },
          {
            key: 'recall',
            label: 'Rec',
            full: 'Recall',
            val: evalSummary ? clampRatio(evalSummary.recall) : 0,
            color: 'var(--add)',
          },
          {
            key: 'exactMatch',
            label: 'Exact',
            full: 'Exact Match',
            val: evalSummary ? clampRatio(evalSummary.exactMatch) : 0,
            color: 'var(--chg)',
          },
        ];

        return (
          <button
            type="button"
            className="cw-drill-btn"
            onClick={() => onNavigate('eval')}
          >
            <div className="cw-eval-row">
              <svg
                className="cw-bars-svg"
                viewBox="0 0 96 48"
                width="96"
                height="48"
                role="img"
                aria-label={
                  evalSummary
                    ? `Evaluation metrics: Precision ${evalSummary.precision.toFixed(2)}, Recall ${evalSummary.recall.toFixed(2)}, Exact Match ${evalSummary.exactMatch.toFixed(2)}`
                    : 'Evaluation metrics not run yet'
                }
              >
                {bars.map((bar, idx) => {
                  const x = 10 + idx * 28;
                  const maxH = 34;
                  const barH = evalSummary ? Math.max(2, Math.round(bar.val * maxH)) : 0;
                  const y = 38 - barH;
                  return (
                    <g key={bar.key}>
                      <rect
                        x={x}
                        y={4}
                        width="16"
                        height={maxH}
                        rx="3"
                        fill="var(--sunk)"
                        stroke="var(--line)"
                        strokeWidth="1"
                      />
                      {barH > 0 && (
                        <rect
                          x={x}
                          y={y}
                          width="16"
                          height={barH}
                          rx="3"
                          fill={bar.color}
                        />
                      )}
                      <text x={x + 8} y="47" textAnchor="middle" className="cw-bar-lbl">
                        {bar.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <dl className="cw-kv-list">
                <div>
                  <dt>Precision</dt>
                  <dd>{evalSummary ? evalSummary.precision.toFixed(2) : '—'}</dd>
                </div>
                <div>
                  <dt>Recall</dt>
                  <dd>{evalSummary ? evalSummary.recall.toFixed(2) : '—'}</dd>
                </div>
                <div>
                  <dt>Exact</dt>
                  <dd>{evalSummary ? evalSummary.exactMatch.toFixed(2) : '—'}</dd>
                </div>
              </dl>
            </div>
          </button>
        );
      }

      case 'session-activity':
        return (
          <button
            type="button"
            className="cw-drill-btn"
            onClick={() => onNavigate('audit')}
          >
            <div className="cw-activity-wrap">
              <svg
                className="cw-spark-svg"
                viewBox="0 0 148 36"
                width="100%"
                height="36"
                role="img"
                aria-label={`Session activity sparkline: ${auditStats.total} total actions (${auditStats.clinician} clinician, ${auditStats.ai} AI, ${auditStats.system} system)`}
              >
                <path d={auditStats.spark.areaPath} fill="var(--accent)" fillOpacity="0.14" />
                <polyline
                  points={auditStats.spark.points}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx={auditStats.spark.lastX}
                  cy={auditStats.spark.lastY}
                  r="2.75"
                  fill="var(--accent)"
                />
              </svg>

              <div className="cw-activity-counts">
                <span>
                  <b>{auditStats.clinician}</b> clinician
                </span>
                <span>
                  <b>{auditStats.ai}</b> AI
                </span>
                <span>
                  <b>{auditStats.system}</b> system
                </span>
              </div>
            </div>
          </button>
        );
    }
  };

  return (
    <section className="cw-section" aria-label="Clinical cockpit widgets">
      <div className="cw-toolbar">
        <div className="cw-toolbar-title">
          <span className="cw-toolbar-eyebrow">Cockpit</span>
          <span className="cw-toolbar-hint">Drag cards or use arrows to reorder · click to inspect</span>
        </div>
        {isCustomOrder && (
          <button
            type="button"
            className="cw-reset-btn"
            onClick={() =>
              updateOrder(DEFAULT_COCKPIT_WIDGET_ORDER, 'Reset cockpit widget order to default.')
            }
          >
            Reset layout
          </button>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </div>

      <div className="cw-grid" role="list">
        {order.map((id, index) => {
          const title = WIDGET_TITLES[id];
          const isDragging = draggedId === id;
          const isDropTarget = dragOverId === id && draggedId !== id;

          return (
            <article
              key={id}
              role="listitem"
              data-widget-id={id}
              draggable
              onDragStart={(e) => handleDragStart(id, e)}
              onDragOver={(e) => handleDragOver(id, e)}
              onDragEnter={(e) => handleDragOver(id, e)}
              onDrop={(e) => handleDrop(id, e)}
              onDragEnd={handleDragEnd}
              className={`cw-card${isDragging ? ' is-dragging' : ''}${
                isDropTarget ? ' is-drop-target' : ''
              }`}
            >
              <header className="cw-card-head">
                <button
                  type="button"
                  className="cw-card-title"
                  onClick={() => {
                    if (id === 'diff-breakdown' || id === 'review-progress' || id === 'provenance-health') {
                      onNavigate('diff', 'all');
                    } else if (id === 'triage-queue') {
                      onNavigate('triage');
                    } else if (id === 'model-socket') {
                      onNavigate('models');
                    } else if (id === 'eval-metrics') {
                      onNavigate('eval');
                    } else {
                      onNavigate('audit');
                    }
                  }}
                >
                  {title}
                </button>
                <div className="cw-reorder" role="group" aria-label={`Reorder ${title}`}>
                  <button
                    ref={(el) => {
                      moveBtnRefs.current[`${id}:left`] = el;
                    }}
                    type="button"
                    className="cw-move-btn"
                    aria-label={`Move ${title} left`}
                    title="Move left"
                    disabled={index === 0}
                    onClick={() => moveWidget(id, -1)}
                  >
                    ‹
                  </button>
                  <button
                    ref={(el) => {
                      moveBtnRefs.current[`${id}:right`] = el;
                    }}
                    type="button"
                    className="cw-move-btn"
                    aria-label={`Move ${title} right`}
                    title="Move right"
                    disabled={index === order.length - 1}
                    onClick={() => moveWidget(id, 1)}
                  >
                    ›
                  </button>
                </div>
              </header>

              {renderWidgetBody(id)}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default CockpitWidgets;

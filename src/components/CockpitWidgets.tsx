'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
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

const WIDGET_SUBTITLES: Record<CockpitWidgetId, string> = {
  'diff-breakdown': 'Earlier vs later regimen',
  'review-progress': 'Decisions on changed items',
  'provenance-health': 'Evidence link resolution',
  'triage-queue': 'AI suggestion status',
  'model-socket': 'Extraction runtime',
  'eval-metrics': 'Extraction accuracy',
  'session-activity': 'Recent actions',
};

/** 12-column rhythm: featured cards span 6, compact status cards span 4. */
const WIDGET_SPAN: Record<CockpitWidgetId, 4 | 6> = {
  'diff-breakdown': 6,
  'review-progress': 6,
  'provenance-health': 4,
  'triage-queue': 4,
  'model-socket': 4,
  'eval-metrics': 6,
  'session-activity': 6,
};

type Tone = 'add' | 'del' | 'chg' | 'unk' | 'accent';

interface RingItem {
  key: string;
  label: string;
  value: number;
  color: string;
  tone: Tone;
}

interface RingArc extends RingItem {
  length: number;
  offset: number;
  full: boolean;
}

function computeRingArcs(
  items: ReadonlyArray<RingItem>,
  total: number,
  circumference: number,
  stroke: number,
  rounded: boolean,
): RingArc[] {
  if (total <= 0) return [];
  const visible = items.filter((item) => item.value > 0);
  const gap = visible.length > 1 ? 2.5 : 0;
  const arcs: RingArc[] = [];
  let accumulated = 0;
  for (const item of visible) {
    const frac = item.value / total;
    const slice = frac * circumference;
    const full = visible.length === 1 && frac >= 0.9999;
    arcs.push({
      ...item,
      full,
      length: full ? circumference : Math.max(0.01, slice - gap - (rounded ? stroke : 0)),
      offset: full ? 0 : -(accumulated + gap / 2 + (rounded ? stroke / 2 : 0)),
    });
    accumulated += slice;
  }
  return arcs;
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

const SPARK_W = 260;
const SPARK_H = 76;
const SPARK_TOP = 8;
const SPARK_BASE = 64;

interface Sparkline {
  linePath: string;
  areaPath: string;
  lastX: number;
  lastY: number;
  buckets: number[];
}

function buildActivitySparkline(audit: ReadonlyArray<CockpitAuditEntry>): Sparkline {
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
  const padX = 8;
  const innerW = SPARK_W - padX * 2;
  const innerH = SPARK_BASE - SPARK_TOP;

  const coords = buckets.map((val, idx) => ({
    x: Number((padX + (idx / (bucketCount - 1)) * innerW).toFixed(1)),
    y: Number((SPARK_BASE - (val / maxVal) * innerH).toFixed(1)),
  }));

  // Horizontal-tangent bezier segments: smooth, never overshoots the data.
  let linePath = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i += 1) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const mid = Number(((prev.x + cur.x) / 2).toFixed(1));
    linePath += ` C ${mid} ${prev.y}, ${mid} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L ${last.x} ${SPARK_BASE} L ${first.x} ${SPARK_BASE} Z`;

  return { linePath, areaPath, lastX: last.x, lastY: last.y, buckets };
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function arraysEqual(a: ReadonlyArray<CockpitWidgetId>, b: ReadonlyArray<CockpitWidgetId>): boolean {
  return a.length === b.length && a.every((item, idx) => item === b[idx]);
}

function percentLabel(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '—';
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" focusable="false">
      {[3, 8, 13].map((cy) =>
        [2.5, 7.5].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.15" fill="currentColor" />),
      )}
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path
        d={dir === 'left' ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Ring chart (donut / gauge) with interactive segments + legend       */
/* ------------------------------------------------------------------ */

interface RingChartProps {
  items: ReadonlyArray<RingItem>;
  total: number;
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
  size?: number;
  stroke?: number;
  rounded?: boolean;
  onSelect?: (key: string) => void;
  footer?: ReactNode;
}

function RingChart({
  items,
  total,
  centerValue,
  centerLabel,
  ariaLabel,
  size = 116,
  stroke = 12,
  rounded = false,
  onSelect,
  footer,
}: RingChartProps) {
  const [active, setActive] = useState<string | null>(null);
  const c = size / 2;
  const r = (size - stroke) / 2 - 3;
  const circumference = 2 * Math.PI * r;
  const arcs = computeRingArcs(items, total, circumference, stroke, rounded);
  const activeItem = active ? items.find((item) => item.key === active && item.value > 0) : undefined;

  const shownValue = activeItem ? String(activeItem.value) : centerValue;
  const shownLabel = activeItem
    ? `${activeItem.label} · ${percentLabel(activeItem.value, total)}`
    : centerLabel;

  return (
    <div className="cw-ring-layout">
      <div className="cw-ring" style={{ width: size, height: size }}>
        <svg
          className="cw-ring-svg"
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          role="img"
          aria-label={ariaLabel}
        >
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} opacity="0.85" />
          {arcs.map((arc) => {
            const isActive = active === arc.key;
            const isDim = active !== null && !isActive;
            return (
              <circle
                key={arc.key}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={arc.color}
                strokeWidth={isActive ? stroke + 2 : stroke}
                strokeLinecap={rounded && !arc.full ? 'round' : 'butt'}
                strokeDasharray={`${arc.length} ${circumference}`}
                strokeDashoffset={arc.offset}
                transform={`rotate(-90 ${c} ${c})`}
                pointerEvents="stroke"
                className={`cw-arc${onSelect ? ' is-action' : ''}${isDim ? ' is-dim' : ''}`}
                data-segment={arc.key}
                onMouseEnter={() => setActive(arc.key)}
                onMouseLeave={() => setActive(null)}
                onClick={
                  onSelect
                    ? (e) => {
                        e.stopPropagation();
                        onSelect(arc.key);
                      }
                    : undefined
                }
              >
                <title>{`${arc.label}: ${arc.value}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="cw-ring-center" aria-hidden="true">
          <span className="cw-ring-value">{shownValue}</span>
          <span className="cw-ring-label">{shownLabel}</span>
        </div>
      </div>

      <div className="cw-legend">
        {items.map((item) => {
          const rowClass = `cw-legend-row tone-${item.tone}${active === item.key ? ' is-active' : ''}${
            active !== null && active !== item.key ? ' is-dim' : ''
          }`;
          const content = (
            <>
              <span className="cw-dot" aria-hidden="true" />
              <span className="cw-legend-label">{item.label}</span>
              <span className="cw-legend-val">{item.value}</span>
              <span className="cw-legend-pct">{percentLabel(item.value, total)}</span>
            </>
          );
          return onSelect ? (
            <button
              key={item.key}
              type="button"
              className={`${rowClass} is-action`}
              onClick={() => onSelect(item.key)}
              onMouseEnter={() => setActive(item.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(item.key)}
              onBlur={() => setActive(null)}
            >
              {content}
            </button>
          ) : (
            <div
              key={item.key}
              className={rowClass}
              onMouseEnter={() => setActive(item.key)}
              onMouseLeave={() => setActive(null)}
            >
              {content}
            </div>
          );
        })}
        {footer}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked pill bar                                                    */
/* ------------------------------------------------------------------ */

interface BarSegment {
  key: string;
  value: number;
  color: string;
}

function layoutBar(segments: ReadonlyArray<BarSegment>, total: number, width: number, gap: number) {
  const live = segments.filter((s) => s.value > 0);
  const usable = width - gap * Math.max(0, live.length - 1);
  const rects: Array<{ key: string; x: number; w: number; color: string }> = [];
  let x = 0;
  for (const seg of live) {
    const w = total > 0 ? (seg.value / total) * usable : 0;
    rects.push({ key: seg.key, x, w, color: seg.color });
    x += w + gap;
  }
  return rects;
}

function StackedBar({
  segments,
  total,
  height = 12,
  ariaLabel,
}: {
  segments: ReadonlyArray<BarSegment>;
  total: number;
  height?: number;
  ariaLabel?: string;
}) {
  const width = 240;
  const rects = layoutBar(segments, total, width, 3);
  return (
    <svg
      className="cw-bar-svg"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ aspectRatio: `${width} / ${height}` }}
      {...(ariaLabel ? { role: 'img', 'aria-label': ariaLabel } : { 'aria-hidden': true })}
    >
      <rect x="0" y="0" width={width} height={height} rx={height / 2} fill="var(--sunk)" />
      {rects.map((rect) => (
        <rect
          key={rect.key}
          x={rect.x}
          y="0"
          width={rect.w}
          height={height}
          rx={Math.min(height / 2, rect.w / 2)}
          fill={rect.color}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Activity sparkline (smooth area + line)                             */
/* ------------------------------------------------------------------ */

function ActivitySpark({ spark, ariaLabel, idle }: { spark: Sparkline; ariaLabel: string; idle: boolean }) {
  const gradId = `cw-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const mid = (SPARK_TOP + SPARK_BASE) / 2;
  return (
    <svg
      className="cw-spark-svg"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      width="100%"
      style={{ aspectRatio: `${SPARK_W} / ${SPARK_H}` }}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[SPARK_TOP, mid, SPARK_BASE].map((y, i) => (
        <line
          key={y}
          x1="0"
          x2={SPARK_W}
          y1={y}
          y2={y}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray={i === 2 ? undefined : '2 4'}
        />
      ))}
      <path d={spark.areaPath} fill={`url(#${gradId})`} opacity={idle ? 0.5 : 1} />
      <path
        d={spark.linePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={idle ? 0.5 : 1}
      />
      <circle cx={spark.lastX} cy={spark.lastY} r="6" fill="var(--accent)" opacity="0.16" />
      <circle
        cx={spark.lastX}
        cy={spark.lastY}
        r="3"
        fill="var(--raised)"
        stroke="var(--accent)"
        strokeWidth="2"
      />
    </svg>
  );
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
  const [dragStartOrder, setDragStartOrder] = useState<CockpitWidgetId[]>([]);
  const [liveStatus, setLiveStatus] = useState<string>('');
  const moveBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef<Map<string, DOMRect> | null>(null);
  const dragDirection = useRef<-1 | 0 | 1>(0);
  const lastDragMove = useRef<{ x: number; y: number; axis: 'x' | 'y' } | null>(null);

  const order = controlledOrder ?? internalOrder;
  const orderRef = useRef(order);

  useLayoutEffect(() => {
    orderRef.current = order;
    const before = previousRects.current;
    previousRects.current = null;
    if (!before || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gridRef.current?.querySelectorAll<HTMLElement>('[data-widget-id]').forEach((card) => {
      const old = before.get(card.dataset.widgetId ?? '');
      if (!old) return;
      const now = card.getBoundingClientRect();
      const x = old.left - now.left;
      const y = old.top - now.top;
      if (x || y) card.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }, [order]);

  const updateOrder = useCallback(
    (next: CockpitWidgetId[], announcement?: string) => {
      orderRef.current = next;
      previousRects.current = new Map(
        Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-widget-id]') ?? [],
          (card) => [card.dataset.widgetId ?? '', card.getBoundingClientRect()]),
      );
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
      // Keep the dragged DOM node mounted in place until the native drag ends.
      setDragStartOrder([...orderRef.current]);
      dragDirection.current = 0;
      lastDragMove.current = null;
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
      const current = orderRef.current;
      const from = draggedId ? current.indexOf(draggedId) : -1;
      const to = current.indexOf(targetId);
      if (from >= 0 && to >= 0 && from !== to) {
        const target = e.currentTarget.getBoundingClientRect();
        const source = gridRef.current?.querySelector<HTMLElement>(`[data-widget-id="${draggedId}"]`)?.getBoundingClientRect();
        if (source && target.width && target.height) {
          const sameRow = Math.abs(source.top - target.top) < Math.min(source.height, target.height) / 2;
          const direction = from < to ? 1 : -1;
          const axis = sameRow ? 'x' : 'y';
          const coordinate = axis === 'x' ? e.clientX : e.clientY;
          const lastMove = lastDragMove.current;
          if (lastMove && lastMove.axis === axis && dragDirection.current !== direction &&
              (coordinate - lastMove[axis]) * direction < 12) return;
          // Require a deeper move to reverse direction, preventing jitter at a boundary.
          const distance = dragDirection.current && dragDirection.current !== direction ? 0.65 : 0.55;
          const threshold = direction === 1 ? distance : 1 - distance;
          const pastThreshold = sameRow
            ? (from < to ? e.clientX > target.left + target.width * threshold : e.clientX < target.left + target.width * threshold)
            : (from < to ? e.clientY > target.top + target.height * threshold : e.clientY < target.top + target.height * threshold);
          if (!pastThreshold) return;
        }
        const next = [...current];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        dragDirection.current = from < to ? 1 : -1;
        const sameRow = source && target && Math.abs(source.top - target.top) < Math.min(source.height, target.height) / 2;
        lastDragMove.current = { x: e.clientX, y: e.clientY, axis: sameRow ? 'x' : 'y' };
        updateOrder(next);
      }
    },
    [draggedId, updateOrder],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      const sourceId =
        draggedId ?? (e.dataTransfer.getData('text/plain') as CockpitWidgetId | '');
      setDraggedId(null);
      const position = sourceId ? orderRef.current.indexOf(sourceId) : -1;
      if (sourceId && position >= 0) {
        setLiveStatus(`Moved ${WIDGET_TITLES[sourceId]} to position ${position + 1} of ${orderRef.current.length}.`);
      }
    },
    [draggedId],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
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

  const diffItems = useMemo<RingItem[]>(
    () => [
      { key: 'changed', label: 'Changed', value: diffCounts.changed, color: 'var(--chg)', tone: 'chg' },
      { key: 'onlyA', label: 'Earlier only', value: diffCounts.onlyA, color: 'var(--del)', tone: 'del' },
      { key: 'onlyB', label: 'Later only', value: diffCounts.onlyB, color: 'var(--add)', tone: 'add' },
      { key: 'same', label: 'Same', value: diffCounts.same, color: 'var(--unk)', tone: 'unk' },
    ],
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
    const items: RingItem[] = [
      { key: 'verified', label: 'Verified', value: verified, color: 'var(--add)', tone: 'add' },
      { key: 'flagged', label: 'Flagged', value: flagged, color: 'var(--del)', tone: 'del' },
      { key: 'deferred', label: 'Deferred', value: deferred, color: 'var(--chg)', tone: 'chg' },
    ];
    return { verified, flagged, deferred, completed, total, pct, items };
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
    const items: RingItem[] = [
      { key: 'open', label: 'Open', value: open, color: 'var(--accent)', tone: 'accent' },
      { key: 'accepted', label: 'Accepted', value: accepted, color: 'var(--add)', tone: 'add' },
      { key: 'overridden', label: 'Overridden', value: overridden, color: 'var(--chg)', tone: 'chg' },
    ];
    return { open, accepted, overridden, total, items };
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
      case 'diff-breakdown':
        return (
          <div className="cw-body">
            <RingChart
              items={diffItems}
              total={diffCounts.total}
              centerValue={String(diffCounts.total)}
              centerLabel="medications"
              size={136}
              stroke={14}
              ariaLabel={`Medication diff donut: ${diffCounts.changed} changed, ${diffCounts.onlyA} earlier-only, ${diffCounts.onlyB} later-only, ${diffCounts.same} same`}
              onSelect={(key) => onNavigate('diff', key as CockpitDiffFilter)}
            />
          </div>
        );

      case 'review-progress':
        return (
          <button type="button" className="cw-drill-btn" onClick={() => onNavigate('diff', 'all')}>
            <RingChart
              items={reviewStats.items}
              total={reviewStats.total}
              centerValue={reviewStats.total > 0 ? `${reviewStats.pct}%` : '—'}
              centerLabel={`${reviewStats.completed} of ${reviewStats.total} reviewed`}
              size={136}
              stroke={11}
              rounded
              ariaLabel={`Clinician review progress: ${reviewStats.completed} of ${reviewStats.total} reviewed (${reviewStats.verified} verified, ${reviewStats.flagged} flagged, ${reviewStats.deferred} deferred)`}
              footer={
                <div className="cw-legend-note">
                  <span>Pending</span>
                  <b>{Math.max(0, reviewStats.total - reviewStats.completed)}</b>
                </div>
              }
            />
          </button>
        );

      case 'provenance-health': {
        const total = provenanceStats.totalLinks;
        const resolvedPct = percentLabel(provenanceStats.resolved, total);
        const pills: Array<{ key: string; label: string; value: number; tone: Tone; color: string }> = [
          { key: 'resolved', label: 'Resolved', value: provenanceStats.resolved, tone: 'add', color: 'var(--add)' },
          { key: 'partial', label: 'Partial', value: provenanceStats.partial, tone: 'chg', color: 'var(--chg)' },
          { key: 'unresolved', label: 'Unresolved', value: provenanceStats.unresolved, tone: 'del', color: 'var(--del)' },
        ];

        return (
          <button type="button" className="cw-drill-btn" onClick={() => onNavigate('diff', 'all')}>
            <div className="cw-stack-wrap">
              <div className="cw-hero-row">
                <div className="cw-hero">
                  <span className="cw-hero-num">{resolvedPct}</span>
                  <span className="cw-hero-cap">resolved</span>
                </div>
                <div className="cw-hero-side">
                  <span className="cw-hero-meta">
                    <b>{total}</b> {total === 1 ? 'link' : 'links'}
                  </span>
                  <span className={`cw-gap-pill ${provenanceStats.gapCount > 0 ? 'tone-chg' : 'tone-add'}`}>
                    <span className="cw-dot" aria-hidden="true" />
                    {provenanceStats.gapCount} {provenanceStats.gapCount === 1 ? 'gap' : 'gaps'}
                  </span>
                </div>
              </div>

              <StackedBar
                segments={pills.map((p) => ({ key: p.key, value: p.value, color: p.color }))}
                total={total}
                height={12}
                ariaLabel={`Provenance evidence bar: ${provenanceStats.resolved} resolved, ${provenanceStats.partial} partial, ${provenanceStats.unresolved} unresolved of ${total} evidence links`}
              />

              <div className="cw-pill-row">
                {pills.map((pill) => (
                  <span key={pill.key} className={`cw-pill tone-${pill.tone}`}>
                    <span className="cw-dot" aria-hidden="true" />
                    <b>{pill.value}</b>
                    <small>{pill.label}</small>
                  </span>
                ))}
              </div>
            </div>
          </button>
        );
      }

      case 'triage-queue':
        return (
          <button type="button" className="cw-drill-btn" onClick={() => onNavigate('triage')}>
            <RingChart
              items={triageStats.items}
              total={triageStats.total}
              centerValue={String(triageStats.open)}
              centerLabel="open"
              size={96}
              stroke={9}
              ariaLabel={`AI triage queue: ${triageStats.open} open, ${triageStats.accepted} accepted, ${triageStats.overridden} overridden`}
              footer={
                <div className="cw-legend-note">
                  <span>Resolved</span>
                  <b>
                    {triageStats.accepted + triageStats.overridden}/{triageStats.total}
                  </b>
                </div>
              }
            />
          </button>
        );

      case 'model-socket': {
        const stateTone: Tone =
          socketStatus.state === 'live' ? 'add' : socketStatus.state === 'replay' ? 'chg' : 'unk';
        return (
          <button type="button" className="cw-drill-btn" onClick={() => onNavigate('models')}>
            <div className="cw-socket">
              <div className={`cw-socket-head tone-${stateTone}`}>
                <svg
                  className="cw-pulse-svg"
                  viewBox="0 0 56 56"
                  width="56"
                  height="56"
                  role="img"
                  aria-label={`Model socket state: ${socketLabel}`}
                >
                  {socketStatus.state === 'live' && (
                    <>
                      <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="1.5" className="cw-pulse-ring" />
                      <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="1.5" className="cw-pulse-ring is-late" />
                    </>
                  )}
                  <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="1.25" strokeOpacity="0.22" />
                  <circle cx="28" cy="28" r="14" fill="currentColor" fillOpacity="0.12" />
                  <circle cx="28" cy="28" r="6" fill="currentColor" />
                </svg>
                <div className="cw-socket-meta">
                  <span className="cw-state-badge">
                    <span className="cw-dot" aria-hidden="true" />
                    {socketLabel}
                  </span>
                  <span className="cw-socket-model" title={socketModelText}>
                    {socketModelText}
                  </span>
                </div>
              </div>
              <div className="cw-socket-chips">
                <span className="cw-mini-chip" title="Socket endpoint">
                  {socketStatus.endpoints.socket}
                </span>
                <span className="cw-mini-chip">{socketStatus.simulated ? 'simulated' : 'direct'}</span>
                <span className="cw-mini-chip">{socketStatus.model_loaded ? 'model loaded' : 'no model'}</span>
              </div>
            </div>
          </button>
        );
      }

      case 'eval-metrics': {
        const bars = [
          {
            key: 'precision',
            label: 'Precision',
            val: evalSummary ? clampRatio(evalSummary.precision) : 0,
            raw: evalSummary ? evalSummary.precision.toFixed(2) : '—',
            color: 'var(--accent)',
          },
          {
            key: 'recall',
            label: 'Recall',
            val: evalSummary ? clampRatio(evalSummary.recall) : 0,
            raw: evalSummary ? evalSummary.recall.toFixed(2) : '—',
            color: 'var(--add)',
          },
          {
            key: 'exactMatch',
            label: 'Exact match',
            val: evalSummary ? clampRatio(evalSummary.exactMatch) : 0,
            raw: evalSummary ? evalSummary.exactMatch.toFixed(2) : '—',
            color: 'var(--chg)',
          },
        ];
        const trackTop = 24;
        const trackH = 66;
        const barW = 46;

        return (
          <button type="button" className="cw-drill-btn" onClick={() => onNavigate('eval')}>
            <div className="cw-eval-row">
              <svg
                className="cw-bars-svg"
                viewBox="0 0 240 118"
                width="100%"
                style={{ aspectRatio: '240 / 118' }}
                role="img"
                aria-label={
                  evalSummary
                    ? `Evaluation metrics: Precision ${evalSummary.precision.toFixed(2)}, Recall ${evalSummary.recall.toFixed(2)}, Exact Match ${evalSummary.exactMatch.toFixed(2)}`
                    : 'Evaluation metrics not run yet'
                }
              >
                <line
                  x1="0"
                  x2="240"
                  y1={trackTop + trackH / 2}
                  y2={trackTop + trackH / 2}
                  stroke="var(--line-2)"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                />
                {bars.map((bar, idx) => {
                  const cx = 40 + idx * 80;
                  const x = cx - barW / 2;
                  const fillH = evalSummary ? Math.max(4, bar.val * trackH) : 0;
                  return (
                    <g key={bar.key}>
                      <text x={cx} y="14" textAnchor="middle" className="cw-bar-val">
                        {bar.raw}
                      </text>
                      <rect x={x} y={trackTop} width={barW} height={trackH} rx="7" fill="var(--sunk)" />
                      {fillH > 0 && (
                        <rect
                          x={x}
                          y={trackTop + trackH - fillH}
                          width={barW}
                          height={fillH}
                          rx="7"
                          fill={bar.color}
                        />
                      )}
                      <text x={cx} y="110" textAnchor="middle" className="cw-bar-lbl">
                        {bar.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <dl className="cw-stat-list">
                <div>
                  <dt>Total</dt>
                  <dd>{evalSummary ? `${evalSummary.totalCases} cases` : '—'}</dd>
                </div>
                <div>
                  <dt>Held-out</dt>
                  <dd>{evalSummary?.heldOutCases != null ? `${evalSummary.heldOutCases} cases` : '—'}</dd>
                </div>
                <div>
                  <dt>Scenario</dt>
                  <dd>{evalSummary?.scenarioCases != null ? `${evalSummary.scenarioCases} cases` : '—'}</dd>
                </div>
              </dl>
            </div>
          </button>
        );
      }

      case 'session-activity': {
        const mix: BarSegment[] = [
          { key: 'clinician', value: auditStats.clinician, color: 'var(--accent)' },
          { key: 'ai', value: auditStats.ai, color: 'var(--add)' },
          { key: 'system', value: auditStats.system, color: 'var(--unk)' },
        ];
        return (
          <button type="button" className="cw-drill-btn" onClick={() => onNavigate('audit')}>
            <div className="cw-activity-wrap">
              <div className="cw-hero-row">
                <div className="cw-hero">
                  <span className="cw-hero-num">{auditStats.total}</span>
                  <span className="cw-hero-cap">{auditStats.total === 1 ? 'action' : 'actions'}</span>
                </div>
                <div className="cw-activity-counts">
                  <span className="tone-accent">
                    <span className="cw-dot" aria-hidden="true" />
                    <b>{auditStats.clinician}</b> clinician
                  </span>
                  <span className="tone-add">
                    <span className="cw-dot" aria-hidden="true" />
                    <b>{auditStats.ai}</b> AI
                  </span>
                  <span className="tone-unk">
                    <span className="cw-dot" aria-hidden="true" />
                    <b>{auditStats.system}</b> system
                  </span>
                </div>
              </div>

              <ActivitySpark
                spark={auditStats.spark}
                idle={auditStats.total === 0}
                ariaLabel={`Session activity sparkline: ${auditStats.total} total actions (${auditStats.clinician} clinician, ${auditStats.ai} AI, ${auditStats.system} system)`}
              />

              <StackedBar segments={mix} total={auditStats.total} height={5} />
            </div>
          </button>
        );
      }
    }
  };

  return (
    <section className="cw-section" aria-label="Clinical cockpit widgets">
      <div className="cw-toolbar">
        <div className="cw-toolbar-title">
          <span className="cw-toolbar-eyebrow">Cockpit</span>
          <span className="cw-toolbar-hint">Drag cards or use arrows to reorder · tap a title to inspect</span>
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

      <div className="cw-grid" role="list" ref={gridRef}>
        {(draggedId ? dragStartOrder : order).map((id) => {
          const index = order.indexOf(id);
          const title = WIDGET_TITLES[id];
          const isDragging = draggedId === id;

          return (
            <article
              key={id}
              role="listitem"
              data-widget-id={id}
              style={draggedId ? { order: index } : undefined}
              draggable
              onDragStart={(e) => handleDragStart(id, e)}
              onDragOver={(e) => handleDragOver(id, e)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              className={`cw-card cw-w-${WIDGET_SPAN[id]}${isDragging ? ' is-dragging' : ''}`}
            >
              <header className="cw-card-head">
                <span className="cw-grip" aria-hidden="true" title="Drag to reorder">
                  <GripIcon />
                </span>
                <div className="cw-card-heading">
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
                  <span className="cw-card-sub">{WIDGET_SUBTITLES[id]}</span>
                </div>
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
                    <ChevronIcon dir="left" />
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
                    <ChevronIcon dir="right" />
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

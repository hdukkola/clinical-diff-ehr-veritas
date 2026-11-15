import type { ReactNode } from 'react';
import './widget-shell.css';

/**
 * DESIGN MOCK — reusable widget shell (DESIGN-SONNET-001).
 * Static, server-compatible, no data fetching, no working actions.
 * Maps onto the existing 12-column grid: compact=3, standard=6, wide=9, full=12.
 */

export type WidgetSpan = 'compact' | 'standard' | 'wide' | 'full';
export type WidgetHeight = 'regular' | 'tall';
export type WidgetState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'unavailable'
  | 'error'
  | 'stale'
  | 'partial'
  | 'restricted';
/** Whether a surface exists today, is proposed, or is only a mock in this preview. */
export type WidgetProvenance = 'current' | 'proposed' | 'mocked';

export const SPAN_COLUMNS: Record<WidgetSpan, 3 | 6 | 9 | 12> = {
  compact: 3,
  standard: 6,
  wide: 9,
  full: 12,
};

/** Closest existing `WidgetSize` (cockpit.ts) for each proposed span. */
export const SPAN_TO_EXISTING_SIZE: Record<WidgetSpan, 'small' | 'medium' | 'large' | 'full'> = {
  compact: 'small',
  standard: 'medium',
  wide: 'large',
  full: 'full',
};

export const STATE_META: Record<WidgetState, { glyph: string; label: string; message: string }> = {
  ready: { glyph: '●', label: 'Ready', message: '' },
  loading: { glyph: '◌', label: 'Loading', message: 'Loading source-backed data.' },
  empty: {
    glyph: '○',
    label: 'Empty',
    message: 'Nothing to show for this patient and period. This is not a negative finding.',
  },
  unavailable: {
    glyph: '⊘',
    label: 'Unavailable',
    message: 'The source is unavailable. Absence of data is not evidence of absence.',
  },
  error: {
    glyph: '▲',
    label: 'Error',
    message: 'This widget could not be loaded. Retry, or open the source directly.',
  },
  stale: {
    glyph: '◷',
    label: 'Stale',
    message: 'Showing the last successful load; it may not reflect recent changes.',
  },
  partial: {
    glyph: '◐',
    label: 'Partial',
    message: 'Some inputs are missing; values below are incomplete and are not extrapolated.',
  },
  restricted: {
    glyph: '■',
    label: 'Restricted',
    message: 'Your role does not have permission to view this content.',
  },
};

const PROVENANCE_LABEL: Record<WidgetProvenance, string> = {
  current: 'Current feature',
  proposed: 'Proposed',
  mocked: 'Mock data',
};

export interface WidgetShellProps {
  /** Stable id, used for aria-labelledby. */
  id: string;
  title: string;
  /** Decorative glyph only; never the sole carrier of meaning. */
  icon?: string;
  span?: WidgetSpan;
  height?: WidgetHeight;
  state?: WidgetState;
  provenance: WidgetProvenance;
  /** One short line of context (patient, period, scope). */
  context?: string;
  /** Overrides the default message for non-ready states. */
  stateDetail?: string;
  children?: ReactNode;
  /** Required: every widget names its source. */
  source: string;
  /** e.g. "Updated 09:42" or "Mock — not measured". */
  freshness?: string;
  /** Footer action label. Rendered disabled in this design mock. */
  actionLabel?: string;
}

export function WidgetShell({
  id,
  title,
  icon,
  span = 'standard',
  height = 'regular',
  state = 'ready',
  provenance,
  context,
  stateDetail,
  children,
  source,
  freshness,
  actionLabel,
}: WidgetShellProps) {
  const titleId = `${id}-title`;
  const meta = STATE_META[state];
  const showsContent = state === 'ready' || state === 'stale' || state === 'partial';

  return (
    <section
      className="ws"
      data-widget-id={id}
      data-span={span}
      data-height={height}
      data-state={state}
      aria-labelledby={titleId}
      aria-busy={state === 'loading' ? true : undefined}
    >
      <header className="ws-head">
        <h3 id={titleId} className="ws-title">
          {icon && (
            <span className="ws-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          {title}
        </h3>
        <span className="ws-chips">
          <span className="ws-chip" data-kind="provenance" data-prov={provenance}>
            {PROVENANCE_LABEL[provenance]}
          </span>
          <span className="ws-chip" data-kind="state" data-state={state}>
            <span aria-hidden="true">{meta.glyph}</span> {meta.label}
          </span>
        </span>
      </header>

      {context && <p className="ws-context">{context}</p>}

      {(state === 'stale' || state === 'partial') && (
        <p className="ws-banner" role="status">
          {stateDetail ?? meta.message}
        </p>
      )}

      <div className="ws-body" role="region" aria-label={`${title} content`} tabIndex={0}>
        {showsContent ? (
          children
        ) : state === 'loading' ? (
          <div className="ws-skeleton">
            <span className="sr-only">Loading {title}</span>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </div>
        ) : (
          <div className="ws-state-panel">
            <strong>{meta.label}</strong>
            <p>{stateDetail ?? meta.message}</p>
          </div>
        )}
      </div>

      <footer className="ws-foot">
        <span className="ws-source">
          Source: {source}
          {freshness ? ` · ${freshness}` : ''}
        </span>
        {actionLabel && (
          <button
            type="button"
            className="ws-action"
            disabled
            aria-disabled="true"
            title="Design mock — not wired to app state"
          >
            {actionLabel}
          </button>
        )}
      </footer>
    </section>
  );
}

export function WidgetGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="ws-grid" role="group" aria-label={label}>
      {children}
    </div>
  );
}

import {
  MOCK_COMPLETENESS,
  MOCK_EVIDENCE_ROWS,
  MOCK_REVIEW_COUNTS,
  MOCK_TIMELINE,
} from './mock-data';

/** Example bodies that live inside the same WidgetShell. All mock, all static. */

export function MetricBody({
  value,
  denominator,
  label,
  note,
}: {
  value: number;
  denominator: number;
  label: string;
  note: string;
}) {
  return (
    <div className="ws-metric">
      <p className="ws-metric-value">
        <span>{value}</span>
        <span className="ws-metric-of"> of {denominator}</span>
      </p>
      <p className="ws-metric-label">{label}</p>
      <p className="ws-metric-note">{note}</p>
    </div>
  );
}

export function EvidenceListBody() {
  return (
    <ul className="ws-evidence" aria-label="Source-backed changes">
      {MOCK_EVIDENCE_ROWS.map((row) => (
        <li key={row.id} className="ws-evidence-item" data-relation={row.relation}>
          <div className="ws-evidence-top">
            <strong>{row.medication}</strong>
            <span className="ws-evidence-change">{row.change}</span>
            <span className="ws-tag" data-relation={row.relation}>
              {row.relationLabel}
            </span>
          </div>
          <dl className="ws-evidence-pair">
            <div>
              <dt>Earlier</dt>
              <dd>
                {row.earlier ? (
                  <>
                    “{row.earlier.excerpt}”
                    <small>
                      {row.earlier.source} · {row.earlier.date}
                    </small>
                  </>
                ) : (
                  <em>No earlier mention</em>
                )}
              </dd>
            </div>
            <div>
              <dt>Later</dt>
              <dd>
                {row.later ? (
                  <>
                    “{row.later.excerpt}”
                    <small>
                      {row.later.source} · {row.later.date}
                    </small>
                  </>
                ) : (
                  <em>No later mention</em>
                )}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

const SLICE_SHADES = ['var(--add)', 'var(--chg)', 'var(--unk)', 'var(--line-2)'];

/** Donut for parts of a defined whole (reviewed/unreviewed). Counts and denominator are always shown as text. */
export function DonutBody() {
  const { parts, denominator } = MOCK_REVIEW_COUNTS;
  const stops = parts.map((p, i) => {
    const before = parts.slice(0, i).reduce((n, q) => n + q.count, 0);
    const start = (before / denominator) * 360;
    const end = ((before + p.count) / denominator) * 360;
    return `${SLICE_SHADES[i]} ${start}deg ${end}deg`;
  });
  const summary = parts.map((p) => `${p.label} ${p.count}`).join(', ');
  return (
    <figure className="ws-chart">
      <div
        className="ws-donut"
        role="img"
        aria-label={`Review status of ${denominator} items: ${summary}.`}
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
      >
        <span className="ws-donut-hole">
          {denominator}
          <small>items</small>
        </span>
      </div>
      <figcaption>
        <ul className="ws-legend">
          {parts.map((p, i) => (
            <li key={p.key}>
              <span className="ws-swatch" style={{ background: SLICE_SHADES[i] }} aria-hidden="true" />
              {p.label}: <strong>{p.count}</strong>
              <span className="ws-legend-pct"> ({Math.round((p.count / denominator) * 100)}%)</span>
            </li>
          ))}
        </ul>
        <details className="ws-data-table">
          <summary>Show data table</summary>
          <table>
            <caption>Review status, denominator {denominator} (mock)</caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Count</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.key}>
                  <th scope="row">{p.label}</th>
                  <td>{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}

/** Bars for comparing counts against a shared denominator. */
export function CompletenessBarsBody() {
  return (
    <ul className="ws-bars" aria-label="Data completeness by field">
      {MOCK_COMPLETENESS.map((r) => (
        <li key={r.label}>
          <div className="ws-bar-label">
            <span>{r.label}</span>
            <span className="ws-bar-count">
              {r.have} of {r.of}
              {r.have < r.of ? ` · ${r.of - r.have} missing` : ' · complete'}
            </span>
          </div>
          <div
            className="ws-bar-track"
            role="meter"
            aria-label={r.label}
            aria-valuemin={0}
            aria-valuemax={r.of}
            aria-valuenow={r.have}
            aria-valuetext={`${r.have} of ${r.of}`}
          >
            <span style={{ width: `${(r.have / r.of) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TimelineBody() {
  return (
    <ol className="ws-timeline" aria-label="Encounters, oldest first">
      {MOCK_TIMELINE.map((t) => (
        <li key={t.date}>
          <time dateTime={t.date}>{t.date}</time>
          <strong>{t.kind}</strong>
          <span>{t.detail}</span>
        </li>
      ))}
    </ol>
  );
}

export function ShortcutsBody() {
  const items = ['Compare notes', 'Snapshot review', 'Review suggestions', 'Evaluations'];
  return (
    <ul className="ws-shortcuts" aria-label="Workflow shortcuts (mock)">
      {items.map((label) => (
        <li key={label}>
          <button type="button" disabled aria-disabled="true" title="Design mock — not wired to app navigation">
            {label}
          </button>
        </li>
      ))}
    </ul>
  );
}

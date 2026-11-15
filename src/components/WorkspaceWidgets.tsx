import type { ReactNode } from 'react';
import styles from './WorkspaceWidgets.module.css';

export type WorkspaceWidget = {
  title: string;
  value?: ReactNode;
  detail?: ReactNode;
  action?: { label: string; run: () => void };
  wide?: boolean;
};

export function WorkspaceWidgets({
  title,
  widgets,
  overview = false,
}: {
  title: string;
  widgets: WorkspaceWidget[];
  overview?: boolean;
}) {
  const byTitle = (name: string) => widgets.find((widget) => widget.title === name);
  const ratioText = byTitle(title === 'Patient summary' ? 'Recorded decisions' : 'Review completion')?.value;
  const ratioMatch = typeof ratioText === 'string' ? /^(\d+)\s*\/\s*(\d+)$/.exec(ratioText) : null;
  const pending = byTitle('Medication review')?.value;
  const decided = byTitle('Review worklist')?.value;
  const ratio = ratioMatch ? { done: Number(ratioMatch[1]), total: Number(ratioMatch[2]) }
    : title === 'Workspace overview' && typeof pending === 'number' && typeof decided === 'number'
      ? { done: decided, total: pending + decided } : null;
  const validRatio = ratio && ratio.total >= ratio.done && ratio.done >= 0 ? ratio : null;
  const breakdown = title === 'Snapshot tools' ? [
    { widget: byTitle('Dose or field changes'), label: 'Changed fields', color: 'changed' },
    { widget: byTitle('Only in earlier list'), label: 'Earlier only', color: 'earlier' },
    { widget: byTitle('Only in later list'), label: 'Later only', color: 'later' },
    { widget: byTitle('Matching entries'), label: 'Matching', color: 'matching' },
  ] : [];
  const hasBreakdown = breakdown.length > 0 && breakdown.every(({ widget }) => typeof widget?.value === 'number' && Number.isFinite(widget.value) && widget.value >= 0);
  const totalEntries = hasBreakdown ? breakdown.reduce((sum, { widget }) => sum + (widget?.value as number), 0) : 0;

  return (
    <section id="page-widgets" className={overview ? 'page-widgets overview-widgets' : 'page-widgets'}
      aria-labelledby="page-widgets-title">
      <h2 id="page-widgets-title" className="page-widgets-title" tabIndex={-1}>{title}</h2>
      {validRatio && (
        <div className={styles.summary} aria-label="Review progress">
          <div className={styles.summaryHeader}><span>Review progress</span><strong>{validRatio.done} / {validRatio.total}</strong></div>
          {validRatio.total > 0 ? <>
            <div className={styles.progress} role="progressbar" aria-label="Review decisions recorded" aria-valuemin={0} aria-valuemax={validRatio.total} aria-valuenow={validRatio.done} aria-valuetext={`${validRatio.done} of ${validRatio.total} reviewable changes have a decision`}>
              <span style={{ width: `${(validRatio.done / validRatio.total) * 100}%` }} />
            </div>
            <p>{validRatio.total - validRatio.done} awaiting a decision · includes verified, flagged and deferred decisions</p>
          </> : <p>No reviewable changes in this comparison.</p>}
        </div>
      )}
      {hasBreakdown && (
        <div className={styles.summary} aria-label="Snapshot comparison breakdown">
          <div className={styles.summaryHeader}><span>Snapshot breakdown</span><strong>{totalEntries} entries</strong></div>
          <p>Entries by comparison category; earlier-only does not mean stopped.</p>
          {totalEntries > 0 && <div className={styles.segmented} aria-hidden="true">
            {breakdown.map(({ widget, color }) => <span key={color} className={styles[color]} style={{ width: `${((widget?.value as number) / totalEntries) * 100}%` }} />)}
          </div>}
          <div className={styles.legend}>
            {breakdown.map(({ widget, label, color }) => (
              <button key={color} type="button" disabled={!widget?.action} onClick={widget?.action?.run}>
                <span className={`${styles.dot} ${styles[color]}`} aria-hidden="true" />{label}<strong>{widget?.value}</strong>
              </button>
            ))}
          </div>
          {totalEntries === 0 && <p>No entries to compare.</p>}
        </div>
      )}
      <div className="page-widget-grid">
        {widgets.map(({ title, value, detail, action, wide }) => (
          <article key={title} className={wide ? 'page-widget page-widget-wide' : 'page-widget'}>
            <h3>{title}</h3>
            {value != null && <div className="page-widget-value">{value}</div>}
            {detail != null && <div className="page-widget-detail">{detail}</div>}
            {action && (
              <button type="button" className="page-widget-action" onClick={action.run}>
                {action.label}<span aria-hidden="true">↗</span>
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

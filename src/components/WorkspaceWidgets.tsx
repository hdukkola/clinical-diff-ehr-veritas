import type { ReactNode } from 'react';

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
  return (
    <section id="page-widgets" className={overview ? 'page-widgets overview-widgets' : 'page-widgets'}
      aria-labelledby="page-widgets-title">
      <h2 id="page-widgets-title" className="page-widgets-title" tabIndex={-1}>{title}</h2>
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

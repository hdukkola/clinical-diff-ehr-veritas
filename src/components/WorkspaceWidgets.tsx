'use client';

import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';

export type WorkspaceWidget = {
  title: string;
  value?: ReactNode;
  detail?: ReactNode;
  action?: { label: string; run: () => void };
};

const layoutEvent = 'diffmd-widget-layout-change';
const noSavedLayout = () => null;

function subscribeLayout(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(layoutEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(layoutEvent, onChange);
  };
}

export function WorkspaceWidgets({
  pageId, title, widgets, hasPageNote,
}: {
  pageId: string;
  title: string;
  widgets: WorkspaceWidget[];
  hasPageNote: boolean;
}) {
  const storageKey = `diffmd-widget-layout-v1:${pageId}`;
  const getSavedLayout = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);
  const savedLayout = useSyncExternalStore(subscribeLayout, getSavedLayout, noSavedLayout);
  const [inMemoryLayout, setInMemoryLayout] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const catalog = new Map(widgets.map((widget) => [widget.title, widget]));
  const defaults = widgets.slice(0, 3).map((item) => item.title);
  let visible = inMemoryLayout;
  if (!visible && savedLayout) {
    try {
      const decoded: unknown = JSON.parse(savedLayout);
      if (Array.isArray(decoded)) visible = [...new Set(decoded.filter((item): item is string => typeof item === 'string' && catalog.has(item)))];
    } catch {
      // Restore the defaults if the browser entry is damaged.
    }
  }
  const pinned = visible ?? (hasPageNote ? [...defaults, 'Page note'] : defaults);

  function apply(next: string[]) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setInMemoryLayout(null);
      window.dispatchEvent(new Event(layoutEvent));
    } catch {
      setInMemoryLayout(next);
    }
  }

  function move(from: string, to: string) {
    const index = pinned.indexOf(to);
    if (from === to || index < 0 || !pinned.includes(from)) return;
    const next = pinned.filter((title) => title !== from);
    next.splice(index, 0, from);
    apply(next);
    setAnnouncement(`Moved ${from} to position ${index + 1} of ${next.length}.`);
  }

  function endDrag() {
    setDragging(null);
    setDropTarget(null);
  }

  return (
    <section id="page-widgets" className="page-widgets" aria-labelledby="page-widgets-title">
      <header className="page-widgets-header">
        <h2 id="page-widgets-title" className="page-widgets-title" tabIndex={-1}>{title}</h2>
        <button type="button" className="btn" onClick={() => setEditing(!editing)}
          aria-expanded={editing} aria-controls="page-widget-catalog">
          {editing ? 'Done editing' : 'Add widgets'}
        </button>
      </header>
      {editing && (
        <fieldset className="page-widget-catalog" id="page-widget-catalog">
          <legend>Widgets on this page</legend>
          {widgets.map(({ title }) => (
            <label key={title}>
              <input type="checkbox" checked={pinned.includes(title)}
                onChange={(event) => apply(event.target.checked ? [...pinned, title] : pinned.filter((item) => item !== title))} />
              {title}
            </label>
          ))}
          <button type="button" className="btn" onClick={() => apply(defaults)}>Reset widget layout</button>
        </fieldset>
      )}
      <div className="sr-only" role="status">{announcement}</div>
      <div className="page-widget-grid">
        {pinned.map((id, index) => {
          const widget = catalog.get(id);
          if (!widget) return null;
          const { title, value, detail, action } = widget;
          return (
            <article key={id} className="page-widget" data-page-widget={id}
              data-dragging={dragging === id || undefined} data-drop-target={dropTarget === id || undefined}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(id === dragging ? null : id);
              }}
              onDrop={(event) => {
                if (!dragging) return;
                event.preventDefault();
                move(dragging, id);
                endDrag();
              }}>
              <header className="page-widget-head">
                <h3>{title}</h3>
                {pinned.length > 1 && <span className="page-widget-grip" draggable title={`Drag ${title} to move`}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', id);
                    setDragging(id);
                  }}
                  onDragEnd={endDrag} aria-hidden="true">⠿</span>}
              </header>
              {value != null && <div className="page-widget-value">{value}</div>}
              {detail != null && <div className="page-widget-detail">{detail}</div>}
              {action && (
                <button type="button" className="page-widget-action" onClick={action.run}>
                  {action.label}<span aria-hidden="true">↗</span>
                </button>
              )}
              {editing && <div className="page-widget-move">
                <button className="btn" type="button" aria-label={`Move ${title} earlier`} disabled={index === 0}
                  onClick={() => move(id, pinned[index - 1])}>Move earlier</button>
                <button className="btn" type="button" aria-label={`Move ${title} later`} disabled={index === pinned.length - 1}
                  onClick={() => move(id, pinned[index + 1])}>Move later</button>
              </div>}
            </article>
          );
        })}
        {pinned.length === 0 && <p className="page-widget-detail">Choose widgets to show on this page.</p>}
      </div>
    </section>
  );
}

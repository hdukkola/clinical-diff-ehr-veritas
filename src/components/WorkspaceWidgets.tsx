'use client';

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type WorkspaceWidget = {
  title: string;
  value?: ReactNode;
  detail?: ReactNode;
  action?: { label: string; run: () => void };
};

type Drag = {
  id: string;
  pointerId: number;
  fromCatalog: boolean;
  startX: number;
  startY: number;
  slots: DOMRect[] | null;
};

type DragPreview = {
  id: string;
  x: number;
  y: number;
  order: string[];
  target: 'grid' | 'catalog' | null;
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
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const catalogRef = useRef<HTMLElement>(null);
  const editorButtonRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const latestPreview = useRef<DragPreview | null>(null);
  const beforeMove = useRef<Map<string, DOMRect> | null>(null);
  const pendingFocus = useRef<{ id: string; inCatalog: boolean } | null>(null);

  const catalog = new Map(widgets.map((widget) => [widget.title, widget]));
  const defaults = widgets.slice(0, 3).map((item) => item.title);
  let visible = inMemoryLayout;
  if (!visible && savedLayout) {
    try {
      const decoded: unknown = JSON.parse(savedLayout);
      if (Array.isArray(decoded)) visible = [...new Set(decoded.filter((item): item is string => typeof item === 'string'))];
    } catch {
      // Restore defaults if the saved layout cannot be read.
    }
  }
  const pinned = (visible ?? (hasPageNote ? [...defaults, 'Page note'] : defaults)).filter((id) => catalog.has(id));
  const pinnedSet = new Set(pinned);
  const available = widgets.filter((widget) => !pinnedSet.has(widget.title));
  // Keep a catalog entry mounted while previewing its insertion into the grid.
  const shown = preview?.target === 'grid' ? preview.order : pinned;
  const orderKey = JSON.stringify(shown);

  useLayoutEffect(() => {
    const focus = pendingFocus.current;
    pendingFocus.current = null;
    if (focus?.inCatalog) {
      const control = Array.from(catalogRef.current?.querySelectorAll<HTMLButtonElement>('[data-add-widget]') ?? [])
        .find((button) => button.dataset.addWidget === focus.id);
      (control ?? editorButtonRef.current)?.focus();
    } else if (focus) {
      const card = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-page-widget]') ?? [])
        .find((node) => node.dataset.pageWidget === focus.id);
      card?.querySelector<HTMLButtonElement>('.page-widget-grip')?.focus();
    }
    const oldRects = beforeMove.current;
    beforeMove.current = null;
    if (!oldRects || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const card of gridRef.current?.querySelectorAll<HTMLElement>('[data-page-widget]') ?? []) {
      const old = oldRects.get(card.dataset.pageWidget ?? '');
      if (!old || !card.animate) continue;
      card.getAnimations().forEach((animation) => animation.cancel());
      const next = card.getBoundingClientRect();
      const x = old.left - next.left;
      const y = old.top - next.top;
      if (x || y) card.animate(
        [{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }],
        { duration: 190, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
  }, [orderKey]);

  function capturePositions() {
    beforeMove.current = new Map(
      Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-page-widget]') ?? [],
        (card) => [card.dataset.pageWidget ?? '', card.getBoundingClientRect()]),
    );
  }

  function apply(next: string[], message: string, reset = false) {
    capturePositions();
    // Preserve widgets temporarily absent from the current chart context.
    const unavailable = reset ? [] : visible?.filter((id) => !catalog.has(id)) ?? [];
    const layout = [...next, ...unavailable];
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
      setInMemoryLayout(null);
      window.dispatchEvent(new Event(layoutEvent));
    } catch {
      setInMemoryLayout(layout);
      message += ' This layout will reset when you leave the page.';
    }
    setAnnouncement(message);
  }

  function place(id: string, position: number) {
    const layout = pinned.filter((item) => item !== id);
    layout.splice(position, 0, id);
    apply(layout, `${pinnedSet.has(id) ? 'Moved' : 'Added'} ${id} to position ${position + 1} of ${layout.length}.`);
  }

  function remove(id: string) {
    if (editing) pendingFocus.current = { id, inCatalog: true };
    apply(pinned.filter((item) => item !== id), `Removed ${id} from this page.`);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string, fromCatalog: boolean) {
    if (event.button !== 0 || !event.isPrimary) return;
    drag.current = { id, pointerId: event.pointerId, fromCatalog, startX: event.clientX, startY: event.clientY, slots: null };
  }

  function updateDrag(event: PointerEvent<HTMLElement>) {
    const active = drag.current;
    const grid = gridRef.current;
    if (!active || event.pointerId !== active.pointerId || !grid) return;
    const { clientX: x, clientY: y } = event;
    const bounds = grid.getBoundingClientRect();
    if (!active.slots) {
      if (Math.hypot(x - active.startX, y - active.startY) < 8) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      active.slots = Array.from(grid.querySelectorAll<HTMLElement>('[data-page-widget]'), (card) => {
        const rect = card.getBoundingClientRect();
        const offset = new DOMMatrixReadOnly(getComputedStyle(card).transform.replace('none', ''));
        return new DOMRect(rect.x - bounds.x - offset.m41, rect.y - bounds.y - offset.m42, rect.width, rect.height);
      });
    }

    const hit = (rect: DOMRect | undefined) => rect &&
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    let target: DragPreview['target'] = null;
    let order = pinned;
    if (!active.fromCatalog && hit(catalogRef.current?.getBoundingClientRect())) {
      target = 'catalog';
    } else if (hit(bounds)) {
      target = 'grid';
      const oldIndex = pinned.indexOf(active.id);
      const next = pinned.filter((id) => id !== active.id);
      const h = x - bounds.x;
      const v = y - bounds.y;
      const slot = active.slots.findIndex((rect) => {
        const edge = Math.min(12, rect.width * 0.1);
        return h >= rect.left + edge && h <= rect.right - edge && v >= rect.top + 5 && v <= rect.bottom - 5;
      });
      let index = slot;
      if (active.fromCatalog) {
        const rect = active.slots[slot];
        index = !rect ? next.length : slot + Number(h >= rect.left + rect.width / 2);
      } else if (slot < 0) {
        index = latestPreview.current?.order.indexOf(active.id) ?? oldIndex;
      }
      if (index < 0) index = next.length;
      next.splice(index, 0, active.id);
      order = next;
    }
    if ((target === 'grid' ? order : pinned).join('\n') !== shown.join('\n')) capturePositions();
    const next = { id: active.id, x, y, target, order };
    latestPreview.current = next;
    setPreview(next);
  }

  function cancelDrag() {
    drag.current = null;
    latestPreview.current = null;
    if (preview) capturePositions();
    setPreview(null);
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    const active = drag.current;
    const placement = latestPreview.current;
    if (placement?.target === 'catalog') {
      remove(active.id);
    } else if (placement?.target === 'grid') {
      const index = placement.order.indexOf(active.id);
      if (index >= 0 && index !== pinned.indexOf(active.id)) {
        place(active.id, index);
        if (active.fromCatalog) {
          // Insertion was already previewed, so there may be no layout change at drop.
          const card = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-page-widget]') ?? [])
            .find((node) => node.dataset.pageWidget === active.id);
          card?.querySelector<HTMLButtonElement>('.page-widget-grip')?.focus();
        }
      }
    }
    cancelDrag();
  }

  return (
    <section id="page-widgets" className="page-widgets" aria-labelledby="page-widgets-title"
      onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={cancelDrag}
      onLostPointerCapture={(event) => {
        if (event.currentTarget === event.target) cancelDrag();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && drag.current) {
          event.stopPropagation();
          cancelDrag();
        }
      }}>
      <header className="page-widgets-header">
        <h2 id="page-widgets-title" className="page-widgets-title" tabIndex={-1}>{title}</h2>
        <button ref={editorButtonRef} type="button" className="btn" onClick={() => setEditing(!editing)}
          aria-expanded={editing} aria-controls="page-widget-catalog">
          {editing ? 'Done editing' : 'Add widgets'}
        </button>
      </header>
      <div className="sr-only" role="status">{announcement}</div>
      <div className="page-widget-workbench" data-editing={editing || undefined}>
        {editing && (
          <aside ref={catalogRef} className="page-widget-catalog" id="page-widget-catalog" aria-label="Widget catalog"
            data-drop-target={preview?.target === 'catalog' || undefined}>
            <header>
              <h3>Widget catalog</h3>
              <p>Drag to place, or use Add.</p>
            </header>
            <ul>
              {available.map(({ title: name }) => (
                <li key={name}>
                  <button type="button" className="page-widget-grip" aria-label={`Drag ${name} from catalog`}
                    onPointerDown={(event) => startDrag(event, name, true)}
                    onClick={(event) => {
                      if (event.detail !== 0) return;
                      pendingFocus.current = { id: name, inCatalog: false };
                      place(name, pinned.length);
                    }}><span aria-hidden="true">⠿</span></button>
                  <span>{name}</span>
                  <button type="button" className="btn" data-add-widget={name} aria-label={`Add ${name}`}
                    onClick={() => {
                      pendingFocus.current = { id: name, inCatalog: false };
                      place(name, pinned.length);
                    }}>Add</button>
                </li>
              ))}
            </ul>
            {available.length === 0 && <p>All widgets are on this page.</p>}
            <button type="button" className="btn" onClick={() => apply(defaults, 'Default widget layout restored.', true)}>Reset widget layout</button>
          </aside>
        )}
        <div ref={gridRef} className="page-widget-grid" data-drop-active={preview?.target === 'grid' || undefined}>
          {shown.map((id, index) => {
            const widget = catalog.get(id);
            if (!widget) return null;
            const { title: name, value, detail, action } = widget;
            return (
              <article key={id} className="page-widget" data-page-widget={id}
                data-dragging={preview?.id === id || undefined}>
                <header className="page-widget-head">
                  <h3>{name}</h3>
                  {(editing || pinned.length > 1) && <button type="button" className="page-widget-grip"
                    aria-label={`Reorder ${name}`} title="Drag or use arrow keys"
                    onPointerDown={(event) => startDrag(event, id, false)}
                    onKeyDown={(event) => {
                      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1
                        : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0;
                      if (!direction) return;
                      event.preventDefault();
                      const next = index + direction;
                      if (next >= 0 && next < pinned.length) {
                        pendingFocus.current = { id, inCatalog: false };
                        place(id, next);
                      }
                    }}><span aria-hidden="true">⠿</span></button>}
                </header>
                {value != null && <div className="page-widget-value">{value}</div>}
                {detail != null && <div className="page-widget-detail">{detail}</div>}
                {action && (
                  <button type="button" className="page-widget-action" onClick={action.run}>
                    {action.label}<span aria-hidden="true">↗</span>
                  </button>
                )}
                {editing && <div className="page-widget-move">
                  <button className="btn" type="button" aria-label={`Move ${name} earlier`} disabled={index === 0}
                    onClick={() => {
                      pendingFocus.current = { id, inCatalog: false };
                      place(id, index - 1);
                    }}>Earlier</button>
                  <button className="btn" type="button" aria-label={`Move ${name} later`} disabled={index === shown.length - 1}
                    onClick={() => {
                      pendingFocus.current = { id, inCatalog: false };
                      place(id, index + 1);
                    }}>Later</button>
                  <button className="btn quiet" type="button" aria-label={`Remove ${name}`} onClick={() => remove(id)}>Remove</button>
                </div>}
              </article>
            );
          })}
          {shown.length === 0 && <p className="page-widget-empty">Add widgets from the catalog.</p>}
        </div>
      </div>
      {preview && createPortal(
        <div aria-hidden="true" className="page-widget-drag-preview"
          style={{ transform: `translate3d(clamp(0px, ${preview.x + 14}px, calc(100vw - min(190px, 42vw))), ${Math.max(0, preview.y - 22)}px, 0)` }}>
          {preview.id}
        </div>,
        document.body,
      )}
    </section>
  );
}

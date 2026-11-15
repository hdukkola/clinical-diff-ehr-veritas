'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BACKLOG_SECTIONS,
  BACKLOG_WIDGET_CATALOG,
  buildBacklogWidgetData,
  type BacklogBuildContext,
  type BacklogSectionId,
  type BacklogWidgetData,
} from '@/lib/backlog-widgets';
import { buildClinicalWidgetData } from '@/lib/widgets-clinical';
import { buildSpecialtyWidgetData, SPECIALTY_WIDGET_IDS } from '@/lib/widgets-specialty';

const SPECIALTY_WIDGET_ID_SET = new Set<number>(SPECIALTY_WIDGET_IDS);

function resolveBacklogWidgetData(
  id: number,
  context: BacklogBuildContext,
): BacklogWidgetData {
  const clinical = buildClinicalWidgetData(id, context);
  if (clinical) return clinical;
  if (SPECIALTY_WIDGET_ID_SET.has(id)) {
    return buildSpecialtyWidgetData(id, context);
  }
  return buildBacklogWidgetData(id, context);
}

interface BacklogCatalogDrawerProps {
  open: boolean;
  onClose: () => void;
  context: BacklogBuildContext;
}

export function BacklogCatalogDrawer({
  open,
  onClose,
  context,
}: BacklogCatalogDrawerProps) {
  const [activeSection, setActiveSection] = useState<'all' | BacklogSectionId>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number>(14);
  const [localChecks, setLocalChecks] = useState<Record<string, boolean>>({});
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BACKLOG_WIDGET_CATALOG.filter((item) => {
      if (activeSection !== 'all' && item.section !== activeSection) return false;
      if (!q) return true;
      return (
        item.code.includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q)
      );
    });
  }, [activeSection, query]);

  const activeWidget = useMemo(
    () => resolveBacklogWidgetData(selectedId, context),
    [selectedId, context],
  );

  if (!open) return null;

  return (
    <div
      className="backlog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backlog-drawer-title"
    >
      <div className="backlog-drawer">
        <header className="backlog-drawer-head">
          <div>
            <h2 id="backlog-drawer-title" className="backlog-drawer-title">
              EHR Widget Catalog (100 Backlog Surfaces)
            </h2>
            <p className="backlog-drawer-sub">
              {activeWidget.patientLabel} · {activeWidget.safetyNotice}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn-ghost"
            onClick={onClose}
          >
            Close catalog
          </button>
        </header>

        <div className="backlog-toolbar">
          <div className="backlog-search-row">
            <label className="sr-only" htmlFor="backlog-search-input">
              Filter widget catalog
            </label>
            <input
              id="backlog-search-input"
              type="search"
              className="backlog-search-input"
              placeholder="Filter by ID (01–100) or widget name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="backlog-filter-count">
              {filteredItems.length} of {BACKLOG_WIDGET_CATALOG.length}
            </span>
            {(query.trim() !== '' || activeSection !== 'all') && (
              <button
                type="button"
                className="btn-ghost backlog-reset-btn"
                onClick={() => {
                  setQuery('');
                  setActiveSection('all');
                }}
              >
                Reset
              </button>
            )}
          </div>
          <div className="backlog-section-pills" role="tablist" aria-label="Widget categories">
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'all'}
              className={`backlog-pill ${activeSection === 'all' ? 'active' : ''}`}
              onClick={() => setActiveSection('all')}
            >
              All ({BACKLOG_WIDGET_CATALOG.length})
            </button>
            {BACKLOG_SECTIONS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                role="tab"
                aria-selected={activeSection === sec.id}
                className={`backlog-pill ${activeSection === sec.id ? 'active' : ''}`}
                onClick={() => setActiveSection(sec.id)}
              >
                {sec.range} · {sec.label}
              </button>
            ))}
          </div>
        </div>

        <div className="backlog-body">
          <div className="backlog-list" role="listbox" aria-label="Widget backlog items">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selectedId === item.id}
                className={`backlog-list-item ${selectedId === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="backlog-item-code">{item.code}</span>
                <span className="backlog-item-title">{item.title}</span>
                <span className="backlog-item-owner">
                  {item.owner === 'codex' ? 'Codex' : 'Verified'}
                </span>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <p className="backlog-empty">No matching widget surfaces.</p>
            )}
          </div>

          <section className="backlog-detail" aria-label={`Widget ${activeWidget.code} preview`}>
            <div className="backlog-detail-head">
              <div>
                <span className="backlog-detail-code">Widget {activeWidget.code}</span>
                <h3 className="backlog-detail-title">{activeWidget.title}</h3>
                <p className="backlog-detail-summary">{activeWidget.summaryLine}</p>
              </div>
              <div className="backlog-detail-counts">
                <span className="backlog-stat">{activeWidget.counts.total} records</span>
                {activeWidget.counts.missingOrUnknown > 0 && (
                  <span className="backlog-stat warn">
                    {activeWidget.counts.missingOrUnknown} missing/unknown
                  </span>
                )}
                {activeWidget.counts.alertsOrConflicts > 0 && (
                  <span className="backlog-stat alert">
                    {activeWidget.counts.alertsOrConflicts} flagged
                  </span>
                )}
              </div>
            </div>

            {activeWidget.series && activeWidget.series.length > 0 && (
              <div className="backlog-series-box">
                <div className="backlog-series-bars" aria-hidden="true">
                  {activeWidget.series.map((pt) => {
                    const max = Math.max(...activeWidget.series!.map((s) => s.value), 1);
                    const pct = Math.max(12, Math.round((pt.value / max) * 100));
                    return (
                      <div
                        key={pt.label}
                        className={`backlog-series-col${pt.comparable ? '' : ' non-comparable'}`}
                      >
                        <div className="backlog-series-bar" style={{ height: `${pct}%` }} />
                        <span className="backlog-series-val">{pt.value}</span>
                        <span className="backlog-series-lbl">{pt.label}</span>
                      </div>
                    );
                  })}
                </div>
                <table className="backlog-series-table">
                  <caption className="sr-only">Numeric observations for {activeWidget.title}</caption>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Value</th>
                      <th>Unit</th>
                      <th>Comparable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeWidget.series.map((pt) => (
                      <tr key={pt.recordedAt} className={pt.comparable ? '' : 'non-comparable'}>
                        <td>{pt.recordedAt}</td>
                        <td>{pt.value}</td>
                        <td>{pt.unit}</td>
                        <td>{pt.comparable ? 'Yes' : 'No (unit/scale change)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <ul className="backlog-rows">
              {activeWidget.rows.map((r) => (
                <li key={r.id} className={`backlog-row status-${r.status}`}>
                  <div className="backlog-row-top">
                    <strong>{r.label}</strong>
                    <span className={`backlog-row-badge status-${r.status}`}>{r.status}</span>
                  </div>
                  <p className="backlog-row-val">{r.value}</p>
                  {r.detail && <p className="backlog-row-detail">{r.detail}</p>}
                  <p className="backlog-row-meta">
                    Source: {r.sourceLabel} · {r.recordedAt ?? 'Date unknown'}
                  </p>
                </li>
              ))}
            </ul>

            {activeWidget.checklist && activeWidget.checklist.length > 0 && (
              <div className="backlog-checklist">
                <h4>Interactive Local Checklist (Simulation Only)</h4>
                <ul>
                  {activeWidget.checklist.map((chk) => {
                    const checked = localChecks[chk.id] ?? chk.done;
                    return (
                      <li key={chk.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setLocalChecks((prev) => ({
                                ...prev,
                                [chk.id]: e.target.checked,
                              }))
                            }
                          />
                          <span>{chk.text}</span>
                          <small> ({chk.sourceLabel})</small>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

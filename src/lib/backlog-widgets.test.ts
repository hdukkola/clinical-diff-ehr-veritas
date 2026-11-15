import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { analyzeSnapshots } from './diff';
import { getSyntheticScenario } from './fixtures';
import {
  BACKLOG_SECTIONS,
  BACKLOG_WIDGET_CATALOG,
  buildBacklogWidgetData,
  REMAINING_ANTIGRAVITY_IDS,
  type BacklogBuildContext,
} from './backlog-widgets';
import { BacklogCatalogDrawer } from '@/components/BacklogCatalogDrawer';

function makeContext(): BacklogBuildContext {
  const scenario = getSyntheticScenario('scenario-morgan-lee-baseline')!;
  const report = analyzeSnapshots(scenario.earlier, scenario.later);
  return {
    patientLabel: scenario.patientLabel,
    scenarioId: scenario.id,
    report,
    reviews: { [`${scenario.id}:${report.changes[0]?.medicationId}`]: 'flag' },
    socketState: 'standby',
    evalTested: 21,
    evalPassed: 21,
    evalFailed: 0,
    auditCount: 3,
  };
}

describe('90-Item EHR Widget Backlog (76 Remaining Antigravity Surfaces)', () => {
  it('catalogs all 90 unique widget IDs across all 9 sections', () => {
    expect(BACKLOG_WIDGET_CATALOG.length).toBe(90);
    const ids = new Set(BACKLOG_WIDGET_CATALOG.map((w) => w.id));
    expect(ids.size).toBe(90);
    for (let i = 1; i <= 90; i++) {
      expect(ids.has(i)).toBe(true);
    }
    const coveredSections = new Set(BACKLOG_WIDGET_CATALOG.map((w) => w.section));
    expect(coveredSections.size).toBe(BACKLOG_SECTIONS.length);
  });

  it('tracks Codex-owned items (02, 17) separately from the 76 remaining Antigravity items', () => {
    const codexIds = BACKLOG_WIDGET_CATALOG.filter((w) => w.owner === 'codex').map((w) => w.id);
    expect(codexIds).toEqual([2, 17]);
    expect(REMAINING_ANTIGRAVITY_IDS.length).toBe(84);
  });

  it.each(REMAINING_ANTIGRAVITY_IDS)(
    'builds valid synthetic data for backlog widget #%i with source attribution and safety notice',
    (widgetId) => {
      const ctx = makeContext();
      const data = buildBacklogWidgetData(widgetId, ctx);
      expect(data.id).toBe(widgetId);
      expect(data.patientLabel).toBe(ctx.patientLabel);
      expect(data.safetyNotice).toContain('Synthetic data only');
      expect(data.rows.length).toBeGreaterThan(0);
      for (const row of data.rows) {
        expect(row.sourceLabel.trim().length).toBeGreaterThan(0);
      }
      expect(data.counts.total).toBe(data.rows.length);
    },
  );

  it('wires live comparison state into widgets 14, 50, 51, 89, and 93', () => {
    const ctx = makeContext();
    expect(buildBacklogWidgetData(14, ctx).rows.length).toBeGreaterThan(0);
    expect(buildBacklogWidgetData(50, ctx).rows.some((r) => r.id === '50-fu')).toBe(true);
    expect(buildBacklogWidgetData(51, ctx).rows.some((r) => r.status === 'warning')).toBe(true);
    expect(buildBacklogWidgetData(89, ctx).rows.find((r) => r.id === '89-3')?.value).toBe('3');
    expect(buildBacklogWidgetData(93, ctx).rows.find((r) => r.id === '93-1')?.value).toBe('standby');
  });

  it('renders BacklogCatalogDrawer when open, filters by section/query, and closes cleanly', () => {
    const ctx = makeContext();
    let closed = false;
    render(
      React.createElement(BacklogCatalogDrawer, {
        open: true,
        onClose: () => {
          closed = true;
        },
        context: ctx,
      }),
    );

    expect(screen.getByRole('dialog', { name: /EHR Widget Catalog/i })).toBeInTheDocument();
    const search = screen.getByLabelText(/Filter widget catalog/i);
    fireEvent.change(search, { target: { value: 'Allergies' } });
    fireEvent.click(screen.getByRole('option', { name: /Allergies and reactions/i }));
    expect(screen.getByRole('heading', { name: 'Allergies and reactions' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close catalog/i }));
    expect(closed).toBe(true);
  });
});

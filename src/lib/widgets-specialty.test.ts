import { describe, expect, it } from 'vitest';
import { analyzeSnapshots } from './diff';
import { getSyntheticScenario } from './fixtures';
import type { BacklogBuildContext } from './backlog-widgets';
import { buildSpecialtyWidgetData, SPECIALTY_WIDGET_IDS } from './widgets-specialty';

function makeContext(
  scenarioId = 'scenario-morgan-lee-baseline',
  overrides: Partial<BacklogBuildContext> = {},
): BacklogBuildContext {
  const scenario = getSyntheticScenario(scenarioId)!;
  const report = analyzeSnapshots(scenario.earlier, scenario.later);
  return {
    patientLabel: scenario.patientLabel,
    scenarioId: scenario.id,
    report,
    reviews: { [`${scenario.id}:${report.changes[0]?.medicationId ?? 'm1'}`]: 'flag' },
    socketState: 'standby',
    evalTested: 21,
    evalPassed: 20,
    evalFailed: 1,
    auditCount: 4,
    ...overrides,
  };
}

describe('Specialty, Patient-Facing, Operations, and Model/Platform Widgets (61-93, 95, 97-100)', () => {
  it('covers the exact 30 assigned widget IDs (61-90)', () => {
    expect(SPECIALTY_WIDGET_IDS.length).toBe(30);
    expect(SPECIALTY_WIDGET_IDS).not.toContain(94);
    expect(SPECIALTY_WIDGET_IDS).not.toContain(96);
    for (let id = 61; id <= 93; id++) {
      expect(SPECIALTY_WIDGET_IDS).toContain(id);
    }
    expect(SPECIALTY_WIDGET_IDS).toContain(95);
    for (let id = 97; id <= 100; id++) {
      expect(SPECIALTY_WIDGET_IDS).toContain(id);
    }
  });

  it.each(SPECIALTY_WIDGET_IDS)(
    'builds deterministic, synthetic-only, read-only data with provenance for widget #%i',
    (widgetId) => {
      const ctx = makeContext();
      const first = buildSpecialtyWidgetData(widgetId, ctx);
      const second = buildSpecialtyWidgetData(widgetId, ctx);

      expect(first).toEqual(second);
      expect(first.id).toBe(widgetId);
      expect(first.code).toBe(String(widgetId).padStart(2, '0'));
      expect(first.patientLabel).toBe(ctx.patientLabel);
      expect(first.safetyNotice).toContain('Synthetic data only');
      expect(first.safetyNotice).toContain('Read-only');
      expect(first.summaryLine.trim().length).toBeGreaterThan(0);
      expect(first.rows.length).toBeGreaterThan(0);

      for (const r of first.rows) {
        expect(r.sourceLabel.trim().length).toBeGreaterThan(0);
        expect(r.label.trim().length).toBeGreaterThan(0);
        expect(r.value.trim().length).toBeGreaterThan(0);
      }

      const expectedMissing = first.rows.filter(
        (r) => r.status === 'missing' || r.status === 'unknown',
      ).length;
      const expectedAlerts = first.rows.filter(
        (r) => r.status === 'conflicting' || r.status === 'warning',
      ).length;
      expect(first.counts).toEqual({
        total: first.rows.length,
        missingOrUnknown: expectedMissing,
        alertsOrConflicts: expectedAlerts,
      });
    },
  );

  it('enforces no-PHI unit aggregates on Capacity Board (86) and Staffing View (87)', () => {
    const ctx = makeContext();
    for (const id of [86, 87]) {
      const data = buildSpecialtyWidgetData(id, ctx);
      const serialized = JSON.stringify({ summaryLine: data.summaryLine, rows: data.rows });
      expect(serialized).not.toMatch(/Morgan Lee/i);
      expect(serialized).not.toMatch(/DEMO-001/i);
      expect(serialized.toLowerCase()).toContain('unit');
    }
  });

  it('preserves explicit unknown or missing states for non-applicable or absent records', () => {
    const ctx = makeContext();
    for (const id of [65, 66, 68, 70, 81, 82]) {
      const data = buildSpecialtyWidgetData(id, ctx);
      expect(data.counts.missingOrUnknown).toBeGreaterThan(0);
      expect(
        data.rows.some((r) => (r.status === 'missing' || r.status === 'unknown') && r.recordedAt === null),
      ).toBe(true);
    }
  });

  it('provides accessible chart series alongside tabular rows for 62, 64, and 67', () => {
    const ctx = makeContext();
    for (const id of [62, 64, 67]) {
      const data = buildSpecialtyWidgetData(id, ctx);
      expect(data.series).toBeDefined();
      expect(data.series!.length).toBeGreaterThanOrEqual(3);
      for (const pt of data.series!) {
        expect(pt.unit.trim().length).toBeGreaterThan(0);
        expect(pt.comparable).toBe(true);
      }
      expect(data.rows.length).toBeGreaterThanOrEqual(data.series!.length);
    }
  });

  it('provides accessible checklists for workflow/form widgets 63, 69, 76, and 79', () => {
    const ctx = makeContext();
    for (const id of [63, 69, 76, 79]) {
      const data = buildSpecialtyWidgetData(id, ctx);
      expect(data.checklist).toBeDefined();
      expect(data.checklist!.length).toBeGreaterThanOrEqual(3);
      for (const item of data.checklist!) {
        expect(item.text.trim().length).toBeGreaterThan(0);
        expect(item.sourceLabel.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('wires dynamic report, review, and audit state into 73, 74, and 88-90', () => {
    const missingCtx = makeContext('scenario-missing-undocumented-fields', {
      socketState: 'live',
      evalTested: 21,
      evalPassed: 21,
      evalFailed: 0,
      auditCount: 9,
      reviews: { a: 'verify', b: 'flag', c: 'defer' },
    });

    const w73 = buildSpecialtyWidgetData(73, missingCtx);
    expect(w73.rows.some((r) => r.label.startsWith('Medicine update:'))).toBe(true);

    const w74 = buildSpecialtyWidgetData(74, missingCtx);
    expect(w74.rows.some((r) => r.status === 'missing')).toBe(true);

    const w88 = buildSpecialtyWidgetData(88, missingCtx);
    expect(w88.rows.find((r) => r.id === '88-3')?.value).toContain('9');

    const w89 = buildSpecialtyWidgetData(89, missingCtx);
    expect(w89.rows.find((r) => r.id === '89-2')?.value).not.toBe('0');
    expect(w89.rows.some((r) => r.id.startsWith('89-gap-'))).toBe(true);

    const w90 = buildSpecialtyWidgetData(90, missingCtx);
    expect(w90.rows[0]?.value).toContain('scenario-missing-undocumented-fields');
  });

  it('handles empty-change scenarios cleanly in dynamic builders 73 and 74', () => {
    const emptyCtx = makeContext('scenario-empty-snapshots', {
      socketState: 'replay',
    });
    expect(buildSpecialtyWidgetData(73, emptyCtx).rows[0]?.id).toBe('73-none');
    expect(buildSpecialtyWidgetData(74, emptyCtx).rows[0]?.id).toBe('74-empty');
  });

  it('falls back to buildBacklogWidgetData for IDs outside 61-90', () => {
    const ctx = makeContext();
    const fallback = buildSpecialtyWidgetData(17, ctx);
    expect(fallback.id).toBe(17);
    expect(fallback.owner).toBe('codex');
  });
});

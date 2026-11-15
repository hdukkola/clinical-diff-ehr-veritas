import { describe, expect, it } from 'vitest';
import { analyzeSnapshots } from './diff';
import { getSyntheticScenario } from './fixtures';
import type { BacklogBuildContext } from './backlog-widgets';
import {
  buildClinicalWidgetData,
  CLINICAL_WIDGET_IDS,
} from './widgets-clinical';

function makeContext(
  scenarioId = 'scenario-morgan-lee-baseline',
  reviews: Record<string, string | undefined> = {},
): BacklogBuildContext {
  const scenario = getSyntheticScenario(scenarioId)!;
  const report = analyzeSnapshots(scenario.earlier, scenario.later);
  return {
    patientLabel: scenario.patientLabel,
    scenarioId: scenario.id,
    report,
    reviews: {
      [`${scenario.id}:${report.changes[0]?.medicationId}`]: 'flag',
      ...reviews,
    },
    socketState: 'standby',
    evalTested: 21,
    evalPassed: 21,
    evalFailed: 0,
    auditCount: 3,
  };
}

describe('widgets-clinical (items 14-16 and 18-60)', () => {
  it('covers exactly items 14-16 and 18-60 (46 items) and returns null for other IDs', () => {
    const expected = [
      14, 15, 16,
      ...Array.from({ length: 43 }, (_, idx) => idx + 18),
    ];
    expect(CLINICAL_WIDGET_IDS).toEqual(expected);
    expect(CLINICAL_WIDGET_IDS).not.toContain(17);

    const ctx = makeContext();
    expect(buildClinicalWidgetData(13, ctx)).toBeNull();
    expect(buildClinicalWidgetData(17, ctx)).toBeNull();
    expect(buildClinicalWidgetData(61, ctx)).toBeNull();
    expect(buildClinicalWidgetData(94, ctx)).toBeNull();
  });

  it.each(CLINICAL_WIDGET_IDS)(
    'builds deterministic, source-attributed synthetic data for clinical widget #%i',
    (widgetId) => {
      const ctx = makeContext();
      const first = buildClinicalWidgetData(widgetId, ctx);
      const second = buildClinicalWidgetData(widgetId, ctx);

      expect(first).not.toBeNull();
      expect(first).toEqual(second);

      const data = first!;
      expect(data.id).toBe(widgetId);
      expect(data.patientLabel).toBe(ctx.patientLabel);
      expect(data.safetyNotice).toContain('Synthetic data only');
      expect(data.summaryLine.trim().length).toBeGreaterThan(0);
      expect(data.rows.length).toBeGreaterThan(0);

      for (const r of data.rows) {
        expect(r.sourceLabel.trim().length).toBeGreaterThan(0);
        if (r.recordedAt === null) {
          // Undated rows must not fabricate dates
          expect(r.recordedAt).toBeNull();
        }
      }

      const expectedMissing = data.rows.filter(
        (r) => r.status === 'missing' || r.status === 'unknown',
      ).length;
      const expectedAlerts = data.rows.filter(
        (r) => r.status === 'conflicting' || r.status === 'warning',
      ).length;

      expect(data.counts.total).toBe(data.rows.length);
      expect(data.counts.missingOrUnknown).toBe(expectedMissing);
      expect(data.counts.alertsOrConflicts).toBe(expectedAlerts);
    },
  );

  it('preserves explicit negatives, unknowns, and Date unknown without fabrication', () => {
    const ctx = makeContext();

    const aliases = buildClinicalWidgetData(15, ctx)!;
    expect(aliases.rows.some((r) => r.status === 'unknown' && r.recordedAt === null)).toBe(true);

    const allergies = buildClinicalWidgetData(21, ctx)!;
    expect(allergies.rows.some((r) => r.value.includes('Explicit negative'))).toBe(true);
    expect(allergies.rows.some((r) => r.status === 'unknown' && r.recordedAt === null)).toBe(true);

    const directives = buildClinicalWidgetData(30, ctx)!;
    expect(directives.rows.some((r) => r.status === 'unknown' && r.recordedAt === null)).toBe(true);

    const social = buildClinicalWidgetData(27, ctx)!;
    expect(social.rows.some((r) => r.status === 'conflicting')).toBe(true);
  });

  it('provides accessible series + tabular rows and flags unit changes in lab trends (#32, #33, #36)', () => {
    const ctx = makeContext();

    const vitalTrends = buildClinicalWidgetData(32, ctx)!;
    expect(vitalTrends.series?.length).toBe(3);
    expect(vitalTrends.rows.length).toBe(vitalTrends.series?.length);
    expect(vitalTrends.series?.every((p) => p.comparable)).toBe(true);

    const flowsheet = buildClinicalWidgetData(33, ctx)!;
    expect(flowsheet.rows.some((r) => r.status === 'missing' && r.value.includes('Not recorded'))).toBe(true);

    const labTrends = buildClinicalWidgetData(36, ctx)!;
    expect(labTrends.series?.some((p) => p.comparable === false && p.unit.includes('unit change'))).toBe(true);
    expect(labTrends.rows.some((r) => r.status === 'warning' && r.value.includes('unit change'))).toBe(true);
  });

  it('wires live ctx.report and ctx.reviews into dynamic widgets (#14, #16, #41, #42, #50, #51, #54, #55, #56)', () => {
    const ctx = makeContext();

    const dupes = buildClinicalWidgetData(14, ctx)!;
    expect(dupes.rows.length).toBeGreaterThan(0);

    const gaps = buildClinicalWidgetData(16, ctx)!;
    expect(gaps.rows.length).toBeGreaterThan(0);

    const visitPrep = buildClinicalWidgetData(41, ctx)!;
    expect(visitPrep.rows.some((r) => r.id === '41-2')).toBe(true);

    const rooming = buildClinicalWidgetData(42, ctx)!;
    expect(rooming.checklist?.length).toBeGreaterThan(0);

    const discharge = buildClinicalWidgetData(50, ctx)!;
    expect(discharge.rows.some((r) => r.id === '50-fu')).toBe(true);

    const worklist = buildClinicalWidgetData(51, ctx)!;
    expect(worklist.rows.some((r) => r.status === 'warning')).toBe(true);

    const reviewQueue = buildClinicalWidgetData(54, ctx)!;
    expect(reviewQueue.rows.length).toBeGreaterThan(0);

    const handoff = buildClinicalWidgetData(55, ctx)!;
    expect(handoff.rows[0]?.id).toBe('55-1');

    const rounds = buildClinicalWidgetData(56, ctx)!;
    expect(rounds.rows[0]?.label).toContain(ctx.patientLabel);
  });

  it('handles scenarios with zero changes or provenance gaps cleanly without throwing', () => {
    const ctx = makeContext();
    const emptyCtx: BacklogBuildContext = {
      ...ctx,
      report: {
        ...ctx.report,
        changes: [],
        provenanceGaps: [],
        provenanceFlags: [],
        evidenceLinks: [],
      },
    };

    expect(buildClinicalWidgetData(14, emptyCtx)?.rows[0]?.id).toBe('14-empty');
    expect(buildClinicalWidgetData(16, emptyCtx)?.rows[0]?.id).toBe('16-none');
    expect(buildClinicalWidgetData(51, emptyCtx)?.rows[0]?.id).toBe('51-empty');
    expect(buildClinicalWidgetData(54, emptyCtx)?.rows[0]?.id).toBe('54-ok');
  });
});

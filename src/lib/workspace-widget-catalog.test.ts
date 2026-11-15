import { describe, expect, it } from 'vitest';
import { buildWorkspaceWidgetCatalog, type WorkspaceCatalogContext } from './workspace-widget-catalog';

const context: WorkspaceCatalogContext = {
  activeCase: { id: 'case-a', name: 'Case A' },
  notes: { caseId: 'case-a', earlier: 'Earlier text', later: 'Later text' },
  comparison: { caseId: 'case-a', earlierText: 'Earlier text', laterText: 'Later text', modeLabel: 'Rules', simulated: true,
    differences: [
      { key: 'd1', name: 'Example A', kind: 'earlier_only' },
      { key: 'd2', name: 'Example B', kind: 'regimen_changed' },
      { key: 'd3', name: 'Example C', kind: 'later_only' },
    ] },
  reviews: { caseId: 'case-a', earlierText: 'Earlier text', laterText: 'Later text', decisions: { d1: 'reviewed', d2: 'clarify', unrelated: 'reviewed' } },
  ownedCases: [{ id: 'case-a', name: 'Case A' }, { id: 'case-b', name: 'Case B' }],
};
const get = (ctx: WorkspaceCatalogContext, id: string) => buildWorkspaceWidgetCatalog(ctx).find((item) => item.id === id)!;

describe('buildWorkspaceWidgetCatalog', () => {
  it('derives category and review counts only from the current comparison', () => {
    expect(get(context, 'earlier-only').value).toBe(1);
    expect(get(context, 'regimen-changed').value).toBe(1);
    expect(get(context, 'reviewed-count').value).toBe(2);
    expect(get(context, 'awaiting-review').value).toBe(1);
    expect(get(context, 'clarifications').value).toBe(1);
    expect(get(context, 'comparison-mode').detail).toMatch(/Simulated/);
    expect(get(context, 'earlier-only').detail).toMatch(/does not establish/);
  });
  it('does not leak results, notes, or decisions from another case', () => {
    const other = { ...context, activeCase: { id: 'case-b', name: 'Case B' } };
    expect(get(other, 'notes-present').value).toBe('Unavailable');
    expect(get(other, 'comparison-differences').value).toBe('Unavailable');
    expect(get(other, 'difference-list').rows).toBeUndefined();
    expect(get(other, 'reviewed-count').value).toBe('Unavailable');
  });
  it('marks old comparison stale after notes change, without showing old values', () => {
    const edited = { ...context, notes: { ...context.notes!, later: 'Edited' } };
    expect(get(edited, 'comparison-differences')).toMatchObject({ state: 'stale', value: 'Unavailable' });
    expect(get(edited, 'difference-list').rows).toBeUndefined();
    expect(get(edited, 'clarifications').value).toBe('Unavailable');
  });
  it('does not count mismatched decisions as no decisions', () => {
    const mismatch = { ...context, reviews: { ...context.reviews!, earlierText: 'Old' } };
    expect(get(mismatch, 'awaiting-review')).toMatchObject({ state: 'unavailable', value: 'Unavailable' });
  });
  it('does not apply a decision to duplicated comparison keys', () => {
    const bad = { ...context, comparison: { ...context.comparison!, differences: [context.comparison!.differences[0], context.comparison!.differences[0]] } };
    expect(get(bad, 'reviewed-count')).toMatchObject({ state: 'unavailable', value: 'Unavailable' });
  });
  it('distinguishes no results, no notes, and unavailable data', () => {
    const emptyResult = { ...context, comparison: { ...context.comparison!, differences: [] } };
    expect(get(emptyResult, 'difference-list')).toMatchObject({ state: 'empty', value: 0 });
    expect(get(emptyResult, 'awaiting-review').value).toBe(0);
    const emptyNotes = { ...context, notes: { caseId: 'case-a', earlier: ' ', later: '' }, comparison: null };
    expect(get(emptyNotes, 'notes-present')).toMatchObject({ state: 'empty', value: '0 / 2' });
    expect(get({ ...context, ownedCases: null }, 'owned-cases').value).toBe('Unavailable');
    expect(get(context, 'observations-unavailable')).toMatchObject({ state: 'unavailable', value: 'Unavailable' });
  });
  it('provides stable unique IDs, page scopes, and no internal evaluation widgets', () => {
    const widgets = buildWorkspaceWidgetCatalog(context);
    expect(new Set(widgets.map((item) => item.id)).size).toBe(widgets.length);
    expect(widgets.every((item) => item.pages.length > 0 && Boolean(item.source))).toBe(true);
    expect(widgets.some((item) => /evaluat|benchmark/i.test(item.title))).toBe(false);
  });
});

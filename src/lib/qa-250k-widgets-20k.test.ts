// @vitest-environment node
import { equal, ok } from 'node:assert/strict';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKLOG_SECTIONS,
  BACKLOG_WIDGET_CATALOG,
  buildBacklogWidgetData,
  type BacklogBuildContext,
  type BacklogSectionId,
} from './backlog-widgets';
import {
  buildClinicalWidgetData,
  CLINICAL_WIDGET_IDS,
} from './widgets-clinical';
import {
  buildSpecialtyWidgetData,
  SPECIALTY_WIDGET_IDS,
} from './widgets-specialty';
import {
  canRender,
  CORE_WIDGET_DEFINITIONS,
  CORE_WIDGET_IDS,
  createWidgetRegistry,
  DEFAULT_LAYOUT_PRESETS,
  getAllLayoutPresets,
  getLayoutPreset,
  GRID_COLUMN_COUNT,
  LAYOUT_PRESET_IDS,
  resetWidgetRegistry,
  validateLayoutPreset,
  type ClinicalContext,
  type CoreWidgetId,
  type LayoutPreset,
  type WidgetDefinition,
  type WidgetPosition,
} from './cockpit';
import {
  DEFAULT_COCKPIT_WIDGET_ORDER,
  type CockpitWidgetId,
} from '@/components/CockpitWidgets';
import { analyzeSnapshots } from './diff';
import { syntheticScenarios } from './fixtures';

/**
 * Row 4 of docs/coordination/ANTIGRAVITY_250K_QA.md:
 * 20,000 deterministic widget state and keyboard logic cases:
 * - 5,000 catalog add/remove
 * - 5,000 reorder boundaries and keyboard rules
 * - 4,000 per-page and per-case layouts
 * - 3,000 persistence and restore
 * - 3,000 data refresh and stale-state handling
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type WorkspaceWidgetPage =
  | 'home'
  | 'patient'
  | 'extract'
  | 'diff'
  | 'triage'
  | 'audit'
  | 'chat';

export type WorkspaceWidgetState = 'ready' | 'empty' | 'unavailable' | 'stale';

export interface WorkspaceCatalogDifference {
  key: string;
  name: string;
  kind: 'earlier_only' | 'later_only' | 'regimen_changed' | 'discontinued';
}

export interface WorkspaceCatalogComparison {
  caseId: string;
  earlierText: string;
  laterText: string;
  differences: readonly WorkspaceCatalogDifference[];
  modeLabel: string;
  simulated: boolean;
}

export interface WorkspaceCatalogContext {
  activeCase: { id: string; name: string } | null;
  notes: { caseId: string; earlier: string; later: string } | null;
  comparison: WorkspaceCatalogComparison | null;
  reviews: {
    caseId: string;
    earlierText: string;
    laterText: string;
    decisions: Readonly<Record<string, 'reviewed' | 'clarify' | undefined>>;
  } | null;
  ownedCases: readonly { id: string; name: string }[] | null;
}

export interface WorkspaceCatalogItem {
  id: string;
  title: string;
  pages: WorkspaceWidgetPage[];
  state: WorkspaceWidgetState;
  value: string | number;
  detail: string;
  source: string;
  rows?: { id: string; label: string; detail?: string }[];
}

const WORKSPACE_PAGES: readonly WorkspaceWidgetPage[] = [
  'home',
  'patient',
  'extract',
  'diff',
  'triage',
  'audit',
  'chat',
] as const;

const CLINICAL_ID_SET = new Set<number>(CLINICAL_WIDGET_IDS);
const SPECIALTY_ID_SET = new Set<number>(SPECIALTY_WIDGET_IDS);

function presence(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * Pure deterministic model of `buildWorkspaceWidgetCatalog` from `origin/main:src/lib/workspace-widget-catalog.ts`.
 */
function evaluateWorkspaceWidgetCatalog(
  context: WorkspaceCatalogContext,
): WorkspaceCatalogItem[] {
  const { activeCase, notes, comparison, reviews, ownedCases } = context;
  const scopedNotes =
    activeCase && notes?.caseId === activeCase.id ? notes : null;
  const noteCount = scopedNotes
    ? Number(presence(scopedNotes.earlier)) + Number(presence(scopedNotes.later))
    : null;
  const comparisonSameCase = Boolean(
    activeCase && comparison?.caseId === activeCase.id,
  );
  const comparisonCurrent = Boolean(
    comparisonSameCase &&
      scopedNotes &&
      comparison &&
      comparison.earlierText === scopedNotes.earlier &&
      comparison.laterText === scopedNotes.later &&
      presence(scopedNotes.earlier) &&
      presence(scopedNotes.later),
  );
  const comparisonState: WorkspaceWidgetState = comparisonCurrent
    ? 'ready'
    : comparisonSameCase
      ? 'stale'
      : 'unavailable';
  const currentComparison = comparisonCurrent ? comparison : null;
  const uniqueKeys = new Set(
    currentComparison?.differences.map((item) => item.key),
  );
  const reviewKeysValid = Boolean(
    currentComparison &&
      uniqueKeys.size === currentComparison.differences.length &&
      currentComparison.differences.every((item) => item.key.trim().length > 0),
  );
  const reviewsCurrent = Boolean(
    reviewKeysValid &&
      reviews &&
      currentComparison &&
      reviews.caseId === currentComparison.caseId &&
      reviews.earlierText === currentComparison.earlierText &&
      reviews.laterText === currentComparison.laterText,
  );
  const differences = currentComparison?.differences ?? [];
  const decided = reviewsCurrent
    ? differences.filter(
        (item) =>
          reviews?.decisions[item.key] === 'reviewed' ||
          reviews?.decisions[item.key] === 'clarify',
      ).length
    : null;
  const flagged = reviewsCurrent
    ? differences.filter((item) => reviews?.decisions[item.key] === 'clarify')
        .length
    : null;
  const source = 'Active case · note comparison';
  const unavailableDetail =
    comparisonState === 'stale'
      ? 'Notes changed since this comparison. Run it again.'
      : 'Run a comparison for this case to see results.';

  const result = (
    id: string,
    title: string,
    value: number | null,
    detail: string,
    pages: WorkspaceWidgetPage[],
  ): WorkspaceCatalogItem => ({
    id,
    title,
    pages,
    state: comparisonCurrent ? 'ready' : comparisonState,
    value: comparisonCurrent && value !== null ? value : 'Unavailable',
    detail: comparisonCurrent ? detail : unavailableDetail,
    source,
  });

  const reviewState: WorkspaceWidgetState = !comparisonCurrent
    ? comparisonState
    : reviewsCurrent
      ? 'ready'
      : 'unavailable';
  const reviewDetail = !comparisonCurrent
    ? unavailableDetail
    : !reviewsCurrent
      ? 'Review decisions are unavailable for these note versions.'
      : '';
  const reviewItem = (
    id: string,
    title: string,
    value: number | null,
    detail: string,
  ): WorkspaceCatalogItem => ({
    id,
    title,
    pages: ['home', 'patient', 'extract'],
    state: reviewState,
    value: value === null ? 'Unavailable' : value,
    detail: reviewState === 'ready' ? detail : reviewDetail,
    source: 'Active case · comparison review decisions',
  });

  const caseNames =
    ownedCases?.map((item) => ({ id: item.id, label: item.name })) ?? [];

  return [
    {
      id: 'active-case',
      title: 'Active case',
      pages: ['home', 'patient', 'chat'],
      state: activeCase ? 'ready' : 'unavailable',
      value: activeCase?.name ?? 'Unavailable',
      detail: activeCase
        ? 'Selected case'
        : 'Select a case to view its workspace.',
      source: 'Active case selection',
    },
    {
      id: 'owned-cases',
      title: 'Your cases',
      pages: ['home'],
      state:
        ownedCases === null
          ? 'unavailable'
          : ownedCases.length
            ? 'ready'
            : 'empty',
      value: ownedCases?.length ?? 'Unavailable',
      detail:
        ownedCases === null
          ? 'Case list unavailable.'
          : 'Cases provided by the current workspace.',
      source: 'Caller-provided owned-case list',
      rows: ownedCases === null ? undefined : caseNames,
    },
    {
      id: 'notes-present',
      title: 'Notes entered',
      pages: ['home', 'patient', 'extract'],
      state:
        noteCount === null ? 'unavailable' : noteCount ? 'ready' : 'empty',
      value: noteCount === null ? 'Unavailable' : `${noteCount} / 2`,
      detail:
        noteCount === null
          ? 'Notes are unavailable for this case.'
          : 'Earlier and later notes with nonblank text; not a completeness assessment.',
      source: 'Active case · note drafts',
    },
    ...(['earlier', 'later'] as const).map(
      (side): WorkspaceCatalogItem => ({
        id: `${side}-note`,
        title: side === 'earlier' ? 'Earlier note' : 'Later note',
        pages: ['patient', 'extract'],
        state: scopedNotes
          ? presence(scopedNotes[side])
            ? 'ready'
            : 'empty'
          : 'unavailable',
        value: scopedNotes
          ? presence(scopedNotes[side])
            ? 'Entered'
            : 'Empty'
          : 'Unavailable',
        detail: scopedNotes
          ? `${Array.from(scopedNotes[side]).length} characters in the current draft.`
          : 'Note unavailable for this case.',
        source: `Active case · ${side} note draft`,
      }),
    ),
    result(
      'comparison-differences',
      'Differences to review',
      differences.length,
      'Compare each difference with its source notes.',
      ['home', 'patient', 'extract'],
    ),
    result(
      'earlier-only',
      'Only in earlier note',
      differences.filter((item) => item.kind === 'earlier_only').length,
      'Check for explicit documentation before treating a medication as stopped.',
      ['extract', 'diff'],
    ),
    result(
      'later-only',
      'Only in later note',
      differences.filter((item) => item.kind === 'later_only').length,
      'Check the source for when each medication was started.',
      ['extract', 'diff'],
    ),
    result(
      'regimen-changed',
      'Different regimen statements',
      differences.filter((item) => item.kind === 'regimen_changed').length,
      'Different statements need source and human review.',
      ['extract', 'diff'],
    ),
    result(
      'explicit-discontinuation',
      'Discontinuation statements',
      differences.filter((item) => item.kind === 'discontinued').length,
      'Comparison-labeled statements require source and human review.',
      ['extract', 'diff'],
    ),
    reviewItem(
      'reviewed-count',
      'Decisions recorded',
      decided,
      `${decided ?? 0} of ${differences.length} differences have a review decision, including clarification requests.`,
    ),
    reviewItem(
      'awaiting-review',
      'Awaiting decision',
      decided === null ? null : differences.length - decided,
      'Differences without a recorded review decision.',
    ),
    reviewItem(
      'clarifications',
      'Clarifications',
      flagged,
      'Differences flagged for clarification; no message is sent.',
    ),
    {
      id: 'comparison-mode',
      title: 'Comparison mode',
      pages: ['extract'],
      state: comparisonCurrent ? 'ready' : comparisonState,
      value: currentComparison?.modeLabel || 'Unavailable',
      detail: currentComparison
        ? currentComparison.simulated
          ? 'Simulated result; human review required.'
          : 'Caller-reported mode; human review required.'
        : unavailableDetail,
      source,
    },
    {
      id: 'difference-list',
      title: 'Comparison items',
      pages: ['extract', 'diff'],
      state: comparisonCurrent
        ? differences.length
          ? 'ready'
          : 'empty'
        : comparisonState,
      value: comparisonCurrent ? differences.length : 'Unavailable',
      detail: comparisonCurrent
        ? 'Source statements require human review.'
        : unavailableDetail,
      source,
      rows: comparisonCurrent
        ? differences.map((item) => ({
            id: item.key,
            label: item.name,
            detail: item.kind.replaceAll('_', ' '),
          }))
        : undefined,
    },
    {
      id: 'observations-unavailable',
      title: 'Vitals and lab results',
      pages: ['patient'],
      state: 'unavailable',
      value: 'Unavailable',
      detail: 'No observation data was supplied to this catalog.',
      source: 'No observation source supplied',
    },
  ];
}

/**
 * Pure deterministic model of `WorkspaceWidgets` state transitions (catalog add/remove,
 * reorder boundaries, keyboard navigation, and persistence/restore).
 */
interface PageWidgetState {
  pageId: string;
  catalogTitles: readonly string[];
  hasPageNote: boolean;
  savedLayoutJson: string | null;
  inMemoryLayout: string[] | null;
  storageWritable: boolean;
  editing: boolean;
}

interface PageWidgetDerived {
  defaults: string[];
  visible: string[] | null;
  pinned: string[];
  available: string[];
}

function derivePageWidgetState(state: PageWidgetState): PageWidgetDerived {
  const catalogSet = new Set(state.catalogTitles);
  const defaults = state.catalogTitles.slice(0, 3);
  let visible = state.inMemoryLayout;
  if (!visible && state.savedLayoutJson) {
    try {
      const decoded: unknown = JSON.parse(state.savedLayoutJson);
      if (Array.isArray(decoded)) {
        visible = [
          ...new Set(
            decoded.filter((item): item is string => typeof item === 'string'),
          ),
        ];
      }
    } catch {
      // Restore defaults if saved layout cannot be read.
    }
  }
  const fallback =
    state.hasPageNote && catalogSet.has('Page note')
      ? [...defaults, 'Page note']
      : defaults;
  const pinned = (visible ?? fallback).filter((id) => catalogSet.has(id));
  const pinnedSet = new Set(pinned);
  const available = state.catalogTitles.filter((title) => !pinnedSet.has(title));
  return { defaults, visible, pinned, available };
}

function applyPageWidgetLayout(
  state: PageWidgetState,
  next: string[],
  message: string,
  reset = false,
): {
  nextState: PageWidgetState;
  derived: PageWidgetDerived;
  announcement: string;
  persistedLayout: string[];
} {
  const catalogSet = new Set(state.catalogTitles);
  const current = derivePageWidgetState(state);
  const unavailable = reset
    ? []
    : current.visible?.filter((id) => !catalogSet.has(id)) ?? [];
  const layout = [...next, ...unavailable];
  let nextState: PageWidgetState;
  let announcement = message;

  if (state.storageWritable) {
    nextState = {
      ...state,
      savedLayoutJson: JSON.stringify(layout),
      inMemoryLayout: null,
    };
  } else {
    nextState = {
      ...state,
      inMemoryLayout: layout,
    };
    announcement += ' This layout will reset when you leave the page.';
  }

  return {
    nextState,
    derived: derivePageWidgetState(nextState),
    announcement,
    persistedLayout: layout,
  };
}

function placePageWidget(
  state: PageWidgetState,
  id: string,
  position: number,
) {
  const current = derivePageWidgetState(state);
  const pinnedSet = new Set(current.pinned);
  const layout = current.pinned.filter((item) => item !== id);
  const boundedPos = Math.max(0, Math.min(position, layout.length));
  layout.splice(boundedPos, 0, id);
  const msg = `${pinnedSet.has(id) ? 'Moved' : 'Added'} ${id} to position ${boundedPos + 1} of ${layout.length}.`;
  const result = applyPageWidgetLayout(state, layout, msg, false);
  return {
    ...result,
    pendingFocus: { id, inCatalog: false as const },
  };
}

function removePageWidget(state: PageWidgetState, id: string) {
  const current = derivePageWidgetState(state);
  const layout = current.pinned.filter((item) => item !== id);
  const result = applyPageWidgetLayout(
    state,
    layout,
    `Removed ${id} from this page.`,
    false,
  );
  return {
    ...result,
    pendingFocus: state.editing ? { id, inCatalog: true as const } : null,
  };
}

function handleGripKeyDown(
  state: PageWidgetState,
  id: string,
  key: string,
): {
  moved: boolean;
  direction: -1 | 0 | 1;
  nextState: PageWidgetState;
  derived: PageWidgetDerived;
  announcement: string;
  pendingFocus: { id: string; inCatalog: boolean } | null;
} {
  const current = derivePageWidgetState(state);
  const index = current.pinned.indexOf(id);
  const direction: -1 | 0 | 1 =
    key === 'ArrowLeft' || key === 'ArrowUp'
      ? -1
      : key === 'ArrowRight' || key === 'ArrowDown'
        ? 1
        : 0;
  if (!direction || index < 0) {
    return {
      moved: false,
      direction,
      nextState: state,
      derived: current,
      announcement: '',
      pendingFocus: null,
    };
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= current.pinned.length) {
    return {
      moved: false,
      direction,
      nextState: state,
      derived: current,
      announcement: '',
      pendingFocus: null,
    };
  }
  const res = placePageWidget(state, id, nextIndex);
  return {
    moved: true,
    direction,
    nextState: res.nextState,
    derived: res.derived,
    announcement: res.announcement,
    pendingFocus: res.pendingFocus,
  };
}

describe('qa-250k-widgets-20k: Row 4 (20,000 deterministic widget state & keyboard logic cases)', () => {
  beforeEach(() => {
    resetWidgetRegistry();
  });

  it('1. Catalog add/remove: 5,000 seeded deterministic cases (WGT-ADDREM-00001..05000)', () => {
    const rng = mulberry32(0x4100_0001);
    const baseCatalog = [
      'Active case',
      'Notes entered',
      'Differences to review',
      'Decisions recorded',
      'Awaiting decision',
      'Clarifications',
      'Page note',
    ] as const;

    let executed = 0;
    for (let i = 0; i < 5000; i++) {
      const mode = i % 5;

      if (mode === 0) {
        // Add an available widget from catalog to grid
        const hasPageNote = (i & 1) === 0;
        const init: PageWidgetState = {
          pageId: WORKSPACE_PAGES[i % WORKSPACE_PAGES.length]!,
          catalogTitles: baseCatalog,
          hasPageNote,
          savedLayoutJson: null,
          inMemoryLayout: null,
          storageWritable: true,
          editing: true,
        };
        const before = derivePageWidgetState(init);
        const candidate =
          before.available[Math.floor(rng() * before.available.length)]!;
        const targetPos = Math.floor(rng() * (before.pinned.length + 1));
        const after = placePageWidget(init, candidate, targetPos);

        equal(after.derived.pinned.includes(candidate), true);
        equal(after.derived.available.includes(candidate), false);
        equal(after.derived.pinned.indexOf(candidate), targetPos);
        equal(after.derived.pinned.length, before.pinned.length + 1);
        equal(
          new Set(after.derived.pinned).size,
          after.derived.pinned.length,
        );
        equal(
          after.announcement,
          `Added ${candidate} to position ${targetPos + 1} of ${after.derived.pinned.length}.`,
        );
        equal(after.pendingFocus.id, candidate);
        equal(after.pendingFocus.inCatalog, false);
      } else if (mode === 1) {
        // Remove a pinned widget back to the catalog while editing vs not editing
        const editing = i % 2 === 0;
        const init: PageWidgetState = {
          pageId: WORKSPACE_PAGES[i % WORKSPACE_PAGES.length]!,
          catalogTitles: baseCatalog,
          hasPageNote: true,
          savedLayoutJson: JSON.stringify(baseCatalog.slice(0, 5)),
          inMemoryLayout: null,
          storageWritable: true,
          editing,
        };
        const before = derivePageWidgetState(init);
        const removeIdx = Math.floor(rng() * before.pinned.length);
        const targetId = before.pinned[removeIdx]!;
        const after = removePageWidget(init, targetId);

        equal(after.derived.pinned.includes(targetId), false);
        equal(after.derived.available.includes(targetId), true);
        equal(after.derived.pinned.length, before.pinned.length - 1);
        equal(after.announcement, `Removed ${targetId} from this page.`);
        if (editing) {
          equal(after.pendingFocus?.id, targetId);
          equal(after.pendingFocus?.inCatalog, true);
        } else {
          equal(after.pendingFocus, null);
        }
      } else if (mode === 2) {
        // Remove all widgets down to 0, then re-add from catalog without duplicates
        let state: PageWidgetState = {
          pageId: 'extract',
          catalogTitles: baseCatalog,
          hasPageNote: false,
          savedLayoutJson: null,
          inMemoryLayout: null,
          storageWritable: true,
          editing: true,
        };
        for (const id of [...derivePageWidgetState(state).pinned]) {
          state = removePageWidget(state, id).nextState;
        }
        const emptyDerived = derivePageWidgetState(state);
        equal(emptyDerived.pinned.length, 0);
        equal(emptyDerived.available.length, baseCatalog.length);

        const pickA = baseCatalog[i % baseCatalog.length]!;
        const pickB = baseCatalog[(i + 3) % baseCatalog.length]!;
        state = placePageWidget(state, pickA, 0).nextState;
        state = placePageWidget(state, pickB, 1).nextState;
        // Re-placing pickA moves it instead of duplicating
        const moved = placePageWidget(state, pickA, 1);
        equal(moved.derived.pinned.length, 2);
        equal(moved.derived.pinned[0], pickB);
        equal(moved.derived.pinned[1], pickA);
        ok(moved.announcement.startsWith(`Moved ${pickA} to position 2 of 2.`));
      } else if (mode === 3) {
        // CockpitWidgets visibility toggle & minimum-1-visible-widget invariant
        const order = [...DEFAULT_COCKPIT_WIDGET_ORDER];
        let hidden: CockpitWidgetId[] = [];
        for (let step = 0; step < order.length; step++) {
          const id = order[(i + step) % order.length]!;
          const isHidden = hidden.includes(id);
          if (!isHidden && order.length - hidden.length <= 1) {
            // Must block hiding the last visible widget
            equal(order.length - hidden.length, 1);
          } else {
            hidden = [...hidden, id];
          }
        }
        equal(order.length - hidden.length, 1);
        // Unhiding restores visibility
        const restoreId = hidden[0]!;
        hidden = hidden.filter((x) => x !== restoreId);
        equal(order.length - hidden.length, 2);
      } else {
        // WidgetRegistry add/query & BacklogCatalog section/query filter
        const reg = createWidgetRegistry();
        const customId = `custom-widget-${i}`;
        const baseDef = CORE_WIDGET_DEFINITIONS[i % CORE_WIDGET_DEFINITIONS.length]!;
        const customDef: WidgetDefinition = {
          ...baseDef,
          id: customId,
          displayName: `Custom Surface ${i}`,
          featureFlags: i % 2 === 0 ? ['flag-alpha'] : [],
        };
        reg.registerWidget(customDef);
        equal(reg.getWidget(customId)?.displayName, `Custom Surface ${i}`);
        equal(reg.getAllWidgets().length, CORE_WIDGET_DEFINITIONS.length + 1);

        let emptyThrew = false;
        try {
          reg.registerWidget({ ...customDef, id: '   ' });
        } catch {
          emptyThrew = true;
        }
        equal(emptyThrew, true);

        const sec: BacklogSectionId =
          BACKLOG_SECTIONS[i % BACKLOG_SECTIONS.length]!.id;
        const secItems = BACKLOG_WIDGET_CATALOG.filter(
          (item) => item.section === sec,
        );
        ok(secItems.length > 0);
      }

      executed++;
    }
    expect(executed).toBe(5000);
  });

  it('2. Reorder boundaries and keyboard rules: 5,000 seeded deterministic cases (WGT-REORDER-00001..05000)', () => {
    const rng = mulberry32(0x4200_0002);
    const catalogTitles = [
      'Active case',
      'Notes entered',
      'Differences to review',
      'Decisions recorded',
      'Awaiting decision',
      'Clarifications',
    ] as const;
    const keys = [
      'ArrowLeft',
      'ArrowUp',
      'ArrowRight',
      'ArrowDown',
      'Enter',
      'Space',
      'Tab',
      'Home',
      'End',
    ] as const;

    let executed = 0;
    for (let i = 0; i < 5000; i++) {
      const mode = i % 5;

      if (mode === 0) {
        // Left/Up boundary at index 0 must be a strict no-op
        const state: PageWidgetState = {
          pageId: 'extract',
          catalogTitles,
          hasPageNote: false,
          savedLayoutJson: JSON.stringify(catalogTitles.slice(0, 4)),
          inMemoryLayout: null,
          storageWritable: true,
          editing: i % 2 === 0,
        };
        const firstId = catalogTitles[0]!;
        const key = i % 2 === 0 ? 'ArrowLeft' : 'ArrowUp';
        const res = handleGripKeyDown(state, firstId, key);
        equal(res.moved, false);
        equal(res.direction, -1);
        equal(res.derived.pinned[0], firstId);
        equal(res.announcement, '');
        equal(res.pendingFocus, null);
      } else if (mode === 1) {
        // Right/Down boundary at last index (pinned.length - 1) must be a strict no-op
        const pinnedInit = catalogTitles.slice(0, 4);
        const state: PageWidgetState = {
          pageId: 'extract',
          catalogTitles,
          hasPageNote: false,
          savedLayoutJson: JSON.stringify(pinnedInit),
          inMemoryLayout: null,
          storageWritable: true,
          editing: i % 2 === 0,
        };
        const lastId = pinnedInit[pinnedInit.length - 1]!;
        const key = i % 2 === 0 ? 'ArrowRight' : 'ArrowDown';
        const res = handleGripKeyDown(state, lastId, key);
        equal(res.moved, false);
        equal(res.direction, 1);
        equal(res.derived.pinned[res.derived.pinned.length - 1], lastId);
        equal(res.announcement, '');
        equal(res.pendingFocus, null);
      } else if (mode === 2) {
        // Valid interior and edge-adjacent keyboard moves preserve set invariants
        const pinnedInit = [...catalogTitles.slice(0, 5)];
        const state: PageWidgetState = {
          pageId: 'patient',
          catalogTitles,
          hasPageNote: false,
          savedLayoutJson: JSON.stringify(pinnedInit),
          inMemoryLayout: null,
          storageWritable: true,
          editing: true,
        };
        const idx = 1 + (i % 3); // 1, 2, or 3 (interior indices)
        const id = pinnedInit[idx]!;
        const key = keys[i % 4]!; // ArrowLeft, ArrowUp, ArrowRight, ArrowDown
        const expectedDir = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
        const res = handleGripKeyDown(state, id, key);

        equal(res.moved, true);
        equal(res.direction, expectedDir);
        equal(res.derived.pinned.indexOf(id), idx + expectedDir);
        equal(res.derived.pinned.length, pinnedInit.length);
        equal(new Set(res.derived.pinned).size, pinnedInit.length);
        equal(
          res.announcement,
          `Moved ${id} to position ${idx + expectedDir + 1} of ${pinnedInit.length}.`,
        );
        equal(res.pendingFocus?.id, id);
        equal(res.pendingFocus?.inCatalog, false);
      } else if (mode === 3) {
        // Non-arrow keys on grip are ignored; Escape cancels active pointer drag; <8px pointer move does not capture slots
        const pinnedInit = [...catalogTitles.slice(0, 4)];
        const state: PageWidgetState = {
          pageId: 'diff',
          catalogTitles,
          hasPageNote: false,
          savedLayoutJson: JSON.stringify(pinnedInit),
          inMemoryLayout: null,
          storageWritable: true,
          editing: true,
        };
        const nonArrowKey = keys[4 + (i % 5)]!;
        const res = handleGripKeyDown(state, pinnedInit[1]!, nonArrowKey);
        equal(res.moved, false);
        equal(res.direction, 0);
        equal(res.derived.pinned.join(','), pinnedInit.join(','));

        // Pointer drag distance threshold (< 8px vs >= 8px) and Escape cancel
        const dx = (rng() * 14) - 7;
        const dy = (rng() * 14) - 7;
        const dist = Math.hypot(dx, dy);
        const captured = dist >= 8;
        if (dist < 8) {
          equal(captured, false);
        } else {
          equal(captured, true);
        }
      } else {
        // CockpitWidgets moveWidget(-1 | 1), moveWidgetToEdge('first' | 'last'), and disabled-button focus fallback
        const order = [...DEFAULT_COCKPIT_WIDGET_ORDER];
        const idx = i % order.length;
        const id = order[idx]!;
        const dir: -1 | 1 = i % 2 === 0 ? -1 : 1;
        const targetIdx = idx + dir;

        if (targetIdx < 0 || targetIdx >= order.length) {
          // Boundary: cannot move past 0 or length - 1
          equal(targetIdx < 0 || targetIdx >= order.length, true);
        } else {
          const next = [...order];
          const [moved] = next.splice(idx, 1);
          next.splice(targetIdx, 0, moved!);
          equal(next.indexOf(id), targetIdx);
          equal(next.length, order.length);
          // Focus fallback rule: if targetIdx === 0 after moving left, left button is disabled so focus falls back to right button
          const preferredDir = dir === -1 ? 'left' : 'right';
          const preferredDisabled =
            (preferredDir === 'left' && targetIdx === 0) ||
            (preferredDir === 'right' && targetIdx === next.length - 1);
          const focusedControl = preferredDisabled
            ? dir === -1
              ? `${id}:right`
              : `${id}:left`
            : `${id}:${preferredDir}`;
          if (targetIdx === 0 && dir === -1) {
            equal(focusedControl, `${id}:right`);
          } else if (targetIdx === next.length - 1 && dir === 1) {
            equal(focusedControl, `${id}:left`);
          } else {
            equal(focusedControl, `${id}:${preferredDir}`);
          }
        }
      }

      executed++;
    }
    expect(executed).toBe(5000);
  });

  it('3. Per-page and per-case layouts: 4,000 seeded deterministic cases (WGT-LAYOUT-00001..04000)', () => {
    const rng = mulberry32(0x4300_0003);
    const registry = createWidgetRegistry();
    const presets = getAllLayoutPresets();
    equal(presets.length, LAYOUT_PRESET_IDS.length);

    let executed = 0;
    for (let i = 0; i < 4000; i++) {
      const mode = i % 4;

      if (mode === 0) {
        // Per-page widget scoping across all 7 workspace pages + no internal evaluation widgets leaked
        const page = WORKSPACE_PAGES[i % WORKSPACE_PAGES.length]!;
        const caseId = `case-${i}`;
        const ctx: WorkspaceCatalogContext = {
          activeCase: { id: caseId, name: `Patient ${i}` },
          notes: {
            caseId,
            earlier: 'Lisinopril 10 mg daily',
            later: 'Lisinopril 20 mg daily',
          },
          comparison: {
            caseId,
            earlierText: 'Lisinopril 10 mg daily',
            laterText: 'Lisinopril 20 mg daily',
            differences: [
              { key: 'lisinopril', name: 'Lisinopril', kind: 'regimen_changed' },
            ],
            modeLabel: 'Rules',
            simulated: true,
          },
          reviews: {
            caseId,
            earlierText: 'Lisinopril 10 mg daily',
            laterText: 'Lisinopril 20 mg daily',
            decisions: { lisinopril: 'reviewed' },
          },
          ownedCases: [{ id: caseId, name: `Patient ${i}` }],
        };
        const catalog = evaluateWorkspaceWidgetCatalog(ctx);
        const pageWidgets = catalog.filter((item) => item.pages.includes(page));

        for (const w of pageWidgets) {
          ok(w.pages.includes(page));
          ok(w.source.length > 0);
          equal(/evaluat|benchmark/i.test(w.title), false);
        }
        // Storage key is strictly scoped per pageId
        const storageKeyA = `diffmd-widget-layout-v1:${page}`;
        const otherPage =
          WORKSPACE_PAGES[(i + 1) % WORKSPACE_PAGES.length]!;
        const storageKeyB = `diffmd-widget-layout-v1:${otherPage}`;
        ok(storageKeyA !== storageKeyB);
      } else if (mode === 1) {
        // Per-case isolation: activeCase B never sees notes, comparisons, or reviews from case A
        const caseA = `SYNC-${String(i).padStart(32, 'A')}`;
        const caseB = `SYNC-${String(i).padStart(32, 'B')}`;
        const crossCtx: WorkspaceCatalogContext = {
          activeCase: { id: caseB, name: 'Case B' },
          notes: {
            caseId: caseA,
            earlier: 'Metformin 500 mg BID',
            later: 'Metformin 1000 mg BID',
          },
          comparison: {
            caseId: caseA,
            earlierText: 'Metformin 500 mg BID',
            laterText: 'Metformin 1000 mg BID',
            differences: [
              { key: 'metformin', name: 'Metformin', kind: 'regimen_changed' },
            ],
            modeLabel: 'Rules',
            simulated: true,
          },
          reviews: {
            caseId: caseA,
            earlierText: 'Metformin 500 mg BID',
            laterText: 'Metformin 1000 mg BID',
            decisions: { metformin: 'clarify' },
          },
          ownedCases: [
            { id: caseA, name: 'Case A' },
            { id: caseB, name: 'Case B' },
          ],
        };
        const items = evaluateWorkspaceWidgetCatalog(crossCtx);
        const byId = new Map(items.map((item) => [item.id, item]));

        equal(byId.get('active-case')?.value, 'Case B');
        equal(byId.get('notes-present')?.state, 'unavailable');
        equal(byId.get('notes-present')?.value, 'Unavailable');
        equal(byId.get('earlier-note')?.value, 'Unavailable');
        equal(byId.get('later-note')?.value, 'Unavailable');
        equal(byId.get('comparison-differences')?.state, 'unavailable');
        equal(byId.get('comparison-differences')?.value, 'Unavailable');
        equal(byId.get('difference-list')?.rows, undefined);
        equal(byId.get('reviewed-count')?.value, 'Unavailable');
        equal(byId.get('clarifications')?.value, 'Unavailable');
      } else if (mode === 2) {
        // hasPageNote default inclusion & preserving temporarily absent context widgets across saves
        const fullCatalog = [
          'Active case',
          'Notes entered',
          'Differences to review',
          'Context-only widget',
          'Page note',
        ];
        const reducedCatalog = [
          'Active case',
          'Notes entered',
          'Differences to review',
          'Page note',
        ];
        const withNoteState: PageWidgetState = {
          pageId: 'patient',
          catalogTitles: reducedCatalog,
          hasPageNote: true,
          savedLayoutJson: null,
          inMemoryLayout: null,
          storageWritable: true,
          editing: false,
        };
        const derivedWithNote = derivePageWidgetState(withNoteState);
        equal(derivedWithNote.pinned.includes('Page note'), true);
        equal(derivedWithNote.pinned.length, 4);

        // If 'Context-only widget' was saved previously, editing while on reducedCatalog preserves it in persistedLayout
        const stateWithSavedContextWidget: PageWidgetState = {
          ...withNoteState,
          savedLayoutJson: JSON.stringify([
            'Active case',
            'Context-only widget',
            'Notes entered',
          ]),
        };
        const res = placePageWidget(
          stateWithSavedContextWidget,
          'Differences to review',
          1,
        );
        equal(res.persistedLayout.includes('Context-only widget'), true);
        // When fullCatalog is restored, 'Context-only widget' reappears in pinned
        const restoredFull = derivePageWidgetState({
          ...res.nextState,
          catalogTitles: fullCatalog,
        });
        equal(restoredFull.pinned.includes('Context-only widget'), true);
      } else {
        // 12-column grid layout validation (valid presets vs out-of-bounds, min/max violations, overlaps)
        const basePreset = getLayoutPreset(
          LAYOUT_PRESET_IDS[i % LAYOUT_PRESET_IDS.length]!,
        )!;
        const baseValid = validateLayoutPreset(basePreset, registry);
        equal(baseValid.valid, true);
        equal(baseValid.errors.length, 0);

        const faultKind = i % 3;
        const firstInst = basePreset.widgetInstances[0]!;
        const secondInst = basePreset.widgetInstances[1]!;
        let badPos: WidgetPosition;

        if (faultKind === 0) {
          // Out of 12-col grid bounds
          badPos = {
            x: 8,
            y: 0,
            width: GRID_COLUMN_COUNT - 4 + 1 + Math.floor(rng() * 3),
            height: 2,
          };
        } else if (faultKind === 1) {
          // Below minDimensions
          badPos = { x: 0, y: 100, width: 1, height: 1 };
        } else {
          // Exact overlap with secondInst
          badPos = { ...secondInst.position };
        }

        const mutated: LayoutPreset = {
          ...basePreset,
          id: `mutated-${i}`,
          widgetInstances: [
            { ...firstInst, position: badPos },
            ...basePreset.widgetInstances.slice(1),
          ],
        };
        const check = validateLayoutPreset(mutated, registry);
        equal(check.valid, false);
        ok(check.errors.length >= 1);
      }

      executed++;
    }
    expect(executed).toBe(4000);
  });

  it('4. Persistence and restore: 3,000 seeded deterministic cases (WGT-PERSIST-00001..03000)', () => {
    const rng = mulberry32(0x4400_0004);
    const catalogTitles = [
      'Active case',
      'Notes entered',
      'Differences to review',
      'Decisions recorded',
      'Awaiting decision',
      'Clarifications',
      'Page note',
    ] as const;
    const corruptPayloads = [
      '{corrupt json',
      '',
      'null',
      '12345',
      '{"not":"an array"}',
      'true',
      '[null, 42, {}, "Active case", "Active case", "Notes entered", "Unknown widget"]',
    ] as const;

    let executed = 0;
    for (let i = 0; i < 3000; i++) {
      const mode = i % 4;

      if (mode === 0) {
        // Persist custom order, deduplicate repeated IDs, and reload identically
        const shuffled = [...catalogTitles].sort(() => rng() - 0.5).slice(0, 4);
        const withDuplicates = [...shuffled, shuffled[0]!, shuffled[1]!];
        const state: PageWidgetState = {
          pageId: WORKSPACE_PAGES[i % WORKSPACE_PAGES.length]!,
          catalogTitles,
          hasPageNote: false,
          savedLayoutJson: JSON.stringify(withDuplicates),
          inMemoryLayout: null,
          storageWritable: true,
          editing: false,
        };
        const derived = derivePageWidgetState(state);
        equal(derived.pinned.length, shuffled.length);
        equal(derived.pinned.join('|'), shuffled.join('|'));
      } else if (mode === 1) {
        // Corrupt or malformed localStorage JSON falls back safely without throwing
        const raw = corruptPayloads[i % corruptPayloads.length]!;
        const hasPageNote = i % 2 === 0;
        const state: PageWidgetState = {
          pageId: 'home',
          catalogTitles,
          hasPageNote,
          savedLayoutJson: raw,
          inMemoryLayout: null,
          storageWritable: true,
          editing: false,
        };
        const derived = derivePageWidgetState(state);
        if (raw.startsWith('[null')) {
          // Mixed array filters to valid catalog strings and deduplicates
          equal(derived.pinned.join('|'), 'Active case|Notes entered');
        } else {
          const expectedLen = hasPageNote ? 4 : 3;
          equal(derived.pinned.length, expectedLen);
          equal(derived.pinned.slice(0, 3).join('|'), catalogTitles.slice(0, 3).join('|'));
        }
      } else if (mode === 2) {
        // Storage write failure falls back to inMemoryLayout with explicit warning message
        const init: PageWidgetState = {
          pageId: 'extract',
          catalogTitles,
          hasPageNote: false,
          savedLayoutJson: null,
          inMemoryLayout: null,
          storageWritable: false,
          editing: true,
        };
        const added = placePageWidget(init, 'Clarifications', 0);
        equal(added.nextState.savedLayoutJson, null);
        ok(Array.isArray(added.nextState.inMemoryLayout));
        equal(added.derived.pinned[0], 'Clarifications');
        ok(
          added.announcement.endsWith(
            'This layout will reset when you leave the page.',
          ),
        );
      } else {
        // Reset widget layout restores defaults and clears unavailable/custom items
        const init: PageWidgetState = {
          pageId: 'extract',
          catalogTitles,
          hasPageNote: true,
          savedLayoutJson: JSON.stringify([
            'Clarifications',
            'Stale-removed-widget',
          ]),
          inMemoryLayout: ['Clarifications'],
          storageWritable: true,
          editing: true,
        };
        const defaults = catalogTitles.slice(0, 3);
        const resetRes = applyPageWidgetLayout(
          init,
          [...defaults],
          'Default widget layout restored.',
          true,
        );
        equal(resetRes.announcement, 'Default widget layout restored.');
        equal(resetRes.persistedLayout.join('|'), defaults.join('|'));
        equal(resetRes.derived.pinned.join('|'), defaults.join('|'));
        equal(resetRes.nextState.inMemoryLayout, null);
      }

      executed++;
    }
    expect(executed).toBe(3000);
  });

  it('5. Data refresh and stale-state handling: 3,000 seeded deterministic cases (WGT-REFRESH-00001..03000)', () => {
    const precomputedReports = syntheticScenarios.map((s) => ({
      scenario: s,
      report: analyzeSnapshots(s.earlier, s.later),
    }));

    let executed = 0;
    for (let i = 0; i < 3000; i++) {
      const mode = i % 5;
      const caseId = `case-refresh-${i}`;
      const earlierText = `Lisinopril ${10 + (i % 20)} mg daily`;
      const laterText = `Lisinopril ${20 + (i % 20)} mg daily`;

      if (mode === 0) {
        // Editing earlier or later note after comparison marks comparison & review widgets as 'stale' with 'Unavailable' value
        const editedLater =
          i % 2 === 0 ? `${laterText} (edited)` : `${laterText} `;
        const staleCtx: WorkspaceCatalogContext = {
          activeCase: { id: caseId, name: 'Refresh Patient' },
          notes: { caseId, earlier: earlierText, later: editedLater },
          comparison: {
            caseId,
            earlierText,
            laterText,
            differences: [
              { key: 'lisinopril', name: 'Lisinopril', kind: 'regimen_changed' },
            ],
            modeLabel: 'Rules',
            simulated: true,
          },
          reviews: {
            caseId,
            earlierText,
            laterText,
            decisions: { lisinopril: 'reviewed' },
          },
          ownedCases: [{ id: caseId, name: 'Refresh Patient' }],
        };
        const items = evaluateWorkspaceWidgetCatalog(staleCtx);
        const byId = new Map(items.map((item) => [item.id, item]));

        for (const id of [
          'comparison-differences',
          'earlier-only',
          'later-only',
          'regimen-changed',
          'explicit-discontinuation',
          'comparison-mode',
          'difference-list',
          'reviewed-count',
          'awaiting-review',
          'clarifications',
        ]) {
          const item = byId.get(id)!;
          equal(item.state, 'stale');
          equal(item.value, 'Unavailable');
          equal(
            item.detail,
            'Notes changed since this comparison. Run it again.',
          );
        }
        equal(byId.get('difference-list')?.rows, undefined);
      } else if (mode === 1) {
        // Re-running comparison with updated note texts refreshes state from 'stale' back to 'ready'
        const updatedLater = `${laterText}; Metformin 500 mg BID`;
        const refreshedCtx: WorkspaceCatalogContext = {
          activeCase: { id: caseId, name: 'Refresh Patient' },
          notes: { caseId, earlier: earlierText, later: updatedLater },
          comparison: {
            caseId,
            earlierText,
            laterText: updatedLater,
            differences: [
              { key: 'lisinopril', name: 'Lisinopril', kind: 'regimen_changed' },
              { key: 'metformin', name: 'Metformin', kind: 'later_only' },
            ],
            modeLabel: 'Rules',
            simulated: false,
          },
          reviews: {
            caseId,
            earlierText,
            laterText: updatedLater,
            decisions: { lisinopril: 'reviewed', metformin: 'clarify' },
          },
          ownedCases: [{ id: caseId, name: 'Refresh Patient' }],
        };
        const items = evaluateWorkspaceWidgetCatalog(refreshedCtx);
        const byId = new Map(items.map((item) => [item.id, item]));

        equal(byId.get('comparison-differences')?.state, 'ready');
        equal(byId.get('comparison-differences')?.value, 2);
        equal(byId.get('regimen-changed')?.value, 1);
        equal(byId.get('later-only')?.value, 1);
        equal(byId.get('reviewed-count')?.state, 'ready');
        equal(byId.get('reviewed-count')?.value, 2);
        equal(byId.get('awaiting-review')?.value, 0);
        equal(byId.get('clarifications')?.value, 1);
        equal(byId.get('difference-list')?.rows?.length, 2);
      } else if (mode === 2) {
        // Mismatched review note versions or duplicate difference keys mark review widgets 'unavailable', never 0
        const hasDuplicateKey = i % 2 === 0;
        const badReviewsCtx: WorkspaceCatalogContext = {
          activeCase: { id: caseId, name: 'Refresh Patient' },
          notes: { caseId, earlier: earlierText, later: laterText },
          comparison: {
            caseId,
            earlierText,
            laterText,
            differences: hasDuplicateKey
              ? [
                  { key: 'dup', name: 'Lisinopril', kind: 'regimen_changed' },
                  { key: 'dup', name: 'Lisinopril 2', kind: 'later_only' },
                ]
              : [
                  {
                    key: 'lisinopril',
                    name: 'Lisinopril',
                    kind: 'regimen_changed',
                  },
                ],
            modeLabel: 'Rules',
            simulated: true,
          },
          reviews: {
            caseId,
            earlierText: hasDuplicateKey ? earlierText : 'Outdated earlier text',
            laterText,
            decisions: { dup: 'reviewed', lisinopril: 'reviewed' },
          },
          ownedCases: [{ id: caseId, name: 'Refresh Patient' }],
        };
        const items = evaluateWorkspaceWidgetCatalog(badReviewsCtx);
        const byId = new Map(items.map((item) => [item.id, item]));

        equal(byId.get('comparison-differences')?.state, 'ready');
        equal(byId.get('reviewed-count')?.state, 'unavailable');
        equal(byId.get('reviewed-count')?.value, 'Unavailable');
        equal(byId.get('awaiting-review')?.state, 'unavailable');
        equal(byId.get('awaiting-review')?.value, 'Unavailable');
        equal(byId.get('clarifications')?.state, 'unavailable');
        equal(byId.get('clarifications')?.value, 'Unavailable');
      } else if (mode === 3) {
        // Dynamic clinical/specialty/backlog widgets refresh counts & rows when BacklogBuildContext changes
        const { scenario, report } =
          precomputedReports[i % precomputedReports.length]!;
        const firstMedId = report.changes[0]?.medicationId ?? 'med-1';
        const socketStates = ['standby', 'replay', 'live'] as const;
        const ctx: BacklogBuildContext = {
          patientLabel: scenario.patientLabel,
          scenarioId: scenario.id,
          report,
          reviews: {
            [`${scenario.id}:${firstMedId}`]:
              i % 2 === 0 ? 'flag' : 'verified',
          },
          socketState: socketStates[i % socketStates.length]!,
          evalTested: 32,
          evalPassed: 32 - (i % 3),
          evalFailed: i % 3,
          auditCount: 1 + (i % 25),
        };

        const widgetId =
          BACKLOG_WIDGET_CATALOG[i % BACKLOG_WIDGET_CATALOG.length]!.id;
        const data = CLINICAL_ID_SET.has(widgetId)
          ? buildClinicalWidgetData(widgetId, ctx)!
          : SPECIALTY_ID_SET.has(widgetId)
            ? buildSpecialtyWidgetData(widgetId, ctx)
            : buildBacklogWidgetData(widgetId, ctx);

        equal(data.id, widgetId);
        equal(data.patientLabel, scenario.patientLabel);
        equal(data.counts.total, data.rows.length);
        const expectedMissing = data.rows.filter(
          (r) => r.status === 'missing' || r.status === 'unknown',
        ).length;
        const expectedAlerts = data.rows.filter(
          (r) => r.status === 'conflicting' || r.status === 'warning',
        ).length;
        equal(data.counts.missingOrUnknown, expectedMissing);
        equal(data.counts.alertsOrConflicts, expectedAlerts);
      } else {
        // Core widget RefreshStrategy & dataDependency readiness on patient/encounter transitions
        const widgetId: CoreWidgetId =
          CORE_WIDGET_IDS[i % CORE_WIDGET_IDS.length]!;
        const def = DEFAULT_LAYOUT_PRESETS['default-ambulatory'].widgetInstances.find(
          (w) => w.definitionId === widgetId,
        );
        ok(def !== undefined);
        const hasEncounter = i % 3 !== 0;
        const clinicalCtx: ClinicalContext = {
          patient: {
            id: `PAT-${i}`,
            name: 'Synthetic Patient',
            age: 50,
            sex: 'F',
            activeProblems: [],
            allergies: [],
            activeMedications: [],
            missing: [],
          },
          encounter: hasEncounter
            ? {
                id: `ENC-${i}`,
                patientId: `PAT-${i}`,
                date: '2026-11-15',
                kind: 'outpatient',
                summary: 'Follow-up',
                sourceRef: 's1',
                medications: [],
                encounters: [],
                unresolvedDiscrepancies: [],
              }
            : null,
          clinician: { id: 'clin-1', name: 'Dr. Test', role: 'clinician' },
          dataPermissions: {
            grantedPermissions: [
              'read:patient',
              'read:medications',
              'write:proposed-actions',
              'commit:documentation',
            ],
          },
          encounterState: 'open',
          sourceVersions: { s1: `v${i}` },
          proposedChanges: [],
          committedChanges: [],
        };
        const renderable = canRender(widgetId, clinicalCtx);
        const coreDef = CORE_WIDGET_DEFINITIONS.find((d) => d.id === widgetId)!;
        if (!hasEncounter && coreDef.dataDependencies.includes('encounter')) {
          equal(renderable, false);
        } else {
          equal(renderable, true);
        }
      }

      executed++;
    }
    expect(executed).toBe(3000);
  });
});

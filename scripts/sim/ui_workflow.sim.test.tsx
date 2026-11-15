import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Home from '@/app/page';
import { analyzeSnapshots } from '@/lib/diff';
import { syntheticScenarios } from '@/lib/fixtures';
import { hfDatasetSources, hfNoteComparisonPairs, hfScenarios } from '@/lib/hf-fixtures';
import { SeededRng } from './prng';

const ROOT_DIR = process.cwd();
const LAYOUT_SRC = fs.readFileSync(path.resolve(ROOT_DIR, 'src/app/layout.tsx'), 'utf8');
const GLOBALS_CSS_SRC = fs.readFileSync(path.resolve(ROOT_DIR, 'src/app/globals.css'), 'utf8');
const EDITORIAL_HTML_SRC = fs.readFileSync(
  path.resolve(ROOT_DIR, 'veritas-editorial/index.html'),
  'utf8',
);

const PALETTE_IDS = ['void', 'dimmed', 'obsidian', 'forest'] as const;
const PALETTE_NAMES: Record<(typeof PALETTE_IDS)[number], string> = {
  void: 'Graphite',
  dimmed: 'Dark Dimmed',
  obsidian: 'Primer Obsidian',
  forest: 'Nordic Forest',
};

const WORKSPACE_VIEW_LABELS = [
  'Compare notes',
  'Snapshot review',
  'Review suggestions',
  'Evaluations',
  'Session activity',
] as const;

const ALL_VIEWS = [
  { navLabel: 'Compare notes', h1: 'Discharge medication review' },
  { navLabel: 'Snapshot review', h1: null },
  { navLabel: 'Review suggestions', h1: 'Suggestions waiting for a clinician' },
  { navLabel: 'Evaluations', h1: 'Evaluation results' },
  { navLabel: 'Session activity', h1: 'Session activity' },
  { navLabel: 'Models & data', h1: 'Models and data' },
] as const;

const XSS_AND_EDGE_NOTES: Array<{ noteA: string; noteB: string; valid: boolean }> = [
  { noteA: '', noteB: 'Lisinopril 10 mg daily', valid: false },
  { noteA: '   \t\n ', noteB: 'Metformin 500 mg twice daily', valid: false },
  {
    noteA: 'Note <script>alert(1)</script> lists Lisinopril 10 mg daily.',
    noteB: 'Discharge <img src=x onerror=alert(1)> lists Atorvastatin 20 mg nightly.',
    valid: true,
  },
  {
    noteA: '💊 Patient takes Aspirin 81 mg daily and Lisinopril 10 mg daily.',
    noteB: '🩺 Discharge plan: continue Lisinopril 10 mg daily and start Apixaban 5 mg twice daily.',
    valid: true,
  },
  {
    noteA: 'Clinic list: Metformin 500 mg twice daily.',
    noteB: 'Discharge list: Metformin 1000 mg twice daily.',
    valid: true,
  },
];

const RAIL_FILTER_CASES: Array<{ query: string; expectPatientMin: number; expectWorkspaceMin: number }> = [
  { query: '', expectPatientMin: syntheticScenarios.length, expectWorkspaceMin: 5 },
  { query: 'morgan', expectPatientMin: 1, expectWorkspaceMin: 0 },
  { query: 'CMRD-005', expectPatientMin: 1, expectWorkspaceMin: 0 },
  { query: 'qdora', expectPatientMin: 4, expectWorkspaceMin: 0 },
  { query: 'medtempo', expectPatientMin: 2, expectWorkspaceMin: 0 },
  { query: 'Evaluations', expectPatientMin: 0, expectWorkspaceMin: 1 },
  { query: 'zzzz-no-match', expectPatientMin: 0, expectWorkspaceMin: 0 },
];

function getLeftNav(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Navigation' });
}

function getPatientsGroup(): HTMLElement {
  return within(getLeftNav()).getByRole('group', { name: 'Patients · synthetic' });
}

function getWorkspaceNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Workspace' });
}

function selectPatientByIndex(idx: number) {
  const buttons = within(getPatientsGroup()).getAllByRole('button');
  fireEvent.click(buttons[idx]);
}

function navigateToView(navLabel: string) {
  if (navLabel === 'Models & data') {
    fireEvent.click(within(getLeftNav()).getByRole('button', { name: /Models & data/i }));
    return;
  }
  fireEvent.click(within(getWorkspaceNav()).getByRole('button', { name: new RegExp(`^${navLabel}`, 'i') }));
}

function assertValidDlChildren(container: HTMLElement) {
  const dls = container.querySelectorAll('dl');
  for (const dl of dls) {
    for (const child of Array.from(dl.children)) {
      const tag = child.tagName;
      expect(['DT', 'DD', 'DIV']).toContain(tag);
      if (tag === 'DIV') {
        for (const grand of Array.from(child.children)) {
          expect(['DT', 'DD']).toContain(grand.tagName);
        }
      }
    }
  }
}

function assertValidAriaAttributes(container: HTMLElement) {
  const boolAttrs = ['aria-pressed', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-modal', 'aria-atomic'] as const;
  for (const attr of boolAttrs) {
    for (const el of container.querySelectorAll(`[${attr}]`)) {
      expect(['true', 'false']).toContain(el.getAttribute(attr));
    }
  }

  for (const el of container.querySelectorAll('[aria-current]')) {
    expect(['page', 'step', 'location', 'date', 'time', 'true', 'false']).toContain(
      el.getAttribute('aria-current'),
    );
  }

  for (const attr of ['aria-controls', 'aria-labelledby'] as const) {
    for (const el of container.querySelectorAll(`[${attr}]`)) {
      const ids = (el.getAttribute(attr) ?? '').trim().split(/\s+/).filter(Boolean);
      for (const id of ids) {
        expect(container.querySelector(`#${CSS.escape(id)}`)).not.toBeNull();
      }
    }
  }

  for (const tab of container.querySelectorAll('[role="tab"]')) {
    expect(tab.closest('[role="tablist"]')).not.toBeNull();
  }

  for (const radio of container.querySelectorAll('[role="menuitemradio"]')) {
    expect(radio.closest('[role="menu"]')).not.toBeNull();
  }

  for (const ctrl of container.querySelectorAll('input, select, textarea')) {
    const id = ctrl.getAttribute('id');
    const aria = ctrl.getAttribute('aria-label');
    const hasForLabel = id ? container.querySelector(`label[for="${CSS.escape(id)}"]`) !== null : false;
    expect(Boolean(aria || hasForLabel)).toBe(true);
  }
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.palette = 'void';
});

describe('UI & Workflow Simulation (1,000 cases)', () => {
  // ---------------------------------------------------------------------------
  // Group 1: 200 cases — All 18 scenarios (baseline + HF) in Snapshot review
  // ---------------------------------------------------------------------------
  const scenarioCases = Array.from({ length: 200 }, (_, i) => ({
    caseId: i + 1,
    scenarioIdx: i % syntheticScenarios.length,
    checkSnapshotsTab: i % 2 === 1,
  }));

  it.each(scenarioCases)(
    'snapshot-review-and-cd02 #$caseId (scenario=$scenarioIdx)',
    ({ scenarioIdx, checkSnapshotsTab }) => {
      const scenario = syntheticScenarios[scenarioIdx];
      const report = analyzeSnapshots(scenario.earlier, scenario.later);
      const { container } = render(<Home />);

      selectPatientByIndex(scenarioIdx);

      const expectedH1 = scenario.patientLabel.replace(/\s*\(Synthetic\)$/i, '').trim();
      expect(screen.getByRole('heading', { level: 1, name: expectedH1 })).toBeInTheDocument();

      // CD-02 provenance & evidence summary
      const provSummary = screen.getByRole('region', { name: 'Provenance and evidence summary' });
      expect(provSummary).toHaveTextContent(
        `${report.evidenceLinks.length} ${report.evidenceLinks.length === 1 ? 'evidence link' : 'evidence links'}`,
      );
      expect(provSummary).toHaveTextContent(
        `${report.provenanceGaps.length} ${report.provenanceGaps.length === 1 ? 'provenance gap' : 'provenance gaps'}`,
      );

      // HF scenarios render dataset + license + Synthetic only tags
      if (scenarioIdx >= 10) {
        const hfMatch = hfScenarios.find((s) => s.id === scenario.id);
        expect(hfMatch).toBeDefined();
        expect(screen.getByText(hfMatch!.provenance.dataset)).toBeInTheDocument();
        expect(screen.getByText(hfMatch!.provenance.license)).toBeInTheDocument();
      }

      if (scenario.earlier.recordedAt === null || scenario.later.recordedAt === null) {
        expect(screen.getAllByText(/Timestamp not documented/).length).toBeGreaterThanOrEqual(1);
      }

      // Filter counts & entries
      const filterGroup = screen.getByRole('group', { name: 'Filter medication differences' });
      const changedCount = report.changes.filter((c) => c.kind === 'changed').length;
      const changedBtn = within(filterGroup).getByRole('button', { name: /^Changed/ });
      fireEvent.click(changedBtn);
      expect(changedBtn).toHaveAttribute('aria-pressed', 'true');
      if (changedCount === 0) {
        expect(screen.getByText('Nothing matches this filter.')).toBeInTheDocument();
      }
      fireEvent.click(within(filterGroup).getByRole('button', { name: /^All/ }));

      if (report.changes.length === 0 && scenario.earlier.medications.length === 0) {
        expect(screen.getByText('Nothing matches this filter.')).toBeInTheDocument();
      } else {
        for (const ch of report.changes) {
          const nameEl = container.querySelector(
            `.entry[data-value="${CSS.escape(ch.medicationId)}"] .e-name`,
          );
          expect(nameEl).not.toBeNull();
          expect(nameEl?.textContent).toBe(ch.name);
        }
      }

      if (checkSnapshotsTab) {
        fireEvent.click(screen.getByRole('tab', { name: 'Source snapshots' }));
        expect(screen.getByRole('heading', { level: 2, name: /Snapshot A/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: /Snapshot B/ })).toBeInTheDocument();
      }

      assertValidDlChildren(container);
      assertValidAriaAttributes(container);
    },
  );

  // ---------------------------------------------------------------------------
  // Group 2: 200 cases — Compare notes (default, all 8 HF pairs, edge/XSS notes)
  // ---------------------------------------------------------------------------
  const compareCases = Array.from({ length: 200 }, (_, i) => ({ caseId: i + 1 }));

  it.each(compareCases)('compare-notes-hf-and-edge #$caseId', ({ caseId }) => {
    const { container } = render(<Home />);
    const main = screen.getByRole('main');
    const earlierInput = screen.getByLabelText(/Earlier note/i) as HTMLTextAreaElement;
    const laterInput = screen.getByLabelText(/Discharge note/i) as HTMLTextAreaElement;
    const presetSelect = screen.getByLabelText('Note preset') as HTMLSelectElement;

    const mode = caseId % 14;
    if (mode === 0) {
      // Default preset + Load example + Flag/Reviewed toggle
      fireEvent.click(screen.getByRole('button', { name: 'Clear notes' }));
      expect(earlierInput.value).toBe('');
      fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
      expect(earlierInput.value).toContain('Lisinopril');
      fireEvent.click(within(main).getByRole('button', { name: 'Compare notes' }));
      const marks = container.querySelectorAll('#extraction-result ul.extract-rows blockquote mark');
      expect(Array.from(marks).map((m) => m.textContent)).toEqual(['Aspirin', 'Atorvastatin']);
      const clarifyBtn = screen.getAllByRole('button', { name: 'Flag for clarification' })[0];
      fireEvent.click(clarifyBtn);
      expect(clarifyBtn).toHaveAttribute('aria-pressed', 'true');
    } else if (mode <= hfNoteComparisonPairs.length) {
      // One of the 8 HF synthetic note comparison pairs
      const pair = hfNoteComparisonPairs[mode - 1];
      fireEvent.change(presetSelect, { target: { value: pair.id } });
      expect(earlierInput.value).toBe(pair.earlierNote);
      expect(laterInput.value).toBe(pair.laterNote);
      expect(screen.getByText(pair.dataset)).toBeInTheDocument();
      expect(screen.getByText(pair.license)).toBeInTheDocument();
      fireEvent.click(within(main).getByRole('button', { name: 'Compare notes' }));
      expect(screen.getByRole('heading', { level: 2, name: 'Mention differences' })).toBeInTheDocument();
    } else {
      // Edge cases: empty/whitespace validation, XSS escaping, astral emojis
      const edge = XSS_AND_EDGE_NOTES[(mode - hfNoteComparisonPairs.length - 1) % XSS_AND_EDGE_NOTES.length];
      fireEvent.change(earlierInput, { target: { value: edge.noteA } });
      fireEvent.change(laterInput, { target: { value: edge.noteB } });
      fireEvent.click(within(main).getByRole('button', { name: 'Compare notes' }));
      if (!edge.valid) {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Each note needs between 1 and 12,000 characters of fictional text.',
        );
      } else {
        expect(screen.getByRole('heading', { level: 2, name: 'Mention differences' })).toBeInTheDocument();
        expect(container.querySelectorAll('#extraction-result script, #extraction-result img').length).toBe(0);
      }
    }

    assertValidAriaAttributes(container);
  });

  // ---------------------------------------------------------------------------
  // Group 3: 200 cases — Keyboard rail navigation & rail search filtering
  // ---------------------------------------------------------------------------
  const railNavCases = Array.from({ length: 200 }, (_, i) => ({ caseId: i + 1 }));

  it.each(railNavCases)('rail-keyboard-nav-and-filter #$caseId', ({ caseId }) => {
    const rng = new SeededRng(210000 + caseId);
    render(<Home />);

    const nav = getLeftNav();
    const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>('button.item'));
    const expectedCount = syntheticScenarios.length + WORKSPACE_VIEW_LABELS.length + 1;
    expect(buttons).toHaveLength(expectedCount);

    let idx = caseId % buttons.length;
    buttons[idx].focus();
    expect(buttons[idx]).toHaveFocus();

    if (caseId % 5 === 0) {
      buttons[0].focus();
      fireEvent.keyDown(buttons[0], { key: caseId % 10 === 0 ? 'ArrowUp' : 'ArrowLeft' });
      idx = buttons.length - 1;
      expect(buttons[idx]).toHaveFocus();
    } else if (caseId % 5 === 1) {
      const last = buttons.length - 1;
      buttons[last].focus();
      fireEvent.keyDown(buttons[last], { key: caseId % 10 === 1 ? 'ArrowDown' : 'ArrowRight' });
      idx = 0;
      expect(buttons[idx]).toHaveFocus();
    } else {
      const steps = rng.int(3, 8);
      for (let s = 0; s < steps; s++) {
        const key = rng.pick(['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End']);
        fireEvent.keyDown(buttons[idx], { key });
        if (key === 'ArrowDown' || key === 'ArrowRight') idx = (idx + 1) % buttons.length;
        else if (key === 'ArrowUp' || key === 'ArrowLeft')
          idx = (idx - 1 + buttons.length) % buttons.length;
        else if (key === 'Home') idx = 0;
        else idx = buttons.length - 1;
        expect(buttons[idx]).toHaveFocus();
      }
    }

    // Exercise rail search filter
    const filterCase = RAIL_FILTER_CASES[caseId % RAIL_FILTER_CASES.length];
    const searchInput = screen.getByRole('searchbox', { name: 'Filter navigation' }) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: filterCase.query } });
    const filteredPatients = within(getPatientsGroup()).queryAllByRole('button');
    const filteredWorkspace = within(getWorkspaceNav()).queryAllByRole('button');
    expect(filteredPatients.length).toBeGreaterThanOrEqual(filterCase.expectPatientMin);
    expect(filteredWorkspace.length).toBeGreaterThanOrEqual(filterCase.expectWorkspaceMin);
  });

  // ---------------------------------------------------------------------------
  // Group 4: 200 cases — Verify/Flag/Defer decisions, cross-scenario isolation & palettes
  // ---------------------------------------------------------------------------
  const populatedScenarios = syntheticScenarios
    .map((s, idx) => ({ scenario: s, idx, changes: analyzeSnapshots(s.earlier, s.later).changes }))
    .filter((item) => item.changes.length > 0);

  const decisionCases = Array.from({ length: 200 }, (_, i) => ({ caseId: i + 1 }));

  it.each(decisionCases)('review-decisions-and-isolation #$caseId', ({ caseId }) => {
    const rng = new SeededRng(220000 + caseId);
    const current = populatedScenarios[caseId % populatedScenarios.length];
    const other = populatedScenarios[(caseId + 1) % populatedScenarios.length];
    const { container } = render(<Home />);

    selectPatientByIndex(current.idx);

    const choices = ['Verify', 'Flag', 'Defer'] as const;
    const picked = new Map<string, (typeof choices)[number]>();

    for (const ch of current.changes) {
      const choice = rng.pick(choices);
      const group = screen.getByRole('group', { name: `Review ${ch.name}` });
      const btn = within(group).getByRole('button', { name: choice });
      fireEvent.click(btn);
      expect(btn).toHaveAttribute('aria-pressed', 'true');
      picked.set(ch.medicationId, choice);
    }

    // Toggle first decision off
    const firstChange = current.changes[0];
    const firstChoice = picked.get(firstChange.medicationId)!;
    const firstBtn = within(
      screen.getByRole('group', { name: `Review ${firstChange.name}` }),
    ).getByRole('button', { name: firstChoice });
    fireEvent.click(firstBtn);
    expect(firstBtn).toHaveAttribute('aria-pressed', 'false');

    // Switch to another scenario -> its buttons start unpressed
    selectPatientByIndex(other.idx);
    const otherFirst = other.changes[0];
    const otherVerify = within(
      screen.getByRole('group', { name: `Review ${otherFirst.name}` }),
    ).getByRole('button', { name: 'Verify' });
    expect(otherVerify).toHaveAttribute('aria-pressed', 'false');

    // Switch back -> remaining decisions persist
    selectPatientByIndex(current.idx);
    for (const ch of current.changes.slice(1)) {
      const choice = picked.get(ch.medicationId)!;
      const btn = within(
        screen.getByRole('group', { name: `Review ${ch.name}` }),
      ).getByRole('button', { name: choice });
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    }

    // Expand first change row and check CD-02 evidence block
    const trigger = container.querySelector<HTMLButtonElement>(
      `.entry-trigger[data-value="${CSS.escape(firstChange.medicationId)}"]`,
    );
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger!);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(`Evidence and provenance for ${firstChange.name}`)).toBeInTheDocument();

    // Switch palette and verify dataset attribute
    const palId = PALETTE_IDS[caseId % PALETTE_IDS.length];
    fireEvent.click(screen.getByRole('button', { name: /^Palette ·/ }));
    const menu = screen.getByRole('menu', { name: 'Palette' });
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: new RegExp(PALETTE_NAMES[palId]) }));
    expect(document.documentElement.dataset.palette).toBe(palId);
  });

  // ---------------------------------------------------------------------------
  // Group 5: 200 cases — DOM, ARIA, <dl>, tables, HF Models & data, and Plus Jakarta Sans wiring
  // ---------------------------------------------------------------------------
  const a11yCases = Array.from({ length: 200 }, (_, i) => ({ caseId: i + 1 }));

  it.each(a11yCases)('dom-a11y-aria-dl-and-font-wiring #$caseId', ({ caseId }) => {
    const viewSpec = ALL_VIEWS[caseId % ALL_VIEWS.length];
    const scenarioIdx = caseId % syntheticScenarios.length;
    const scenario = syntheticScenarios[scenarioIdx];
    const { container } = render(<Home />);

    // Skip link & main landmark
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveAttribute('href', '#main-content');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');

    if (viewSpec.navLabel === 'Snapshot review') {
      selectPatientByIndex(scenarioIdx);
    } else {
      navigateToView(viewSpec.navLabel);
    }

    // Exactly one h1 with tabIndex={-1}
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAttribute('tabindex', '-1');
    if (viewSpec.h1) {
      expect(h1s[0].textContent).toBe(viewSpec.h1);
    } else {
      expect(h1s[0].textContent).toBe(scenario.patientLabel.replace(/\s*\(Synthetic\)$/i, '').trim());
    }

    // View-specific checks
    if (viewSpec.navLabel === 'Models & data') {
      for (const ds of hfDatasetSources) {
        expect(screen.getByText(ds.dataset)).toBeInTheDocument();
        expect(ds.syntheticOnly).toBe(true);
      }
    } else if (viewSpec.navLabel === 'Evaluations') {
      fireEvent.click(screen.getByRole('button', { name: 'Run held-out set' }));
      expect(screen.getByText(String(3 + syntheticScenarios.length))).toBeInTheDocument();
    } else if (viewSpec.navLabel === 'Review suggestions') {
      fireEvent.click(screen.getByRole('button', { name: 'Run triage' }));
    }

    // Live region present
    const live = container.querySelector('.sr-only[aria-live="polite"][aria-atomic="true"]');
    expect(live).not.toBeNull();

    // Valid <dl> children & zero invalid aria-* attributes
    assertValidDlChildren(container);
    assertValidAriaAttributes(container);

    // Every rendered table has thead, tbody, and non-empty <th> headers
    for (const table of container.querySelectorAll('table')) {
      expect(table.querySelector('thead')).not.toBeNull();
      expect(table.querySelector('tbody')).not.toBeNull();
      const ths = table.querySelectorAll('th');
      expect(ths.length).toBeGreaterThan(0);
      for (const th of ths) {
        expect(th.textContent?.trim().length).toBeGreaterThan(0);
      }
    }

    // Plus Jakarta Sans font wiring & zero leftover Geist / Newsreader
    expect(LAYOUT_SRC).toContain('Plus_Jakarta_Sans');
    expect(LAYOUT_SRC).not.toMatch(/Geist|Newsreader/);
    expect(GLOBALS_CSS_SRC).toContain('Plus Jakarta Sans');
    expect(GLOBALS_CSS_SRC).not.toMatch(/Geist|Newsreader/);
    expect(EDITORIAL_HTML_SRC).toContain('Plus Jakarta Sans');
    expect(EDITORIAL_HTML_SRC).not.toMatch(/Geist|Newsreader/);
  });
});

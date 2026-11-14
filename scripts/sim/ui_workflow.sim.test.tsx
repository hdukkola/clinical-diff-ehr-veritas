import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from '@/app/page';
import { analyzeSnapshots } from '@/lib/diff';
import { syntheticScenarios } from '@/lib/fixtures';
import { SeededRng } from './prng';

const SECTIONS = [
  'Dashboard',
  'Patients',
  'Patient chart',
  'Medication history',
  'Encounter timeline',
  'Clinical notes',
  'Clinical Diff',
] as const;

const DECISIONS = [
  '',
  'Reviewed — no conclusion',
  'Needs more evidence',
  'Discuss with care team',
] as const;

const SEARCH_EDGE_CASES: Array<{ query: string; shouldMatch: boolean }> = [
  { query: '', shouldMatch: true },
  { query: '   ', shouldMatch: true },
  { query: '\t\n ', shouldMatch: true },
  { query: 'morgan', shouldMatch: true },
  { query: 'MORGAN LEE', shouldMatch: true },
  { query: '  demo-001  ', shouldMatch: true },
  { query: '001', shouldMatch: true },
  { query: 'lee', shouldMatch: true },
  { query: '.*+?^$[](){}|\\', shouldMatch: false },
  { query: '^morgan$', shouldMatch: false },
  { query: '[a-z]+', shouldMatch: false },
  { query: 'morgan.*', shouldMatch: false },
  { query: 'Renée', shouldMatch: false },
  { query: '💊', shouldMatch: false },
  { query: 'İ', shouldMatch: false },
  { query: 'Morgan  Lee', shouldMatch: false },
  { query: 'DEMO-002', shouldMatch: false },
  { query: '<script>alert(1)</script>', shouldMatch: false },
  { query: "' OR 1=1 --", shouldMatch: false },
  { query: 'x', shouldMatch: false },
];

function navigateTo(sectionName: (typeof SECTIONS)[number]) {
  const nav = screen.getByRole('navigation', { name: 'WORKSPACE' });
  fireEvent.click(within(nav).getByRole('button', { name: sectionName }));
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

describe('UI & Workflow Simulation (1,000 cases)', () => {
  // ---------------------------------------------------------------------------
  // Group 1: 200 cases — All 10 syntheticScenarios in Clinical Diff & Medication history
  // ---------------------------------------------------------------------------
  const scenarioRenderCases = Array.from({ length: 200 }, (_, i) => ({
    caseId: i + 1,
    scenarioIdx: i % syntheticScenarios.length,
    checkHistory: i % 2 === 1,
  }));

  it.each(scenarioRenderCases)(
    'scenario-render-and-diff #$caseId (scenario=$scenarioIdx)',
    ({ scenarioIdx, checkHistory }) => {
      const scenario = syntheticScenarios[scenarioIdx];
      const report = analyzeSnapshots(scenario.earlier, scenario.later);
      const { container } = render(<Home />);

      navigateTo('Clinical Diff');
      const select = screen.getByLabelText('Synthetic scenario') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: scenario.id } });
      expect(select.value).toBe(scenario.id);

      const expectedCountText = `${report.changes.length} ${report.changes.length === 1 ? 'difference' : 'differences'}`;
      expect(screen.getByText(expectedCountText)).toBeInTheDocument();
      expect(screen.getByText(`0 of ${report.changes.length} reviewed`)).toBeInTheDocument();

      if (scenario.earlier.recordedAt === null) {
        expect(screen.getByText('Timestamp not documented')).toBeInTheDocument();
      }

      if (report.changes.length === 0) {
        expect(
          screen.getByText('No medication differences detected between these snapshots.'),
        ).toBeInTheDocument();
      } else {
        for (const ch of report.changes) {
          expect(
            screen.getByRole('article', { name: ch.name }),
          ).toBeInTheDocument();
        }
      }

      if (checkHistory) {
        navigateTo('Medication history');
        const medItems = container.querySelectorAll('.med-item');
        expect(medItems.length).toBe(
          scenario.earlier.medications.length + scenario.later.medications.length,
        );
        assertValidDlChildren(container);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Group 2: 250 cases — Patient search edge cases
  // ---------------------------------------------------------------------------
  const searchCases = Array.from({ length: 250 }, (_, i) => ({
    caseId: i + 1,
    edgeIdx: i % SEARCH_EDGE_CASES.length,
  }));

  it.each(searchCases)('patient-search-edge #$caseId', ({ caseId, edgeIdx }) => {
    const edge = SEARCH_EDGE_CASES[edgeIdx];
    render(<Home />);
    navigateTo('Patients');

    const input = screen.getByRole('searchbox', { name: 'Search patients' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: edge.query } });
    // Single-line HTML <input type="search"> strips CR/LF per the HTML value sanitization algorithm.
    expect(input.value).toBe(edge.query.replace(/[\r\n]/g, ''));

    const status = screen.getAllByRole('status')[0];
    if (edge.shouldMatch) {
      expect(status).toHaveTextContent('1 patient shown: Morgan Lee, DEMO-001.');
      const row = screen.getByRole('button', { name: /Morgan Lee/i });
      expect(row).toBeInTheDocument();
      if (caseId % 5 === 0) {
        fireEvent.click(row);
        expect(screen.getByRole('heading', { level: 1, name: 'Patient chart' })).toBeInTheDocument();
      }
    } else {
      expect(status).toHaveTextContent('No patients match your search.');
      expect(screen.queryByRole('button', { name: /Morgan Lee/i })).not.toBeInTheDocument();
      const clearBtn = screen.getByRole('button', { name: 'Clear search' });
      fireEvent.click(clearBtn);
      expect(input.value).toBe('');
      expect(screen.getByRole('button', { name: /Morgan Lee/i })).toBeInTheDocument();
    }
  });

  // ---------------------------------------------------------------------------
  // Group 3: 250 cases — Keyboard navigation boundary & sequence cases
  // ---------------------------------------------------------------------------
  const keyNavCases = Array.from({ length: 250 }, (_, i) => ({ caseId: i + 1 }));

  it.each(keyNavCases)('keyboard-nav-boundary #$caseId', ({ caseId }) => {
    const rng = new SeededRng(110000 + caseId);
    render(<Home />);
    const nav = screen.getByRole('navigation', { name: 'WORKSPACE' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(SECTIONS.length);

    let idx = caseId % SECTIONS.length;
    buttons[idx].focus();
    expect(buttons[idx]).toHaveFocus();

    if (caseId % 6 === 0) {
      // Boundary wrap at start: index 0 -> ArrowUp / ArrowLeft -> last
      buttons[0].focus();
      fireEvent.keyDown(buttons[0], { key: caseId % 12 === 0 ? 'ArrowUp' : 'ArrowLeft' });
      idx = SECTIONS.length - 1;
      expect(buttons[idx]).toHaveFocus();
    } else if (caseId % 6 === 1) {
      // Boundary wrap at end: last -> ArrowDown / ArrowRight -> 0
      const last = SECTIONS.length - 1;
      buttons[last].focus();
      fireEvent.keyDown(buttons[last], { key: caseId % 12 === 1 ? 'ArrowDown' : 'ArrowRight' });
      idx = 0;
      expect(buttons[idx]).toHaveFocus();
    } else if (caseId % 6 === 2) {
      fireEvent.keyDown(buttons[idx], { key: 'Home' });
      idx = 0;
      expect(buttons[0]).toHaveFocus();
    } else if (caseId % 6 === 3) {
      fireEvent.keyDown(buttons[idx], { key: 'End' });
      idx = SECTIONS.length - 1;
      expect(buttons[idx]).toHaveFocus();
    } else {
      // Multi-step random key navigation sequence
      const steps = rng.int(3, 10);
      for (let s = 0; s < steps; s++) {
        const key = rng.pick(['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End']);
        fireEvent.keyDown(buttons[idx], { key });
        if (key === 'ArrowDown' || key === 'ArrowRight') idx = (idx + 1) % SECTIONS.length;
        else if (key === 'ArrowUp' || key === 'ArrowLeft')
          idx = (idx - 1 + SECTIONS.length) % SECTIONS.length;
        else if (key === 'Home') idx = 0;
        else idx = SECTIONS.length - 1;
        expect(buttons[idx]).toHaveFocus();
      }
    }

    fireEvent.click(buttons[idx]);
    expect(buttons[idx]).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: SECTIONS[idx] })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Group 4: 200 cases — Review decision state changes & cross-scenario isolation
  // ---------------------------------------------------------------------------
  const populatedScenarios = syntheticScenarios.filter(
    s => analyzeSnapshots(s.earlier, s.later).changes.length > 0,
  );
  const decisionCases = Array.from({ length: 200 }, (_, i) => ({ caseId: i + 1 }));

  it.each(decisionCases)('review-decision-state #$caseId', ({ caseId }) => {
    const rng = new SeededRng(120000 + caseId);
    const scenario = populatedScenarios[caseId % populatedScenarios.length];
    const otherScenario = populatedScenarios[(caseId + 1) % populatedScenarios.length];
    const changes = analyzeSnapshots(scenario.earlier, scenario.later).changes;
    const otherChanges = analyzeSnapshots(otherScenario.earlier, otherScenario.later).changes;

    render(<Home />);
    navigateTo('Clinical Diff');

    const scenarioSelect = screen.getByLabelText('Synthetic scenario') as HTMLSelectElement;
    fireEvent.change(scenarioSelect, { target: { value: scenario.id } });

    let expectedReviewed = 0;
    const picked = new Map<string, string>();
    for (const ch of changes) {
      const choice = rng.pick(DECISIONS.slice(1));
      const control = screen.getByLabelText(`Review decision for ${ch.name}`) as HTMLSelectElement;
      fireEvent.change(control, { target: { value: choice } });
      expect(control.value).toBe(choice);
      picked.set(ch.medicationId, choice);
      expectedReviewed++;
    }
    expect(screen.getByText(`${expectedReviewed} of ${changes.length} reviewed`)).toBeInTheDocument();

    // Reset one decision back to Not reviewed ("")
    const first = changes[0];
    const firstControl = screen.getByLabelText(
      `Review decision for ${first.name}`,
    ) as HTMLSelectElement;
    fireEvent.change(firstControl, { target: { value: '' } });
    picked.set(first.medicationId, '');
    expectedReviewed--;
    expect(screen.getByText(`${expectedReviewed} of ${changes.length} reviewed`)).toBeInTheDocument();

    // Switch to another scenario -> its reviewed count starts at 0
    fireEvent.change(scenarioSelect, { target: { value: otherScenario.id } });
    expect(screen.getByText(`0 of ${otherChanges.length} reviewed`)).toBeInTheDocument();

    // Switch back -> previously stored decisions remain intact
    fireEvent.change(scenarioSelect, { target: { value: scenario.id } });
    expect(screen.getByText(`${expectedReviewed} of ${changes.length} reviewed`)).toBeInTheDocument();
    for (const ch of changes) {
      const control = screen.getByLabelText(`Review decision for ${ch.name}`) as HTMLSelectElement;
      expect(control.value).toBe(picked.get(ch.medicationId));
    }
  });

  // ---------------------------------------------------------------------------
  // Group 5: 100 cases — DOM & accessibility structural assertions
  // ---------------------------------------------------------------------------
  const a11yCases = Array.from({ length: 100 }, (_, i) => ({ caseId: i + 1 }));

  it.each(a11yCases)('dom-and-a11y-invariants #$caseId', ({ caseId }) => {
    const targetSection = SECTIONS[caseId % SECTIONS.length];
    const targetScenario = syntheticScenarios[caseId % syntheticScenarios.length];
    const { container } = render(<Home />);

    // Skip link + landmarks
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveAttribute('href', '#main-content');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('complementary', { name: 'Workspace sidebar' })).toBeInTheDocument();

    navigateTo(targetSection);
    if (targetSection === 'Clinical Diff') {
      fireEvent.change(screen.getByLabelText('Synthetic scenario'), {
        target: { value: targetScenario.id },
      });
    }

    // Disclaimer banner preserved across every section
    expect(screen.getByRole('note', { name: 'Prototype disclaimer' })).toBeInTheDocument();

    // Exactly one h1 with tabIndex={-1}
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAttribute('tabindex', '-1');
    expect(h1s[0].textContent).toBe(targetSection);

    // Live region present
    const live = container.querySelector('.sr-only[aria-live="polite"][aria-atomic="true"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toContain(`Navigated to ${targetSection}`);

    // Valid <dl> children everywhere
    assertValidDlChildren(container);

    // Valid table headers everywhere
    for (const table of container.querySelectorAll('table')) {
      expect(table.querySelector('thead')).not.toBeNull();
      expect(table.querySelector('tbody')).not.toBeNull();
      const ths = table.querySelectorAll('th');
      expect(ths.length).toBeGreaterThan(0);
      for (const th of ths) {
        expect(th).toHaveAttribute('scope', 'col');
      }
    }

    // Every input/select has an accessible label
    for (const ctrl of container.querySelectorAll('input, select')) {
      const id = ctrl.getAttribute('id');
      const aria = ctrl.getAttribute('aria-label');
      const hasForLabel = id ? container.querySelector(`label[for="${id}"]`) !== null : false;
      expect(Boolean(aria || hasForLabel)).toBe(true);
    }
  });
});

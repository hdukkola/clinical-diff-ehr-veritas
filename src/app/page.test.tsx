import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { CockpitWidgets } from '@/components/CockpitWidgets';
import { syntheticScenarios } from '@/lib/fixtures';
import { hfDatasetSources, hfNoteComparisonPairs } from '@/lib/hf-fixtures';

function getLiveNavAnnouncement() {
  return document.querySelector('.sr-only[aria-live="polite"][aria-atomic="true"]');
}

function getLeftNav() {
  return screen.getByRole('complementary', { name: 'Navigation' });
}

function getWorkspaceNav() {
  return screen.getByRole('navigation', { name: 'Workspace' });
}

function getPatientsGroup() {
  return within(getLeftNav()).getByRole('group', { name: 'Patients · synthetic' });
}

describe('Clinical Diff Veritas Editorial UI', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.palette = 'void';
  });

  it('renders the default Compare notes view with accessibility landmarks and collapsed right rail', async () => {
    const user = userEvent.setup();
    render(<Home />);

    // Skip link is first tab stop and points to focusable <main id="main-content" tabIndex={-1}>
    await user.tab();
    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', '#main-content');

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');

    // Default heading & workspace state
    expect(
      screen.getByRole('heading', { level: 1, name: 'Discharge medication review' }),
    ).toBeInTheDocument();
    expect(document.getElementById('extraction-status')).toHaveTextContent(
      'Standby · local extractor',
    );
    expect(screen.getByRole('button', { name: 'Palette · Graphite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open command menu' })).toBeInTheDocument();

    // Right rail is collapsed in Compare notes view
    expect(screen.queryByRole('complementary', { name: 'Page outline and context' })).not.toBeInTheDocument();

    // Workspace nav marks Compare notes as current page
    const compareNavBtn = within(getWorkspaceNav()).getByRole('button', { name: 'Compare notes' });
    expect(compareNavBtn).toHaveAttribute('aria-current', 'page');

    // Check service button announces status
    await user.click(screen.getByRole('button', { name: 'Check service' }));
    expect(getLiveNavAnnouncement()).toHaveTextContent('Local rule-based extractor ready');
    expect(document.getElementById('toast')).toHaveTextContent('Local rule-based extractor ready');
  });

  it('supports Compare notes presets (default + HF synthetic pairs), validation, quote highlights, review decisions, and Session activity logging', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const main = screen.getByRole('main');
    const earlierBox = screen.getByLabelText(/Earlier note/i);
    const laterBox = screen.getByLabelText(/Discharge note/i);
    const presetSelect = screen.getByLabelText('Note preset');

    // Clear notes -> validation error on empty submit
    await user.click(screen.getByRole('button', { name: 'Clear notes' }));
    expect(earlierBox).toHaveValue('');
    expect(laterBox).toHaveValue('');

    await user.click(within(main).getByRole('button', { name: 'Compare notes' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Each note needs between 1 and 12,000 characters of fictional text.',
    );

    // Load example restores default notes
    await user.click(screen.getByRole('button', { name: 'Load example' }));
    expect(earlierBox).toHaveValue(
      'Sample outpatient medication list. The note explicitly lists Lisinopril 10 mg daily, Metformin 500 mg twice daily, and Aspirin 81 mg daily.',
    );

    // Compare default notes -> highlights <mark> quotes and enables Flag/Mark reviewed controls
    await user.click(within(main).getByRole('button', { name: 'Compare notes' }));
    const resultHeading = screen.getByRole('heading', { level: 2, name: 'Mention differences' });
    await waitFor(() => expect(resultHeading).toHaveFocus());

    const resultSection = resultHeading.closest('section')!;
    expect(within(resultSection).getByText('3 differences')).toBeInTheDocument();
    expect(within(resultSection).getByRole('status')).toHaveTextContent(
      '3 to review · 0 flagged for clarification',
    );

    const marks = Array.from(resultSection.querySelectorAll('ul.extract-rows blockquote mark')).map(
      (el) => el.textContent,
    );
    expect(marks.slice(0, 2)).toEqual(['Aspirin', 'Atorvastatin']);

    // All extracted mentions details element shows both sides
    const details = resultSection.querySelector('details')!;
    expect(within(details).getByText('All extracted mentions by note')).toBeInTheDocument();
    expect(details.querySelectorAll('mark').length).toBeGreaterThanOrEqual(6);

    // Flag Aspirin for clarification and mark Atorvastatin reviewed
    const aspirinGroup = within(resultSection).getByRole('group', {
      name: 'Review Aspirin · earlier note',
    });
    const aspirinClarify = within(aspirinGroup).getByRole('button', {
      name: 'Flag for clarification',
    });
    await user.click(aspirinClarify);
    expect(aspirinClarify).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(resultSection).getByText('Why does Aspirin appear only in the earlier note?'),
    ).toBeInTheDocument();
    expect(within(resultSection).getByRole('status')).toHaveTextContent(
      '2 to review · 1 flagged for clarification',
    );

    const atorvastatinGroup = within(resultSection).getByRole('group', {
      name: 'Review Atorvastatin · discharge note',
    });
    const atorvastatinReviewed = within(atorvastatinGroup).getByRole('button', {
      name: 'Mark reviewed',
    });
    await user.click(atorvastatinReviewed);
    expect(atorvastatinReviewed).toHaveAttribute('aria-pressed', 'true');
    expect(within(resultSection).getByRole('status')).toHaveTextContent(
      '1 to review · 1 flagged for clarification',
    );

    // Toggle reviewed off
    await user.click(atorvastatinReviewed);
    expect(atorvastatinReviewed).toHaveAttribute('aria-pressed', 'false');
    expect(within(resultSection).getByRole('status')).toHaveTextContent(
      '2 to review · 1 flagged for clarification',
    );

    // Switch to an HF synthetic note comparison pair and run comparison
    const hfPair = hfNoteComparisonPairs[0];
    await user.selectOptions(presetSelect, hfPair.id);
    expect(earlierBox).toHaveValue(hfPair.earlierNote);
    expect(laterBox).toHaveValue(hfPair.laterNote);
    expect(screen.getByText(hfPair.dataset)).toBeInTheDocument();
    expect(screen.getByText(hfPair.license)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('href', hfPair.sourceUrl);

    await user.click(within(main).getByRole('button', { name: 'Compare notes' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Mention differences' })).toBeInTheDocument();

    // Verify all comparison & review actions were logged in Session activity
    await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Session activity/i }));
    const auditHeading = screen.getByRole('heading', { level: 1, name: 'Session activity' });
    await waitFor(() => expect(auditHeading).toHaveFocus());

    expect(screen.getByText('Flagged mention for clarification')).toBeInTheDocument();
    expect(screen.getByText('Reviewed mention')).toBeInTheDocument();
    expect(screen.getByText('Cleared mention review')).toBeInTheDocument();
    expect(screen.getAllByText('Local standby').length).toBeGreaterThanOrEqual(2);
  });

  it('exports flagged discharge follow-ups as clinical-diff-follow-ups.txt and reflects changed or cleared flags', async () => {
    const user = userEvent.setup();
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const exportedBlobs: Blob[] = [];
    const downloadedNames: string[] = [];
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) exportedBlobs.push(blob);
      return 'blob:follow-ups-url';
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedNames.push(this.download);
      });

    try {
      render(<Home />);
      const main = screen.getByRole('main');
      await user.click(within(main).getByRole('button', { name: 'Compare notes' }));

      const resultHeading = screen.getByRole('heading', { level: 2, name: 'Mention differences' });
      const resultSection = resultHeading.closest('section')!;
      const downloadBtn = within(resultSection).getByRole('button', {
        name: 'Download follow-ups',
      });
      expect(downloadBtn).toBeDisabled();

      const aspirinGroup = within(resultSection).getByRole('group', {
        name: 'Review Aspirin · earlier note',
      });
      const aspirinClarify = within(aspirinGroup).getByRole('button', {
        name: 'Flag for clarification',
      });
      const atorvastatinGroup = within(resultSection).getByRole('group', {
        name: 'Review Atorvastatin · discharge note',
      });
      const atorvastatinClarify = within(atorvastatinGroup).getByRole('button', {
        name: 'Flag for clarification',
      });

      // Flag Aspirin -> Download follow-ups enabled
      await user.click(aspirinClarify);
      expect(downloadBtn).toBeEnabled();

      await user.click(downloadBtn);
      expect(exportedBlobs).toHaveLength(1);
      expect(downloadedNames[0]).toBe('clinical-diff-follow-ups.txt');
      expect(exportedBlobs[0].type).toBe('text/plain;charset=utf-8');
      const firstText = await exportedBlobs[0].text();
      expect(firstText).toContain('Discharge medication follow-ups');
      expect(firstText).toContain('Local standby · Review required before chart commit');
      expect(firstText).toContain('Aspirin');
      expect(firstText).toContain('Source excerpts from earlier note:');
      expect(firstText).toContain('Aspirin 81 mg daily');
      expect(firstText).not.toContain('Atorvastatin');

      // Also flag Atorvastatin -> next download includes both
      await user.click(atorvastatinClarify);
      await user.click(downloadBtn);
      expect(exportedBlobs).toHaveLength(2);
      const secondText = await exportedBlobs[1].text();
      expect(secondText).toContain('Aspirin');
      expect(secondText).toContain('Atorvastatin');
      expect(secondText).toContain('Source excerpts from discharge note:');
      expect(secondText).toContain('Atorvastatin 20 mg nightly');

      // Clear Aspirin flag -> next download reflects cleared flag
      await user.click(aspirinClarify);
      await user.click(downloadBtn);
      expect(exportedBlobs).toHaveLength(3);
      const thirdText = await exportedBlobs[2].text();
      expect(thirdText).not.toContain('Aspirin');
      expect(thirdText).toContain('Atorvastatin');

      // Clear remaining flag -> button returns to disabled
      await user.click(atorvastatinClarify);
      expect(downloadBtn).toBeDisabled();

      // Verify audit entries in Session activity
      await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Session activity/i }));
      expect(screen.getAllByText('Downloaded follow-ups')).toHaveLength(3);
      expect(screen.getByText('2 flagged')).toBeInTheDocument();
      expect(screen.getAllByText('1 flagged').length).toBeGreaterThanOrEqual(2);
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });

  it('supports Snapshot review across Morgan Lee, CD-03 scenarios, and HF synthetic scenarios with filters, Verify/Flag/Defer, and CD-02 provenance/evidence', async () => {
    const user = userEvent.setup();
    render(<Home />);

    // Open Morgan Lee (active single-patient view) from Patients rail
    const patientButtons = within(getPatientsGroup()).getAllByRole('button');
    expect(patientButtons).toHaveLength(1);
    await user.click(patientButtons[0]);

    const morganHeading = screen.getByRole('heading', { level: 1, name: 'Morgan Lee' });
    await waitFor(() => expect(morganHeading).toHaveFocus());
    expect(screen.getByRole('note', { name: 'Clinical review notice' })).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Page outline and context' }),
    ).toBeInTheDocument();

    // Filter toggles (All, Changed, Only in A, Only in B, Unchanged)
    const filterGroup = screen.getByRole('group', { name: 'Filter medication differences' });
    const allFilter = within(filterGroup).getByRole('button', { name: /^All/ });
    const changedFilter = within(filterGroup).getByRole('button', { name: /^Changed/ });
    const onlyAFilter = within(filterGroup).getByRole('button', { name: /^Only in A/ });
    const onlyBFilter = within(filterGroup).getByRole('button', { name: /^Only in B/ });
    const sameFilter = within(filterGroup).getByRole('button', { name: /^Unchanged/ });

    expect(allFilter).toHaveAttribute('aria-pressed', 'true');
    await user.click(changedFilter);
    expect(changedFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Lisinopril')).toBeInTheDocument();
    expect(screen.getByText('Metformin')).toBeInTheDocument();
    expect(screen.queryByText('Aspirin')).not.toBeInTheDocument();

    await user.click(onlyAFilter);
    expect(screen.getByText('Aspirin')).toBeInTheDocument();
    expect(screen.queryByText('Lisinopril')).not.toBeInTheDocument();

    await user.click(onlyBFilter);
    expect(screen.getByText('Atorvastatin')).toBeInTheDocument();

    await user.click(sameFilter);
    expect(screen.getByText('Nothing matches this filter.')).toBeInTheDocument();

    await user.click(allFilter);

    // Verify / Flag / Defer controls and focus preservation + live Reviewed stat
    const lisinoprilGroup = screen.getByRole('group', { name: 'Review Lisinopril' });
    const verifyLisinopril = within(lisinoprilGroup).getByRole('button', { name: 'Verify' });
    await user.click(verifyLisinopril);
    expect(verifyLisinopril).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(verifyLisinopril).toHaveFocus());
    expect(getLiveNavAnnouncement()).toHaveTextContent('Marked Lisinopril as verified');

    const metforminGroup = screen.getByRole('group', { name: 'Review Metformin' });
    const flagMetformin = within(metforminGroup).getByRole('button', { name: 'Flag' });
    await user.click(flagMetformin);
    expect(flagMetformin).toHaveAttribute('aria-pressed', 'true');

    const aspirinGroup = screen.getByRole('group', { name: 'Review Aspirin' });
    const deferAspirin = within(aspirinGroup).getByRole('button', { name: 'Defer' });
    await user.click(deferAspirin);
    expect(deferAspirin).toHaveAttribute('aria-pressed', 'true');

    // Expand Lisinopril row to inspect field comparison table, CD-02 evidence links, and reviewer note
    const lisinoprilTrigger = screen
      .getByText('Lisinopril')
      .closest('button.entry-trigger') as HTMLButtonElement;
    await user.click(lisinoprilTrigger);
    expect(lisinoprilTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('table', { name: 'Field comparison for Lisinopril' })).toBeInTheDocument();

    // Escape collapses expanded row
    await user.keyboard('{Escape}');
    expect(lisinoprilTrigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(lisinoprilTrigger);
    expect(lisinoprilTrigger).toHaveAttribute('aria-expanded', 'true');

    const lisinoprilEvidence = screen.getByLabelText('Evidence and provenance for Lisinopril');
    expect(lisinoprilEvidence).toHaveTextContent('Provenance: Unverified');
    expect(lisinoprilEvidence).toHaveTextContent('2 evidence links');

    const reviewerNote = screen.getByLabelText('Reviewer note for Lisinopril');
    await user.type(reviewerNote, 'Check outpatient pharmacy fill.');
    expect(reviewerNote).toHaveValue('Check outpatient pharmacy fill.');

    // Switch Snapshot review tabs: Source snapshots & Method & limits
    await user.click(screen.getByRole('tab', { name: 'Source snapshots' }));
    expect(screen.getByRole('heading', { level: 2, name: /Snapshot A/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Snapshot B/ })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Method & limits' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Comparison rules' })).toBeInTheDocument();

    // Switch back to Differences tab
    await user.click(screen.getByRole('tab', { name: 'Differences' }));
  });

  it('supports Review suggestions, Evaluations, Session activity CSV/JSON export, and Models & data HF dataset provenance', async () => {
    const user = userEvent.setup();
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const exportedBlobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) exportedBlobs.push(blob);
      return 'blob:mock-url';
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      render(<Home />);

      // Review suggestions
      await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Review suggestions/i }));
      const triageH1 = screen.getByRole('heading', {
        level: 1,
        name: 'Suggestions waiting for a clinician',
      });
      await waitFor(() => expect(triageH1).toHaveFocus());
      expect(screen.getByText(/No suggestions yet\./)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Run triage' }));
      expect(screen.getByText('4 open of 4')).toBeInTheDocument();

      // Accept first suggestion, Override second with chip reason, Skip third
      const acceptButtons = screen.getAllByRole('button', { name: 'Accept' });
      const overrideButtons = screen.getAllByRole('button', { name: 'Override' });
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });

      await user.click(acceptButtons[0]);
      expect(screen.getByText('accepted')).toBeInTheDocument();

      await user.click(overrideButtons[1]);
      await user.click(screen.getByRole('button', { name: 'Patient-reported change' }));
      expect(screen.getByText('overridden · Patient-reported change')).toBeInTheDocument();

      await user.click(skipButtons[2]);
      expect(screen.getByText('skipped')).toBeInTheDocument();
      expect(screen.getByText('1 open of 4')).toBeInTheDocument();

      // Evaluations
      await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Evaluations/i }));
      const evalH1 = screen.getByRole('heading', { level: 1, name: 'Evaluation results' });
      await waitFor(() => expect(evalH1).toHaveFocus());
      expect(
        screen.getByText(`3 held-out cases + ${syntheticScenarios.length} workspace scenarios`),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Run held-out set' }));
      expect(screen.getByText(String(3 + syntheticScenarios.length))).toBeInTheDocument();
      expect(screen.getAllByText('1.00').length).toBeGreaterThanOrEqual(3);
      expect(screen.getByText(/Triage suggestions accepted:/)).toBeInTheDocument();

      // Session activity export (CSV + JSON) and actor filter
      await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Session activity/i }));
      await user.click(screen.getByRole('button', { name: 'CSV' }));
      await user.click(screen.getByRole('button', { name: 'Export JSON' }));

      expect(exportedBlobs).toHaveLength(2);
      expect(exportedBlobs[0].type).toBe('text/csv');
      expect(exportedBlobs[1].type).toBe('application/json');
      const csvText = await exportedBlobs[0].text();
      expect(csvText).toContain('time,actor,action,target');
      const jsonParsed = JSON.parse(await exportedBlobs[1].text()) as Array<{ action: string }>;
      expect(jsonParsed.some((entry) => entry.action === 'Exported audit log')).toBe(true);

      // Filter audit rows by actor
      await user.click(screen.getByRole('button', { name: 'Eval' }));
      expect(screen.getByText('Ran held-out & fixture suite')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Everyone' }));

      // Models & data: HF dataset provenance/licenses, Test all, New connection, Contracts
      await user.click(within(getLeftNav()).getByRole('button', { name: /Models & data/i }));
      const modelsH1 = screen.getByRole('heading', { level: 1, name: 'Models and data' });
      await waitFor(() => expect(modelsH1).toHaveFocus());

      expect(screen.getByText(`${hfDatasetSources.length} open-licensed sources`)).toBeInTheDocument();
      for (const ds of hfDatasetSources) {
        expect(screen.getByText(ds.dataset)).toBeInTheDocument();
        expect(screen.getAllByText(ds.license).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(ds.split)).toBeInTheDocument();
      }

      await user.click(screen.getByRole('button', { name: 'Test all' }));
      expect(screen.getByText('Tested all configured connectors')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'New connection' }));
      await user.type(screen.getByLabelText('Name'), 'Local SQLite Sandbox');
      await user.click(screen.getByRole('button', { name: 'Register & test' }));
      expect(within(screen.getByRole('main')).getByText('Local SQLite Sandbox')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Contracts' }));
      expect(screen.getByRole('heading', { level: 2, name: /Synthetic FHIR R4 preview/ })).toBeInTheDocument();
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });

  it('switches all four palettes, operates Ctrl+K command menu, and supports keyboard rail navigation', async () => {
    const user = userEvent.setup();
    render(<Home />);

    // Palette menu switching across Graphite, Dark Dimmed, Primer Obsidian, Nordic Forest
    const palCases: Array<{ name: string; id: string }> = [
      { name: 'Dark Dimmed', id: 'dimmed' },
      { name: 'Primer Obsidian', id: 'obsidian' },
      { name: 'Nordic Forest', id: 'forest' },
      { name: 'Graphite', id: 'void' },
    ];

    let currentLabel = 'Palette · Graphite';
    for (const p of palCases) {
      await user.click(screen.getByRole('button', { name: currentLabel }));
      const menu = screen.getByRole('menu', { name: 'Palette' });
      const opt = within(menu).getByRole('menuitemradio', { name: new RegExp(p.name) });
      await user.click(opt);
      expect(document.documentElement.dataset.palette).toBe(p.id);
      expect(localStorage.getItem('cd-palette')).toBe(p.id);
      currentLabel = `Palette · ${p.name}`;
      expect(screen.getByRole('button', { name: currentLabel })).toBeInTheDocument();
    }

    // Ctrl+K command menu open, filter, Enter execution, and Escape close
    await user.keyboard('{Control>}k{/Control}');
    const cmdDialog = screen.getByRole('dialog', { name: 'Command menu' });
    const cmdInput = within(cmdDialog).getByRole('textbox', { name: 'Command' });
    await waitFor(() => expect(cmdInput).toHaveFocus());

    await user.type(cmdInput, 'Evaluations');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Evaluation results' })).toBeInTheDocument();

    // Reopen with button and close with Escape
    await user.click(screen.getByRole('button', { name: 'Open command menu' }));
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument();

    // Keyboard rail navigation (ArrowDown, ArrowUp wrap, ArrowRight, ArrowLeft, Home, End, Enter)
    const navButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#app-navigation button.item'),
    );
    expect(navButtons.length).toBe(7);

    navButtons[0].focus();
    expect(navButtons[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(navButtons[1]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(navButtons[2]).toHaveFocus();

    await user.keyboard('{Home}');
    expect(navButtons[0]).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(navButtons[navButtons.length - 1]).toHaveFocus(); // Wraps to Models & data

    await user.keyboard('{ArrowLeft}');
    expect(navButtons[navButtons.length - 2]).toHaveFocus(); // Session activity

    await user.keyboard('{End}');
    expect(navButtons[navButtons.length - 1]).toHaveFocus(); // Models & data

    await user.keyboard('{ArrowDown}');
    expect(navButtons[0]).toHaveFocus(); // Wraps back to first patient

    // Activate Models & data via End + Enter
    await user.keyboard('{End}{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: 'Models and data' })).toBeInTheDocument();

    // Filter navigation input narrows patient list cleanly
    const railSearch = screen.getByRole('searchbox', { name: 'Filter navigation' });
    await user.type(railSearch, 'Morgan');
    const filteredPatients = within(getPatientsGroup()).getAllByRole('button');
    expect(filteredPatients).toHaveLength(1);
    expect(filteredPatients[0]).toHaveTextContent('Morgan Lee');
  });

  it('subscribes to /api/model-socket via EventSource when available and falls back to /api/health & /api/compare on Check socket', async () => {
    const user = userEvent.setup();
    const origEventSource = globalThis.EventSource;
    const origFetch = globalThis.fetch;

    type SseListener = (event: MessageEvent) => void;
    const instances: Array<{
      url: string;
      listeners: Map<string, SseListener[]>;
      close: ReturnType<typeof vi.fn>;
    }> = [];

    class MockEventSource {
      url: string;
      listeners = new Map<string, SseListener[]>();
      close = vi.fn();

      constructor(url: string) {
        this.url = url;
        instances.push(this);
      }

      addEventListener(type: string, cb: SseListener) {
        const list = this.listeners.get(type) ?? [];
        list.push(cb);
        this.listeners.set(type, list);
      }

      removeEventListener(type: string, cb: SseListener) {
        const list = this.listeners.get(type) ?? [];
        this.listeners.set(
          type,
          list.filter((fn) => fn !== cb),
        );
      }
    }

    try {
      // 1) EventSource live SSE updates (standby -> replay -> live)
      globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
      globalThis.fetch = vi.fn(async () => {
        throw new Error('offline during sse test');
      }) as unknown as typeof fetch;

      const { unmount } = render(<Home />);
      expect(instances).toHaveLength(1);
      expect(instances[0].url).toBe('/api/model-socket');
      expect(screen.getByTestId('extract-socket-readiness')).toHaveTextContent('standby');

      const socketMeta = screen.getByLabelText('Open model socket status');
      expect(socketMeta).toHaveTextContent('/api/model-socket');
      expect(socketMeta).toHaveTextContent('/api/health');
      expect(socketMeta).toHaveTextContent('/api/compare');

      const emitStatus = (payload: Record<string, unknown>) => {
        const cbs = instances[0].listeners.get('socket-status') ?? [];
        const evt = { data: JSON.stringify(payload) } as MessageEvent;
        for (const cb of cbs) cb(evt);
      };

      await act(async () => {
        emitStatus({
          socket_open: true,
          state: 'replay',
          status: 'standby',
          provider: 'mlx_service',
          configured: true,
          reachable: true,
          simulated: true,
          live_ai: false,
          model: 'qwen-replay-test',
          adapter: null,
          endpoints: {
            socket: '/api/model-socket',
            health: '/api/health',
            compare: '/api/compare',
          },
        });
      });

      expect(screen.getByTestId('extract-socket-readiness')).toHaveTextContent('replay');
      expect(socketMeta).toHaveTextContent('qwen-replay-test');

      await act(async () => {
        emitStatus({
          socket_open: true,
          state: 'live',
          status: 'ready',
          provider: 'mlx_service',
          configured: true,
          reachable: true,
          simulated: false,
          live_ai: true,
          model: 'mlx-community/Qwen3.5-4B-4bit',
          adapter: '/adapters/med-lora',
          endpoints: {
            socket: '/api/model-socket',
            health: '/api/health',
            compare: '/api/compare',
          },
        });
      });

      expect(screen.getByTestId('extract-socket-readiness')).toHaveTextContent('live');
      expect(document.getElementById('extraction-status')).toHaveTextContent(
        'Live AI · mlx-community/Qwen3.5-4B-4bit · adapter /adapters/med-lora',
      );

      await user.click(within(getLeftNav()).getByRole('button', { name: /Models & data/i }));
      const modelsCard = screen.getByLabelText('Note comparison service and model socket');
      expect(within(modelsCard).getByTestId('models-socket-readiness')).toHaveTextContent('live');
      expect(modelsCard).toHaveTextContent('mlx_service');
      expect(modelsCard).toHaveTextContent('mlx-community/Qwen3.5-4B-4bit · adapter /adapters/med-lora');
      expect(modelsCard).toHaveTextContent('/api/model-socket');
      expect(modelsCard).toHaveTextContent('/api/health');
      expect(modelsCard).toHaveTextContent('/api/compare');
      expect(modelsCard).toHaveTextContent('Synthetic records only');

      unmount();
      expect(instances[0].close).toHaveBeenCalledTimes(1);

      // 2) EventSource unavailable -> Check socket falls back from /api/health to /api/compare
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).EventSource;
      const fetchedUrls: string[] = [];
      let allowLive = false;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchedUrls.push(url);
        if (url === '/api/health') {
          return new Response('not found', { status: 404 });
        }
        if (url === '/api/compare' && allowLive) {
          return new Response(
            JSON.stringify({
              socket_open: true,
              state: 'live',
              status: 'ready',
              provider: 'ollama',
              configured: true,
              reachable: true,
              simulated: false,
              live_ai: true,
              model: 'medgemma:4b',
              adapter: null,
              endpoints: {
                socket: '/api/model-socket',
                health: '/api/health',
                compare: '/api/compare',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            socket_open: true,
            state: 'standby',
            status: 'standby',
            provider: 'deterministic_replay',
            configured: false,
            reachable: false,
            simulated: true,
            live_ai: false,
            model: null,
            adapter: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      render(<Home />);
      await user.click(within(getLeftNav()).getByRole('button', { name: /Models & data/i }));
      const card = screen.getByLabelText('Note comparison service and model socket');
      expect(within(card).getByTestId('models-socket-readiness')).toHaveTextContent('standby');

      allowLive = true;
      await user.click(within(card).getByRole('button', { name: 'Check socket' }));

      await waitFor(() =>
        expect(within(card).getByTestId('models-socket-readiness')).toHaveTextContent('live'),
      );
      expect(card).toHaveTextContent('medgemma:4b');
      expect(card).toHaveTextContent('ollama');
      expect(fetchedUrls).toContain('/api/health');
      expect(fetchedUrls).toContain('/api/compare');
    } finally {
      globalThis.EventSource = origEventSource;
      globalThis.fetch = origFetch;
    }
  });

  it('collapses technical diagnostics by default and surfaces amoxicillin frequency/duration changes', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const diagnostics = document.querySelector('details.extract-diagnostics');
    expect(diagnostics).not.toBeNull();
    expect(diagnostics).not.toHaveAttribute('open');
    expect(screen.getByText(/Synthetic data only/i)).toBeInTheDocument();

    const earlierInput = screen.getByLabelText(/Earlier note/i);
    const laterInput = screen.getByLabelText(/Discharge note/i);
    await user.clear(earlierInput);
    await user.type(earlierInput, 'Start amoxicillin 500 mg twice daily.');
    await user.clear(laterInput);
    await user.type(laterInput, 'Continue amoxicillin 500 mg three times daily for seven days.');

    const form = document.getElementById('extraction-form')!;
    await user.click(within(form).getByRole('button', { name: /Compare notes/i }));

    const resultSection = document.getElementById('extraction-result');
    expect(resultSection).not.toBeNull();
    expect(resultSection).toHaveTextContent('amoxicillin');
    expect(resultSection).toHaveTextContent('Frequency changed');
    expect(resultSection).toHaveTextContent('Duration changed');
    expect(resultSection).toHaveTextContent(/Unsupported in note-text comparison/i);
  });

  it('renders all 7 CockpitWidgets wired to live state with reordering and drill-down navigation', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const cockpit = screen.getByRole('region', { name: 'Clinical cockpit widgets' });
    const getWidgetOrder = () =>
      Array.from(cockpit.querySelectorAll<HTMLElement>('[data-widget-id]')).map(
        (el) => el.dataset.widgetId,
      );

    expect(getWidgetOrder()).toEqual([
      'diff-breakdown',
      'review-progress',
      'provenance-health',
      'triage-queue',
      'model-socket',
      'eval-metrics',
      'session-activity',
    ]);

    // Keyboard reorder button moves widget right and shows Reset layout
    await user.click(within(cockpit).getByRole('button', { name: 'Move Medication Diff Breakdown right' }));
    expect(getWidgetOrder().slice(0, 2)).toEqual(['review-progress', 'diff-breakdown']);

    await user.click(within(cockpit).getByRole('button', { name: 'Reset layout' }));
    expect(getWidgetOrder().slice(0, 2)).toEqual(['diff-breakdown', 'review-progress']);

    // HTML5 drag-and-drop reorders widgets
    const evalCard = cockpit.querySelector<HTMLElement>('[data-widget-id="eval-metrics"]')!;
    const diffCard = cockpit.querySelector<HTMLElement>('[data-widget-id="diff-breakdown"]')!;
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      data: {} as Record<string, string>,
      setData(type: string, val: string) {
        this.data[type] = val;
      },
      getData(type: string) {
        return this.data[type] ?? '';
      },
    };
    const targetRect = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} } as DOMRect;
    const sourceRect = { ...targetRect, left: 100, right: 200, x: 100 } as DOMRect;
    vi.spyOn(diffCard, 'getBoundingClientRect').mockReturnValue(targetRect);
    vi.spyOn(evalCard, 'getBoundingClientRect').mockReturnValue(sourceRect);
    fireEvent.dragStart(evalCard, { dataTransfer });
    const dragOverAt = (clientX: number) => {
      const event = new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      fireEvent(diffCard, event);
    };
    dragOverAt(90);
    expect(evalCard.style.order).toBe('5');
    dragOverAt(44);
    expect(evalCard.style.order).toBe('0');
    dragOverAt(50);
    expect(evalCard.style.order).toBe('0'); // A small reversal must not jitter back.
    dragOverAt(56);
    expect(evalCard.style.order).toBe('0'); // Layout motion alone must not reverse the move.
    dragOverAt(96);
    expect(evalCard.style.order).toBe('1');
    dragOverAt(24);
    expect(evalCard.style.order).toBe('0');
    fireEvent.drop(diffCard, { dataTransfer });
    fireEvent.dragEnd(evalCard);
    expect(getWidgetOrder()[0]).toBe('eval-metrics');

    // Dropping without crossing the live-reorder threshold does not swap cards.
    await user.click(within(cockpit).getByRole('button', { name: 'Reset layout' }));
    fireEvent.dragStart(evalCard, { dataTransfer });
    fireEvent.drop(diffCard, { dataTransfer });
    fireEvent.dragEnd(evalCard);
    expect(getWidgetOrder()[0]).toBe('diff-breakdown');

    // Drill-down: Medication Diff Breakdown 'Changed' chip navigates to Snapshot review with Changed filter
    const changedChip = within(diffCard).getByRole('button', { name: /Changed/i });
    await user.click(changedChip);

    const morganHeading = screen.getByRole('heading', { level: 1, name: 'Morgan Lee' });
    await waitFor(() => expect(morganHeading).toHaveFocus());
    const filterGroup = screen.getByRole('group', { name: 'Filter medication differences' });
    expect(within(filterGroup).getByRole('button', { name: /^Changed/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Lisinopril')).toBeInTheDocument();
    expect(screen.queryByText('Aspirin')).not.toBeInTheDocument();

    // Drill-down: Provenance & Evidence Health navigates to Snapshot review with All filter
    await user.click(within(cockpit).getByRole('button', { name: 'Provenance & Evidence Health' }));
    expect(within(filterGroup).getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Drill-down: AI Triage Queue navigates to Review suggestions and updates live count after Run triage
    await user.click(within(cockpit).getByRole('button', { name: 'AI Triage Queue' }));
    const triageH1 = screen.getByRole('heading', {
      level: 1,
      name: 'Suggestions waiting for a clinician',
    });
    await waitFor(() => expect(triageH1).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Run triage' }));
    const triageCard = cockpit.querySelector<HTMLElement>('[data-widget-id="triage-queue"]')!;
    expect(within(triageCard).getByRole('img')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('4 open'),
    );

    // Drill-down: Evaluation Metrics -> Evaluations
    await user.click(within(cockpit).getByRole('button', { name: 'Evaluation Metrics' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Evaluation results' })).toHaveFocus(),
    );

    // Drill-down: Session Activity -> Session activity
    await user.click(within(cockpit).getByRole('button', { name: 'Session Activity' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Session activity' })).toHaveFocus(),
    );

    // Drill-down: Note Extraction & Model Socket -> Models and data
    await user.click(within(cockpit).getByRole('button', { name: 'Note Extraction & Model Socket' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Models and data' })).toHaveFocus(),
    );
  });

  it('hydrates reviews and audit from /api/reviews, persists review updates asynchronously, and falls back gracefully offline', async () => {
    const user = userEvent.setup();
    const origFetch = globalThis.fetch;
    const scenarioId = syntheticScenarios[0].id;
    const postPayloads: Array<Record<string, unknown>> = [];

    try {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === '/api/reviews' && method === 'GET') {
          return new Response(
            JSON.stringify({
              syntheticOnly: true,
              disclaimer: 'Synthetic training/demo session data only. Never store real PHI.',
              updatedAt: '2026-11-15T01:00:00.000Z',
              persistence: 'local_file',
              reviews: {
                [`${scenarioId}:m1`]: 'verified',
              },
              reviewsByScenario: {
                [scenarioId]: { m1: 'verified' },
              },
              audit: [
                {
                  id: 'aud-hydrated-1',
                  ts: '2026-11-15T01:00:00.000Z',
                  actor: 'Clinician',
                  action: 'Marked verified',
                  target: 'Morgan Lee · Lisinopril',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url === '/api/reviews' && (method === 'POST' || method === 'PUT')) {
          const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          postPayloads.push(parsed);
          return new Response(
            JSON.stringify({
              syntheticOnly: true,
              disclaimer: 'Synthetic training/demo session data only. Never store real PHI.',
              updatedAt: '2026-11-15T01:05:00.000Z',
              persistence: 'local_file',
              reviews: { [`${scenarioId}:m1`]: 'verified' },
              reviewsByScenario: { [scenarioId]: { m1: 'verified' } },
              audit: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            socket_open: true,
            state: 'standby',
            status: 'standby',
            provider: 'deterministic_replay',
            configured: false,
            reachable: false,
            simulated: true,
            live_ai: false,
            model: null,
            adapter: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      const { unmount } = render(<Home />);

      // Verify hydrated review appears in Snapshot review and CockpitWidgets
      const cockpit = screen.getByRole('region', { name: 'Clinical cockpit widgets' });
      const reviewCard = cockpit.querySelector<HTMLElement>('[data-widget-id="review-progress"]')!;
      await waitFor(() => {
        expect(within(reviewCard).getByRole('img')).toHaveAttribute(
          'aria-label',
          expect.stringContaining('1 of 4 reviewed'),
        );
      });

      await user.click(within(getPatientsGroup()).getAllByRole('button')[0]);
      const lisinoprilGroup = screen.getByRole('group', { name: 'Review Lisinopril' });
      expect(within(lisinoprilGroup).getByRole('button', { name: 'Verify' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      // Toggle Flag on Metformin (m2) -> persists asynchronously to POST /api/reviews
      const metforminGroup = screen.getByRole('group', { name: 'Review Metformin' });
      await user.click(within(metforminGroup).getByRole('button', { name: 'Flag' }));

      await waitFor(() => {
        expect(
          postPayloads.some(
            (p) =>
              p.key === `${scenarioId}:m2` &&
              p.decision === 'flagged' &&
              typeof p.auditEntry === 'object' &&
              p.auditEntry !== null &&
              (p.auditEntry as { action?: string }).action === 'Marked flagged',
          ),
        ).toBe(true);
      });

      // Toggle Flag on Metformin again -> clears decision (decision: null)
      await user.click(within(metforminGroup).getByRole('button', { name: 'Flag' }));
      await waitFor(() => {
        expect(
          postPayloads.some(
            (p) =>
              p.key === `${scenarioId}:m2` &&
              p.decision === null &&
              typeof p.auditEntry === 'object' &&
              p.auditEntry !== null &&
              (p.auditEntry as { action?: string }).action === 'Cleared flagged',
          ),
        ).toBe(true);
      });

      // Hydrated audit entry is visible in Session activity
      await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Session activity/i }));
      expect(screen.getByText('Morgan Lee · Lisinopril')).toBeInTheDocument();

      unmount();

      // Offline fallback: fetch rejects, UI still works cleanly without throwing
      globalThis.fetch = vi.fn(async () => {
        throw new Error('offline mode');
      }) as unknown as typeof fetch;

      render(<Home />);
      await user.click(within(getPatientsGroup()).getAllByRole('button')[0]);
      const offlineLisinopril = screen.getByRole('group', { name: 'Review Lisinopril' });
      const offlineVerify = within(offlineLisinopril).getByRole('button', { name: 'Verify' });
      await user.click(offlineVerify);
      expect(offlineVerify).toHaveAttribute('aria-pressed', 'true');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('drills down from provenance-health to expanded medication evidence with focus return and Source unavailable distinction', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const cockpit = screen.getByRole('region', { name: 'Clinical cockpit widgets' });
    const provenanceCard = cockpit.querySelector<HTMLElement>('[data-widget-id="provenance-health"]')!;

    // 1. Morgan Lee (DEMO-001): select Lisinopril directly from provenance-health
    const lisinoprilTrigger = within(provenanceCard).getByRole('button', { name: /Lisinopril/i });
    await user.click(lisinoprilTrigger);

    const evidenceRegion = screen.getByLabelText('Evidence and provenance for Lisinopril');
    await waitFor(() => expect(evidenceRegion).toHaveFocus());
    expect(evidenceRegion).toHaveTextContent('Fictional outpatient medication list');
    expect(evidenceRegion).toHaveTextContent('2026-10-01');
    expect(evidenceRegion).toHaveTextContent('Fictional discharge medication list');
    expect(evidenceRegion).toHaveTextContent('2026-10-15');
    // Structured fields alone must not fabricate an exact quote
    expect(evidenceRegion).toHaveTextContent(/Snapshot entry only; no supporting clinical note, excerpt, or span provided/i);

    // Return focus to the exact trigger via Back to evidence widget button
    await user.click(within(evidenceRegion).getByRole('button', { name: 'Back to evidence widget' }));
    await waitFor(() => expect(lisinoprilTrigger).toHaveFocus());
    expect(screen.queryByLabelText('Evidence and provenance for Lisinopril')).not.toBeInTheDocument();

    // Re-open via keyboard and close with Escape -> focus returns to trigger
    lisinoprilTrigger.focus();
    await user.keyboard('{Enter}');
    const reopenedEvidence = screen.getByLabelText('Evidence and provenance for Lisinopril');
    await waitFor(() => expect(reopenedEvidence).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(lisinoprilTrigger).toHaveFocus());

    // 2. Documented negative finding on an absent side (Aspirin removed in Morgan Lee)
    const aspirinTrigger = within(provenanceCard).getByRole('button', { name: /Aspirin/i });
    await user.click(aspirinTrigger);
    const aspirinEvidence = screen.getByLabelText('Evidence and provenance for Aspirin');
    expect(aspirinEvidence).toHaveTextContent(/Later side: Not listed in Snapshot B/i);
  });

  it('labels unresolved or unavailable evidence links as Source unavailable in provenance-health', async () => {
    const user = userEvent.setup();
    const onSelectEvidenceChange = vi.fn();

    render(
      <CockpitWidgets
        snapshotEntries={[{ id: 'm-unavail', kind: 'changed', name: 'Warfarin' }]}
        reviews={{}}
        activeReport={{
          earlierProvenance: {
            present: true,
            status: 'documented',
            sourceKind: 'clinical_note',
            sourceLabel: 'Clinic note',
            attributedBy: null,
            recordedAt: '2026-10-01',
            ambiguous: false,
            flags: [],
            gaps: [],
          },
          laterProvenance: {
            present: true,
            status: 'unknown',
            sourceKind: 'unknown',
            sourceLabel: null,
            attributedBy: null,
            recordedAt: null,
            ambiguous: false,
            flags: [],
            gaps: [],
          },
          provenanceGaps: [],
          evidenceLinks: [
            {
              id: 'ev-1',
              side: 'later',
              resolutionStatus: 'unavailable',
              provenanceStatus: 'unknown',
              excerpt: null,
              span: null,
            },
          ],
          changes: [
            {
              medicationId: 'm-unavail',
              name: 'Warfarin',
              kind: 'changed',
              fields: [{ field: 'dose', before: '5 mg', after: '2.5 mg' }],
              evidenceLinks: [
                {
                  id: 'ev-1',
                  side: 'later',
                  resolutionStatus: 'unavailable',
                  provenanceStatus: 'unknown',
                  excerpt: null,
                  span: null,
                },
              ],
            },
          ],
        }}
        triageByScenario={{}}
        socketStatus={{
          socket_open: false,
          state: 'standby',
          status: 'standby',
          provider: 'deterministic_replay',
          configured: false,
          reachable: false,
          mode: 'unavailable',
          simulated: true,
          live_ai: false,
          model: null,
          adapter: null,
          model_loaded: false,
          target: null,
          checked_at: '2026-11-14T00:00:00.000Z',
          detail: 'Offline',
          endpoints: {
            socket: '/api/model-socket',
            health: '/api/health',
            compare: '/api/compare',
          },
        }}
        evalSummary={null}
        audit={[]}
        onNavigate={vi.fn()}
        onSelectEvidenceChange={onSelectEvidenceChange}
      />,
    );

    const trigger = screen.getByRole('button', { name: /Warfarin.*Source unavailable/i });
    await user.click(trigger);
    expect(onSelectEvidenceChange).toHaveBeenCalledWith('m-unavail');
  });
});

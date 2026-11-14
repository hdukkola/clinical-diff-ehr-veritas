import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';

function getLiveNavAnnouncement() {
  return document.querySelector('.sr-only[aria-live="polite"][aria-atomic="true"]');
}

describe('Clinical Diff EHR critical workflows', () => {
  it('renders the prototype safety banner and dashboard summary cards on initial load', () => {
    render(<Home />);

    const banner = screen.getByRole('note', { name: 'Prototype disclaimer' });
    expect(banner).toHaveTextContent(
      'Prototype only · Differences are observations, not confirmed errors or treatment recommendations.',
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Fictional patient data')).toBeInTheDocument();
    expect(screen.getByText('SYNTHETIC DEMO')).toBeInTheDocument();
    expect(screen.getByText('Differences to review').closest('article')).toHaveTextContent('4');
  });

  it('supports full patient search, empty state, clear search, and patient selection workflow', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole('button', { name: /Explore patients/i }));

    const patientsHeading = screen.getByRole('heading', { level: 1, name: 'Patients' });
    await waitFor(() => expect(patientsHeading).toHaveFocus());
    expect(getLiveNavAnnouncement()).toHaveTextContent('Navigated to Patients');

    const searchInput = screen.getByRole('searchbox', { name: 'Search patients' });
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    const patientStatusRegions = () => screen.getAllByRole('status');
    expect(patientStatusRegions()[0]).toHaveTextContent('1 patient shown: Morgan Lee, DEMO-001.');

    // Partial/case-insensitive match by ID keeps Morgan Lee visible
    await user.type(searchInput, 'demo-001');
    expect(screen.getByRole('button', { name: /Morgan Lee/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();

    // Non-matching query displays empty state and hides patient row
    await user.clear(searchInput);
    await user.type(searchInput, 'Nonexistent Patient');
    expect(screen.queryByRole('button', { name: /Morgan Lee/i })).not.toBeInTheDocument();
    expect(screen.getByText(/No synthetic patients match “Nonexistent Patient”\./i)).toBeInTheDocument();
    expect(patientStatusRegions()[0]).toHaveTextContent('No patients match your search.');

    // Clearing search restores the patient directory entry
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(searchInput).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    const morganRow = screen.getByRole('button', { name: /Morgan Lee/i });
    expect(morganRow).toBeInTheDocument();

    // Selecting the patient opens the Patient chart and transfers focus to the heading
    await user.click(morganRow);
    const chartHeading = screen.getByRole('heading', { level: 1, name: 'Patient chart' });
    await waitFor(() => expect(chartHeading).toHaveFocus());
    expect(getLiveNavAnnouncement()).toHaveTextContent('Navigated to Patient chart');
    expect(screen.getByRole('heading', { level: 2, name: 'Morgan Lee' })).toBeInTheDocument();
    expect(screen.getByText('DEMO-001 · Fictional patient')).toBeInTheDocument();
  });

  it('supports sidebar mouse/keyboard navigation (Arrow/Home/End), skip link, and focus transfer', async () => {
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
    main.focus();
    expect(main).toHaveFocus();

    const nav = screen.getByRole('navigation', { name: 'WORKSPACE' });
    const navButtons = within(nav).getAllByRole('button');
    expect(navButtons.map((btn) => btn.textContent)).toEqual([
      'Dashboard',
      'Patients',
      'Patient chart',
      'Medication history',
      'Encounter timeline',
      'Clinical notes',
      'Clinical Diff',
    ]);
    expect(navButtons[0]).toHaveAttribute('aria-current', 'page');

    // Keyboard ArrowDown, ArrowUp wrap-around, End, Home
    navButtons[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(navButtons[1]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(navButtons[2]).toHaveFocus();

    await user.keyboard('{Home}');
    expect(navButtons[0]).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(navButtons[6]).toHaveFocus(); // Wraps from Dashboard to Clinical Diff

    await user.keyboard('{ArrowLeft}');
    expect(navButtons[5]).toHaveFocus(); // Clinical notes

    await user.keyboard('{End}');
    expect(navButtons[6]).toHaveFocus(); // Clinical Diff

    await user.keyboard('{ArrowDown}');
    expect(navButtons[0]).toHaveFocus(); // Wraps from Clinical Diff to Dashboard

    // Activate Encounter timeline via End -> ArrowUp -> ArrowUp -> Enter
    await user.keyboard('{End}{ArrowUp}{ArrowUp}{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: 'Encounter timeline' })).toBeInTheDocument();
    expect(navButtons[4]).toHaveAttribute('aria-current', 'page');
    expect(navButtons[0]).not.toHaveAttribute('aria-current');
    expect(getLiveNavAnnouncement()).toHaveTextContent('Navigated to Encounter timeline');

    // Mouse click on sidebar switches section without moving focus off the sidebar button
    await user.click(navButtons[5]);
    expect(screen.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeInTheDocument();
    expect(navButtons[5]).toHaveAttribute('aria-current', 'page');
    expect(navButtons[5]).toHaveFocus();
  });

  it('navigates timeline, medication history, and clinical notes while preserving the safety banner', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const nav = screen.getByRole('navigation', { name: 'WORKSPACE' });
    const main = screen.getByRole('main');

    // Visit Patient chart -> Encounter timeline
    await user.click(within(nav).getByRole('button', { name: 'Patient chart' }));
    await user.click(within(main).getByRole('button', { name: /Encounter timeline/i }));

    const timelineHeading = screen.getByRole('heading', { level: 1, name: 'Encounter timeline' });
    await waitFor(() => expect(timelineHeading).toHaveFocus());
    expect(screen.getByRole('note', { name: 'Prototype disclaimer' })).toBeInTheDocument();

    const timelineList = screen.getByRole('list');
    const items = within(timelineList).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('2026-10-15');
    expect(items[0]).toHaveTextContent('Fictional discharge record · medication list available');
    expect(items[1]).toHaveTextContent('2026-10-01');
    expect(items[1]).toHaveTextContent('Fictional outpatient record · medication list available');

    // Visit Clinical notes via Patient chart
    await user.click(within(nav).getByRole('button', { name: 'Patient chart' }));
    await user.click(within(main).getByRole('button', { name: /Clinical notes/i }));

    const notesHeading = screen.getByRole('heading', { level: 1, name: 'Clinical notes' });
    await waitFor(() => expect(notesHeading).toHaveFocus());
    expect(
      screen.getByText(/No supporting clinical note is available in this synthetic fixture/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Prototype disclaimer' })).toBeInTheDocument();

    // Visit Medication history and verify source snapshots + missing-field fallback before jumping to diff
    await user.click(within(nav).getByRole('button', { name: 'Patient chart' }));
    await user.click(within(main).getByRole('button', { name: /Medication history/i }));

    const medHistoryHeading = screen.getByRole('heading', { level: 1, name: 'Medication history' });
    await waitFor(() => expect(medHistoryHeading).toHaveFocus());
    expect(screen.getByRole('heading', { level: 3, name: 'Fictional outpatient medication list' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Fictional discharge medication list' })).toBeInTheDocument();
    expect(screen.getByText('Frequency not documented')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Compare snapshots/i }));
    const diffHeading = screen.getByRole('heading', { level: 1, name: 'Clinical Diff' });
    await waitFor(() => expect(diffHeading).toHaveFocus());
  });

  it('renders Clinical Diff source comparison, added/removed/changed/missing diffs, and live review status updates', async () => {
    const user = userEvent.setup();
    render(<Home />);

    // End-to-end flow: Dashboard -> Patients -> Patient chart -> Review Clinical Diff
    await user.click(screen.getByRole('button', { name: /Explore patients/i }));
    await user.click(screen.getByRole('button', { name: /Morgan Lee/i }));
    await user.click(screen.getByRole('button', { name: /Review Clinical Diff/i }));

    const diffH1 = screen.getByRole('heading', { level: 1, name: 'Clinical Diff' });
    await waitFor(() => expect(diffH1).toHaveFocus());
    expect(getLiveNavAnnouncement()).toHaveTextContent('Navigated to Clinical Diff');

    // Prototype safety banner and evidence limitation notice remain visible
    expect(screen.getByRole('note', { name: 'Prototype disclaimer' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Evidence limitation' })).toHaveTextContent(
      'Evidence is incomplete: no authorization or rationale is included in these fixtures.',
    );

    // Source comparison uses semantic <dl className="source-item"> blocks inside .sources
    const sourceSection = screen.getByRole('region', { name: 'Source snapshots' });
    const sourceItems = sourceSection.querySelectorAll('dl.source-item');
    expect(sourceItems).toHaveLength(2);
    expect(sourceItems[0]).toHaveTextContent('EARLIER SOURCE');
    expect(sourceItems[0]).toHaveTextContent('Fictional outpatient medication list');
    expect(sourceItems[0]).toHaveTextContent('2026-10-01');
    expect(sourceItems[1]).toHaveTextContent('LATER SOURCE');
    expect(sourceItems[1]).toHaveTextContent('Fictional discharge medication list');
    expect(sourceItems[1]).toHaveTextContent('2026-10-15');

    // Changed medication: Lisinopril (dose 10 mg -> 20 mg)
    const lisinoprilCard = screen.getByRole('article', { name: 'Lisinopril' });
    expect(within(lisinoprilCard).getByText('CHANGED')).toBeInTheDocument();
    const lisinoprilTable = within(lisinoprilCard).getByRole('table', {
      name: 'Field changes for Lisinopril',
    });
    expect(within(lisinoprilTable).getByText('dose')).toBeInTheDocument();
    expect(within(lisinoprilTable).getByText('10 mg')).toBeInTheDocument();
    expect(within(lisinoprilTable).getByText('20 mg')).toBeInTheDocument();

    // Changed medication with missing field: Metformin (frequency twice daily -> Not documented)
    const metforminCard = screen.getByRole('article', { name: 'Metformin' });
    expect(within(metforminCard).getByText('CHANGED')).toBeInTheDocument();
    const metforminTable = within(metforminCard).getByRole('table', {
      name: 'Field changes for Metformin',
    });
    expect(within(metforminTable).getByText('frequency')).toBeInTheDocument();
    expect(within(metforminTable).getByText('twice daily')).toBeInTheDocument();
    expect(within(metforminTable).getByText('Not documented')).toBeInTheDocument();

    // Removed medication: Aspirin
    const aspirinCard = screen.getByRole('article', { name: 'Aspirin' });
    expect(within(aspirinCard).getByText('REMOVED')).toBeInTheDocument();
    expect(
      within(aspirinCard).getByText(/Present in the earlier snapshot; absent from the later snapshot\./i),
    ).toBeInTheDocument();
    expect(within(aspirinCard).getByText('81 mg')).toBeInTheDocument();

    // Added medication: Atorvastatin
    const atorvastatinCard = screen.getByRole('article', { name: 'Atorvastatin' });
    expect(within(atorvastatinCard).getByText('ADDED')).toBeInTheDocument();
    expect(
      within(atorvastatinCard).getByText(/Absent from the earlier snapshot; present in the later snapshot\./i),
    ).toBeInTheDocument();
    expect(within(atorvastatinCard).getByText('20 mg')).toBeInTheDocument();

    // Review status selection updates live count badge and persists across navigation
    expect(screen.getByText('4 differences')).toBeInTheDocument();
    const reviewedBadge = screen.getByText('0 of 4 reviewed');
    expect(reviewedBadge).toHaveAttribute('aria-live', 'polite');

    const lisinoprilSelect = screen.getByRole('combobox', { name: 'Review decision for Lisinopril' });
    const metforminSelect = screen.getByRole('combobox', { name: 'Review decision for Metformin' });
    const aspirinSelect = screen.getByRole('combobox', { name: 'Review decision for Aspirin' });

    await user.selectOptions(lisinoprilSelect, 'Reviewed — no conclusion');
    expect(reviewedBadge).toHaveTextContent('1 of 4 reviewed');

    await user.selectOptions(metforminSelect, 'Needs more evidence');
    expect(reviewedBadge).toHaveTextContent('2 of 4 reviewed');

    await user.selectOptions(aspirinSelect, 'Discuss with care team');
    expect(reviewedBadge).toHaveTextContent('3 of 4 reviewed');

    // Reverting a decision to "Not reviewed" decrements the live counter
    await user.selectOptions(lisinoprilSelect, '');
    expect(reviewedBadge).toHaveTextContent('2 of 4 reviewed');

    // Navigating to source snapshots and back preserves review selections in session state
    await user.click(screen.getByRole('button', { name: /View source snapshots/i }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Medication history' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: /Compare snapshots/i }));
    expect(screen.getByText('2 of 4 reviewed')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Review decision for Metformin' }),
    ).toHaveValue('Needs more evidence');
    expect(
      screen.getByRole('combobox', { name: 'Review decision for Aspirin' }),
    ).toHaveValue('Discuss with care team');
  });

  it('surfaces read-only provenance/evidence indicators and supports switching synthetic scenarios in Clinical Diff', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const nav = screen.getByRole('navigation', { name: 'WORKSPACE' });
    await user.click(within(nav).getByRole('button', { name: 'Clinical Diff' }));

    const provenanceSummary = screen.getByRole('region', { name: 'Provenance and evidence summary' });
    expect(provenanceSummary).toHaveTextContent('Earlier: Unverified');
    expect(provenanceSummary).toHaveTextContent('Later: Unverified');
    expect(provenanceSummary).toHaveTextContent('2 evidence links');
    expect(provenanceSummary).toHaveTextContent('5 provenance gaps');

    const lisinoprilProvenance = screen.getByLabelText('Provenance and evidence for Lisinopril');
    expect(lisinoprilProvenance).toHaveTextContent('Provenance: Unverified');
    expect(lisinoprilProvenance).toHaveTextContent('2 evidence links');

    const scenarioSelect = screen.getByRole('combobox', { name: 'Synthetic scenario' });
    await user.selectOptions(scenarioSelect, 'scenario-missing-undocumented-fields');

    expect(screen.getByText('AVERY KIM · SYN-003')).toBeInTheDocument();
    expect(screen.getByText('Timestamp not documented')).toBeInTheDocument();
    expect(provenanceSummary).toHaveTextContent('Missing timestamp');
    expect(provenanceSummary).toHaveTextContent('Undocumented field');

    await user.selectOptions(scenarioSelect, 'scenario-empty-snapshots');
    expect(screen.getByText('0 differences')).toBeInTheDocument();
    expect(screen.getByText('0 of 0 reviewed')).toBeInTheDocument();
    expect(
      screen.getByText('No medication differences detected between these snapshots.'),
    ).toBeInTheDocument();
  });
});

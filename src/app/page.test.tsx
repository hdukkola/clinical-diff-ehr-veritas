import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import * as cloudWorkspace from '@/lib/cloud-workspace';
import { earlier, later, syntheticScenarios } from '@/lib/fixtures';
import { TRANSCRIPTION_MODEL, TRANSCRIPTION_WEIGHTS } from '@/lib/recording-transcription';

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
  return within(getLeftNav()).getByRole('group', { name: 'Patients' });
}

async function openSnapshot(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Snapshot review/ }));
}

async function openCompare(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(getWorkspaceNav()).getByRole('button', { name: 'Compare notes' }));
}

async function openCockpit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(getWorkspaceNav()).getByRole('button', { name: 'Home' }));
  const details = document.querySelector<HTMLDetailsElement>('details.workspace-extra')!;
  if (!details.open) await user.click(within(details).getByText('Customize workspace'));
  return screen.getByRole('region', { name: 'Clinical cockpit widgets' });
}

describe('Clinical Diff Veritas Editorial UI', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.palette = 'void';
    vi.stubEnv('NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE', '1');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('starts the public workspace empty and compares only notes the reviewer enters', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE', '0');
    const digest = vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(webcrypto.subtle as SubtleCrypto);
    localStorage.setItem('diffmd-patient-v1:LOCAL-AAAAAAAAAAAA', 'Old example');
    const user = userEvent.setup();
    const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    try {
      const workspace = render(<Home />);

      expect(within(getPatientsGroup()).queryAllByRole('button')).toHaveLength(0);
      expect(screen.queryByText(/Morgan Lee|Old example|October 15|Read encounter/i)).not.toBeInTheDocument();
      await openCompare(user);
      const main = within(screen.getByRole('main'));
      expect(main.getByText('Add a patient to get started.')).toBeVisible();
      expect(main.queryByRole('textbox')).not.toBeInTheDocument();

      await user.click(main.getByRole('button', { name: 'Add patient' }));
      await user.type(main.getByRole('textbox', { name: 'Case reference' }), 'Case QA-001');
      await user.click(main.getByRole('button', { name: 'Create patient' }));
      expect(main.getByRole('heading', { name: 'Case QA-001' })).toBeVisible();
      await openCompare(user);
      const earlierNote = main.getByRole('textbox', { name: 'Earlier note' });
      const laterNote = main.getByRole('textbox', { name: 'Later note' });
      expect(earlierNote).toHaveValue('');
      expect(laterNote).toHaveValue('');
      await user.type(earlierNote, 'Lisinopril 10 mg daily');
      await user.type(laterNote, 'Lisinopril 20 mg daily');
      await user.click(main.getByRole('button', { name: 'Compare notes' }));
      const result = await main.findByRole('region', { name: 'Mention differences' });
      expect(result).toHaveTextContent('Lisinopril 10 mg daily');
      expect(result).toHaveTextContent('Lisinopril 20 mg daily');
      await user.click(within(result).getByRole('button', { name: 'Flag for clarification' }));
      expect(result).toHaveTextContent('1 flagged for clarification');

      workspace.unmount();
      render(<Home />);
      await user.click(within(getPatientsGroup()).getByRole('button', { name: /^Case QA-001/ }));
      await openCompare(user);
      const reopened = within(screen.getByRole('main'));
      await user.click(reopened.getByRole('button', { name: 'Compare notes' }));
      const restored = await reopened.findByRole('region', { name: 'Mention differences' });
      expect(within(restored).getByRole('button', { name: 'Flag for clarification' })).toHaveAttribute('aria-pressed', 'true');

      const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
      try {
        await user.click(within(restored).getByRole('button', { name: 'Mark reviewed' }));
        expect(reopened.getByRole('alert')).toHaveTextContent('Could not save this decision');
        expect(within(restored).getByRole('button', { name: 'Flag for clarification' })).toHaveAttribute('aria-pressed', 'true');
      } finally {
        save.mockRestore();
      }
      fireEvent.change(reopened.getByRole('textbox', { name: 'Later note' }), { target: { value: 'Lisinopril 30 mg daily' } });
      await user.click(reopened.getByRole('button', { name: 'Compare notes' }));
      expect(await reopened.findByRole('region', { name: 'Mention differences' })).toHaveTextContent('0 flagged for clarification');
      expect(network.mock.calls.map(([input]) => String(input))).not.toContain('/api/reviews');
    } finally {
      digest.mockRestore();
      network.mockRestore();
    }
  });

  it('requires consent, review, and a separate save to append a transcript to a synced note', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE', '0');
    vi.stubEnv('NEXT_PUBLIC_DIFFMD_RECORDING_TRANSCRIPTION', '1');
    const uid = 'qa-case-owner';
    const caseRecord = {
      id: 'SYNC-' + 'A'.repeat(32),
      name: 'Recording QA',
      version: 1,
      earlier: 'Earlier note text.',
      later: 'Existing later note.',
    };
    const getIdToken = vi.fn().mockResolvedValue('mock.firebase.token');
    type WorkspaceUser = NonNullable<ReturnType<typeof cloudWorkspace.useCloudSession>['user']>;
    const account: Pick<WorkspaceUser, 'uid' | 'getIdToken'> = { uid, getIdToken };
    const session = vi.spyOn(cloudWorkspace, 'useCloudSession').mockReturnValue({
      user: account as WorkspaceUser,
      pending: false, error: '', changeAccount: vi.fn(),
    });
    const cases = vi.spyOn(cloudWorkspace, 'useCloudCases').mockReturnValue({
      cases: [caseRecord], loading: false, connected: true, error: '', retry: vi.fn(),
    });
    const save = vi.spyOn(cloudWorkspace, 'saveCloudCaseNotes').mockResolvedValue(2);
    const playback = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recording-qa');
    const originalFetch = globalThis.fetch;
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      input === '/api/recording-transcription'
        ? Promise.resolve(Response.json({
          model: TRANSCRIPTION_MODEL, weightsSha256: TRANSCRIPTION_WEIGHTS, reviewRequired: true,
          segments: [{ startMs: 0, endMs: 800, text: 'The library opens at nine.' }],
        }))
        : originalFetch(input, init));
    vi.stubGlobal('AudioContext', class {
      decodeAudioData() { return Promise.resolve({ length: 16000, sampleRate: 16000 }); }
      close() { return Promise.resolve(); }
    });
    vi.stubGlobal('OfflineAudioContext', class {
      destination = {};
      createBufferSource() { return { connect: vi.fn(), start: vi.fn() }; }
      startRendering() { return Promise.resolve({ getChannelData: () => new Float32Array(16000) }); }
    });

    try {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(within(getPatientsGroup()).getByRole('button', { name: /^Recording QA/ }));
      const panel = within(screen.getByRole('region', { name: 'Transcribe a recording' }));
      const recording = new File(['audio'], 'recording.wav', { type: 'audio/wav' });
      Object.defineProperty(recording, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(4)) });
      await user.upload(panel.getByLabelText('Choose an audio file'), recording);
      const transcribe = panel.getByRole('button', { name: 'Transcribe recording' });
      expect(transcribe).toBeDisabled();
      expect(getIdToken).not.toHaveBeenCalled();
      await user.click(panel.getByRole('checkbox', { name: /I have permission/ }));
      await user.click(transcribe);
      const draft = await panel.findByRole('textbox', { name: 'Transcript draft' });
      expect(draft).toHaveValue('The library opens at nine.');
      expect(network).toHaveBeenCalledWith('/api/recording-transcription', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          'X-DiffMD-Workspace-Token': 'mock.firebase.token',
          'X-DiffMD-Workspace-UID': uid,
          'X-DiffMD-Case-ID': caseRecord.id,
        },
      }));

      const review = panel.getByRole('checkbox', { name: /I checked the transcript/ });
      const append = panel.getByRole('button', { name: 'Append to later note draft' });
      expect(append).toBeDisabled();
      await user.click(review);
      fireEvent.change(draft, { target: { value: 'The library opens at 9 a.m.' } });
      expect(append).toBeDisabled();
      await user.click(review);
      await user.click(append);
      const main = within(screen.getByRole('main'));
      expect(main.getByRole('textbox', { name: 'Later note' })).toHaveValue(
        'Existing later note.\n\nThe library opens at 9 a.m.',
      );
      expect(save).not.toHaveBeenCalled();
      await user.click(main.getByRole('button', { name: 'Save notes' }));
      await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith(uid, caseRecord, {
        earlier: 'Earlier note text.',
        later: 'Existing later note.\n\nThe library opens at 9 a.m.',
      }));
    } finally {
      network.mockRestore();
      playback.mockRestore();
      save.mockRestore();
      cases.mockRestore();
      session.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('renders exact assistant evidence and clears it on abstention or unverified output', async () => {
    const user = userEvent.setup();
    const fetch = globalThis.fetch;
    const responses = [
      { mode: 'synthetic-test', note: 'earlier', status: 'answered', evidence: [
        { medication: 'Lisinopril', excerpt: 'Lisinopril 10 mg daily' },
      ] },
      { mode: 'synthetic-test', note: 'later', status: 'abstained' },
      { mode: 'synthetic-test', note: 'earlier', status: 'answered', evidence: [
        { medication: 'Lisinopril', excerpt: 'Lisinopril 20 mg daily' },
      ] },
    ];
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      input === '/api/assistant' ? Promise.resolve(Response.json(responses.shift())) : fetch(input, init),
    );
    try {
      render(<Home />);
      await user.click(within(getPatientsGroup()).getByRole('button', { name: /Morgan Lee/ }));
      const panel = within(screen.getByRole('region', { name: 'Note assistant' }));
      await user.click(panel.getByRole('button', { name: /Note assistant/ }));
      await user.click(panel.getByRole('button', { name: 'Check demo earlier note' }));
      const evidence = await panel.findByRole('list', { name: 'Medication evidence' });
      expect(evidence).toHaveTextContent('Demo earlier note');
      expect(within(evidence).getByText('Lisinopril 10 mg daily', { selector: 'blockquote' })).toBeInTheDocument();
      expect(panel.getByRole('status')).toHaveTextContent('Synthetic test response');

      await user.click(panel.getByRole('button', { name: 'Check demo discharge note' }));
      await waitFor(() => expect(panel.getByRole('status')).toHaveTextContent('Abstained'));
      expect(panel.queryByRole('list')).not.toBeInTheDocument();

      await user.click(panel.getByRole('button', { name: 'Check demo earlier note' }));
      await waitFor(() => expect(panel.getByRole('status')).toHaveTextContent('could not be verified'));
      expect(panel.queryByRole('list')).not.toBeInTheDocument();
    } finally {
      request.mockRestore();
    }
  });

  it('preserves edited notes when replacing them with encounter notes is canceled', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      render(<Home />);
      await user.click(within(getLeftNav()).getByRole('button', { name: 'Compare notes' }));
      const earlierNote = document.getElementById('earlier-note') as HTMLTextAreaElement;
      await user.clear(earlierNote);
      await user.type(earlierNote, 'An edited example note.');
      await user.click(within(getPatientsGroup()).getByRole('button', { name: /Morgan Lee/ }));
      const loadNotes = screen.getByRole('button', { name: 'Load notes in Compare' });

      await user.click(loadNotes);
      expect(confirm).toHaveBeenCalledOnce();
      expect(screen.getByRole('heading', { level: 1, name: 'Morgan Lee' })).toBeVisible();
      await user.click(within(getLeftNav()).getByRole('button', { name: 'Compare notes' }));
      expect(document.getElementById('earlier-note')).toHaveValue('An edited example note.');

      confirm.mockReturnValue(true);
      await user.click(within(getPatientsGroup()).getByRole('button', { name: /Morgan Lee/ }));
      await user.click(screen.getByRole('button', { name: 'Load notes in Compare' }));
      expect((document.getElementById('earlier-note') as HTMLTextAreaElement).value).toContain('Lisinopril 10 mg daily');
    } finally {
      confirm.mockRestore();
    }
  });

  it('opens Home by default and gives the seven workspace screens distinct widget controls', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.tab();
    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    expect(screen.queryByText('Fictional workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Synthetic evaluation')).not.toBeInTheDocument();
    const signatures = new Set<string>();
    const recordWidgets = (name: string) => {
      const grid = screen.getByRole('region', { name });
      const titles = within(grid).getAllByRole('heading', { level: 3 });
      expect(titles).toHaveLength(3);
      expect(within(grid).getByRole('button', { name: 'Add widgets' })).toBeVisible();
      expect(screen.getByRole('heading', { level: 1 }).compareDocumentPosition(grid) &
        Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      signatures.add(titles.map((title) => title.textContent).join('|'));
    };
    recordWidgets('Workspace overview');

    await user.click(screen.getByRole('button', { name: 'Open patient' }));
    recordWidgets('Patient summary');
    expect(within(getPatientsGroup()).getAllByRole('button')).toHaveLength(1);
    const transcript = screen.getByRole('region', { name: 'Encounter transcript' });
    expect(transcript).toHaveTextContent('Yes, you can record it.');
    await user.click(within(transcript).getByRole('button', { name: 'Load notes in Compare' }));
    expect((screen.getByLabelText(/Earlier note/i) as HTMLTextAreaElement).value).toContain('Lisinopril 10 mg daily');
    expect((screen.getByLabelText(/Discharge note/i) as HTMLTextAreaElement).value).toContain('Lisinopril 20 mg daily');
    recordWidgets('Comparison tools');
    expect(document.getElementById('extraction-status')).toHaveTextContent('Standby · local extractor');
    expect(screen.getByRole('button', { name: 'Palette · Graphite' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check service' }));
    expect(getLiveNavAnnouncement()).toHaveTextContent('Local rule-based extractor ready');

    for (const [page, widgets] of [
      ['Snapshot review', 'Snapshot tools'],
      ['Review suggestions', 'Suggestion tools'],
      ['Session activity', 'Activity tools'],
      ['AI chat', 'Chat widgets'],
    ]) {
      await user.click(within(getLeftNav()).getByRole('button', { name: new RegExp('^' + page) }));
      recordWidgets(widgets);
      expect(screen.queryByRole('region', { name: 'Clinical cockpit widgets' })).not.toBeInTheDocument();
    }
    expect(signatures.size).toBe(7);
  });

  it('customizes each workspace independently and keeps keyboard focus on the moved widget', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const home = () => within(screen.getByRole('region', { name: 'Workspace overview' }));
    const titles = () => home().getAllByRole('article').map((card) => within(card).getByRole('heading').textContent);
    const defaults = titles();
    const name = 'Ask about a patient';

    await user.click(home().getByRole('button', { name: 'Add widgets' }));
    await user.click(home().getByRole('button', { name: `Add ${name}` }));
    const grip = home().getByRole('button', { name: `Reorder ${name}` });
    expect(grip).toHaveFocus();
    expect(titles()).toEqual([...defaults, name]);
    expect(home().queryByRole('button', { name: `Add ${name}` })).not.toBeInTheDocument();
    await user.keyboard('{ArrowUp}');
    expect(grip).toHaveFocus();
    expect(titles()).toEqual([...defaults.slice(0, -1), name, defaults.at(-1)]);

    await openCompare(user);
    const compare = within(screen.getByRole('region', { name: 'Comparison tools' }));
    expect(compare.queryByRole('button', { name: `Reorder ${name}` })).not.toBeInTheDocument();
    await user.click(within(getWorkspaceNav()).getByRole('button', { name: 'Home' }));
    expect(titles()).toEqual([...defaults.slice(0, -1), name, defaults.at(-1)]);

    await user.click(home().getByRole('button', { name: 'Add widgets' }));
    await user.click(home().getByRole('button', { name: `Remove ${name}` }));
    const add = home().getByRole('button', { name: `Add ${name}` });
    expect(add).toHaveFocus();
    await user.click(add);
    await user.click(home().getByRole('button', { name: 'Reset widget layout' }));
    expect(titles()).toEqual(defaults);
  });

  it('saves fictional patients and drafts across reloads without sending them to an API', async () => {
    const user = userEvent.setup();
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    try {
      const { unmount } = render(<Home />);
      expect(within(getPatientsGroup()).getAllByRole('button')).toHaveLength(1);
      expect(within(getPatientsGroup()).getByRole('button', { name: /Morgan Lee/ })).toBeVisible();
      expect(within(getWorkspaceNav()).queryByRole('button', { name: /evaluation/i })).not.toBeInTheDocument();

      const addPatient = async (name: string) => {
        await user.click(within(getLeftNav()).getByRole('button', { name: 'Add patient' }));
        const input = await screen.findByRole('textbox', { name: 'Patient name' });
        expect(input).toHaveFocus();
        await user.type(input, name);
        await user.click(screen.getByRole('button', { name: 'Create patient' }));
        await waitFor(() => expect(screen.getByRole('heading', { level: 1, name })).toHaveFocus());
      };

      await addPatient('Alex Example');
      expect(screen.queryByRole('region', { name: 'Encounter transcript' })).not.toBeInTheDocument();
      await openCompare(user);
      const earlier = screen.getByLabelText(/Earlier note/i);
      const later = screen.getByLabelText(/Later note/i);
      expect(earlier).toHaveValue('');
      expect(later).toHaveValue('');
      await user.type(earlier, 'Lisinopril 10 mg daily');
      await user.type(later, 'Lisinopril 20 mg daily');
      expect(earlier).toHaveValue('Lisinopril 10 mg daily');
      expect(later).toHaveValue('Lisinopril 20 mg daily');
      await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Compare notes' }));
      const result = await screen.findByRole('region', { name: 'Mention differences' });
      expect(result).toHaveTextContent('Lisinopril 10 mg daily');
      expect(result).toHaveTextContent('Lisinopril 20 mg daily');

      await addPatient('Jules Example');
      await openCompare(user);
      expect(screen.getByLabelText(/Earlier note/i)).toHaveValue('');
      expect(screen.getByLabelText(/Later note/i)).toHaveValue('');
      await user.click(within(getPatientsGroup()).getByRole('button', { name: /Alex Example/ }));
      await openCompare(user);
      expect(screen.getByRole('textbox', { name: 'Earlier note' })).toHaveValue('Lisinopril 10 mg daily');
      expect(screen.getByRole('textbox', { name: 'Later note' })).toHaveValue('Lisinopril 20 mg daily');
      expect(screen.getByRole('region', { name: 'Mention differences' })).toHaveTextContent('Lisinopril 20 mg daily');
      unmount();
      render(<Home />);
      await user.click(within(getPatientsGroup()).getByRole('button', { name: /Alex Example/ }));
      await openCompare(user);
      expect(screen.getByRole('textbox', { name: 'Earlier note' })).toHaveValue('Lisinopril 10 mg daily');
      expect(screen.getByRole('textbox', { name: 'Later note' })).toHaveValue('Lisinopril 20 mg daily');
      expect(screen.queryByRole('region', { name: 'Mention differences' })).not.toBeInTheDocument();
      expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    } finally {
      request.mockRestore();
    }
  });

  it('supports the bundled comparison, validation, quote highlights, review decisions, and Session activity logging', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await openCompare(user);

    const main = screen.getByRole('main');
    const earlierBox = screen.getByLabelText(/Earlier note/i);
    const laterBox = screen.getByLabelText(/Discharge note/i);
    expect(screen.queryByLabelText('Note preset')).not.toBeInTheDocument();

    // Clear notes -> validation error on empty submit
    await user.click(screen.getByRole('button', { name: 'Clear notes' }));
    expect(earlierBox).toHaveValue('');
    expect(laterBox).toHaveValue('');

    await user.click(within(main).getByRole('button', { name: 'Compare notes' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Each note needs between 1 and 12,000 characters.',
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

    // Verify all comparison & review actions were logged in Session activity
    await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Session activity/i }));
    const auditHeading = screen.getByRole('heading', { level: 1, name: 'Session activity' });
    await waitFor(() => expect(auditHeading).toHaveFocus());

    expect(screen.getByText('Flagged mention for clarification')).toBeInTheDocument();
    expect(screen.getByText('Reviewed mention')).toBeInTheDocument();
    expect(screen.getByText('Cleared mention review', { selector: '.row.audit span' })).toBeInTheDocument();
    expect(screen.getByText('Local standby', { selector: '.row.audit span' })).toBeInTheDocument();
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
      await openCompare(user);
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
    await openSnapshot(user);

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

  it('supports Review suggestions, Session activity CSV/JSON export, and model connections', async () => {
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

      // Developer settings: Test all, New connection, Contracts
      await user.click(within(getLeftNav()).getByRole('button', { name: 'Developer settings' }));
      const modelsH1 = screen.getByRole('heading', { level: 1, name: 'Developer settings' });
      await waitFor(() => expect(modelsH1).toHaveFocus());

      await user.click(screen.getByRole('button', { name: 'Test all' }));
      expect(screen.getByText('Tested all configured connectors')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'New connection' }));
      await user.type(screen.getByLabelText('Name'), 'Local SQLite Sandbox');
      await user.click(screen.getByRole('button', { name: 'Register & test' }));
      expect(within(screen.getByRole('main')).getByText('Local SQLite Sandbox')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Contracts' }));
      expect(screen.getByRole('heading', { level: 2, name: /FHIR R4 preview/ })).toBeInTheDocument();
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

    await user.type(cmdInput, 'Session activity');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Session activity' })).toBeInTheDocument();

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
    expect(navButtons[navButtons.length - 1]).toHaveFocus(); // Wraps to AI chat

    await user.keyboard('{ArrowLeft}');
    expect(navButtons[navButtons.length - 2]).toHaveFocus(); // Session activity

    await user.keyboard('{End}');
    expect(navButtons[navButtons.length - 1]).toHaveFocus(); // AI chat

    await user.keyboard('{ArrowDown}');
    expect(navButtons[0]).toHaveFocus(); // Wraps back to first patient

    // Activate AI chat via End + Enter
    await user.keyboard('{End}{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: 'AI chat' })).toBeInTheDocument();

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
      await openCompare(user);
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

      await user.click(within(getLeftNav()).getByRole('button', { name: 'Developer settings' }));
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
      await user.click(within(getLeftNav()).getByRole('button', { name: 'Developer settings' }));
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
    await openCompare(user);

    const diagnostics = document.querySelector('details.extract-diagnostics');
    expect(diagnostics).not.toBeNull();
    expect(diagnostics).not.toHaveAttribute('open');
    expect(screen.getByText(/Use example records only/i)).toBeInTheDocument();

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

  it('renders the CockpitWidgets wired to live state with reordering and drill-down navigation', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const cockpit = await openCockpit(user);
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
      'session-activity',
    ]);

    // Keyboard reorder button moves widget right and shows Reset layout
    await user.click(within(cockpit).getByRole('button', { name: 'Move Medication Diff Breakdown right' }));
    expect(getWidgetOrder().slice(0, 2)).toEqual(['review-progress', 'diff-breakdown']);

    await user.click(within(cockpit).getByRole('button', { name: 'Reset layout' }));
    expect(getWidgetOrder().slice(0, 2)).toEqual(['diff-breakdown', 'review-progress']);

    // HTML5 drag-and-drop reorders widgets
    const activityCard = cockpit.querySelector<HTMLElement>('[data-widget-id="session-activity"]')!;
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
    vi.spyOn(activityCard, 'getBoundingClientRect').mockReturnValue(sourceRect);
    fireEvent.dragStart(activityCard, { dataTransfer });
    const dragOverAt = (clientX: number) => {
      const event = new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      fireEvent(diffCard, event);
    };
    dragOverAt(90);
    expect(activityCard.style.order).toBe('5');
    dragOverAt(44);
    expect(activityCard.style.order).toBe('0');
    dragOverAt(50);
    expect(activityCard.style.order).toBe('0'); // A small reversal must not jitter back.
    dragOverAt(56);
    expect(activityCard.style.order).toBe('0'); // Layout motion alone must not reverse the move.
    dragOverAt(96);
    expect(activityCard.style.order).toBe('1');
    dragOverAt(24);
    expect(activityCard.style.order).toBe('0');
    fireEvent.drop(diffCard, { dataTransfer });
    fireEvent.dragEnd(activityCard);
    expect(getWidgetOrder()[0]).toBe('session-activity');

    // Canceling a drag leaves the layout unchanged.
    await user.click(within(cockpit).getByRole('button', { name: 'Reset layout' }));
    fireEvent.dragStart(activityCard, { dataTransfer });
    fireEvent.drop(diffCard, { dataTransfer });
    fireEvent.dragEnd(activityCard);
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
    await openCockpit(user);
    await user.click(within(cockpit).getByRole('button', { name: 'Provenance & Evidence Health' }));
    expect(within(screen.getByRole('group', { name: 'Filter medication differences' })).getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Drill-down: AI Triage Queue navigates to Review suggestions and updates live count after Run triage
    await openCockpit(user);
    await user.click(within(cockpit).getByRole('button', { name: 'AI Triage Queue' }));
    const triageH1 = screen.getByRole('heading', {
      level: 1,
      name: 'Suggestions waiting for a clinician',
    });
    await waitFor(() => expect(triageH1).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Run triage' }));
    await openCockpit(user);
    const triageCard = cockpit.querySelector<HTMLElement>('[data-widget-id="triage-queue"]')!;
    expect(within(triageCard).getByRole('img')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('4 open'),
    );

    // Drill-down: Session Activity -> Session activity
    await openCockpit(user);
    await user.click(within(cockpit).getByRole('button', { name: 'Session Activity' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Session activity' })).toHaveFocus(),
    );

    // Drill-down: Note Extraction & Model Socket -> Models and data
    await openCockpit(user);
    await user.click(within(cockpit).getByRole('button', { name: 'Note Extraction & Model Socket' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Developer settings' })).toHaveFocus(),
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
      const cockpit = await openCockpit(user);
      const reviewCard = cockpit.querySelector<HTMLElement>('[data-widget-id="review-progress"]')!;
      await waitFor(() => {
        expect(within(reviewCard).getByRole('img')).toHaveAttribute(
          'aria-label',
          expect.stringContaining('1 of 4 reviewed'),
        );
      });

      await openSnapshot(user);
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
      await openSnapshot(user);
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

    const cockpit = await openCockpit(user);
    const provenanceCard = cockpit.querySelector<HTMLElement>('[data-widget-id="provenance-health"]')!;

    // 1. Morgan Lee (DEMO-001): select Lisinopril directly from provenance-health
    const lisinoprilTrigger = within(provenanceCard).getByRole('button', { name: /Lisinopril/i });
    await user.click(lisinoprilTrigger);

    const evidenceRegion = screen.getByLabelText('Evidence and provenance for Lisinopril');
    await waitFor(() => expect(evidenceRegion).toHaveFocus());
    expect(evidenceRegion).toHaveTextContent('Outpatient medication list');
    expect(evidenceRegion).toHaveTextContent('2026-10-01');
    expect(evidenceRegion).toHaveTextContent('Discharge medication list');
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

    // An omitted medication stays unknown when no source documents its absence.
    const aspirinTrigger = within(provenanceCard).getByRole('button', { name: /Aspirin/i });
    await user.click(aspirinTrigger);
    const aspirinEvidence = screen.getByLabelText('Evidence and provenance for Aspirin');
    expect(aspirinEvidence).toHaveTextContent(/Later side: Not listed in Snapshot B/i);
    expect(aspirinEvidence).not.toHaveTextContent('Documented negative');
  });

  it('shows the four evidence states in the widget and the selected Snapshot review', async () => {
    const user = userEvent.setup();
    const originalEarlierLinks = earlier.evidenceLinks;
    const originalLaterLinks = later.evidenceLinks;

    earlier.evidenceLinks = [
      {
        id: 'lisinopril-clinic',
        medicationId: 'm1',
        noteId: 'earlier-clinic-note',
        sourceLabel: 'Clinic note',
        excerpt: 'Lisinopril 10 mg daily.',
        contradictsEvidenceIds: ['lisinopril-pharmacy'],
      },
      {
        id: 'lisinopril-pharmacy',
        medicationId: 'm1',
        noteId: 'earlier-pharmacy-note',
        sourceLabel: 'Pharmacy note',
        excerpt: 'Lisinopril 20 mg daily.',
      },
    ];
    later.evidenceLinks = [
      {
        medicationId: 'm2',
        resolutionStatus: 'unresolved',
        excerpt: 'Unresolved Metformin sample text.',
      },
      {
        medicationId: 'm4',
        sourceId: 'external-report',
        sourceKind: 'external_record',
        resolutionStatus: 'unavailable',
        excerpt: 'Unavailable Atorvastatin sample text.',
      },
      {
        medicationId: 'm3',
        noteId: 'discharge-note',
        sourceLabel: 'Discharge note',
        documentedAbsence: true,
        excerpt: 'The patient is no longer taking Aspirin.',
      },
    ];

    try {
      render(<Home />);
      const cockpit = await openCockpit(user);
      const card = within(cockpit.querySelector('[data-widget-id="provenance-health"]')!);
      const states = [
        ['Metformin', 'Missing reference', [], 'Unresolved Metformin sample text.'],
        ['Atorvastatin', 'Unavailable document', [], 'Unavailable Atorvastatin sample text.'],
        ['Aspirin', 'Documented negative', ['The patient is no longer taking Aspirin.']],
        ['Lisinopril', 'Conflicting excerpts', ['Lisinopril 10 mg daily.', 'Lisinopril 20 mg daily.']],
      ] as const;
      for (const [name, state, excerpts, hiddenExcerpt] of states) {
        const trigger = card.getByRole('button', { name: new RegExp(name + '.*' + state, 'i') });
        await user.click(trigger);
        const evidence = screen.getByRole('region', { name: 'Evidence and provenance for ' + name });
        expect(evidence).toHaveTextContent(state);
        for (const excerpt of excerpts) {
          expect(evidence).toHaveTextContent(excerpt);
        }
        if (hiddenExcerpt) {
          expect(evidence).not.toHaveTextContent(hiddenExcerpt);
        }
        const conflicts = within(evidence).queryByRole('region', { name: /Conflicting source excerpts/ });
        if (name === 'Lisinopril') {
          expect(conflicts).toBeInTheDocument();
          const [clinic, pharmacy] = within(conflicts!).getAllByRole('figure');
          expect(clinic).toHaveTextContent('Earlier · Clinic note');
          expect(clinic).toHaveTextContent('Lisinopril 10 mg daily.');
          expect(pharmacy).toHaveTextContent('Earlier · Pharmacy note');
          expect(pharmacy).toHaveTextContent('Lisinopril 20 mg daily.');
          const group = screen.getByRole('group', { name: 'Review Lisinopril' });
          const flag = within(group).getByRole('button', { name: 'Flag' });
          await user.click(flag);
          expect(flag).toHaveAttribute('aria-pressed', 'true');
        } else {
          expect(conflicts).not.toBeInTheDocument();
        }
        await user.click(within(evidence).getByRole('button', { name: 'Back to evidence widget' }));
        await waitFor(() => expect(trigger).toHaveFocus());
      }
    } finally {
      earlier.evidenceLinks = originalEarlierLinks;
      later.evidenceLinks = originalLaterLinks;
    }
  });

  it('jumps between cited mentions in Note navigator while keeping note identity, timestamp, and source position visible', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const cockpit = await openCockpit(user);
    const provenanceCard = cockpit.querySelector<HTMLElement>('[data-widget-id="provenance-health"]')!;
    const lisinoprilTrigger = within(provenanceCard).getByRole('button', { name: /Lisinopril/i });
    await user.click(lisinoprilTrigger);

    const noteNav = screen.getByRole('region', { name: 'Note navigator for Lisinopril' });
    expect(noteNav).toHaveTextContent('Citation 1 of 2');
    expect(noteNav).toHaveTextContent('Outpatient medication list');
    expect(noteNav).toHaveTextContent('2026-10-01');
    expect(noteNav).toHaveTextContent('earlier snapshot');

    const prevBtn = within(noteNav).getByRole('button', { name: 'Previous citation' });
    const nextBtn = within(noteNav).getByRole('button', { name: 'Next citation' });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();

    await user.click(nextBtn);
    expect(noteNav).toHaveTextContent('Citation 2 of 2');
    expect(noteNav).toHaveTextContent('Discharge medication list');
    expect(noteNav).toHaveTextContent('2026-10-15');
    expect(noteNav).toHaveTextContent('later snapshot');
    expect(nextBtn).toBeDisabled();
    expect(prevBtn).toBeEnabled();

    const evidenceRegion = screen.getByLabelText('Evidence and provenance for Lisinopril');
    const items = within(evidenceRegion).getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    expect(items[0]).not.toHaveAttribute('aria-current');

    await user.click(prevBtn);
    expect(noteNav).toHaveTextContent('Citation 1 of 2');
    expect(noteNav).toHaveTextContent('Outpatient medication list');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
  });

  it('renders chronological Encounter timeline and separate Undated records in Snapshot review', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await openSnapshot(user);
    const tablist = screen.getByRole('tablist', { name: 'Snapshot review tabs' });
    const timelineTab = within(tablist).getByRole('tab', { name: 'Encounter timeline' });
    await user.click(timelineTab);
    expect(timelineTab).toHaveAttribute('aria-selected', 'true');

    const datedSec = screen.getByRole('region', { name: 'Chronological encounter timeline' });
    const datedItems = within(datedSec).getAllByRole('listitem');
    expect(datedItems[0]).toHaveTextContent('2026-10-01');
    expect(datedItems[0]).toHaveTextContent('Outpatient medication list');
    expect(datedItems[1]).toHaveTextContent('2026-10-15');
    expect(datedItems[1]).toHaveTextContent('Discharge medication list');

    const undatedSec = screen.getByRole('region', { name: 'Undated records' });
    expect(undatedSec).toHaveTextContent('No undated records in this comparison.');

    // Inspect change button jumps directly to the expanded medication evidence
    const inspectBtns = within(datedSec).getAllByRole('button', { name: 'Inspect change' });
    await user.click(inspectBtns[0]);
    const evidenceRegion = screen.getByLabelText('Evidence and provenance for Lisinopril');
    await waitFor(() => expect(evidenceRegion).toHaveFocus());
  });

  it('keeps chat proposals in their own patient and waits for fresh manual review before applying', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(within(getLeftNav()).getByRole('button', { name: 'Add patient' }));
    await user.type(screen.getByRole('textbox', { name: 'Patient name' }), 'Alex Fictional');
    await user.click(screen.getByRole('button', { name: 'Create patient' }));
    await user.click(within(getWorkspaceNav()).getByRole('button', { name: 'AI chat' }));
    const chat = within(screen.getByRole('region', { name: 'AI chat' }));
    const patient = chat.getByRole('combobox', { name: 'Patient' });
    const localPatientId = (patient as HTMLSelectElement).value;
    expect(localPatientId).toMatch(/^LOCAL-[A-F0-9]{12}$/);
    expect(within(patient).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Morgan Lee · DEMO-001', `Alex Fictional · ${localPatientId}`,
    ]);
    await user.selectOptions(patient, 'scenario-morgan-lee-baseline');
    expect(patient).toHaveValue('scenario-morgan-lee-baseline');
    const ask = async (text: string) => {
      await user.type(chat.getByRole('textbox', { name: /^Ask about/ }), text);
      await user.click(chat.getByRole('button', { name: 'Send' }));
    };
    const preview = async () => {
      expect(chat.getByRole('textbox', { name: 'Documented value' })).toHaveValue('15 mg');
      await user.type(chat.getByRole('textbox', { name: 'Source reference' }), 'Signed demo reconciliation');
      await user.click(chat.getByRole('button', { name: 'Review proposal' }));
      expect(chat.getByRole('button', { name: 'Approve and apply' })).toBeDisabled();
      expect(chat.getByRole('region', { name: 'Chart correction' })).toHaveTextContent('20 mg');
    };

    await ask('Correct the chart: Lisinopril dose to 15 mg');
    await preview();
    await user.click(chat.getByRole('checkbox', { name: /I verified/ }));
    await user.selectOptions(patient, localPatientId);
    expect(chat.queryByRole('button', { name: 'Approve and apply' })).not.toBeInTheDocument();
    await ask('What medications are documented?');
    const added = chat.getByRole('log', { name: 'Conversation for Alex Fictional' });
    expect(added).toHaveTextContent('What medications are documented?');
    expect(added).not.toHaveTextContent('Lisinopril');
    expect(within(added).queryByRole('list', { name: 'Chart sources' })).not.toBeInTheDocument();
    const request = vi.spyOn(globalThis, 'fetch');
    try {
      await ask('Can you clarify that?');
      expect(added).toHaveTextContent('Which medication and source should I check?');
      expect(request).not.toHaveBeenCalledWith('/api/patient-chat', expect.anything());
    } finally {
      request.mockRestore();
    }

    await user.selectOptions(patient, 'scenario-morgan-lee-baseline');
    expect(patient).toHaveValue('scenario-morgan-lee-baseline');
    await ask('Correct the chart: Lisinopril dose to 15 mg');
    await preview();
    await user.click(chat.getByRole('checkbox', { name: /I verified/ }));
    await user.click(chat.getByRole('button', { name: 'Edit proposal' }));
    await user.click(chat.getByRole('button', { name: 'Review proposal' }));
    expect(chat.getByRole('button', { name: 'Approve and apply' })).toBeDisabled();
    await user.click(chat.getByRole('checkbox', { name: /I verified/ }));
    await user.click(chat.getByRole('button', { name: 'Approve and apply' }));
    await ask('What dose of Lisinopril is documented?');
    const morgan = chat.getByRole('log', { name: 'Conversation for Morgan Lee' });
    expect(within(morgan).getByRole('list', { name: 'Chart sources' })).toHaveTextContent('Reviewed dose correction from 20 mg to 15 mg');
    expect(morgan).not.toHaveTextContent('What medications are documented?');
  });

  it('keeps the same patient and date window across chart workflows', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(within(getPatientsGroup()).getByRole('button', { name: /Morgan Lee/ }));
    const chartContext = () => screen.getByRole('region', { name: 'Active patient and encounter context' });
    const expectMorganContext = () => {
      expect(chartContext()).toHaveTextContent('Morgan Lee');
      expect(chartContext()).toHaveTextContent('DEMO-001');
      expect(chartContext()).toHaveTextContent('2026-10-01');
      expect(chartContext()).toHaveTextContent('2026-10-15');
    };
    expectMorganContext();
    expect(screen.getByRole('region', { name: 'Note assistant' })).toHaveTextContent('Morgan Lee · DEMO-001');
    await openSnapshot(user);
    const tabs = screen.getByRole('tablist', { name: 'Snapshot review tabs' });
    await user.click(within(tabs).getByRole('tab', { name: 'Encounter timeline' }));
    expectMorganContext();
    await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Review suggestions/ }));
    expectMorganContext();
  });

  it('searches synthetic notes and results, labels sources, and opens the exact match', async () => {
    const user = userEvent.setup();
    render(<Home />);
    await openCompare(user);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    const searchRegion = screen.getByRole('search', { name: 'Chart search' });
    const searchInput = within(searchRegion).getByRole('searchbox', {
      name: 'Search notes and results',
    });

    await user.type(searchInput, 'Atorvastatin');

    const matchList = within(searchRegion).getByRole('list', { name: 'Chart search matches' });
    expect(matchList).toHaveTextContent('Later note · Discharge note');
    expect(matchList).toHaveTextContent('Medication diff · Discharge medication list');

    // Open the exact Snapshot diff match for Atorvastatin
    const diffMatchBtn = within(matchList).getByRole('button', {
      name: /Medication diff.*Atorvastatin/i,
    });
    await user.click(diffMatchBtn);

    const evidenceRegion = screen.getByLabelText('Evidence and provenance for Atorvastatin');
    await waitFor(() => expect(evidenceRegion).toHaveFocus());

    // Clear search returns focus to the search input
    const clearBtn = within(searchRegion).getByRole('button', { name: 'Clear' });
    await user.click(clearBtn);
    expect(searchInput).toHaveValue('');
    expect(searchInput).toHaveFocus();
  });

  it('lists notes by source and date in Document index and surfaces counts', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await openSnapshot(user);
    const tablist = screen.getByRole('tablist', { name: 'Snapshot review tabs' });
    const docsTab = within(tablist).getByRole('tab', { name: 'Document index' });
    await user.click(docsTab);
    expect(docsTab).toHaveAttribute('aria-selected', 'true');

    const counts = screen.getByLabelText('Document index counts');
    expect(counts).toHaveTextContent('2 documents');
    expect(counts).toHaveTextContent('0 revisions');
    expect(counts).toHaveTextContent('0 duplicates');
    expect(counts).toHaveTextContent('0 unavailable');

    const datedDocs = screen.getByRole('region', { name: 'Document index by source and date' });
    const items = within(datedDocs).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('2026-10-01');
    expect(items[0]).toHaveTextContent('Outpatient medication list');
    expect(items[1]).toHaveTextContent('2026-10-15');
    expect(items[1]).toHaveTextContent('Discharge medication list');
  });

  it('opens a synthetic outside report with origin and import date prominently visible and returns focus on close', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await openSnapshot(user);
    const tablist = screen.getByRole('tablist', { name: 'Snapshot review tabs' });
    await user.click(within(tablist).getByRole('tab', { name: 'Document index' }));

    const outsideSec = screen.getByRole('region', { name: 'Outside reports' });
    const openBtn = within(outsideSec).getByRole('button', { name: 'Open outside report' });
    await user.click(openBtn);

    const viewer = screen.getByRole('region', {
      name: 'External record viewer: Outside pharmacy and clinic summary',
    });
    await waitFor(() => expect(viewer).toHaveFocus());
    expect(viewer).toHaveTextContent('Origin');
    expect(viewer).toHaveTextContent('Westside Pharmacy Exchange');
    expect(viewer).toHaveTextContent('Import date');
    expect(viewer).toHaveTextContent('2026-10-16T09:30:00Z');
    expect(viewer).toHaveTextContent('Read-only');

    await user.click(within(viewer).getByRole('button', { name: 'Close outside report' }));
    await waitFor(() => expect(openBtn).toHaveFocus());
    expect(
      screen.queryByRole('region', {
        name: 'External record viewer: Outside pharmacy and clinic summary',
      }),
    ).not.toBeInTheDocument();
  });

  it('supports optional widget placement and Restore defaults through accessible layout controls', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const cockpit = await openCockpit(user);
    const getWidgetOrder = () =>
      Array.from(cockpit.querySelectorAll<HTMLElement>('[data-widget-id]')).map(
        (el) => el.dataset.widgetId,
      );

    const placementBtn = within(cockpit).getByRole('button', { name: 'Placement' });
    await user.click(placementBtn);
    expect(placementBtn).toHaveAttribute('aria-expanded', 'true');

    const panel = within(cockpit).getByRole('region', { name: 'Widget placement controls' });

    // Place Provenance & Evidence Health first
    await user.click(within(panel).getByRole('button', { name: 'Place Provenance & Evidence Health first' }));
    expect(getWidgetOrder()[0]).toBe('provenance-health');

    // Hide AI Triage Queue
    await user.click(within(panel).getByRole('button', { name: 'Hide AI Triage Queue' }));
    expect(getWidgetOrder()).not.toContain('triage-queue');
    expect(getWidgetOrder()).toHaveLength(5);

    // Restore defaults restores order, all six widgets, and returns focus to Placement toggle
    await user.click(within(panel).getByRole('button', { name: 'Restore defaults' }));
    expect(getWidgetOrder()).toEqual([
      'diff-breakdown',
      'review-progress',
      'provenance-health',
      'triage-queue',
      'model-socket',
      'session-activity',
    ]);
    await waitFor(() => expect(placementBtn).toHaveFocus());
  });

  it('links simulated review decisions in Session activity to their item and timestamp', async () => {
    const user = userEvent.setup();
    render(<Home />);

    // Make a simulated review decision on Lisinopril
    await openSnapshot(user);
    const lisinoprilGroup = screen.getByRole('group', { name: 'Review Lisinopril' });
    await user.click(within(lisinoprilGroup).getByRole('button', { name: 'Verify' }));

    // Cockpit Session Activity widget shows the linked decision with timestamp
    const cockpit = await openCockpit(user);
    const sessionCard = cockpit.querySelector<HTMLElement>('[data-widget-id="session-activity"]')!;
    const widgetDecisionBtn = within(sessionCard).getByRole('button', {
      name: /Marked verified · Morgan Lee · Lisinopril/i,
    });
    expect(widgetDecisionBtn).toBeInTheDocument();

    // Navigate to Session activity log -> verify timestamp and clickable item link
    await user.click(within(getWorkspaceNav()).getByRole('button', { name: /^Session activity/i }));
    const trail = document.getElementById('o-trail')!;
    const auditLink = within(trail).getByRole('button', {
      name: /Open Morgan Lee · Lisinopril from Marked verified/i,
    });
    expect(auditLink.closest('li')).toHaveTextContent(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z/);

    // Activating the decision link navigates directly to Lisinopril's expanded evidence
    await user.click(auditLink);
    const evidenceRegion = screen.getByLabelText('Evidence and provenance for Lisinopril');
    await waitFor(() => expect(evidenceRegion).toHaveFocus());
  });

  it('groups unresolved medication changes into Added, Removed, Changed, and Unclear in Worklist', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await openSnapshot(user);
    const tablist = screen.getByRole('tablist', { name: 'Snapshot review tabs' });
    const worklistTab = within(tablist).getByRole('tab', { name: 'Worklist' });
    await user.click(worklistTab);
    expect(worklistTab).toHaveAttribute('aria-selected', 'true');

    const counts = screen.getByLabelText('Reconciliation worklist counts');
    expect(counts).toHaveTextContent('4 unresolved');
    expect(counts).toHaveTextContent('0 reviewed');

    expect(screen.getByRole('region', { name: 'Added medications' })).toHaveTextContent('Atorvastatin');
    expect(screen.getByRole('region', { name: 'Removed medications' })).toHaveTextContent('Aspirin');
    const changedSec = screen.getByRole('region', { name: 'Changed medications' });
    expect(changedSec).toHaveTextContent('Lisinopril');
    const unclearSec = screen.getByRole('region', { name: 'Unclear medications' });
    expect(unclearSec).toHaveTextContent('Metformin');
    expect(unclearSec).toHaveTextContent('Missing regimen detail');

    // Inspect & review jumps directly to the item's expanded evidence
    await user.click(within(changedSec).getByRole('button', { name: 'Inspect & review' }));
    const evidenceRegion = screen.getByLabelText('Evidence and provenance for Lisinopril');
    await waitFor(() => expect(evidenceRegion).toHaveFocus());
  });

  it('shows before/after regimen dose, route, frequency, status, and direct evidence jump', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await openSnapshot(user);
    const lisBtn = screen
      .getAllByRole('button', { name: /Lisinopril/i })
      .find((btn) => btn.closest('.entry'));
    expect(lisBtn).toBeTruthy();
    const lisRow = lisBtn!.closest('.entry') as HTMLElement;
    await user.click(lisBtn!);

    const regimenSection = within(lisRow).getByRole('region', {
      name: 'Before/after regimen for Lisinopril',
    });
    expect(regimenSection).toHaveTextContent('Dose');
    expect(regimenSection).toHaveTextContent('10 mg');
    expect(regimenSection).toHaveTextContent('20 mg');
    expect(regimenSection).toHaveTextContent('Route');
    expect(regimenSection).toHaveTextContent('oral');
    expect(regimenSection).toHaveTextContent('Frequency');
    expect(regimenSection).toHaveTextContent('daily');
    expect(regimenSection).toHaveTextContent('Status');
    expect(regimenSection).toHaveTextContent('Unverified');
    expect(regimenSection).toHaveTextContent('Earlier direct evidence');
    expect(regimenSection).toHaveTextContent('Later direct evidence');

    await user.click(within(regimenSection).getByRole('button', { name: 'Jump to evidence' }));
    const evidenceRegion = within(lisRow).getByLabelText('Evidence and provenance for Lisinopril');
    await waitFor(() => expect(evidenceRegion).toHaveFocus());
  });

  it('shows dated medication history entries and flags unknown-date entries separately', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await openSnapshot(user);
    const lisBtn = screen
      .getAllByRole('button', { name: /Lisinopril/i })
      .find((btn) => btn.closest('.entry'));
    expect(lisBtn).toBeTruthy();
    const lisRow = lisBtn!.closest('.entry') as HTMLElement;
    await user.click(lisBtn!);

    const historySection = within(lisRow).getByRole('region', {
      name: 'Medication history for Lisinopril',
    });
    expect(historySection).toHaveTextContent('Dated regimen entries');
    expect(historySection).toHaveTextContent('2026-10-01');
    expect(historySection).toHaveTextContent('2026-10-15');

    // Switch to a scenario with an undated snapshot to verify separate Unknown-date flagging
    const scenarioButtons = within(getPatientsGroup()).getAllByRole('button');
    const undatedScenarioBtn = scenarioButtons.find((btn) => /Missing/i.test(btn.textContent ?? ''));
    if (undatedScenarioBtn) {
      await user.click(undatedScenarioBtn);
      const firstEntryBtn = document.querySelector('.entry .entry-h') as HTMLElement | null;
      if (firstEntryBtn) {
        await user.click(firstEntryBtn);
        const entryEl = firstEntryBtn.closest('.entry') as HTMLElement;
        const medHistory = entryEl.querySelector('.med-history') as HTMLElement;
        expect(medHistory).toBeTruthy();
        if (medHistory.textContent?.includes('Unknown-date entries')) {
          expect(medHistory).toHaveTextContent('Date unknown');
        }
      }
    }
  });

  it('traces encounter transcript utterances directly to earlier note, discharge note, and Aspirin snapshot evidence', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(within(getPatientsGroup()).getByRole('button', { name: /Morgan Lee/ }));
    const transcript = screen.getByRole('region', { name: 'Encounter transcript' });
    expect(transcript).toHaveTextContent('Recording consent at 00:08');

    await user.click(within(transcript).getByRole('button', { name: /Trace to discharge note/i }));
    await waitFor(() => expect(screen.getByLabelText(/Discharge note/i)).toHaveFocus());

    await user.click(within(getPatientsGroup()).getByRole('button', { name: /Morgan Lee/ }));
    const transcriptAgain = screen.getByRole('region', { name: 'Encounter transcript' });
    await user.click(
      within(transcriptAgain).getByRole('button', { name: /Trace Aspirin in Snapshot review/i }),
    );
    const aspirinEvidence = screen.getByLabelText('Evidence and provenance for Aspirin');
    await waitFor(() => expect(aspirinEvidence).toHaveFocus());
    await user.click(within(aspirinEvidence).getByRole('button', { name: 'Back to encounter transcript' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trace Aspirin in Snapshot review' })).toHaveFocus());
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import type { CloudCase } from '@/lib/cloud-workspace';

const mocked = vi.hoisted(() => ({
  uid: undefined as string | undefined,
  cases: [] as CloudCase[],
  create: vi.fn(),
  save: vi.fn(),
  changeAccount: vi.fn(),
}));

vi.mock('@/lib/cloud-workspace', () => ({
  cloudWorkspaceEnabled: true,
  CLOUD_CASE_LIMIT: 100,
  CloudCaseConflict: class extends Error {},
  useCloudSession: () => ({ user: mocked.uid ? { uid: mocked.uid } : null, error: '', pending: false, changeAccount: mocked.changeAccount }),
  useCloudCases: () => ({ cases: mocked.cases, connected: Boolean(mocked.uid), error: '', loading: false, retry: vi.fn() }),
  createCloudCase: mocked.create,
  saveCloudCaseNotes: mocked.save,
}));

const cloudRecord = {
  id: 'SYNC-1234567890ABCDEF1234567890ABCDEF',
  name: 'Cloud reference',
  earlier: '',
  later: '',
  version: 1,
};

async function openNotes(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit patient notes' }));
}

describe('Account workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('diffmd-case-v1:LOCAL-AAAAAAAAAAAA', 'Browser reference');
    mocked.uid = 'account-a';
    mocked.cases = [];
    mocked.create.mockResolvedValue(cloudRecord);
    mocked.save.mockResolvedValue(2);
  });

  it('creates an account case without uploading browser cases or writing on each keystroke', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Home />);
    expect(screen.queryByRole('button', { name: /^Browser reference/ })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('region', { name: 'Home' })).getByRole('button', { name: 'Add patient' }));
    await user.type(screen.getByRole('textbox', { name: 'Case reference' }), cloudRecord.name);
    await user.click(screen.getByRole('button', { name: 'Create patient' }));
    expect(mocked.create).toHaveBeenCalledWith('account-a', cloudRecord.name);
    await openNotes(user);
    const earlier = screen.getByRole('textbox', { name: 'Earlier note' });
    fireEvent.change(earlier, { target: { value: 'Continue metformin 500 mg daily.' } });
    expect(mocked.save).not.toHaveBeenCalled();
    expect(localStorage.getItem(`diffmd-case-v1:${cloudRecord.id}:earlier`)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(mocked.save).toHaveBeenCalledWith('account-a', cloudRecord, { earlier: 'Continue metformin 500 mg daily.', later: '' });
    expect(screen.getByText('Notes are synced')).toBeInTheDocument();
    mocked.uid = undefined;
    rerender(<Home />);
    expect(screen.getByRole('button', { name: /^Browser reference/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cloud reference/ })).not.toBeInTheDocument();
  });

  it('keeps unsaved edits visible when another device changes the account note', async () => {
    const user = userEvent.setup();
    mocked.cases = [cloudRecord];
    const { rerender } = render(<Home />);
    await user.click(screen.getByRole('button', { name: /^Cloud reference/ }));
    await openNotes(user);
    const earlier = screen.getByRole('textbox', { name: 'Earlier note' });
    fireEvent.change(earlier, { target: { value: 'Unsaved edit' } });
    mocked.cases = [{ ...cloudRecord, earlier: 'Saved elsewhere', version: 2 }];
    rerender(<Home />);
    expect(earlier).toHaveValue('Unsaved edit');
    expect(screen.getByRole('alert')).toHaveTextContent('Another tab or device saved changes');
    expect(screen.getByRole('button', { name: 'Save notes' })).toBeDisabled();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await user.click(screen.getByRole('button', { name: 'Discard edits' }));
      expect(earlier).toHaveValue('Saved elsewhere');
      expect(mocked.save).not.toHaveBeenCalled();
    } finally {
      confirm.mockRestore();
    }
  });
});

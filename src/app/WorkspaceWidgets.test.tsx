import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceWidgets } from '../components/WorkspaceWidgets';

describe('workspace widget summaries', () => {
  it('uses live review counts and handles an empty comparison', () => {
    const { rerender } = render(<WorkspaceWidgets title="Patient summary" widgets={[{ title: 'Recorded decisions', value: '2 / 5' }]} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '2 of 5 reviewable changes have a decision');
    expect(screen.getByText(/3 awaiting a decision/)).toBeInTheDocument();
    rerender(<WorkspaceWidgets title="Patient summary" widgets={[{ title: 'Recorded decisions', value: '0 / 0' }]} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('No reviewable changes in this comparison.')).toBeInTheDocument();
  });
  it('shows current snapshot category counts and uses the existing filter action', () => {
    const run = vi.fn();
    render(<WorkspaceWidgets title="Snapshot tools" widgets={[
      { title: 'Dose or field changes', value: 2, action: { label: 'Filter changed fields', run } },
      { title: 'Only in earlier list', value: 1 },
      { title: 'Only in later list', value: 1 },
      { title: 'Matching entries', value: 3 },
    ]} />);
    expect(screen.getByText('7 entries')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Changed fields/ }));
    expect(run).toHaveBeenCalledOnce();
  });
});

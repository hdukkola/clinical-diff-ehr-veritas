import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EncounterWorkspaceView from '@/app/_components/EncounterWorkspaceView';
import ReviewDiffView from '@/app/_components/ReviewDiffView';
import CommitPreviewView from '@/app/_components/CommitPreviewView';
import type { WorkspaceState } from '@/lib/use-workspace';
import type { Proposal, AuditEntry } from '@/lib/types';

// Minimal mock workspace state for rendering components in isolation.
function mockWorkspace(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    note: 'Lisinopril 20 mg daily.',
    setNote: () => {},
    statements: [],
    extraction: {
      mode: 'simulated',
      medications: [],
      unresolved: [],
      disclaimer: 'Simulated deterministic parse of fictional text — not live AI inference.',
    },
    backendState: 'unknown',
    checkBackend: () => Promise.resolve(),
    proposals: [],
    decisions: {},
    edits: {},
    setDecision: () => {},
    setEditedFields: () => {},
    revalidate: () => {},
    revalidated: {},
    audit: [],
    commit: () => {},
    runExtraction: () => {},
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'prop-1',
    medication: 'Lisinopril',
    action: 'change',
    current: [
      { field: 'medication', label: 'Medication', before: 'Lisinopril', after: 'Lisinopril' },
      { field: 'dose', label: 'Dose', before: '10 mg', after: '10 mg' },
      { field: 'route', label: 'Route', before: 'oral', after: 'oral' },
      { field: 'frequency', label: 'Frequency', before: 'daily', after: 'daily' },
    ],
    proposed: [
      { field: 'medication', label: 'Medication', before: null, after: 'Lisinopril' },
      { field: 'dose', label: 'Dose', before: null, after: '20 mg' },
      { field: 'route', label: 'Route', before: null, after: 'oral' },
      { field: 'frequency', label: 'Frequency', before: null, after: 'daily' },
    ],
    diff: [{ field: 'dose', before: '10 mg', after: '20 mg' }],
    evidence: [{ text: 'Lisinopril 20 mg daily.', sourceRef: 'encounter-note', start: 0, end: 20 }],
    authority: 'chart_fact',
    uncertainty: 'low',
    gate: { passed: true, reasons: [], abstained: false },
    abstainReason: null,
    ...overrides,
  };
}

describe('EncounterWorkspaceView — mode labeling', () => {
  it('shows SIMULATED badge, never LIVE AI, since frontend extraction is deterministic', () => {
    const ws = mockWorkspace({
      extraction: { mode: 'simulated', medications: [], unresolved: [], disclaimer: 'Simulated' },
    } as unknown as WorkspaceState);
    render(<EncounterWorkspaceView ws={ws} />);
    expect(screen.getByText('SIMULATED')).toBeInTheDocument();
    expect(screen.queryByText('LIVE AI')).not.toBeInTheDocument();
  });
});

describe('ReviewDiffView — Accept/Edit/Reject gating', () => {
  it('disables Accept when evidence-sufficiency gate fails', () => {
    const proposal = makeProposal({ gate: { passed: false, reasons: ['No evidence'], abstained: false } });
    const ws = mockWorkspace({ proposals: [proposal] } as unknown as WorkspaceState);
    render(<ReviewDiffView ws={ws} />);
    const acceptBtn = screen.getByRole('button', { name: 'Accept' });
    expect(acceptBtn).toBeDisabled();
  });

  it('enables Accept when gate passes', () => {
    const ws = mockWorkspace({ proposals: [makeProposal()] } as unknown as WorkspaceState);
    render(<ReviewDiffView ws={ws} />);
    const acceptBtn = screen.getByRole('button', { name: 'Accept' });
    expect(acceptBtn).not.toBeDisabled();
  });

  it('shows evidence linked to source text', () => {
    const ws = mockWorkspace({ proposals: [makeProposal()] } as unknown as WorkspaceState);
    render(<ReviewDiffView ws={ws} />);
    expect(screen.getByText(/Lisinopril 20 mg daily/)).toBeInTheDocument();
    expect(screen.getByText(/encounter-note/)).toBeInTheDocument();
  });

  it('shows abstained banner when gate fails with diff', () => {
    const proposal = makeProposal({
      gate: { passed: false, reasons: ['Missing dose'], abstained: false },
      abstainReason: 'Missing dose',
      diff: [{ field: 'dose', before: '10 mg', after: null }],
    });
    const ws = mockWorkspace({ proposals: [proposal] } as unknown as WorkspaceState);
    render(<ReviewDiffView ws={ws} />);
    expect(screen.getByText(/Abstained/)).toBeInTheDocument();
  });
});

describe('CommitPreviewView — rejected proposals never change FHIR preview', () => {
  it('shows no FHIR preview for rejected decisions', () => {
    const audit: AuditEntry[] = [
      {
        id: 'audit-1',
        proposalId: 'prop-1',
        medication: 'Aspirin',
        decision: 'rejected',
        at: '2026-01-01T00:00:00.000Z',
        actor: 'demo-clinician',
        note: null,
        fhirPreview: null,
        revalidated: false,
      },
    ];
    const ws = mockWorkspace({ audit } as unknown as WorkspaceState);
    render(<CommitPreviewView ws={ws} />);
    expect(screen.getByText(/Rejected \(no chart change\)/)).toBeInTheDocument();
    expect(screen.queryByText(/MedicationStatement/)).not.toBeInTheDocument();
  });

  it('shows FHIR preview for accepted decisions', () => {
    const audit: AuditEntry[] = [
      {
        id: 'audit-1',
        proposalId: 'prop-1',
        medication: 'Lisinopril',
        decision: 'accepted',
        at: '2026-01-01T00:00:00.000Z',
        actor: 'demo-clinician',
        note: null,
        fhirPreview: {
          resourceType: 'MedicationStatement',
          id: 'preview-prop-1',
          status: 'active',
          medicationCodeableConcept: { text: 'Lisinopril' },
          dosage: [{ doseQuantity: { value: 20, unit: 'mg' }, route: { text: 'oral' }, frequency: { text: 'daily' }, timing: null }],
          note: 'Synthetic preview only. Not written to any EHR.',
        },
        revalidated: false,
      },
    ];
    const ws = mockWorkspace({ audit } as unknown as WorkspaceState);
    render(<CommitPreviewView ws={ws} />);
    expect(screen.getByText(/MedicationStatement/)).toBeInTheDocument();
    expect(screen.getAllByText(/Lisinopril/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Synthetic preview only/)).toBeInTheDocument();
  });
});

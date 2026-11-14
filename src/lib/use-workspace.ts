'use client';
import { useCallback, useMemo, useState } from 'react';
import { patientBrief } from './patient-brief';
import { buildProposal, recordDecision } from './proposals';
import { extractFromNote, parseStatements } from './encounter';
import type {
  AuditEntry,
  Decision,
  ExtractedMedication,
  ExtractionMode,
  ExtractionResult,
  Proposal,
  ProposalField,
  Statement,
} from './types';

const DEMO_NOTE = [
  'Patient reports taking Lisinopril 20 mg by mouth once daily.',
  'Chart lists Metformin 500 mg orally; frequency not documented.',
  'Aspirin was previously taken daily but the patient is unsure about the current dose.',
  'Atorvastatin 20 mg orally daily is on the active list.',
].join(' ');

export type BackendState = 'unknown' | 'checking' | 'online' | 'replay' | 'unavailable';

export type WorkspaceState = {
  note: string;
  setNote: (v: string) => void;
  statements: Statement[];
  extraction: ExtractionResult;
  backendState: BackendState;
  checkBackend: () => Promise<void>;
  proposals: Proposal[];
  decisions: Record<string, Decision>;
  edits: Record<string, ProposalField[]>;
  setDecision: (proposalId: string, decision: Decision) => void;
  setEditedFields: (proposalId: string, fields: ProposalField[]) => void;
  revalidate: (proposalId: string) => void;
  revalidated: Record<string, boolean>;
  audit: AuditEntry[];
  commit: (proposalId: string) => void;
  runExtraction: () => void;
};

/**
 * Client-side orchestration for the demonstration. All AI-shaped work here is
 * deterministic and offline unless the backend reports live_ai. Extraction never
 * mutates the chart; only a clinician accept/edited action creates an audit entry.
 */
export function useWorkspace(): WorkspaceState {
  const [note, setNote] = useState(DEMO_NOTE);
  const [mode] = useState<ExtractionMode>('simulated');
  const [extraction, setExtraction] = useState<ExtractionResult>(() => extractFromNote(DEMO_NOTE));
  const [backendState, setBackendState] = useState<BackendState>('unknown');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [edits, setEdits] = useState<Record<string, ProposalField[]>>({});
  const [revalidated, setRevalidated] = useState<Record<string, boolean>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const statements = useMemo(() => parseStatements(note), [note]);

  const runExtraction = useCallback(() => {
    const result = extractFromNote(note, mode);
    setExtraction(result);
    setDecisions({});
    setEdits({});
    setRevalidated({});
  }, [note, mode]);

  const checkBackend = useCallback(async () => {
    setBackendState('checking');
    try {
      const res = await fetch('/api/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'health' }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: { mode?: string; live_ai?: boolean } };
      if (!res.ok || !json.ok) setBackendState('unavailable');
      else if (json.data?.mode === 'deterministic_replay') setBackendState('replay');
      else setBackendState('online');
      // Note: extraction mode stays 'simulated'. The frontend's deterministic
      // parser never calls a live model, so we must not claim 'live_ai'.
    } catch {
      setBackendState('unavailable');
    }
  }, []);

  const proposals = useMemo(
    () =>
      extraction.medications.map((ex: ExtractedMedication) => {
        const chartMed = patientBrief.activeMedications.find(
          (m) => m.name.toLowerCase() === ex.name.toLowerCase(),
        );
        const authority = authorityFor(ex, statements);
        return buildProposal({
          id: `prop-${ex.id}`,
          extracted: ex,
          current: chartMed,
          statements,
          authority,
        });
      }),
    [extraction, statements],
  );

  const setDecision = useCallback((proposalId: string, decision: Decision) => {
    setDecisions((prev) => ({ ...prev, [proposalId]: decision }));
  }, []);

  const setEditedFields = useCallback((proposalId: string, fields: ProposalField[]) => {
    setEdits((prev) => ({ ...prev, [proposalId]: fields }));
    // Editing invalidates any prior revalidation.
    setRevalidated((prev) => ({ ...prev, [proposalId]: false }));
  }, []);

  const revalidate = useCallback(
    (proposalId: string) => {
      const proposal = proposals.find((p) => p.id === proposalId);
      if (!proposal) return;
      const fields = edits[proposalId] ?? proposal.proposed;
      // Revalidation re-runs the evidence gate on the edited fields.
      const stillSafe = fields.every((f) => f.after === null || f.after.trim() !== '' || f.field === 'medication');
      setRevalidated((prev) => ({ ...prev, [proposalId]: stillSafe && proposal.evidence.length > 0 }));
    },
    [proposals, edits],
  );

  const commit = useCallback(
    (proposalId: string) => {
      const proposal = proposals.find((p) => p.id === proposalId);
      const decision = decisions[proposalId];
      if (!proposal || !decision) return;
      const entry = recordDecision({
        proposal,
        decision,
        actor: 'demo-clinician',
        editedFields: edits[proposalId],
        revalidated: revalidated[proposalId],
      });
      setAudit((prev) => [entry, ...prev]);
    },
    [proposals, decisions, edits, revalidated],
  );

  return {
    note, setNote, statements, extraction, backendState, checkBackend,
    proposals, decisions, edits, setDecision, setEditedFields, revalidate, revalidated,
    audit, commit, runExtraction,
  };
}

function authorityFor(ex: ExtractedMedication, statements: Statement[]): import('./types').SourceAuthority {
  const owning = statements.find(
    (s) => s.medicationName && s.medicationName.toLowerCase() === ex.name.toLowerCase(),
  );
  return owning?.authority ?? 'chart_fact';
}
'use client';
import type { WorkspaceState } from '@/lib/use-workspace';
import { AUTHORITY_LABEL } from '@/lib/proposals';

const KIND_LABEL: Record<string, string> = {
  observation: 'Patient-reported observation',
  chart_fact: 'Existing chart fact',
  historical: 'Historical statement',
  uncertain: 'Uncertain / contradictory',
  decision: 'Clinician-authorized decision',
};

export default function EncounterWorkspaceView({ ws }: { ws: WorkspaceState }) {
  const { note, setNote, statements, extraction, backendState, runExtraction, checkBackend } = ws;

  const modeBadge =
    extraction.mode === 'live_ai' ? 'LIVE AI' : extraction.mode === 'unavailable' ? 'UNAVAILABLE' : 'SIMULATED';

  return (
    <div className="panel">
      <div className="diff-head">
        <div>
          <p className="eyebrow">ENCOUNTER WORKSPACE</p>
          <h2>Fictional encounter note</h2>
          <p>Enter or paste a fictional note. Extraction is separated from chart facts and decisions.</p>
        </div>
        <span className={`badge mode-${extraction.mode}`}>{modeBadge}</span>
      </div>

      <div className="notice">
        {extraction.disclaimer} Nothing here is an authorized prescription change.
      </div>

      <label className="note-label" htmlFor="encounter-note">
        Encounter note (synthetic only)
      </label>
      <textarea
        id="encounter-note"
        className="note-input"
        value={note}
        rows={6}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Paste a fictional encounter note…"
      />
      <div className="actions">
        <button className="primary" onClick={runExtraction}>
          Run simulated extraction
        </button>
        <button onClick={checkBackend}>Check synthetic service</button>
        <span className="backend-state">Backend: {backendState}</span>
      </div>

      <section className="two-col">
        <div>
          <h3>Classified statements</h3>
          {statements.length === 0 && <p className="muted">No statements parsed yet.</p>}
          {statements.map((s) => (
            <div className="stmt" key={s.id}>
              <span className={`tag kind-${s.kind}`}>{KIND_LABEL[s.kind] ?? s.kind}</span>
              <p>{s.text}</p>
              <small>
                Authority: {AUTHORITY_LABEL[s.authority]}
                {s.medicationName ? ` · Medication: ${s.medicationName}` : ' · No medication named'}
              </small>
            </div>
          ))}
        </div>

        <div>
          <h3>Extracted medications (explicit only)</h3>
          {extraction.medications.length === 0 && <p className="muted">No explicitly stated medications.</p>}
          {extraction.medications.map((m) => (
            <div className="stmt" key={m.id}>
              <b>{m.name}</b>
              <div className="field-row">
                <span className={m.dose ? '' : 'missing'}>Dose: {m.dose ?? 'Not documented'}</span>
                <span className={m.route ? '' : 'missing'}>Route: {m.route ?? 'Not documented'}</span>
                <span className={m.frequency ? '' : 'missing'}>
                  Frequency: {m.frequency ?? 'Not documented'}
                </span>
              </div>
              <small>Values only where literally stated; nothing inferred.</small>
            </div>
          ))}
          {extraction.unresolved.length > 0 && (
            <div className="card warning-card">
              <span className="eyebrow">UNRESOLVED / UNCERTAIN</span>
              {extraction.unresolved.map((u) => (
                <p key={u}>• {u}</p>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
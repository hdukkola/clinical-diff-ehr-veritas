'use client';
import { useState } from 'react';
import type { WorkspaceState } from '@/lib/use-workspace';
import { ACTION_LABEL, AUTHORITY_LABEL } from '@/lib/proposals';
import type { Proposal, ProposalField } from '@/lib/types';

function FieldDiff({ proposal }: { proposal: Proposal }) {
  return (
    <table className="diff-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Current state</th>
          <th>Proposed state</th>
        </tr>
      </thead>
      <tbody>
        {proposal.proposed.map((p) => {
          const current = proposal.current.find((c) => c.field === p.field)?.before ?? null;
          const changed = current !== p.after;
          return (
            <tr key={p.field} className={changed ? 'changed' : ''}>
              <td>{p.label}</td>
              <td className={current ? '' : 'missing'}>{current ?? 'Not documented'}</td>
              <td className={p.after ? '' : 'missing'}>{p.after ?? 'Not documented'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EditableProposal({
  proposal,
  fields,
  onChange,
}: {
  proposal: Proposal;
  fields: ProposalField[];
  onChange: (fields: ProposalField[]) => void;
}) {
  const update = (field: ProposalField['field'], value: string) => {
    onChange(fields.map((f) => (f.field === field ? { ...f, after: value === '' ? null : value } : f)));
  };
  return (
    <div className="edit-grid">
      {(['dose', 'route', 'frequency', 'timing'] as const).map((field) => {
        const current = fields.find((f) => f.field === field)?.after ?? '';
        return (
          <label key={field} className="edit-field">
            <small>{field[0].toUpperCase() + field.slice(1)}</small>
            <input
              aria-label={`Edit ${field} for ${proposal.medication}`}
              value={current}
              placeholder="Not documented"
              onChange={(e) => update(field, e.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}

export default function ReviewDiffView({ ws }: { ws: WorkspaceState }) {
  const { proposals, decisions, edits, setDecision, setEditedFields, revalidate, revalidated, commit } = ws;
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  return (
    <div className="panel">
      <div className="diff-head">
        <div>
          <p className="eyebrow">REVIEW &amp; CLINICAL DIFF</p>
          <h2>Structured proposals</h2>
          <p>
            AI proposes; humans commit. Each proposal shows current vs. proposed state, evidence, authority,
            and uncertainty. Accept / Edit / Reject are recorded; nothing is written to an EHR.
          </p>
        </div>
        <span className="badge">{proposals.length} proposals</span>
      </div>

      <div className="notice warning">
        An evidence-sufficiency gate blocks any proposal that lacks literal evidence or required fields. Missing
        values stay null — the system abstains rather than inventing a dose, route, frequency, or timing.
      </div>

      {proposals.length === 0 && <p className="muted">Run an extraction in the Encounter Workspace to generate proposals.</p>}

      {proposals.map((p) => {
        const decision = decisions[p.id] ?? 'pending';
        const isEditing = editing[p.id];
        const fields = edits[p.id] ?? p.proposed;
        return (
          <article className="diff-card" key={p.id}>
            <div className="diff-title">
              <div>
                <span className="tag">{ACTION_LABEL[p.action].toUpperCase()}</span>
                <h3>{p.medication}</h3>
              </div>
              <span className={`badge unc-${p.uncertainty}`}>Uncertainty: {p.uncertainty}</span>
            </div>

            <div className={`gate ${p.gate.passed ? 'gate-pass' : 'gate-fail'}`}>
              <b>Evidence-sufficiency gate: {p.gate.passed ? 'PASSED' : 'FAILED'}</b>
              {p.gate.reasons.length > 0 && (
                <ul>
                  {p.gate.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>

            <p className="muted">Source authority: {AUTHORITY_LABEL[p.authority]}</p>

            <FieldDiff proposal={isEditing ? { ...p, proposed: fields } : p} />

            <div className="evidence">
              <b>Evidence (linked to source text)</b>
              {p.evidence.length === 0 && <span className="missing">No literal evidence span.</span>}
              {p.evidence.map((e, i) => (
                <blockquote key={i}>
                  “{e.text}” <small>— {e.sourceRef}</small>
                </blockquote>
              ))}
            </div>

            {p.abstainReason && (
              <div className="notice warning">
                <b>Abstained.</b> {p.abstainReason}
              </div>
            )}

            {isEditing && (
              <EditableProposal proposal={p} fields={fields} onChange={(f) => setEditedFields(p.id, f)} />
            )}

            <div className="actions">
              <button
                className="primary"
                disabled={!p.gate.passed}
                onClick={() => setDecision(p.id, 'accepted')}
              >
                Accept
              </button>
              <button
                onClick={() => {
                  setEditing((prev) => ({ ...prev, [p.id]: !prev[p.id] }));
                  setDecision(p.id, 'edited');
                }}
              >
                {isEditing ? 'Close editor' : 'Edit'}
              </button>
              <button onClick={() => setDecision(p.id, 'rejected')}>Reject</button>
              {decision === 'edited' && (
                <button onClick={() => revalidate(p.id)}>
                  {revalidated[p.id] ? 'Revalidated ✓' : 'Revalidate edits'}
                </button>
              )}
              <span className={`decision decision-${decision}`}>Decision: {decision}</span>
            </div>
          </article>
        );
      })}

      <div className="actions">
        <button
          className="primary"
          onClick={() => proposals.forEach((p) => decisions[p.id] && decisions[p.id] !== 'pending' && commit(p.id))}
        >
          Commit decisions to audit
        </button>
      </div>
    </div>
  );
}
'use client';

import { useState } from 'react';
import {
  validateSyntheticAssistantResult,
  type SyntheticAssistantNote,
  type SyntheticAssistantResult,
} from '@/lib/assistant-evidence';

export interface AssistantPanelProps {
  patientLabel?: string;
  patientId?: string;
  encounterTitle?: string;
}

export function AssistantPanel({
  patientLabel = 'Morgan Lee (Synthetic)',
  patientId = 'DEMO-001',
  encounterTitle,
}: AssistantPanelProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState<SyntheticAssistantResult | null>(null);

  async function ask(note: SyntheticAssistantNote) {
    setBusy(true);
    setMessage('');
    setAnswer(null);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
        signal: AbortSignal.timeout(15000),
      });
      const result: unknown = await response.json();
      if (!response.ok && result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') {
        setMessage(result.error);
      } else if (response.ok) {
        const verified = validateSyntheticAssistantResult(result, note);
        setAnswer(verified);
        if (!verified) setMessage('The model response could not be verified.');
      } else {
        setMessage('The model response could not be verified.');
      }
    } catch (error) {
      setMessage(error instanceof Error && error.name === 'TimeoutError' ? 'The request timed out. Please try again.' : 'The assistant is unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="assistant-panel" aria-label="Synthetic note assistant">
      <button type="button" className="assistant-toggle" aria-expanded={open} aria-controls="assistant-content" onClick={() => setOpen(!open)}>
        <span>
          <strong>Note assistant</strong>
          <small>
            {patientLabel} · {patientId} · Experimental · synthetic demo only
          </small>
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div id="assistant-content" className="assistant-content">
        <p>
          Ask which medications are explicitly named in the built-in demo notes for {patientLabel} ({patientId})
          {encounterTitle ? ` — ${encounterTitle}` : ''}. Edits to the notes are not sent. Review the source before relying on any result.
        </p>
        <div className="assistant-actions">
          <button type="button" disabled={busy} onClick={() => void ask('earlier')}>Check demo earlier note</button>
          <button type="button" disabled={busy} onClick={() => void ask('later')}>Check demo discharge note</button>
        </div>
        <p className="assistant-status" role="status" aria-live="polite">
          {busy ? 'Checking…' : answer?.status === 'abstained'
            ? 'Synthetic test response · Abstained. Review the selected note.'
            : answer?.status === 'answered' ? 'Synthetic test response · Review the cited text.'
              : message || 'Hosted model connection unavailable.'}
        </p>
        {answer?.status === 'answered' && (
          <ul className="assistant-evidence" aria-label="Synthetic medication evidence">
            {answer.evidence.map(({ medication, excerpt }) => (
              <li key={medication}>
                <strong>{medication}</strong> <span>{answer.source}</span>
                <blockquote>{excerpt}</blockquote>
              </li>
            ))}
          </ul>
        )}
      </div>}
    </section>
  );
}

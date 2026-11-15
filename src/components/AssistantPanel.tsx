'use client';

import { useState } from 'react';

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function ask(note: 'earlier' | 'later') {
    setBusy(true);
    setMessage('');
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
        <span><strong>Note assistant</strong><small>Experimental · synthetic demo only</small></span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div id="assistant-content" className="assistant-content">
        <p>Ask which medications are explicitly named in the built-in demo notes. Edits to the notes are not sent. Review the source before relying on any result.</p>
        <div className="assistant-actions">
          <button type="button" disabled={busy} onClick={() => void ask('earlier')}>Check demo earlier note</button>
          <button type="button" disabled={busy} onClick={() => void ask('later')}>Check demo discharge note</button>
        </div>
        <p className="assistant-status" role="status" aria-live="polite">{busy ? 'Checking…' : message || 'Hosted model connection unavailable.'}</p>
      </div>}
    </section>
  );
}

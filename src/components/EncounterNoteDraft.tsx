import { useEffect, useRef, useState } from 'react';
import { ENCOUNTER_SECTION_LABELS, encounterTurns } from '@/lib/encounter-transcript';

type Outcome = 'unavailable' | 'timeout' | 'provider-error' | 'busy';
type Draft = { selectedIds: string[]; run: 'local' | 'hosted' };
type State =
  | { phase: 'idle' | 'loading' }
  | { phase: 'error'; outcome: Outcome }
  | { phase: 'ready'; result: Draft };

const errors: Record<Outcome, string> = {
  unavailable: 'The encounter model is unavailable. You can still review the transcript.',
  timeout: 'The encounter model took too long. Try again or review the transcript.',
  'provider-error': 'The encounter model did not return usable evidence. Review the transcript.',
  busy: 'The encounter model is working on another request. Try again shortly.',
};

export function EncounterNoteDraft() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function draftNote() {
    if (activeRequest.current) return;
    const request = new AbortController();
    activeRequest.current = request;
    setState({ phase: 'loading' });
    try {
      const response = await fetch('/api/encounter-note', { method: 'POST', signal: request.signal });
      const body = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) {
        const outcome: Outcome = Object.hasOwn(errors, body?.status) ? body.status : 'provider-error';
        setState({ phase: 'error', outcome });
      } else if (!Array.isArray(body?.selectedIds) || !body.selectedIds.length ||
        !['local', 'hosted'].includes(body.run)) {
        setState({ phase: 'error', outcome: 'provider-error' });
      } else {
        setState({ phase: 'ready', result: body });
      }
    } catch {
      if (!request.signal.aborted) setState({ phase: 'error', outcome: 'provider-error' });
    } finally {
      activeRequest.current = null;
    }
  }

  const selected = state.phase === 'ready' ? new Set(state.result.selectedIds) : null;
  const omitted = selected && encounterTurns.some(({ section, id }) => section && !selected.has(id));

  return (
    <section className="encounter-transcript encounter-note-draft" aria-labelledby="encounter-draft-title">
      <header>
        <div>
          <h2 id="encounter-draft-title">Encounter note draft</h2>
          <p>Experimental · Fictional encounter · Review required</p>
        </div>
        <button type="button" className="btn" onClick={draftNote} disabled={state.phase === 'loading'}>
          {state.phase === 'loading' ? 'Selecting evidence…' : state.phase === 'ready' ? 'Draft again' : 'Draft from transcript'}
        </button>
      </header>
      {(state.phase === 'idle' || state.phase === 'loading') && (
        <p className="transcript-source" role="status">
          {state.phase === 'loading' ? 'Checking the model and selecting source excerpts.' : 'Qwen selects excerpts from this conversation for a reviewable draft.'}
        </p>
      )}
      {state.phase === 'error' && <p className="transcript-source" role="status">{errors[state.outcome]}</p>}
      {state.phase === 'ready' && selected && (
        <>
          <p className="transcript-source" role="status">
            {state.result.run === 'local' ? 'Local Qwen 4B' : 'Hosted Qwen 4B'} ·{' '}
            {omitted ? 'Partial draft. Review omitted excerpts before using this draft.' : 'Check the excerpts against the full transcript before using this draft.'}
          </p>
          <div className="encounter-note-sections">
            {Object.entries(ENCOUNTER_SECTION_LABELS).map(([section, title]) => {
              const turns = encounterTurns.filter((turn) => turn.section === section);
              return (
                <section key={section}>
                  <h3>{title}</h3>
                  {turns.filter((turn) => selected.has(turn.id)).map(({ id, time, speaker, quote }) => (
                    <div key={id} className="encounter-note-excerpt">
                      <a href={`#encounter-${id}`}>{time} · {speaker}</a>
                      <blockquote>{quote}</blockquote>
                    </div>
                  ))}
                  {turns.some((turn) => !selected.has(turn.id)) && (
                    <p className="encounter-note-omitted">
                      Review omitted excerpts at{' '}
                      {turns.filter((turn) => !selected.has(turn.id)).map(({ id, time }) => (
                        <a key={id} href={`#encounter-${id}`}>{time}</a>
                      ))}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

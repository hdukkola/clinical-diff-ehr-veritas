import { encounterTurns } from '@/lib/encounter-transcript';

export const ASPIRIN_TRANSCRIPT_LINK_ID = 'encounter-trace-aspirin';

export function EncounterTranscript({
  onCompare,
  onTraceNote,
  onTraceMedication,
}: {
  onCompare: () => void;
  onTraceNote?: (targetId: 'earlier-note' | 'later-note') => void;
  onTraceMedication?: (medicationId: string) => void;
}) {
  return (
    <section
      id="encounter-transcript"
      className="encounter-transcript"
      aria-labelledby="transcript-title"
    >
      <header>
        <div>
          <h2 id="transcript-title" tabIndex={-1}>
            Encounter transcript
          </h2>
          <p>October 15, 2026 · Discharge review · Recording consent at 00:08</p>
        </div>
        <button type="button" className="btn" onClick={onCompare}>
          Load notes in Compare
        </button>
      </header>
      <p className="transcript-source">
        Scripted encounter. The outpatient and discharge notes in Compare reflect this conversation.
      </p>
      <ol>
        {encounterTurns.map(({ id, time, speaker, quote, trace }) => (
          <li key={id} id={'encounter-' + id} tabIndex={-1}>
            <span className="mono">{time}</span>
            <div>
              <strong>{speaker}</strong>
              <p>{quote}</p>
              {trace && (
                <button
                  id={trace.target === 'snapshot-aspirin' ? ASPIRIN_TRANSCRIPT_LINK_ID : undefined}
                  type="button"
                  className="page-widget-action"
                  onClick={() => {
                    if (trace.target === 'snapshot-aspirin') {
                      if (onTraceMedication) onTraceMedication('m3');
                      else onCompare();
                    } else if (onTraceNote) {
                      onTraceNote(trace.target);
                    } else {
                      onCompare();
                    }
                  }}
                >
                  {trace.label}
                  <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

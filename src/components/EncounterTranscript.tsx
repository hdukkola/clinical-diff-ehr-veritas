type UtteranceTrace = {
  label: string;
  target: 'earlier-note' | 'later-note' | 'snapshot-aspirin';
};

const conversation: ReadonlyArray<{
  time: string;
  speaker: string;
  quote: string;
  trace?: UtteranceTrace;
}> = [
  {
    time: '00:00',
    speaker: 'Dr. Chen',
    quote:
      'I’d like to record this conversation so I can check the medication notes later. Is that okay with you?',
  },
  {
    time: '00:08',
    speaker: 'Morgan Lee',
    quote: 'Yes, you can record it.',
  },
  {
    time: '00:13',
    speaker: 'Dr. Chen',
    quote:
      'Before you came in, the outpatient list showed Lisinopril 10 mg daily, Metformin 500 mg twice daily, and Aspirin 81 mg daily. Does that match what you remember?',
    trace: { label: 'Trace to earlier note', target: 'earlier-note' },
  },
  {
    time: '00:26',
    speaker: 'Morgan Lee',
    quote: 'Yes. Those are the three I remember taking before the hospital visit.',
  },
  {
    time: '00:37',
    speaker: 'Dr. Chen',
    quote:
      'The discharge note lists Lisinopril 20 mg daily, Metformin 500 mg twice daily, and Atorvastatin 20 mg nightly. The structured discharge list did not capture the Metformin frequency, so I’ll flag that for review.',
    trace: { label: 'Trace to discharge note', target: 'later-note' },
  },
  {
    time: '00:54',
    speaker: 'Morgan Lee',
    quote: 'I don’t see Aspirin on the discharge list. Was it left off on purpose?',
    trace: { label: 'Trace Aspirin in Snapshot review', target: 'snapshot-aspirin' },
  },
  {
    time: '01:02',
    speaker: 'Dr. Chen',
    quote:
      'The note doesn’t say. I’ll record the discrepancy and check it against the original instructions.',
  },
];

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
        {conversation.map(({ time, speaker, quote, trace }) => (
          <li key={time}>
            <span className="mono">{time}</span>
            <div>
              <strong>{speaker}</strong>
              <p>{quote}</p>
              {trace && (
                <button
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

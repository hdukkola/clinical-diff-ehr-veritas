const conversation = [
  ['00:00', 'Dr. Chen', 'I’d like to record this conversation so I can check the medication notes later. Is that okay with you?'],
  ['00:08', 'Morgan Lee', 'Yes, you can record it.'],
  ['00:13', 'Dr. Chen', 'Before you came in, the outpatient list showed Lisinopril 10 mg daily, Metformin 500 mg twice daily, and Aspirin 81 mg daily. Does that match what you remember?'],
  ['00:26', 'Morgan Lee', 'Yes. Those are the three I remember taking before the hospital visit.'],
  ['00:37', 'Dr. Chen', 'The discharge note lists Lisinopril 20 mg daily, Metformin 500 mg twice daily, and Atorvastatin 20 mg nightly. The structured discharge list did not capture the Metformin frequency, so I’ll flag that for review.'],
  ['00:54', 'Morgan Lee', 'I don’t see Aspirin on the discharge list. Was it left off on purpose?'],
  ['01:02', 'Dr. Chen', 'The note doesn’t say. I’ll record the discrepancy and check it against the original instructions.'],
] as const;

export function EncounterTranscript({ onCompare }: { onCompare: () => void }) {
  return (
    <section id="encounter-transcript" className="encounter-transcript" aria-labelledby="transcript-title">
      <header>
        <div>
          <h2 id="transcript-title" tabIndex={-1}>Encounter transcript</h2>
          <p>October 15, 2026 · Discharge review · Recording consent at 00:08</p>
        </div>
        <button type="button" className="btn" onClick={onCompare}>Load notes in Compare</button>
      </header>
      <p className="transcript-source">Scripted encounter. The outpatient and discharge notes in Compare reflect this conversation.</p>
      <ol>
        {conversation.map(([time, speaker, quote]) => (
          <li key={time}>
            <span className="mono">{time}</span>
            <div><strong>{speaker}</strong><p>{quote}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

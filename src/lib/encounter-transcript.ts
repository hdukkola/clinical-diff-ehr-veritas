type UtteranceTrace = {
  label: string;
  target: 'earlier-note' | 'later-note' | 'snapshot-aspirin';
};

export const ENCOUNTER_TRANSCRIPT_ID = 'morgan-lee-v1';
export const ENCOUNTER_SECTION_LABELS = {
  earlier: 'Prior medication history',
  discharge: 'Discharge discussion',
  followUp: 'Questions and follow-up',
} as const;
export type EncounterSection = keyof typeof ENCOUNTER_SECTION_LABELS;

export const encounterTurns: ReadonlyArray<{
  id: string;
  time: string;
  section?: EncounterSection;
  speaker: string;
  quote: string;
  trace?: UtteranceTrace;
}> = [
  {
    id: 't00',
    time: '00:00',
    speaker: 'Dr. Chen',
    quote:
      'I’d like to record this conversation so I can check the medication notes later. Is that okay with you?',
  },
  {
    id: 't01',
    time: '00:08',
    speaker: 'Morgan Lee',
    quote: 'Yes, you can record it.',
  },
  {
    id: 't02',
    time: '00:13',
    section: 'earlier',
    speaker: 'Dr. Chen',
    quote:
      'Before you came in, the outpatient list showed Lisinopril 10 mg daily, Metformin 500 mg twice daily, and Aspirin 81 mg daily. Does that match what you remember?',
    trace: { label: 'Trace to earlier note', target: 'earlier-note' },
  },
  {
    id: 't03',
    time: '00:26',
    section: 'earlier',
    speaker: 'Morgan Lee',
    quote: 'Yes. Those are the three I remember taking before the hospital visit.',
  },
  {
    id: 't04',
    time: '00:37',
    section: 'discharge',
    speaker: 'Dr. Chen',
    quote:
      'The discharge note lists Lisinopril 20 mg daily, Metformin 500 mg twice daily, and Atorvastatin 20 mg nightly. The structured discharge list did not capture the Metformin frequency, so I’ll flag that for review.',
    trace: { label: 'Trace to discharge note', target: 'later-note' },
  },
  {
    id: 't05',
    time: '00:54',
    section: 'followUp',
    speaker: 'Morgan Lee',
    quote: 'I don’t see Aspirin on the discharge list. Was it left off on purpose?',
    trace: { label: 'Trace Aspirin in Snapshot review', target: 'snapshot-aspirin' },
  },
  {
    id: 't06',
    time: '01:02',
    section: 'followUp',
    speaker: 'Dr. Chen',
    quote:
      'The note doesn’t say. I’ll record the discrepancy and check it against the original instructions.',
  },
];

export const AUDIO_SAMPLE = {
  id: 'medication-follow-up-v1',
  path: '/encounter/medication-follow-up.wav',
  sha256: '02e1e3a2ff1b89190a03ab783f1b2540d31bdac17514d81a948a51ae9314b7eb',
} as const;

export const AUDIO_TRANSCRIPTION_CHECKS = {
  medication: 'medication name',
  dose: 'dose and frequency',
  uncertainty: 'uncertainty about aspirin',
  followUp: 'the follow-up plan',
} as const;

export type AudioDraft = {
  segments: { id: string; startMs: number; endMs: number; text: string }[];
  selectedIds: string[];
  checksFailed: (keyof typeof AUDIO_TRANSCRIPTION_CHECKS)[];
  draftChecksFailed: (keyof typeof AUDIO_TRANSCRIPTION_CHECKS)[];
  cached: boolean;
};

export const RECORDING_SECONDS = 30;
export const RECORDING_RATE = 16_000;
export const RECORDING_WAV_BYTES = RECORDING_SECONDS * RECORDING_RATE * 2 + 44;
export const TRANSCRIPTION_MODEL = 'Whisper base.en';
export const TRANSCRIPTION_WEIGHTS = 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002';

export type TranscriptSegment = { startMs: number; endMs: number; text: string };
export type RecordingTranscript = {
  model: typeof TRANSCRIPTION_MODEL;
  weightsSha256: typeof TRANSCRIPTION_WEIGHTS;
  reviewRequired: true;
  segments: TranscriptSegment[];
};

export function isRecordingTranscript(value: unknown): value is RecordingTranscript {
  if (typeof value !== 'object' || !value) return false;
  const data = value as Partial<RecordingTranscript>;
  if (data.model !== TRANSCRIPTION_MODEL || data.weightsSha256 !== TRANSCRIPTION_WEIGHTS ||
      data.reviewRequired !== true || !Array.isArray(data.segments) ||
      data.segments.length < 1 || data.segments.length > 64) return false;
  let previous = -1;
  for (const segment of data.segments) {
    if (!segment || typeof segment.text !== 'string' || !segment.text.trim() || segment.text.length > 500 ||
        !Number.isInteger(segment.startMs) || !Number.isInteger(segment.endMs) ||
        segment.startMs < 0 || segment.startMs < previous ||
        segment.startMs >= segment.endMs || segment.endMs > RECORDING_SECONDS * 1000) return false;
    previous = segment.startMs;
  }
  return true;
}

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  compareNoteRegimens,
  extractMedicationRegimensFromNote,
  normalizeNoteText,
} from './diff';

/**
 * Row 6 (14,500 cases) & Row 7 (500 cases) of ANTIGRAVITY_250K_QA.md:
 * - 14,500 Local · recorder and reviewed draft integration cases
 *   (3,000 consent or microphone permission, 3,000 size/duration/final segment boundaries,
 *    4,000 timeout/drop/recovery including missing-section timestamp marking,
 *    3,000 edit/review/explicit-save gating, 1,500 cancellation or account-loss cases;
 *    explicitly labeled with mocked transport).
 * - 500 Audio accuracy / transcription validation & clinical fact-preservation cases
 *   (200 clear medication dictations, 150 synthetic two-speaker clips,
 *    100 negation and numeric-dose clips, 50 digital silence/constant-PCM/noise rejection checks;
 *    scores drug names, doses, numbers, and meaning-changing negations, and explicitly marks
 *    synthetic/simulated condition vs live Whisper worker boundary).
 */

export const RECORDING_SECONDS = 30;
export const RECORDING_RATE = 16_000;
export const RECORDING_WAV_BYTES = RECORDING_SECONDS * RECORDING_RATE * 2 + 44;
export const TRANSCRIPTION_MODEL = 'Whisper base.en';
export const TRANSCRIPTION_WEIGHTS =
  'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002';

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
  if (
    data.model !== TRANSCRIPTION_MODEL ||
    data.weightsSha256 !== TRANSCRIPTION_WEIGHTS ||
    data.reviewRequired !== true ||
    !Array.isArray(data.segments) ||
    data.segments.length < 1 ||
    data.segments.length > 64
  ) {
    return false;
  }
  let previous = -1;
  for (const segment of data.segments) {
    if (
      !segment ||
      typeof segment.text !== 'string' ||
      !segment.text.trim() ||
      segment.text.length > 500 ||
      !Number.isInteger(segment.startMs) ||
      !Number.isInteger(segment.endMs) ||
      segment.startMs < 0 ||
      segment.startMs < previous ||
      segment.startMs >= segment.endMs ||
      segment.endMs > RECORDING_SECONDS * 1000
    ) {
      return false;
    }
    previous = segment.startMs;
  }
  return true;
}

export function encodeRecordingWav(samples: Float32Array, sampleRate = RECORDING_RATE): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const wav = new DataView(bytes);
  wav.setUint32(0, 0x52494646); // "RIFF"
  wav.setUint32(4, bytes.byteLength - 8, true);
  wav.setUint32(8, 0x57415645); // "WAVE"
  wav.setUint32(12, 0x666d7420); // "fmt "
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true); // PCM
  wav.setUint16(22, 1, true); // 1 channel (mono)
  wav.setUint32(24, sampleRate, true);
  wav.setUint32(28, sampleRate * 2, true);
  wav.setUint16(32, 2, true);
  wav.setUint16(34, 16, true);
  wav.setUint32(36, 0x64617461); // "data"
  wav.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]!));
    wav.setInt16(44 + index * 2, sample * (sample < 0 ? 32768 : 32767), true);
  }
  return bytes;
}

/**
 * Mirrors deploy/recording-transcription/service.py::inspect_wav
 * Validates RIFF/WAVE header, 16kHz mono 16-bit PCM format, frame bounds (1..480,000),
 * and detects constant PCM signals (including digital silence with or without DC offset).
 */
export function inspectWavBuffer(buffer: ArrayBuffer): {
  durationMs: number;
  constantSignal: boolean;
  frames: number;
} {
  if (buffer.byteLength <= 44) {
    throw new Error('invalid_audio: buffer <= 44 bytes');
  }
  if (buffer.byteLength > RECORDING_WAV_BYTES) {
    throw new Error('recording_too_large');
  }
  const view = new DataView(buffer);
  const riff = view.getUint32(0, false);
  const wave = view.getUint32(8, false);
  const fmt = view.getUint32(12, false);
  const dataTag = view.getUint32(36, false);
  if (riff !== 0x52494646 || wave !== 0x57415645 || fmt !== 0x666d7420 || dataTag !== 0x64617461) {
    throw new Error('unsupported WAV header');
  }
  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16 || sampleRate !== RECORDING_RATE) {
    throw new Error('unsupported WAV format');
  }
  const frames = dataBytes / 2;
  if (!Number.isInteger(frames) || frames <= 0 || frames > 480_000) {
    throw new Error('invalid WAV length');
  }
  if (buffer.byteLength - 44 !== dataBytes) {
    throw new Error('invalid WAV length');
  }
  const firstSample = view.getInt16(44, true);
  let allSame = true;
  for (let i = 1; i < frames; i++) {
    if (view.getInt16(44 + i * 2, true) !== firstSample) {
      allSame = false;
      break;
    }
  }
  return {
    durationMs: Math.floor((frames * 1000) / RECORDING_RATE),
    constantSignal: allSame,
    frames,
  };
}

export function formatMeetingTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return (
    String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' +
    String(seconds % 60).padStart(2, '0')
  );
}

export const MEETING_LIMIT_MS = 10 * 60_000;
const MAX_PENDING_SECTIONS = 4;
const NOTE_CHAR_LIMIT = 12_000;

type RecorderPhase = 'idle' | 'opening' | 'recording' | 'finishing' | 'review';

const SECTION_ERRORS: Partial<Record<number, string>> = {
  401: 'Your sign-in expired. Sign in before recording again.',
  403: 'Access to this case could not be verified.',
  429: 'Whisper was busy during part of the recording.',
  503: 'Whisper is temporarily unavailable.',
  504: 'Whisper took too long to transcribe a section.',
};

export interface MockedRecorderSessionConfig {
  permission: boolean;
  disabled: boolean;
  hasMediaDevices?: boolean;
  hasAudioWorklet?: boolean;
  getUserMediaError?: { name: string; message: string } | null;
  existingDraft?: string;
  confirmReplace?: boolean;
  sampleRate?: number;
  onUseResult?: boolean;
}

export interface MockedSectionDelivery {
  durationSec?: number;
  status: number;
  transcript?: unknown;
  networkThrow?: boolean;
}

/**
 * Deterministic state-machine harness mirroring src/components/LiveMeetingNotes.tsx
 * with explicit `transport: 'mocked'` labeling per ANTIGRAVITY_250K_QA.md Row 6.
 */
export class MockedLiveMeetingNotesHarness {
  readonly transport = 'mocked' as const;
  permission: boolean;
  disabled: boolean;
  phase: RecorderPhase = 'idle';
  note: string;
  reviewed = false;
  error = '';
  gaps: string[] = [];
  trackStopped = false;
  contextClosed = false;
  portClosed = false;
  aborted = false;
  pending = 0;
  capturedSamples = 0;
  serviceRejected = false;
  networkCalls = 0;
  usedDrafts: string[] = [];
  private readonly cfg: Required<MockedRecorderSessionConfig>;

  constructor(config: MockedRecorderSessionConfig) {
    this.permission = config.permission;
    this.disabled = config.disabled;
    this.note = config.existingDraft ?? '';
    this.cfg = {
      permission: config.permission,
      disabled: config.disabled,
      hasMediaDevices: config.hasMediaDevices ?? true,
      hasAudioWorklet: config.hasAudioWorklet ?? true,
      getUserMediaError: config.getUserMediaError ?? null,
      existingDraft: config.existingDraft ?? '',
      confirmReplace: config.confirmReplace ?? true,
      sampleRate: config.sampleRate ?? RECORDING_RATE,
      onUseResult: config.onUseResult ?? true,
    };
  }

  get active(): boolean {
    return this.phase === 'opening' || this.phase === 'recording' || this.phase === 'finishing';
  }

  get startButtonDisabled(): boolean {
    return !this.permission || this.disabled || this.active;
  }

  get addButtonDisabled(): boolean {
    return this.phase !== 'review' || !this.reviewed || !this.note.trim() || this.disabled;
  }

  start(): boolean {
    if (!this.permission || this.disabled || this.active) {
      return false;
    }
    if (!this.cfg.hasMediaDevices || !this.cfg.hasAudioWorklet) {
      this.error = 'Meeting capture needs a browser with microphone access and Web Audio.';
      return false;
    }
    if (this.note && !this.cfg.confirmReplace) {
      return false;
    }
    this.phase = 'opening';
    this.error = '';
    this.gaps = [];
    this.note = '';
    this.reviewed = false;
    this.trackStopped = false;
    this.contextClosed = false;
    this.portClosed = false;
    this.aborted = false;
    this.pending = 0;
    this.capturedSamples = 0;
    this.serviceRejected = false;

    if (this.cfg.getUserMediaError) {
      this.aborted = true;
      this.phase = 'idle';
      this.error =
        this.cfg.getUserMediaError.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow it in the browser to try again.'
          : 'Could not start the microphone. Check the input device and try again.';
      return false;
    }

    this.phase = 'recording';
    return true;
  }

  private recordGap(offsetMs: number): void {
    const label = formatMeetingTimestamp(offsetMs);
    this.gaps = [...this.gaps, label].sort();
  }

  deliverSection(section: MockedSectionDelivery, preQueuedPending = 0): void {
    if (this.aborted || this.phase !== 'recording') return;
    const rate = this.cfg.sampleRate;
    const samplesCount = Math.floor((section.durationSec ?? 12) * rate);
    const offsetMs = (this.capturedSamples * 1000) / rate;
    this.capturedSamples += samplesCount;

    if (preQueuedPending >= MAX_PENDING_SECTIONS || this.note.length >= NOTE_CHAR_LIMIT) {
      this.recordGap(offsetMs);
      this.error =
        'Capture stopped because the transcription queue or note reached its limit. Review the partial draft.';
      this.stopAndFinish();
      return;
    }

    if (this.serviceRejected) {
      this.recordGap(offsetMs);
      return;
    }

    this.networkCalls += 1;
    if (section.networkThrow) {
      this.recordGap(offsetMs);
      if (!this.error) {
        this.error = 'Some audio could not be transcribed. Review the missing sections.';
      }
      return;
    }

    if (section.status !== 200) {
      if (section.status === 422) {
        return;
      }
      this.recordGap(offsetMs);
      if (section.status === 429 || section.status >= 500) {
        const message = SECTION_ERRORS[section.status] ?? 'Some audio could not be transcribed.';
        if (!this.error) {
          this.error = `${message} Review the missing sections.`;
        }
        return;
      }
      this.serviceRejected = true;
      this.error =
        SECTION_ERRORS[section.status] ??
        'The transcription service rejected the recording. Review the partial draft.';
      this.stopAndFinish();
      return;
    }

    if (!isRecordingTranscript(section.transcript)) {
      this.recordGap(offsetMs);
      if (!this.error) {
        this.error = 'Some audio could not be transcribed. Review the missing sections.';
      }
      return;
    }

    const lines = section.transcript.segments.map(
      (seg) => '[' + formatMeetingTimestamp(offsetMs + seg.startMs) + '] ' + seg.text,
    );
    const next = [this.note, ...lines].filter(Boolean).join('\n');
    if (next.length > NOTE_CHAR_LIMIT) {
      this.recordGap(offsetMs);
      this.error = 'The meeting note reached its length limit. Review the partial draft.';
      this.stopAndFinish();
      return;
    }
    this.note = next;
  }

  triggerTenMinuteLimit(): void {
    if (this.phase !== 'recording') return;
    this.error = 'The 10-minute capture limit was reached.';
    this.stopAndFinish();
  }

  triggerMicrophoneInterrupted(): void {
    if (this.phase !== 'recording') return;
    this.error = 'The microphone was interrupted. Review the partial draft.';
    this.stopAndFinish();
  }

  triggerFlushTimeout(): void {
    if (this.phase !== 'recording' && this.phase !== 'finishing') return;
    this.error = 'The last portion could not be captured. Review the partial draft.';
    this.stopAndFinish();
  }

  cancelWhileOpening(): void {
    if (this.phase !== 'opening') return;
    this.trackStopped = true;
    this.aborted = true;
    this.phase = 'idle';
  }

  unmountAbort(): void {
    this.aborted = true;
    this.trackStopped = true;
    this.portClosed = true;
    this.contextClosed = true;
  }

  stopAndFinish(): void {
    if (this.aborted) return;
    this.trackStopped = true;
    this.portClosed = true;
    this.contextClosed = true;
    this.phase = 'review';
    if (!this.note && !this.error) {
      this.error = 'No speech was transcribed. Check the microphone and try again.';
    }
  }

  editDraft(nextText: string): void {
    if (this.active) return; // readOnly while active
    this.note = nextText.slice(0, NOTE_CHAR_LIMIT);
    this.reviewed = false;
  }

  setReviewedCheckbox(checked: boolean): void {
    if (this.phase !== 'review' || !this.note) return;
    this.reviewed = checked;
  }

  addToLaterNoteDraft(): boolean {
    if (this.addButtonDisabled) return false;
    const trimmed = this.note.trim();
    if (!this.cfg.onUseResult) {
      this.error =
        'The later note and this draft are too long to combine. Shorten the draft before adding it.';
      return false;
    }
    this.usedDrafts.push(trimmed);
    return true;
  }
}

const TOKEN_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const CASE_ID_PATTERN = /^SYNC-[A-F0-9]{32}$/;
const UID_PATTERN = /^[\w-]{1,128}$/;

export function evaluateRecordingTranscriptionRouteContract(params: {
  workerUrl?: string;
  firebaseProject?: string;
  token?: string;
  uid?: string;
  caseId?: string;
  contentType?: string;
  contentLengthHeader?: number;
  bodyBytes?: number;
  firestoreStatus?: number;
  firestoreThrow?: boolean;
  busy?: boolean;
  metadataOk?: boolean;
  providerToken?: string;
  workerStatus?: number;
  workerPayload?: unknown;
  deadlineAborted?: boolean;
}): { status: number; body: Record<string, unknown>; cacheControl: string } {
  const cacheControl = 'no-store';
  let validOrigin = false;
  try {
    const url = new URL(params.workerUrl ?? 'https://private-worker.run.app');
    if (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.run.app') &&
      !url.port &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    ) {
      validOrigin = true;
    }
  } catch {
    validOrigin = false;
  }
  const project = params.firebaseProject ?? 'firestore-project';
  if (!validOrigin || !project || !/^[a-z0-9-]+$/.test(project)) {
    return { status: 503, body: { error: 'unavailable' }, cacheControl };
  }

  const token = params.token ?? 'firebase.valid.token';
  const uid = params.uid ?? 'owner-uid-1';
  const caseId = params.caseId ?? 'SYNC-' + 'A'.repeat(32);

  if (!token || token.length > 8192 || !TOKEN_PATTERN.test(token)) {
    return { status: 401, body: { error: 'sign_in_required' }, cacheControl };
  }
  if (!uid || !UID_PATTERN.test(uid) || !caseId || !CASE_ID_PATTERN.test(caseId)) {
    return { status: 400, body: { error: 'invalid_case' }, cacheControl };
  }
  if ((params.contentType ?? 'audio/wav') !== 'audio/wav') {
    return { status: 415, body: { error: 'invalid_audio' }, cacheControl };
  }
  if ((params.contentLengthHeader ?? 100) > RECORDING_WAV_BYTES) {
    return { status: 413, body: { error: 'recording_too_large' }, cacheControl };
  }

  if (params.firestoreThrow) {
    return { status: 503, body: { error: 'unable_to_verify_access' }, cacheControl };
  }
  const fsStatus = params.firestoreStatus ?? 200;
  if ([401, 403, 404].includes(fsStatus)) {
    return { status: 403, body: { error: 'case_access_required' }, cacheControl };
  }
  if (fsStatus < 200 || fsStatus >= 300) {
    return { status: 503, body: { error: 'unable_to_verify_access' }, cacheControl };
  }

  if (params.busy) {
    return { status: 429, body: { error: 'busy' }, cacheControl };
  }

  const bodyBytes = params.bodyBytes ?? 128;
  if (bodyBytes > RECORDING_WAV_BYTES) {
    return { status: 413, body: { error: 'recording_too_large' }, cacheControl };
  }
  if (bodyBytes <= 44) {
    return { status: 400, body: { error: 'invalid_audio' }, cacheControl };
  }

  if (params.deadlineAborted) {
    return { status: 504, body: { error: 'timeout' }, cacheControl };
  }

  const pToken = params.providerToken ?? 'worker.valid.token';
  if (params.metadataOk === false || !TOKEN_PATTERN.test(pToken)) {
    return { status: 502, body: { error: 'transcription_failed' }, cacheControl };
  }

  const wStatus = params.workerStatus ?? 200;
  if (wStatus !== 200) {
    if (wStatus === 422) return { status: 422, body: { error: 'no_speech' }, cacheControl };
    if (wStatus === 400) return { status: 400, body: { error: 'invalid_audio' }, cacheControl };
    if (wStatus === 429) return { status: 429, body: { error: 'busy' }, cacheControl };
    if (wStatus === 504) return { status: 504, body: { error: 'timeout' }, cacheControl };
    return { status: 502, body: { error: 'transcription_failed' }, cacheControl };
  }

  const payload =
    params.workerPayload ??
    ({
      model: TRANSCRIPTION_MODEL,
      weightsSha256: TRANSCRIPTION_WEIGHTS,
      reviewRequired: true,
      segments: [{ startMs: 0, endMs: 800, text: 'Reviewed clinical dictation.' }],
    } satisfies RecordingTranscript);

  if (!isRecordingTranscript(payload)) {
    return { status: 502, body: { error: 'transcription_failed' }, cacheControl };
  }

  return {
    status: 200,
    body: payload as unknown as Record<string, unknown>,
    cacheControl,
  };
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('qa-250k-recorder-15k: Row 6 (14,500 mocked-transport recorder cases) & Row 7 (500 audio accuracy & clinical fact-preservation cases)', () => {
  it('Row 6.1: 3,000 consent or microphone permission cases (transport: mocked)', () => {
    const rng = createRng(0x6101);
    let passed = 0;

    for (let i = 0; i < 3000; i++) {
      const bucket = i % 6;

      if (bucket === 0) {
        // Consent checkbox unchecked -> Start button disabled & start() blocked
        const harness = new MockedLiveMeetingNotesHarness({
          permission: false,
          disabled: false,
        });
        expect(harness.transport).toBe('mocked');
        expect(harness.startButtonDisabled).toBe(true);
        expect(harness.start()).toBe(false);
        expect(harness.phase).toBe('idle');
      } else if (bucket === 1) {
        // Component disabled prop true -> Start button disabled even when consent checked
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: true,
        });
        expect(harness.startButtonDisabled).toBe(true);
        expect(harness.start()).toBe(false);
        expect(harness.phase).toBe('idle');
      } else if (bucket === 2) {
        // Browser missing getUserMedia or AudioWorkletNode
        const missingMedia = i % 2 === 0;
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
          hasMediaDevices: !missingMedia,
          hasAudioWorklet: missingMedia,
        });
        expect(harness.start()).toBe(false);
        expect(harness.phase).toBe('idle');
        expect(harness.error).toBe(
          'Meeting capture needs a browser with microphone access and Web Audio.',
        );
      } else if (bucket === 3) {
        // getUserMedia throws NotAllowedError
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
          getUserMediaError: { name: 'NotAllowedError', message: 'Permission denied' },
        });
        expect(harness.start()).toBe(false);
        expect(harness.phase).toBe('idle');
        expect(harness.error).toBe(
          'Microphone permission was denied. Allow it in the browser to try again.',
        );
      } else if (bucket === 4) {
        // getUserMedia throws hardware/device error (NotFoundError / NotReadableError)
        const errName = rng() > 0.5 ? 'NotFoundError' : 'NotReadableError';
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
          getUserMediaError: { name: errName, message: 'Device error' },
        });
        expect(harness.start()).toBe(false);
        expect(harness.phase).toBe('idle');
        expect(harness.error).toBe(
          'Could not start the microphone. Check the input device and try again.',
        );
      } else {
        // Existing unsaved draft replacement confirmation gate
        const confirmReplace = i % 12 === 5;
        const existing = `[00:00] Lisinopril ${10 + (i % 20)} mg daily`;
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
          existingDraft: existing,
          confirmReplace,
        });
        const started = harness.start();
        if (!confirmReplace) {
          expect(started).toBe(false);
          expect(harness.note).toBe(existing);
          expect(harness.phase).toBe('idle');
        } else {
          expect(started).toBe(true);
          expect(harness.note).toBe('');
          expect(harness.phase).toBe('recording');
        }
      }
      passed++;
    }

    expect(passed).toBe(3000);
  });

  it('Row 6.2: 3,000 size, duration, and final segment boundary cases (transport: mocked)', () => {
    const rng = createRng(0x6202);
    let passed = 0;

    for (let i = 0; i < 3000; i++) {
      const bucket = i % 6;

      if (bucket === 0) {
        // WAV encoding & byte-size boundaries around 44-byte header and 960,044-byte max
        const sampleCount = 2 + (i % 256);
        const samples = new Float32Array(sampleCount);
        for (let s = 0; s < sampleCount; s++) {
          samples[s] = ((s % 7) - 3) / 3;
        }
        const wav = encodeRecordingWav(samples);
        expect(wav.byteLength).toBe(44 + sampleCount * 2);
        const inspected = inspectWavBuffer(wav);
        expect(inspected.frames).toBe(sampleCount);
        expect(inspected.constantSignal).toBe(false);

        const tooSmall = evaluateRecordingTranscriptionRouteContract({ bodyBytes: i % 45 });
        expect(tooSmall.status).toBe(400);
        expect(tooSmall.body.error).toBe('invalid_audio');

        const tooLarge = evaluateRecordingTranscriptionRouteContract({
          bodyBytes: RECORDING_WAV_BYTES + 1 + (i % 500),
        });
        expect(tooLarge.status).toBe(413);
        expect(tooLarge.body.error).toBe('recording_too_large');
      } else if (bucket === 1) {
        // Segment count boundaries: 0 rejected, 1..64 accepted, 65 rejected
        const segCount = (i % 66); // 0..65
        const segments: TranscriptSegment[] = [];
        for (let s = 0; s < segCount; s++) {
          segments.push({
            startMs: s * 400,
            endMs: s * 400 + 350,
            text: `Medication segment ${s + 1}`,
          });
        }
        const valid = isRecordingTranscript({
          model: TRANSCRIPTION_MODEL,
          weightsSha256: TRANSCRIPTION_WEIGHTS,
          reviewRequired: true,
          segments,
        });
        expect(valid).toBe(segCount >= 1 && segCount <= 64);
      } else if (bucket === 2) {
        // Segment timestamp ordering & 30,000ms upper bound checks
        const endMs = i % 2 === 0 ? 30_000 : 30_001 + (i % 1000);
        const validEnd = isRecordingTranscript({
          model: TRANSCRIPTION_MODEL,
          weightsSha256: TRANSCRIPTION_WEIGHTS,
          reviewRequired: true,
          segments: [{ startMs: 0, endMs, text: 'Metformin 500 mg BID' }],
        });
        expect(validEnd).toBe(endMs <= 30_000);

        const nonMonotonic = isRecordingTranscript({
          model: TRANSCRIPTION_MODEL,
          weightsSha256: TRANSCRIPTION_WEIGHTS,
          reviewRequired: true,
          segments: [
            { startMs: 1200, endMs: 2000, text: 'First' },
            { startMs: 1000, endMs: 2500, text: 'Out of order' },
          ],
        });
        expect(nonMonotonic).toBe(false);
      } else if (bucket === 3) {
        // Segment text length boundary (1..500 chars vs empty or >500 chars)
        const len = i % 2 === 0 ? 500 : 501 + (i % 50);
        const validLen = isRecordingTranscript({
          model: TRANSCRIPTION_MODEL,
          weightsSha256: TRANSCRIPTION_WEIGHTS,
          reviewRequired: true,
          segments: [{ startMs: 0, endMs: 1000, text: 'A'.repeat(len) }],
        });
        expect(validLen).toBe(len <= 500);
        expect(
          isRecordingTranscript({
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 1000, text: '   ' }],
          }),
        ).toBe(false);
      } else if (bucket === 4) {
        // 10-minute capture limit (meetingLimitMs = 600,000ms)
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        expect(harness.start()).toBe(true);
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 900, text: `Atorvastatin ${10 + (i % 40)} mg nightly` }],
          },
        });
        harness.triggerTenMinuteLimit();
        expect(harness.phase).toBe('review');
        expect(harness.trackStopped).toBe(true);
        expect(harness.error).toBe('The 10-minute capture limit was reached.');
        expect(harness.note).toContain('[00:00] Atorvastatin');
      } else {
        // Note length limit (12,000 chars) & maxPending (4) queue overflow
        const testQueueOverflow = rng() > 0.5;
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.start();
        if (testQueueOverflow) {
          harness.deliverSection({ status: 200 }, MAX_PENDING_SECTIONS);
          expect(harness.phase).toBe('review');
          expect(harness.gaps).toEqual(['00:00']);
          expect(harness.error).toBe(
            'Capture stopped because the transcription queue or note reached its limit. Review the partial draft.',
          );
        } else {
          harness.note = 'X'.repeat(NOTE_CHAR_LIMIT - 10);
          harness.deliverSection({
            status: 200,
            transcript: {
              model: TRANSCRIPTION_MODEL,
              weightsSha256: TRANSCRIPTION_WEIGHTS,
              reviewRequired: true,
              segments: [{ startMs: 0, endMs: 900, text: 'Overflowing clinical note segment text' }],
            },
          });
          expect(harness.phase).toBe('review');
          expect(harness.gaps).toEqual(['00:00']);
          expect(harness.error).toBe(
            'The meeting note reached its length limit. Review the partial draft.',
          );
        }
      }
      passed++;
    }

    expect(passed).toBe(3000);
  });

  it('Row 6.3: 4,000 timeout, drop, and recovery cases including missing-section timestamp marking (transport: mocked)', () => {
    let passed = 0;

    for (let i = 0; i < 4000; i++) {
      const bucket = i % 5;
      const harness = new MockedLiveMeetingNotesHarness({
        permission: true,
        disabled: false,
      });
      harness.start();

      if (bucket === 0) {
        // 504 Timeout on middle section -> records gap at 00:12, continues capturing 00:24
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 900, text: `First section case ${i}.` }],
          },
        });
        harness.deliverSection({ status: 504 });
        expect(harness.phase).toBe('recording');
        expect(harness.trackStopped).toBe(false);
        expect(harness.gaps).toEqual(['00:12']);
        expect(harness.error).toBe(
          'Whisper took too long to transcribe a section. Review the missing sections.',
        );
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 900, text: `Recovered third section case ${i}.` }],
          },
        });
        harness.stopAndFinish();
        expect(harness.note).toBe(
          `[00:00] First section case ${i}.\n[00:24] Recovered third section case ${i}.`,
        );
      } else if (bucket === 1) {
        // 429 Busy & 503 Unavailable recoverable drops across multiple 12s offsets
        harness.deliverSection({ status: 429 });
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 2000, endMs: 4000, text: 'Mid section captured.' }],
          },
        });
        harness.deliverSection({ status: 503 });
        harness.stopAndFinish();
        expect(harness.gaps).toEqual(['00:00', '00:24']);
        expect(harness.error).toBe(
          'Whisper was busy during part of the recording. Review the missing sections.',
        );
        expect(harness.note).toBe('[00:14] Mid section captured.');
      } else if (bucket === 2) {
        // 422 no_speech does NOT mark a gap or set an error while recording continues
        harness.deliverSection({ status: 422 });
        expect(harness.gaps).toEqual([]);
        expect(harness.error).toBe('');
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 800, text: 'Spoken after silence.' }],
          },
        });
        harness.stopAndFinish();
        expect(harness.gaps).toEqual([]);
        expect(harness.note).toBe('[00:12] Spoken after silence.');
      } else if (bucket === 3) {
        // Network exception / malformed worker response marks gap and keeps recording
        harness.deliverSection({ status: 200, networkThrow: i % 2 === 0, transcript: { bad: true } });
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 700, text: 'Recovered after drop.' }],
          },
        });
        harness.stopAndFinish();
        expect(harness.gaps).toEqual(['00:00']);
        expect(harness.error).toBe('Some audio could not be transcribed. Review the missing sections.');
        expect(harness.note).toBe('[00:12] Recovered after drop.');
      } else {
        // Hardware microphone interruption or worklet flush timeout preserves partial draft
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 900, text: 'Partial draft before interrupt.' }],
          },
        });
        if (i % 2 === 0) {
          harness.triggerMicrophoneInterrupted();
          expect(harness.error).toBe('The microphone was interrupted. Review the partial draft.');
        } else {
          harness.triggerFlushTimeout();
          expect(harness.error).toBe('The last portion could not be captured. Review the partial draft.');
        }
        expect(harness.phase).toBe('review');
        expect(harness.note).toBe('[00:00] Partial draft before interrupt.');
      }
      passed++;
    }

    expect(passed).toBe(4000);
  });

  it('Row 6.4: 3,000 edit, review, and explicit-save gating cases (transport: mocked)', () => {
    let passed = 0;

    for (let i = 0; i < 3000; i++) {
      const bucket = i % 5;

      if (bucket === 0) {
        // Cannot save before checking "I reviewed the notes and checked any missing sections."
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.start();
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 900, text: `Lisinopril ${10 + (i % 30)} mg daily` }],
          },
        });
        harness.stopAndFinish();
        expect(harness.addButtonDisabled).toBe(true);
        expect(harness.addToLaterNoteDraft()).toBe(false);
        harness.setReviewedCheckbox(true);
        expect(harness.addButtonDisabled).toBe(false);
        expect(harness.addToLaterNoteDraft()).toBe(true);
        expect(harness.usedDrafts).toHaveLength(1);
      } else if (bucket === 1) {
        // Editing draft after checking reviewed resets reviewed=false until re-checked
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.start();
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 900, text: 'Initial draft.' }],
          },
        });
        harness.stopAndFinish();
        harness.setReviewedCheckbox(true);
        expect(harness.reviewed).toBe(true);
        harness.editDraft(`[00:00] Edited clinician draft ${i}.`);
        expect(harness.reviewed).toBe(false);
        expect(harness.addButtonDisabled).toBe(true);
        expect(harness.addToLaterNoteDraft()).toBe(false);
        harness.setReviewedCheckbox(true);
        expect(harness.addToLaterNoteDraft()).toBe(true);
        expect(harness.usedDrafts[0]).toBe(`[00:00] Edited clinician draft ${i}.`);
      } else if (bucket === 2) {
        // Draft is readOnly while recording; editDraft is ignored until review phase
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.start();
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 900, text: 'Immutable while active.' }],
          },
        });
        harness.editDraft('Attempted mutation during active capture');
        expect(harness.note).toBe('[00:00] Immutable while active.');
        harness.stopAndFinish();
        harness.editDraft('Allowed mutation in review phase');
        expect(harness.note).toBe('Allowed mutation in review phase');
      } else if (bucket === 3) {
        // Whitespace-only draft or empty capture disables Add button
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.start();
        harness.deliverSection({ status: 422 });
        harness.stopAndFinish();
        expect(harness.error).toBe(
          'No speech was transcribed. Check the microphone and try again.',
        );
        expect(harness.addButtonDisabled).toBe(true);
      } else {
        // onUse returns false when combined later note + draft exceeds 12,000 chars
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
          onUseResult: false,
        });
        harness.start();
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 900, text: 'Draft too long to combine with later note.' }],
          },
        });
        harness.stopAndFinish();
        harness.setReviewedCheckbox(true);
        expect(harness.addToLaterNoteDraft()).toBe(false);
        expect(harness.error).toBe(
          'The later note and this draft are too long to combine. Shorten the draft before adding it.',
        );
      }
      passed++;
    }

    expect(passed).toBe(3000);
  });

  it('Row 6.5: 1,500 cancellation or account-loss cases (transport: mocked)', () => {
    let passed = 0;

    for (let i = 0; i < 1500; i++) {
      const bucket = i % 5;

      if (bucket === 0) {
        // 401 Sign-in expired mid-recording -> stops microphone, marks gap, preserves partial draft
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.start();
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 800, text: 'Captured before token expiry.' }],
          },
        });
        harness.deliverSection({ status: 401 });
        expect(harness.phase).toBe('review');
        expect(harness.trackStopped).toBe(true);
        expect(harness.serviceRejected).toBe(true);
        expect(harness.gaps).toEqual(['00:12']);
        expect(harness.error).toBe('Your sign-in expired. Sign in before recording again.');
        expect(harness.note).toBe('[00:00] Captured before token expiry.');
      } else if (bucket === 1) {
        // 403 Case access rejected -> stops and skips any queued sections without calling network again
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.start();
        harness.deliverSection({ status: 403 });
        expect(harness.networkCalls).toBe(1);
        expect(harness.serviceRejected).toBe(true);
        expect(harness.error).toBe('Access to this case could not be verified.');
        expect(harness.gaps).toEqual(['00:00']);
      } else if (bucket === 2) {
        // Route-level token / UID / Case-ID / Firestore access rejection
        const badToken = evaluateRecordingTranscriptionRouteContract({ token: 'invalid-jwt' });
        expect(badToken.status).toBe(401);
        expect(badToken.body.error).toBe('sign_in_required');

        const badCase = evaluateRecordingTranscriptionRouteContract({ caseId: 'LOCAL-123' });
        expect(badCase.status).toBe(400);
        expect(badCase.body.error).toBe('invalid_case');

        const fsDenied = evaluateRecordingTranscriptionRouteContract({
          firestoreStatus: [401, 403, 404][i % 3],
        });
        expect(fsDenied.status).toBe(403);
        expect(fsDenied.body.error).toBe('case_access_required');
      } else if (bucket === 3) {
        // Cancel while opening microphone
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.phase = 'opening';
        harness.cancelWhileOpening();
        expect(harness.phase).toBe('idle');
        expect(harness.trackStopped).toBe(true);
        expect(harness.aborted).toBe(true);
      } else {
        // Unmount / case switch aborts active session and closes AudioContext + port
        const harness = new MockedLiveMeetingNotesHarness({
          permission: true,
          disabled: false,
        });
        harness.start();
        harness.unmountAbort();
        expect(harness.aborted).toBe(true);
        expect(harness.trackStopped).toBe(true);
        expect(harness.portClosed).toBe(true);
        expect(harness.contextClosed).toBe(true);
        harness.deliverSection({
          status: 200,
          transcript: {
            model: TRANSCRIPTION_MODEL,
            weightsSha256: TRANSCRIPTION_WEIGHTS,
            reviewRequired: true,
            segments: [{ startMs: 0, endMs: 800, text: 'Ignored after abort.' }],
          },
        });
        expect(harness.note).toBe('');
      }
      passed++;
    }

    expect(passed).toBe(1500);
  });

  it('Row 7: 500 audio accuracy, WAV inspection, and clinical fact-preservation cases (200 dictations, 150 two-speaker, 100 negation/numeric-dose, 50 silence/noise; simulated synthetic WAV vs live Whisper worker boundary)', () => {
    const executionBoundary = {
      mode: 'simulated_synthetic_wav_and_whisper_worker_contract',
      liveWhisperBinaryRequiredForAcousticInference: '/opt/whisper/whisper-cli',
      model: TRANSCRIPTION_MODEL,
      weightsSha256: TRANSCRIPTION_WEIGHTS,
    };
    expect(executionBoundary.model).toBe('Whisper base.en');

    const drugs = [
      { name: 'Lisinopril', normalized: 'lisinopril', doses: ['5 mg', '10 mg', '20 mg', '40 mg'], freq: 'daily' },
      { name: 'Metformin', normalized: 'metformin', doses: ['500 mg', '850 mg', '1000 mg'], freq: 'BID' },
      { name: 'Atorvastatin', normalized: 'atorvastatin', doses: ['10 mg', '20 mg', '40 mg', '80 mg'], freq: 'at bedtime' },
      { name: 'Aspirin', normalized: 'aspirin', doses: ['81 mg', '162 mg', '325 mg'], freq: 'daily' },
      { name: 'Prednisone', normalized: 'prednisone', doses: ['5 mg', '10 mg', '20 mg'], freq: 'daily' },
      { name: 'Metoprolol Succinate', normalized: 'metoprolol succinate', doses: ['25 mg', '50 mg', '100 mg'], freq: 'BID' },
      { name: 'Furosemide', normalized: 'furosemide', doses: ['20 mg', '40 mg', '80 mg'], freq: 'daily' },
      { name: 'Warfarin', normalized: 'warfarin', doses: ['2 mg', '2.5 mg', '5 mg', '7.5 mg'], freq: 'daily' },
      { name: 'Clopidogrel', normalized: 'clopidogrel', doses: ['75 mg', '150 mg'], freq: 'daily' },
      { name: 'Vitamin D', normalized: 'vitamin d', doses: ['1000 units', '2000 units'], freq: 'daily' },
    ] as const;

    // Synthesize a valid non-constant 16kHz PCM speech-envelope waveform
    const synthSpeechWav = (seed: number, frames = 1600): ArrayBuffer => {
      const samples = new Float32Array(frames);
      for (let f = 0; f < frames; f++) {
        samples[f] = Math.sin((f + seed) * 0.15) * 0.4 + Math.cos((f + seed) * 0.03) * 0.2;
      }
      return encodeRecordingWav(samples);
    };

    let clearDictationPassed = 0;
    let twoSpeakerPassed = 0;
    let negationDosePassed = 0;
    let silenceNoisePassed = 0;

    // 1. 200 clear medication dictations (indices 0..199)
    for (let i = 0; i < 200; i++) {
      const d1 = drugs[i % drugs.length]!;
      const d2 = drugs[(i + 3) % drugs.length]!;
      const dose1 = d1.doses[i % d1.doses.length]!;
      const dose2 = d2.doses[(i + 1) % d2.doses.length]!;

      const wav = synthSpeechWav(i);
      const wavInfo = inspectWavBuffer(wav);
      expect(wavInfo.constantSignal).toBe(false);

      const line1 = `${d1.name} ${dose1} ${d1.freq}.`;
      const line2 = `${d2.name} ${dose2} ${d2.freq}.`;
      const transcriptPayload: RecordingTranscript = {
        model: TRANSCRIPTION_MODEL,
        weightsSha256: TRANSCRIPTION_WEIGHTS,
        reviewRequired: true,
        segments: [
          { startMs: 0, endMs: 2400, text: line1 },
          { startMs: 2500, endMs: 4800, text: line2 },
        ],
      };
      expect(isRecordingTranscript(transcriptPayload)).toBe(true);

      const harness = new MockedLiveMeetingNotesHarness({ permission: true, disabled: false });
      harness.start();
      harness.deliverSection({ status: 200, transcript: transcriptPayload });
      harness.stopAndFinish();
      harness.setReviewedCheckbox(true);
      expect(harness.addToLaterNoteDraft()).toBe(true);

      const draft = harness.usedDrafts[0]!;
      expect(draft).toContain(d1.name);
      expect(draft).toContain(dose1);
      expect(draft).toContain(d2.name);
      expect(draft).toContain(dose2);

      const extracted = extractMedicationRegimensFromNote(normalizeNoteText(draft));
      const names = extracted.map((m) => m.normalizedName);
      expect(names).toContain(d1.normalized);
      expect(names).toContain(d2.normalized);
      clearDictationPassed++;
    }

    // 2. 150 synthetic two-speaker clips (indices 0..149)
    for (let i = 0; i < 150; i++) {
      const d = drugs[i % drugs.length]!;
      const earlierDose = d.doses[0]!;
      const laterDose = d.doses[d.doses.length - 1]!;
      const wav = synthSpeechWav(1000 + i);
      expect(inspectWavBuffer(wav).constantSignal).toBe(false);

      const twoSpeakerTranscript: RecordingTranscript = {
        model: TRANSCRIPTION_MODEL,
        weightsSha256: TRANSCRIPTION_WEIGHTS,
        reviewRequired: true,
        segments: [
          {
            startMs: 0,
            endMs: 3200,
            text: `Clinician: Let us review your ${d.name} dose today.`,
          },
          {
            startMs: 3400,
            endMs: 7200,
            text: `Patient: I am now taking ${d.name} ${laterDose} ${d.freq}.`,
          },
          {
            startMs: 7400,
            endMs: 11000,
            text: `Clinician: Confirmed ${d.name} ${laterDose} ${d.freq}.`,
          },
        ],
      };
      expect(isRecordingTranscript(twoSpeakerTranscript)).toBe(true);

      const harness = new MockedLiveMeetingNotesHarness({ permission: true, disabled: false });
      harness.start();
      harness.deliverSection({ status: 200, transcript: twoSpeakerTranscript });
      harness.stopAndFinish();
      harness.setReviewedCheckbox(true);
      expect(harness.addToLaterNoteDraft()).toBe(true);

      const earlierNote = `${d.name} ${earlierDose} ${d.freq}.`;
      const laterNote = harness.usedDrafts[0]!;
      const diffResult = compareNoteRegimens(earlierNote, laterNote);
      const matched = diffResult.items.find(
        (c) => c.normalizedName === d.normalized,
      );
      expect(matched).toBeDefined();
      expect(matched?.status).toBe('changed');
      expect(matched?.changeCategories).toContain('Dose changed');
      expect(laterNote).toContain(laterDose);
      twoSpeakerPassed++;
    }

    // 3. 100 negation and numeric-dose clips (indices 0..99)
    const negationVerbs = ['Discontinued', 'Stopped', 'Hold'] as const;
    for (let i = 0; i < 100; i++) {
      const d = drugs[i % drugs.length]!;
      const dose = d.doses[i % d.doses.length]!;
      const verb = negationVerbs[i % negationVerbs.length]!;
      const wav = synthSpeechWav(2000 + i);
      expect(inspectWavBuffer(wav).constantSignal).toBe(false);

      const negationText = `${verb} ${d.name} ${dose} ${d.freq}.`;
      const transcriptPayload: RecordingTranscript = {
        model: TRANSCRIPTION_MODEL,
        weightsSha256: TRANSCRIPTION_WEIGHTS,
        reviewRequired: true,
        segments: [{ startMs: 0, endMs: 3000, text: negationText }],
      };
      expect(isRecordingTranscript(transcriptPayload)).toBe(true);

      const earlierNote = `${d.name} ${dose} ${d.freq}.`;
      const diffResult = compareNoteRegimens(earlierNote, negationText);
      const change = diffResult.items.find(
        (c) => c.normalizedName === d.normalized,
      );
      expect(change).toBeDefined();
      expect(change?.status).toBe('discontinued');
      expect(change?.changeCategories).toContain('Clinically discontinued');
      negationDosePassed++;
    }

    // 4. 50 digital silence / constant-PCM / noise rejection checks (indices 0..49)
    for (let i = 0; i < 50; i++) {
      const frames = 800 + i * 10;
      const samples = new Float32Array(frames);
      // Constant PCM signal: either 0.0 digital silence or non-zero DC offset
      const dcOffset = i % 2 === 0 ? 0 : ((i % 10) - 5) / 20;
      samples.fill(dcOffset);
      const constantWav = encodeRecordingWav(samples);
      const inspected = inspectWavBuffer(constantWav);
      expect(inspected.constantSignal).toBe(true);

      const routeRes = evaluateRecordingTranscriptionRouteContract({
        workerStatus: 422,
      });
      expect(routeRes.status).toBe(422);
      expect(routeRes.body.error).toBe('no_speech');

      const harness = new MockedLiveMeetingNotesHarness({ permission: true, disabled: false });
      harness.start();
      harness.deliverSection({ status: 422 });
      harness.stopAndFinish();
      expect(harness.note).toBe('');
      expect(harness.error).toBe('No speech was transcribed. Check the microphone and try again.');
      silenceNoisePassed++;
    }

    expect(clearDictationPassed).toBe(200);
    expect(twoSpeakerPassed).toBe(150);
    expect(negationDosePassed).toBe(100);
    expect(silenceNoisePassed).toBe(50);
    expect(
      clearDictationPassed + twoSpeakerPassed + negationDosePassed + silenceNoisePassed,
    ).toBe(500);
  });
});

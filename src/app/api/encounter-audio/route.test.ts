import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_SAMPLE } from '@/lib/encounter-audio';
import { POST } from './route';

const health = {
  status: 'ready',
  model: 'ggml-org/Qwen3.5-4B-GGUF',
  revision: '8d43d974efc48399cb58957ad49c8b26bf5a109c',
  backend: 'llama.cpp-cpu',
  quantization: 'Q4_K_M',
  artifact_sha256: '217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14',
  transcript_sha256: 'acf1b7fe7cf8f687bba776465787407a167c04838efcfa498f5614b1f2aebb99',
  audio_id: AUDIO_SAMPLE.id,
  audio_sha256: AUDIO_SAMPLE.sha256,
  whisper_sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
  adapter: null,
  synthetic_only: true,
};

const draft = {
  audio_id: AUDIO_SAMPLE.id,
  audio_sha256: AUDIO_SAMPLE.sha256,
  review_required: true,
  synthetic_only: true,
  cached: false,
  segments: [
    { id: 'a00', startMs: 0, endMs: 2000, text: 'Was my aspirin stopped?' },
    { id: 'a01', startMs: 2000, endMs: 9500, text: 'The discharge note lists Lisinopril 20mg daily. It does not say whether aspirin was stopped. I will check the original instructions.' },
  ],
  turn_ids: ['a01', 'a00'],
  transcription_checks_failed: [],
  draft_checks_failed: [],
};

const request = (body?: string) => new Request('https://app.test/api/encounter-audio', { method: 'POST', body });

describe('audio encounter note route', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    fetch.mockReset();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('CLINICAL_DIFF_ENCOUNTER_URL', 'https://diffmd-encounter-abc.run.app');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function respondWith(body: unknown = draft) {
    fetch.mockResolvedValueOnce(new Response('fake.test.token'))
      .mockResolvedValueOnce(Response.json(health))
      .mockResolvedValueOnce(Response.json(body));
  }

  it('accepts only the fixed sample and returns hosted excerpts in recording order', async () => {
    respondWith();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      segments: draft.segments,
      selectedIds: ['a00', 'a01'],
      checksFailed: [],
      draftChecksFailed: [],
      cached: false,
    });
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({
      audio_id: AUDIO_SAMPLE.id, audio_sha256: AUDIO_SAMPLE.sha256,
    });
  });

  it('accepts an empty body stream from the hosting proxy', async () => {
    respondWith();
    expect((await POST(request(''))).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects caller content and loopback inference before performing network calls', async () => {
    expect((await POST(request('arbitrary audio'))).status).toBe(400);
    vi.stubEnv('CLINICAL_DIFF_ENCOUNTER_URL', 'http://127.0.0.1:18765');
    expect((await POST(request())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses to start transcription if the speech model identity differs', async () => {
    fetch.mockResolvedValueOnce(new Response('fake.test.token'))
      .mockResolvedValueOnce(Response.json({ ...health, whisper_sha256: 'wrong' }));
    expect((await POST(request())).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['transcription_checks_failed', 'checksFailed', 'dose'],
    ['draft_checks_failed', 'draftChecksFailed', 'uncertainty'],
  ])('preserves the transcript when %s blocks the draft', async (providerField, responseField, mismatch) => {
    respondWith({ ...draft, turn_ids: [], [providerField]: [mismatch] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ segments: draft.segments, selectedIds: [], [responseField]: [mismatch] });
  });

  it('rejects a draft that invents an excerpt or bypasses a failed check', async () => {
    respondWith({ ...draft, turn_ids: ['a09'] });
    expect((await POST(request())).status).toBe(502);
    respondWith({ ...draft, transcription_checks_failed: ['dose'] });
    expect((await POST(request())).status).toBe(502);
  });

  it('reports a timeout returned by the worker', async () => {
    fetch.mockResolvedValueOnce(new Response('fake.test.token'))
      .mockResolvedValueOnce(Response.json(health))
      .mockResolvedValueOnce(new Response(null, { status: 504 }));
    const response = await POST(request());
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ status: 'timeout' });
  });
});

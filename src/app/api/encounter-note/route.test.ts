import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const health = {
  status: 'ready',
  model: 'mlx-community/Qwen3.5-4B-4bit',
  revision: '0e7ffd5c629ef7719d4cbc04069232580bfa9d9c',
  adapter: null,
  backend: 'mlx',
  synthetic_only: true,
};

const selection = {
  transcript_id: 'morgan-lee-v1',
  turn_ids: ['t06', 't04', 't05'],
  synthetic_only: true,
  review_required: true,
};

const transcriptFingerprint = 'acf1b7fe7cf8f687bba776465787407a167c04838efcfa498f5614b1f2aebb99';
const cloudHealth = {
  ...health,
  model: 'ggml-org/Qwen3.5-4B-GGUF',
  revision: '8d43d974efc48399cb58957ad49c8b26bf5a109c',
  backend: 'llama.cpp-cpu',
  quantization: 'Q4_K_M',
  artifact_sha256: '217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14',
  transcript_sha256: transcriptFingerprint,
};

const request = (body?: string) =>
  new Request('http://app.test/api/encounter-note', { method: 'POST', body });

describe('encounter note route', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    fetch.mockReset();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('CLINICAL_DIFF_ENCOUNTER_URL', 'http://127.0.0.1:18765');
    vi.stubEnv('K_SERVICE', undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends only the synthetic ID and returns the verified selected source IDs in transcript order', async () => {
    fetch.mockResolvedValueOnce(Response.json(health)).mockResolvedValueOnce(Response.json(selection));
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      selectedIds: ['t04', 't05', 't06'],
      model: health.model,
      revision: health.revision,
      run: 'local',
    });
    expect(fetch.mock.calls.map(([url]) => url.toString())).toEqual([
      'http://127.0.0.1:18765/health',
      'http://127.0.0.1:18765/select',
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({ transcript_id: 'morgan-lee-v1' });
  });

  it('rejects caller-supplied text before contacting the model', async () => {
    expect((await POST(request('{"transcript":"Other content"}'))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects local inference on a deployed instance', async () => {
    vi.stubEnv('K_SERVICE', 'diffmd-web');
    expect((await POST(request())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires the expected model identity', async () => {
    fetch.mockResolvedValueOnce(Response.json({ ...health, adapter: 'unknown' }));
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('checks the private Cloud Run service identity and sends its own transcript fingerprint', async () => {
    vi.stubEnv('K_SERVICE', 'diffmd-web');
    vi.stubEnv('CLINICAL_DIFF_ENCOUNTER_URL', 'https://diffmd-inference-abc.run.app');
    fetch.mockResolvedValueOnce(new Response('fake.test.token'))
      .mockResolvedValueOnce(Response.json(cloudHealth))
      .mockResolvedValueOnce(Response.json({ ...selection, transcript_sha256: transcriptFingerprint }));
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ run: 'hosted', model: cloudHealth.model, revision: cloudHealth.revision });
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('audience')).toBe('https://diffmd-inference-abc.run.app');
    expect(new Headers(fetch.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer fake.test.token');
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({
      transcript_id: 'morgan-lee-v1', transcript_sha256: transcriptFingerprint,
    });
  });

  it('stops before selecting if the Cloud Run transcript fingerprint differs', async () => {
    vi.stubEnv('CLINICAL_DIFF_ENCOUNTER_URL', 'https://diffmd-inference-abc.run.app');
    fetch.mockResolvedValueOnce(new Response('fake.test.token'))
      .mockResolvedValueOnce(Response.json({ ...cloudHealth, transcript_sha256: 'mismatch' }));
    expect((await POST(request())).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns a timeout when the overall provider deadline expires', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    fetch.mockImplementationOnce(async (_url, options) => {
      deadline.abort();
      options?.signal?.throwIfAborted();
      throw new Error('Expected aborted request');
    });
    expect((await POST(request())).status).toBe(504);
  });

  it.each([['invented'], ['t03', 't03'], ['t00', 't01'], []])(
    'rejects unusable evidence IDs (%j)',
    async (...ids) => {
      fetch.mockResolvedValueOnce(Response.json(health))
        .mockResolvedValueOnce(Response.json({ ...selection, turn_ids: ids }));
      expect((await POST(request())).status).toBe(502);
    },
  );

  it('rejects concurrent inference and releases the slot after failure', async () => {
    let finish!: (response: Response) => void;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = POST(request());
    expect((await POST(request())).status).toBe(429);
    finish(new Response(null, { status: 503 }));
    expect((await first).status).toBe(502);
    fetch.mockResolvedValueOnce(Response.json(health)).mockResolvedValueOnce(Response.json(selection));
    expect((await POST(request())).status).toBe(200);
  });
});

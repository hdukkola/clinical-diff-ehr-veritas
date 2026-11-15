import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_ASSISTANT_NOTES } from '@/lib/assistant-evidence';
import { POST } from './route';

const { earlier, later } = SYNTHETIC_ASSISTANT_NOTES;
const sample = {
  comparison_id: 'morgan-lee-medication-list-v1',
  comparison_sha256: createHash('sha256').update(JSON.stringify([earlier.text, later.text])).digest('hex'),
};
const health = {
  ...sample,
  status: 'ready',
  model: 'ggml-org/Qwen3.5-4B-GGUF',
  revision: '8d43d974efc48399cb58957ad49c8b26bf5a109c',
  backend: 'llama.cpp-cpu',
  quantization: 'Q4_K_M',
  artifact_sha256: '217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14',
  transcript_sha256: 'acf1b7fe7cf8f687bba776465787407a167c04838efcfa498f5614b1f2aebb99',
  adapter: null,
  synthetic_only: true,
};
const result = {
  ...sample,
  synthetic_only: true,
  review_required: true,
  cached: false,
  earlier: earlier.medications,
  later: later.medications,
};
const request = (body?: string) => new Request('https://app.test/api/encounter-compare', { method: 'POST', body });

describe('hosted bundled note comparison', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    fetch.mockReset();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('CLINICAL_DIFF_ENCOUNTER_URL', 'https://diffmd-encounter-abc.run.app');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function respondWith(response: Response, providerHealth = health) {
    fetch.mockResolvedValueOnce(new Response('fake.test.token'))
      .mockResolvedValueOnce(Response.json(providerHealth))
      .mockResolvedValueOnce(response);
  }

  it('sends only the pinned sample identifiers and finds exact evidence in each note', async () => {
    respondWith(Response.json(result));
    const response = await POST(request(''));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ live_ai: true, simulated: false, model: health.model, cached: false });
    expect(body.differences).toMatchObject([
      { name: 'Aspirin', kind: 'earlier_only', source_id: 'earlier-note' },
      { name: 'Atorvastatin', kind: 'later_only', source_id: 'later-note' },
    ]);
    expect(body.evidence).toHaveLength(6);
    for (const item of body.evidence) {
      const note = item.source_id === 'earlier-note' ? earlier.text : later.text;
      expect(note.slice(item.start, item.end)).toBe(item.name);
    }
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual(sample);
  });

  it('rejects caller notes before contacting the provider', async () => {
    expect((await POST(request(earlier.text))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses to invoke a worker serving a different example', async () => {
    respondWith(Response.json(result), { ...health, comparison_sha256: 'other' });
    expect((await POST(request())).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([['Lisinopril', 'Aspirin'], ['Lisinopril', 'Metformin', 'Invented']])(
    'withholds results when the provider misses or substitutes a medication (%s)',
    async (...names) => {
      respondWith(Response.json({ ...result, earlier: names }));
      expect((await POST(request())).status).toBe(502);
    },
  );

  it('reports capacity and timeout separately', async () => {
    respondWith(new Response(null, { status: 429 }));
    expect(await (await POST(request())).json()).toEqual({ status: 'busy' });
    respondWith(new Response(null, { status: 504 }));
    expect(await (await POST(request())).json()).toEqual({ status: 'timeout' });
  });
});

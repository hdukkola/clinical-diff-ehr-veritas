import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { AUDIO_SAMPLE } from '@/lib/encounter-audio';
import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());

function request(range?: string) {
  return new Request('https://app.test' + AUDIO_SAMPLE.path, { headers: range ? { Range: range } : undefined });
}

it.each([undefined, '0'])('keeps training audio unavailable with example mode %s', async (mode) => {
  vi.stubEnv('NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE', mode);
  const response = await GET(request('bytes=0-3'));
  expect(response.status).toBe(404);
  expect(response.body).toBeNull();
});

it('serves the pinned training recording and byte ranges for audio seeking', async () => {
  vi.stubEnv('NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE', '1');
  const full = await GET(request());
  expect(full.status).toBe(200);
  expect(full.headers.get('Content-Type')).toBe('audio/wav');
  const bytes = Buffer.from(await full.arrayBuffer());
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(AUDIO_SAMPLE.sha256);

  const excerpt = await GET(request('bytes=0-3'));
  expect(excerpt.status).toBe(206);
  expect(excerpt.headers.get('Content-Range')).toBe(`bytes 0-3/${bytes.length}`);
  expect(await excerpt.text()).toBe('RIFF');
  expect((await GET(request(`bytes=${bytes.length}-`))).status).toBe(416);
});

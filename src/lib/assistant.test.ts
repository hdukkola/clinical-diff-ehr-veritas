import { describe, expect, it } from 'vitest';
import { POST } from '../app/api/assistant/route';

function request(body: string) {
  return new Request('http://localhost/api/assistant', { method: 'POST', body });
}

describe('synthetic assistant endpoint', () => {
  it('rejects malformed requests and arbitrary text', async () => {
    for (const body of ['{', '{}', JSON.stringify({ note: 'earlier', text: 'arbitrary' }), JSON.stringify({ note: 'other' })]) {
      expect((await POST(request(body))).status).toBe(400);
    }
  });
  it('reports the unverified hosted model as unavailable', async () => {
    for (const note of ['earlier', 'later']) {
      const response = await POST(request(JSON.stringify({ note })));
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ status: 'unavailable' });
    }
  });
  it('rejects oversized input', async () => {
    expect((await POST(request(JSON.stringify({ note: 'earlier', text: 'x'.repeat(300) })))).status).toBe(413);
  });
});

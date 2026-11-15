import { describe, expect, it } from 'vitest';
import { POST } from '../app/api/assistant/route';
import { validateSyntheticAssistantResult } from './assistant-evidence';

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

describe('synthetic assistant result evidence', () => {
  it('rejects live or unlabeled output, wrong notes, unsupported names and inconsistent abstentions', () => {
    const evidence = [{ medication: 'Aspirin', excerpt: 'Aspirin 81 mg daily.' }];
    const sample = { mode: 'synthetic-test', status: 'answered', note: 'earlier', evidence };
    expect(validateSyntheticAssistantResult(sample, 'earlier')).toMatchObject({ status: 'answered', evidence });
    expect(validateSyntheticAssistantResult(sample, 'later')).toBeNull();
    for (const result of [
      { ...sample, mode: 'live' },
      { ...sample, mode: undefined },
      { ...sample, status: 'abstained' },
      { ...sample, evidence: [...evidence, ...evidence] },
      { ...sample, evidence: [{ medication: 'Aspirin', excerpt: 'Metformin 500 mg twice daily' }] },
      { ...sample, evidence: [{ medication: 'Sample', excerpt: 'Sample outpatient medication list.' }] },
    ]) {
      expect(validateSyntheticAssistantResult(result, 'earlier')).toBeNull();
    }
  });
});

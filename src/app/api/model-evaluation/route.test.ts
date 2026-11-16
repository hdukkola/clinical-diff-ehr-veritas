import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET, OPTIONS, POST } from './route';

const url = 'https://model-gateway---diffmd-web-idhxtsqyla-uc.a.run.app/api/model-evaluation';
const live = 'https://diffmd.web.app';
const identity = {
  status: 'ready',
  base_revision: '0e7ffd5c629ef7719d4cbc04069232580bfa9d9c',
  adapter_sha256: '4d3222925a62f772e07c2601ab9cf15e22b94bf628dab04ef87cd34311c8e85a',
  case_file_sha256: '2b10b30ce99240666fff78398243f42088cc1432e8221b29c85bd3732e848f87',
  verified_live_adapter_tensors: 30,
};

function authorized(user: Record<string, unknown> = {}) {
  return Response.json({ users: [{
    email: 'tester@example.test', emailVerified: true, providerUserInfo: [{ providerId: 'google.com' }], ...user,
  }] });
}

function request(data?: Record<string, unknown>, token = 'firebase.test.token') {
  return new Request(url, {
    method: data ? 'POST' : 'GET',
    headers: { Origin: live, 'X-DiffMD-Workspace-Token': token, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_DIFFMD_FIREBASE_API_KEY', 'public-test-key');
  vi.stubEnv('DIFFMD_MODEL_TESTERS', 'tester@example.test');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('allows browser requests from DiffMD only and denies unsigned requests before calling Firebase', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(OPTIONS(new Request(url, { headers: { Origin: live } })).headers.get('Access-Control-Allow-Origin')).toBe(live);
  expect(OPTIONS(new Request(url, { headers: { Origin: live + '.example.test' } })).status).toBe(403);
  expect((await GET(request(undefined, ''))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects uninvited users and requests that add patient text', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(authorized({ email: 'other@example.test' })).mockResolvedValueOnce(authorized());
  vi.stubGlobal('fetch', fetcher);
  expect((await GET(request())).status).toBe(403);
  expect((await POST(request({ caseId: 'transfer-a', note: 'extra text' }))).status).toBe(400);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('calls the pinned 4B revision and reports the actual score and extraction', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(authorized())
    .mockResolvedValueOnce(new Response('cloud.service.token'))
    .mockResolvedValueOnce(Response.json({ identity, result: {
      id: 'transfer-a', pass: true, critical: true, seconds: 64,
      raw: '{"medications":["losartan"]}',
    } }));
  vi.stubGlobal('fetch', fetcher);
  const response = await POST(request({ caseId: 'transfer-a' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ model: 'Qwen3.5 4B', passed: true, medications: ['losartan'], seconds: 64 });
  const endpoint = 'https://diffmd-qwen-4b-trained-idhxtsqyla-uw.a.run.app';
  expect((fetcher.mock.calls[1][0] as URL).searchParams.get('audience')).toBe(endpoint);
  expect(fetcher.mock.calls[2]).toEqual([
    endpoint.replace('https://', 'https://recon-qa---') + '/v1/fixture-inference',
    expect.objectContaining({ body: '{"case_id":"transfer-a"}', headers: expect.objectContaining({ Authorization: 'Bearer cloud.service.token' }) }),
  ]);
});

it('rejects a mismatched adapter identity', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(authorized())
    .mockResolvedValueOnce(new Response('cloud.service.token'))
    .mockResolvedValueOnce(Response.json({ ...identity, adapter_sha256: 'wrong' })));
  expect((await GET(request())).status).toBe(502);
});

import { QWEN_TEST_CASES } from '@/lib/qwen-test-cases';

const worker = {
  origin: 'https://diffmd-qwen-4b-trained-idhxtsqyla-uw.a.run.app',
  endpoint: 'https://recon-qa---diffmd-qwen-4b-trained-idhxtsqyla-uw.a.run.app',
  baseRevision: '0e7ffd5c629ef7719d4cbc04069232580bfa9d9c',
  adapterSha256: '4d3222925a62f772e07c2601ab9cf15e22b94bf628dab04ef87cd34311c8e85a',
  caseFileSha256: '2b10b30ce99240666fff78398243f42088cc1432e8221b29c85bd3732e848f87',
  tensors: 30,
};
let running = false;
const fetchPolicy = { cache: 'no-store', redirect: 'error' } as const;
const jwt = /^[\w-]+\.[\w-]+\.[\w-]+$/;

function responseHeaders(request: Request) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (!origin) return headers;
  if (!['https://diffmd.web.app', 'https://diffmd.firebaseapp.com'].includes(origin) &&
      !/^https:\/\/diffmd--qwen-models-[a-z0-9]+\.web\.app$/.test(origin)) return null;
  headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export function OPTIONS(request: Request) {
  const headers = responseHeaders(request);
  if (!headers) return new Response(null, { status: 403 });
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-DiffMD-Workspace-Token');
  return new Response(null, { status: 204, headers });
}

function fail(status: number, error: string, headers: Headers) {
  return Response.json({ error }, { status, headers });
}

async function readJson(message: Request | Response, maxBytes: number) {
  const reader = message.body?.getReader();
  if (!reader) throw new SyntaxError('missing body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode()) as unknown;
      bytes += value.length;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new RangeError('body too large');
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function authorize(request: Request, headers: Headers) {
  const apiKey = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_API_KEY;
  const allowed = (process.env.DIFFMD_MODEL_TESTERS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!apiKey || !allowed.length) return fail(503, 'Model testing is unavailable.', headers);

  const idToken = request.headers.get('X-DiffMD-Workspace-Token');
  if (!idToken || idToken.length > 8192 || !jwt.test(idToken)) {
    return fail(401, 'Sign in with an invited Google account.', headers);
  }

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]);
  try {
    const url = new URL('https://identitytoolkit.googleapis.com/v1/accounts:lookup');
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, {
      ...fetchPolicy, method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return [400, 401, 403].includes(response.status)
        ? fail(401, 'Sign in again to test a model.', headers)
        : fail(503, 'Could not verify your sign-in.', headers);
    }
    const data = record(await readJson(response, 16_384));
    const user = Array.isArray(data?.users) ? record(data.users[0]) : null;
    if (typeof user?.email !== 'string' || user.emailVerified !== true || user.disabled === true ||
        !Array.isArray(user.providerUserInfo) || !user.providerUserInfo.some((provider) => record(provider)?.providerId === 'google.com') ||
        !allowed.includes(user.email.toLowerCase())) {
      return fail(403, 'This account has no model-testing access.', headers);
    }
  } catch {
    return fail(503, 'Could not verify your sign-in.', headers);
  }
  return null;
}

async function invoke(request: Request, headers: Headers, caseId?: string) {
  const deadline = AbortSignal.timeout(caseId ? 125_000 : 45_000);
  const signal = AbortSignal.any([request.signal, deadline]);
  const metadata = new URL('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity');
  metadata.searchParams.set('audience', worker.origin);
  try {
    const identityToken = await fetch(metadata, {
      ...fetchPolicy, signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      headers: { 'Metadata-Flavor': 'Google' },
    });
    const token = (await identityToken.text()).trim();
    if (!identityToken.ok || token.length > 8192 || !jwt.test(token)) return fail(502, 'Could not authenticate to the model.', headers);

    const response = await fetch(worker.endpoint + (caseId ? '/v1/fixture-inference' : '/health'), {
      ...fetchPolicy, signal, method: caseId ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: caseId ? JSON.stringify({ case_id: caseId }) : undefined,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      if (response.status === 429) return fail(429, 'The model is busy. Try again shortly.', headers);
      if (response.status === 504) return fail(504, 'The model timed out.', headers);
      return fail(502, 'The model service returned an error.', headers);
    }
    const output = record(await readJson(response, 32_768));
    const identity = caseId ? record(output?.identity) : output;
    if (identity?.status !== 'ready' || identity.base_revision !== worker.baseRevision ||
        identity.adapter_sha256 !== worker.adapterSha256 || identity.case_file_sha256 !== worker.caseFileSha256 ||
        identity.verified_live_adapter_tensors !== worker.tensors) {
      return fail(502, 'The model identity did not match the expected trained adapter.', headers);
    }
    const verified = { model: 'Qwen3.5 4B', baseRevision: worker.baseRevision, adapterSha256: worker.adapterSha256 };
    if (!caseId) return Response.json({ status: 'ready', ...verified }, { headers });

    const result = record(output?.result);
    if (result?.id !== caseId || typeof result.pass !== 'boolean' || typeof result.critical !== 'boolean' ||
        typeof result.seconds !== 'number' || !Number.isFinite(result.seconds) || result.seconds < 0) {
      return fail(502, 'The model returned an invalid test result.', headers);
    }
    let medications: string[] | null = null;
    if (typeof result.raw === 'string' && result.raw.length <= 4096) {
      try {
        const extracted = record(JSON.parse(result.raw))?.medications;
        if (Array.isArray(extracted) && extracted.length <= 40 &&
            extracted.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 160)) {
          medications = extracted;
        }
      } catch {
        // A malformed extraction is still a scored case failure.
      }
    }
    return Response.json({
      ...verified, caseId, medications, passed: result.pass, critical: result.critical, seconds: result.seconds,
    }, { headers });
  } catch {
    return deadline.aborted ? fail(504, 'The model timed out.', headers) : fail(502, 'Could not reach the model.', headers);
  }
}

export async function GET(request: Request) {
  const headers = responseHeaders(request);
  if (!headers) return new Response(null, { status: 403 });
  return await authorize(request, headers) ?? await invoke(request, headers);
}

export async function POST(request: Request) {
  const headers = responseHeaders(request);
  if (!headers) return new Response(null, { status: 403 });
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return fail(415, 'Send a JSON test case.', headers);
  }

  const accessFailure = await authorize(request, headers);
  if (accessFailure) return accessFailure;

  let test: Record<string, unknown> | null;
  try {
    test = record(await readJson(request, 256));
  } catch (error) {
    return error instanceof RangeError ? fail(413, 'Test request is too large.', headers) : fail(400, 'Invalid JSON request.', headers);
  }
  const caseId = test?.caseId;
  if (!test || Object.keys(test).length !== 1 || typeof caseId !== 'string' || !QWEN_TEST_CASES.includes(caseId)) {
    return fail(400, 'Choose a prepared synthetic case.', headers);
  }

  if (running) return fail(429, 'This model is already running a case.', headers);
  running = true;
  try {
    return await invoke(request, headers, caseId);
  } finally {
    running = false;
  }
}

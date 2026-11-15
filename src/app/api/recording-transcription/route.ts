import {
  isRecordingTranscript, RECORDING_WAV_BYTES,
} from '@/lib/recording-transcription';
import { clerkTrainingEnabled } from '@/lib/clerk-training';
import { trainingAccessError, trainingCaseId, trainingCaseStore } from '@/lib/clerk-training-store';

const headers = { 'Cache-Control': 'no-store' };
const tokenPattern = /^[\w-]+\.[\w-]+\.[\w-]+$/;
let busy = false;

function failure(status: number, error: string) {
  return Response.json({ error }, { status, headers });
}

async function boundedBytes(response: Request | Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        throw new RangeError('body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function workerOrigin() {
  try {
    const url = new URL(process.env.DIFFMD_RECORDING_TRANSCRIPTION_URL ?? '');
    if (url.protocol === 'https:' && url.hostname.endsWith('.run.app') && !url.port &&
        url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash) return url.origin;
  } catch {
    return undefined;
  }
}

async function checkFirebaseAccess(request: Request, project: string, signal: AbortSignal) {
  const token = request.headers.get('X-DiffMD-Workspace-Token');
  const uid = request.headers.get('X-DiffMD-Workspace-UID');
  const id = request.headers.get('X-DiffMD-Case-ID');
  if (!token || token.length > 8192 || !tokenPattern.test(token)) return failure(401, 'sign_in_required');
  if (!uid || !/^[\w-]{1,128}$/.test(uid) || !id || !trainingCaseId.test(id)) {
    return failure(400, 'invalid_case');
  }
  if (request.headers.get('Content-Type') !== 'audio/wav') return failure(415, 'invalid_audio');
  if (Number(request.headers.get('Content-Length')) > RECORDING_WAV_BYTES) return failure(413, 'recording_too_large');

  try {
    const caseUrl = 'https://firestore.googleapis.com/v1/projects/' + project +
      '/databases/(default)/documents/workspaces/' + uid + '/cases/' + id + '?mask.fieldPaths=version';
    const access = await fetch(caseUrl, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      headers: { Authorization: 'Bearer ' + token },
    });
    void access.body?.cancel().catch(() => {});
    if ([401, 403, 404].includes(access.status)) return failure(403, 'case_access_required');
    if (!access.ok) return failure(503, 'unable_to_verify_access');
  } catch {
    return failure(503, 'unable_to_verify_access');
  }
}

async function checkTrainingAccess(request: Request) {
  const access = trainingAccessError(request);
  if (access) return failure(access.status, access.error);
  const id = request.headers.get('X-DiffMD-Case-ID');
  if (!id || !trainingCaseId.test(id)) return failure(400, 'invalid_case');
  try {
    const store = await trainingCaseStore();
    if (!store.records) return failure(store.status, store.error === 'invite_required' ? 'case_access_required' : store.error);
    if (!(await store.records.doc(id).get()).exists) return failure(403, 'case_access_required');
  } catch {
    return failure(503, 'unable_to_verify_access');
  }
}

function trainingWorkerOrigin() {
  const port = process.env.DIFFMD_TRAINING_WHISPER_PORT;
  if (port && /^\d{4,5}$/.test(port) && Number(port) >= 1024 && Number(port) <= 65_535
    && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(process.env.DIFFMD_CLERK_TRAINING_ORIGIN ?? '')) {
    return 'http://127.0.0.1:' + Number(port);
  }
}

export async function POST(request: Request) {
  const origin = clerkTrainingEnabled ? trainingWorkerOrigin() : workerOrigin();
  const project = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_PROJECT ?? '';
  if (!origin || (!clerkTrainingEnabled && !/^[a-z0-9-]+$/.test(project))) return failure(503, 'unavailable');
  if (request.headers.get('Content-Type') !== 'audio/wav') return failure(415, 'invalid_audio');
  if (Number(request.headers.get('Content-Length')) > RECORDING_WAV_BYTES) return failure(413, 'recording_too_large');

  const deadline = AbortSignal.timeout(42_000);
  const signal = AbortSignal.any([request.signal, deadline]);
  const access = clerkTrainingEnabled ? await checkTrainingAccess(request)
    : await checkFirebaseAccess(request, project, signal);
  if (access) return access;

  if (busy) return failure(429, 'busy');
  busy = true;
  try {
    const audio = await boundedBytes(request, RECORDING_WAV_BYTES).catch(() => null);
    if (!audio) return failure(413, 'recording_too_large');
    if (audio.byteLength <= 44) return failure(400, 'invalid_audio');

    const options = { cache: 'no-store', redirect: 'error', signal } as const;
    const workerHeaders: Record<string, string> = { 'Content-Type': 'audio/wav' };
    if (!clerkTrainingEnabled) {
      const metadata = new URL('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity');
      metadata.searchParams.set('audience', origin);
      const response = await fetch(metadata, { ...options, headers: { 'Metadata-Flavor': 'Google' } });
      const providerToken = new TextDecoder().decode(await boundedBytes(response, 8192));
      if (!response.ok || !tokenPattern.test(providerToken)) return failure(502, 'transcription_failed');
      workerHeaders.Authorization = 'Bearer ' + providerToken;
    }

    const result = await fetch(origin + '/transcribe', {
      ...options, signal, method: 'POST', body: audio,
      headers: workerHeaders,
    });
    if (!result.ok) {
      void result.body?.cancel().catch(() => {});
      if (result.status === 422) return failure(422, 'no_speech');
      if (result.status === 400) return failure(400, 'invalid_audio');
      if (result.status === 429) return failure(429, 'busy');
      if (result.status === 504) return failure(504, 'timeout');
      return failure(502, 'transcription_failed');
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await boundedBytes(result, 132_000)));
    if (!isRecordingTranscript(parsed)) return failure(502, 'transcription_failed');
    return Response.json(parsed, { headers });
  } catch {
    return deadline.aborted ? failure(504, 'timeout') : failure(502, 'transcription_failed');
  } finally {
    busy = false;
  }
}

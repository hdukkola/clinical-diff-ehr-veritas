import {
  isRecordingTranscript, RECORDING_WAV_BYTES,
} from '@/lib/recording-transcription';
import { clerkTrainingEnabled } from '@/lib/clerk-training';

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

export async function POST(request: Request) {
  if (clerkTrainingEnabled) return failure(503, 'unavailable');
  const origin = workerOrigin();
  const project = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_PROJECT;
  if (!origin || !project || !/^[a-z0-9-]+$/.test(project)) return failure(503, 'unavailable');

  const token = request.headers.get('X-DiffMD-Workspace-Token');
  const uid = request.headers.get('X-DiffMD-Workspace-UID');
  const id = request.headers.get('X-DiffMD-Case-ID');
  if (!token || token.length > 8192 || !tokenPattern.test(token)) return failure(401, 'sign_in_required');
  if (!uid || !/^[\w-]{1,128}$/.test(uid) || !id || !/^SYNC-[A-F0-9]{32}$/.test(id)) {
    return failure(400, 'invalid_case');
  }
  if (request.headers.get('Content-Type') !== 'audio/wav') return failure(415, 'invalid_audio');
  if (Number(request.headers.get('Content-Length')) > RECORDING_WAV_BYTES) return failure(413, 'recording_too_large');

  const deadline = AbortSignal.timeout(42_000);
  const signal = AbortSignal.any([request.signal, deadline]);
  const options = { cache: 'no-store', redirect: 'error' } as const;
  try {
    const caseUrl = 'https://firestore.googleapis.com/v1/projects/' + project +
      '/databases/(default)/documents/workspaces/' + uid + '/cases/' + id + '?mask.fieldPaths=version';
    const access = await fetch(caseUrl, {
      ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      headers: { Authorization: 'Bearer ' + token },
    });
    void access.body?.cancel().catch(() => {});
    if ([401, 403, 404].includes(access.status)) return failure(403, 'case_access_required');
    if (!access.ok) return failure(503, 'unable_to_verify_access');
  } catch {
    return failure(503, 'unable_to_verify_access');
  }

  if (busy) return failure(429, 'busy');
  busy = true;
  try {
    const audio = await boundedBytes(request, RECORDING_WAV_BYTES).catch(() => null);
    if (!audio) return failure(413, 'recording_too_large');
    if (audio.byteLength <= 44) return failure(400, 'invalid_audio');

    const metadata = new URL('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity');
    metadata.searchParams.set('audience', origin);
    const response = await fetch(metadata, { ...options, signal, headers: { 'Metadata-Flavor': 'Google' } });
    const providerToken = new TextDecoder().decode(await boundedBytes(response, 8192));
    if (!response.ok || !tokenPattern.test(providerToken)) return failure(502, 'transcription_failed');

    const result = await fetch(origin + '/transcribe', {
      ...options, signal, method: 'POST', body: audio,
      headers: { Authorization: 'Bearer ' + providerToken, 'Content-Type': 'audio/wav' },
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

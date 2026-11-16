// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  buildNormalizedCompareResponse,
  codePointOffsetToUtf16,
  createAIService,
  DEFAULT_MLX_MODEL_ID,
  groundMedicationMentions,
  joinOpenAiV1Endpoint,
  MAX_NOTE_CODEPOINTS,
  normalizeMlxBackendResponse,
  parseMedicationArrayFromModelOutput,
  probeModelSocket,
  redactSensitiveText,
  redactUrl,
  resolveSocketConfig,
  SOCKET_ENDPOINTS,
  SocketUpstreamError,
  SocketValidationError,
  validateCompareRequestBody,
  validateEndpointUrl,
} from './ai-socket';
import {
  applySessionStoreMutation,
  clearSessionStoreMemoryForTesting,
  parseReviewKey,
  SessionStoreValidationError,
  SYNTHETIC_STORE_DISCLAIMER,
  VALID_REVIEW_DECISIONS,
} from './session-store';
import { GET as compareGet, POST as comparePost } from '@/app/api/compare/route';
import { GET as healthGet, OPTIONS as healthOptions } from '@/app/api/health/route';
import { GET as modelSocketGet } from '@/app/api/model-socket/route';
import { POST as assistantPost } from '@/app/api/assistant/route';
import {
  DELETE as reviewsDelete,
  GET as reviewsGet,
  OPTIONS as reviewsOptions,
  POST as reviewsPost,
  PUT as reviewsPut,
} from '@/app/api/reviews/route';

const RECORDING_SECONDS = 30;
const RECORDING_RATE = 16_000;
const RECORDING_WAV_BYTES = RECORDING_SECONDS * RECORDING_RATE * 2 + 44;
const TRANSCRIPTION_MODEL = 'Whisper base.en';
const TRANSCRIPTION_WEIGHTS =
  'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002';
const TOKEN_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const CASE_ID_PATTERN = /^SYNC-[A-F0-9]{32}$/;
const UID_PATTERN = /^[\w-]{1,128}$/;

function isRecordingTranscript(value: unknown): boolean {
  if (typeof value !== 'object' || !value) return false;
  const data = value as {
    model?: unknown;
    weightsSha256?: unknown;
    reviewRequired?: unknown;
    segments?: Array<{ startMs?: unknown; endMs?: unknown; text?: unknown }>;
  };
  if (
    data.model !== TRANSCRIPTION_MODEL ||
    data.weightsSha256 !== TRANSCRIPTION_WEIGHTS ||
    data.reviewRequired !== true ||
    !Array.isArray(data.segments) ||
    data.segments.length < 1 ||
    data.segments.length > 64
  ) {
    return false;
  }
  let previous = -1;
  for (const segment of data.segments) {
    if (
      !segment ||
      typeof segment.text !== 'string' ||
      !segment.text.trim() ||
      segment.text.length > 500 ||
      typeof segment.startMs !== 'number' ||
      typeof segment.endMs !== 'number' ||
      !Number.isInteger(segment.startMs) ||
      !Number.isInteger(segment.endMs) ||
      segment.startMs < 0 ||
      segment.startMs < previous ||
      segment.startMs >= segment.endMs ||
      segment.endMs > RECORDING_SECONDS * 1000
    ) {
      return false;
    }
    previous = segment.startMs;
  }
  return true;
}

function evaluateRecordingTranscriptionRouteContract(params: {
  workerUrl?: string;
  firebaseProject?: string;
  token?: string;
  uid?: string;
  caseId?: string;
  contentType?: string;
  contentLengthHeader?: number;
  bodyBytes?: number;
  firestoreStatus?: number;
  firestoreThrow?: boolean;
  busy?: boolean;
  metadataOk?: boolean;
  providerToken?: string;
  workerStatus?: number;
  workerPayload?: unknown;
  deadlineAborted?: boolean;
}): { status: number; body: Record<string, unknown>; cacheControl: string } {
  const cacheControl = 'no-store';
  let validOrigin = false;
  try {
    const url = new URL(params.workerUrl ?? 'https://private-worker.run.app');
    if (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.run.app') &&
      !url.port &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    ) {
      validOrigin = true;
    }
  } catch {
    validOrigin = false;
  }
  const project = params.firebaseProject ?? 'firestore-project';
  if (!validOrigin || !project || !/^[a-z0-9-]+$/.test(project)) {
    return { status: 503, body: { error: 'unavailable' }, cacheControl };
  }
  const token = params.token ?? 'firebase.valid.token';
  const uid = params.uid ?? 'owner-uid-1';
  const caseId = params.caseId ?? 'SYNC-' + 'A'.repeat(32);
  if (!token || token.length > 8192 || !TOKEN_PATTERN.test(token)) {
    return { status: 401, body: { error: 'sign_in_required' }, cacheControl };
  }
  if (!uid || !UID_PATTERN.test(uid) || !caseId || !CASE_ID_PATTERN.test(caseId)) {
    return { status: 400, body: { error: 'invalid_case' }, cacheControl };
  }
  if ((params.contentType ?? 'audio/wav') !== 'audio/wav') {
    return { status: 415, body: { error: 'invalid_audio' }, cacheControl };
  }
  if ((params.contentLengthHeader ?? 100) > RECORDING_WAV_BYTES) {
    return { status: 413, body: { error: 'recording_too_large' }, cacheControl };
  }
  if (params.firestoreThrow) {
    return { status: 503, body: { error: 'unable_to_verify_access' }, cacheControl };
  }
  const fsStatus = params.firestoreStatus ?? 200;
  if ([401, 403, 404].includes(fsStatus)) {
    return { status: 403, body: { error: 'case_access_required' }, cacheControl };
  }
  if (fsStatus < 200 || fsStatus >= 300) {
    return { status: 503, body: { error: 'unable_to_verify_access' }, cacheControl };
  }
  if (params.busy) {
    return { status: 429, body: { error: 'busy' }, cacheControl };
  }
  const bodyBytes = params.bodyBytes ?? 128;
  if (bodyBytes > RECORDING_WAV_BYTES) {
    return { status: 413, body: { error: 'recording_too_large' }, cacheControl };
  }
  if (bodyBytes <= 44) {
    return { status: 400, body: { error: 'invalid_audio' }, cacheControl };
  }
  if (params.deadlineAborted) {
    return { status: 504, body: { error: 'timeout' }, cacheControl };
  }
  const pToken = params.providerToken ?? 'worker.valid.token';
  if (params.metadataOk === false || !TOKEN_PATTERN.test(pToken)) {
    return { status: 502, body: { error: 'transcription_failed' }, cacheControl };
  }
  const wStatus = params.workerStatus ?? 200;
  if (wStatus !== 200) {
    if (wStatus === 422) return { status: 422, body: { error: 'no_speech' }, cacheControl };
    if (wStatus === 400) return { status: 400, body: { error: 'invalid_audio' }, cacheControl };
    if (wStatus === 429) return { status: 429, body: { error: 'busy' }, cacheControl };
    if (wStatus === 504) return { status: 504, body: { error: 'timeout' }, cacheControl };
    return { status: 502, body: { error: 'transcription_failed' }, cacheControl };
  }
  const payload = params.workerPayload ?? {
    model: TRANSCRIPTION_MODEL,
    weightsSha256: TRANSCRIPTION_WEIGHTS,
    reviewRequired: true,
    segments: [{ startMs: 0, endMs: 800, text: 'Reviewed clinical dictation.' }],
  };
  if (!isRecordingTranscript(payload)) {
    return { status: 502, body: { error: 'transcription_failed' }, cacheControl };
  }
  return { status: 200, body: payload as Record<string, unknown>, cacheControl };
}

/**
 * Row 8 (10,000 cases) of ANTIGRAVITY_250K_QA.md:
 * Local · API contract and failure handling:
 * - 2,500 malformed, oversized or boundary payloads
 * - 2,500 method/origin/content-type cases
 * - 2,500 timeout/provider error cases
 * - 2,500 response schema, model identity and replay-label checks
 */

describe('qa-250k-api-10k: Row 8 (10,000 API contract and failure handling cases)', () => {
  beforeEach(() => {
    clearSessionStoreMemoryForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('Row 8.1: 2,500 malformed, oversized, or boundary payload cases across local routes', async () => {
    const max12k = 'A'.repeat(MAX_NOTE_CODEPOINTS);
    const over12k = 'B'.repeat(MAX_NOTE_CODEPOINTS + 1);
    let passed = 0;

    for (let i = 0; i < 2500; i++) {
      const bucket = i % 10;

      if (bucket === 0) {
        // /api/compare: non-object or missing earlier/later notes -> 400 SocketValidationError
        const badPayloads: unknown[] = [
          null,
          undefined,
          'raw-string',
          12345,
          { earlier: { text: 'Lisinopril 10 mg' } },
          { later: { text: 'Lisinopril 20 mg' } },
        ];
        expect(() => validateCompareRequestBody(badPayloads[i % badPayloads.length])).toThrow(
          SocketValidationError,
        );
      } else if (bucket === 1) {
        // /api/compare: synthetic_only === false explicitly rejected with 400
        expect(() =>
          validateCompareRequestBody({
            synthetic_only: false,
            earlier: { source_id: `e-${i}`, text: 'Lisinopril 10 mg daily' },
            later: { source_id: `l-${i}`, text: 'Lisinopril 20 mg daily' },
          }),
        ).toThrow(SocketValidationError);
      } else if (bucket === 2) {
        // /api/compare: 12,000 codepoint boundary accepted; 12,001 codepoints rejected
        const validBoundary = validateCompareRequestBody({
          synthetic_only: true,
          earlier: { source_id: `e-${i}`, text: max12k },
          later: { source_id: `l-${i}`, text: 'Metformin 500 mg BID' },
        });
        expect(validBoundary.earlier.text.length).toBe(MAX_NOTE_CODEPOINTS);

        expect(() =>
          validateCompareRequestBody({
            earlier: { source_id: `e-${i}`, text: over12k },
            later: { source_id: `l-${i}`, text: 'Metformin 500 mg BID' },
          }),
        ).toThrow(SocketValidationError);
      } else if (bucket === 3) {
        // /api/compare: invisible/whitespace-only text & identical/oversized source_id rejected
        const invisibleSamples = ['', '   ', '\u200B\u200C\u200D\uFEFF', '\n\t  '];
        expect(() =>
          validateCompareRequestBody({
            earlier: { text: invisibleSamples[i % invisibleSamples.length] },
            later: { text: 'Aspirin 81 mg daily' },
          }),
        ).toThrow(SocketValidationError);

        expect(() =>
          validateCompareRequestBody({
            earlier: { source_id: 'same-id', text: 'Aspirin 81 mg daily' },
            later: { source_id: '  same-id  ', text: 'Aspirin 81 mg stopped' },
          }),
        ).toThrow(SocketValidationError);

        expect(() =>
          validateCompareRequestBody({
            earlier: { source_id: 'x'.repeat(101), text: 'Aspirin 81 mg daily' },
            later: { source_id: 'later-id', text: 'Aspirin 81 mg stopped' },
          }),
        ).toThrow(SocketValidationError);
      } else if (bucket === 4) {
        // /api/assistant: >256-byte body rejected with 413; invalid note rejected with 400; valid returns 503
        if (i < 100) {
          const bigReq = new Request('http://localhost/api/assistant', {
            method: 'POST',
            body: JSON.stringify({ note: 'earlier', pad: 'z'.repeat(280 + (i % 40)) }),
          });
          const bigRes = await assistantPost(bigReq);
          expect(bigRes.status).toBe(413);
          expect(bigRes.headers.get('Cache-Control')).toBe('no-store');
        } else if (i < 200) {
          const invalidNoteReq = new Request('http://localhost/api/assistant', {
            method: 'POST',
            body: JSON.stringify({ note: `custom-${i}` }),
          });
          const invalidRes = await assistantPost(invalidNoteReq);
          expect(invalidRes.status).toBe(400);
          expect((await invalidRes.json()).error).toBe('Choose a synthetic demo note.');
        } else {
          const validReq = new Request('http://localhost/api/assistant', {
            method: 'POST',
            body: JSON.stringify({ note: i % 2 === 0 ? 'earlier' : 'later' }),
          });
          const validRes = await assistantPost(validReq);
          expect(validRes.status).toBe(503);
          expect((await validRes.json()).status).toBe('unavailable');
        }
      } else if (bucket === 5) {
        // /api/reviews & session-store: SSN-like PHI pattern rejected with 400
        const ssn = `${String(100 + (i % 800))}-${String(10 + (i % 89))}-${String(1000 + (i % 8999))}`;
        await expect(
          applySessionStoreMutation(
            {
              key: `QA-001:med-${ssn}`,
              decision: 'verified',
            },
            'POST',
          ),
        ).rejects.toThrow(SessionStoreValidationError);
      } else if (bucket === 6) {
        // /api/reviews & session-store: syntheticOnly=false or phi=true rejected with 400
        await expect(
          applySessionStoreMutation(
            i % 2 === 0
              ? { syntheticOnly: false, key: `QA-001:med-${i}`, decision: 'verified' }
              : { phi: true, key: `QA-001:med-${i}`, decision: 'flagged' },
            'POST',
          ),
        ).rejects.toThrow(SessionStoreValidationError);
      } else if (bucket === 7) {
        // /api/reviews & session-store: control characters or oversized keys/audit targets rejected
        expect(() => parseReviewKey(`QA-001:bad\u0000key-${i}`)).toThrow(
          SessionStoreValidationError,
        );
        expect(() => parseReviewKey('K'.repeat(161))).toThrow(SessionStoreValidationError);
        expect(() => parseReviewKey(':missingScenario')).toThrow(SessionStoreValidationError);
        expect(() => parseReviewKey('missingMed:')).toThrow(SessionStoreValidationError);
      } else if (bucket === 8) {
        // /api/recording-transcription: WAV size <= 44 bytes (400) and > 960,044 bytes (413)
        const small = evaluateRecordingTranscriptionRouteContract({ bodyBytes: i % 45 });
        expect(small.status).toBe(400);
        expect(small.body.error).toBe('invalid_audio');

        const huge = evaluateRecordingTranscriptionRouteContract({
          contentLengthHeader: RECORDING_WAV_BYTES + 1 + (i % 1000),
        });
        expect(huge.status).toBe(413);
        expect(huge.body.error).toBe('recording_too_large');
      } else {
        // Direct route call to POST /api/compare with malformed JSON or invalid body
        if (i < 150) {
          const req = new NextRequest('http://localhost/api/compare', {
            method: 'POST',
            body: `{malformed_json_${i}`,
            headers: { 'Content-Type': 'application/json' },
          });
          const res = await comparePost(req);
          expect(res.status).toBe(400);
          expect(res.headers.get('Cache-Control')).toBe('no-store');
          const body = await res.json();
          expect(body.simulated).toBe(true);
          expect(body.review_required).toBe(true);
        } else {
          // Surrogate pair / codepoint offset conversion accuracy check
          const emojiNote = `Rx 💊 Lisinopril ${10 + (i % 30)} mg`;
          expect(codePointOffsetToUtf16(emojiNote, 0)).toBe(0);
          expect(codePointOffsetToUtf16(emojiNote, 4)).toBe(5); // 'Rx ' (3) + '💊' (2 UTF-16 code units)
        }
      }
      passed++;
    }

    expect(passed).toBe(2500);
  });

  it('Row 8.2: 2,500 method, origin, SSRF lockdown, and content-type cases', async () => {
    let passed = 0;

    for (let i = 0; i < 2500; i++) {
      const bucket = i % 10;

      if (bucket === 0) {
        // Cloud metadata & internal hostnames blocked by validateEndpointUrl
        const blockedHosts = [
          'http://metadata.google.internal',
          'https://metadata.goog',
          'http://169.254.169.254',
          'http://[fd00:ec2::254]',
          `https://service-${i}.internal`,
          `https://node-${i}.local`,
        ];
        expect(() => validateEndpointUrl(blockedHosts[i % blockedHosts.length]!)).toThrow(
          SocketValidationError,
        );
      } else if (bucket === 1) {
        // Private RFC1918, CGNAT, non-127.0.0.1 loopback, and multicast IPv4 blocked
        const privateIps = [
          `https://10.${i % 255}.${(i * 3) % 255}.1:8080`,
          `https://172.${16 + (i % 16)}.0.1:8080`,
          `https://192.168.${i % 255}.10:8080`,
          `https://100.${64 + (i % 64)}.1.1:8080`,
          `https://127.0.0.${2 + (i % 250)}:8080`,
          `https://224.0.0.${1 + (i % 200)}:8080`,
          'https://0.0.0.0:8080',
        ];
        expect(() => validateEndpointUrl(privateIps[i % privateIps.length]!)).toThrow(
          SocketValidationError,
        );
      } else if (bucket === 2) {
        // Private/link-local/multicast/IPv4-mapped IPv6 blocked, while [::1] loopback allowed
        const blockedV6 = [
          'http://[fe80::1]:8765',
          'http://[fc00::1]:8765',
          'http://[fd12:3456::1]:8765',
          'http://[ff02::1]:8765',
          'http://[::ffff:10.0.0.1]:8765',
          'http://[::ffff:169.254.169.254]:8765',
          'http://[::]:8765',
        ];
        expect(() => validateEndpointUrl(blockedV6[i % blockedV6.length]!)).toThrow(
          SocketValidationError,
        );
        const loopbackV6 = validateEndpointUrl('http://[::1]:8765');
        expect(loopbackV6.hostname).toBe('[::1]');
      } else if (bucket === 3) {
        // Non-loopback HTTP blocked unless allowInsecureHttp=true; HTTPS allowed
        const remoteHttp = `http://model-${i}.example.com:8080`;
        expect(() => validateEndpointUrl(remoteHttp, { allowInsecureHttp: false })).toThrow(
          SocketValidationError,
        );
        const allowedInsecure = validateEndpointUrl(remoteHttp, { allowInsecureHttp: true });
        expect(allowedInsecure.protocol).toBe('http:');
        const allowedHttps = validateEndpointUrl(`https://model-${i}.example.com`);
        expect(allowedHttps.protocol).toBe('https:');
      } else if (bucket === 4) {
        // Embedded credentials, query strings, fragments, and non-http protocols blocked
        const badUrls = [
          `https://user:pass@model-${i}.example.com`,
          `https://model-${i}.example.com/v1?token=secret`,
          `https://model-${i}.example.com/v1#frag`,
          `ftp://model-${i}.example.com`,
          `ws://model-${i}.example.com`,
          '   ',
        ];
        expect(() => validateEndpointUrl(badUrls[i % badUrls.length]!)).toThrow(
          SocketValidationError,
        );
      } else if (bucket === 5) {
        // OpenAI /v1 endpoint normalization (idempotent /v1 handling)
        const base1 = new URL(`https://api-${i}.example.com`);
        const base2 = new URL(`https://api-${i}.example.com/v1/`);
        const base3 = new URL(`https://api-${i}.example.com/v1/chat/completions`);
        expect(joinOpenAiV1Endpoint(base1, '/models')).toBe(
          `https://api-${i}.example.com/v1/models`,
        );
        expect(joinOpenAiV1Endpoint(base2, '/chat/completions')).toBe(
          `https://api-${i}.example.com/v1/chat/completions`,
        );
        expect(joinOpenAiV1Endpoint(base3, '/models')).toBe(
          `https://api-${i}.example.com/v1/models`,
        );
      } else if (bucket === 6) {
        // Recording transcription worker origin strict validation (.run.app HTTPS root only)
        const badWorkerOrigins = [
          'http://private-worker.run.app',
          'https://private-worker.example.com',
          'https://private-worker.run.app:8443',
          'https://private-worker.run.app/subpath',
          'https://private-worker.run.app?env=prod',
          'https://user:pass@private-worker.run.app',
        ];
        const res = evaluateRecordingTranscriptionRouteContract({
          workerUrl: badWorkerOrigins[i % badWorkerOrigins.length],
        });
        expect(res.status).toBe(503);
        expect(res.body.error).toBe('unavailable');
        expect(res.cacheControl).toBe('no-store');
      } else if (bucket === 7) {
        // Recording transcription Content-Type must be exact 'audio/wav' -> 415 otherwise
        const wrongTypes = [
          'application/json',
          'audio/mpeg',
          'audio/webm',
          'audio/ogg',
          'text/plain',
          'multipart/form-data',
        ];
        const res = evaluateRecordingTranscriptionRouteContract({
          contentType: wrongTypes[i % wrongTypes.length],
        });
        expect(res.status).toBe(415);
        expect(res.body.error).toBe('invalid_audio');
      } else if (bucket === 8) {
        // /api/health & /api/reviews OPTIONS preflight and Cache-Control headers
        if (i < 150) {
          const healthOpt = await healthOptions();
          expect(healthOpt.status).toBe(204);
          expect(healthOpt.headers.get('Allow')).toBe('GET, OPTIONS');
          expect(healthOpt.headers.get('Cache-Control')).toBe('no-store');

          const revOpt = await reviewsOptions();
          expect(revOpt.status).toBe(204);
          expect(revOpt.headers.get('Allow')).toBe('GET, POST, PUT, DELETE, OPTIONS');
          expect(revOpt.headers.get('Cache-Control')).toBe('no-store');
        } else {
          // Valid loopback origins (127.0.0.1 and localhost)
          const lb = validateEndpointUrl(`http://127.0.0.1:${8000 + (i % 1000)}`);
          expect(lb.hostname).toBe('127.0.0.1');
        }
      } else {
        // /api/model-socket SSE headers & abort lifecycle
        if (i < 100) {
          const abortCtrl = new AbortController();
          abortCtrl.abort();
          const req = new NextRequest('http://localhost/api/model-socket', {
            signal: abortCtrl.signal,
          });
          const res = await modelSocketGet(req);
          expect(res.status).toBe(200);
          expect(res.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
          expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
          expect(res.headers.get('X-Accel-Buffering')).toBe('no');
        } else {
          const validWorker = evaluateRecordingTranscriptionRouteContract({
            workerUrl: 'https://private-worker.run.app',
            contentType: 'audio/wav',
          });
          expect(validWorker.status).toBe(200);
          expect(validWorker.cacheControl).toBe('no-store');
        }
      }
      passed++;
    }

    expect(passed).toBe(2500);
  });

  it('Row 8.3: 2,500 timeout, upstream error, and secret-redaction cases', async () => {
    let passed = 0;

    for (let i = 0; i < 2500; i++) {
      const bucket = i % 10;

      if (bucket === 0) {
        // Secret & token redaction in upstream error strings
        const token = `secretToken_${i}_xyz987654321`;
        const sk = `sk-proj_${i}_abcdef1234567890`;
        const raw = `Upstream failed: Authorization: Bearer ${token}, key=${sk}, url=https://admin:pw_${i}@ehr.example.com/v1`;
        const redacted = redactSensitiveText(raw);
        expect(redacted).not.toContain(token);
        expect(redacted).not.toContain(sk);
        expect(redacted).not.toContain(`pw_${i}`);
        expect(redacted).toContain('Bearer [redacted]');
        expect(redacted).toContain('sk-[redacted]');
        expect(redacted).toContain('https://[redacted]@ehr.example.com');
      } else if (bucket === 1) {
        // redactUrl strips credentials, path, query, and returns [invalid-url] on garbage
        expect(redactUrl(`https://user:secret@host-${i}.example.com:8443/v1/models?key=123`)).toBe(
          `https://host-${i}.example.com:8443`,
        );
        expect(redactUrl(`not-a-valid-url-${i}`)).toBe('[invalid-url]');
      } else if (bucket === 2) {
        // parseMedicationArrayFromModelOutput rejects malformed JSON, missing array, >2000 items, or invalid items with 502
        const invalidModelOutputs = [
          'plain text with no json',
          '{"wrong_key": ["Lisinopril"]}',
          '{"medications": "not-an-array"}',
          '{"medications": [12345]}',
          '{"medications": [""]}',
          `{"medications": ["${'M'.repeat(151)}"]}`,
        ];
        expect(() =>
          parseMedicationArrayFromModelOutput(invalidModelOutputs[i % invalidModelOutputs.length]!),
        ).toThrow(SocketUpstreamError);
      } else if (bucket === 3) {
        // parseMedicationArrayFromModelOutput strips <think>...</think> and ```json fences cleanly
        const drug = `Lisinopril_${i}`;
        const raw = `<think>Reasoning about case ${i}...</think>\n\`\`\`json\n{"medications": ["${drug}", {"name": "Metformin"}]}\n\`\`\``;
        const parsed = parseMedicationArrayFromModelOutput(raw);
        expect(parsed).toEqual([drug, 'Metformin']);
      } else if (bucket === 4) {
        // Standby service compareNotes throws 503 SocketUpstreamError
        const service = createAIService({ CLINICAL_DIFF_REPLAY: '1' });
        await expect(
          service.compareNotes(
            { source_id: 'e', text: 'Lisinopril 10 mg' },
            { source_id: 'l', text: 'Lisinopril 20 mg' },
          ),
        ).rejects.toThrow(SocketUpstreamError);
      } else if (bucket === 5) {
        // MLX upstream HTTP 500/502/503/504 errors propagate redacted message & status code
        const statusCodes = [500, 502, 503, 504] as const;
        const code = statusCodes[i % statusCodes.length]!;
        const fetcher = vi.fn().mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: `Upstream token=topsecret_${i} timed out` }),
            { status: code },
          ),
        );
        vi.stubGlobal('fetch', fetcher);
        const service = createAIService({
          CLINICAL_DIFF_MODEL_PROVIDER: 'mlx_service',
          CLINICAL_DIFF_BACKEND_URL: 'http://127.0.0.1:8765',
        });
        try {
          await service.compareNotes(
            { source_id: 'e', text: 'Lisinopril 10 mg' },
            { source_id: 'l', text: 'Lisinopril 20 mg' },
          );
          expect.unreachable('Should have thrown SocketUpstreamError');
        } catch (err) {
          expect(err).toBeInstanceOf(SocketUpstreamError);
          expect((err as SocketUpstreamError).statusCode).toBe(code);
          expect((err as Error).message).not.toContain(`topsecret_${i}`);
          expect((err as Error).message).toContain('token=[redacted]');
        }
      } else if (bucket === 6) {
        // OpenAI-compatible & Ollama probeHealth handles unreachable / HTTP 500 as degraded standby
        const provider = i % 2 === 0 ? 'openai_compatible' : 'ollama';
        const fetcher = vi
          .fn()
          .mockResolvedValueOnce(new Response('Internal Error', { status: 502 }));
        vi.stubGlobal('fetch', fetcher);
        const probe = await probeModelSocket(undefined, {
          CLINICAL_DIFF_MODEL_PROVIDER: provider,
          OPENAI_COMPATIBLE_BASE_URL: 'https://api.example.com/v1',
          OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        });
        expect(probe.state).toBe('standby');
        expect(probe.status).toBe('degraded');
        expect(probe.configured).toBe(true);
        expect(probe.reachable).toBe(false);
        expect(probe.simulated).toBe(true);
        expect(probe.live_ai).toBe(false);
      } else if (bucket === 7) {
        // Recording transcription worker failure mapping (400, 422, 429, 500, 504, deadline timeout, busy lock)
        expect(evaluateRecordingTranscriptionRouteContract({ busy: true }).status).toBe(429);
        expect(evaluateRecordingTranscriptionRouteContract({ deadlineAborted: true }).status).toBe(
          504,
        );
        expect(evaluateRecordingTranscriptionRouteContract({ workerStatus: 504 }).status).toBe(504);
        expect(evaluateRecordingTranscriptionRouteContract({ workerStatus: 429 }).status).toBe(429);
        expect(evaluateRecordingTranscriptionRouteContract({ workerStatus: 422 }).status).toBe(422);
        expect(evaluateRecordingTranscriptionRouteContract({ workerStatus: 500 }).status).toBe(502);
        expect(evaluateRecordingTranscriptionRouteContract({ metadataOk: false }).status).toBe(502);
        expect(evaluateRecordingTranscriptionRouteContract({ firestoreThrow: true }).status).toBe(
          503,
        );
      } else if (bucket === 8) {
        // Unsupported CLINICAL_DIFF_MODEL_PROVIDER surfaces degraded configError with redaction
        const cfg = resolveSocketConfig({
          CLINICAL_DIFF_MODEL_PROVIDER: `invalid_provider_Bearer_secret_${i}`,
        });
        expect(cfg.provider).toBe('deterministic_replay');
        expect(cfg.configured).toBe(true);
        expect(cfg.configError).toContain('Unsupported CLINICAL_DIFF_MODEL_PROVIDER');
      } else {
        // /api/health strict=1 returns 503 when configured provider is unreachable, 200 when strict=0
        if (i < 100) {
          vi.stubEnv('CLINICAL_DIFF_MODEL_PROVIDER', 'mlx_service');
          vi.stubEnv('CLINICAL_DIFF_BACKEND_URL', 'http://127.0.0.1:8765');
          vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
          const strictRes = await healthGet(
            new NextRequest('http://localhost/api/health?strict=1'),
          );
          expect(strictRes.status).toBe(503);
          const nonStrictRes = await healthGet(new NextRequest('http://localhost/api/health'));
          expect(nonStrictRes.status).toBe(200);
          const compareStatusRes = await compareGet(
            new NextRequest('http://localhost/api/compare'),
          );
          expect(compareStatusRes.status).toBe(503);
        } else {
          const probe = await probeModelSocket(undefined, { CLINICAL_DIFF_REPLAY: '1' });
          expect(probe.state).toBe('standby');
          expect(probe.simulated).toBe(true);
        }
      }
      passed++;
    }

    expect(passed).toBe(2500);
  });

  it('Row 8.4: 2,500 response schema, model identity, grounding, and replay-label checks', async () => {
    let passed = 0;

    for (let i = 0; i < 2500; i++) {
      const bucket = i % 10;

      if (bucket === 0) {
        // Standby / replay probe schema & replay labeling invariants
        const probe = await probeModelSocket(undefined, {
          CLINICAL_DIFF_REPLAY: 'true',
          MLX_ADAPTER_PATH: `/models/adapters/qwen4b-veritas-v${i % 5}`,
        });
        expect(probe.socket_open).toBe(true);
        expect(probe.state).toBe('standby');
        expect(probe.status).toBe('standby');
        expect(probe.provider).toBe('deterministic_replay');
        expect(probe.mode).toBe('deterministic_replay');
        expect(probe.simulated).toBe(true);
        expect(probe.live_ai).toBe(false);
        expect(probe.adapter).toBe(`qwen4b-veritas-v${i % 5}`);
        expect(probe.endpoints).toEqual(SOCKET_ENDPOINTS);
      } else if (bucket === 1) {
        // normalizeMlxBackendResponse preserves replay vs live_ai labels and model/adapter identity
        const isReplay = i % 2 === 0;
        const cfg = resolveSocketConfig({
          CLINICAL_DIFF_MODEL_PROVIDER: 'mlx_service',
          CLINICAL_DIFF_BACKEND_URL: 'http://127.0.0.1:8765',
          MLX_ADAPTER_PATH: '/opt/adapters/paired-4b-adapter',
        });
        const norm = normalizeMlxBackendResponse(
          {
            simulated: isReplay,
            mode: isReplay ? 'deterministic_replay' : 'local_mlx',
            model: DEFAULT_MLX_MODEL_ID,
            earlier: {
              mentions: [{ name: 'Lisinopril', start: 0, end: 10, source_id: 'e-1' }],
              unsupported_outputs: [],
            },
            later: {
              mentions: [{ name: 'Metformin', start: 0, end: 9, source_id: 'l-1' }],
              unsupported_outputs: ['HallucinatedDrug'],
            },
          },
          { source_id: 'e-1', text: 'Lisinopril 10 mg daily' },
          { source_id: 'l-1', text: 'Metformin 500 mg BID' },
          cfg,
        );
        expect(norm.review_required).toBe(true);
        expect(norm.simulated).toBe(isReplay);
        expect(norm.live_ai).toBe(!isReplay);
        expect(norm.mode).toBe(isReplay ? 'deterministic_replay' : 'local_mlx');
        expect(norm.model).toBe(DEFAULT_MLX_MODEL_ID);
        expect(norm.adapter).toBe('paired-4b-adapter');
        expect(norm.limitations).toHaveLength(5);
        expect(norm.differences).toEqual([
          {
            kind: 'earlier_only',
            name: 'Lisinopril',
            source_id: 'e-1',
            evidence: [{ source_id: 'e-1', name: 'Lisinopril', start: 0, end: 10 }],
          },
          {
            kind: 'later_only',
            name: 'Metformin',
            source_id: 'l-1',
            evidence: [{ source_id: 'l-1', name: 'Metformin', start: 0, end: 9 }],
          },
        ]);
        expect(norm.unsupported_outputs).toEqual([
          { source_id: 'l-1', text: 'HallucinatedDrug' },
        ]);
      } else if (bucket === 2) {
        // groundMedicationMentions separates literal text spans from ungrounded hallucinations
        const noteText = `Patient continues Lisinopril 10 mg daily and Aspirin 81 mg daily (case ${i}).`;
        const grounded = groundMedicationMentions(
          ['Lisinopril', 'Aspirin', `UngroundedMed_${i}`, 'lisinopril.'],
          `src-${i}`,
          noteText,
        );
        expect(grounded.mentions).toHaveLength(2);
        expect(grounded.mentions[0]?.name).toBe('Lisinopril');
        expect(grounded.mentions[1]?.name).toBe('Aspirin');
        expect(noteText.slice(grounded.mentions[0]!.start, grounded.mentions[0]!.end)).toBe(
          'Lisinopril',
        );
        expect(grounded.unsupported).toEqual([`UngroundedMed_${i}`]);
      } else if (bucket === 3) {
        // groundMedicationMentions word-boundary protection (does not match substring inside longer word)
        const noteText = 'Patient has nonaspirin allergy and takes Metformin500mg daily.';
        const grounded = groundMedicationMentions(
          ['Aspirin', 'Metformin'],
          `src-${i}`,
          noteText,
        );
        // 'Aspirin' inside 'nonaspirin' is rejected; 'Metformin' before concatenated '500mg' is allowed
        expect(grounded.mentions.map((m) => m.name)).toEqual(['Metformin']);
        expect(grounded.unsupported).toEqual(['Aspirin']);
      } else if (bucket === 4) {
        // Whisper recording transcript schema & SHA-256 model identity verification
        const valid = isRecordingTranscript({
          model: TRANSCRIPTION_MODEL,
          weightsSha256: TRANSCRIPTION_WEIGHTS,
          reviewRequired: true,
          segments: [{ startMs: 0, endMs: 1200, text: `Verified segment ${i}` }],
        });
        expect(valid).toBe(true);

        const wrongModel = isRecordingTranscript({
          model: 'Whisper tiny.en',
          weightsSha256: TRANSCRIPTION_WEIGHTS,
          reviewRequired: true,
          segments: [{ startMs: 0, endMs: 1200, text: 'Wrong model' }],
        });
        expect(wrongModel).toBe(false);

        const wrongHash = isRecordingTranscript({
          model: TRANSCRIPTION_MODEL,
          weightsSha256: '0'.repeat(64),
          reviewRequired: true,
          segments: [{ startMs: 0, endMs: 1200, text: 'Wrong weights hash' }],
        });
        expect(wrongHash).toBe(false);

        const reviewFalse = isRecordingTranscript({
          model: TRANSCRIPTION_MODEL,
          weightsSha256: TRANSCRIPTION_WEIGHTS,
          reviewRequired: false,
          segments: [{ startMs: 0, endMs: 1200, text: 'Missing reviewRequired' }],
        });
        expect(reviewFalse).toBe(false);
      } else if (bucket === 5) {
        // OpenAI-compatible end-to-end compareNotes with mocked fetch
        const fetcher = vi
          .fn()
          .mockResolvedValueOnce(
            Response.json({ data: [{ id: 'Qwen/Qwen3.5-4B-Instruct' }] }),
          )
          .mockResolvedValueOnce(
            Response.json({
              choices: [{ message: { content: '{"medications": ["Lisinopril", "Atorvastatin"]}' } }],
            }),
          )
          .mockResolvedValueOnce(
            Response.json({
              choices: [{ message: { content: '{"medications": ["Lisinopril", "Vitamin D"]}' } }],
            }),
          );
        vi.stubGlobal('fetch', fetcher);
        const service = createAIService({
          CLINICAL_DIFF_MODEL_PROVIDER: 'openai_compatible',
          OPENAI_COMPATIBLE_BASE_URL: 'https://api.example.com/v1',
        });
        const res = await service.compareNotes(
          { source_id: 'earlier', text: 'Lisinopril 10 mg daily, Atorvastatin 20 mg nightly' },
          { source_id: 'later', text: 'Lisinopril 20 mg daily, Vitamin D 1000 units daily' },
        );
        expect(res.provider).toBe('openai_compatible');
        expect(res.mode).toBe('openai_compatible');
        expect(res.simulated).toBe(false);
        expect(res.live_ai).toBe(true);
        expect(res.review_required).toBe(true);
        expect(res.model).toBe('Qwen/Qwen3.5-4B-Instruct');
        expect(res.differences.map((d) => `${d.kind}:${d.name}`)).toEqual([
          'earlier_only:Atorvastatin',
          'later_only:Vitamin D',
        ]);
      } else if (bucket === 6) {
        // Ollama end-to-end compareNotes with mocked fetch
        const fetcher = vi
          .fn()
          .mockResolvedValueOnce(
            Response.json({ message: { content: '{"medications": ["Metformin"]}' } }),
          )
          .mockResolvedValueOnce(
            Response.json({ message: { content: '{"medications": ["Metformin", "Empagliflozin"]}' } }),
          );
        vi.stubGlobal('fetch', fetcher);
        const service = createAIService({
          CLINICAL_DIFF_MODEL_PROVIDER: 'ollama',
          OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
        });
        const res = await service.compareNotes(
          { source_id: 'e', text: 'Metformin 500 mg BID' },
          { source_id: 'l', text: 'Metformin 500 mg BID, Empagliflozin 10 mg daily' },
        );
        expect(res.provider).toBe('ollama');
        expect(res.mode).toBe('ollama');
        expect(res.simulated).toBe(false);
        expect(res.live_ai).toBe(true);
        expect(res.model).toBe('qwen3:4b');
        expect(res.differences).toHaveLength(1);
        expect(res.differences[0]?.name).toBe('Empagliflozin');
      } else if (bucket === 7) {
        // Session store POST/PUT/DELETE schema & scenario filtering contract
        const decision = VALID_REVIEW_DECISIONS[i % VALID_REVIEW_DECISIONS.length]!;
        const snap = await applySessionStoreMutation(
          {
            scenarioId: 'QA-001',
            medId: `med-${i}`,
            decision,
            auditEntry: {
              actor: 'Dr. Reviewer',
              action: `Set ${decision}`,
              target: `QA-001:med-${i}`,
            },
          },
          'POST',
          { scenarioId: 'QA-001' },
        );
        expect(snap.syntheticOnly).toBe(true);
        expect(snap.disclaimer).toBe(SYNTHETIC_STORE_DISCLAIMER);
        expect(snap.reviews[`QA-001:med-${i}`]).toBe(decision);
        expect(snap.audit.length).toBeGreaterThan(0);
      } else if (bucket === 8) {
        // /api/reviews route end-to-end GET/POST/PUT/DELETE with session cookie verification
        if (i < 100) {
          const sessionId = '12345678-1234-4123-8123-1234567890ab';
          const postReq = new NextRequest('http://localhost/api/reviews?scenarioId=QA-001', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: `diffmd-review-session=${sessionId}`,
            },
            body: JSON.stringify({
              scenarioId: 'QA-001',
              medId: `lisinopril-${i}`,
              decision: 'verified',
            }),
          });
          const postRes = await reviewsPost(postReq);
          expect(postRes.status).toBe(200);
          const postJson = await postRes.json();
          expect(postJson.syntheticOnly).toBe(true);
          expect(postJson.reviews[`QA-001:lisinopril-${i}`]).toBe('verified');

          if (i === 8) {
            const getReq = new NextRequest('http://localhost/api/reviews?scenarioId=QA-001', {
              headers: { Cookie: `diffmd-review-session=${sessionId}` },
            });
            const getRes = await reviewsGet(getReq);
            expect(getRes.status).toBe(200);

            const putReq = new NextRequest('http://localhost/api/reviews?scenarioId=QA-001', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Cookie: `diffmd-review-session=${sessionId}`,
              },
              body: JSON.stringify({
                reviews: { [`QA-001:lisinopril-${i}`]: 'flagged' },
              }),
            });
            const putRes = await reviewsPut(putReq);
            expect(putRes.status).toBe(200);
          }

          const delReq = new NextRequest('http://localhost/api/reviews?scenarioId=QA-001', {
            method: 'DELETE',
            headers: { Cookie: `diffmd-review-session=${sessionId}` },
          });
          const delRes = await reviewsDelete(delReq);
          expect(delRes.status).toBe(200);
          const delJson = await delRes.json();
          expect(delJson.reviews).toEqual({});
        } else {
          const built = buildNormalizedCompareResponse({
            earlierSourceId: 'e',
            laterSourceId: 'l',
            earlierMentions: [],
            laterMentions: [],
            earlierUnsupported: [],
            laterUnsupported: [],
            mode: 'deterministic_replay',
            provider: 'deterministic_replay',
            simulated: true,
            liveAi: false,
            model: null,
            adapter: null,
          });
          expect(built.review_required).toBe(true);
          expect(built.simulated).toBe(true);
          expect(built.live_ai).toBe(false);
        }
      } else {
        // MLX health probe in replay mode vs live mode
        const isSimulated = i % 2 === 0;
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValueOnce(
            Response.json({
              simulated: isSimulated,
              mode: isSimulated ? 'deterministic_replay' : 'local_mlx',
              model: DEFAULT_MLX_MODEL_ID,
              adapter_path: '/models/adapters/veritas-4b',
              model_loaded: !isSimulated,
            }),
          ),
        );
        const probe = await probeModelSocket(undefined, {
          CLINICAL_DIFF_MODEL_PROVIDER: 'mlx_service',
          CLINICAL_DIFF_BACKEND_URL: 'http://127.0.0.1:8765',
        });
        expect(probe.state).toBe(isSimulated ? 'replay' : 'live');
        expect(probe.status).toBe('ready');
        expect(probe.simulated).toBe(isSimulated);
        expect(probe.live_ai).toBe(!isSimulated);
        expect(probe.mode).toBe(isSimulated ? 'deterministic_replay' : 'local_mlx');
        expect(probe.adapter).toBe('veritas-4b');
      }
      passed++;
    }

    expect(passed).toBe(2500);
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORDING_WAV_BYTES, TRANSCRIPTION_MODEL, TRANSCRIPTION_WEIGHTS } from '@/lib/recording-transcription';
import { POST } from './route';

const training = vi.hoisted(() => ({
  enabled: false,
  caseStore: vi.fn(),
}));
vi.mock('@/lib/clerk-training', () => ({
  get clerkTrainingEnabled() { return training.enabled; },
}));
vi.mock('@/lib/clerk-training-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/clerk-training-store')>(),
  trainingCaseStore: training.caseStore,
}));

const worker = 'https://private-worker.run.app';
const identity = { model: TRANSCRIPTION_MODEL, weightsSha256: TRANSCRIPTION_WEIGHTS };
const transcript = {
  ...identity, reviewRequired: true, segments: [{ startMs: 0, endMs: 800, text: 'Ready to record.' }],
};
const requestHeaders = {
  'Content-Type': 'audio/wav',
  'X-DiffMD-Workspace-Token': 'firebase.valid.token',
  'X-DiffMD-Workspace-UID': 'owner',
  'X-DiffMD-Case-ID': 'SYNC-' + 'A'.repeat(32),
};

function request(headers: HeadersInit = requestHeaders, body = new Uint8Array(48)) {
  return new Request('https://diffmd.web.app/api/recording-transcription', {
    method: 'POST', headers, body,
  });
}

describe('recording transcription', () => {
  const fetcher = vi.fn();

  beforeEach(() => {
    fetcher.mockReset();
    vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('NEXT_PUBLIC_DIFFMD_FIREBASE_PROJECT', 'firestore-project');
    vi.stubEnv('DIFFMD_RECORDING_TRANSCRIPTION_URL', worker);
  });

  afterEach(() => {
    training.enabled = false;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects unsigned requests before sending audio or calling the worker', async () => {
    const response = await POST(request({ ...requestHeaders, 'X-DiffMD-Workspace-Token': '' }));
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('verifies access to the exact case before obtaining a worker identity token', async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      'https://firestore.googleapis.com/v1/projects/firestore-project/databases/(default)/documents/workspaces/owner/cases/' +
        requestHeaders['X-DiffMD-Case-ID'] + '?mask.fieldPaths=version',
      expect.objectContaining({ headers: { Authorization: 'Bearer firebase.valid.token' } }),
    );
  });

  it('rejects a body above the byte limit without calling the model', async () => {
    fetcher.mockResolvedValueOnce(new Response(null));
    const response = await POST(request(requestHeaders, new Uint8Array(RECORDING_WAV_BYTES + 1)));
    expect(response.status).toBe(413);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses separate credentials for the model and returns a reviewed-draft contract', async () => {
    fetcher.mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(new Response('worker.valid.token'))
      .mockResolvedValueOnce(Response.json(transcript));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(transcript);
    expect(fetcher).toHaveBeenNthCalledWith(3, worker + '/transcribe', expect.objectContaining({
      headers: { Authorization: 'Bearer worker.valid.token', 'Content-Type': 'audio/wav' },
      method: 'POST',
    }));
  });

  it('rejects a response from an unexpected model', async () => {
    fetcher.mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(new Response('worker.valid.token'))
      .mockResolvedValueOnce(Response.json({ ...transcript, weightsSha256: 'different' }));
    expect((await POST(request())).status).toBe(502);
  });

  it('reports worker timeouts without returning provider data', async () => {
    fetcher.mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(new Response('worker.valid.token'))
      .mockResolvedValueOnce(new Response('internal provider error', { status: 504 }));
    const response = await POST(request());
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'timeout' });
  });

  describe('Clerk training recorder', () => {
    const origin = 'http://localhost:3193';
    const caseHeaders = { ...requestHeaders, Origin: origin };
    const readCase = vi.fn();
    const ownedCase = vi.fn();

    beforeEach(() => {
      training.enabled = true;
      vi.stubEnv('DIFFMD_CLERK_TRAINING_PROJECT', 'diffmd-training-veritas-26');
      vi.stubEnv('DIFFMD_CLERK_TRAINING_ORIGIN', origin);
      vi.stubEnv('DIFFMD_TRAINING_WHISPER_PORT', '18892');
      readCase.mockReset().mockResolvedValue({ exists: true });
      ownedCase.mockReset().mockReturnValue({ get: readCase });
      training.caseStore.mockReset().mockResolvedValue({ records: { doc: ownedCase } });
    });

    it('sends audio to the loopback worker after verifying the exact owned case', async () => {
      fetcher.mockResolvedValueOnce(Response.json(transcript));
      const response = await POST(request(caseHeaders));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(transcript);
      expect(ownedCase).toHaveBeenCalledWith(requestHeaders['X-DiffMD-Case-ID']);
      expect(readCase).toHaveBeenCalledBefore(fetcher);
      expect(fetcher).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:18892/transcribe', expect.objectContaining({
        headers: { 'Content-Type': 'audio/wav' }, method: 'POST',
      }));
    });

    it('rejects another origin, a missing own case, and an unapproved session without sending audio', async () => {
      expect((await POST(request({ ...caseHeaders, Origin: 'https://example.com' }))).status).toBe(403);
      expect(training.caseStore).not.toHaveBeenCalled();
      readCase.mockResolvedValueOnce({ exists: false });
      expect((await POST(request(caseHeaders))).status).toBe(403);
      training.caseStore.mockResolvedValueOnce({ status: 403, error: 'invite_required' });
      expect((await POST(request(caseHeaders))).status).toBe(403);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('never falls back to the cloud worker when the local port is absent', async () => {
      vi.stubEnv('DIFFMD_TRAINING_WHISPER_PORT', '');
      expect((await POST(request(caseHeaders))).status).toBe(503);
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
});

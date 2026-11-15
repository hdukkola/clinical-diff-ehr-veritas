import { createHash } from 'node:crypto';
import { ENCOUNTER_TRANSCRIPT_ID, encounterTurns } from './encounter-transcript';

const LOCAL_MODEL = 'mlx-community/Qwen3.5-4B-4bit';
const LOCAL_REVISION = '0e7ffd5c629ef7719d4cbc04069232580bfa9d9c';
const REMOTE_MODEL = 'ggml-org/Qwen3.5-4B-GGUF';
const REMOTE_REVISION = '8d43d974efc48399cb58957ad49c8b26bf5a109c';
const REMOTE_ARTIFACT_SHA256 = '217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14';
const fingerprint = createHash('sha256')
  .update(JSON.stringify(encounterTurns.map(({ id, speaker, quote }) => [id, speaker, quote])))
  .digest('hex');

export type EncounterInferenceStatus = 'unavailable' | 'timeout' | 'provider-error' | 'busy';

export class EncounterInferenceError extends Error {
  constructor(readonly status: EncounterInferenceStatus) {
    super(status);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EncounterInferenceError('provider-error');
  }
  return value as Record<string, unknown>;
}

async function readProviderResponse(response: Response, maxBytes: number) {
  if (!response.ok || !response.body) throw new EncounterInferenceError('provider-error');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return result + decoder.decode();
    bytes += chunk.value.byteLength;
    if (bytes > maxBytes) {
      void reader.cancel().catch(() => {});
      throw new EncounterInferenceError('provider-error');
    }
    result += decoder.decode(chunk.value, { stream: true });
  }
}

let selectionInProgress = false;

export async function selectEncounterTurns(requestSignal: AbortSignal) {
  const configured = process.env.CLINICAL_DIFF_ENCOUNTER_URL;
  if (!configured) throw new EncounterInferenceError('unavailable');
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new EncounterInferenceError('unavailable');
  }
  const loopback = url.protocol === 'http:' && url.hostname === '127.0.0.1';
  const cloudRun = url.protocol === 'https:' && url.hostname.endsWith('.run.app') && !url.port;
  if (!((loopback && !process.env.K_SERVICE) || cloudRun) || url.pathname !== '/' ||
      url.search || url.hash || url.username || url.password) {
    throw new EncounterInferenceError('unavailable');
  }
  if (selectionInProgress) throw new EncounterInferenceError('busy');

  selectionInProgress = true;
  const deadline = AbortSignal.timeout(24_000);
  const signal = AbortSignal.any([requestSignal, deadline]);
  const options: RequestInit = { signal, redirect: 'error', cache: 'no-store' };
  try {
    const headers = new Headers();
    if (cloudRun) {
      const metadata = new URL('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity');
      metadata.searchParams.set('audience', url.origin);
      const response = await fetch(metadata, {
        ...options,
        headers: { 'Metadata-Flavor': 'Google' },
      });
      const token = await readProviderResponse(response, 8192);
      if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
        throw new EncounterInferenceError('provider-error');
      }
      headers.set('Authorization', `Bearer ${token}`);
    }

    const healthResponse = await fetch(new URL('/health', url), { ...options, headers });
    const health = asRecord(JSON.parse(await readProviderResponse(healthResponse, 4096)));
    const model = loopback ? LOCAL_MODEL : REMOTE_MODEL;
    const revision = loopback ? LOCAL_REVISION : REMOTE_REVISION;
    if (health.status !== 'ready' || health.synthetic_only !== true || health.adapter !== null ||
        health.model !== model || health.revision !== revision ||
        (loopback && health.backend !== 'mlx') ||
        (cloudRun && (health.transcript_sha256 !== fingerprint || health.backend !== 'llama.cpp-cpu' ||
          health.quantization !== 'Q4_K_M' || health.artifact_sha256 !== REMOTE_ARTIFACT_SHA256))) {
      throw new EncounterInferenceError('unavailable');
    }

    headers.set('Content-Type', 'application/json');
    const selectionResponse = await fetch(new URL('/select', url), {
      ...options,
      method: 'POST',
      headers,
      body: JSON.stringify(cloudRun
        ? { transcript_id: ENCOUNTER_TRANSCRIPT_ID, transcript_sha256: fingerprint }
        : { transcript_id: ENCOUNTER_TRANSCRIPT_ID }),
    });
    const selection = asRecord(JSON.parse(await readProviderResponse(selectionResponse, 4096)));
    const ids: unknown = selection.turn_ids;
    if (selection.transcript_id !== ENCOUNTER_TRANSCRIPT_ID ||
        selection.review_required !== true || selection.synthetic_only !== true ||
        (cloudRun && selection.transcript_sha256 !== fingerprint) ||
        !Array.isArray(ids) || !ids.length || ids.length > encounterTurns.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id: unknown) => typeof id !== 'string' || !encounterTurns.some((turn) => turn.id === id))) {
      throw new EncounterInferenceError('provider-error');
    }
    // Assemble the draft from the verified source text in transcript order.
    // Apply section coverage to individual required turns, including the patient's confirmation.
    const selected = encounterTurns.filter(({ id, section }) => section && ids.includes(id));
    if (!selected.length) throw new EncounterInferenceError('provider-error');
    return { selectedIds: selected.map(({ id }) => id), model, revision, run: loopback ? 'local' : 'hosted' } as const;
  } catch (error) {
    if (deadline.aborted) throw new EncounterInferenceError('timeout');
    if (error instanceof EncounterInferenceError) throw error;
    throw new EncounterInferenceError('provider-error');
  } finally {
    selectionInProgress = false;
  }
}

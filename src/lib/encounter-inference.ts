import { createHash } from 'node:crypto';
import { buildNormalizedCompareResponse, groundMedicationMentions } from './ai-socket';
import { SYNTHETIC_ASSISTANT_NOTES, type SyntheticAssistantNote } from './assistant-evidence';
import { AUDIO_SAMPLE, AUDIO_TRANSCRIPTION_CHECKS, type AudioDraft } from './encounter-audio';
import { ENCOUNTER_TRANSCRIPT_ID, encounterTurns } from './encounter-transcript';

const LOCAL_MODEL = 'mlx-community/Qwen3.5-4B-4bit';
const LOCAL_REVISION = '0e7ffd5c629ef7719d4cbc04069232580bfa9d9c';
const REMOTE_MODEL = 'ggml-org/Qwen3.5-4B-GGUF';
const REMOTE_REVISION = '8d43d974efc48399cb58957ad49c8b26bf5a109c';
const REMOTE_ARTIFACT_SHA256 = '217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14';
const WHISPER_ARTIFACT_SHA256 = 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002';
const fingerprint = createHash('sha256')
  .update(JSON.stringify(encounterTurns.map(({ id, speaker, quote }) => [id, speaker, quote])))
  .digest('hex');
const comparisonId = 'morgan-lee-medication-list-v1';
const comparisonFingerprint = createHash('sha256')
  .update(JSON.stringify([SYNTHETIC_ASSISTANT_NOTES.earlier.text, SYNTHETIC_ASSISTANT_NOTES.later.text]))
  .digest('hex');

export type EncounterInferenceStatus = 'unavailable' | 'timeout' | 'provider-error' | 'busy';

export class EncounterInferenceError extends Error {
  constructor(readonly status: EncounterInferenceStatus) {
    super(status);
  }
}

export async function isEmptyEncounterRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return true;
  try {
    let chunk = await reader.read();
    while (!chunk.done && !chunk.value.byteLength) chunk = await reader.read();
    if (chunk.done) return true;
    void reader.cancel().catch(() => {});
    return false;
  } catch {
    return false;
  } finally {
    reader.releaseLock();
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

async function withEncounterProvider<T>(
  requestSignal: AbortSignal,
  runProvider: (provider: {
    health: Record<string, unknown>;
    model: string;
    revision: string;
    run: 'hosted' | 'local';
    select: (pathname: string, payload: unknown, maxBytes: number) => Promise<Record<string, unknown>>;
  }) => Promise<T>,
  requireHosted = false,
) {
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
  if (!(cloudRun || (loopback && !process.env.K_SERVICE && !requireHosted)) || url.pathname !== '/' ||
      url.search || url.hash || url.username || url.password) {
    throw new EncounterInferenceError('unavailable');
  }
  if (selectionInProgress) throw new EncounterInferenceError('busy');

  selectionInProgress = true;
  const deadline = AbortSignal.timeout(cloudRun ? 50_000 : 24_000);
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

    return await runProvider({
      health, model, revision, run: loopback ? 'local' : 'hosted',
      select: async (pathname, payload, maxBytes) => {
        headers.set('Content-Type', 'application/json');
        const response = await fetch(new URL(pathname, url), {
          ...options, method: 'POST', headers, body: JSON.stringify(payload),
        });
        if (response.status === 429) throw new EncounterInferenceError('busy');
        if (response.status === 504) throw new EncounterInferenceError('timeout');
        return asRecord(JSON.parse(await readProviderResponse(response, maxBytes)));
      },
    });
  } catch (error) {
    if (deadline.aborted) throw new EncounterInferenceError('timeout');
    if (error instanceof EncounterInferenceError) throw error;
    throw new EncounterInferenceError('provider-error');
  } finally {
    selectionInProgress = false;
  }
}

function groundComparisonSide(candidates: unknown, side: SyntheticAssistantNote) {
  const source = SYNTHETIC_ASSISTANT_NOTES[side];
  if (!Array.isArray(candidates) || candidates.length > 8 ||
      candidates.some((item) => typeof item !== 'string' || !item.trim() || item.length > 64)) {
    throw new EncounterInferenceError('provider-error');
  }
  const grounded = groundMedicationMentions(candidates, `${side}-note`, source.text);
  const actual = new Set(grounded.mentions.map(({ name }) => name.toLowerCase()));
  // A missed medication would appear to have changed between the two notes.
  if (grounded.unsupported.length || actual.size !== source.medications.length ||
      source.medications.some((name) => !actual.has(name.toLowerCase()))) {
    throw new EncounterInferenceError('provider-error');
  }
  return grounded.mentions;
}

export async function compareBundledNotes(requestSignal: AbortSignal) {
  return withEncounterProvider(requestSignal, async ({ health, model, revision, select }) => {
    const sample = { comparison_id: comparisonId, comparison_sha256: comparisonFingerprint };
    if (health.comparison_id !== sample.comparison_id || health.comparison_sha256 !== sample.comparison_sha256) {
      throw new EncounterInferenceError('unavailable');
    }
    const result = await select('/compare-example', sample, 4096);
    if (result.comparison_id !== sample.comparison_id || result.comparison_sha256 !== sample.comparison_sha256 ||
        result.synthetic_only !== true || result.review_required !== true || typeof result.cached !== 'boolean') {
      throw new EncounterInferenceError('provider-error');
    }
    return {
      ...buildNormalizedCompareResponse({
        earlierSourceId: 'earlier-note',
        laterSourceId: 'later-note',
        earlierMentions: groundComparisonSide(result.earlier, 'earlier'),
        laterMentions: groundComparisonSide(result.later, 'later'),
        earlierUnsupported: [], laterUnsupported: [],
        mode: 'openai_compatible', provider: 'openai_compatible',
        simulated: false, liveAi: true, model, adapter: null,
      }),
      cached: result.cached,
      revision,
    };
  }, true);
}

export async function selectEncounterTurns(requestSignal: AbortSignal) {
  return withEncounterProvider(requestSignal, async ({ model, revision, run, select }) => {
    const body = run === 'hosted'
      ? { transcript_id: ENCOUNTER_TRANSCRIPT_ID, transcript_sha256: fingerprint }
      : { transcript_id: ENCOUNTER_TRANSCRIPT_ID };
    const selection = await select('/select', body, 4096);
    const ids: unknown = selection.turn_ids;
    if (selection.transcript_id !== ENCOUNTER_TRANSCRIPT_ID ||
        selection.review_required !== true || selection.synthetic_only !== true ||
        (run === 'hosted' && selection.transcript_sha256 !== fingerprint) ||
        !Array.isArray(ids) || !ids.length || ids.length > encounterTurns.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id: unknown) => typeof id !== 'string' || !encounterTurns.some((turn) => turn.id === id))) {
      throw new EncounterInferenceError('provider-error');
    }
    // Assemble the draft from the verified source text in transcript order.
    // Apply section coverage to individual required turns, including the patient's confirmation.
    const selected = encounterTurns.filter(({ id, section }) => section && ids.includes(id));
    if (!selected.length) throw new EncounterInferenceError('provider-error');
    return { selectedIds: selected.map(({ id }) => id), model, revision, run };
  });
}

export async function draftFromAudio(requestSignal: AbortSignal): Promise<AudioDraft> {
  return withEncounterProvider(requestSignal, async ({ health, select }) => {
    if (health.audio_id !== AUDIO_SAMPLE.id || health.audio_sha256 !== AUDIO_SAMPLE.sha256 ||
      health.whisper_sha256 !== WHISPER_ARTIFACT_SHA256) {
      throw new EncounterInferenceError('unavailable');
    }
    const result = await select('/audio-draft', { audio_id: AUDIO_SAMPLE.id, audio_sha256: AUDIO_SAMPLE.sha256 }, 24_576);
    if (result.audio_id !== AUDIO_SAMPLE.id || result.audio_sha256 !== AUDIO_SAMPLE.sha256 ||
      result.review_required !== true || result.synthetic_only !== true ||
      typeof result.cached !== 'boolean' || !Array.isArray(result.segments) ||
      result.segments.length < 1 || result.segments.length > 24) {
      throw new EncounterInferenceError('provider-error');
    }
    const ids = new Set<string>();
    let previousStart = -1;
    const segments: AudioDraft['segments'] = result.segments.map((value: unknown) => {
      const { id, startMs, endMs, text } = asRecord(value);
      if (typeof id !== 'string' || !/^a\d\d$/.test(id) || ids.has(id) ||
        typeof startMs !== 'number' || !Number.isInteger(startMs) || startMs < 0 || startMs < previousStart ||
        typeof endMs !== 'number' || !Number.isInteger(endMs) || endMs <= startMs || endMs > 15_000 ||
        typeof text !== 'string' || !text.trim() || text.length > 500 || /[\x00-\x1f\x7f]/.test(text)) {
        throw new EncounterInferenceError('provider-error');
      }
      ids.add(id);
      previousStart = startMs;
      return { id, startMs, endMs, text };
    });
    const failures = result.transcription_checks_failed;
    const draftFailures = result.draft_checks_failed;
    const selected = result.turn_ids;
    if (!isAudioChecksList(failures) || !isAudioChecksList(draftFailures) || (failures.length && draftFailures.length) ||
      !Array.isArray(selected) ||
      new Set(selected).size !== selected.length || selected.some((id) => !ids.has(id)) ||
      (failures.length + draftFailures.length > 0 ? selected.length !== 0 : selected.length === 0)) {
      throw new EncounterInferenceError('provider-error');
    }
    return {
      segments, selectedIds: segments.filter(({ id }) => selected.includes(id)).map(({ id }) => id),
      checksFailed: failures, draftChecksFailed: draftFailures, cached: result.cached,
    };
  }, true);
}

function isAudioChecksList(value: unknown): value is AudioDraft['checksFailed'] {
  return Array.isArray(value) && new Set(value).size === value.length &&
    value.every((item) => typeof item === 'string' && Object.hasOwn(AUDIO_TRANSCRIPTION_CHECKS, item));
}

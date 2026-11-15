/**
 * Always-open AI / model socket & backend adapter layer.
 * Clinical Diff EHR · AI proposes, clinicians verify.
 */

export type ModelProvider =
  | 'mlx_service'
  | 'openai_compatible'
  | 'ollama'
  | 'deterministic_replay';

export type SocketReadiness = 'standby' | 'replay' | 'live';

export type SocketMode =
  | 'local_mlx'
  | 'openai_compatible'
  | 'ollama'
  | 'deterministic_replay'
  | 'unavailable';

export interface SocketEndpoints {
  socket: '/api/model-socket';
  health: '/api/health';
  compare: '/api/compare';
}

export interface SocketStatus {
  socket_open: boolean;
  state: SocketReadiness;
  status: 'ready' | 'standby' | 'degraded';
  provider: ModelProvider;
  configured: boolean;
  reachable: boolean;
  mode: SocketMode;
  simulated: boolean;
  live_ai: boolean;
  model: string | null;
  adapter: string | null;
  model_loaded: boolean;
  endpoints: SocketEndpoints;
  target: string | null;
  checked_at: string;
  detail?: string;
  error?: string;
}

export type HealthProbe = SocketStatus;

export interface CompareNoteInput {
  source_id: string;
  text: string;
}

export interface CompareRequestPayload {
  synthetic_only?: boolean;
  earlier_note?: Partial<CompareNoteInput>;
  later_note?: Partial<CompareNoteInput>;
  earlier?: Partial<CompareNoteInput>;
  later?: Partial<CompareNoteInput>;
}

export interface NormalizedMention {
  source_id: string;
  name: string;
  start: number;
  end: number;
}

export interface NormalizedDifference {
  kind: 'earlier_only' | 'later_only';
  name: string;
  source_id: string;
  evidence: NormalizedMention[];
}

export interface NormalizedCompareResponse {
  disclaimer: string;
  review_required: true;
  limitations: string[];
  mode: SocketMode;
  provider: ModelProvider;
  simulated: boolean;
  live_ai: boolean;
  model: string | null;
  adapter: string | null;
  evidence: NormalizedMention[];
  differences: NormalizedDifference[];
  unsupported_outputs: Array<{ source_id: string; text: string }>;
  earlier: {
    source_id: string;
    mentions: NormalizedMention[];
    unsupported_outputs: string[];
  };
  later: {
    source_id: string;
    mentions: NormalizedMention[];
    unsupported_outputs: string[];
  };
}

export interface AIService {
  readonly id: string;
  readonly provider: ModelProvider;
  readonly label: string;
  probeHealth(signal?: AbortSignal): Promise<SocketStatus>;
  compareNotes(
    earlier: CompareNoteInput,
    later: CompareNoteInput,
    signal?: AbortSignal,
  ): Promise<NormalizedCompareResponse>;
}

export const DEFAULT_MLX_MODEL_ID = 'mlx-community/Qwen3.5-4B-4bit';
export const DEFAULT_LOCAL_LOOPBACK_PORT = 8765;
export const MAX_NOTE_CODEPOINTS = 12000;
export const SOCKET_ENDPOINTS: SocketEndpoints = {
  socket: '/api/model-socket',
  health: '/api/health',
  compare: '/api/compare',
};

const SYNTHETIC_DISCLAIMER =
  'Clinical Diff EHR · AI proposes, clinicians verify. Review required before chart commit.';

const DEFAULT_LIMITATIONS = [
  'Name mentions only; no dose, status, clinical intent, or authorization is inferred.',
  'Absence from an extraction does not establish absence from a source; review both notes.',
  'Exact-name comparison does not match brand names, synonyms or misspellings.',
  'Text matches establish only a literal mention, not its meaning, patient, or current status.',
  'A difference is not a confirmed error, omission, or treatment change; review both sources.',
];

const EXTRACTION_SYSTEM_PROMPT =
  'Extract medication names explicitly written in this fictional note. ' +
  'Return only JSON with a medications array of strings. Do not infer or recommend medications.';

const TRUTHY_FLAGS = new Set(['1', 'true', 'yes', 'on']);
const BLOCKED_METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  '169.254.169.254',
  'fd00:ec2::254',
]);

export class SocketValidationError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SocketValidationError';
    this.statusCode = statusCode;
  }
}

export class SocketUpstreamError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = 'SocketUpstreamError';
    this.statusCode = statusCode;
  }
}

function isTruthyEnv(value: string | undefined): boolean {
  return Boolean(value && TRUTHY_FLAGS.has(value.trim().toLowerCase()));
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, '$1[redacted]@')
    .replace(/Bearer\s+[A-Za-z0-9._\-~+/]+=*/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
    .replace(/\b(api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
}

export function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '[invalid-url]';
  }
}

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isLoopbackHost(rawHost: string): boolean {
  const host = stripIpv6Brackets(rawHost.toLowerCase());
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function parseIpv4Parts(host: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts as [number, number, number, number];
}

function isBlockedIpv4(parts: [number, number, number, number]): boolean {
  const [a, b] = parts;
  if (a === 127 && parts[1] === 0 && parts[2] === 0 && parts[3] === 1) return false; // 127.0.0.1 loopback allowed
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // RFC1918 10.0.0.0/8
  if (a === 127) return true; // Other 127.x ranges
  if (a === 169 && b === 254) return true; // Link-local & cloud metadata 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 172.16.0.0/12
  if (a === 192 && b === 168) return true; // RFC1918 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function isBlockedIpv6(rawHost: string): boolean {
  const host = stripIpv6Brackets(rawHost.toLowerCase());
  if (!host.includes(':')) return false;
  if (host === '::1') return false;
  if (host === '::' || host === '0:0:0:0:0:0:0:0') return true;
  if (host.startsWith('fe80:') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) {
    return true; // Link-local fe80::/10
  }
  if (host.startsWith('fc') || host.startsWith('fd')) {
    return true; // Unique local fc00::/7
  }
  if (host.startsWith('ff')) {
    return true; // Multicast ff00::/8
  }
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice('::ffff:'.length);
    const dotted = parseIpv4Parts(mapped);
    if (dotted) return isBlockedIpv4(dotted);
    const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16);
      const lo = parseInt(hexMatch[2], 16);
      return isBlockedIpv4([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
    }
    return true;
  }
  return false;
}

export function validateEndpointUrl(
  rawUrl: string,
  options?: { allowInsecureHttp?: boolean },
): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new SocketValidationError('Endpoint URL must not be empty.', 500);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SocketValidationError('Endpoint URL is malformed.', 500);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SocketValidationError('Endpoint URL must use http or https.', 500);
  }

  if (parsed.username || parsed.password) {
    throw new SocketValidationError('Embedded credentials in endpoint URLs are forbidden.', 500);
  }

  if (parsed.search || parsed.hash) {
    throw new SocketValidationError('Endpoint base URLs must not include query strings or fragments.', 500);
  }

  const host = stripIpv6Brackets(parsed.hostname.toLowerCase());
  if (!host) {
    throw new SocketValidationError('Endpoint URL is missing a hostname.', 500);
  }

  if (BLOCKED_METADATA_HOSTS.has(host) || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new SocketValidationError('Blocked private/metadata endpoint hostname.', 500);
  }

  const ipv4 = parseIpv4Parts(host);
  if (ipv4 && isBlockedIpv4(ipv4)) {
    throw new SocketValidationError('Blocked private, link-local, or reserved IPv4 endpoint.', 500);
  }

  if (isBlockedIpv6(host)) {
    throw new SocketValidationError('Blocked private, link-local, or reserved IPv6 endpoint.', 500);
  }

  const allowInsecure = options?.allowInsecureHttp ?? false;
  if (parsed.protocol === 'http:' && !isLoopbackHost(host) && !allowInsecure) {
    throw new SocketValidationError('Non-loopback model endpoints must use https.', 500);
  }

  // Normalize trailing slashes on pathname.
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = cleanPath || '/';
  return parsed;
}

function joinEndpoint(base: URL, suffix: string): string {
  const baseStr = base.toString().replace(/\/+$/, '');
  const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${baseStr}${cleanSuffix}`;
}

export function joinOpenAiV1Endpoint(base: URL, suffix: string): string {
  let baseStr = base.toString().replace(/\/+$/, '');
  baseStr = baseStr.replace(/\/(chat\/completions|models)$/i, '');
  const cleanSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  if (baseStr.endsWith('/v1')) {
    return `${baseStr}${cleanSuffix}`;
  }
  return `${baseStr}/v1${cleanSuffix}`;
}

function parseAdapterLabel(rawPath: string | undefined): string | null {
  const trimmed = rawPath?.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
}

function parseLoopbackPort(env: Record<string, string | undefined>): number {
  const raw = env.CLINICAL_DIFF_LOCAL_LOOPBACK_PORT?.trim() || env.CLINICAL_DIFF_PORT?.trim();
  if (!raw) return DEFAULT_LOCAL_LOOPBACK_PORT;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1 || num > 65535) {
    return DEFAULT_LOCAL_LOOPBACK_PORT;
  }
  return num;
}

export interface ResolvedSocketConfig {
  provider: ModelProvider;
  configured: boolean;
  baseUrl: URL | null;
  target: string | null;
  model: string | null;
  explicitModel: boolean;
  adapter: string | null;
  apiKey: string | null;
  configError?: string;
}

function normalizeProviderHint(raw: string | undefined): ModelProvider | 'auto' | null {
  const val = raw?.trim().toLowerCase();
  if (!val || val === 'auto') return 'auto';
  if (val === 'mlx' || val === 'mlx_service' || val === 'local_mlx') return 'mlx_service';
  if (val === 'openai' || val === 'openai_compatible') return 'openai_compatible';
  if (val === 'ollama') return 'ollama';
  if (val === 'replay' || val === 'deterministic_replay') return 'deterministic_replay';
  return null;
}

export function resolveSocketConfig(
  env: Record<string, string | undefined> = process.env,
): ResolvedSocketConfig {
  const adapter = parseAdapterLabel(env.MLX_ADAPTER_PATH);
  if (isTruthyEnv(env.CLINICAL_DIFF_REPLAY)) {
    return {
      provider: 'deterministic_replay',
      configured: false,
      baseUrl: null,
      target: null,
      model: null,
      explicitModel: false,
      adapter,
      apiKey: null,
    };
  }

  const hintRaw = env.CLINICAL_DIFF_MODEL_PROVIDER;
  const hint = normalizeProviderHint(hintRaw);
  const allowInsecure = isTruthyEnv(env.CLINICAL_DIFF_ALLOW_INSECURE_HTTP);
  const backendUrlRaw = env.CLINICAL_DIFF_BACKEND_URL?.trim();
  const openaiUrlRaw = env.OPENAI_COMPATIBLE_BASE_URL?.trim();
  const ollamaUrlRaw = env.OLLAMA_BASE_URL?.trim();
  const loopbackPort = parseLoopbackPort(env);
  const loopbackEnabled = isTruthyEnv(env.CLINICAL_DIFF_LOCAL_LOOPBACK_ENABLED);
  const sharedApiKey =
    env.CLINICAL_DIFF_API_KEY?.trim() ||
    env.OPENAI_API_KEY?.trim() ||
    env.HF_TOKEN?.trim() ||
    null;

  if (hint === null && hintRaw?.trim()) {
    return {
      provider: 'deterministic_replay',
      configured: true,
      baseUrl: null,
      target: null,
      model: null,
      explicitModel: false,
      adapter,
      apiKey: null,
      configError: `Unsupported CLINICAL_DIFF_MODEL_PROVIDER: ${redactSensitiveText(hintRaw.trim())}`,
    };
  }

  let selected: ModelProvider = 'deterministic_replay';
  if (hint && hint !== 'auto') {
    selected = hint;
  } else if (backendUrlRaw) {
    selected = 'mlx_service';
  } else if (openaiUrlRaw) {
    selected = 'openai_compatible';
  } else if (ollamaUrlRaw) {
    selected = 'ollama';
  } else if (loopbackEnabled) {
    selected = 'mlx_service';
  }

  if (selected === 'deterministic_replay') {
    return {
      provider: 'deterministic_replay',
      configured: false,
      baseUrl: null,
      target: null,
      model: null,
      explicitModel: false,
      adapter,
      apiKey: null,
    };
  }

  if (selected === 'mlx_service') {
    const rawExplicit = env.MLX_MODEL_ID?.trim() || env.CLINICAL_DIFF_MODEL_ID?.trim();
    const model = rawExplicit || DEFAULT_MLX_MODEL_ID;
    const rawUrl = backendUrlRaw || `http://127.0.0.1:${loopbackPort}`;
    try {
      const baseUrl = validateEndpointUrl(rawUrl, { allowInsecureHttp: allowInsecure });
      return {
        provider: 'mlx_service',
        configured: true,
        baseUrl,
        target: redactUrl(baseUrl.toString()),
        model,
        explicitModel: Boolean(rawExplicit),
        adapter,
        apiKey: sharedApiKey,
      };
    } catch (err) {
      return {
        provider: 'mlx_service',
        configured: true,
        baseUrl: null,
        target: redactUrl(rawUrl),
        model,
        explicitModel: Boolean(rawExplicit),
        adapter,
        apiKey: sharedApiKey,
        configError: err instanceof Error ? redactSensitiveText(err.message) : 'Invalid MLX backend URL.',
      };
    }
  }

  if (selected === 'openai_compatible') {
    const rawExplicit = env.CLINICAL_DIFF_MODEL_ID?.trim() || env.MLX_MODEL_ID?.trim();
    const model = rawExplicit || 'Qwen/Qwen3.5-4B';
    if (!openaiUrlRaw) {
      return {
        provider: 'openai_compatible',
        configured: false,
        baseUrl: null,
        target: null,
        model,
        explicitModel: Boolean(rawExplicit),
        adapter: null,
        apiKey: sharedApiKey,
        configError: 'OPENAI_COMPATIBLE_BASE_URL is not configured.',
      };
    }
    try {
      const baseUrl = validateEndpointUrl(openaiUrlRaw, { allowInsecureHttp: allowInsecure });
      return {
        provider: 'openai_compatible',
        configured: true,
        baseUrl,
        target: redactUrl(baseUrl.toString()),
        model,
        explicitModel: Boolean(rawExplicit),
        adapter: null,
        apiKey: sharedApiKey,
      };
    } catch (err) {
      return {
        provider: 'openai_compatible',
        configured: true,
        baseUrl: null,
        target: redactUrl(openaiUrlRaw),
        model,
        explicitModel: Boolean(rawExplicit),
        adapter: null,
        apiKey: sharedApiKey,
        configError: err instanceof Error ? redactSensitiveText(err.message) : 'Invalid OpenAI-compatible URL.',
      };
    }
  }

  // selected === 'ollama'
  const rawExplicit = env.CLINICAL_DIFF_MODEL_ID?.trim() || env.MLX_MODEL_ID?.trim();
  const model = rawExplicit || 'qwen3:4b';
  const rawOllama = ollamaUrlRaw || 'http://127.0.0.1:11434';
  try {
    const baseUrl = validateEndpointUrl(rawOllama, { allowInsecureHttp: allowInsecure });
    return {
      provider: 'ollama',
      configured: true,
      baseUrl,
      target: redactUrl(baseUrl.toString()),
      model,
      explicitModel: Boolean(rawExplicit),
      adapter: null,
      apiKey: null,
    };
  } catch (err) {
    return {
      provider: 'ollama',
      configured: true,
      baseUrl: null,
      target: redactUrl(rawOllama),
      model,
      explicitModel: Boolean(rawExplicit),
      adapter: null,
      apiKey: null,
      configError: err instanceof Error ? redactSensitiveText(err.message) : 'Invalid Ollama base URL.',
    };
  }
}

export function codePointOffsetToUtf16(text: string, cpOffset: number): number {
  if (cpOffset <= 0) return 0;
  let utf16 = 0;
  let cp = 0;
  for (const ch of text) {
    if (cp >= cpOffset) break;
    utf16 += ch.length;
    cp += 1;
  }
  return utf16;
}

function stripInvisibleEdges(text: string): string {
  return text.replace(/^[\s\u200B-\u200D\u2060\uFEFF\u00AD]+|[\s\u200B-\u200D\u2060\uFEFF\u00AD]+$/g, '');
}

function hasVisibleText(text: string): boolean {
  return stripInvisibleEdges(text).length > 0;
}

function foldKey(text: string): string {
  return stripInvisibleEdges(text)
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/\u0130|\u0131/g, 'i')
    .toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HYPHEN_CHARS = new Set(['-', '_', '\u2010', '\u2011']);
const CONCAT_DOSE_RE = /^\d+(?:\.\d+)?(?:mg|mcg|ug|g|ml|iu|meq|mmol|units?|u)(?![a-zA-Z0-9_-])/i;

function isWordBoundary(text: string, start: number, end: number): boolean {
  if (start > 0) {
    const prev = text[start - 1];
    if (/[\p{L}\p{N}\p{M}]/u.test(prev) || HYPHEN_CHARS.has(prev)) {
      return false;
    }
  }
  if (end < text.length) {
    const next = text[end];
    if (HYPHEN_CHARS.has(next) || /\p{M}/u.test(next)) {
      return false;
    }
    if (/[\p{L}\p{N}]/u.test(next)) {
      const lastMatched = text[end - 1];
      if (!(/\p{L}/u.test(lastMatched) && CONCAT_DOSE_RE.test(text.slice(end)))) {
        return false;
      }
    }
  }
  return true;
}

export function parseMedicationArrayFromModelOutput(rawText: string): string[] {
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleaned);
  if (fencedMatch?.[1]) {
    cleaned = fencedMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const objMatch = /\{[\s\S]*\}/.exec(cleaned);
    const arrMatch = /\[[\s\S]*\]/.exec(cleaned);
    const candidate = objMatch?.[0] ?? arrMatch?.[0];
    if (!candidate) {
      throw new SocketUpstreamError('Model output was not valid JSON; review source manually.', 502);
    }
    try {
      parsed = JSON.parse(candidate);
    } catch {
      throw new SocketUpstreamError('Model output was not valid JSON; review source manually.', 502);
    }
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).medications)
      ? ((parsed as Record<string, unknown>).medications as unknown[])
      : null;

  if (!items || items.length > 2000) {
    throw new SocketUpstreamError('Model output did not contain a medications array.', 502);
  }

  const out: string[] = [];
  for (const item of items) {
    let rawName: string | null = null;
    if (typeof item === 'string') {
      rawName = item;
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      if (typeof rec.name === 'string') rawName = rec.name;
      else if (typeof rec.medication === 'string') rawName = rec.medication;
    }
    if (rawName === null) {
      throw new SocketUpstreamError('Model returned invalid medication entries.', 502);
    }
    const trimmed = stripInvisibleEdges(rawName);
    if (!trimmed || trimmed.length > 150) {
      throw new SocketUpstreamError('Model returned invalid medication entries.', 502);
    }
    out.push(trimmed);
  }
  return out;
}

export function groundMedicationMentions(
  candidates: string[],
  sourceId: string,
  noteText: string,
): { mentions: NormalizedMention[]; unsupported: string[] } {
  const seenKeys = new Set<string>();
  const uniqueQueries: Array<{ display: string; key: string | null }> = [];

  for (const raw of candidates) {
    const trimmed = stripInvisibleEdges(raw);
    const strippedPunct = trimmed.replace(/[.,;:]+$/, '');
    if (!strippedPunct || !/[\p{L}\p{N}]/u.test(strippedPunct)) {
      const k = foldKey(trimmed);
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        uniqueQueries.push({ display: trimmed, key: null });
      }
      continue;
    }
    const k = foldKey(strippedPunct);
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      uniqueQueries.push({ display: strippedPunct, key: k });
    }
  }

  const nfcNote = noteText.normalize('NFC');
  const foldedChars: string[] = [];
  const startMap: number[] = [];
  const endMap: number[] = [];

  for (let i = 0; i < nfcNote.length; ) {
    if (/\s/.test(nfcNote[i])) {
      let j = i + 1;
      while (j < nfcNote.length && /\s/.test(nfcNote[j])) j += 1;
      foldedChars.push(' ');
      startMap.push(i);
      endMap.push(j);
      i = j;
    } else {
      const ch = nfcNote[i];
      foldedChars.push(ch === '\u0130' || ch === '\u0131' ? 'i' : ch.toLowerCase());
      startMap.push(i);
      endMap.push(i + 1);
      i += 1;
    }
  }
  const foldedNote = foldedChars.join('');

  const mentions: NormalizedMention[] = [];
  const unsupported: string[] = [];
  const seenSpans = new Set<string>();

  for (const query of uniqueQueries) {
    if (!query.key) {
      unsupported.push(query.display);
      continue;
    }
    const regex = new RegExp(escapeRegExp(query.key), 'g');
    let matchedAny = false;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(foldedNote)) !== null) {
      const ms = m.index;
      const me = ms + m[0].length;
      if (!isWordBoundary(foldedNote, ms, me)) continue;
      const origStart = startMap[ms];
      const origEnd = endMap[me - 1];
      matchedAny = true;
      const spanKey = `${origStart}:${origEnd}`;
      if (!seenSpans.has(spanKey)) {
        seenSpans.add(spanKey);
        mentions.push({
          source_id: sourceId,
          name: nfcNote.slice(origStart, origEnd),
          start: origStart,
          end: origEnd,
        });
      }
    }
    if (!matchedAny) {
      unsupported.push(query.display);
    }
  }

  mentions.sort((a, b) => a.start - b.start || a.end - b.end);
  return { mentions, unsupported };
}

export function buildNormalizedCompareResponse(params: {
  earlierSourceId: string;
  laterSourceId: string;
  earlierMentions: NormalizedMention[];
  laterMentions: NormalizedMention[];
  earlierUnsupported: string[];
  laterUnsupported: string[];
  mode: SocketMode;
  provider: ModelProvider;
  simulated: boolean;
  liveAi: boolean;
  model: string | null;
  adapter: string | null;
  disclaimer?: string;
  limitations?: string[];
}): NormalizedCompareResponse {
  const oldMap = new Map<string, NormalizedMention>();
  for (const item of params.earlierMentions) {
    const key = foldKey(item.name);
    if (!oldMap.has(key)) oldMap.set(key, item);
  }
  const newMap = new Map<string, NormalizedMention>();
  for (const item of params.laterMentions) {
    const key = foldKey(item.name);
    if (!newMap.has(key)) newMap.set(key, item);
  }

  const allKeys = Array.from(new Set([...oldMap.keys(), ...newMap.keys()])).sort();
  const differences: NormalizedDifference[] = [];
  for (const key of allKeys) {
    const oldItem = oldMap.get(key);
    const newItem = newMap.get(key);
    if (oldItem && !newItem) {
      differences.push({
        kind: 'earlier_only',
        name: oldItem.name,
        source_id: oldItem.source_id,
        evidence: [oldItem],
      });
    } else if (newItem && !oldItem) {
      differences.push({
        kind: 'later_only',
        name: newItem.name,
        source_id: newItem.source_id,
        evidence: [newItem],
      });
    }
  }

  const evidence = [...params.earlierMentions, ...params.laterMentions];
  const unsupported_outputs = [
    ...params.earlierUnsupported.map((text) => ({ source_id: params.earlierSourceId, text })),
    ...params.laterUnsupported.map((text) => ({ source_id: params.laterSourceId, text })),
  ];

  return {
    disclaimer: params.disclaimer || SYNTHETIC_DISCLAIMER,
    review_required: true,
    limitations: params.limitations && params.limitations.length > 0 ? params.limitations : DEFAULT_LIMITATIONS,
    mode: params.mode,
    provider: params.provider,
    simulated: params.simulated,
    live_ai: params.liveAi,
    model: params.model,
    adapter: params.adapter,
    evidence,
    differences,
    unsupported_outputs,
    earlier: {
      source_id: params.earlierSourceId,
      mentions: params.earlierMentions,
      unsupported_outputs: params.earlierUnsupported,
    },
    later: {
      source_id: params.laterSourceId,
      mentions: params.laterMentions,
      unsupported_outputs: params.laterUnsupported,
    },
  };
}

export function normalizeMlxBackendResponse(
  raw: Record<string, unknown>,
  earlier: CompareNoteInput,
  later: CompareNoteInput,
  config: ResolvedSocketConfig,
): NormalizedCompareResponse {
  const earlierRaw = (raw.earlier ?? {}) as Record<string, unknown>;
  const laterRaw = (raw.later ?? {}) as Record<string, unknown>;

  const convertMentions = (
    list: unknown,
    fallbackSourceId: string,
    noteText: string,
  ): NormalizedMention[] => {
    if (!Array.isArray(list)) return [];
    const out: NormalizedMention[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name : '';
      const sourceId = typeof rec.source_id === 'string' ? rec.source_id : fallbackSourceId;
      const rawStart = typeof rec.start === 'number' ? rec.start : 0;
      const rawEnd = typeof rec.end === 'number' ? rec.end : rawStart;
      out.push({
        source_id: sourceId,
        name,
        start: codePointOffsetToUtf16(noteText, rawStart),
        end: codePointOffsetToUtf16(noteText, rawEnd),
      });
    }
    return out;
  };

  const earlierMentions = convertMentions(earlierRaw.mentions, earlier.source_id, earlier.text);
  const laterMentions = convertMentions(laterRaw.mentions, later.source_id, later.text);
  const earlierUnsupported = Array.isArray(earlierRaw.unsupported_outputs)
    ? earlierRaw.unsupported_outputs.filter((x): x is string => typeof x === 'string')
    : [];
  const laterUnsupported = Array.isArray(laterRaw.unsupported_outputs)
    ? laterRaw.unsupported_outputs.filter((x): x is string => typeof x === 'string')
    : [];

  const simulated = Boolean(raw.simulated);
  const mode: SocketMode =
    raw.mode === 'deterministic_replay'
      ? 'deterministic_replay'
      : raw.mode === 'local_mlx'
        ? 'local_mlx'
        : simulated
          ? 'deterministic_replay'
          : 'local_mlx';

  return buildNormalizedCompareResponse({
    earlierSourceId: earlier.source_id,
    laterSourceId: later.source_id,
    earlierMentions,
    laterMentions,
    earlierUnsupported,
    laterUnsupported,
    mode,
    provider: 'mlx_service',
    simulated,
    liveAi: typeof raw.live_ai === 'boolean' ? raw.live_ai : !simulated,
    model: typeof raw.model === 'string' ? raw.model : config.model,
    adapter:
      typeof raw.adapter_path === 'string'
        ? parseAdapterLabel(raw.adapter_path)
        : config.adapter,
    disclaimer: typeof raw.disclaimer === 'string' ? raw.disclaimer : SYNTHETIC_DISCLAIMER,
    limitations: Array.isArray(raw.limitations)
      ? raw.limitations.filter((x): x is string => typeof x === 'string')
      : DEFAULT_LIMITATIONS,
  });
}

export function validateCompareRequestBody(body: unknown): {
  earlier: CompareNoteInput;
  later: CompareNoteInput;
} {
  if (!body || typeof body !== 'object') {
    throw new SocketValidationError('Request body must be a JSON object.', 400);
  }
  const rec = body as CompareRequestPayload;
  if (rec.synthetic_only === false) {
    throw new SocketValidationError('Set synthetic_only to true; use fictional records only.', 400);
  }

  const rawEarlier = rec.earlier ?? rec.earlier_note;
  const rawLater = rec.later ?? rec.later_note;
  if (!rawEarlier || typeof rawEarlier !== 'object' || !rawLater || typeof rawLater !== 'object') {
    throw new SocketValidationError('Both earlier_note and later_note objects are required.', 400);
  }

  const earlierText = typeof rawEarlier.text === 'string' ? rawEarlier.text : '';
  const laterText = typeof rawLater.text === 'string' ? rawLater.text : '';
  if (
    !hasVisibleText(earlierText) ||
    !hasVisibleText(laterText) ||
    Array.from(earlierText).length > MAX_NOTE_CODEPOINTS ||
    Array.from(laterText).length > MAX_NOTE_CODEPOINTS
  ) {
    throw new SocketValidationError(
      'Both earlier_note.text and later_note.text must be 1..12,000 characters of fictional text.',
      400,
    );
  }

  const earlierId =
    typeof rawEarlier.source_id === 'string' && hasVisibleText(rawEarlier.source_id)
      ? rawEarlier.source_id.trim()
      : 'earlier-note';
  const laterId =
    typeof rawLater.source_id === 'string' && hasVisibleText(rawLater.source_id)
      ? rawLater.source_id.trim()
      : 'later-note';

  if (earlierId.length > 100 || laterId.length > 100) {
    throw new SocketValidationError('source_id must be at most 100 characters.', 400);
  }

  if (earlierId.normalize('NFC') === laterId.normalize('NFC')) {
    throw new SocketValidationError('Source IDs must be distinct.', 400);
  }

  return {
    earlier: { source_id: earlierId, text: earlierText },
    later: { source_id: laterId, text: laterText },
  };
}

function combineSignals(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!externalSignal) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([timeoutSignal, externalSignal]);
  }
  return externalSignal;
}

class StandbyReplayAIService implements AIService {
  readonly id = 'deterministic-replay-standby';
  readonly provider: ModelProvider = 'deterministic_replay';
  readonly label = 'Local rule-based extractor (standby)';
  private readonly config: ResolvedSocketConfig;

  constructor(config: ResolvedSocketConfig) {
    this.config = config;
  }

  async probeHealth(): Promise<SocketStatus> {
    const hasError = Boolean(this.config.configError);
    return {
      socket_open: true,
      state: 'standby',
      status: hasError ? 'degraded' : 'standby',
      provider: this.config.provider,
      configured: this.config.configured,
      reachable: false,
      mode: hasError ? 'unavailable' : 'deterministic_replay',
      simulated: true,
      live_ai: false,
      model: this.config.model,
      adapter: this.config.adapter,
      model_loaded: false,
      endpoints: SOCKET_ENDPOINTS,
      target: this.config.target,
      checked_at: new Date().toISOString(),
      detail:
        this.config.configError ||
        'Model socket open on standby; no external model backend configured. Using local rule-based extractor.',
      ...(this.config.configError ? { error: this.config.configError } : {}),
    };
  }

  async compareNotes(): Promise<NormalizedCompareResponse> {
    throw new SocketUpstreamError(
      this.config.configError || 'No live AI provider is configured; socket is in standby.',
      503,
    );
  }
}

class MlxSocketAIService implements AIService {
  readonly id = 'mlx-service-socket';
  readonly provider: ModelProvider = 'mlx_service';
  readonly label = 'Local / Tunneled MLX Service';
  private readonly config: ResolvedSocketConfig;

  constructor(config: ResolvedSocketConfig) {
    this.config = config;
  }

  private buildHeaders(includeJsonContentType = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  async probeHealth(signal?: AbortSignal): Promise<SocketStatus> {
    const checkedAt = new Date().toISOString();
    if (!this.config.baseUrl || this.config.configError) {
      return {
        socket_open: true,
        state: 'standby',
        status: 'degraded',
        provider: 'mlx_service',
        configured: this.config.configured,
        reachable: false,
        mode: 'unavailable',
        simulated: true,
        live_ai: false,
        model: this.config.model,
        adapter: this.config.adapter,
        model_loaded: false,
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        error: this.config.configError || 'MLX backend URL is invalid.',
      };
    }

    try {
      const res = await fetch(joinEndpoint(this.config.baseUrl, '/health'), {
        method: 'GET',
        headers: this.buildHeaders(false),
        cache: 'no-store',
        redirect: 'error',
        signal: combineSignals(5000, signal),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return {
          socket_open: true,
          state: 'standby',
          status: 'degraded',
          provider: 'mlx_service',
          configured: true,
          reachable: false,
          mode: 'unavailable',
          simulated: true,
          live_ai: false,
          model: this.config.model,
          adapter: this.config.adapter,
          model_loaded: false,
          endpoints: SOCKET_ENDPOINTS,
          target: this.config.target,
          checked_at: checkedAt,
          error:
            typeof data.error === 'string'
              ? redactSensitiveText(data.error)
              : `MLX health returned HTTP ${res.status}`,
        };
      }

      const simulated = Boolean(data.simulated) || data.mode === 'deterministic_replay';
      const state: SocketReadiness = simulated ? 'replay' : 'live';
      const model = typeof data.model === 'string' && data.model.trim() ? data.model.trim() : this.config.model;
      const adapter =
        typeof data.adapter_path === 'string'
          ? parseAdapterLabel(data.adapter_path)
          : this.config.adapter;

      return {
        socket_open: true,
        state,
        status: 'ready',
        provider: 'mlx_service',
        configured: true,
        reachable: true,
        mode: simulated ? 'deterministic_replay' : 'local_mlx',
        simulated,
        live_ai: !simulated,
        model,
        adapter,
        model_loaded: Boolean(data.model_loaded),
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        detail: simulated
          ? 'MLX backend connected in deterministic replay mode.'
          : `MLX backend connected (${model ?? DEFAULT_MLX_MODEL_ID}).`,
      };
    } catch (err) {
      return {
        socket_open: true,
        state: 'standby',
        status: 'degraded',
        provider: 'mlx_service',
        configured: true,
        reachable: false,
        mode: 'unavailable',
        simulated: true,
        live_ai: false,
        model: this.config.model,
        adapter: this.config.adapter,
        model_loaded: false,
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        error: err instanceof Error ? redactSensitiveText(err.message) : 'Unable to reach MLX backend.',
      };
    }
  }

  async compareNotes(
    earlier: CompareNoteInput,
    later: CompareNoteInput,
    signal?: AbortSignal,
  ): Promise<NormalizedCompareResponse> {
    if (!this.config.baseUrl) {
      throw new SocketUpstreamError(this.config.configError || 'MLX backend URL is not configured.', 503);
    }

    const res = await fetch(joinEndpoint(this.config.baseUrl, '/compare'), {
      method: 'POST',
      headers: this.buildHeaders(true),
      body: JSON.stringify({
        synthetic_only: true,
        earlier,
        later,
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: combineSignals(30000, signal),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof data.error === 'string'
          ? redactSensitiveText(data.error)
          : `MLX compare returned HTTP ${res.status}`;
      throw new SocketUpstreamError(msg, res.status >= 400 ? res.status : 502);
    }

    return normalizeMlxBackendResponse(data, earlier, later, this.config);
  }
}

class OpenAiCompatibleAIService implements AIService {
  readonly id = 'openai-compatible-socket';
  readonly provider: ModelProvider = 'openai_compatible';
  readonly label = 'OpenAI-compatible endpoint';
  private readonly config: ResolvedSocketConfig;
  private discoveredModel: string | null = null;

  constructor(config: ResolvedSocketConfig) {
    this.config = config;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  private getEffectiveModel(): string | null {
    if (this.config.explicitModel) {
      return this.config.model;
    }
    return this.discoveredModel || this.config.model;
  }

  private extractFirstModelId(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const rec = data as Record<string, unknown>;
    const list = Array.isArray(rec.data)
      ? rec.data
      : Array.isArray(rec.models)
        ? rec.models
        : [];
    for (const entry of list) {
      if (typeof entry === 'string' && entry.trim()) return entry.trim();
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.id === 'string' && obj.id.trim()) return obj.id.trim();
        if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
      }
    }
    return null;
  }

  private async resolveActiveModel(signal?: AbortSignal): Promise<string | null> {
    if (this.config.explicitModel || this.discoveredModel || !this.config.baseUrl) {
      return this.getEffectiveModel();
    }
    try {
      const res = await fetch(joinOpenAiV1Endpoint(this.config.baseUrl, '/models'), {
        method: 'GET',
        headers: this.buildHeaders(),
        cache: 'no-store',
        redirect: 'error',
        signal: combineSignals(5000, signal),
      });
      if (res.ok) {
        const payload = (await res.json().catch(() => null)) as unknown;
        const detected = this.extractFirstModelId(payload);
        if (detected) {
          this.discoveredModel = detected;
        }
      }
    } catch {
      // Fall back to configured/default model name if /models discovery is unsupported.
    }
    return this.getEffectiveModel();
  }

  async probeHealth(signal?: AbortSignal): Promise<SocketStatus> {
    const checkedAt = new Date().toISOString();
    if (!this.config.baseUrl || this.config.configError) {
      return {
        socket_open: true,
        state: 'standby',
        status: 'degraded',
        provider: 'openai_compatible',
        configured: this.config.configured,
        reachable: false,
        mode: 'unavailable',
        simulated: true,
        live_ai: false,
        model: this.config.model,
        adapter: null,
        model_loaded: false,
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        error: this.config.configError || 'OPENAI_COMPATIBLE_BASE_URL is not configured.',
      };
    }

    try {
      const res = await fetch(joinOpenAiV1Endpoint(this.config.baseUrl, '/models'), {
        method: 'GET',
        headers: this.buildHeaders(),
        cache: 'no-store',
        redirect: 'error',
        signal: combineSignals(5000, signal),
      });
      if (!res.ok) {
        return {
          socket_open: true,
          state: 'standby',
          status: 'degraded',
          provider: 'openai_compatible',
          configured: true,
          reachable: false,
          mode: 'unavailable',
          simulated: true,
          live_ai: false,
          model: this.getEffectiveModel(),
          adapter: null,
          model_loaded: false,
          endpoints: SOCKET_ENDPOINTS,
          target: this.config.target,
          checked_at: checkedAt,
          error: `OpenAI-compatible /models returned HTTP ${res.status}`,
        };
      }

      const payload = (await res.json().catch(() => null)) as unknown;
      const detected = this.extractFirstModelId(payload);
      if (!this.config.explicitModel && detected) {
        this.discoveredModel = detected;
      }
      const activeModel = this.getEffectiveModel();

      return {
        socket_open: true,
        state: 'live',
        status: 'ready',
        provider: 'openai_compatible',
        configured: true,
        reachable: true,
        mode: 'openai_compatible',
        simulated: false,
        live_ai: true,
        model: activeModel,
        adapter: null,
        model_loaded: true,
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        detail: `OpenAI-compatible socket ready (${activeModel ?? 'configured model'}).`,
      };
    } catch (err) {
      return {
        socket_open: true,
        state: 'standby',
        status: 'degraded',
        provider: 'openai_compatible',
        configured: true,
        reachable: false,
        mode: 'unavailable',
        simulated: true,
        live_ai: false,
        model: this.getEffectiveModel(),
        adapter: null,
        model_loaded: false,
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        error:
          err instanceof Error
            ? redactSensitiveText(err.message)
            : 'Unable to reach OpenAI-compatible endpoint.',
      };
    }
  }

  private async extractForNote(
    note: CompareNoteInput,
    activeModel: string | null,
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (!this.config.baseUrl) {
      throw new SocketUpstreamError('OPENAI_COMPATIBLE_BASE_URL is not configured.', 503);
    }
    const res = await fetch(joinOpenAiV1Endpoint(this.config.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: activeModel || this.config.model,
        temperature: 0,
        max_tokens: 1536,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: note.text },
        ],
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: combineSignals(30000, signal),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errObj = data.error as Record<string, unknown> | undefined;
      const msg =
        errObj && typeof errObj.message === 'string'
          ? redactSensitiveText(errObj.message)
          : `OpenAI-compatible endpoint returned HTTP ${res.status}`;
      throw new SocketUpstreamError(msg, res.status >= 400 ? res.status : 502);
    }

    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const rawContent = message?.content;
    const content =
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) =>
                part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
                  ? ((part as Record<string, unknown>).text as string)
                  : '',
              )
              .join('\n')
          : '';
    return parseMedicationArrayFromModelOutput(content);
  }

  async compareNotes(
    earlier: CompareNoteInput,
    later: CompareNoteInput,
    signal?: AbortSignal,
  ): Promise<NormalizedCompareResponse> {
    const activeModel = await this.resolveActiveModel(signal);
    const [oldCandidates, newCandidates] = await Promise.all([
      this.extractForNote(earlier, activeModel, signal),
      this.extractForNote(later, activeModel, signal),
    ]);

    const oldGrounded = groundMedicationMentions(oldCandidates, earlier.source_id, earlier.text);
    const newGrounded = groundMedicationMentions(newCandidates, later.source_id, later.text);

    return buildNormalizedCompareResponse({
      earlierSourceId: earlier.source_id,
      laterSourceId: later.source_id,
      earlierMentions: oldGrounded.mentions,
      laterMentions: newGrounded.mentions,
      earlierUnsupported: oldGrounded.unsupported,
      laterUnsupported: newGrounded.unsupported,
      mode: 'openai_compatible',
      provider: 'openai_compatible',
      simulated: false,
      liveAi: true,
      model: activeModel,
      adapter: null,
    });
  }
}

class OllamaAIService implements AIService {
  readonly id = 'ollama-socket';
  readonly provider: ModelProvider = 'ollama';
  readonly label = 'Ollama local/remote endpoint';
  private readonly config: ResolvedSocketConfig;

  constructor(config: ResolvedSocketConfig) {
    this.config = config;
  }

  async probeHealth(signal?: AbortSignal): Promise<SocketStatus> {
    const checkedAt = new Date().toISOString();
    if (!this.config.baseUrl || this.config.configError) {
      return {
        socket_open: true,
        state: 'standby',
        status: 'degraded',
        provider: 'ollama',
        configured: this.config.configured,
        reachable: false,
        mode: 'unavailable',
        simulated: true,
        live_ai: false,
        model: this.config.model,
        adapter: null,
        model_loaded: false,
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        error: this.config.configError || 'OLLAMA_BASE_URL is invalid.',
      };
    }

    try {
      const res = await fetch(joinEndpoint(this.config.baseUrl, '/api/tags'), {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        signal: combineSignals(5000, signal),
      });
      if (!res.ok) {
        return {
          socket_open: true,
          state: 'standby',
          status: 'degraded',
          provider: 'ollama',
          configured: true,
          reachable: false,
          mode: 'unavailable',
          simulated: true,
          live_ai: false,
          model: this.config.model,
          adapter: null,
          model_loaded: false,
          endpoints: SOCKET_ENDPOINTS,
          target: this.config.target,
          checked_at: checkedAt,
          error: `Ollama /api/tags returned HTTP ${res.status}`,
        };
      }

      return {
        socket_open: true,
        state: 'live',
        status: 'ready',
        provider: 'ollama',
        configured: true,
        reachable: true,
        mode: 'ollama',
        simulated: false,
        live_ai: true,
        model: this.config.model,
        adapter: null,
        model_loaded: true,
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        detail: `Ollama socket ready (${this.config.model ?? 'configured model'}).`,
      };
    } catch (err) {
      return {
        socket_open: true,
        state: 'standby',
        status: 'degraded',
        provider: 'ollama',
        configured: true,
        reachable: false,
        mode: 'unavailable',
        simulated: true,
        live_ai: false,
        model: this.config.model,
        adapter: null,
        model_loaded: false,
        endpoints: SOCKET_ENDPOINTS,
        target: this.config.target,
        checked_at: checkedAt,
        error: err instanceof Error ? redactSensitiveText(err.message) : 'Unable to reach Ollama endpoint.',
      };
    }
  }

  private async extractForNote(note: CompareNoteInput, signal?: AbortSignal): Promise<string[]> {
    if (!this.config.baseUrl) {
      throw new SocketUpstreamError('OLLAMA_BASE_URL is not configured.', 503);
    }
    const res = await fetch(joinEndpoint(this.config.baseUrl, '/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: note.text },
        ],
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: combineSignals(30000, signal),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof data.error === 'string'
          ? redactSensitiveText(data.error)
          : `Ollama returned HTTP ${res.status}`;
      throw new SocketUpstreamError(msg, res.status >= 400 ? res.status : 502);
    }

    const message = data.message as Record<string, unknown> | undefined;
    const content =
      typeof message?.content === 'string'
        ? message.content
        : typeof data.response === 'string'
          ? data.response
          : '';
    return parseMedicationArrayFromModelOutput(content);
  }

  async compareNotes(
    earlier: CompareNoteInput,
    later: CompareNoteInput,
    signal?: AbortSignal,
  ): Promise<NormalizedCompareResponse> {
    const [oldCandidates, newCandidates] = await Promise.all([
      this.extractForNote(earlier, signal),
      this.extractForNote(later, signal),
    ]);

    const oldGrounded = groundMedicationMentions(oldCandidates, earlier.source_id, earlier.text);
    const newGrounded = groundMedicationMentions(newCandidates, later.source_id, later.text);

    return buildNormalizedCompareResponse({
      earlierSourceId: earlier.source_id,
      laterSourceId: later.source_id,
      earlierMentions: oldGrounded.mentions,
      laterMentions: newGrounded.mentions,
      earlierUnsupported: oldGrounded.unsupported,
      laterUnsupported: newGrounded.unsupported,
      mode: 'ollama',
      provider: 'ollama',
      simulated: false,
      liveAi: true,
      model: this.config.model,
      adapter: null,
    });
  }
}

export function createAIService(
  env: Record<string, string | undefined> = process.env,
): AIService {
  const config = resolveSocketConfig(env);
  if (config.provider === 'mlx_service') return new MlxSocketAIService(config);
  if (config.provider === 'openai_compatible') return new OpenAiCompatibleAIService(config);
  if (config.provider === 'ollama') return new OllamaAIService(config);
  return new StandbyReplayAIService(config);
}

export async function probeModelSocket(
  signal?: AbortSignal,
  env: Record<string, string | undefined> = process.env,
): Promise<HealthProbe> {
  return createAIService(env).probeHealth(signal);
}

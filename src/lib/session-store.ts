/**
 * Lightweight JSON-file-backed session store for clinician review decisions and
 * session audit entries, with safe in-memory fallback when the filesystem is
 * read-only.
 *
 * Synthetic-only demo/training data. Never store real PHI.
 */

import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export type ReviewDecision = 'verified' | 'flagged' | 'deferred';

export type PersistenceMode = 'local_file' | 'memory';

export type SessionAuditEntry = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
};

export type ReviewsByScenario = Record<string, Record<string, ReviewDecision>>;

export type FlatReviewsMap = Record<string, ReviewDecision>;

export type SessionStoreData = {
  syntheticOnly: true;
  disclaimer: string;
  updatedAt: string;
  reviewsByScenario: ReviewsByScenario;
  audit: SessionAuditEntry[];
};

export type SessionStoreSnapshot = SessionStoreData & {
  reviews: FlatReviewsMap;
  persistence: PersistenceMode;
};

export type SessionStoreOptions = {
  storePath?: string;
  scenarioId?: string;
};

export const SYNTHETIC_STORE_DISCLAIMER =
  'Synthetic training/demo session data only. Never store real PHI.';

export const DEFAULT_STORE_RELATIVE_PATH = path.join('.data', 'clinical-diff-store.json');

export const VALID_REVIEW_DECISIONS: readonly ReviewDecision[] = [
  'verified',
  'flagged',
  'deferred',
] as const;

const DEFAULT_SCENARIO_BUCKET = '_default';
const MAX_AUDIT_ENTRIES = 500;
const MAX_KEY_LENGTH = 160;
const MAX_ACTOR_LENGTH = 100;
const MAX_ACTION_LENGTH = 160;
const MAX_TARGET_LENGTH = 500;
const MAX_ID_LENGTH = 120;
const MAX_TS_LENGTH = 64;
const SSN_LIKE_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

export class SessionStoreValidationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SessionStoreValidationError';
    this.statusCode = statusCode;
  }
}

type StoreRuntimeState = {
  memoryStores: Map<string, SessionStoreData>;
  memoryFallbackPaths: Set<string>;
  writeQueues: Map<string, Promise<void>>;
};

const globalStoreKey = '__clinicalDiffSessionStoreRuntime';

function getRuntimeState(): StoreRuntimeState {
  const g = globalThis as typeof globalThis & {
    [globalStoreKey]?: StoreRuntimeState;
  };
  if (!g[globalStoreKey]) {
    g[globalStoreKey] = {
      memoryStores: new Map(),
      memoryFallbackPaths: new Set(),
      writeQueues: new Map(),
    };
  }
  return g[globalStoreKey];
}

export function resolveStorePath(customPath?: string): string {
  const configured = customPath?.trim() || process.env.CLINICAL_DIFF_STORE_PATH?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), DEFAULT_STORE_RELATIVE_PATH);
}

function createEmptyStoreData(now = new Date().toISOString()): SessionStoreData {
  return {
    syntheticOnly: true,
    disclaimer: SYNTHETIC_STORE_DISCLAIMER,
    updatedAt: now,
    reviewsByScenario: {},
    audit: [],
  };
}

function cloneReviewsByScenario(reviewsByScenario: ReviewsByScenario): ReviewsByScenario {
  const cloned: ReviewsByScenario = {};
  for (const [scenarioId, scenarioReviews] of Object.entries(reviewsByScenario)) {
    if (Object.keys(scenarioReviews).length > 0) {
      cloned[scenarioId] = { ...scenarioReviews };
    }
  }
  return cloned;
}

function cloneStoreData(data: SessionStoreData): SessionStoreData {
  return {
    syntheticOnly: true,
    disclaimer: SYNTHETIC_STORE_DISCLAIMER,
    updatedAt: data.updatedAt,
    reviewsByScenario: cloneReviewsByScenario(data.reviewsByScenario),
    audit: data.audit.map((entry) => ({ ...entry })),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoPhiPattern(value: string, fieldName: string): void {
  if (SSN_LIKE_PATTERN.test(value)) {
    throw new SessionStoreValidationError(
      `${fieldName} appears to contain a restricted identifier pattern; use synthetic data only.`,
      400,
    );
  }
}

function normalizeBoundedString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== 'string') {
    throw new SessionStoreValidationError(`${fieldName} must be a string.`, 400);
  }
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length === 0) {
    throw new SessionStoreValidationError(`${fieldName} must not be empty.`, 400);
  }
  if (trimmed.length > maxLength) {
    throw new SessionStoreValidationError(
      `${fieldName} must be at most ${maxLength} characters.`,
      400,
    );
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    throw new SessionStoreValidationError(
      `${fieldName} must not contain control characters.`,
      400,
    );
  }
  assertNoPhiPattern(trimmed, fieldName);
  return trimmed;
}

function assertSyntheticOnlyPayload(record: Record<string, unknown>): void {
  if (record.syntheticOnly === false || record.synthetic_only === false) {
    throw new SessionStoreValidationError(
      'Synthetic-only mode is required; never store real PHI.',
      400,
    );
  }
  if (record.phi === true || record.containsPhi === true || record.contains_phi === true) {
    throw new SessionStoreValidationError(
      'Real PHI is prohibited in the clinical-diff session store.',
      400,
    );
  }
}

export function isValidReviewDecision(value: unknown): value is ReviewDecision {
  return (
    typeof value === 'string' &&
    (VALID_REVIEW_DECISIONS as readonly string[]).includes(value)
  );
}

function parseReviewDecisionOrNull(
  value: unknown,
  fieldName = 'decision',
): ReviewDecision | null {
  if (value === null) {
    return null;
  }
  if (!isValidReviewDecision(value)) {
    throw new SessionStoreValidationError(
      `${fieldName} must be one of: ${VALID_REVIEW_DECISIONS.join(', ')}, or null.`,
      400,
    );
  }
  return value;
}

export function parseReviewKey(rawKey: string): { scenarioId: string; medId: string } {
  const key = normalizeBoundedString(rawKey, 'key', MAX_KEY_LENGTH);
  const sepIndex = key.indexOf(':');
  if (sepIndex === -1) {
    return { scenarioId: DEFAULT_SCENARIO_BUCKET, medId: key };
  }
  const scenarioId = key.slice(0, sepIndex).trim();
  const medId = key.slice(sepIndex + 1).trim();
  if (!scenarioId || !medId) {
    throw new SessionStoreValidationError(
      'key must have non-empty scenarioId and medId when using ":" separator.',
      400,
    );
  }
  return { scenarioId, medId };
}

export function flattenReviewsByScenario(
  reviewsByScenario: ReviewsByScenario,
  filterScenarioId?: string,
): FlatReviewsMap {
  const flat: FlatReviewsMap = {};
  for (const [scenarioId, medMap] of Object.entries(reviewsByScenario)) {
    if (filterScenarioId && scenarioId !== filterScenarioId) {
      continue;
    }
    for (const [medId, decision] of Object.entries(medMap)) {
      const flatKey =
        scenarioId === DEFAULT_SCENARIO_BUCKET ? medId : `${scenarioId}:${medId}`;
      flat[flatKey] = decision;
    }
  }
  return flat;
}

export function expandFlatReviews(reviews: FlatReviewsMap): ReviewsByScenario {
  const grouped: ReviewsByScenario = {};
  for (const [rawKey, decision] of Object.entries(reviews)) {
    const { scenarioId, medId } = parseReviewKey(rawKey);
    if (!grouped[scenarioId]) {
      grouped[scenarioId] = {};
    }
    grouped[scenarioId][medId] = decision;
  }
  return grouped;
}

function validateFlatReviewsMap(raw: unknown): FlatReviewsMap {
  if (!isPlainObject(raw)) {
    throw new SessionStoreValidationError('reviews must be an object map.', 400);
  }
  const validated: FlatReviewsMap = {};
  for (const [rawKey, rawDecision] of Object.entries(raw)) {
    const { scenarioId, medId } = parseReviewKey(rawKey);
    if (!isValidReviewDecision(rawDecision)) {
      throw new SessionStoreValidationError(
        `Invalid review decision for "${rawKey}"; expected verified, flagged, or deferred.`,
        400,
      );
    }
    const normalizedKey =
      scenarioId === DEFAULT_SCENARIO_BUCKET ? medId : `${scenarioId}:${medId}`;
    validated[normalizedKey] = rawDecision;
  }
  return validated;
}

function validateReviewsByScenario(raw: unknown): ReviewsByScenario {
  if (!isPlainObject(raw)) {
    throw new SessionStoreValidationError('reviewsByScenario must be an object.', 400);
  }
  const validated: ReviewsByScenario = {};
  for (const [rawScenarioId, rawMedMap] of Object.entries(raw)) {
    const scenarioId = normalizeBoundedString(rawScenarioId, 'scenarioId', MAX_KEY_LENGTH);
    if (!isPlainObject(rawMedMap)) {
      throw new SessionStoreValidationError(
        `reviewsByScenario["${scenarioId}"] must be an object.`,
        400,
      );
    }
    const medEntries: Record<string, ReviewDecision> = {};
    for (const [rawMedId, rawDecision] of Object.entries(rawMedMap)) {
      const medId = normalizeBoundedString(rawMedId, 'medId', MAX_KEY_LENGTH);
      if (!isValidReviewDecision(rawDecision)) {
        throw new SessionStoreValidationError(
          `Invalid review decision for "${scenarioId}:${medId}".`,
          400,
        );
      }
      medEntries[medId] = rawDecision;
    }
    if (Object.keys(medEntries).length > 0) {
      validated[scenarioId] = medEntries;
    }
  }
  return validated;
}

function validateAuditEntry(raw: unknown, allowGeneratedMeta = true): SessionAuditEntry {
  if (!isPlainObject(raw)) {
    throw new SessionStoreValidationError('Audit entry must be an object.', 400);
  }
  assertSyntheticOnlyPayload(raw);

  const actor = normalizeBoundedString(raw.actor, 'audit.actor', MAX_ACTOR_LENGTH);
  const action = normalizeBoundedString(raw.action, 'audit.action', MAX_ACTION_LENGTH);
  const target = normalizeBoundedString(raw.target, 'audit.target', MAX_TARGET_LENGTH);

  let id: string;
  if (raw.id !== undefined) {
    id = normalizeBoundedString(raw.id, 'audit.id', MAX_ID_LENGTH);
  } else if (allowGeneratedMeta) {
    id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  } else {
    throw new SessionStoreValidationError('audit.id must be a non-empty string.', 400);
  }

  let ts: string;
  if (raw.ts !== undefined) {
    ts = normalizeBoundedString(raw.ts, 'audit.ts', MAX_TS_LENGTH);
    if (Number.isNaN(Date.parse(ts))) {
      throw new SessionStoreValidationError('audit.ts must be a valid timestamp.', 400);
    }
  } else if (allowGeneratedMeta) {
    ts = new Date().toISOString();
  } else {
    throw new SessionStoreValidationError('audit.ts must be a non-empty string.', 400);
  }

  return { id, ts, actor, action, target };
}

function validateAuditList(raw: unknown): SessionAuditEntry[] {
  if (!Array.isArray(raw)) {
    throw new SessionStoreValidationError('audit must be an array.', 400);
  }
  if (raw.length > MAX_AUDIT_ENTRIES) {
    throw new SessionStoreValidationError(
      `audit may contain at most ${MAX_AUDIT_ENTRIES} entries.`,
      400,
    );
  }
  return raw.map((item) => validateAuditEntry(item, true));
}

function parsePersistedStoreData(raw: unknown): SessionStoreData {
  if (!isPlainObject(raw)) {
    return createEmptyStoreData();
  }
  const reviewsByScenario = isPlainObject(raw.reviewsByScenario)
    ? validateReviewsByScenario(raw.reviewsByScenario)
    : isPlainObject(raw.reviews)
      ? expandFlatReviews(validateFlatReviewsMap(raw.reviews))
      : {};

  const audit = Array.isArray(raw.audit)
    ? raw.audit.slice(0, MAX_AUDIT_ENTRIES).map((item) => validateAuditEntry(item, true))
    : [];

  const updatedAt =
    typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : new Date().toISOString();

  return {
    syntheticOnly: true,
    disclaimer: SYNTHETIC_STORE_DISCLAIMER,
    updatedAt,
    reviewsByScenario,
    audit,
  };
}

async function isDirectoryWritable(storePath: string): Promise<boolean> {
  let candidate = path.dirname(storePath);
  while (true) {
    try {
      await fs.access(candidate, fsConstants.W_OK);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        const parent = path.dirname(candidate);
        if (parent === candidate) {
          return false;
        }
        candidate = parent;
        continue;
      }
      return false;
    }
  }
}

async function readStoreFromDiskOrMemory(
  storePath: string,
): Promise<{ data: SessionStoreData; persistence: PersistenceMode }> {
  const runtime = getRuntimeState();
  const cached = runtime.memoryStores.get(storePath);

  if (runtime.memoryFallbackPaths.has(storePath)) {
    return {
      data: cloneStoreData(cached ?? createEmptyStoreData()),
      persistence: 'memory',
    };
  }

  try {
    const rawText = await fs.readFile(storePath, 'utf8');
    const parsedJson = JSON.parse(rawText) as unknown;
    const data = parsePersistedStoreData(parsedJson);
    runtime.memoryStores.set(storePath, cloneStoreData(data));
    return { data, persistence: 'local_file' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      const writable = await isDirectoryWritable(storePath);
      const data = cloneStoreData(cached ?? createEmptyStoreData());
      return {
        data,
        persistence: writable ? 'local_file' : 'memory',
      };
    }

    // Corrupt JSON or read permission error: stay available via memory fallback.
    if (err instanceof SyntaxError || err instanceof SessionStoreValidationError) {
      const empty = createEmptyStoreData();
      runtime.memoryStores.set(storePath, cloneStoreData(empty));
      const writable = await isDirectoryWritable(storePath);
      return {
        data: empty,
        persistence: writable ? 'local_file' : 'memory',
      };
    }

    runtime.memoryFallbackPaths.add(storePath);
    const fallbackData = cloneStoreData(cached ?? createEmptyStoreData());
    runtime.memoryStores.set(storePath, cloneStoreData(fallbackData));
    return { data: fallbackData, persistence: 'memory' };
  }
}

async function persistStoreData(
  storePath: string,
  data: SessionStoreData,
): Promise<PersistenceMode> {
  const runtime = getRuntimeState();
  const snapshot = cloneStoreData(data);
  runtime.memoryStores.set(storePath, snapshot);

  if (runtime.memoryFallbackPaths.has(storePath)) {
    return 'memory';
  }

  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  try {
    const dir = path.dirname(storePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tempPath, serialized, 'utf8');
      await fs.rename(tempPath, storePath);
    } catch {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      await fs.writeFile(storePath, serialized, 'utf8');
    }
    return 'local_file';
  } catch {
    runtime.memoryFallbackPaths.add(storePath);
    return 'memory';
  }
}

function enqueueStoreOperation<T>(storePath: string, task: () => Promise<T>): Promise<T> {
  const runtime = getRuntimeState();
  const previous = runtime.writeQueues.get(storePath) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  runtime.writeQueues.set(storePath, settled);
  return run;
}

function buildSnapshot(
  data: SessionStoreData,
  persistence: PersistenceMode,
  filterScenarioId?: string,
): SessionStoreSnapshot {
  const normalizedScenarioFilter = filterScenarioId?.trim() || undefined;
  let reviewsByScenario = cloneReviewsByScenario(data.reviewsByScenario);
  if (normalizedScenarioFilter) {
    const bucket = reviewsByScenario[normalizedScenarioFilter];
    reviewsByScenario = bucket ? { [normalizedScenarioFilter]: { ...bucket } } : {};
  }

  return {
    syntheticOnly: true,
    disclaimer: SYNTHETIC_STORE_DISCLAIMER,
    updatedAt: data.updatedAt,
    reviews: flattenReviewsByScenario(reviewsByScenario),
    reviewsByScenario,
    audit: data.audit.map((entry) => ({ ...entry })),
    persistence,
  };
}

function applySingleReviewUpdate(
  data: SessionStoreData,
  scenarioId: string,
  medId: string,
  decision: ReviewDecision | null,
): void {
  const currentBucket = data.reviewsByScenario[scenarioId] ?? {};
  if (decision === null) {
    delete currentBucket[medId];
    if (Object.keys(currentBucket).length === 0) {
      delete data.reviewsByScenario[scenarioId];
    } else {
      data.reviewsByScenario[scenarioId] = currentBucket;
    }
  } else {
    data.reviewsByScenario[scenarioId] = {
      ...currentBucket,
      [medId]: decision,
    };
  }
}

function prependAuditEntry(data: SessionStoreData, entry: SessionAuditEntry): void {
  const deduped = data.audit.filter((existing) => existing.id !== entry.id);
  data.audit = [entry, ...deduped].slice(0, MAX_AUDIT_ENTRIES);
}

export async function getSessionStore(
  options: SessionStoreOptions = {},
): Promise<SessionStoreSnapshot> {
  const storePath = resolveStorePath(options.storePath);
  const { data, persistence } = await readStoreFromDiskOrMemory(storePath);
  return buildSnapshot(data, persistence, options.scenarioId);
}

export async function upsertReviewDecision(
  input: {
    scenarioId?: string;
    medId?: string;
    key?: string;
    decision: ReviewDecision | null;
    auditEntry?: Partial<SessionAuditEntry> & {
      actor: string;
      action: string;
      target: string;
    };
  },
  options: SessionStoreOptions = {},
): Promise<SessionStoreSnapshot> {
  const storePath = resolveStorePath(options.storePath);
  const decision = parseReviewDecisionOrNull(input.decision);
  let targetScenarioId: string;
  let targetMedId: string;

  if (input.key !== undefined) {
    const parsed = parseReviewKey(input.key);
    targetScenarioId = parsed.scenarioId;
    targetMedId = parsed.medId;
  } else {
    targetScenarioId = normalizeBoundedString(input.scenarioId, 'scenarioId', MAX_KEY_LENGTH);
    targetMedId = normalizeBoundedString(input.medId, 'medId', MAX_KEY_LENGTH);
  }

  const auditEntry =
    input.auditEntry !== undefined ? validateAuditEntry(input.auditEntry, true) : null;

  return enqueueStoreOperation(storePath, async () => {
    const { data } = await readStoreFromDiskOrMemory(storePath);
    applySingleReviewUpdate(data, targetScenarioId, targetMedId, decision);
    if (auditEntry) {
      prependAuditEntry(data, auditEntry);
    }
    data.updatedAt = new Date().toISOString();
    const persistence = await persistStoreData(storePath, data);
    return buildSnapshot(data, persistence, options.scenarioId);
  });
}

export async function appendAuditEntry(
  entry: Partial<SessionAuditEntry> & { actor: string; action: string; target: string },
  options: SessionStoreOptions = {},
): Promise<SessionStoreSnapshot> {
  const storePath = resolveStorePath(options.storePath);
  const validated = validateAuditEntry(entry, true);

  return enqueueStoreOperation(storePath, async () => {
    const { data } = await readStoreFromDiskOrMemory(storePath);
    prependAuditEntry(data, validated);
    data.updatedAt = new Date().toISOString();
    const persistence = await persistStoreData(storePath, data);
    return buildSnapshot(data, persistence, options.scenarioId);
  });
}

export async function resetSessionStore(
  options: SessionStoreOptions = {},
): Promise<SessionStoreSnapshot> {
  const storePath = resolveStorePath(options.storePath);
  return enqueueStoreOperation(storePath, async () => {
    const runtime = getRuntimeState();
    const empty = createEmptyStoreData();
    runtime.memoryStores.set(storePath, cloneStoreData(empty));

    if (runtime.memoryFallbackPaths.has(storePath)) {
      return buildSnapshot(empty, 'memory', options.scenarioId);
    }

    const persistence = await persistStoreData(storePath, empty);
    return buildSnapshot(empty, persistence, options.scenarioId);
  });
}

export async function applySessionStoreMutation(
  payload: unknown,
  method: 'POST' | 'PUT',
  options: SessionStoreOptions = {},
): Promise<SessionStoreSnapshot> {
  if (!isPlainObject(payload)) {
    throw new SessionStoreValidationError('Request body must be a JSON object.', 400);
  }
  assertSyntheticOnlyPayload(payload);

  const hasSingleReviewFields =
    payload.key !== undefined ||
    payload.scenarioId !== undefined ||
    payload.medId !== undefined ||
    payload.decision !== undefined;
  const hasTopLevelAuditFields =
    payload.actor !== undefined ||
    payload.action !== undefined ||
    payload.target !== undefined;
  const hasAuditEntry = payload.auditEntry !== undefined;
  const hasReviewsMap = payload.reviews !== undefined;
  const hasReviewsByScenario = payload.reviewsByScenario !== undefined;
  const hasAuditList = payload.audit !== undefined;

  if (
    !hasSingleReviewFields &&
    !hasTopLevelAuditFields &&
    !hasAuditEntry &&
    !hasReviewsMap &&
    !hasReviewsByScenario &&
    !hasAuditList
  ) {
    throw new SessionStoreValidationError(
      'Request must include a review decision, reviews map, or audit entry.',
      400,
    );
  }

  let singleReview: {
    scenarioId: string;
    medId: string;
    decision: ReviewDecision | null;
  } | null = null;

  if (hasSingleReviewFields) {
    if (payload.decision === undefined) {
      throw new SessionStoreValidationError(
        'decision is required when updating a review entry.',
        400,
      );
    }
    const decision = parseReviewDecisionOrNull(payload.decision);
    if (payload.key !== undefined) {
      const parsed = parseReviewKey(
        normalizeBoundedString(payload.key, 'key', MAX_KEY_LENGTH),
      );
      singleReview = { ...parsed, decision };
    } else if (payload.scenarioId !== undefined && payload.medId !== undefined) {
      singleReview = {
        scenarioId: normalizeBoundedString(
          payload.scenarioId,
          'scenarioId',
          MAX_KEY_LENGTH,
        ),
        medId: normalizeBoundedString(payload.medId, 'medId', MAX_KEY_LENGTH),
        decision,
      };
    } else {
      throw new SessionStoreValidationError(
        'Provide either key or both scenarioId and medId for a review decision.',
        400,
      );
    }
  }

  let singleAudit: SessionAuditEntry | null = null;
  if (hasAuditEntry) {
    singleAudit = validateAuditEntry(payload.auditEntry, true);
  } else if (hasTopLevelAuditFields) {
    singleAudit = validateAuditEntry(
      {
        id: payload.id,
        ts: payload.ts,
        actor: payload.actor,
        action: payload.action,
        target: payload.target,
      },
      true,
    );
  }

  const nextReviewsByScenario = hasReviewsByScenario
    ? validateReviewsByScenario(payload.reviewsByScenario)
    : hasReviewsMap
      ? expandFlatReviews(validateFlatReviewsMap(payload.reviews))
      : null;

  const nextAuditList = hasAuditList ? validateAuditList(payload.audit) : null;

  const storePath = resolveStorePath(options.storePath);

  return enqueueStoreOperation(storePath, async () => {
    const { data } = await readStoreFromDiskOrMemory(storePath);

    if (nextReviewsByScenario !== null) {
      if (method === 'PUT') {
        data.reviewsByScenario = nextReviewsByScenario;
      } else {
        for (const [scenarioId, medMap] of Object.entries(nextReviewsByScenario)) {
          data.reviewsByScenario[scenarioId] = {
            ...(data.reviewsByScenario[scenarioId] ?? {}),
            ...medMap,
          };
        }
      }
    }

    if (singleReview) {
      applySingleReviewUpdate(
        data,
        singleReview.scenarioId,
        singleReview.medId,
        singleReview.decision,
      );
    }

    if (nextAuditList !== null) {
      data.audit = nextAuditList;
    }

    if (singleAudit) {
      prependAuditEntry(data, singleAudit);
    }

    data.updatedAt = new Date().toISOString();
    const persistence = await persistStoreData(storePath, data);
    return buildSnapshot(data, persistence, options.scenarioId);
  });
}

/**
 * Helper for tests to clear in-memory runtime state for a given storePath.
 */
export function clearSessionStoreMemoryForTesting(customPath?: string): void {
  const runtime = getRuntimeState();
  if (customPath) {
    const resolved = resolveStorePath(customPath);
    runtime.memoryStores.delete(resolved);
    runtime.memoryFallbackPaths.delete(resolved);
    return;
  }
  runtime.memoryStores.clear();
  runtime.memoryFallbackPaths.clear();
}

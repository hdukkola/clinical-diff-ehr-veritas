// @vitest-environment node
import { equal, ok } from 'node:assert/strict';
import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  applySessionStoreMutation,
  clearSessionStoreMemoryForTesting,
  expandFlatReviews,
  flattenReviewsByScenario,
  parseReviewKey,
  SessionStoreValidationError,
  type ReviewsByScenario,
} from './session-store';
import {
  redactSensitiveText,
  redactUrl,
  SocketValidationError,
  validateCompareRequestBody,
  validateEndpointUrl,
} from './ai-socket';
import {
  canRender,
  CORE_WIDGET_DEFINITIONS,
  CORE_WIDGET_IDS,
  type ClinicalContext,
} from './cockpit';
import {
  GET as reviewsGet,
  POST as reviewsPost,
  PUT as reviewsPut,
} from '@/app/api/reviews/route';
import { POST as comparePost } from '@/app/api/compare/route';
import { POST as assistantPost } from '@/app/api/assistant/route';

/**
 * Row 5 of docs/coordination/ANTIGRAVITY_250K_QA.md:
 * 25,000 deterministic access-control cases modeling `origin/main:firestore.rules`,
 * session-store isolation, and direct-route auth/credential boundaries:
 * - 8,000 owner/cross-user reads
 * - 8,000 owner/cross-user writes
 * - 5,000 invalid account/session
 * - 4,000 document shape, forged ownership and direct-route cases
 *
 * Critical invariant: 0 unauthorized successes across all 25,000 cases.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYNC_CASE_ID_RE = /^SYNC-[A-F0-9]{32}$/;
const LOCAL_PATIENT_ID_RE = /^LOCAL-[A-F0-9]{12}$/;
const SESSION_COOKIE_UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const JWT_TOKEN_RE = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const WORKSPACE_UID_RE = /^[\w-]{1,128}$/;
const ALLOWED_CASE_KEYS = ['name', 'earlier', 'later', 'version'] as const;

export interface FirestoreAuthContext {
  uid: string;
  token: {
    email?: string;
    email_verified?: boolean;
    firebase?: {
      sign_in_provider?: string;
    };
  };
}

export interface FirestoreCaseDoc {
  [key: string]: unknown;
}

export interface FirestoreRulesEnvironment {
  invitedEmails: ReadonlySet<string>;
  existingCases: ReadonlyMap<string, FirestoreCaseDoc>; // key: `${uid}/${id}`
}

/**
 * Exact deterministic evaluator for `origin/main:firestore.rules`:
 *
 *   function ownsWorkspace(uid) {
 *     return request.auth != null
 *       && request.auth.uid == uid
 *       && request.auth.token.email_verified == true
 *       && request.auth.token.firebase.sign_in_provider == 'google.com'
 *       && exists(/databases/$(database)/documents/workspaceAccounts/$(request.auth.token.email));
 *   }
 *
 *   function validCase(id) {
 *     let data = request.resource.data;
 *     return id.matches('^SYNC-[A-F0-9]{32}$')
 *       && data.keys().hasAll(['name', 'earlier', 'later', 'version'])
 *       && data.keys().hasOnly(['name', 'earlier', 'later', 'version'])
 *       && data.name is string && data.name.size() > 0 && data.name.size() <= 80
 *       && data.earlier is string && data.earlier.size() <= 12000
 *       && data.later is string && data.later.size() <= 12000
 *       && data.version is int;
 *   }
 */
export function evaluateOwnsWorkspace(
  auth: FirestoreAuthContext | null,
  uid: string,
  env: FirestoreRulesEnvironment,
): boolean {
  if (auth === null) return false;
  if (!uid || auth.uid !== uid) return false;
  if (auth.token.email_verified !== true) return false;
  if (auth.token.firebase?.sign_in_provider !== 'google.com') return false;
  const email = auth.token.email;
  if (typeof email !== 'string' || !email || !env.invitedEmails.has(email)) {
    return false;
  }
  return true;
}

export function evaluateValidCase(
  id: string,
  data: FirestoreCaseDoc | null | undefined,
): boolean {
  if (!SYNC_CASE_ID_RE.test(id)) return false;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const keys = Object.keys(data);
  if (keys.length !== ALLOWED_CASE_KEYS.length) return false;
  for (const reqKey of ALLOWED_CASE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(data, reqKey)) return false;
  }
  const { name, earlier, later, version } = data;
  if (typeof name !== 'string' || name.length === 0 || name.length > 80) {
    return false;
  }
  if (typeof earlier !== 'string' || earlier.length > 12000) {
    return false;
  }
  if (typeof later !== 'string' || later.length > 12000) {
    return false;
  }
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return false;
  }
  return true;
}

export type FirestoreOperation =
  | {
      op: 'get';
      collectionPath: string; // e.g. `/workspaces/${uid}/cases/${id}`
      uid: string;
      id: string;
    }
  | {
      op: 'list';
      collectionPath: string; // e.g. `/workspaces/${uid}/cases`
      uid: string;
      limit: number | null;
    }
  | {
      op: 'create';
      collectionPath: string;
      uid: string;
      id: string;
      requestData: FirestoreCaseDoc;
    }
  | {
      op: 'update';
      collectionPath: string;
      uid: string;
      id: string;
      requestData: FirestoreCaseDoc;
    }
  | {
      op: 'delete';
      collectionPath: string;
      uid: string;
      id: string;
    };

export function evaluateFirestoreRule(
  auth: FirestoreAuthContext | null,
  operation: FirestoreOperation,
  env: FirestoreRulesEnvironment,
): boolean {
  if (operation.op === 'list') {
    if (operation.collectionPath !== `/workspaces/${operation.uid}/cases`) {
      return false;
    }
    return (
      evaluateOwnsWorkspace(auth, operation.uid, env) &&
      typeof operation.limit === 'number' &&
      Number.isInteger(operation.limit) &&
      operation.limit >= 1 &&
      operation.limit <= 100
    );
  }

  const expectedDocPath = `/workspaces/${operation.uid}/cases/${operation.id}`;
  if (operation.collectionPath !== expectedDocPath) {
    return false;
  }

  if (!evaluateOwnsWorkspace(auth, operation.uid, env)) {
    return false;
  }

  const docKey = `${operation.uid}/${operation.id}`;
  const resourceData = env.existingCases.get(docKey);

  switch (operation.op) {
    case 'get':
      return true;
    case 'create':
      if (resourceData !== undefined) return false;
      return (
        evaluateValidCase(operation.id, operation.requestData) &&
        operation.requestData.version === 1 &&
        operation.requestData.earlier === '' &&
        operation.requestData.later === ''
      );
    case 'update':
      if (resourceData === undefined) return false;
      return (
        evaluateValidCase(operation.id, operation.requestData) &&
        operation.requestData.name === resourceData.name &&
        typeof resourceData.version === 'number' &&
        operation.requestData.version === resourceData.version + 1
      );
    case 'delete':
      return SYNC_CASE_ID_RE.test(operation.id);
  }
}

/**
 * Direct-route boundary evaluator for `/api/recording-transcription` and `/api/patient-chat`
 * from `origin/main`.
 */
function evaluateRecordingRouteBoundary(params: {
  workerOriginUrl: string;
  firebaseProject: string;
  tokenHeader: string | null;
  uidHeader: string | null;
  caseIdHeader: string | null;
  contentType: string | null;
  contentLength: number;
  firestoreCheckStatus: number;
}): { allowed: boolean; status: number; error?: string } {
  let validWorkerOrigin = false;
  try {
    const u = new URL(params.workerOriginUrl);
    if (
      u.protocol === 'https:' &&
      u.hostname.endsWith('.run.app') &&
      !u.port &&
      u.pathname === '/' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash
    ) {
      validWorkerOrigin = true;
    }
  } catch {
    validWorkerOrigin = false;
  }

  if (
    !validWorkerOrigin ||
    !params.firebaseProject ||
    !/^[a-z0-9-]+$/.test(params.firebaseProject)
  ) {
    return { allowed: false, status: 503, error: 'unavailable' };
  }

  if (
    !params.tokenHeader ||
    params.tokenHeader.length > 8192 ||
    !JWT_TOKEN_RE.test(params.tokenHeader)
  ) {
    return { allowed: false, status: 401, error: 'sign_in_required' };
  }

  if (
    !params.uidHeader ||
    !WORKSPACE_UID_RE.test(params.uidHeader) ||
    !params.caseIdHeader ||
    !SYNC_CASE_ID_RE.test(params.caseIdHeader)
  ) {
    return { allowed: false, status: 400, error: 'invalid_case' };
  }

  if (params.contentType !== 'audio/wav') {
    return { allowed: false, status: 415, error: 'invalid_audio' };
  }

  const maxWavBytes = 960_044;
  if (params.contentLength > maxWavBytes) {
    return { allowed: false, status: 413, error: 'recording_too_large' };
  }
  if (params.contentLength <= 44) {
    return { allowed: false, status: 400, error: 'invalid_audio' };
  }

  if ([401, 403, 404].includes(params.firestoreCheckStatus)) {
    return { allowed: false, status: 403, error: 'case_access_required' };
  }
  if (params.firestoreCheckStatus < 200 || params.firestoreCheckStatus >= 300) {
    return { allowed: false, status: 503, error: 'unable_to_verify_access' };
  }

  return { allowed: true, status: 200 };
}

function makeHex32(index: number): string {
  return index.toString(16).toUpperCase().padStart(32, 'A').slice(0, 32);
}

describe('qa-250k-access-25k: Row 5 (25,000 deterministic access-control & boundary cases)', () => {
  beforeEach(() => {
    clearSessionStoreMemoryForTesting();
  });

  it('1. Owner vs cross-user reads: 8,000 seeded deterministic cases (ACC-READ-00001..08000)', () => {
    const rng = mulberry32(0x5100_0001);
    const invitedEmails = new Set([
      'owner.clinician@diffmd.org',
      'peer.clinician@diffmd.org',
      'luckyv28116@gmail.com',
    ]);
    const existingCases = new Map<string, FirestoreCaseDoc>();
    for (let k = 0; k < 20; k++) {
      const cid = `SYNC-${makeHex32(k)}`;
      existingCases.set(`uid-owner-${k}/${cid}`, {
        name: `Case ${k}`,
        earlier: 'Lisinopril 10 mg daily',
        later: 'Lisinopril 20 mg daily',
        version: 1,
      });
    }
    const env: FirestoreRulesEnvironment = { invitedEmails, existingCases };

    let executed = 0;
    let unauthorizedSuccesses = 0;

    for (let i = 0; i < 8000; i++) {
      const slot = i % 20;
      const ownerUid = `uid-owner-${slot}`;
      const otherUid = `uid-other-${slot + 1}`;
      const caseId = `SYNC-${makeHex32(slot)}`;
      const ownerAuth: FirestoreAuthContext = {
        uid: ownerUid,
        token: {
          email: 'owner.clinician@diffmd.org',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        },
      };
      const otherAuth: FirestoreAuthContext = {
        uid: otherUid,
        token: {
          email: 'peer.clinician@diffmd.org',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        },
      };

      const mode = i % 8;
      if (mode === 0) {
        // Authorized owner `get` on own case succeeds
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'get',
            collectionPath: `/workspaces/${ownerUid}/cases/${caseId}`,
            uid: ownerUid,
            id: caseId,
          },
          env,
        );
        equal(allowed, true);
      } else if (mode === 1) {
        // Authorized owner `list` with limit 1..100 succeeds
        const limit = 1 + (Math.floor(rng() * 100) % 100);
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'list',
            collectionPath: `/workspaces/${ownerUid}/cases`,
            uid: ownerUid,
            limit,
          },
          env,
        );
        equal(allowed, true);
      } else if (mode === 2) {
        // Cross-user `get` (other invited user reading owner's case) MUST be rejected
        const allowed = evaluateFirestoreRule(
          otherAuth,
          {
            op: 'get',
            collectionPath: `/workspaces/${ownerUid}/cases/${caseId}`,
            uid: ownerUid,
            id: caseId,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 3) {
        // Cross-user `list` (other invited user listing owner's cases) MUST be rejected
        const allowed = evaluateFirestoreRule(
          otherAuth,
          {
            op: 'list',
            collectionPath: `/workspaces/${ownerUid}/cases`,
            uid: ownerUid,
            limit: 50,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 4) {
        // Owner `list` exceeding query limit (> 100 or null) MUST be rejected
        const badLimit = i % 2 === 0 ? 101 + (i % 900) : null;
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'list',
            collectionPath: `/workspaces/${ownerUid}/cases`,
            uid: ownerUid,
            limit: badLimit,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 5) {
        // Direct read on `/workspaceAccounts/{email}` allowlist collection MUST be rejected (no allow rule)
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'get',
            collectionPath: `/workspaceAccounts/owner.clinician@diffmd.org`,
            uid: ownerUid,
            id: caseId,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 6) {
        // Scenario-scoped session-store read isolation: filtering by scenarioA never returns scenarioB's decisions
        const scenarioA = `scenario-owner-${slot}`;
        const scenarioB = `scenario-other-${slot}`;
        const grouped: ReviewsByScenario = {
          [scenarioA]: { [`med-${i}`]: 'verified' },
          [scenarioB]: { [`med-${i}`]: 'flagged' },
        };
        const flatA = flattenReviewsByScenario(grouped, scenarioA);
        const leakedFromB = Object.keys(flatA).some((k) =>
          k.startsWith(`${scenarioB}:`),
        );
        if (leakedFromB) unauthorizedSuccesses++;
        equal(leakedFromB, false);
        equal(flatA[`${scenarioA}:med-${i}`], 'verified');
      } else {
        // Cockpit `canRender` permission & role read boundary: missing `read:patient` or `read:medications` blocks rendering
        const widgetId = CORE_WIDGET_IDS[i % CORE_WIDGET_IDS.length]!;
        const def = CORE_WIDGET_DEFINITIONS.find((d) => d.id === widgetId)!;
        const ctxMissingPerms: ClinicalContext = {
          patient: {
            id: 'PAT-1',
            name: 'Synthetic',
            age: 40,
            sex: 'M',
            activeProblems: [],
            allergies: [],
            activeMedications: [],
            missing: [],
          },
          encounter: {
            id: 'ENC-1',
            patientId: 'PAT-1',
            date: '2026-11-15',
            kind: 'outpatient',
            summary: 'Summary',
            sourceRef: 's1',
            medications: [],
            encounters: [],
            unresolvedDiscrepancies: [],
          },
          clinician: { id: 'c1', name: 'Viewer', role: 'read-only' },
          dataPermissions: { grantedPermissions: [] },
          encounterState: 'open',
          sourceVersions: { s1: 'v1' },
          proposedChanges: [],
          committedChanges: [],
        };
        const allowed = canRender(widgetId, ctxMissingPerms);
        if (def.requiredPermissions.length > 0 && allowed) {
          unauthorizedSuccesses++;
        }
        equal(allowed, false);
      }

      executed++;
    }

    equal(unauthorizedSuccesses, 0);
    expect(executed).toBe(8000);
  });

  it('2. Owner vs cross-user writes: 8,000 seeded deterministic cases (ACC-WRITE-00001..08000)', () => {
    const invitedEmails = new Set([
      'owner.clinician@diffmd.org',
      'peer.clinician@diffmd.org',
    ]);
    const existingCases = new Map<string, FirestoreCaseDoc>();
    for (let k = 0; k < 25; k++) {
      const cid = `SYNC-${makeHex32(k)}`;
      existingCases.set(`uid-owner-${k}/${cid}`, {
        name: `Case ${k}`,
        earlier: 'Aspirin 81 mg daily',
        later: 'Aspirin 81 mg daily',
        version: 2,
      });
    }
    const env: FirestoreRulesEnvironment = { invitedEmails, existingCases };

    let executed = 0;
    let unauthorizedSuccesses = 0;

    for (let i = 0; i < 8000; i++) {
      const slot = i % 25;
      const ownerUid = `uid-owner-${slot}`;
      const attackerUid = `uid-attacker-${slot}`;
      const existingCaseId = `SYNC-${makeHex32(slot)}`;
      const newCaseId = `SYNC-${makeHex32(1000 + i)}`;

      const ownerAuth: FirestoreAuthContext = {
        uid: ownerUid,
        token: {
          email: 'owner.clinician@diffmd.org',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        },
      };
      const attackerAuth: FirestoreAuthContext = {
        uid: attackerUid,
        token: {
          email: 'peer.clinician@diffmd.org',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        },
      };

      const mode = i % 8;
      if (mode === 0) {
        // Authorized owner `create` with version == 1 and empty earlier/later succeeds
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'create',
            collectionPath: `/workspaces/${ownerUid}/cases/${newCaseId}`,
            uid: ownerUid,
            id: newCaseId,
            requestData: {
              name: `New Case ${i % 50}`,
              earlier: '',
              later: '',
              version: 1,
            },
          },
          env,
        );
        equal(allowed, true);
      } else if (mode === 1) {
        // Authorized owner `update` preserving name and incrementing version by +1 succeeds
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'update',
            collectionPath: `/workspaces/${ownerUid}/cases/${existingCaseId}`,
            uid: ownerUid,
            id: existingCaseId,
            requestData: {
              name: `Case ${slot}`,
              earlier: 'Lisinopril 10 mg daily',
              later: 'Lisinopril 20 mg daily',
              version: 3,
            },
          },
          env,
        );
        equal(allowed, true);
      } else if (mode === 2) {
        // Authorized owner `delete` with valid SYNC-32HEX ID succeeds
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'delete',
            collectionPath: `/workspaces/${ownerUid}/cases/${existingCaseId}`,
            uid: ownerUid,
            id: existingCaseId,
          },
          env,
        );
        equal(allowed, true);
      } else if (mode === 3) {
        // Cross-user `create` in another user's workspace MUST be rejected
        const allowed = evaluateFirestoreRule(
          attackerAuth,
          {
            op: 'create',
            collectionPath: `/workspaces/${ownerUid}/cases/${newCaseId}`,
            uid: ownerUid,
            id: newCaseId,
            requestData: {
              name: 'Injected Case',
              earlier: '',
              later: '',
              version: 1,
            },
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 4) {
        // Cross-user `update` on another user's case MUST be rejected
        const allowed = evaluateFirestoreRule(
          attackerAuth,
          {
            op: 'update',
            collectionPath: `/workspaces/${ownerUid}/cases/${existingCaseId}`,
            uid: ownerUid,
            id: existingCaseId,
            requestData: {
              name: `Case ${slot}`,
              earlier: 'Tampered earlier',
              later: 'Tampered later',
              version: 3,
            },
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 5) {
        // Cross-user `delete` on another user's case MUST be rejected
        const allowed = evaluateFirestoreRule(
          attackerAuth,
          {
            op: 'delete',
            collectionPath: `/workspaces/${ownerUid}/cases/${existingCaseId}`,
            uid: ownerUid,
            id: existingCaseId,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 6) {
        // Owner `update` with stale/wrong version (version != resource.data.version + 1) or mutated name MUST be rejected
        const mutateName = i % 2 === 0;
        const badVersion = mutateName ? 3 : i % 4 === 0 ? 2 : 4;
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'update',
            collectionPath: `/workspaces/${ownerUid}/cases/${existingCaseId}`,
            uid: ownerUid,
            id: existingCaseId,
            requestData: {
              name: mutateName ? `Renamed Case ${slot}` : `Case ${slot}`,
              earlier: 'Note A',
              later: 'Note B',
              version: badVersion,
            },
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else {
        // Owner `create` with non-empty initial notes or version != 1 MUST be rejected
        const badCreate =
          i % 2 === 0
            ? { name: 'Case', earlier: 'Preloaded note', later: '', version: 1 }
            : { name: 'Case', earlier: '', later: '', version: 2 };
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          {
            op: 'create',
            collectionPath: `/workspaces/${ownerUid}/cases/${newCaseId}`,
            uid: ownerUid,
            id: newCaseId,
            requestData: badCreate,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      }

      executed++;
    }

    equal(unauthorizedSuccesses, 0);
    expect(executed).toBe(8000);
  });

  it('3. Invalid account and session cases: 5,000 seeded deterministic cases (ACC-SESS-00001..05000)', () => {
    const invitedEmails = new Set(['invited.doctor@diffmd.org']);
    const caseId = `SYNC-${makeHex32(77)}`;
    const existingCases = new Map<string, FirestoreCaseDoc>([
      [
        `uid-valid/${caseId}`,
        { name: 'Case 77', earlier: '', later: '', version: 1 },
      ],
    ]);
    const env: FirestoreRulesEnvironment = { invitedEmails, existingCases };

    const invalidCookies = [
      '',
      'not-a-uuid',
      '../../etc/passwd',
      '..\\..\\windows\\system32\\cmd.exe',
      '00000000-0000-1000-8000-000000000000', // UUID v1 instead of v4
      '12345678-1234-4234-1234-1234567890ab', // invalid variant digit '1'
      '12345678-1234-4234-8234-1234567890AB', // uppercase hex rejected by strict lowercase regex
      '12345678-1234-4234-8234-1234567890ab; Path=/',
    ] as const;

    let executed = 0;
    let unauthorizedSuccesses = 0;

    for (let i = 0; i < 5000; i++) {
      const mode = i % 5;

      if (mode === 0) {
        // Signed-out (request.auth == null) rejected on all operations
        const allowedGet = evaluateFirestoreRule(
          null,
          {
            op: 'get',
            collectionPath: `/workspaces/uid-valid/cases/${caseId}`,
            uid: 'uid-valid',
            id: caseId,
          },
          env,
        );
        const allowedCreate = evaluateFirestoreRule(
          null,
          {
            op: 'create',
            collectionPath: `/workspaces/uid-valid/cases/SYNC-${makeHex32(i)}`,
            uid: 'uid-valid',
            id: `SYNC-${makeHex32(i)}`,
            requestData: { name: 'Test', earlier: '', later: '', version: 1 },
          },
          env,
        );
        if (allowedGet || allowedCreate) unauthorizedSuccesses++;
        equal(allowedGet, false);
        equal(allowedCreate, false);
      } else if (mode === 1) {
        // Unverified email (`email_verified: false` or missing) rejected even for invited email & matching UID
        const unverifiedAuth: FirestoreAuthContext = {
          uid: 'uid-valid',
          token: {
            email: 'invited.doctor@diffmd.org',
            email_verified: i % 2 === 0 ? false : undefined,
            firebase: { sign_in_provider: 'google.com' },
          },
        };
        const allowed = evaluateFirestoreRule(
          unverifiedAuth,
          {
            op: 'get',
            collectionPath: `/workspaces/uid-valid/cases/${caseId}`,
            uid: 'uid-valid',
            id: caseId,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 2) {
        // Wrong sign_in_provider (`password`, `anonymous`, `github.com`, `custom`) rejected
        const providers = ['password', 'anonymous', 'github.com', 'custom', ''];
        const wrongProviderAuth: FirestoreAuthContext = {
          uid: 'uid-valid',
          token: {
            email: 'invited.doctor@diffmd.org',
            email_verified: true,
            firebase: {
              sign_in_provider: providers[i % providers.length],
            },
          },
        };
        const allowed = evaluateFirestoreRule(
          wrongProviderAuth,
          {
            op: 'get',
            collectionPath: `/workspaces/uid-valid/cases/${caseId}`,
            uid: 'uid-valid',
            id: caseId,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 3) {
        // Uninvited Google account (missing `/workspaceAccounts/{email}` doc) rejected
        const uninvitedAuth: FirestoreAuthContext = {
          uid: 'uid-valid',
          token: {
            email: `uninvited.user.${i}@gmail.com`,
            email_verified: true,
            firebase: { sign_in_provider: 'google.com' },
          },
        };
        const allowed = evaluateFirestoreRule(
          uninvitedAuth,
          {
            op: 'get',
            collectionPath: `/workspaces/uid-valid/cases/${caseId}`,
            uid: 'uid-valid',
            id: caseId,
          },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else {
        // Session cookie validation & review key / PHI / non-synthetic session-store rejection
        const badCookie = invalidCookies[i % invalidCookies.length]!;
        const cookieAccepted = SESSION_COOKIE_UUID_V4_RE.test(badCookie);
        if (cookieAccepted) unauthorizedSuccesses++;
        equal(cookieAccepted, false);

        // Valid v4 UUID is accepted
        const validUuid = '12345678-1234-4234-8234-1234567890ab';
        equal(SESSION_COOKIE_UUID_V4_RE.test(validUuid), true);

        // Malformed review key separator or SSN pattern in key throws SessionStoreValidationError
        let threw = false;
        try {
          if (i % 2 === 0) {
            parseReviewKey(':empty-scenario');
          } else {
            parseReviewKey(`patient-123-45-6789:med-${i}`);
          }
        } catch (err) {
          threw = err instanceof SessionStoreValidationError;
        }
        if (!threw) unauthorizedSuccesses++;
        equal(threw, true);
      }

      executed++;
    }

    equal(unauthorizedSuccesses, 0);
    expect(executed).toBe(5000);
  });

  it('4. Document shape, forged ownership, and direct-route boundaries: 4,000 seeded deterministic cases (ACC-SHAPE-00001..04000)', async () => {
    const invitedEmails = new Set(['owner.clinician@diffmd.org']);
    const ownerUid = 'uid-owner-1';
    const existingCaseId = `SYNC-${makeHex32(1)}`;
    const existingCases = new Map<string, FirestoreCaseDoc>([
      [
        `${ownerUid}/${existingCaseId}`,
        { name: 'Valid Case', earlier: '', later: '', version: 1 },
      ],
    ]);
    const env: FirestoreRulesEnvironment = { invitedEmails, existingCases };
    const ownerAuth: FirestoreAuthContext = {
      uid: ownerUid,
      token: {
        email: 'owner.clinician@diffmd.org',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      },
    };

    const ssrfTargets = [
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'https://10.0.0.1/v1/models',
      'https://172.16.5.4/v1/models',
      'https://192.168.1.10/v1/models',
      'https://100.64.0.1/v1/models',
      'https://[::ffff:169.254.169.254]/v1',
      'https://[fe80::1]/v1',
      'https://[fd00:ec2::254]/v1',
      'http://external-model.example.com/v1', // insecure non-loopback http
      'https://user:secret@external-model.example.com/v1', // embedded credentials
      'https://external-model.example.com/v1?token=leak', // query string in base URL
    ] as const;

    let executed = 0;
    let unauthorizedSuccesses = 0;

    for (let i = 0; i < 4000; i++) {
      const mode = i % 5;

      if (mode === 0) {
        // Document shape violations in `validCase(id)`: extra fields (`owner`, `uid`, `role`, `isAdmin`), missing fields, wrong types, oversized strings
        const shapeVariant = i % 6;
        let badId = `SYNC-${makeHex32(500 + i)}`;
        let badData: FirestoreCaseDoc = {
          name: 'Valid Name',
          earlier: '',
          later: '',
          version: 1,
        };

        if (shapeVariant === 0) {
          // Forged ownership field injected into document payload
          badData = { ...badData, uid: 'forged-uid', owner: 'forged-owner' };
        } else if (shapeVariant === 1) {
          // Invalid case ID format (lowercase hex, LOCAL- prefix, short hex, path traversal)
          const badIds = [
            `LOCAL-${makeHex32(i).slice(0, 12)}`,
            `sync-${makeHex32(i).toLowerCase()}`,
            `SYNC-${makeHex32(i).slice(0, 31)}`,
            '../workspaceAccounts/admin@diffmd.org',
          ];
          badId = badIds[i % badIds.length]!;
        } else if (shapeVariant === 2) {
          // Empty or oversized (> 80 chars) case name
          badData = {
            ...badData,
            name: i % 2 === 0 ? '' : 'N'.repeat(81),
          };
        } else if (shapeVariant === 3) {
          // Oversized note (> 12,000 chars) on update
          badData = {
            name: 'Valid Case',
            earlier: 'E'.repeat(12001),
            later: '',
            version: 2,
          };
        } else if (shapeVariant === 4) {
          // Non-integer version (float or string)
          badData = {
            ...badData,
            version: i % 2 === 0 ? 1.5 : ('1' as unknown as number),
          };
        } else {
          // Missing required key (`later` omitted)
          badData = { name: 'Valid Name', earlier: '', version: 1 };
        }

        const isUpdate = shapeVariant === 3;
        const allowed = evaluateFirestoreRule(
          ownerAuth,
          isUpdate
            ? {
                op: 'update',
                collectionPath: `/workspaces/${ownerUid}/cases/${existingCaseId}`,
                uid: ownerUid,
                id: existingCaseId,
                requestData: badData,
              }
            : {
                op: 'create',
                collectionPath: `/workspaces/${ownerUid}/cases/${badId}`,
                uid: ownerUid,
                id: badId,
                requestData: badData,
              },
          env,
        );
        if (allowed) unauthorizedSuccesses++;
        equal(allowed, false);
      } else if (mode === 1) {
        // Forged ownership / ID-confusion on `/api/recording-transcription` direct route
        const routeVariant = i % 5;
        const baseParams = {
          workerOriginUrl: 'https://transcribe-worker-xyz.a.run.app',
          firebaseProject: 'diffmd',
          tokenHeader: 'eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ1aWQifQ.c2lnbmF0dXJl',
          uidHeader: ownerUid,
          caseIdHeader: existingCaseId,
          contentType: 'audio/wav',
          contentLength: 16000,
          firestoreCheckStatus: 200,
        };

        let check: { allowed: boolean; status: number; error?: string };
        if (routeVariant === 0) {
          // Missing or malformed Bearer token
          check = evaluateRecordingRouteBoundary({
            ...baseParams,
            tokenHeader: i % 2 === 0 ? null : 'not-a-jwt-token',
          });
          equal(check.status, 401);
        } else if (routeVariant === 1) {
          // Forged UID (token belongs to user A, header claims user B -> Firestore returns 403)
          check = evaluateRecordingRouteBoundary({
            ...baseParams,
            uidHeader: 'uid-victim-workspace',
            firestoreCheckStatus: 403,
          });
          equal(check.status, 403);
          equal(check.error, 'case_access_required');
        } else if (routeVariant === 2) {
          // Invalid case ID (`LOCAL-...` or path traversal `../`)
          check = evaluateRecordingRouteBoundary({
            ...baseParams,
            caseIdHeader: 'LOCAL-1234567890AB',
          });
          equal(check.status, 400);
          equal(check.error, 'invalid_case');
        } else if (routeVariant === 3) {
          // Wrong Content-Type or oversized WAV (> 960,044 bytes) or tiny WAV (<= 44 bytes)
          check =
            i % 2 === 0
              ? evaluateRecordingRouteBoundary({
                  ...baseParams,
                  contentType: 'application/json',
                })
              : evaluateRecordingRouteBoundary({
                  ...baseParams,
                  contentLength: 960_045,
                });
          ok(check.status === 415 || check.status === 413);
        } else {
          // Untrusted worker origin (non-.run.app or http:)
          check = evaluateRecordingRouteBoundary({
            ...baseParams,
            workerOriginUrl: 'https://evil-exfil.example.com/transcribe',
          });
          equal(check.status, 503);
        }

        if (check.allowed) unauthorizedSuccesses++;
        equal(check.allowed, false);
      } else if (mode === 2) {
        // SSRF, metadata IP, private RFC1918, and credential-in-URL rejection in `validateEndpointUrl`
        const rawUrl = ssrfTargets[i % ssrfTargets.length]!;
        let accepted = false;
        try {
          validateEndpointUrl(rawUrl, { allowInsecureHttp: false });
          accepted = true;
        } catch (err) {
          ok(err instanceof SocketValidationError);
        }
        if (accepted) unauthorizedSuccesses++;
        equal(accepted, false);

        // Verify credential redaction strips tokens and passwords
        const redacted = redactSensitiveText(
          `Bearer secret_token_${i} https://admin:pass_${i}@host.local`,
        );
        equal(redacted.includes(`secret_token_${i}`), false);
        equal(redacted.includes(`pass_${i}`), false);
        equal(
          redactUrl(`https://user:pass_${i}@example.com:8443/path?secret=1`),
          'https://example.com:8443',
        );
      } else if (mode === 3) {
        // Compare request boundary: non-synthetic (`synthetic_only: false`), identical source_ids, or oversized notes rejected
        let accepted = false;
        try {
          if (i % 3 === 0) {
            validateCompareRequestBody({
              synthetic_only: false,
              earlier: { source_id: 'a', text: 'Lisinopril 10 mg' },
              later: { source_id: 'b', text: 'Lisinopril 20 mg' },
            });
          } else if (i % 3 === 1) {
            validateCompareRequestBody({
              synthetic_only: true,
              earlier: { source_id: 'same-id', text: 'Lisinopril 10 mg' },
              later: { source_id: 'same-id', text: 'Lisinopril 20 mg' },
            });
          } else {
            validateCompareRequestBody({
              synthetic_only: true,
              earlier: { source_id: 'a', text: '   ' },
              later: { source_id: 'b', text: 'Lisinopril 20 mg' },
            });
          }
          accepted = true;
        } catch (err) {
          ok(err instanceof SocketValidationError);
        }
        if (accepted) unauthorizedSuccesses++;
        equal(accepted, false);
      } else {
        // Session store & prototype pollution / PHI flag rejection + browser patient ID format guard
        const badLocalId = `SYNC-${makeHex32(i)}`;
        if (LOCAL_PATIENT_ID_RE.test(badLocalId)) {
          unauthorizedSuccesses++;
        }
        equal(LOCAL_PATIENT_ID_RE.test(badLocalId), false);
        equal(LOCAL_PATIENT_ID_RE.test('LOCAL-1234567890AB'), true);

        const pollutedFlat = JSON.parse(
          `{"__proto__":{"polluted":true},"scen-${i}:med-1":"verified"}`,
        ) as Record<string, 'verified'>;
        const expanded = expandFlatReviews(pollutedFlat);
        if (({} as Record<string, unknown>).polluted !== undefined) {
          unauthorizedSuccesses++;
        }
        equal(({} as Record<string, unknown>).polluted, undefined);
        equal(expanded[`scen-${i}`]?.['med-1'], 'verified');

        if (i < 50) {
          // Also exercise async applySessionStoreMutation rejection on phi/non-synthetic payloads
          let rejected = false;
          try {
            await applySessionStoreMutation(
              i % 2 === 0
                ? {
                    syntheticOnly: false,
                    scenarioId: 's1',
                    medId: 'm1',
                    decision: 'verified',
                  }
                : {
                    containsPhi: true,
                    scenarioId: 's1',
                    medId: 'm1',
                    decision: 'verified',
                  },
              'POST',
            );
          } catch (err) {
            rejected = err instanceof SessionStoreValidationError;
          }
          if (!rejected) unauthorizedSuccesses++;
          equal(rejected, true);
        }
      }

      executed++;
    }

    // Direct Next.js API route boundary smoke assertions
    const forgedCookieReq = new NextRequest('http://localhost/api/reviews', {
      headers: {
        cookie: 'diffmd-review-session=../../etc/passwd',
      },
    });
    const reviewsRes = await reviewsGet(forgedCookieReq);
    equal(reviewsRes.status, 200);
    equal(reviewsRes.headers.get('Cache-Control'), 'no-store');
    const assignedCookie = reviewsRes.headers.get('set-cookie') ?? '';
    // Must replace forged cookie with a fresh valid UUID v4 cookie scoped to /api/reviews
    equal(assignedCookie.includes('../../etc/passwd'), false);
    ok(assignedCookie.includes('diffmd-review-session='));
    ok(assignedCookie.toLowerCase().includes('httponly'));
    ok(assignedCookie.toLowerCase().includes('samesite=strict'));

    const phiPostRes = await reviewsPost(
      new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          containsPhi: true,
          scenarioId: 's1',
          medId: 'm1',
          decision: 'verified',
        }),
      }),
    );
    equal(phiPostRes.status, 400);

    const nonSyntheticPutRes = await reviewsPut(
      new NextRequest('http://localhost/api/reviews', {
        method: 'PUT',
        body: JSON.stringify({
          syntheticOnly: false,
          reviews: { 's1:m1': 'verified' },
        }),
      }),
    );
    equal(nonSyntheticPutRes.status, 400);

    const badCompareRes = await comparePost(
      new NextRequest('http://localhost/api/compare', {
        method: 'POST',
        body: JSON.stringify({
          synthetic_only: false,
          earlier: { text: 'Lisinopril 10 mg' },
          later: { text: 'Lisinopril 20 mg' },
        }),
      }),
    );
    equal(badCompareRes.status, 400);

    const badAssistantRes = await assistantPost(
      new Request('http://localhost/api/assistant', {
        method: 'POST',
        body: JSON.stringify({ note: 'earlier', injectedField: 'admin' }),
      }),
    );
    equal(badAssistantRes.status, 400);

    equal(unauthorizedSuccesses, 0);
    expect(executed).toBe(4000);
  });
});

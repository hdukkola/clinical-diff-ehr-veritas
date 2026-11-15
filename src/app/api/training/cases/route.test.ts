// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  records: new Map<string, Map<string, { name: string; earlier: string; later: string; version: number }>>(),
}));

vi.mock('@/lib/clerk-training', () => ({ clerkTrainingEnabled: true }));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('firebase-admin/app', () => ({ getApps: () => [], initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (userId: string) => {
        if (name === 'workspaceClerkAccounts') {
          return { get: async () => ({ get: () => userId === 'user_A' || userId === 'user_B' }) };
        }
        const records = mocks.records.get(userId) ?? new Map();
        mocks.records.set(userId, records);
        return {
          collection: () => ({
            limit: () => ({
              get: async () => ({
                size: records.size,
                docs: [...records].map(([id, record]) => ({ id, data: () => record })),
              }),
            }),
            doc: (id: string) => ({
              create: (value: object) => records.set(id, value),
              get: async () => ({ exists: records.has(id), get: () => records.get(id)?.version }),
              update: (value: object) => records.set(id, { ...records.get(id), ...value }),
              delete: () => records.delete(id),
            }),
          }),
        };
      },
    }),
    runTransaction: <T,>(callback: (client: object) => T) => callback({
      get: (record: { get: () => unknown }) => record.get(),
      create: (record: { create: (value: object) => void }, value: object) => record.create(value),
      update: (record: { update: (value: object) => void }, value: object) => record.update(value),
      delete: (record: { delete: () => void }) => record.delete(),
    }),
  }),
}));

const origin = 'http://localhost:3189';

function post(body: object, requestOrigin = origin) {
  return POST(new Request(origin + '/api/training/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
    body: JSON.stringify(body),
  }));
}

describe('Clerk training cases', () => {
  beforeEach(() => {
    vi.stubEnv('DIFFMD_CLERK_TRAINING_PROJECT', 'diffmd-training-veritas-26');
    vi.stubEnv('DIFFMD_CLERK_TRAINING_ORIGIN', origin);
    mocks.records.clear();
    mocks.auth.mockResolvedValue({ userId: 'user_A', sessionId: 'sess_a' });
  });

  it('rejects production project configuration before authenticating', async () => {
    vi.stubEnv('DIFFMD_CLERK_TRAINING_PROJECT', 'clinical-diff-veritas-2026');
    expect((await post({ action: 'list' })).status).toBe(404);
  });

  it('rejects cross-origin, unauthenticated, impersonated, and uninvited requests', async () => {
    expect((await post({ action: 'list' }, 'https://elsewhere.example')).status).toBe(403);
    mocks.auth.mockResolvedValueOnce({ userId: null, sessionId: null });
    expect((await post({ action: 'list' })).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ userId: 'user_A', sessionId: 'sess_a', actor: { sub: 'user_X' } });
    expect((await post({ action: 'list' })).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ userId: 'user_X', sessionId: 'sess_x' });
    expect((await post({ action: 'list' })).status).toBe(403);
  });

  it('creates and updates only cases owned by the verified session and rejects stale versions', async () => {
    const created = await post({ action: 'create', name: 'Synthetic 1', uid: 'user_B' });
    expect(created.status).toBe(201);
    expect(created.headers.get('Cache-Control')).toBe('private, no-store');
    const { record } = await created.json();
    const edit = { action: 'save', id: record.id, earlier: 'Synthetic earlier note.', later: '', version: 1 };
    mocks.auth.mockResolvedValueOnce({ userId: 'user_B', sessionId: 'sess_b' });
    expect(await (await post({ action: 'list', uid: 'user_A' })).json()).toEqual({ cases: [] });
    mocks.auth.mockResolvedValueOnce({ userId: 'user_B', sessionId: 'sess_b' });
    expect((await post({ ...edit, uid: 'user_A' })).status).toBe(409);
    expect(await (await post(edit)).json()).toEqual({ version: 2 });
    expect((await post(edit)).status).toBe(409);
    expect(await (await post({ action: 'list' })).json()).toEqual({
      cases: [{ ...record, earlier: edit.earlier, version: 2 }],
    });
  });

  it('rejects large note bodies and invalid case IDs', async () => {
    expect((await post({ action: 'create', name: 'x'.repeat(151_000) })).status).toBe(400);
    expect((await post({ action: 'save', id: '../../case', earlier: '', later: '', version: 1 })).status).toBe(400);
  });

  it('removes only the current version of an owned training case', async () => {
    const { record } = await (await post({ action: 'create', name: 'Synthetic case to remove' })).json();
    const remove = { action: 'remove', id: record.id, version: 1 };
    mocks.auth.mockResolvedValueOnce({ userId: 'user_B', sessionId: 'sess_b' });
    expect((await post({ ...remove, uid: 'user_A' })).status).toBe(409);
    expect((await post({ ...remove, version: 2 })).status).toBe(409);
    expect((await post({ ...remove, id: '../case' })).status).toBe(400);
    expect(await (await post({ action: 'list' })).json()).toEqual({ cases: [record] });
    const removed = await post(remove);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ removed: true });
    expect(await (await post({ action: 'list' })).json()).toEqual({ cases: [] });
    expect((await post(remove)).status).toBe(409);
  });
});

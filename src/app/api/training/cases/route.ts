import {
  trainingAccessError, trainingCaseId, trainingCaseStore,
} from '@/lib/clerk-training-store';

const headers = { 'Cache-Control': 'private, no-store' };

function reply(status: number, body: object) {
  return Response.json(body, { status, headers });
}

async function readPayload(request: Request): Promise<Record<string, unknown> | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 150_000) {
        void reader.cancel().catch(() => {});
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    const data: unknown = JSON.parse(text + decoder.decode());
    return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const access = trainingAccessError(request);
  if (access) return reply(access.status, { error: access.error });
  try {
    const store = await trainingCaseStore();
    if (!store.records) return reply(store.status, { error: store.error });
    const { database, records } = store;

    if (request.headers.get('Content-Type') !== 'application/json') return reply(415, { error: 'invalid_request' });
    const data = await readPayload(request);
    if (!data) return reply(400, { error: 'invalid_request' });

    if (data.action === 'list') {
      const snapshot = await records.limit(100).get();
      return reply(200, { cases: snapshot.docs.map((document) => {
        const { name, earlier, later, version } = document.data();
        return { id: document.id, name, earlier, later, version };
      }) });
    }
    if (data.action === 'create') {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name || name.length > 80) return reply(400, { error: 'invalid_case' });
      const id = 'SYNC-' + crypto.randomUUID().replaceAll('-', '').toUpperCase();
      const initialCase = { name, version: 1, earlier: '', later: '' };
      const created = await database.runTransaction(async (transaction) => {
        const count = await transaction.get(records.limit(100));
        if (count.size >= 100) return false;
        transaction.create(records.doc(id), initialCase);
        return true;
      });
      return created ? reply(201, { record: { ...initialCase, id } }) : reply(409, { error: 'case_limit' });
    }
    if (data.action === 'remove') {
      const { id, version } = data;
      if (typeof id !== 'string' || !trainingCaseId.test(id) || typeof version !== 'number'
        || !Number.isSafeInteger(version) || version < 1) {
        return reply(400, { error: 'invalid_case' });
      }
      const record = records.doc(id);
      const removed = await database.runTransaction(async (transaction) => {
        const current = await transaction.get(record);
        if (!current.exists || current.get('version') !== version) return false;
        transaction.delete(record);
        return true;
      });
      return removed ? reply(200, { removed: true }) : reply(409, { error: 'case_conflict' });
    }
    if (data.action === 'save') {
      const { id, earlier, later, version } = data;
      if (typeof id !== 'string' || !trainingCaseId.test(id) || typeof earlier !== 'string' || earlier.length > 12000
        || typeof later !== 'string' || later.length > 12000 || typeof version !== 'number'
        || !Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER) {
        return reply(400, { error: 'invalid_case' });
      }
      const record = records.doc(id);
      const saved = await database.runTransaction(async (transaction) => {
        const current = await transaction.get(record);
        if (!current.exists || current.get('version') !== version) return false;
        transaction.update(record, { earlier, later, version: version + 1 });
        return true;
      });
      return saved ? reply(200, { version: version + 1 }) : reply(409, { error: 'case_conflict' });
    }
    return reply(400, { error: 'invalid_request' });
  } catch {
    return reply(503, { error: 'training_unavailable' });
  }
}

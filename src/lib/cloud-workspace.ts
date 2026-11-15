'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { BrowserPatient } from '@/lib/browser-patients';

export type CaseNotes = { earlier: string; later: string };
export type CloudCase = BrowserPatient & CaseNotes & { version: number };

const apiKey = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_API_KEY;
const appId = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_APP_ID;
const projectId = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_PROJECT;
const authDomain = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_AUTH_DOMAIN;
export const cloudWorkspaceEnabled = Boolean(apiKey && appId && projectId && authDomain);
export const CLOUD_CASE_LIMIT = 100;

async function connectWorkspace() {
  const [app, auth, store] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/firestore'),
  ]);
  const client = app.initializeApp({ apiKey, appId, projectId, authDomain }, 'diffmd-workspace');
  const identity = auth.initializeAuth(client, {
    persistence: auth.browserSessionPersistence,
    popupRedirectResolver: auth.browserPopupRedirectResolver,
  });
  const database = store.initializeFirestore(client, { localCache: store.memoryLocalCache() });
  return { auth, identity, store, database };
}

let connection: ReturnType<typeof connectWorkspace> | undefined;

function connect() {
  return connection ??= connectWorkspace().catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
}

export function useCloudSession() {
  const [user, setUser] = useState<User | null>(null);
  const [pending, setPending] = useState(cloudWorkspaceEnabled);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cloudWorkspaceEnabled) return;
    let canceled = false;
    let stop: (() => void) | undefined;
    void connect().then(({ auth, identity }) => {
      if (canceled) return;
      stop = auth.onAuthStateChanged(identity, (nextUser) => {
        setUser(nextUser);
        setPending(false);
      });
    }).catch(() => {
      if (!canceled) {
        setPending(false);
        setError('Account sign-in is unavailable. You can still work in this browser.');
      }
    });
    return () => {
      canceled = true;
      stop?.();
    };
  }, []);

  async function changeAccount(signingIn: boolean) {
    setPending(true);
    setError('');
    try {
      const { auth, identity } = await connect();
      if (signingIn) {
        await auth.signInWithPopup(identity, new auth.GoogleAuthProvider());
      } else {
        await auth.signOut(identity);
      }
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'auth/popup-blocked') {
        setError('Allow pop-ups for DiffMD, then try signing in again.');
      } else if (code !== 'auth/popup-closed-by-user') {
        setError(signingIn ? 'Could not sign in. Try again.' : 'Could not sign out. Try again.');
      }
    } finally {
      setPending(false);
    }
  }

  return { user, pending, error, changeAccount };
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined;
}

export function useCloudCases(uid: string | undefined) {
  const [cases, setCases] = useState<CloudCase[]>([]);
  const [loading, setLoading] = useState(Boolean(uid));
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let canceled = false;
    let stop: (() => void) | undefined;
    function failed(cause: unknown) {
      if (canceled) return;
      setCases([]);
      setLoading(false);
      setConnected(false);
      setError(errorCode(cause) === 'permission-denied'
        ? 'Cloud workspace access is limited to invited accounts.'
        : 'Could not load cloud cases. Try again.');
    }
    void connect().then(({ store, database }) => {
      if (canceled) return;
      const collection = store.collection(database, 'workspaces', uid, 'cases');
      const query = store.query(collection, store.limit(CLOUD_CASE_LIMIT));
      stop = store.onSnapshot(query, { includeMetadataChanges: true }, (snapshot) => {
        setConnected(!snapshot.metadata.fromCache);
        if (snapshot.metadata.fromCache) return;
        setCases(snapshot.docs.map((doc): CloudCase => ({ ...(doc.data() as Omit<CloudCase, 'id'>), id: doc.id })));
        setLoading(false);
        setError('');
      }, failed);
    }).catch(failed);
    return () => {
      canceled = true;
      stop?.();
    };
  }, [attempt, uid]);

  function retry() {
    setLoading(true);
    setConnected(false);
    setError('');
    setAttempt((current) => current + 1);
  }

  return { cases, loading, connected, error, retry };
}

export async function createCloudCase(uid: string, name: string): Promise<CloudCase> {
  const { store, database } = await connect();
  const id = 'SYNC-' + crypto.randomUUID().replaceAll('-', '').toUpperCase();
  const data = { name, earlier: '', later: '', version: 1 };
  const destination = store.doc(database, 'workspaces', uid, 'cases', id);
  await store.runTransaction(database, async (transaction) => {
    if ((await transaction.get(destination)).exists()) throw new Error('Case already exists.');
    transaction.set(destination, data);
  });
  return { ...data, id };
}

export async function saveCloudCaseNotes(uid: string, record: CloudCase, notes: CaseNotes): Promise<number> {
  const { store, database } = await connect();
  const destination = store.doc(database, 'workspaces', uid, 'cases', record.id);
  return store.runTransaction(database, async (transaction) => {
    const latest = await transaction.get(destination);
    if (!latest.exists() || latest.get('version') !== record.version) throw new CloudCaseConflict();
    const version = record.version + 1;
    transaction.update(destination, { ...notes, version });
    return version;
  });
}

export async function removeCloudCase(uid: string, record: CloudCase): Promise<void> {
  const { store, database } = await connect();
  const destination = store.doc(database, 'workspaces', uid, 'cases', record.id);
  await store.runTransaction(database, async (transaction) => {
    const latest = await transaction.get(destination);
    if (!latest.exists() || latest.get('version') !== record.version) throw new CloudCaseConflict();
    transaction.delete(destination);
  });
}

export class CloudCaseConflict extends Error {}

'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { BrowserPatient } from '@/lib/browser-patients';
import { clerkTrainingEnabled } from '@/lib/clerk-training';

export type CaseNotes = { earlier: string; later: string };
export type CloudCase = BrowserPatient & CaseNotes & { version: number };
export type CloudSession = {
  user: Pick<User, 'uid' | 'getIdToken'> | null;
  pending: boolean;
  error: string;
  changeAccount: (signingIn: boolean) => Promise<void>;
};
type GetToken = () => Promise<string>;

const apiKey = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_API_KEY;
const appId = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_APP_ID;
const projectId = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_PROJECT;
const authDomain = process.env.NEXT_PUBLIC_DIFFMD_FIREBASE_AUTH_DOMAIN;
const localWidgetQa = process.env.NODE_ENV === 'development'
  && process.env.NEXT_PUBLIC_DIFFMD_LOCAL_WIDGET_QA === '1';
const hostedTrainingData = process.env.NODE_ENV === 'development'
  && process.env.NEXT_PUBLIC_DIFFMD_TRAINING_WORKSPACE === '1';
const qaProject = 'demo-diffmd-widget-qa';
const trainingProject = 'diffmd-training-veritas-26';
export const trainingWorkspace = localWidgetQa || hostedTrainingData || clerkTrainingEnabled;
export const cloudWorkspaceEnabled = clerkTrainingEnabled || Boolean(apiKey && appId && projectId && authDomain);
export const CLOUD_CASE_LIMIT = 100;

async function connectWorkspace() {
  if (localWidgetQa && (projectId !== qaProject || window.location.hostname !== '127.0.0.1')) {
    throw new Error('Widget QA requires the local demo project and a loopback browser address.');
  }
  if (hostedTrainingData && (projectId !== trainingProject
    || authDomain !== `${trainingProject}.firebaseapp.com` || window.location.hostname !== 'localhost')) {
    throw new Error('Training requires the separate DiffMD Training project and localhost.');
  }
  const [app, auth, store] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/firestore'),
  ]);
  const client = app.initializeApp({ apiKey, appId, projectId, authDomain }, 'diffmd-workspace');
  const identity = auth.initializeAuth(client, {
    persistence: auth.browserSessionPersistence,
    popupRedirectResolver: auth.browserPopupRedirectResolver,
  });
  if (localWidgetQa) auth.connectAuthEmulator(identity, 'http://127.0.0.1:9199');
  const database = store.initializeFirestore(client, { localCache: store.memoryLocalCache() });
  if (localWidgetQa) store.connectFirestoreEmulator(database, '127.0.0.1', 8180);
  return { auth, identity, store, database };
}

let connection: ReturnType<typeof connectWorkspace> | undefined;

function connect() {
  return connection ??= connectWorkspace().catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
}

export function useCloudSession(): CloudSession {
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

async function clerkCaseRequest(getToken: GetToken, body: object, signal: AbortSignal) {
  const token = await getToken();
  const response = await fetch('/api/training/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    cache: 'no-store',
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 403 || response.status === 401) throw { code: 'permission-denied' };
  if (response.status === 409) throw new CloudCaseConflict();
  if (!response.ok) throw new Error('Unable to sync training cases.');
  return response.json();
}

export function useCloudCases(uid: string | undefined, getToken?: GetToken) {
  const [cases, setCases] = useState<CloudCase[]>([]);
  const [loading, setLoading] = useState(Boolean(uid));
  const [connected, setConnected] = useState(false);
  const [trainingAccess, setTrainingAccess] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const caseRevision = useRef(0);

  useEffect(() => {
    if (!uid) return;
    let canceled = false;
    let stop: (() => void) | undefined;
    function failed(cause: unknown) {
      if (canceled) return;
      const denied = errorCode(cause) === 'permission-denied';
      if (!getToken || denied) {
        setCases([]);
        setTrainingAccess(false);
      }
      setLoading(false);
      setConnected(false);
      setError(denied
        ? 'Cloud workspace access is limited to invited accounts.'
        : 'Could not load cloud cases. Try again.');
    }
    if (getToken) {
      const lifetime = new AbortController();
      let inFlight = false;
      async function load() {
        if (!getToken || inFlight || lifetime.signal.aborted) return;
        inFlight = true;
        const revision = caseRevision.current;
        try {
          const result: { cases: CloudCase[] } = await clerkCaseRequest(getToken, { action: 'list' },
            AbortSignal.any([lifetime.signal, AbortSignal.timeout(8000)]));
          if (!canceled && revision === caseRevision.current) {
            setCases(result.cases);
            setTrainingAccess(true);
            setConnected(true);
            setLoading(false);
            setError('');
          }
        } catch (error) {
          if (revision === caseRevision.current) failed(error);
        } finally {
          inFlight = false;
        }
      }
      function whileVisible() {
        if (document.visibilityState === 'visible') void load();
      }
      void load();
      const timer = window.setInterval(whileVisible, 15_000);
      document.addEventListener('visibilitychange', whileVisible);
      return () => {
        canceled = true;
        lifetime.abort();
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', whileVisible);
      };
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
  }, [attempt, getToken, uid]);

  function retry(inBackground = false) {
    if (!inBackground) {
      setLoading(true);
      setConnected(false);
    }
    setError('');
    setAttempt((current) => current + 1);
  }

  function applyTrainingCaseChange(id: string, record?: CloudCase) {
    caseRevision.current++;
    setCases((current) => {
      const remaining = current.filter((item) => item.id !== id);
      return record ? [...remaining, record] : remaining;
    });
    retry(true);
  }

  return { cases, loading, connected, error, retry, applyTrainingCaseChange, trainingAccess };
}

export async function createCloudCase(uid: string, name: string, getToken?: GetToken): Promise<CloudCase> {
  if (getToken) {
    const { record } = await clerkCaseRequest(getToken, { action: 'create', name }, AbortSignal.timeout(8000));
    return record;
  }
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

export async function saveCloudCaseNotes(uid: string, record: CloudCase, notes: CaseNotes, getToken?: GetToken): Promise<number> {
  if (getToken) {
    const { version } = await clerkCaseRequest(getToken, { action: 'save', id: record.id, version: record.version, ...notes },
      AbortSignal.timeout(8000));
    return version;
  }
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

export async function removeTrainingCase({ id, version }: CloudCase, getToken: GetToken): Promise<void> {
  await clerkCaseRequest(getToken, { action: 'remove', id, version }, AbortSignal.timeout(8000));
}

export class CloudCaseConflict extends Error {}

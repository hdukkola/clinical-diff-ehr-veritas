'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { QWEN_TEST_CASES } from '@/lib/qwen-test-cases';

const gateway = process.env.NEXT_PUBLIC_DIFFMD_MODEL_GATEWAY;

type TestResult = {
  caseId: string;
  medications: string[] | null;
  passed: boolean;
  critical: boolean;
  seconds: number;
};

export function QwenModelTest({
  user, authPending, authError, signIn,
}: {
  user: User | null;
  authPending: boolean;
  authError: string;
  signIn: () => void;
}) {
  const [caseId, setCaseId] = useState(QWEN_TEST_CASES[0]);
  const [result, setResult] = useState<TestResult>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function runTest() {
    if (!user || !gateway || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setResult(undefined);
    setBusy(true);
    setStatus('Qwen is running the selected case. This can take up to two minutes.');
    try {
      const token = await user.getIdToken();
      const response = await fetch(gateway + '/api/model-evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DiffMD-Workspace-Token': token },
        body: JSON.stringify({ caseId }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(135_000)]),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(typeof body.error === 'string' ? body.error : 'Could not run the hosted model.');
        return;
      }
      setResult(body as TestResult);
      setStatus('Test complete.');
    } catch (error) {
      if (!controller.signal.aborted) {
        setStatus(error instanceof DOMException && error.name === 'TimeoutError'
          ? 'The hosted model timed out.' : 'Could not reach the hosted model.');
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  if (!gateway) return null;
  return (
    <section className="workspace-overview patient-chat" aria-labelledby="qwen-test-heading">
      <header>
        <h2 className="h2" id="qwen-test-heading">Qwen 4B medication extraction</h2>
        <p>Run the trained model on a prepared synthetic note. Results require human review.</p>
      </header>
      {user ? (
        <form className="patient-chat-context" onSubmit={(event) => { event.preventDefault(); void runTest(); }}>
          <label>Synthetic case
            <select value={caseId} disabled={busy} onChange={(event) => setCaseId(event.target.value)}>
              {QWEN_TEST_CASES.map((id) => <option key={id} value={id}>{id.replaceAll('-', ' ')}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={busy} type="submit">{busy ? 'Running test…' : 'Run test'}</button>
        </form>
      ) : (
        <>
          <p>Model testing is available to invited teammates.</p>
          <button className="btn" type="button" disabled={authPending} onClick={signIn}>Sign in to test Qwen</button>
          {authError && <p role="alert">{authError}</p>}
        </>
      )}
      <p role="status">{status}</p>
      {result && (
        <div className="patient-chat-answer">
          <p><strong>{result.passed ? 'Passed' : 'Failed'}</strong> · {result.caseId} · {Math.round(result.seconds)} seconds</p>
          <p>{result.medications === null ? 'No valid extraction returned.' : result.medications.length
            ? 'Extracted medication names · ' + result.medications.join(', ') : 'No medication names extracted.'}</p>
        </div>
      )}
    </section>
  );
}

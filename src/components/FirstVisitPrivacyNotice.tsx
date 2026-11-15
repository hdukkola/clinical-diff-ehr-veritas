'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { cloudWorkspaceEnabled, trainingWorkspace } from '@/lib/cloud-workspace';
import styles from './FirstVisitPrivacyNotice.module.css';

const noticeKey = 'diffmd-privacy-notice-v1';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function hasSeenNotice() {
  try {
    return window.localStorage.getItem(noticeKey) === 'seen';
  } catch {
    return false;
  }
}

export function FirstVisitPrivacyNotice() {
  const seen = useSyncExternalStore(subscribe, hasSeenNotice, () => false);
  const [dismissed, setDismissed] = useState(false);

  if (seen || dismissed) return null;

  return (
    <aside className={styles.notice} aria-labelledby="privacy-notice-heading">
      <div>
        <h2 id="privacy-notice-heading">Privacy and data</h2>
        <p>
          {trainingWorkspace ? 'Use synthetic case references and notes only.' : 'Use de-identified case references and notes.'} {cloudWorkspaceEnabled
            ? 'Browser cases stay here. In an account workspace, saved notes sync to Firebase.'
            : 'They stay in this browser.'} Our hosting provider can log basic details about visits.
        </p>
      </div>
      <div className={styles.actions}>
        <Link href="/privacy" prefetch={false}>Privacy and cookies</Link>
        <button type="button" onClick={() => {
          try {
            window.localStorage.setItem(noticeKey, 'seen');
          } catch {
            // Dismiss for the current visit when browser storage is unavailable.
          }
          setDismissed(true);
        }}>Got it</button>
      </div>
    </aside>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './privacy.module.css';

export const metadata: Metadata = {
  title: 'Privacy and cookies | DiffMD',
  description: 'How DiffMD handles browser storage and web requests.',
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <Link href="/" prefetch={false}>Back to DiffMD</Link>
      <h1>Privacy and cookies</h1>
      <p>Use de-identified case references and notes in the public workspace. Keep names, medical record numbers and visit recordings out of the site.</p>

      <section aria-labelledby="privacy-browser">
        <h2 id="privacy-browser">What stays in your browser</h2>
        <p>
          Case references, note drafts, medication review decisions and widget layouts are stored in this
          browser. Your DiffMD tabs can access that storage. Clear this site&apos;s browser storage to remove
          saved data and preferences.
        </p>
        <p>
          Comparison results, activity and chat history are kept in the current tab. Reload the page and
          compare your saved notes again to rebuild the results and recover decisions for that exact note pair.
        </p>
      </section>

      <section aria-labelledby="privacy-processing">
        <h2 id="privacy-processing">What gets sent</h2>
        <p>
          The public comparison runs in your browser. Google Cloud can log request details such as IP address,
          browser information, requested URL and time. This app uses no advertising or analytics trackers.
        </p>
      </section>

      <section aria-labelledby="privacy-review">
        <h2 id="privacy-review">Review the source notes</h2>
        <p>
          A comparison can miss medication mentions or clinical context. Check each finding in the original
          notes before relying on it.
        </p>
      </section>
    </main>
  );
}

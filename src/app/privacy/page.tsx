import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './privacy.module.css';

export const metadata: Metadata = {
  title: 'Privacy and cookies | DiffMD',
  description: 'How the DiffMD public demo handles sessions, browser storage and example records.',
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <Link href="/" prefetch={false}>Back to DiffMD</Link>
      <h1>Privacy and cookies</h1>
      <p>Use this public demo with fictional records only. Keep patient information, real visit recordings and other identifying details out of the app.</p>

      <section aria-labelledby="privacy-session">
        <h2 id="privacy-session">Demo reviews and browser storage</h2>
        <p>
          When the workspace loads, DiffMD uses a session cookie with a random ID to keep your review
          activity together. The server can store your demo review choices and audit entries under that ID.
          This app uses browser storage to remember your display palette, widget layouts and that you saw this notice.
        </p>
        <p>
          Clear this site&apos;s cookies and storage in your browser to start a fresh session and reset those
          preferences. Clearing them disconnects your browser from the old session. Server logs and
          previously saved demo activity are handled separately.
        </p>
      </section>

      <section aria-labelledby="privacy-processing">
        <h2 id="privacy-processing">What gets sent</h2>
        <p>
          Our hosting provider, Google Cloud, can log request details such as IP address, browser information,
          the requested URL and time. DiffMD uses its demo review service to load and save review activity.
        </p>
        <p>
          On the hosted demo, chat questions, reviewed chart corrections and page notes stay in this browser tab and clear on reload. An optional local development model can process questions on the same computer.
        </p>
        <p>
          When hosted AI is available and you request a comparison, the text you submit can be sent to the
          configured model service. The encounter note demo uses the bundled fictional encounter. Keep personal
          information out of text fields, including manual notes. This app uses no advertising or analytics trackers.
        </p>
      </section>

      <section aria-labelledby="privacy-ai">
        <h2 id="privacy-ai">AI notes are in beta</h2>
        <p>
          This demo is for evaluation. Transcripts and drafts can omit facts or get the medication, dose,
          timing or negation wrong. Clinicians should take their own notes during a visit and check any AI-assisted
          draft against the original source and their own notes before using it.
        </p>
      </section>
    </main>
  );
}

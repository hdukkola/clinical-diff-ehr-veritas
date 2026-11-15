import { useEffect, useRef, useState } from 'react';
import { AUDIO_SAMPLE, AUDIO_TRANSCRIPTION_CHECKS, type AudioDraft } from '@/lib/encounter-audio';

const statusMessages: Record<string, string> = {
  unavailable: 'The hosted audio note-taker is unavailable. You can still play the recording.',
  timeout: 'Processing took too long. Try again or review the recording directly.',
  busy: 'The note-taker is processing another request. Try again shortly.',
};

function timestamp(ms: number) {
  return `0:${String(Math.floor(ms / 1000)).padStart(2, '0')}`;
}

export function EncounterAudioNote() {
  const [result, setResult] = useState<AudioDraft | null>(null);
  const [text, setText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function processRecording() {
    if (activeRequest.current) return;
    const request = new AbortController();
    activeRequest.current = request;
    setBusy(true);
    setStatus('Transcribing the recording and checking the draft evidence…');
    try {
      const response = await fetch('/api/encounter-audio', { method: 'POST', signal: request.signal });
      const body = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) {
        setStatus(Object.hasOwn(statusMessages, body.status)
          ? statusMessages[body.status] : 'The note-taker returned an unusable result.');
        return;
      }
      const draft: AudioDraft = body;
      setResult(draft);
      setText(draft.segments.filter(({ id }) => draft.selectedIds.includes(id)).map((segment) => segment.text).join('\n'));
      setReviewed(false);
      const missing = [...draft.checksFailed, ...draft.draftChecksFailed].map((item) => AUDIO_TRANSCRIPTION_CHECKS[item]);
      setStatus(draft.checksFailed.length
        ? `Draft withheld. Check the recording for ${missing.join(', ')}.`
        : draft.draftChecksFailed.length
          ? `Draft withheld because it omitted ${missing.join(', ')}. Review the transcript and recording.`
          : 'Draft ready for review against the recording.');
    } catch {
      if (!request.signal.aborted) setStatus('Could not process the recording. Try again.');
    } finally {
      activeRequest.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  async function copyNote() {
    try {
      await navigator.clipboard.writeText(text.trim());
      setStatus('Reviewed note copied.');
    } catch {
      setStatus('Clipboard access is unavailable. You can select the draft text and copy it.');
    }
  }

  function seek(startMs: number) {
    if (audio.current) {
      audio.current.currentTime = startMs / 1000;
      void audio.current.play().catch(() => {});
    }
  }

  return (
    <section className="encounter-transcript encounter-audio-note" aria-labelledby="audio-note-title">
      <header>
        <div>
          <h2 id="audio-note-title">Audio note-taker</h2>
          <p>Fictional recording · Review required</p>
        </div>
        <button type="button" className="btn" disabled={busy || result !== null} onClick={processRecording}>
          {busy ? 'Processing…' : 'Process recording'}
        </button>
      </header>
      <audio ref={audio} controls preload="metadata" src={AUDIO_SAMPLE.path} aria-label="Fictional medication follow-up recording" />
      {!result && !status && <p className="transcript-source">Whisper transcribes this sample and Qwen selects excerpts for a draft.</p>}
      <p className="transcript-source" role="status">{status}</p>
      <details>
        <summary>Recording script</summary>
        <ul aria-label="Script used to generate the fictional audio">
          <li><strong>Clinician</strong><span>Can I record our fictional visit for the note?</span></li>
          <li><strong>Patient</strong><span>Yes. Was my aspirin stopped?</span></li>
          <li><strong>Clinician</strong><span>The discharge note lists lisinopril, twenty milligrams daily. It does not say whether aspirin was stopped. I will check the original instructions.</span></li>
        </ul>
      </details>
      {result && (
        <>
          <details open>
            <summary>Whisper transcript{result.cached ? ' · Previous hosted run' : ''}</summary>
            <ul>
              {result.segments.map(({ id, startMs, text }) => (
                <li key={id}>
                  <button className="btn" type="button" onClick={() => seek(startMs)} aria-label={`Play recording at ${timestamp(startMs)}`}>
                    {timestamp(startMs)}
                  </button>
                  <span>{text}</span>
                  {result.selectedIds.includes(id) && <small>In draft</small>}
                </li>
              ))}
            </ul>
          </details>
          {result.selectedIds.length > 0 && (
            <div className="audio-note-editor">
              <label htmlFor="reviewed-audio-note">Qwen draft</label>
              <textarea id="reviewed-audio-note" value={text} rows={5} onChange={(event) => {
                setText(event.target.value);
                setReviewed(false);
              }} />
              <label>
                <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
                I checked this draft against the recording
              </label>
              <button type="button" className="btn" disabled={!reviewed || !text.trim()} onClick={copyNote}>
                Copy reviewed note
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

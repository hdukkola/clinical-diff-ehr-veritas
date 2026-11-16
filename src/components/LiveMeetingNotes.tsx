'use client';

import { useEffect, useRef, useState } from 'react';
import { isRecordingTranscript, RECORDING_RATE } from '@/lib/recording-transcription';
import { encodeRecordingWav } from '@/lib/recording-wav';

const meetingLimitMs = 10 * 60_000;
const maxPending = 4;
const noteLimit = 12_000;
type Phase = 'idle' | 'opening' | 'recording' | 'finishing' | 'review';

const sectionErrors: Partial<Record<number, string>> = {
  401: 'Your sign-in expired. Sign in before recording again.',
  403: 'Access to this case could not be verified.',
  429: 'Whisper was busy during part of the recording.',
  503: 'Whisper is temporarily unavailable.',
  504: 'Whisper took too long to transcribe a section.',
};

function timestamp(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

async function meetingWav(samples: Float32Array, rate: number) {
  if (rate === RECORDING_RATE) return encodeRecordingWav(samples);
  const renderer = new OfflineAudioContext(1, Math.ceil(samples.length * RECORDING_RATE / rate), RECORDING_RATE);
  const input = renderer.createBuffer(1, samples.length, rate);
  input.getChannelData(0).set(samples);
  const source = renderer.createBufferSource();
  source.buffer = input;
  source.connect(renderer.destination);
  source.start();
  return encodeRecordingWav((await renderer.startRendering()).getChannelData(0));
}

export function LiveMeetingNotes({ caseId, uid, getToken, onUse, disabled }: {
  caseId: string;
  uid: string;
  getToken: () => Promise<string>;
  onUse: (note: string) => boolean;
  disabled: boolean;
}) {
  const [permission, setPermission] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [gaps, setGaps] = useState<string[]>([]);
  const session = useRef<{ abort: AbortController; stop: () => void } | null>(null);
  const active = phase === 'opening' || phase === 'recording' || phase === 'finishing';

  useEffect(() => () => session.current?.abort.abort(), []);
  useEffect(() => {
    if (!active && !note) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active, note]);

  async function start() {
    if (!permission || disabled || session.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      setError('Meeting capture needs a browser with microphone access and Web Audio.');
      return;
    }
    if (note && !window.confirm('Replace this unsaved meeting draft?')) return;
    const abort = new AbortController();
    const { signal } = abort;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let node: AudioWorkletNode | undefined;
    let limit: number | undefined;
    let flushTimeout: number | undefined;
    let queued = Promise.resolve();
    let pending = 0;
    let captured = 0;
    let stopping = false;
    let finishing = false;
    let serviceRejected = false;
    let draft = '';

    function recordGap(offset: number) {
      setGaps((current) => [...current, timestamp(offset)].sort());
    }

    function closeMicrophone() {
      window.clearTimeout(limit);
      stream?.getTracks().forEach((track) => track.stop());
    }

    function release() {
      closeMicrophone();
      window.clearTimeout(flushTimeout);
      node?.port.close();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    }

    async function finish() {
      if (finishing) return;
      finishing = true;
      release();
      await queued;
      if (signal.aborted) return;
      session.current = null;
      setPhase('review');
      if (!draft) setError((current) => current || 'No speech was transcribed. Check the microphone and try again.');
    }

    function stop() {
      if (stopping || signal.aborted) return;
      stopping = true;
      closeMicrophone();
      setPhase('finishing');
      if (!node) {
        abort.abort();
        session.current = null;
        setPhase('idle');
        return;
      }
      node.port.postMessage('finish');
      flushTimeout = window.setTimeout(() => {
        setError('The last portion could not be captured. Review the partial draft.');
        void finish();
      }, 1000);
    }

    session.current = { abort, stop };
    signal.addEventListener('abort', release, { once: true });
    setPhase('opening');
    setError('');
    setGaps([]);
    setNote('');
    setReviewed(false);

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (signal.aborted) {
        closeMicrophone();
        return;
      }
      context = new AudioContext();
      const rate = context.sampleRate;
      await context.audioWorklet.addModule('/audio/meeting-capture.js');
      await context.resume();
      if (signal.aborted) return;
      node = new AudioWorkletNode(context, 'diffmd-meeting-capture', { channelCount: 1, channelCountMode: 'explicit' });
      node.port.onmessage = ({ data }: MessageEvent<Float32Array | 'finished'>) => {
        if (signal.aborted || finishing) return;
        if (data === 'finished') {
          void finish();
          return;
        }

        const offset = captured * 1000 / rate;
        captured += data.length;
        if (pending >= maxPending || draft.length >= noteLimit) {
          recordGap(offset);
          setError('Capture stopped because the transcription queue or note reached its limit. Review the partial draft.');
          stop();
          return;
        }
        pending++;
        queued = queued.then(async () => {
          if (signal.aborted) return;
          if (serviceRejected) {
            recordGap(offset);
            return;
          }
          const token = await getToken();
          if (signal.aborted) return;
          const response = await fetch('/api/recording-transcription', {
            method: 'POST',
            headers: {
              'Content-Type': 'audio/wav',
              'X-DiffMD-Workspace-Token': token,
              'X-DiffMD-Workspace-UID': uid,
              'X-DiffMD-Case-ID': caseId,
            },
            body: await meetingWav(data, rate),
            signal: AbortSignal.any([signal, AbortSignal.timeout(49_000)]),
          });
          if (signal.aborted) return;
          if (!response.ok) {
            void response.body?.cancel().catch(() => {});
            if (response.status === 422) return;
            recordGap(offset);
            if (response.status === 429 || response.status >= 500) {
              const message = sectionErrors[response.status] ?? 'Some audio could not be transcribed.';
              setError((current) => current || `${message} Review the missing sections.`);
              return;
            }
            serviceRejected = true;
            setError(sectionErrors[response.status] ?? 'The transcription service rejected the recording. Review the partial draft.');
            stop();
            return;
          }
          const result: unknown = await response.json();
          if (signal.aborted) return;
          if (!isRecordingTranscript(result)) throw new Error('Could not transcribe this section.');
          const lines = result.segments.map((segment) => '[' + timestamp(offset + segment.startMs) + '] ' + segment.text);
          const next = [draft, ...lines].filter(Boolean).join('\n');
          if (next.length > noteLimit) {
            recordGap(offset);
            setError('The meeting note reached its length limit. Review the partial draft.');
            stop();
            return;
          }
          draft = next;
          setNote(draft);
        }).catch(() => {
          if (signal.aborted) return;
          recordGap(offset);
          setError((current) => current || 'Some audio could not be transcribed. Review the missing sections.');
        }).finally(() => { pending--; });
      };
      const interrupted = () => {
        setError('The microphone was interrupted. Review the partial draft.');
        stop();
      };
      node.onprocessorerror = interrupted;
      stream.getAudioTracks().forEach((track) => track.addEventListener('ended', interrupted, { once: true }));
      context.createMediaStreamSource(stream).connect(node);
      node.connect(context.destination);
      setPhase('recording');
      limit = window.setTimeout(() => {
        setError('The 10-minute capture limit was reached.');
        stop();
      }, meetingLimitMs);
    } catch (issue) {
      if (signal.aborted) return;
      abort.abort();
      session.current = null;
      setPhase('idle');
      setError(issue instanceof DOMException && issue.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it in the browser to try again.'
        : 'Could not start the microphone. Check the input device and try again.');
    }
  }

  return (
    <section className="patient-create-form" aria-labelledby="meeting-notes-title">
      <h2 id="meeting-notes-title" className="h2">Meeting notes</h2>
      <p>Record up to 10 minutes of English conversation. Whisper updates the timestamped draft in 12-second sections. Stay on this case until you review it.</p>
      <label>
        <input type="checkbox" checked={permission} disabled={active || disabled}
          onChange={(event) => setPermission(event.target.checked)} />
        {' '}Everyone has agreed to recording. This conversation contains no identifying information.
      </label>
      <div className="patient-create-actions">
        {active
          ? <button type="button" className="btn" disabled={phase === 'finishing'}
              onClick={() => session.current?.stop()}>{phase === 'opening' ? 'Cancel' : 'Stop recording'}</button>
          : <button type="button" className="btn primary" disabled={!permission || disabled}
              onClick={() => void start()}>Start recording</button>}
      </div>
      {active && <p role="status">{phase === 'opening' ? 'Opening microphone…'
        : phase === 'recording' ? 'Recording from the microphone' : 'Microphone off. Finishing the draft…'}</p>}
      {error && <p role="alert">{error}</p>}
      {gaps.length > 0 && <p>Missing sections starting at {gaps.join(', ')}.</p>}
      {(active || note) && <>
        <label htmlFor="meeting-note-draft">Meeting note draft</label>
        <textarea id="meeting-note-draft" className="search" rows={8} value={note} readOnly={active}
          maxLength={noteLimit} placeholder="Speech will appear here during recording"
          onChange={(event) => { setNote(event.target.value); setReviewed(false); }} />
      </>}
      {phase === 'review' && note && <>
        <label>
          <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
          {' '}I reviewed the notes and checked any missing sections.
        </label>
        <button type="button" className="btn primary" disabled={!reviewed || !note.trim() || disabled}
          onClick={() => {
            if (!onUse(note.trim())) setError('The later note and this draft are too long to combine. Shorten the draft before adding it.');
          }}>Add to later note draft</button>
      </>}
    </section>
  );
}

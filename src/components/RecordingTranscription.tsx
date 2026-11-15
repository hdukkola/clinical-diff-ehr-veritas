'use client';

import { useEffect, useRef, useState } from 'react';
import {
  isRecordingTranscript, RECORDING_RATE, RECORDING_SECONDS, type RecordingTranscript,
} from '@/lib/recording-transcription';
import { encodeRecordingWav } from '@/lib/recording-wav';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const errors: Record<string, string> = {
  busy: 'The transcription service is busy. Try again shortly.',
  timeout: 'Transcription took too long. Try a shorter recording.',
  no_speech: 'No speech was found in this recording.',
  invalid_audio: 'The recording could not be read.',
  recording_too_large: 'Use a recording up to 30 seconds long.',
  sign_in_required: 'Sign in again to transcribe this recording.',
  case_access_required: 'This recording must be attached to a case you can access.',
  unable_to_verify_access: 'Could not verify case access. Check your connection and try again.',
  unavailable: 'Transcription is temporarily unavailable.',
};

async function toWav(file: File) {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }

  const frames = Math.ceil(decoded.length * RECORDING_RATE / decoded.sampleRate);
  if (frames < 1 || frames > RECORDING_SECONDS * RECORDING_RATE) {
    throw new Error('Use a recording up to 30 seconds long.');
  }
  const renderer = new OfflineAudioContext(1, frames, RECORDING_RATE);
  const source = renderer.createBufferSource();
  source.buffer = decoded;
  source.connect(renderer.destination);
  source.start();
  return encodeRecordingWav((await renderer.startRendering()).getChannelData(0));
}

export function RecordingTranscription({ uid, caseId, getToken, onUse, noteExists, disabled }: {
  uid: string;
  caseId: string;
  getToken: () => Promise<string>;
  onUse: (note: string) => void;
  noteExists: boolean;
  disabled: boolean;
}) {
  const [file, setFile] = useState<File>();
  const [playback, setPlayback] = useState('');
  const [permission, setPermission] = useState(false);
  const [pending, setPending] = useState(false);
  const [transcript, setTranscript] = useState<RecordingTranscript>();
  const [text, setText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (playback) return () => URL.revokeObjectURL(playback);
  }, [playback]);

  useEffect(() => () => request.current?.abort(), []);

  async function transcribe() {
    if (!file || !permission || disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      let wav: ArrayBuffer;
      try {
        wav = await toWav(file);
      } catch (issue) {
        throw new Error(issue instanceof Error && issue.message === 'Use a recording up to 30 seconds long.'
          ? issue.message : 'This browser could not open the file. Try a WAV or MP3 recording.');
      }
      const token = await getToken().catch(() => {
        throw new Error(errors.sign_in_required);
      });
      const response = await fetch('/api/recording-transcription', {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          'X-DiffMD-Workspace-Token': token,
          'X-DiffMD-Workspace-UID': uid,
          'X-DiffMD-Case-ID': caseId,
        },
        body: wav,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(49_000)]),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !isRecordingTranscript(data)) {
        throw new Error(errors[data?.error] || 'Unable to transcribe this recording. Try again.');
      }
      const draft = data.segments.map((segment) => segment.text).join('\n');
      if (draft.length > 12_000) throw new Error('The transcript is too long for a note. Use a shorter recording.');
      setTranscript(data);
      setText(draft);
      setReviewed(false);
    } catch (issue) {
      if (!controller.signal.aborted) {
        setError(issue instanceof Error && issue.name === 'TimeoutError' ? errors.timeout :
          issue instanceof Error && issue.name === 'Error' ? issue.message :
            'Unable to transcribe this recording. Try again.');
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <section className="patient-create-form" aria-labelledby="recording-transcription-title">
      <h2 id="recording-transcription-title" className="h2">Transcribe a recording</h2>
      <p id="recording-transcription-help">
        Use up to 30 seconds of English audio. The file is processed in a private cloud service and is discarded
        after processing. Check the transcript against the recording before using it.
      </p>
      <label htmlFor="workspace-recording">Choose an audio file</label>
      <input id="workspace-recording" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" disabled={pending || disabled}
        aria-describedby="recording-transcription-help"
        onChange={(event) => {
          const next = event.currentTarget.files?.[0];
          const tooLarge = Boolean(next && next.size > MAX_FILE_BYTES);
          setFile(tooLarge ? undefined : next);
          setPlayback(tooLarge || !next ? '' : URL.createObjectURL(next));
          setPermission(false);
          setTranscript(undefined);
          setText('');
          setReviewed(false);
          setError(tooLarge ? 'Choose a file under 8 MB.' : '');
        }} />
      {file && playback && <audio ref={audioRef} src={playback} controls preload="metadata" style={{ maxWidth: '100%' }} />}
      <label>
        <input type="checkbox" checked={permission} disabled={!file || pending || disabled}
          onChange={(event) => setPermission(event.target.checked)} />
        {' '}I have permission from everyone recorded to process this audio, and it contains no identifying information.
      </label>
      <div className="patient-create-actions">
        <button type="button" className="btn" disabled={!file || !permission || pending || disabled}
          onClick={transcribe}>Transcribe recording</button>
      </div>
      {pending && <p role="status">Transcribing recording…</p>}
      {error && <p role="alert">{error}</p>}
      {transcript && (
        <>
          <h3>Review transcript</h3>
          <p>Transcribed by {transcript.model}. Check names, doses and unclear words before saving.</p>
          <details>
            <summary>Jump to audio segments</summary>
            <ul>
              {transcript.segments.map(({ startMs, text: segmentText }, index) => (
                <li key={index}>
                  <button type="button" className="btn quiet" aria-label={`Play at ${(startMs / 1000).toFixed(1)} seconds`}
                    onClick={() => {
                      if (!audioRef.current) return;
                      audioRef.current.currentTime = startMs / 1000;
                      void audioRef.current.play().catch(() => {});
                    }}>{(startMs / 1000).toFixed(1)}s</button>
                  {' '}{segmentText}
                </li>
              ))}
            </ul>
          </details>
          <label htmlFor="workspace-transcript">Transcript draft</label>
          <textarea id="workspace-transcript" className="search" rows={6} maxLength={12_000} value={text}
            onChange={(event) => {
              setText(event.target.value);
              setReviewed(false);
            }} />
          <label>
            <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
            {' '}{noteExists
              ? 'I checked the transcript and want to append it to the end of the later note.'
              : 'I checked the transcript against the recording.'}
          </label>
          <div className="patient-create-actions">
            <button type="button" className="btn primary" disabled={!reviewed || !text.trim() || pending || disabled}
              onClick={() => onUse(text.trim())}>{noteExists ? 'Append to later note draft' : 'Use as later note draft'}</button>
          </div>
        </>
      )}
    </section>
  );
}

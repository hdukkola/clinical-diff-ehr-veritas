import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TRANSCRIPTION_MODEL, TRANSCRIPTION_WEIGHTS } from '@/lib/recording-transcription';
import { LiveMeetingNotes } from '@/components/LiveMeetingNotes';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

function transcript(text: string) {
  return Response.json({
    model: TRANSCRIPTION_MODEL,
    weightsSha256: TRANSCRIPTION_WEIGHTS,
    reviewRequired: true,
    segments: [{ startMs: 0, endMs: 900, text }],
  });
}

async function startRecording(network: typeof fetch) {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) },
  });
  const port = {
    onmessage: null as ((event: MessageEvent<Float32Array | 'finished'>) => void) | null,
    postMessage: vi.fn(),
    close: vi.fn(),
  };
  vi.stubGlobal('AudioContext', class {
    sampleRate = 16_000;
    audioWorklet = { addModule: async () => {} };
    destination = {};
    async resume() {}
    async close() {}
    createMediaStreamSource() { return { connect: vi.fn() }; }
  });
  vi.stubGlobal('AudioWorkletNode', class {
    port = port;
    connect = vi.fn();
  });
  vi.stubGlobal('fetch', network);
  const onUse = vi.fn(() => true);
  render(<LiveMeetingNotes caseId="training-case" getToken={async () => 'training-token'} onUse={onUse} disabled={false} />);
  fireEvent.click(screen.getByRole('checkbox', { name: /everyone agreed/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
  await screen.findByText('Recording from the microphone');
  return {
    track,
    onUse,
    async deliver(data: Float32Array | 'finished' = new Float32Array(12 * 16_000)) {
      await act(async () => port.onmessage?.(new MessageEvent('message', { data })));
    },
  };
}

it('keeps capturing after a timeout and requires checking the gap before using the draft', async () => {
  const network = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(transcript('First statement.'))
    .mockResolvedValueOnce(new Response('Gateway timeout', { status: 504 }))
    .mockResolvedValueOnce(transcript('Last statement.'));
  const recording = await startRecording(network);
  await recording.deliver();
  await recording.deliver();
  expect(screen.getByText('Missing sections starting at 00:12.')).toBeInTheDocument();
  expect(screen.getByText('Recording from the microphone')).toBeInTheDocument();
  expect(recording.track.stop).not.toHaveBeenCalled();
  await recording.deliver();
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  await recording.deliver('finished');
  const draft = '[00:00] First statement.\n[00:24] Last statement.';
  expect(screen.getByRole('textbox', { name: 'Meeting note draft' })).toHaveValue(draft);
  const add = screen.getByRole('button', { name: 'Add to later note draft' });
  expect(add).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /checked any missing sections/i }));
  fireEvent.click(add);
  expect(recording.onUse).toHaveBeenCalledExactlyOnceWith(draft);
  expect(network).toHaveBeenCalledTimes(3);
});

it('stops and skips queued audio when case access is rejected', async () => {
  const response = Promise.withResolvers<Response>();
  const network = vi.fn<typeof fetch>().mockReturnValue(response.promise);
  const recording = await startRecording(network);
  await recording.deliver();
  await recording.deliver();
  await act(async () => response.resolve(new Response(null, { status: 403 })));
  await recording.deliver('finished');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Access to this case could no longer be verified.'));
  expect(screen.getByText('Missing sections starting at 00:00, 00:12.')).toBeInTheDocument();
  expect(recording.track.stop).toHaveBeenCalled();
  expect(network).toHaveBeenCalledTimes(1);
});

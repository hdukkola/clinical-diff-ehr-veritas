import { RECORDING_RATE } from '@/lib/recording-transcription';

export function encodeRecordingWav(samples: Float32Array) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const wav = new DataView(bytes);
  wav.setUint32(0, 0x52494646);
  wav.setUint32(4, bytes.byteLength - 8, true);
  wav.setUint32(8, 0x57415645);
  wav.setUint32(12, 0x666d7420);
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true);
  wav.setUint16(22, 1, true);
  wav.setUint32(24, RECORDING_RATE, true);
  wav.setUint32(28, RECORDING_RATE * 2, true);
  wav.setUint16(32, 2, true);
  wav.setUint16(34, 16, true);
  wav.setUint32(36, 0x64617461);
  wav.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    wav.setInt16(44 + index * 2, sample * (sample < 0 ? 32768 : 32767), true);
  }
  return bytes;
}

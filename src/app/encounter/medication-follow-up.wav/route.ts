import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const disabled = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE !== '1') {
    return new Response(null, { status: 404, headers: disabled });
  }

  const audio = await readFile(join(process.cwd(), 'deploy/encounter-note-taker/medication-follow-up.wav'));
  const headers = { ...disabled, 'Accept-Ranges': 'bytes', 'Content-Type': 'audio/wav' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  if (!range || (!range[1] && !range[2])) {
    return new Response(audio, { headers: { ...headers, 'Content-Length': String(audio.length) } });
  }

  const start = range[1] ? Number(range[1]) : Math.max(0, audio.length - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1;
  if (start >= audio.length || start > end) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${audio.length}` } });
  }

  return new Response(audio.subarray(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${audio.length}`,
    },
  });
}

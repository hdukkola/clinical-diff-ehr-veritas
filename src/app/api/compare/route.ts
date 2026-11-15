import { NextRequest, NextResponse } from 'next/server';

const MAX_NOTE_CHARS = 12000;

function getBackendUrl(): string | null {
  const raw = process.env.CLINICAL_DIFF_BACKEND_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export async function GET() {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      mode: 'deterministic_replay',
      simulated: true,
      model: null,
      detail: 'CLINICAL_DIFF_BACKEND_URL is not set; using deterministic local extractor.',
    });
  }

  try {
    const res = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json(
        {
          configured: true,
          reachable: false,
          mode: 'unavailable',
          simulated: true,
          model: null,
          error: typeof data.error === 'string' ? data.error : `Backend health returned ${res.status}`,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      configured: true,
      reachable: true,
      mode: typeof data.mode === 'string' ? data.mode : 'local_mlx',
      simulated: Boolean(data.simulated),
      model: typeof data.model === 'string' ? data.model : 'mlx-community/Qwen3.5-4B-4bit',
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        reachable: false,
        mode: 'unavailable',
        simulated: true,
        model: null,
        error: err instanceof Error ? err.message : 'Unable to reach Qwen backend.',
      },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.', simulated: true }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body must be an object.', simulated: true }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const earlier = record.earlier_note as Record<string, unknown> | undefined;
  const later = record.later_note as Record<string, unknown> | undefined;

  if (
    !earlier ||
    !later ||
    typeof earlier.text !== 'string' ||
    typeof later.text !== 'string' ||
    !earlier.text.trim() ||
    !later.text.trim() ||
    Array.from(earlier.text).length > MAX_NOTE_CHARS ||
    Array.from(later.text).length > MAX_NOTE_CHARS
  ) {
    return NextResponse.json(
      { error: 'Both earlier_note.text and later_note.text must be 1..12,000 characters.', simulated: true },
      { status: 400 },
    );
  }

  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      {
        error: 'CLINICAL_DIFF_BACKEND_URL is not configured.',
        simulated: true,
      },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${backendUrl}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        earlier_note: {
          source_id: typeof earlier.source_id === 'string' ? earlier.source_id : 'earlier-note',
          text: earlier.text,
        },
        later_note: {
          source_id: typeof later.source_id === 'string' ? later.source_id : 'later-note',
          text: later.text,
        },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json(
        {
          error: typeof data.error === 'string' ? data.error : `Backend compare returned ${res.status}`,
          simulated: true,
        },
        { status: res.status >= 400 ? res.status : 502 },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Live Qwen backend request failed.',
        simulated: true,
      },
      { status: 503 },
    );
  }
}

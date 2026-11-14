import { NextResponse } from 'next/server';

/**
 * Server-side proxy to the local synthetic-note extraction service.
 *
 * The browser never talks to the Python service directly (CORS is limited to
 * localhost:3000 on the service side, and this keeps the backend URL server-side).
 * The service base URL comes from CLINICAL_DIFF_SERVICE_URL, defaulting to the
 * local replay/demo port. This route performs no model inference itself.
 */

const DEFAULT_SERVICE = process.env.CLINICAL_DIFF_SERVICE_URL ?? 'http://127.0.0.1:8766';

type ProxyBody =
  | { op: 'health' }
  | { op: 'compare'; earlier: { source_id: string; text: string }; later: { source_id: string; text: string } };

async function serviceFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${DEFAULT_SERVICE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  let body: ProxyBody;
  try {
    body = (await request.json()) as ProxyBody;
  } catch {
    return NextResponse.json({ state: 'error', detail: 'Invalid request body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('op' in body)) {
    return NextResponse.json({ state: 'error', detail: 'Missing op.' }, { status: 400 });
  }

  try {
    if (body.op === 'health') {
      const res = await serviceFetch('/health');
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: res.ok, status: res.status, data });
    }

    if (body.op === 'compare') {
      const res = await serviceFetch('/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ synthetic_only: true, earlier: body.earlier, later: body.later }),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: res.ok, status: res.status, data });
    }

    return NextResponse.json({ state: 'error', detail: 'Unknown op.' }, { status: 400 });
  } catch {
    // Backend unreachable: fail safely, keep the synthetic demo usable.
    return NextResponse.json({ state: 'unavailable', detail: 'Synthetic service unavailable.' }, { status: 503 });
  }
}
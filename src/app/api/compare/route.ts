import { NextRequest, NextResponse } from 'next/server';
import {
  createAIService,
  probeModelSocket,
  redactSensitiveText,
  SocketUpstreamError,
  SocketValidationError,
  validateCompareRequestBody,
} from '@/lib/ai-socket';

export async function GET(req: NextRequest) {
  const probe = await probeModelSocket(req.signal);
  const status = probe.configured && !probe.reachable ? 503 : 200;
  return NextResponse.json(probe, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.', simulated: true, review_required: true },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let validated: ReturnType<typeof validateCompareRequestBody>;
  try {
    validated = validateCompareRequestBody(body);
  } catch (err) {
    const message = err instanceof SocketValidationError ? err.message : 'Invalid request payload.';
    return NextResponse.json(
      { error: message, simulated: true, review_required: true },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const service = createAIService();
    const result = await service.compareNotes(validated.earlier, validated.later, req.signal);
    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof SocketUpstreamError) {
      return NextResponse.json(
        {
          error: redactSensitiveText(err.message),
          simulated: true,
          review_required: true,
        },
        { status: err.statusCode, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const message =
      err instanceof Error ? redactSensitiveText(err.message) : 'Live AI backend request failed.';
    return NextResponse.json(
      { error: message, simulated: true, review_required: true },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

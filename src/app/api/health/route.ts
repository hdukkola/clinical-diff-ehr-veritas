import { NextRequest, NextResponse } from 'next/server';
import { probeModelSocket } from '@/lib/ai-socket';

export async function GET(req: NextRequest) {
  const probe = await probeModelSocket(req.signal);
  const strict = req.nextUrl.searchParams.get('strict') === '1';
  const status = strict && probe.configured && !probe.reachable ? 503 : 200;

  return NextResponse.json(probe, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

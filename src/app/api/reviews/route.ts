import { NextRequest, NextResponse } from 'next/server';
import {
  applySessionStoreMutation,
  getSessionStore,
  resetSessionStore,
  SessionStoreValidationError,
  SYNTHETIC_STORE_DISCLAIMER,
} from '@/lib/session-store';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function readScenarioId(req: NextRequest): string | undefined {
  const fromNextUrl = req.nextUrl?.searchParams?.get('scenarioId');
  if (fromNextUrl) {
    return fromNextUrl;
  }
  try {
    const value = new URL(req.url).searchParams.get('scenarioId');
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function handleMutation(req: NextRequest, method: 'POST' | 'PUT') {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON payload.',
        syntheticOnly: true,
        disclaimer: SYNTHETIC_STORE_DISCLAIMER,
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const snapshot = await applySessionStoreMutation(body, method, {
      scenarioId: readScenarioId(req),
    });
    return NextResponse.json(snapshot, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    if (err instanceof SessionStoreValidationError) {
      return NextResponse.json(
        {
          error: err.message,
          syntheticOnly: true,
          disclaimer: SYNTHETIC_STORE_DISCLAIMER,
        },
        { status: err.statusCode, headers: NO_STORE_HEADERS },
      );
    }
    const message =
      err instanceof Error ? err.message : 'Failed to persist session review update.';
    return NextResponse.json(
      {
        error: message,
        syntheticOnly: true,
        disclaimer: SYNTHETIC_STORE_DISCLAIMER,
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const snapshot = await getSessionStore({
      scenarioId: readScenarioId(req),
    });
    return NextResponse.json(snapshot, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load session store.';
    return NextResponse.json(
      {
        error: message,
        syntheticOnly: true,
        disclaimer: SYNTHETIC_STORE_DISCLAIMER,
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(req: NextRequest) {
  return handleMutation(req, 'POST');
}

export async function PUT(req: NextRequest) {
  return handleMutation(req, 'PUT');
}

export async function DELETE(req: NextRequest) {
  try {
    const snapshot = await resetSessionStore({
      scenarioId: readScenarioId(req),
    });
    return NextResponse.json(snapshot, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to reset session store.';
    return NextResponse.json(
      {
        error: message,
        syntheticOnly: true,
        disclaimer: SYNTHETIC_STORE_DISCLAIMER,
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...NO_STORE_HEADERS,
    },
  });
}

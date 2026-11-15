import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  applySessionStoreMutation,
  getSessionStore,
  resetSessionStore,
  resolveStorePath,
  SessionStoreValidationError,
  SYNTHETIC_STORE_DISCLAIMER,
} from '@/lib/session-store';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

const SESSION_COOKIE = 'diffmd-review-session';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function reviewSession(req: NextRequest) {
  const existing = req.cookies.get(SESSION_COOKIE)?.value;
  const verifiedId = existing && SESSION_ID.test(existing) ? existing : undefined;
  const id = verifiedId ?? randomUUID();
  return {
    options: {
      storePath: path.join(path.dirname(resolveStorePath()), 'sessions', `${id}.json`),
      scenarioId: readScenarioId(req),
    },
    respond: (snapshot: Awaited<ReturnType<typeof getSessionStore>>) => {
      const response = NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
      if (!verifiedId) {
        response.cookies.set({
          name: SESSION_COOKIE,
          value: id,
          httpOnly: true,
          secure: req.nextUrl.protocol === 'https:',
          sameSite: 'strict',
          path: '/api/reviews',
        });
      }
      return response;
    },
  };
}

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
    const session = reviewSession(req);
    return session.respond(await applySessionStoreMutation(body, method, session.options));
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
    const session = reviewSession(req);
    return session.respond(await getSessionStore(session.options));
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
    const session = reviewSession(req);
    return session.respond(await resetSessionStore(session.options));
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

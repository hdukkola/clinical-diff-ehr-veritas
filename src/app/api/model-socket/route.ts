import { NextRequest } from 'next/server';
import { probeModelSocket, type SocketStatus } from '@/lib/ai-socket';

const DEFAULT_HEARTBEAT_MS = 10000;

function parseHeartbeatMs(): number {
  const raw = process.env.CLINICAL_DIFF_SOCKET_HEARTBEAT_MS?.trim();
  if (!raw) return DEFAULT_HEARTBEAT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_HEARTBEAT_MS;
  return Math.min(30000, Math.max(1000, Math.trunc(parsed)));
}

function statusSignature(status: SocketStatus): string {
  return JSON.stringify([
    status.state,
    status.status,
    status.provider,
    status.configured,
    status.reachable,
    status.mode,
    status.simulated,
    status.live_ai,
    status.model,
    status.adapter,
    status.model_loaded,
    status.error ?? null,
  ]);
}

export async function GET(req: NextRequest) {
  if (process.env.CLINICAL_DIFF_DISABLE_SOCKET_STREAM === '1') {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  const encoder = new TextEncoder();
  const heartbeatMs = parseHeartbeatMs();

  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let eventSeq = 0;
  let lastSig = '';
  let probing = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
        try {
          controller.close();
        } catch {
          // Stream may already be closed when client disconnects.
        }
      };

      const sendChunk = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };

      const emitStatus = (status: SocketStatus) => {
        eventSeq += 1;
        lastSig = statusSignature(status);
        sendChunk(
          `event: socket-status\nid: ${eventSeq}\ndata: ${JSON.stringify(status)}\n\n`,
        );
      };

      const probeAndEmit = async (forceEmit: boolean) => {
        if (closed || probing) return;
        probing = true;
        try {
          const status = await probeModelSocket(req.signal);
          if (closed) return;
          const sig = statusSignature(status);
          if (forceEmit || sig !== lastSig) {
            emitStatus(status);
          } else {
            sendChunk(`: heartbeat ${status.checked_at}\n\n`);
          }
        } catch {
          if (!closed) {
            sendChunk(`: heartbeat ${new Date().toISOString()}\n\n`);
          }
        } finally {
          probing = false;
        }
      };

      if (req.signal.aborted) {
        cleanup();
        return;
      }

      req.signal.addEventListener('abort', cleanup, { once: true });

      void probeAndEmit(true);
      timer = setInterval(() => {
        if (req.signal.aborted) {
          cleanup();
          return;
        }
        void probeAndEmit(false);
      }, heartbeatMs);
    },
    cancel() {
      closed = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

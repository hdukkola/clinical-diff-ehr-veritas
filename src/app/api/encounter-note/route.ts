import {
  EncounterInferenceError,
  selectEncounterTurns,
} from '@/lib/encounter-inference';

const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  // This workflow only accepts the app's built-in fictional encounter.
  const reader = request.body?.getReader();
  if (reader) {
    let chunk = await reader.read().catch(() => null);
    while (chunk && !chunk.done && chunk.value.byteLength === 0) {
      chunk = await reader.read().catch(() => null);
    }
    if (!chunk?.done) {
      void reader.cancel().catch(() => {});
      return Response.json({ status: 'invalid-request' }, { status: 400, headers });
    }
  }
  try {
    return Response.json(await selectEncounterTurns(request.signal), { headers });
  } catch (error) {
    const outcome = error instanceof EncounterInferenceError ? error.status : 'provider-error';
    const codes = { unavailable: 503, timeout: 504, 'provider-error': 502, busy: 429 };
    return Response.json({ status: outcome }, { status: codes[outcome], headers });
  }
}

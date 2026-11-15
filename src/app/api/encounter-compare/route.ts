import { compareBundledNotes, EncounterInferenceError, isEmptyEncounterRequest } from '@/lib/encounter-inference';

const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  if (!(await isEmptyEncounterRequest(request))) {
    return Response.json({ status: 'invalid-request' }, { status: 400, headers });
  }
  try {
    return Response.json(await compareBundledNotes(request.signal), { headers });
  } catch (error) {
    const status = error instanceof EncounterInferenceError ? error.status : 'provider-error';
    const codes = { unavailable: 503, timeout: 504, 'provider-error': 502, busy: 429 };
    return Response.json({ status }, { status: codes[status], headers });
  }
}

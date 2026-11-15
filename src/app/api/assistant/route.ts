/** The remote trained-model service has not yet been identified or verified. */
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE === '0') return new Response(null, { status: 404 });
  const headers = { 'Cache-Control': 'no-store' };
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const decoder = new TextDecoder();
    let raw = '';
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256) {
        await reader.cancel();
        return Response.json({ error: 'Request is too large.' }, { status: 413, headers });
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    body = JSON.parse(raw + decoder.decode());
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400, headers });
  }
  if (
    !body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !['earlier', 'later'].includes((body as { note?: string }).note ?? '')
  ) {
    return Response.json({ error: 'Choose a synthetic demo note.' }, { status: 400, headers });
  }
  return Response.json(
    { error: 'The trained model is not connected to a verified hosted service yet.', status: 'unavailable' },
    { status: 503, headers },
  );
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAIService,
  groundMedicationMentions,
  joinOpenAiV1Endpoint,
  parseMedicationArrayFromModelOutput,
  probeModelSocket,
  resolveSocketConfig,
  SocketValidationError,
  validateCompareRequestBody,
  validateEndpointUrl,
} from './ai-socket';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ai-socket Colab Qwen 3.5 4B readiness & SSRF guards', () => {
  it('allows public HTTPS Colab tunnel URLs and blocks unsafe endpoints', () => {
    const valid = validateEndpointUrl('https://colab-qwen.trycloudflare.com/');
    expect(valid.toString()).toBe('https://colab-qwen.trycloudflare.com/');

    expect(() => validateEndpointUrl('http://colab-qwen.trycloudflare.com')).toThrow(
      SocketValidationError,
    );
    expect(() => validateEndpointUrl('http://192.168.1.50:8000')).toThrow(SocketValidationError);
    expect(() => validateEndpointUrl('https://user:pass@colab-qwen.trycloudflare.com')).toThrow(
      SocketValidationError,
    );
  });

  it('normalizes OpenAI v1 endpoint paths without duplicating /v1 or suffixes', () => {
    const bare = new URL('https://colab-qwen.trycloudflare.com');
    const withV1 = new URL('https://colab-qwen.trycloudflare.com/v1');
    const withFullChat = new URL('https://colab-qwen.trycloudflare.com/v1/chat/completions');

    expect(joinOpenAiV1Endpoint(bare, '/chat/completions')).toBe(
      'https://colab-qwen.trycloudflare.com/v1/chat/completions',
    );
    expect(joinOpenAiV1Endpoint(withV1, '/models')).toBe(
      'https://colab-qwen.trycloudflare.com/v1/models',
    );
    expect(joinOpenAiV1Endpoint(withFullChat, '/chat/completions')).toBe(
      'https://colab-qwen.trycloudflare.com/v1/chat/completions',
    );
  });

  it('resolves openai_compatible Colab config cleanly with Qwen/Qwen3.5-4B default', () => {
    const resolved = resolveSocketConfig({
      OPENAI_COMPATIBLE_BASE_URL: 'https://qwen-colab.trycloudflare.com',
      CLINICAL_DIFF_API_KEY: 'secret-token',
    });

    expect(resolved.provider).toBe('openai_compatible');
    expect(resolved.configured).toBe(true);
    expect(resolved.explicitModel).toBe(false);
    expect(resolved.model).toBe('Qwen/Qwen3.5-4B');
    expect(resolved.apiKey).toBe('secret-token');
  });

  it('parses Qwen think blocks, fenced JSON, and {name} objects safely', () => {
    const raw = `<think>Checking medications in note...</think>
Here is the JSON:
\`\`\`json
{"medications":[{"name":"Warfarin"},{"medication":"Aspirin"},"Metformin"]}
\`\`\``;
    expect(parseMedicationArrayFromModelOutput(raw)).toEqual(['Warfarin', 'Aspirin', 'Metformin']);
  });

  it('auto-discovers served model ID from /v1/models and grounds mentions against source notes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'Qwen/Qwen3.5-4B-Instruct' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/v1/chat/completions')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '<think>reasoning</think>\n{"medications":["Aspirin","HallucinatedDrug"]}',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = { OPENAI_COMPATIBLE_BASE_URL: 'https://colab-qwen.trycloudflare.com' };
    const status = await probeModelSocket(undefined, env);
    expect(status.state).toBe('live');
    expect(status.live_ai).toBe(true);
    expect(status.model).toBe('Qwen/Qwen3.5-4B-Instruct');

    const service = createAIService(env);
    const result = await service.compareNotes(
      { source_id: 'note-1', text: 'Medications: Aspirin 81 mg daily' },
      { source_id: 'note-2', text: 'Medications: none' },
    );

    expect(result.live_ai).toBe(true);
    expect(result.model).toBe('Qwen/Qwen3.5-4B-Instruct');
    expect(result.earlier.mentions.map((m) => m.name)).toEqual(['Aspirin']);
    expect(result.unsupported_outputs.some((u) => u.text === 'HallucinatedDrug')).toBe(true);
  });

  it('enforces synthetic_only and distinct source_id bounds on /compare requests', () => {
    expect(() =>
      validateCompareRequestBody({
        synthetic_only: false,
        earlier_note: { source_id: 'a', text: 'Aspirin' },
        later_note: { source_id: 'b', text: 'Aspirin' },
      }),
    ).toThrow(SocketValidationError);

    const grounded = groundMedicationMentions(['Aspirin', 'Aspirin'], 'src-1', 'Take Aspirin 81 mg.');
    expect(grounded.mentions).toHaveLength(1);
    expect(grounded.mentions[0].name).toBe('Aspirin');
  });
});

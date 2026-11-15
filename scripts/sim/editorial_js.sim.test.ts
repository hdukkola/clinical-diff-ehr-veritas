import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { SeededRng } from './prng';

const NOTE_EXTRACTION_PATH = path.resolve(
  process.cwd(),
  'veritas-editorial/note-extraction.js',
);
const NOTE_EXTRACTION_SRC = fs.readFileSync(NOTE_EXTRACTION_PATH, 'utf8');

type NoteExtractionApi = {
  createNoteWorkspace: (opts: {
    onService: (mode: string) => void;
    onComparison: (mode: string, diffCount: number) => void;
  }) => HTMLElement;
  stripInvisible: (text: string) => string;
  hasVisibleText: (text: string) => boolean;
  normalizeName: (name: string) => string;
  normalizeSourceId: (sourceId: string) => string;
  isValidHealth: (next: unknown) => boolean;
  hasValidMode: (data: unknown) => boolean;
  hasValidWordBoundary: (chars: string[], start: number, end: number) => boolean;
  extractionQuote: (
    evidence: { source_id: string; name: string; start: number; end: number },
    source: { source_id: string; text: string },
  ) => HTMLElement;
  renderExtractionResult: (
    result: HTMLElement,
    data: unknown,
    payload: unknown,
  ) => number;
};

type FetchMock = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

function loadEditorialApi(mockFetch?: FetchMock): NoteExtractionApi {
  const ctx = vm.createContext({
    document,
    window,
    fetch: mockFetch ?? (async () => ({ ok: false, status: 503, json: async () => null })),
    AbortSignal,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(
    `${NOTE_EXTRACTION_SRC}
;globalThis.__veritasEditorialApi = {
  createNoteWorkspace,
  stripInvisible,
  hasVisibleText,
  normalizeName,
  normalizeSourceId,
  isValidHealth,
  hasValidMode,
  hasValidWordBoundary,
  extractionQuote,
  renderExtractionResult
};`,
    ctx,
  );
  return (ctx as { __veritasEditorialApi: NoteExtractionApi }).__veritasEditorialApi;
}

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '"><iframe src="javascript:alert(1)"></iframe>',
  "<a href='javascript:alert(1)' onclick='alert(2)'>click</a>",
  '<details open ontoggle=alert(1)>',
] as const;

const ASTRAL_PREFIXES = ['💊', '🧬', '🩺', '🩸', '🧪'] as const;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Editorial JS (veritas-editorial/note-extraction.js) Simulation (500 cases)', () => {
  const api = loadEditorialApi();

  // ---------------------------------------------------------------------------
  // Group 1: 150 cases — Frontend XSS escaping in renderExtractionResult & extractionQuote
  // ---------------------------------------------------------------------------
  const xssCases = Array.from({ length: 150 }, (_, i) => ({ caseId: i + 1 }));

  it.each(xssCases)('editorial-xss-escaping #$caseId', ({ caseId }) => {
    const rng = new SeededRng(90000 + caseId);
    const xss = rng.pick(XSS_PAYLOADS);
    const drugA = caseId % 3 === 0 ? 'Aspirin' : 'Lisinopril';
    const drugB = caseId % 2 === 0 ? 'Atorvastatin' : 'Metformin';
    const earlierText = `Note ${xss} lists ${drugA} daily. ${xss}`;
    const laterText = `Discharge ${xss} lists ${drugB} daily.`;

    const startA = Array.from(earlierText.slice(0, earlierText.indexOf(drugA))).length;
    const endA = startA + Array.from(drugA).length;
    const startB = Array.from(laterText.slice(0, laterText.indexOf(drugB))).length;
    const endB = startB + Array.from(drugB).length;

    const evA = { source_id: `src-e-${xss}`, name: drugA, start: startA, end: endA };
    const evB = { source_id: `src-l-${xss}`, name: drugB, start: startB, end: endB };

    const payload = {
      synthetic_only: true,
      earlier: { source_id: evA.source_id, text: earlierText },
      later: { source_id: evB.source_id, text: laterText },
    };
    const data = {
      mode: 'deterministic_replay',
      simulated: true,
      live_ai: false,
      earlier: {
        source_id: evA.source_id,
        mentions: [evA],
        unsupported_outputs: [xss],
      },
      later: {
        source_id: evB.source_id,
        mentions: [evB],
        unsupported_outputs: [`bad-${xss}`],
      },
      differences: [
        { kind: 'earlier_only', name: drugA, evidence: [evA] },
        { kind: 'later_only', name: drugB, evidence: [evB] },
      ],
    };

    const resultEl = document.createElement('section');
    const count = api.renderExtractionResult(resultEl, data, payload);
    expect(count).toBe(2);
    expect(resultEl.hidden).toBe(false);
    // No unsafe elements injected
    expect(resultEl.querySelectorAll('script, img, svg, iframe, a, details[ontoggle]').length).toBe(0);
    // All <mark> tags contain only literal drug names
    const marks = [...resultEl.querySelectorAll('mark')].map(m => m.textContent);
    expect(marks.every(m => m === drugA || m === drugB)).toBe(true);
    // Unsupported outputs appear safely as escaped text
    expect(resultEl.textContent).toContain(xss);
  });

  // ---------------------------------------------------------------------------
  // Group 2: 150 cases — Astral code-point offsets & word boundary validation
  // ---------------------------------------------------------------------------
  const astralCases = Array.from({ length: 150 }, (_, i) => ({ caseId: i + 1 }));

  it.each(astralCases)('editorial-astral-offsets-and-boundaries #$caseId', ({ caseId }) => {
    const rng = new SeededRng(91000 + caseId);
    const mode = caseId % 5;
    const prefixCount = rng.int(1, 15);
    const astralPrefix = Array.from({ length: prefixCount }, () => rng.pick(ASTRAL_PREFIXES)).join('');

    if (mode === 0 || mode === 1) {
      // Valid astral code-point offsets + optional concatenated dose
      const suffix = mode === 1 ? '81mg daily.' : ' 81 mg daily.';
      const drug = 'Aspirin';
      const text = `${astralPrefix} Rx: ${drug}${suffix}`;
      const prefixChars = Array.from(`${astralPrefix} Rx: `);
      const start = prefixChars.length;
      const end = start + Array.from(drug).length;
      // UTF-16 index would differ from code-point index because astral emojis have length 2 in UTF-16
      expect(text.indexOf(drug)).toBeGreaterThan(start);

      const quote = api.extractionQuote(
        { source_id: 'astral-1', name: drug, start, end },
        { source_id: 'astral-1', text },
      );
      expect(quote.querySelector('mark')?.textContent).toBe(drug);
    } else if (mode === 2) {
      // Passing UTF-16 offset instead of code-point offset must fail when astral chars precede match
      const drug = 'Aspirin';
      const text = `${astralPrefix} ${drug}.`;
      const utf16Start = text.indexOf(drug);
      const utf16End = utf16Start + drug.length;
      expect(() =>
        api.extractionQuote(
          { source_id: 'astral-bad', name: drug, start: utf16Start, end: utf16End },
          { source_id: 'astral-bad', text },
        ),
      ).toThrow();
    } else if (mode === 3) {
      // Invalid span bounds / negative / reversed / out-of-range / source_id mismatch
      const text = `${astralPrefix} Aspirin.`;
      const badEv = rng.pick([
        { source_id: 's1', name: 'Aspirin', start: -1, end: 5 },
        { source_id: 's1', name: 'Aspirin', start: 5, end: 5 },
        { source_id: 's1', name: 'Aspirin', start: 10, end: 5 },
        { source_id: 's1', name: 'Aspirin', start: 0, end: 999 },
        { source_id: 's1', name: 'Aspirin', start: 1.5, end: 5 },
        { source_id: 'other', name: 'Aspirin', start: prefixCount + 1, end: prefixCount + 8 },
      ]);
      expect(() => api.extractionQuote(badEv, { source_id: 's1', text })).toThrow();
    } else {
      // Invalid word boundaries must be rejected
      const [text, name] = rng.pick([
        [`${astralPrefix} non-Heparin`, 'Heparin'],
        [`${astralPrefix} pseudo_Metformin`, 'Metformin'],
        [`${astralPrefix} Warfarin\u0301 50 mg`, 'Warfarin'],
        [`${astralPrefix} Aspirin2`, 'Aspirin'],
        [`${astralPrefix} Vitamin B12`, 'B1'],
      ]);
      const chars = Array.from(text);
      const idx = text.indexOf(name);
      const cpStart = Array.from(text.slice(0, idx)).length;
      const cpEnd = cpStart + Array.from(name).length;
      expect(api.hasValidWordBoundary(chars, cpStart, cpEnd)).toBe(false);
      expect(() =>
        api.extractionQuote(
          { source_id: 'b1', name, start: cpStart, end: cpEnd },
          { source_id: 'b1', text },
        ),
      ).toThrow();
    }
  });

  // ---------------------------------------------------------------------------
  // Group 3: 100 cases — /health validation & NFC/Turkish/Cf normalization
  // ---------------------------------------------------------------------------
  const healthNormCases = Array.from({ length: 100 }, (_, i) => ({ caseId: i + 1 }));

  it.each(healthNormCases)('editorial-health-and-normalization #$caseId', ({ caseId }) => {
    const mode = caseId % 5;
    if (mode === 0) {
      // Valid replay health (including 12,000 astral code points = 24,000 UTF-16 units)
      const ok = api.isValidHealth({
        status: 'ready',
        mode: 'deterministic_replay',
        simulated: true,
        live_ai: false,
        fixture: {
          synthetic_only: true,
          earlier: { source_id: 'fixture-earlier', text: 'Aspirin ' + '💊'.repeat(11990) },
          later: { source_id: 'fixture-later', text: 'Atorvastatin' },
        },
      });
      expect(ok).toBe(true);
    } else if (mode === 1) {
      // Invalid replay health: > 12000 code points, or source_id collision via Cf/NFC, or synthetic_only !== true
      const badPayloads = [
        {
          status: 'ready',
          mode: 'deterministic_replay',
          simulated: true,
          live_ai: false,
          fixture: {
            synthetic_only: 'true',
            earlier: { source_id: 'a', text: 'Aspirin' },
            later: { source_id: 'b', text: 'Atorvastatin' },
          },
        },
        {
          status: 'ready',
          mode: 'deterministic_replay',
          simulated: true,
          live_ai: false,
          fixture: {
            synthetic_only: true,
            earlier: { source_id: 'note-0', text: 'Aspirin' },
            later: { source_id: '\u200b note-0 \ufeff', text: 'Atorvastatin' },
          },
        },
        {
          status: 'ready',
          mode: 'deterministic_replay',
          simulated: true,
          live_ai: false,
          fixture: {
            synthetic_only: true,
            earlier: { source_id: 'Cafe\u0301', text: 'Aspirin' },
            later: { source_id: 'Caf\u00e9', text: 'Atorvastatin' },
          },
        },
        {
          status: 'ready',
          mode: 'deterministic_replay',
          simulated: true,
          live_ai: false,
          fixture: {
            synthetic_only: true,
            earlier: { source_id: 'a', text: '💊'.repeat(12001) },
            later: { source_id: 'b', text: 'Atorvastatin' },
          },
        },
        {
          status: 'ready',
          mode: 'deterministic_replay',
          simulated: true,
          live_ai: false,
          fixture: {
            synthetic_only: true,
            earlier: { source_id: 'a', text: '\u200b\ufeff\u200d' },
            later: { source_id: 'b', text: 'Atorvastatin' },
          },
        },
      ];
      expect(api.isValidHealth(badPayloads[caseId % badPayloads.length])).toBe(false);
    } else if (mode === 2) {
      // Live health validation and hasValidMode mismatch checks
      expect(
        api.isValidHealth({
          status: 'ready',
          mode: 'local_mlx',
          simulated: false,
          live_ai: true,
        }),
      ).toBe(true);
      expect(
        api.hasValidMode({
          mode: 'local_mlx',
          simulated: true,
          live_ai: false,
        }),
      ).toBe(false);
      expect(
        api.hasValidMode({
          mode: 'deterministic_replay',
          simulated: true,
          live_ai: true,
        }),
      ).toBe(false);
    } else if (mode === 3) {
      // NFC / Turkish İ / ı / multi-whitespace / Cf stripping in normalizeName
      expect(api.normalizeName(' \ufeffCafe\u0301ine\u200b ')).toBe('caf\u00e9ine');
      expect(api.normalizeName('Aspir\u0130n  81\n\tmg')).toBe('aspirin 81 mg');
      expect(api.normalizeName('Aspir\u0131n')).toBe('aspirin');
      expect(api.hasVisibleText('\u200b\u200c\u200d\ufeff \t\n')).toBe(false);
    } else {
      // Source ID normalization and 100-code-point cap in health fixture
      expect(api.normalizeSourceId('\u200b Cafe\u0301 \ufeff')).toBe('Caf\u00e9');
      expect(
        api.isValidHealth({
          status: 'ready',
          mode: 'deterministic_replay',
          simulated: true,
          live_ai: false,
          fixture: {
            synthetic_only: true,
            earlier: { source_id: '💊'.repeat(101), text: 'Aspirin' },
            later: { source_id: 'b', text: 'Atorvastatin' },
          },
        }),
      ).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Group 4: 100 cases — createNoteWorkspace interactive DOM workflow
  // ---------------------------------------------------------------------------
  const workspaceCases = Array.from({ length: 100 }, (_, i) => ({ caseId: i + 1 }));

  it.each(workspaceCases)('editorial-workspace-workflow #$caseId', async ({ caseId }) => {
    const isReplay = caseId % 2 === 0;
    const fixture = {
      synthetic_only: true,
      earlier: { source_id: 'fixture-earlier', text: 'Note lists Aspirin.' },
      later: { source_id: 'fixture-later', text: 'Note lists Atorvastatin.' },
    };

    const mockFetch: FetchMock = async (url, init) => {
      if (url === '/health') {
        if (caseId % 10 === 9) {
          return { ok: false, status: 503, json: async () => ({ error: 'Service down' }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () =>
            isReplay
              ? {
                  status: 'ready',
                  mode: 'deterministic_replay',
                  simulated: true,
                  live_ai: false,
                  fixture,
                }
              : {
                  status: 'ready',
                  mode: 'local_mlx',
                  simulated: false,
                  live_ai: true,
                },
        };
      }
      if (url === '/compare') {
        const body = JSON.parse(String(init?.body ?? '{}')) as typeof fixture;
        if (caseId % 10 === 7) {
          // Mode mismatch response
          return {
            ok: true,
            status: 200,
            json: async () => ({
              mode: isReplay ? 'local_mlx' : 'deterministic_replay',
              simulated: !isReplay,
              live_ai: isReplay,
              earlier: { source_id: body.earlier.source_id, mentions: [], unsupported_outputs: [] },
              later: { source_id: body.later.source_id, mentions: [], unsupported_outputs: [] },
              differences: [],
            }),
          };
        }
        const eName = isReplay ? 'Aspirin' : 'Lisinopril';
        const lName = isReplay ? 'Atorvastatin' : 'Atorvastatin';
        const eStart = Array.from(body.earlier.text.slice(0, body.earlier.text.indexOf(eName))).length;
        const lStart = Array.from(body.later.text.slice(0, body.later.text.indexOf(lName))).length;
        const eEv = {
          source_id: body.earlier.source_id,
          name: eName,
          start: eStart,
          end: eStart + eName.length,
        };
        const lEv = {
          source_id: body.later.source_id,
          name: lName,
          start: lStart,
          end: lStart + lName.length,
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            mode: isReplay ? 'deterministic_replay' : 'local_mlx',
            simulated: isReplay,
            live_ai: !isReplay,
            earlier: { source_id: body.earlier.source_id, mentions: [eEv], unsupported_outputs: [] },
            later: { source_id: body.later.source_id, mentions: [lEv], unsupported_outputs: [] },
            differences: [
              { kind: 'earlier_only', name: eName, evidence: [eEv] },
              { kind: 'later_only', name: lName, evidence: [lEv] },
            ],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
    };

    const localApi = loadEditorialApi(mockFetch);
    const serviceEvents: string[] = [];
    const compEvents: Array<[string, number]> = [];
    const ws = localApi.createNoteWorkspace({
      onService: mode => serviceEvents.push(mode),
      onComparison: (mode, count) => compEvents.push([mode, count]),
    });
    document.body.appendChild(ws);

    // Wait for initial checkService microtask queue
    await new Promise(resolve => setTimeout(resolve, 0));

    if (caseId % 10 === 9) {
      expect(serviceEvents).toEqual(['unavailable']);
      expect(ws.querySelector('#extraction-error')?.textContent).toContain('Service down');
      return;
    }

    expect(serviceEvents).toEqual([isReplay ? 'deterministic_replay' : 'local_mlx']);

    const earlierArea = ws.querySelector('#earlier-note') as HTMLTextAreaElement;
    const laterArea = ws.querySelector('#later-note') as HTMLTextAreaElement;
    const form = ws.querySelector('#extraction-form') as HTMLFormElement;
    const errorEl = ws.querySelector('#extraction-error') as HTMLElement;
    const resultEl = ws.querySelector('#extraction-result') as HTMLElement;

    if (!isReplay && caseId % 10 === 5) {
      // Clear notes then verify invisible-only input is blocked
      const resetBtn = ws.querySelector('#extraction-reset') as HTMLButtonElement;
      resetBtn.click();
      expect(earlierArea.value).toBe('');
      earlierArea.value = '\u200b\ufeff';
      laterArea.value = 'Valid note';
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      expect(errorEl.textContent).toContain('1 and 12,000');
      return;
    }

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    if (caseId % 10 === 7) {
      expect(errorEl.textContent).toContain('service mode changed');
      expect(resultEl.hidden).toBe(true);
    } else {
      expect(compEvents).toEqual([[isReplay ? 'deterministic_replay' : 'local_mlx', 2]]);
      expect(resultEl.hidden).toBe(false);
      expect(resultEl.querySelectorAll('mark').length).toBeGreaterThanOrEqual(2);
    }
  });
});

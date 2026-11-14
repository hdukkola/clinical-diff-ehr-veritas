import type { ExtractedMedication, ExtractionMode, ExtractionResult, Statement } from './types';
import { classifyStatement } from './proposals';

/**
 * Deterministic encounter-note parser for the demonstration.
 *
 * This is NOT live AI. It is a rule-based parser over fictional note text that
 * extracts only explicitly stated values. It never guesses a dose, route,
 * frequency, or time; anything not literally present is null. The UI must label
 * this as simulated and must not present it as a clinical extraction.
 */

export const SIMULATED_DISCLAIMER =
  'Simulated deterministic parse of fictional text — not live AI inference. Values are only those explicitly written; nothing is inferred.';

const ROUTES = ['oral', 'by mouth', 'po', 'intravenous', 'iv', 'subcutaneous', 'im', 'topical', 'inhaled'] as const;
const FREQ_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bonce daily\b|\bdaily\b|\bq24h\b|\bevery 24 hours\b/i, label: 'daily' },
  { re: /\btwice daily\b|\bbid\b|\btwo times a day\b|\bevery 12 hours\b|\bq12h\b/i, label: 'twice daily' },
  { re: /\bthree times daily\b|\btid\b|\bthree times a day\b|\bevery 8 hours\b|\bq8h\b/i, label: 'three times daily' },
  { re: /\bfour times daily\b|\bqid\b|\bfour times a day\b/i, label: 'four times daily' },
  { re: /\bnightly\b|\bat bedtime\b|\bhs\b/i, label: 'nightly' },
  { re: /\bweekly\b/i, label: 'weekly' },
  { re: /\bas needed\b|\bprn\b/i, label: 'as needed' },
];
const DOSE_RE = /\b(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|ml|units?|iu|meq|mmol)\b/i;

// A tiny fictional formulary used only to recognize medication names in the
// demonstration text. It is not a clinical database and makes no identity claim.
const KNOWN_MEDS = [
  'lisinopril', 'metformin', 'atorvastatin', 'aspirin', 'amlodipine', 'losartan',
  'metoprolol', 'omeprazole', 'albuterol', 'insulin', 'warfarin', 'apixaban',
  'sertraline', 'gabapentin', 'levothyroxine', 'simvastatin', 'hydrochlorothiazide',
];

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

function findDose(text: string): string | null {
  const m = text.match(DOSE_RE);
  return m ? `${m[1]} ${m[2]}` : null;
}
function findRoute(text: string): string | null {
  const lower = text.toLowerCase();
  for (const r of ROUTES) if (lower.includes(r)) return r;
  return null;
}
function findFrequency(text: string): string | null {
  for (const f of FREQ_PATTERNS) if (f.re.test(text)) return f.label;
  return null;
}

function knownMedIn(text: string): string | null {
  const lower = text.toLowerCase();
  for (const med of KNOWN_MEDS) {
    if (new RegExp(`\\b${med}\\b`, 'i').test(lower)) return titleCase(med);
  }
  return null;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Split an encounter note into classified statements with literal evidence spans. */
export function parseStatements(note: string): Statement[] {
  const statements: Statement[] = [];
  const sentences = note.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  let cursor = 0;
  for (const sentence of sentences) {
    const start = note.indexOf(sentence, cursor);
    cursor = start + sentence.length;
    const patientReported = /\b(patient (reports|says|states|denies)|reports|states that|denies|took|takes|has been taking)\b/i.test(sentence);
    const { kind, authority } = classifyStatement(sentence, { patientReported });
    const medName = knownMedIn(sentence);
    statements.push({
      id: `stmt-${statements.length}`,
      text: sentence,
      kind,
      authority,
      evidence: { start, end: start + sentence.length },
      medicationName: medName,
      sourceRef: 'encounter-note',
    });
  }
  return statements;
}

/**
 * Extract explicitly stated medication facts from a note. Returns simulated mode
 * with per-field values only where the text states them.
 */
export function extractFromNote(note: string, mode: ExtractionMode = 'simulated'): ExtractionResult {
  const statements = parseStatements(note);
  const byMed = new Map<string, ExtractedMedication>();
  const unresolved: string[] = [];

  for (const st of statements) {
    if (!st.medicationName) {
      if (st.kind === 'uncertain') unresolved.push(st.text);
      continue;
    }
    const dose = findDose(st.text);
    const route = findRoute(st.text);
    const frequency = findFrequency(st.text);
    const existing = byMed.get(st.medicationName);
    if (!existing) {
      byMed.set(st.medicationName, {
        id: `ex-${byMed.size}`,
        name: st.medicationName,
        dose,
        route,
        frequency,
        status: 'unknown',
        evidence: st.evidence,
      });
    } else {
      // Merge explicitly stated fields; never overwrite a known value with null.
      existing.dose = existing.dose ?? dose;
      existing.route = existing.route ?? route;
      existing.frequency = existing.frequency ?? frequency;
    }
    if (st.kind === 'uncertain') unresolved.push(st.text);
  }

  return {
    mode,
    medications: [...byMed.values()],
    unresolved,
    disclaimer: mode === 'live_ai' ? 'Live AI extraction; review every value against the source.' : SIMULATED_DISCLAIMER,
  };
}
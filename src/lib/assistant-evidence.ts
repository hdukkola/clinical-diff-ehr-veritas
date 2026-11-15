type AssistantNote = { label: string; text: string; medications: readonly string[] };

const unavailableNote: AssistantNote = { label: '', text: '', medications: [] };

export const SYNTHETIC_ASSISTANT_NOTES: Record<'earlier' | 'later', AssistantNote> =
  process.env.NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE === '0' ? {
    earlier: unavailableNote,
    later: unavailableNote,
  } : {
  earlier: {
    label: 'Demo earlier note',
    text: 'Sample outpatient medication list. The note explicitly lists Lisinopril 10 mg daily, Metformin 500 mg twice daily, and Aspirin 81 mg daily.',
    medications: ['Lisinopril', 'Metformin', 'Aspirin'],
  },
  later: {
    label: 'Demo discharge note',
    text: 'Sample discharge medication list. The note explicitly lists Lisinopril 20 mg daily, Metformin 500 mg twice daily, and Atorvastatin 20 mg nightly.',
    medications: ['Lisinopril', 'Metformin', 'Atorvastatin'],
  },
  };

export type SyntheticAssistantNote = keyof typeof SYNTHETIC_ASSISTANT_NOTES;

type MedicationEvidence = { medication: string; excerpt: string };

export type SyntheticAssistantResult =
  | { status: 'abstained' }
  | { status: 'answered'; source: string; evidence: MedicationEvidence[] };

export function validateSyntheticAssistantResult(
  value: unknown,
  note: SyntheticAssistantNote,
): SyntheticAssistantResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (response.mode !== 'synthetic-test' || response.note !== note) return null;
  if (response.status === 'abstained' && response.evidence === undefined) {
    return { status: 'abstained' };
  }

  const sourceNote = SYNTHETIC_ASSISTANT_NOTES[note];
  if (
    response.status !== 'answered' ||
    !Array.isArray(response.evidence) ||
    response.evidence.length === 0 ||
    response.evidence.length > sourceNote.medications.length
  ) {
    return null;
  }

  const evidence: MedicationEvidence[] = [];
  const seen = new Set<string>();
  for (const item of response.evidence) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const { medication: reportedName, excerpt } = item as Record<string, unknown>;
    const medication = sourceNote.medications.find(name => name === reportedName);
    if (
      !medication || seen.has(medication) ||
      typeof excerpt !== 'string' || excerpt.length > sourceNote.text.length ||
      !sourceNote.text.includes(excerpt) || !new RegExp(`\\b${medication}\\b`).test(excerpt)
    ) {
      return null;
    }
    evidence.push({ medication, excerpt });
    seen.add(medication);
  }
  return { status: 'answered', source: sourceNote.label, evidence };
}

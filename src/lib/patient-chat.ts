import type { SyntheticScenario } from '@/lib/fixtures';
import type { Medication } from '@/lib/types';

export type ChartAspect = 'timeline' | 'earlier' | 'later' | 'encounters';
export type CorrectableField = 'dose' | 'route' | 'frequency';
export type ChartCorrection = {
  scenarioId: string;
  snapshotId: string;
  medicationId: string;
  field: CorrectableField;
  before: string;
  value: string;
  source: string;
};
export type ChartEvidence = {
  source: string;
  date: string | null;
  medication: Medication;
  corrections: ChartCorrection[];
};
export type ChartReply = {
  text: string;
  evidence?: ChartEvidence[];
  medication?: string;
  edit?: 'chart' | 'widget';
  draft?: { value: string; field?: CorrectableField; page?: string };
  clarify?: boolean;
  modelAssisted?: boolean;
};

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function chartCorrectionsFor(
  corrections: ChartCorrection[],
  scenarioId: string,
  snapshotId: string,
  medicationId: string,
) {
  return corrections.filter((item) => item.scenarioId === scenarioId &&
    item.snapshotId === snapshotId && item.medicationId === medicationId);
}

export function applyChartCorrections(medication: Medication, corrections: ChartCorrection[]): Medication {
  return corrections.reduce((current, correction) => ({
    ...current,
    [correction.field]: correction.value,
  }), medication);
}

export function chartReply(
  chart: SyntheticScenario,
  aspect: ChartAspect,
  question: string,
  corrections: ChartCorrection[],
  previousMedication?: string,
): ChartReply {
  const normalized = normalize(question);
  const names = [...new Set([...chart.earlier.medications, ...chart.later.medications].map((med) => med.name))];
  const matched = names.filter((name) => ` ${normalized} `.includes(` ${normalize(name)} `));
  const followUp = /^(?:and )?(?:(?:what about (?:its |the )?|what (?:is|was) (?:its|the) |the )?(?:dose|frequency|route|earlier|later|timing)|how much|how often)(?: please)?[.?]*$/i.test(question.trim());
  const selected = matched.length ? matched : followUp && previousMedication && names.includes(previousMedication)
    ? [previousMedication]
    : [];
  const medication = selected.length === 1 ? selected[0] : undefined;

  const widgetEdit = /^(?:set|edit) (?:the )?(.+?) (?:page note|widget note) to ["“]([^"”]+)["”][.!]?$/i.exec(question.trim());
  if (widgetEdit) {
    return {
      text: 'Review the destination page and the note before applying it.',
      edit: 'widget',
      draft: { page: widgetEdit[1], value: widgetEdit[2] },
    };
  }
  if (/\b(?:edit|update|correct|change|set|revise)\b/.test(normalized) &&
      /\b(?:widget|page note)\b/.test(normalized)) {
    return { text: 'Which page should this note appear on, and what should it say? You can review and edit it before approving.', edit: 'widget' };
  }
  const chartEdit = /^(?:correct|update) (?:the )?(?:chart|record):\s*(.+?)\s+(dose|route|frequency)\s+to\s+([^\n]{1,40})$/i.exec(question.trim());
  if (chartEdit && medication && normalize(chartEdit[1]) === normalize(medication)) {
    return {
      text: 'I filled in the requested correction. Confirm the record and add the source that documents it before reviewing.',
      medication,
      edit: 'chart',
      draft: { field: chartEdit[2].toLowerCase() as CorrectableField, value: chartEdit[3] },
    };
  }
  if (/\b(?:edit|correct|update|change|revise)\b/.test(normalized) &&
      /\b(?:record|chart|documented|transcription|typo)\b/.test(normalized)) {
    return { text: 'Which record and field should be corrected? Enter the value and the source that documents it for review.', medication, edit: 'chart' };
  }

  const snapshots = aspect === 'earlier' || aspect === 'later' ? [chart[aspect]] : [chart.earlier, chart.later];
  const evidence = snapshots.flatMap((snapshot) => snapshot.medications.flatMap((entry) => {
    const reviewed = chartCorrectionsFor(corrections, chart.id, snapshot.id, entry.id);
    return [{
      source: snapshot.source,
      date: snapshot.recordedAt,
      medication: applyChartCorrections(entry, reviewed),
      corrections: reviewed,
    }];
  }));
  const matchingEvidence = evidence.filter((entry) => selected.includes(entry.medication.name));

  const decision = /\b(?:safe|give|administer|prescrib\w*|restart|resume|hold|stop|start|take|increase|decrease|double|interact\w*|contraindicat\w*|recommend\w*|ok(?:ay)?)\b/.test(normalized) ||
    /\b(?:should|can|could|may) (?:i|we|they|he|she)\b/.test(normalized);
  if (decision) {
    return {
      text: `${medication ? `For ${medication}, can you confirm` : 'What exact medication are you considering? Can you confirm'} the intended dose, route and reason, the last dose, and the current orders and allergies? This chart does not establish whether to give, hold, or change a medication. Verify against the original orders with the treating clinician or pharmacist.`,
      evidence: aspect === 'encounters' ? undefined : matchingEvidence,
      medication,
    };
  }

  if (aspect === 'encounters') {
    if (/\b(?:encounters?|visits?|dates?|timeline|recorded|source|when|summar(?:y|ize))\b/.test(normalized)) {
      return { text: `This chart contains ${chart.earlier.source} (${chart.earlier.recordedAt ?? 'undated'}) and ${chart.later.source} (${chart.later.recordedAt ?? 'undated'}). Which source would you like to review?` };
    }
    return { text: 'Which encounter or source would you like to review? Select a medication snapshot for documented doses and routes.', clarify: true };
  }

  if (/\b(?:medication (?:list|history)|all medications|list (?:the )?medications|medications (?:are )?(?:listed|documented)|what medications|compare (?:the )?(?:charts|records|medications|snapshots))\b/.test(normalized)) {
    return { text: 'These are the entries in the selected records. An entry alone does not establish what the patient is taking now.', evidence };
  }

  if (selected.length && (/\b(?:dose|dosage|route|frequency|listed|documented|record|chart|show|compare|what|where|when|how much|how often)\b/.test(normalized) ||
      selected.some((name) => normalize(name) === normalized))) {
    return {
      text: matchingEvidence.length
        ? 'Here is what the selected record says. Is this the date you want to review?'
        : 'That medication is absent from the selected record. Would you like to check the other snapshot? Its absence does not establish that it was stopped.',
      evidence: matchingEvidence,
      medication,
    };
  }

  return { clarify: true, text: 'Which medication and source should I check? I can show documented values in this patient’s earlier or later record. If you’re asking about giving a medication, please give the exact drug, dose, route and reason so the clinician can verify the source.' };
}

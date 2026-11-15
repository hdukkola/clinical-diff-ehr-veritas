import type { Snapshot } from './types';
import {
  hfDatasetSources,
  hfNoteComparisonPairs,
  hfScenarios,
  type HfDatasetSource,
  type HfFixtureProvenance,
  type HfLicense,
  type HfNotePair,
  type HfSyntheticScenario,
} from './hf-fixtures';

export {
  hfDatasetSources,
  hfNoteComparisonPairs,
  hfScenarios,
  type HfDatasetSource,
  type HfFixtureProvenance,
  type HfLicense,
  type HfNotePair,
  type HfSyntheticScenario,
};

/**
 * All records, patient identifiers, dates, and clinical sources in this module
 * are 100% synthetic demo fixtures. `null` indicates an undocumented field.
 */

export const earlier: Snapshot = {
  id: 's1',
  source: 'Fictional outpatient medication list',
  recordedAt: '2026-10-01',
  medications: [
    { id: 'm1', name: 'Lisinopril', dose: '10 mg', route: 'oral', frequency: 'daily' },
    { id: 'm2', name: 'Metformin', dose: '500 mg', route: 'oral', frequency: 'twice daily' },
    { id: 'm3', name: 'Aspirin', dose: '81 mg', route: 'oral', frequency: 'daily' },
  ],
};

export const later: Snapshot = {
  id: 's2',
  source: 'Fictional discharge medication list',
  recordedAt: '2026-10-15',
  medications: [
    { id: 'm1', name: 'Lisinopril', dose: '20 mg', route: 'oral', frequency: 'daily' },
    { id: 'm2', name: 'Metformin', dose: '500 mg', route: 'oral', frequency: null },
    { id: 'm4', name: 'Atorvastatin', dose: '20 mg', route: 'oral', frequency: 'daily' },
  ],
};

export type ScenarioCategory =
  | 'baseline-reconciliation'
  | 'polypharmacy-transition'
  | 'missing-documentation'
  | 'allergy-hold-restart'
  | 'unicode-whitespace-case'
  | 'conflicting-sources'
  | 'empty-no-change';

export type SyntheticScenario = {
  id: string;
  patientId: string;
  patientLabel: string;
  title: string;
  summary: string;
  category: ScenarioCategory;
  tags: string[];
  earlier: Snapshot;
  later: Snapshot;
  provenance?: HfFixtureProvenance;
};

const baseSyntheticScenarios: SyntheticScenario[] = [
  {
    id: 'scenario-morgan-lee-baseline',
    patientId: 'DEMO-001',
    patientLabel: 'Morgan Lee (Synthetic)',
    title: 'Outpatient intake to hospital discharge baseline',
    summary:
      'Baseline fictional reconciliation scenario with dose increase, undocumented discharge frequency, removal, and addition.',
    category: 'baseline-reconciliation',
    tags: ['baseline', 'discharge', 'missing-frequency'],
    earlier,
    later,
  },
  {
    id: 'scenario-polypharmacy-discharge-followup',
    patientId: 'SYN-002',
    patientLabel: 'Jordan Patel (Synthetic)',
    title: 'Polypharmacy hospital discharge to cardiology clinic follow-up',
    summary:
      'Multi-medication transition from inpatient discharge to outpatient follow-up with dose titration, regimen formulation update, discontinued prophylaxis, and added heart-failure therapy.',
    category: 'polypharmacy-transition',
    tags: ['polypharmacy', 'discharge-to-clinic', 'titration'],
    earlier: {
      id: 's-poly-1',
      source: 'Synthetic inpatient discharge medication summary',
      recordedAt: '2026-10-03',
      medications: [
        { id: 'poly-m1', name: 'Furosemide', dose: '40 mg', route: 'oral', frequency: 'twice daily' },
        { id: 'poly-m2', name: 'Carvedilol', dose: '6.25 mg', route: 'oral', frequency: 'twice daily' },
        { id: 'poly-m3', name: 'Rosuvastatin', dose: '20 mg', route: 'oral', frequency: 'daily' },
        {
          id: 'poly-m4',
          name: 'Levothyroxine',
          dose: '50 mcg',
          route: 'oral',
          frequency: 'daily before breakfast',
        },
        { id: 'poly-m5', name: 'Enoxaparin', dose: '40 mg', route: 'subcutaneous', frequency: 'daily' },
        {
          id: 'poly-m6',
          name: 'Albuterol Sulfate',
          dose: '90 mcg/actuation',
          route: 'inhalation',
          frequency: 'every 6 hours as needed',
        },
      ],
    },
    later: {
      id: 's-poly-2',
      source: 'Synthetic cardiology clinic follow-up medication list',
      recordedAt: '2026-10-17',
      medications: [
        { id: 'poly-m1', name: 'Furosemide', dose: '20 mg', route: 'oral', frequency: 'daily' },
        { id: 'poly-m2', name: 'Carvedilol', dose: '12.5 mg', route: 'oral', frequency: 'twice daily' },
        { id: 'poly-m3', name: 'Rosuvastatin', dose: '20 mg', route: 'oral', frequency: 'daily' },
        {
          id: 'poly-m4',
          name: 'Levothyroxine',
          dose: '50 mcg',
          route: 'oral',
          frequency: 'daily before breakfast',
        },
        {
          id: 'poly-m6',
          name: 'Albuterol Sulfate HFA',
          dose: '90 mcg/actuation',
          route: 'inhalation',
          frequency: 'every 4 hours as needed',
        },
        { id: 'poly-m7', name: 'Empagliflozin', dose: '10 mg', route: 'oral', frequency: 'daily' },
        { id: 'poly-m8', name: 'Potassium Chloride', dose: '20 mEq', route: 'oral', frequency: 'daily' },
      ],
    },
  },
  {
    id: 'scenario-missing-undocumented-fields',
    patientId: 'SYN-003',
    patientLabel: 'Avery Kim (Synthetic)',
    title: 'Missing dose, route, frequency, and undocumented snapshot provenance',
    summary:
      'Exercises null clinical attributes in both directions alongside an earlier snapshot with missing recordedAt date and unattributed provenance.',
    category: 'missing-documentation',
    tags: ['missing-fields', 'unknown-provenance', 'null-values'],
    earlier: {
      id: 's-miss-1',
      source: 'Synthetic unattributed intake list (provenance not documented)',
      recordedAt: null,
      medications: [
        { id: 'miss-m1', name: 'Gabapentin', dose: null, route: null, frequency: null },
        { id: 'miss-m2', name: 'Warfarin Sodium', dose: '5 mg', route: 'oral', frequency: null },
        { id: 'miss-m3', name: 'Omeprazole', dose: '20 mg', route: null, frequency: null },
        {
          id: 'miss-m4',
          name: 'Insulin Glargine',
          dose: '18 units',
          route: 'subcutaneous',
          frequency: 'at bedtime',
        },
      ],
    },
    later: {
      id: 's-miss-2',
      source: 'Synthetic ambulatory intake reconciliation (partial documentation)',
      recordedAt: '2026-10-19',
      medications: [
        { id: 'miss-m1', name: 'Gabapentin', dose: '300 mg', route: 'oral', frequency: 'at bedtime' },
        { id: 'miss-m2', name: 'Warfarin Sodium', dose: '5 mg', route: 'oral', frequency: null },
        { id: 'miss-m4', name: 'Insulin Glargine', dose: null, route: null, frequency: null },
        { id: 'miss-m5', name: 'Magnesium Oxide', dose: null, route: null, frequency: null },
      ],
    },
  },
  {
    id: 'scenario-allergy-hold-restart',
    patientId: 'SYN-004',
    patientLabel: 'Riley Chen (Synthetic)',
    title: 'Allergy stop, perioperative hold, and dose-adjusted restart',
    summary:
      'Models discontinued medications following synthetic allergy and contraindication flags, a perioperative hold, a dose-reduced restart, and replacement therapy.',
    category: 'allergy-hold-restart',
    tags: ['allergy', 'contraindication', 'held-medication', 'restarted'],
    earlier: {
      id: 's-hold-1',
      source: 'Synthetic pre-operative medication list (allergy alert noted)',
      recordedAt: '2026-09-20',
      medications: [
        {
          id: 'hold-m1',
          name: 'Amoxicillin-Clavulanate',
          dose: '875-125 mg',
          route: 'oral',
          frequency: 'twice daily',
        },
        { id: 'hold-m2', name: 'Metformin ER', dose: '1000 mg', route: 'oral', frequency: 'daily' },
        { id: 'hold-m3', name: 'Apixaban', dose: '5 mg', route: 'oral', frequency: 'twice daily' },
        {
          id: 'hold-m4',
          name: 'Ibuprofen',
          dose: '400 mg',
          route: 'oral',
          frequency: 'every 6 hours as needed',
        },
      ],
    },
    later: {
      id: 's-hold-2',
      source: 'Synthetic post-operative discharge restart list',
      recordedAt: '2026-10-08',
      medications: [
        { id: 'hold-m3', name: 'Apixaban', dose: '2.5 mg', route: 'oral', frequency: 'twice daily' },
        {
          id: 'hold-m5',
          name: 'Acetaminophen',
          dose: '500 mg',
          route: 'oral',
          frequency: 'every 6 hours as needed',
        },
        { id: 'hold-m6', name: 'Doxycycline', dose: '100 mg', route: 'oral', frequency: 'twice daily' },
      ],
    },
  },
  {
    id: 'scenario-unicode-whitespace-case',
    patientId: 'SYN-005',
    patientLabel: 'Renée Álvarez-O’Connor (Synthetic)',
    title: 'Unicode symbols, special characters, whitespace, and casing differences',
    summary:
      'Tests exact-match diff sensitivity across Unicode subscripts/superscripts, microgram glyphs, en-dashes, repeated spaces, and capitalization.',
    category: 'unicode-whitespace-case',
    tags: ['unicode', 'whitespace', 'case-sensitivity', 'punctuation'],
    earlier: {
      id: 's-uni-1',
      source: 'Synthetic legacy EHR export — UTF-8 / mixed formatting',
      recordedAt: '2026-10-05',
      medications: [
        {
          id: 'uni-m1',
          name: 'Vitamin D₃ (Cholecalciferol)',
          dose: '50 µg',
          route: 'Oral',
          frequency: 'DAILY',
        },
        {
          id: 'uni-m2',
          name: 'Ferrous Sulfate (Fe²⁺)',
          dose: '325  mg',
          route: 'oral',
          frequency: '1–2 tablets daily',
        },
        {
          id: 'uni-m3',
          name: 'acetaminophen',
          dose: '500 mg',
          route: 'oral',
          frequency: 'every 6 hours as needed',
        },
        {
          id: 'uni-m4',
          name: 'ω-3 Acid Ethyl Esters',
          dose: '1000 mg',
          route: 'oral',
          frequency: 'twice daily',
        },
      ],
    },
    later: {
      id: 's-uni-2',
      source: 'Synthetic normalized pharmacy e-prescribing record',
      recordedAt: '2026-10-16',
      medications: [
        {
          id: 'uni-m1',
          name: 'Vitamin D3 (Cholecalciferol)',
          dose: '50 mcg',
          route: 'oral',
          frequency: 'daily',
        },
        {
          id: 'uni-m2',
          name: 'Ferrous Sulfate (Fe²⁺)',
          dose: '325 mg',
          route: 'oral',
          frequency: '1-2 tablets daily',
        },
        {
          id: 'uni-m3',
          name: 'Acetaminophen',
          dose: '500 mg',
          route: 'oral',
          frequency: 'every 6 hours as needed',
        },
        {
          id: 'uni-m4',
          name: 'ω-3 Acid Ethyl Esters',
          dose: '1000 mg',
          route: 'oral',
          frequency: 'twice daily',
        },
      ],
    },
  },
  {
    id: 'scenario-conflicting-patient-vs-pharmacy',
    patientId: 'SYN-006',
    patientLabel: 'Devon Morales (Synthetic)',
    title: 'Conflicting sources: patient-reported intake vs. pharmacy fill history',
    summary:
      'Compares patient portal self-report against 90-day community pharmacy dispensing history showing dose/frequency discrepancies and OTC vs. Rx differences.',
    category: 'conflicting-sources',
    tags: ['conflicting-sources', 'patient-reported', 'pharmacy-fill'],
    earlier: {
      id: 's-conf-1',
      source: 'Synthetic patient-reported medication list (portal intake)',
      recordedAt: '2026-10-10',
      medications: [
        { id: 'conf-m1', name: 'Sertraline', dose: '50 mg', route: 'oral', frequency: 'daily' },
        {
          id: 'conf-m2',
          name: 'Albuterol Sulfate',
          dose: '90 mcg/actuation',
          route: 'inhalation',
          frequency: 'every 4 hours as needed',
        },
        {
          id: 'conf-m3',
          name: 'Diphenhydramine',
          dose: '25 mg',
          route: 'oral',
          frequency: 'at bedtime',
        },
      ],
    },
    later: {
      id: 's-conf-2',
      source: 'Synthetic community pharmacy fill history (90-day claims)',
      recordedAt: '2026-10-12',
      medications: [
        { id: 'conf-m1', name: 'Sertraline', dose: '100 mg', route: 'oral', frequency: 'daily' },
        {
          id: 'conf-m2',
          name: 'Albuterol Sulfate',
          dose: '90 mcg/actuation',
          route: 'inhalation',
          frequency: 'every 6 hours as needed',
        },
        { id: 'conf-m4', name: 'Trazodone', dose: '50 mg', route: 'oral', frequency: 'at bedtime' },
      ],
    },
  },
  {
    id: 'scenario-conflicting-pharmacy-vs-discharge',
    patientId: 'SYN-006',
    patientLabel: 'Devon Morales (Synthetic)',
    title: 'Conflicting sources: pharmacy fill history vs. hospital discharge summary',
    summary:
      'Compares community pharmacy dispensing history against a subsequent hospital discharge summary with conflicting dose and omitted sleep aid.',
    category: 'conflicting-sources',
    tags: ['conflicting-sources', 'pharmacy-fill', 'discharge-summary'],
    earlier: {
      id: 's-conf-3',
      source: 'Synthetic community pharmacy fill history (90-day claims)',
      recordedAt: '2026-10-12',
      medications: [
        { id: 'conf-m1', name: 'Sertraline', dose: '100 mg', route: 'oral', frequency: 'daily' },
        {
          id: 'conf-m2',
          name: 'Albuterol Sulfate',
          dose: '90 mcg/actuation',
          route: 'inhalation',
          frequency: 'every 6 hours as needed',
        },
        { id: 'conf-m4', name: 'Trazodone', dose: '50 mg', route: 'oral', frequency: 'at bedtime' },
      ],
    },
    later: {
      id: 's-conf-4',
      source: 'Synthetic hospital discharge medication summary',
      recordedAt: '2026-10-14',
      medications: [
        { id: 'conf-m1', name: 'Sertraline', dose: '50 mg', route: 'oral', frequency: 'daily' },
        {
          id: 'conf-m2',
          name: 'Albuterol Sulfate',
          dose: '90 mcg/actuation',
          route: 'inhalation',
          frequency: 'every 6 hours as needed',
        },
        {
          id: 'conf-m5',
          name: 'Ondansetron',
          dose: '4 mg',
          route: 'oral',
          frequency: 'every 8 hours as needed',
        },
      ],
    },
  },
  {
    id: 'scenario-empty-snapshots',
    patientId: 'SYN-007',
    patientLabel: 'Taylor Nguyen (Synthetic)',
    title: 'Empty medication snapshot pair',
    summary:
      'Both earlier and later snapshots record zero active medications, verifying zero-diff empty-state handling.',
    category: 'empty-no-change',
    tags: ['empty', 'no-change', 'boundary'],
    earlier: {
      id: 's-empty-1',
      source: 'Synthetic intake reconciliation (no active medications)',
      recordedAt: '2026-10-18',
      medications: [],
    },
    later: {
      id: 's-empty-2',
      source: 'Synthetic discharge summary (no active medications)',
      recordedAt: '2026-10-19',
      medications: [],
    },
  },
  {
    id: 'scenario-no-change-identical',
    patientId: 'SYN-008',
    patientLabel: 'Samira Hassan (Synthetic)',
    title: 'Identical no-change snapshot pair across encounters',
    summary:
      'Different sources and dates with identical medication entries (including an undocumented frequency), producing zero differences.',
    category: 'empty-no-change',
    tags: ['no-change', 'identical', 'null-stability'],
    earlier: {
      id: 's-same-1',
      source: 'Synthetic primary care medication list',
      recordedAt: '2026-10-09',
      medications: [
        { id: 'same-m1', name: 'Amlodipine', dose: '5 mg', route: 'oral', frequency: 'daily' },
        {
          id: 'same-m2',
          name: 'Fluticasone Propionate',
          dose: '50 mcg/actuation',
          route: 'intranasal',
          frequency: null,
        },
      ],
    },
    later: {
      id: 's-same-2',
      source: 'Synthetic specialist clinic medication list',
      recordedAt: '2026-10-20',
      medications: [
        { id: 'same-m1', name: 'Amlodipine', dose: '5 mg', route: 'oral', frequency: 'daily' },
        {
          id: 'same-m2',
          name: 'Fluticasone Propionate',
          dose: '50 mcg/actuation',
          route: 'intranasal',
          frequency: null,
        },
      ],
    },
  },
  {
    id: 'scenario-empty-to-populated',
    patientId: 'SYN-009',
    patientLabel: 'Noah Brooks (Synthetic)',
    title: 'Empty initial snapshot to newly documented medications',
    summary:
      'Transitions from an empty baseline medication list to newly initiated outpatient therapy.',
    category: 'empty-no-change',
    tags: ['empty-earlier', 'all-added'],
    earlier: {
      id: 's-addonly-1',
      source: 'Synthetic initial intake (no prior medications reported)',
      recordedAt: '2026-10-11',
      medications: [],
    },
    later: {
      id: 's-addonly-2',
      source: 'Synthetic outpatient prescription summary',
      recordedAt: '2026-10-18',
      medications: [
        { id: 'addonly-m1', name: 'Sumatriptan', dose: '50 mg', route: 'oral', frequency: 'at migraine onset' },
        { id: 'addonly-m2', name: 'Riboflavin', dose: '400 mg', route: 'oral', frequency: 'daily' },
      ],
    },
  },
];

export const syntheticScenarios: SyntheticScenario[] = [
  ...baseSyntheticScenarios,
  ...hfScenarios,
];

export function getSyntheticScenario(id: string): SyntheticScenario | undefined {
  return syntheticScenarios.find((scenario) => scenario.id === id);
}

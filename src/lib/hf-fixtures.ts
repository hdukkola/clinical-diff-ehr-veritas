import type { ScenarioCategory } from './fixtures';
import type { Snapshot } from './types';

/**
 * Deterministic synthetic clinical scenarios and note comparison pairs sourced from
 * audited open-licensed (MIT / CC BY 4.0) Hugging Face synthetic benchmarks.
 *
 * No real patient data or runtime network requests are used.
 */

export type HfLicense = 'MIT' | 'CC BY 4.0';

export type HfDatasetSource = {
  id: string;
  dataset: string;
  license: HfLicense;
  split: string;
  rowCount: number;
  sourceUrl: string;
  syntheticOnly: true;
  description: string;
};

export type HfFixtureProvenance = {
  dataset: string;
  license: HfLicense;
  split: string;
  rowIndex: number;
  sourceUrl: string;
  syntheticOnly: true;
  recordId?: string;
};

export type HfNotePair = {
  id: string;
  title: string;
  comparisonKind?: 'longitudinal' | 'cross-source';
  dataset: string;
  license: HfLicense;
  split: string;
  rowIndex: number;
  sourceUrl: string;
  syntheticOnly: true;
  earlierLabel: string;
  earlierNote: string;
  laterLabel: string;
  laterNote: string;
  referenceMedications: string[];
  provenance: HfFixtureProvenance;
};

export type HfSyntheticScenario = {
  id: string;
  patientId: string;
  patientLabel: string;
  title: string;
  summary: string;
  category: ScenarioCategory;
  tags: string[];
  earlier: Snapshot;
  later: Snapshot;
  provenance: HfFixtureProvenance;
};

export const hfDatasetSources: HfDatasetSource[] = [
  {
    id: 'hf-source-qdora',
    dataset: 'oopere/clinical-ner-qdora',
    license: 'MIT',
    split: 'test',
    rowCount: 40,
    sourceUrl: 'https://huggingface.co/datasets/oopere/clinical-ner-qdora',
    syntheticOnly: true,
    description:
      'Synthetic clinical notes across clean, abbreviated, typo-heavy, implicit, and irrelevant-context categories with structured JSON medication labels.',
  },
  {
    id: 'hf-source-clarus-discrepancy',
    dataset: 'ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1',
    license: 'MIT',
    split: 'train',
    rowCount: 10,
    sourceUrl:
      'https://huggingface.co/datasets/ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1',
    syntheticOnly: true,
    description:
      'Synthetic inpatient/ED medication reconciliation discrepancy scenarios modeling omissions, allergy conflicts, duplicate orders, and incomplete source attribution.',
  },
  {
    id: 'hf-source-medtempo-bench',
    dataset: 'mirobody/MedTEMPO-Bench',
    license: 'CC BY 4.0',
    split: 'test (synth_core200_v2n-20261028)',
    rowCount: 200,
    sourceUrl: 'https://huggingface.co/datasets/mirobody/MedTEMPO-Bench',
    syntheticOnly: true,
    description:
      'Synthetic longitudinal multi-admission medication reconciliation benchmark containing discharge summaries, inpatient orders, and outpatient pharmacy fill notes.',
  },
];

const QDORA_URL = 'https://huggingface.co/datasets/oopere/clinical-ner-qdora';
const CLARUS_URL =
  'https://huggingface.co/datasets/ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1';
const MEDTEMPO_URL = 'https://huggingface.co/datasets/mirobody/MedTEMPO-Bench';

export const hfScenarios: HfSyntheticScenario[] = [
  {
    id: 'hf-qdora-htn-escalation',
    patientId: 'HF-QDORA-014',
    patientLabel: 'HF Synthetic Patient 014 (oopere/clinical-ner-qdora)',
    title: 'Hypertension clinic follow-up to Lisinopril dose escalation',
    summary:
      'Derived from oopere/clinical-ner-qdora test rows 14 and 17: tracks Lisinopril 10 mg daily adherence note to 20 mg daily escalation plan.',
    category: 'baseline-reconciliation',
    tags: ['hf-synthetic', 'qdora', 'hypertension', 'dose-escalation'],
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 17,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-14-to-17',
    },
    earlier: {
      id: 'hf-s-qdora-14',
      source: 'Synthetic clinic follow-up note (oopere/clinical-ner-qdora test row 14)',
      recordedAt: '2026-10-02',
      sourceKind: 'clinical_note',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-qdora-htn-m1',
          name: 'Lisinopril',
          dose: '10 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-14-m1',
              noteId: 'qdora-test-row-14',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 14',
              section: 'Follow-up Note',
              excerpt: 'good adherence to lisinopril 10mg daily',
              span: { start: 244, end: 283 },
              recordedAt: '2026-10-02',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
    later: {
      id: 'hf-s-qdora-17',
      source: 'Synthetic hypertension escalation note (oopere/clinical-ner-qdora test row 17)',
      recordedAt: '2026-10-16',
      sourceKind: 'clinical_note',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-qdora-htn-m1',
          name: 'Lisinopril',
          dose: '20 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-17-m1',
              noteId: 'qdora-test-row-17',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 17',
              section: 'Assessment and Plan',
              excerpt: 'Plan to increase Lisinopril to 20mg daily',
              span: { start: 826, end: 867 },
              recordedAt: '2026-10-16',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'hf-qdora-shorthand-to-clean',
    patientId: 'HF-QDORA-000',
    patientLabel: 'HF Synthetic Patient 000 (oopere/clinical-ner-qdora)',
    title: 'Shorthand intake with undocumented Tylenol dose to urgent care bronchitis plan',
    summary:
      'Derived from oopere/clinical-ner-qdora test rows 0 and 32: models undocumented Tylenol dose/frequency alongside Amoxicillin frequency change and Albuterol HFA initiation.',
    category: 'missing-documentation',
    tags: ['hf-synthetic', 'qdora', 'typos', 'undocumented-dose'],
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 0,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-0-to-32',
    },
    earlier: {
      id: 'hf-s-qdora-0',
      source: 'Synthetic shorthand clinic note (oopere/clinical-ner-qdora test row 0)',
      recordedAt: '2026-10-03',
      sourceKind: 'clinical_note',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-qdora-resp-m1',
          name: 'Amoxicillin',
          dose: '500 mg',
          route: 'oral',
          frequency: 'twice daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-0-m1',
              noteId: 'qdora-test-row-0',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 0',
              excerpt: 'amoxicillin 500mg twice a day',
              span: { start: 137, end: 166 },
              recordedAt: '2026-10-03',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-qdora-resp-m2',
          name: 'Tylenol',
          dose: null,
          route: 'oral',
          frequency: null,
          provenance: {
            status: 'patient_reported',
            sourceKind: 'patient_report',
          },
          evidenceLinks: [
            {
              id: 'ev-qdora-0-m2',
              noteId: 'qdora-test-row-0',
              sourceKind: 'patient_report',
              sourceLabel: 'oopere/clinical-ner-qdora test row 0 (patient statement)',
              excerpt: 'tylenol for the fever but didnt say how much',
              span: { start: 181, end: 225 },
              recordedAt: '2026-10-03',
              provenanceStatus: 'patient_reported',
            },
          ],
        },
      ],
    },
    later: {
      id: 'hf-s-qdora-32',
      source: 'Synthetic urgent care clean note (oopere/clinical-ner-qdora test row 32)',
      recordedAt: '2026-10-08',
      sourceKind: 'clinical_note',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-qdora-resp-m1',
          name: 'Amoxicillin',
          dose: '500 mg',
          route: 'oral',
          frequency: 'three times daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-32-m1',
              noteId: 'qdora-test-row-32',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 32',
              section: 'Plan',
              excerpt: 'Start Amoxicillin 500mg three times daily for 7 days',
              span: { start: 420, end: 472 },
              recordedAt: '2026-10-08',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-qdora-resp-m3',
          name: 'Albuterol HFA',
          dose: '90 mcg (2 puffs)',
          route: 'inhalation',
          frequency: 'every 4-6 hours as needed',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-32-m3',
              noteId: 'qdora-test-row-32',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 32',
              section: 'Plan',
              excerpt: 'Albuterol HFA 90mcg inhaler, 2 puffs every 4-6 hours as needed',
              span: { start: 497, end: 559 },
              recordedAt: '2026-10-08',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'hf-qdora-asthma-abbreviations',
    patientId: 'HF-QDORA-007',
    patientLabel: 'HF Synthetic Patient 007 (oopere/clinical-ner-qdora)',
    title: 'Abbreviated clinic note to acute asthma exacerbation regimen',
    summary:
      'Derived from oopere/clinical-ner-qdora test rows 7 and 18: tracks abbreviated Rx notation, inhaler strength clarification, and Prednisone burst addition.',
    category: 'polypharmacy-transition',
    tags: ['hf-synthetic', 'qdora', 'abbreviations', 'asthma'],
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 7,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-7-to-18',
    },
    earlier: {
      id: 'hf-s-qdora-7',
      source: 'Synthetic abbreviated clinic note (oopere/clinical-ner-qdora test row 7)',
      recordedAt: '2026-10-04',
      sourceKind: 'clinical_note',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-qdora-ast-m1',
          name: 'Lisinopril',
          dose: '10 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-7-m1',
              noteId: 'qdora-test-row-7',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 7',
              excerpt: 'Continue Lisinopril 10mg PO qd',
              span: { start: 149, end: 179 },
              recordedAt: '2026-10-04',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-qdora-ast-m2',
          name: 'Albuterol HFA',
          dose: '2 puffs',
          route: 'inhalation',
          frequency: 'every 4 hours as needed',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-7-m2',
              noteId: 'qdora-test-row-7',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 7',
              excerpt: 'Added Albuterol HFA 2 puffs q4h PRN for wheezing',
              span: { start: 181, end: 229 },
              recordedAt: '2026-10-04',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
    later: {
      id: 'hf-s-qdora-18',
      source: 'Synthetic asthma exacerbation note (oopere/clinical-ner-qdora test row 18)',
      recordedAt: '2026-10-12',
      sourceKind: 'clinical_note',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-qdora-ast-m2',
          name: 'Albuterol',
          dose: '90 mcg (2 puffs)',
          route: 'inhalation',
          frequency: 'every 4 hours as needed',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-18-m2',
              noteId: 'qdora-test-row-18',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 18',
              excerpt: 'Albuterol 90mcg 2 puffs q4h PRN',
              span: { start: 142, end: 173 },
              recordedAt: '2026-10-12',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-qdora-ast-m3',
          name: 'Prednisone',
          dose: '40 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-18-m3',
              noteId: 'qdora-test-row-18',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 18',
              excerpt: 'Prednisone 40mg PO qd',
              span: { start: 175, end: 196 },
              recordedAt: '2026-10-12',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'hf-qdora-diabetes-adherence',
    patientId: 'HF-QDORA-029',
    patientLabel: 'HF Synthetic Patient 029 (oopere/clinical-ner-qdora)',
    title: 'Patient-reported adherence intake vs. documented diabetes intensification',
    summary:
      'Derived from oopere/clinical-ner-qdora test rows 29 and 37: contrasts patient-reported intake (missed doses) with documented Metformin increase and Glipizide addition.',
    category: 'conflicting-sources',
    tags: ['hf-synthetic', 'qdora', 'patient-reported', 'diabetes'],
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 37,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-29-to-37',
    },
    earlier: {
      id: 'hf-s-qdora-29',
      source: 'Synthetic patient-reported adherence note (oopere/clinical-ner-qdora test row 29)',
      recordedAt: '2026-10-05',
      sourceKind: 'patient_report',
      provenance: 'patient_reported',
      medications: [
        {
          id: 'hf-qdora-dm-m1',
          name: 'Lisinopril',
          dose: '10 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'patient_reported',
          evidenceLinks: [
            {
              id: 'ev-qdora-29-m1',
              noteId: 'qdora-test-row-29',
              sourceKind: 'patient_report',
              sourceLabel: 'oopere/clinical-ner-qdora test row 29',
              excerpt: 'lisinopril 10mg daily',
              span: { start: 783, end: 804 },
              recordedAt: '2026-10-05',
              provenanceStatus: 'patient_reported',
            },
          ],
        },
        {
          id: 'hf-qdora-dm-m2',
          name: 'Metformin',
          dose: '500 mg',
          route: 'oral',
          frequency: 'twice daily',
          provenance: 'patient_reported',
          evidenceLinks: [
            {
              id: 'ev-qdora-29-m2',
              noteId: 'qdora-test-row-29',
              sourceKind: 'patient_report',
              sourceLabel: 'oopere/clinical-ner-qdora test row 29',
              excerpt: 'metformin 500mg twice daily',
              span: { start: 809, end: 836 },
              recordedAt: '2026-10-05',
              provenanceStatus: 'patient_reported',
            },
          ],
        },
      ],
    },
    later: {
      id: 'hf-s-qdora-37',
      source: 'Synthetic diabetes follow-up note (oopere/clinical-ner-qdora test row 37)',
      recordedAt: '2026-10-19',
      sourceKind: 'clinical_note',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-qdora-dm-m2',
          name: 'Metformin',
          dose: '1000 mg',
          route: 'oral',
          frequency: 'twice daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-37-m2',
              noteId: 'qdora-test-row-37',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 37',
              excerpt: 'Continue current metformin 1000mg twice daily',
              span: { start: 699, end: 744 },
              recordedAt: '2026-10-19',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-qdora-dm-m3',
          name: 'Glipizide',
          dose: '5 mg',
          route: 'oral',
          frequency: 'once daily before breakfast',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-qdora-37-m3',
              noteId: 'qdora-test-row-37',
              sourceKind: 'clinical_note',
              sourceLabel: 'oopere/clinical-ner-qdora test row 37',
              excerpt: 'add glipizide 5mg once daily before breakfast',
              span: { start: 749, end: 794 },
              recordedAt: '2026-10-19',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'hf-clarus-cmrd002-omission',
    patientId: 'HF-CLARUS-CMRD-002',
    patientLabel: 'HF Synthetic Patient CMRD-002 (ClarusC64)',
    title: 'Ward admission beta-blocker omission discrepancy (CMRD-002)',
    summary:
      'Derived from ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1 train row 1 (CMRD-002): complete home medication list with beta-blocker omitted on Ward admission.',
    category: 'baseline-reconciliation',
    tags: ['hf-synthetic', 'clarusc64', 'omission', 'ward'],
    provenance: {
      dataset: 'ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1',
      license: 'MIT',
      split: 'train',
      rowIndex: 1,
      sourceUrl: CLARUS_URL,
      syntheticOnly: true,
      recordId: 'CMRD-002',
    },
    earlier: {
      id: 'hf-s-clarus-002-a',
      source: 'Synthetic complete home medication list (ClarusC64 CMRD-002)',
      recordedAt: '2026-10-06',
      sourceKind: 'external_record',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-clarus-002-m1',
          name: 'Metoprolol Succinate',
          dose: '50 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-clarus-002-m1',
              sourceId: 'CMRD-002',
              sourceKind: 'external_record',
              sourceLabel: 'ClarusC64 CMRD-002 home_meds_list_signal=complete',
              excerpt: 'Beta-blocker omitted on admission, not resolved.',
              recordedAt: '2026-10-06',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-clarus-002-m2',
          name: 'Lisinopril',
          dose: '10 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-clarus-002-m2',
              sourceId: 'CMRD-002',
              sourceKind: 'external_record',
              sourceLabel: 'ClarusC64 CMRD-002 home_meds_list_signal=complete',
              excerpt: 'Complete home meds and allergies recorded on Ward intake.',
              recordedAt: '2026-10-06',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
    later: {
      id: 'hf-s-clarus-002-b',
      source: 'Synthetic Ward admission orders (ClarusC64 CMRD-002 misaligned)',
      recordedAt: '2026-10-07',
      sourceKind: 'clinical_note',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-clarus-002-m2',
          name: 'Lisinopril',
          dose: '10 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-clarus-002-m2b',
              sourceId: 'CMRD-002',
              sourceKind: 'clinical_note',
              sourceLabel: 'ClarusC64 CMRD-002 admission_orders_signal=misaligned',
              excerpt: 'Critical omission (discrepancy_type=omission, not_resolved).',
              recordedAt: '2026-10-07',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'hf-clarus-cmrd005-unknown-ed',
    patientId: 'HF-CLARUS-CMRD-005',
    patientLabel: 'HF Synthetic Patient CMRD-005 (ClarusC64)',
    title: 'Incomplete ED home list and unclear orders with unknown provenance (CMRD-005)',
    summary:
      'Derived from ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1 train row 4 (CMRD-005): models partial home medication intake, missing timestamp, and unclear ED order provenance.',
    category: 'missing-documentation',
    tags: ['hf-synthetic', 'clarusc64', 'unknown-provenance', 'ed'],
    provenance: {
      dataset: 'ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1',
      license: 'MIT',
      split: 'train',
      rowIndex: 4,
      sourceUrl: CLARUS_URL,
      syntheticOnly: true,
      recordId: 'CMRD-005',
    },
    earlier: {
      id: 'hf-s-clarus-005-a',
      source: 'Synthetic ED partial home medication intake (source unknown)',
      recordedAt: null,
      provenance: 'unknown',
      medications: [
        {
          id: 'hf-clarus-005-m1',
          name: 'Furosemide',
          dose: null,
          route: 'oral',
          frequency: null,
          provenance: 'unknown',
          evidenceLinks: [
            {
              id: 'ev-clarus-005-m1',
              sourceId: 'CMRD-005',
              sourceKind: 'unknown',
              sourceLabel: 'unknown',
              excerpt: 'Incomplete home meds, unclear orders, discrepancy persists.',
              provenanceStatus: 'unknown',
            },
          ],
        },
        {
          id: 'hf-clarus-005-m2',
          name: 'Warfarin',
          dose: '5 mg',
          route: 'oral',
          frequency: null,
          provenance: 'unknown',
        },
      ],
    },
    later: {
      id: 'hf-s-clarus-005-b',
      source: 'Synthetic ED unclear admission orders (ClarusC64 CMRD-005 ambiguous)',
      recordedAt: '2026-10-10',
      provenance: {
        status: 'unknown',
        ambiguous: true,
        note: 'ClarusC64 CMRD-005: admission_orders_signal=unclear, discrepancy_type=unknown.',
      },
      medications: [
        {
          id: 'hf-clarus-005-m2',
          name: 'Warfarin',
          dose: null,
          route: 'oral',
          frequency: null,
          provenance: {
            status: 'unknown',
            ambiguous: true,
            note: 'Input incomplete; dose unclear in ED orders.',
          },
          evidenceLinks: [
            {
              id: 'ev-clarus-005-m2b',
              sourceId: 'CMRD-005',
              sourceKind: 'unknown',
              sourceLabel: 'ClarusC64 CMRD-005 unclear ED orders',
              excerpt: 'Input incomplete (discrepancy_resolved_signal=not_resolved).',
              recordedAt: '2026-10-10',
              resolutionStatus: 'ambiguous',
              provenanceStatus: 'unknown',
            },
          ],
        },
        {
          id: 'hf-clarus-005-m3',
          name: 'Enoxaparin',
          dose: '40 mg',
          route: 'subcutaneous',
          frequency: 'daily',
          provenance: 'unverified',
        },
      ],
    },
  },
  {
    id: 'hf-medtempo-90200091-post-stent',
    patientId: 'HF-MEDTEMPO-90200091',
    patientLabel: 'HF Synthetic Patient 90200091 (MedTEMPO-Bench)',
    title: 'Post-stent admission to discharge dual-antiplatelet initiation',
    summary:
      'Derived from mirobody/MedTEMPO-Bench synthetic unit 90200091_9020009102: compares admission medications (U90200091_ds1s16) against discharge regimen (U90200091_ds1m0..5).',
    category: 'polypharmacy-transition',
    tags: ['hf-synthetic', 'medtempo', 'discharge', 'cardiology'],
    provenance: {
      dataset: 'mirobody/MedTEMPO-Bench',
      license: 'CC BY 4.0',
      split: 'test (synth_core200_v2n-20261028)',
      rowIndex: 5,
      sourceUrl: MEDTEMPO_URL,
      syntheticOnly: true,
      recordId: '90200091_9020009102',
    },
    earlier: {
      id: 'hf-s-mt-90200091-a',
      source: 'Synthetic MedTEMPO-Bench admission medication list (U90200091_ds1s16)',
      recordedAt: '2159-05-04',
      sourceKind: 'discharge_summary',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-mt-90200091-m1',
          name: 'Aspirin',
          dose: '81 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-adm-m1',
              noteId: 'U90200091_ds1s16',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1s16',
              section: 'Medications on Admission',
              excerpt: 'Aspirin 81 mg PO DAILY',
              recordedAt: '2159-05-04',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200091-m2',
          name: 'Prilosec',
          dose: '40 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-adm-m2',
              noteId: 'U90200091_ds1s16',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1s16',
              section: 'Medications on Admission',
              excerpt: 'Prilosec 40 mg PO DAILY',
              recordedAt: '2159-05-04',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200091-m3',
          name: 'Seroquel',
          dose: '25 mg',
          route: 'oral',
          frequency: 'twice daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-adm-m3',
              noteId: 'U90200091_ds1s16',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1s16',
              section: 'Medications on Admission',
              excerpt: 'Seroquel 25 mg PO BID',
              recordedAt: '2159-05-04',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
    later: {
      id: 'hf-s-mt-90200091-b',
      source: 'Synthetic MedTEMPO-Bench discharge medications (U90200091_ds1m0..5)',
      recordedAt: '2159-05-05',
      sourceKind: 'discharge_summary',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-mt-90200091-m1',
          name: 'Aspirin',
          dose: '81 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-dc-m1',
              noteId: 'U90200091_ds1m0',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1m0',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Aspirin 81 mg PO DAILY',
              recordedAt: '2159-05-05',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200091-m2',
          name: 'Prilosec',
          dose: '40 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-dc-m2',
              noteId: 'U90200091_ds1m1',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1m1',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Prilosec 40 mg PO DAILY',
              recordedAt: '2159-05-05',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200091-m3',
          name: 'Seroquel',
          dose: '25 mg',
          route: 'oral',
          frequency: 'twice daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-dc-m3',
              noteId: 'U90200091_ds1m2',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1m2',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Seroquel 25 mg PO BID',
              recordedAt: '2159-05-05',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200091-m4',
          name: 'Metoprolol Succinate ER',
          dose: '50 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-dc-m4',
              noteId: 'U90200091_ds1m3',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1m3',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Metoprolol Succinate ER 50 mg PO DAILY',
              recordedAt: '2159-05-05',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200091-m5',
          name: 'Lipitor',
          dose: '10 mg',
          route: 'oral',
          frequency: 'at bedtime',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-dc-m5',
              noteId: 'U90200091_ds1m4',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1m4',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Lipitor 10 mg PO QHS',
              recordedAt: '2159-05-05',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200091-m6',
          name: 'Clopidogrel',
          dose: '75 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200091-dc-m6',
              noteId: 'U90200091_ds1m5',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200091_ds1m5',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Clopidogrel 75 mg PO DAILY',
              recordedAt: '2159-05-05',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'hf-medtempo-90200154-longitudinal',
    patientId: 'HF-MEDTEMPO-90200154',
    patientLabel: 'HF Synthetic Patient 90200154 (MedTEMPO-Bench)',
    title: 'Longitudinal discharge to outpatient bradycardia stop & Verapamil titration',
    summary:
      'Derived from mirobody/MedTEMPO-Bench synthetic unit 90200154_9020015404: tracks Acebutolol discontinuation for bradycardia and Verapamil Hydrochloride 80 mg to 120 mg uptitration.',
    category: 'allergy-hold-restart',
    tags: ['hf-synthetic', 'medtempo', 'longitudinal', 'bradycardia-stop'],
    provenance: {
      dataset: 'mirobody/MedTEMPO-Bench',
      license: 'CC BY 4.0',
      split: 'test (synth_core200_v2n-20261028)',
      rowIndex: 20,
      sourceUrl: MEDTEMPO_URL,
      syntheticOnly: true,
      recordId: '90200154_9020015404',
    },
    earlier: {
      id: 'hf-s-mt-90200154-a',
      source: 'Synthetic MedTEMPO-Bench discharge summary (U90200154_ds3m0..5)',
      recordedAt: '2171-03-18',
      sourceKind: 'discharge_summary',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-mt-90200154-m1',
          name: 'Verapamil Hydrochloride',
          dose: '80 mg',
          route: 'oral',
          frequency: 'three times daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-dc-m1',
              noteId: 'U90200154_ds3m0',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200154_ds3m0',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Verapamil Hydrochloride 80 mg PO TID',
              recordedAt: '2171-03-18',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m2',
          name: 'Ursodiol',
          dose: '300 mg',
          route: 'oral',
          frequency: 'three times daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-dc-m2',
              noteId: 'U90200154_ds3m1',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200154_ds3m1',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Ursodiol 300 mg PO TID',
              recordedAt: '2171-03-18',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m3',
          name: 'Acebutolol',
          dose: '200 mg',
          route: 'oral',
          frequency: 'twice daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-dc-m3',
              noteId: 'U90200154_ds3m2',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200154_ds3m2',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Acebutolol 200 mg PO BID',
              recordedAt: '2171-03-18',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m4',
          name: 'NaHCO3',
          dose: '650 mg',
          route: 'oral',
          frequency: 'three times daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-dc-m4',
              noteId: 'U90200154_ds3m3',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200154_ds3m3',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: NaHCO3 650 mg PO TID',
              recordedAt: '2171-03-18',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m5',
          name: 'Vitamin D',
          dose: '1000 units',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-dc-m5',
              noteId: 'U90200154_ds3m4',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200154_ds3m4',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Vitamin D 1000 units PO DAILY',
              recordedAt: '2171-03-18',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m6',
          name: 'Aspirin',
          dose: '81 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-dc-m6',
              noteId: 'U90200154_ds3m5',
              sourceKind: 'discharge_summary',
              sourceLabel: 'MedTEMPO-Bench U90200154_ds3m5',
              section: 'Discharge Medications',
              excerpt: 'Discharge Medications: Aspirin 81 mg PO DAILY',
              recordedAt: '2171-03-18',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
    later: {
      id: 'hf-s-mt-90200154-b',
      source: 'Synthetic MedTEMPO-Bench outpatient & pharmacy fill review (U90200154_omr36..46)',
      recordedAt: '2176-05-15',
      sourceKind: 'pharmacy_fill',
      provenance: 'documented',
      medications: [
        {
          id: 'hf-mt-90200154-m1',
          name: 'Verapamil Hydrochloride',
          dose: '120 mg',
          route: 'oral',
          frequency: 'three times daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-omr37',
              noteId: 'U90200154_omr37',
              sourceKind: 'clinical_note',
              sourceLabel: 'MedTEMPO-Bench U90200154_omr37',
              section: 'Progress Note',
              excerpt: 'Progress Note Uptitrate Verapamil Hydrochloride to 120 mg.',
              recordedAt: '2174-07-24',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m2',
          name: 'Ursodiol',
          dose: '300 mg',
          route: 'oral',
          frequency: 'three times daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-omr42',
              noteId: 'U90200154_omr42',
              sourceKind: 'clinical_note',
              sourceLabel: 'MedTEMPO-Bench U90200154_omr42',
              section: 'Clinic Note',
              excerpt: 'Reviewed Ursodiol: still indicated, continue current dose.',
              recordedAt: '2175-11-18',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m4',
          name: 'NaHCO3',
          dose: '650 mg',
          route: 'oral',
          frequency: 'three times daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-omr43',
              noteId: 'U90200154_omr43',
              sourceKind: 'pharmacy_fill',
              sourceLabel: 'MedTEMPO-Bench U90200154_omr43',
              section: 'Pharmacy Fill History',
              excerpt: 'Sodium Bicarbonate 650 mg: dispensed 2176-01-24, 30 days.',
              recordedAt: '2176-05-15',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m5',
          name: 'Vitamin D',
          dose: '1000 units',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-omr46',
              noteId: 'U90200154_omr46',
              sourceKind: 'pharmacy_fill',
              sourceLabel: 'MedTEMPO-Bench U90200154_omr46',
              section: 'Pharmacy Fill History',
              excerpt: 'Vitamin D 1000 units last filled 2176-04-28 (30-day supply).',
              recordedAt: '2176-05-15',
              provenanceStatus: 'documented',
            },
          ],
        },
        {
          id: 'hf-mt-90200154-m6',
          name: 'Aspirin',
          dose: '81 mg',
          route: 'oral',
          frequency: 'daily',
          provenance: 'documented',
          evidenceLinks: [
            {
              id: 'ev-mt-90200154-omr45',
              noteId: 'U90200154_omr45',
              sourceKind: 'pharmacy_fill',
              sourceLabel: 'MedTEMPO-Bench U90200154_omr45',
              section: 'Pharmacy Fill History',
              excerpt: 'Aspirin 81 mg: dispensed 2176-04-25, 30 days.',
              recordedAt: '2176-05-15',
              provenanceStatus: 'documented',
            },
          ],
        },
      ],
    },
  },
];

export const hfNoteComparisonPairs: HfNotePair[] = [
  {
    id: 'hf-note-qdora-htn-escalation',
    title: 'Clinic Hypertension Follow-up → Dose Escalation (QDORA Rows 14 & 17)',
    dataset: 'oopere/clinical-ner-qdora',
    license: 'MIT',
    split: 'test',
    rowIndex: 14,
    sourceUrl: QDORA_URL,
    syntheticOnly: true,
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 14,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-14-to-17',
    },
    earlierLabel: 'Earlier clinic note (oopere/clinical-ner-qdora test #14)',
    earlierNote:
      "Patient is a 67-year-old retired teacher who presents for follow-up of hypertension. Insurance verification completed - Medicare Part B active. She mentions her grandson just started college which is exciting but stressful financially. Reports good adherence to lisinopril 10mg daily, though she sometimes forgets the evening dose. Dr. Johnson saw her last month for routine check - notes indicate stable condition. Patient scheduled for mammogram next week per reminder system. Complains of occasional dizziness when standing, especially in the mornings. Denies chest pain or palpitations. Blood pressure today 145/92. Previous visit BP was 138/88 per chart review. Heart rate regular at 78 bpm. She's been walking more with her neighbor's dog since her own passed away last spring. Temperature not taken today due to thermometer malfunction. Discussed lifestyle modifications including reducing sodium intake. Will continue current antihypertensive regimen. RTC in 3 months. Nursing staff reminded about equipment maintenance request submitted last week.",
    laterLabel: 'Later escalation note (oopere/clinical-ner-qdora test #17)',
    laterNote:
      "Patient is a 67-year-old retired teacher who missed her last two appointments due to transportation issues. Insurance pre-authorization pending for specialist referral. She reports feeling dizzy and having headaches for about 2 weeks now. Her daughter drove her today and is concerned about mom living alone. BP measured at 160/95. Patient mentions she's been stressed about her grandson's college tuition. Temperature not taken due to thermometer malfunction. She's currently on Lisinopril 10mg once daily but admits to sometimes forgetting doses. Scheduling note: patient prefers morning appointments. Social worker referral may be appropriate given living situation concerns. Patient denies chest pain or palpitations. In my clinical opinion, this appears to be poorly controlled hypertension contributing to her symptoms. Plan to increase Lisinopril to 20mg daily and follow up in 2 weeks. Remind front desk to call patient day before appointment.",
    referenceMedications: ['Lisinopril'],
  },
  {
    id: 'hf-note-qdora-typos-vs-clean',
    title: 'Cross-Source Shorthand Note vs. Urgent Care Bronchitis Plan (QDORA Rows 0 & 32)',
    comparisonKind: 'cross-source',
    dataset: 'oopere/clinical-ner-qdora',
    license: 'MIT',
    split: 'test',
    rowIndex: 0,
    sourceUrl: QDORA_URL,
    syntheticOnly: true,
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 0,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-0-to-32',
    },
    earlierLabel: 'Cross-source shorthand note (oopere/clinical-ner-qdora test #0)',
    earlierNote:
      '45 y.o male pt comin in c/o fevr and chst pain for like 3 days now. also has a bad cough. vitls r temp 38.8 hr 102 bp 130/85. put him on amoxicillin 500mg twice a day n he is takin tylenol for the fever but didnt say how much. sendin home to rest',
    laterLabel: 'Later urgent care note (oopere/clinical-ner-qdora test #32)',
    laterNote:
      'HPI: 45-year-old male presents to the urgent care clinic complaining of a persistent productive cough and intermittent chest tightness for the past 5 days. Patient reports associated fatigue and subjective fevers at home. He denies any nausea or vomiting. Physical examination reveals mild wheezing in the bilateral lower lobes. \n\nVitals: Temp 101.2 F, HR 88 bpm, BP 132/84 mmHg. \n\nAssessment: Acute bronchitis. \n\nPlan: Start Amoxicillin 500mg three times daily for 7 days. Patient advised to use Albuterol HFA 90mcg inhaler, 2 puffs every 4-6 hours as needed for wheezing. Follow up if symptoms worsen.',
    referenceMedications: ['Amoxicillin', 'Tylenol', 'Albuterol HFA'],
  },
  {
    id: 'hf-note-qdora-abbreviations',
    title: 'Cross-Source Abbreviated Note vs. Asthma Exacerbation Rx (QDORA Rows 7 & 18)',
    comparisonKind: 'cross-source',
    dataset: 'oopere/clinical-ner-qdora',
    license: 'MIT',
    split: 'test',
    rowIndex: 7,
    sourceUrl: QDORA_URL,
    syntheticOnly: true,
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 7,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-7-to-18',
    },
    earlierLabel: 'Earlier abbreviated note (oopere/clinical-ner-qdora test #7)',
    earlierNote:
      '68 yo pt presents to the clinic c/o SOB and DOE x 4 days. Pt states sx began gradually. Hx of HTN. Vitals: Temp 37.8, HR 92, BP 145/88, wt 82kg. Rx: Continue Lisinopril 10mg PO qd. Added Albuterol HFA 2 puffs q4h PRN for wheezing.',
    laterLabel: 'Cross-source exacerbation note (oopere/clinical-ner-qdora test #18)',
    laterNote:
      '68 yo pt presents c/o SOB and DOE x 4 days. Sx worsening over the last 24 hrs. Temp 38.2, HR 105, BP 140/90. Hx of mild persistent asthma. Rx Albuterol 90mcg 2 puffs q4h PRN, Prednisone 40mg PO qd.',
    referenceMedications: ['Lisinopril', 'Albuterol HFA', 'Albuterol', 'Prednisone'],
  },
  {
    id: 'hf-note-qdora-diabetes-followup',
    title: 'Orthostatic Follow-up → Diabetes Intensification (QDORA Rows 29 & 37)',
    dataset: 'oopere/clinical-ner-qdora',
    license: 'MIT',
    split: 'test',
    rowIndex: 29,
    sourceUrl: QDORA_URL,
    syntheticOnly: true,
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 29,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-29-to-37',
    },
    earlierLabel: 'Earlier intake note (oopere/clinical-ner-qdora test #29)',
    earlierNote:
      "Patient is a 67-year-old retired teacher who was referred from Dr. Johnson's office last Tuesday. Insurance pre-authorization was approved for this visit (claim #TX-4429). She mentions her daughter drove her here today because of parking concerns downtown. Chief complaint: 'I've been having these dizzy spells for about 2 weeks now, especially when I stand up.' Patient reports episodes of lightheadedness occurring 3-4 times daily. She also notes some fatigue but attributes this to 'getting older.' Vital signs obtained by MA Sarah: BP 90/60, appears lower than her usual readings per patient. Temperature and pulse not documented due to equipment malfunction in room 3. Social history notable for recent loss of spouse 6 months ago, living alone now. Current medications include lisinopril 10mg daily and metformin 500mg twice daily, though patient admits to occasional missed doses due to 'forgetting.' She's scheduled for follow-up labs next week - will need to coordinate with lab scheduling. Patient seems pleasant and cooperative, though somewhat anxious about driving herself to appointments. Plan: Continue current medications, consider orthostatic hypotension workup. Next available appointment is March 15th per front desk.",
    laterLabel: 'Later diabetes note (oopere/clinical-ner-qdora test #37)',
    laterNote:
      "Patient is a 67-year-old retired teacher who presents today for follow-up of her diabetes management. She mentions that her grandson just started college which has been stressful for the family financially. Insurance pre-authorization was obtained for her continuous glucose monitor last week. She reports checking her blood sugars regularly at home with readings ranging 140-180 mg/dL. Patient complains of increased urination and thirst over the past 2 weeks. She also mentions some blurred vision episodes. Denies chest pain or shortness of breath. Physical exam notable for clear lungs, regular heart rhythm. Patient's next appointment scheduled for 3 months, will need labs drawn 1 week prior. Continue current metformin 1000mg twice daily and add glipizide 5mg once daily before breakfast. Patient counseled on diabetic diet and exercise. Will refer to ophthalmology for diabetic retinopathy screening given visual symptoms. Front desk to schedule eye appointment within 2 weeks.",
    referenceMedications: ['Lisinopril', 'Metformin', 'Glipizide'],
  },
  {
    id: 'hf-note-qdora-cardiac-typos-implicit',
    title: 'Cross-Source ER Typos Note vs. Chronic Care Note (QDORA Rows 24 & 34)',
    comparisonKind: 'cross-source',
    dataset: 'oopere/clinical-ner-qdora',
    license: 'MIT',
    split: 'test',
    rowIndex: 24,
    sourceUrl: QDORA_URL,
    syntheticOnly: true,
    provenance: {
      dataset: 'oopere/clinical-ner-qdora',
      license: 'MIT',
      split: 'test',
      rowIndex: 24,
      sourceUrl: QDORA_URL,
      syntheticOnly: true,
      recordId: 'test-row-24-to-34',
    },
    earlierLabel: 'Cross-source ER shorthand note (oopere/clinical-ner-qdora test #24)',
    earlierNote:
      'pt is 55yo m coming in with sob chest panes and nauzea x 3 d . he looks uncomfy T 101.2 hr110 bp 140/90 . takes asprin 81 mg qd and lsnopril 10mg dont know freq needs ekg stat',
    laterLabel: 'Later clinic note (oopere/clinical-ner-qdora test #34)',
    laterNote:
      "The patient is a 55-year-old male who presents to the clinic stating he has been feeling unwell for the past 10 days. He mentions that he can't climb stairs without stopping to catch his breath. He also reports that he wakes up at night sweating profusely and soaking his sheets. Over the last week, he noticed that his food doesn't taste like anything, making it hard to eat. Vital signs recorded by the nurse today: Temp 37.8 C, pulse 88 bpm, BP 130/85 mmHg. He is currently taking Lisinopril 10 mg daily and Atorvastatin 20 mg once a day for his chronic conditions.",
    referenceMedications: ['Aspirin', 'Lisinopril', 'Atorvastatin'],
  },
  {
    id: 'hf-note-clarus-cmrd-discrepancies',
    title: 'ClarusC64 Ward Omission vs. ED Incomplete Intake (CMRD-002 & CMRD-005)',
    dataset: 'ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1',
    license: 'MIT',
    split: 'train',
    rowIndex: 1,
    sourceUrl: CLARUS_URL,
    syntheticOnly: true,
    provenance: {
      dataset: 'ClarusC64/clinical-medication-reconciliation-discrepancy-risk-v0.1',
      license: 'MIT',
      split: 'train',
      rowIndex: 1,
      sourceUrl: CLARUS_URL,
      syntheticOnly: true,
      recordId: 'CMRD-002-vs-CMRD-005',
    },
    earlierLabel: 'Ward intake summary (ClarusC64 CMRD-002)',
    earlierNote:
      'Care setting: Ward. Home meds list signal: complete. Allergy list signal: complete. Admission orders signal: misaligned. Discrepancy type: omission (not_resolved). Summary: Beta-blocker omitted on admission, not resolved. Medications recorded on home list: Metoprolol Succinate 50 mg daily, Lisinopril 10 mg daily. Admission orders: Lisinopril 10 mg daily.',
    laterLabel: 'ED reconciliation summary (ClarusC64 CMRD-005)',
    laterNote:
      'Care setting: ED. Home meds list signal: partial. Allergy list signal: partial. Admission orders signal: unclear. Discrepancy type: unknown (not_resolved). Summary: Incomplete home meds, unclear orders, discrepancy persists. Medications noted: Warfarin, Furosemide, Enoxaparin 40 mg subcutaneous daily.',
    referenceMedications: ['Metoprolol Succinate', 'Lisinopril', 'Warfarin', 'Furosemide', 'Enoxaparin'],
  },
  {
    id: 'hf-note-medtempo-90200091',
    title: 'Post-NSTEMI Admission → Discharge & Follow-up (MedTEMPO 90200091)',
    dataset: 'mirobody/MedTEMPO-Bench',
    license: 'CC BY 4.0',
    split: 'test (synth_core200_v2n-20261028)',
    rowIndex: 5,
    sourceUrl: MEDTEMPO_URL,
    syntheticOnly: true,
    provenance: {
      dataset: 'mirobody/MedTEMPO-Bench',
      license: 'CC BY 4.0',
      split: 'test (synth_core200_v2n-20261028)',
      rowIndex: 5,
      sourceUrl: MEDTEMPO_URL,
      syntheticOnly: true,
      recordId: '90200091_9020009102',
    },
    earlierLabel: 'Admission medication list (MedTEMPO U90200091_ds1s16)',
    earlierNote:
      'Medications on Admission (2159-05-04): Aspirin 81 mg PO DAILY, Prilosec 40 mg PO DAILY, Seroquel 25 mg PO BID.',
    laterLabel: 'Discharge medications & transitional note (MedTEMPO U90200091_ds1m0..5)',
    laterNote:
      'Discharge Medications (2159-05-05): Aspirin 81 mg PO DAILY; Prilosec 40 mg PO DAILY; Seroquel 25 mg PO BID; Metoprolol Succinate ER 50 mg PO DAILY; Lipitor 10 mg PO QHS; Clopidogrel 75 mg PO DAILY.\nTransitional Issues: The receiving team at extended care should verify that the patient continues dual antiplatelet therapy with Clopidogrel 75 mg as started for post-infarction care. Outpatient providers should also review the recent initiation of Metoprolol Succinate ER 50 mg and Atorvastatin 10 mg.',
    referenceMedications: [
      'Aspirin',
      'Prilosec',
      'Seroquel',
      'Metoprolol Succinate ER',
      'Lipitor',
      'Clopidogrel',
    ],
  },
  {
    id: 'hf-note-medtempo-90200154',
    title: 'Longitudinal Discharge → Bradycardia Stop & Titration (MedTEMPO 90200154)',
    dataset: 'mirobody/MedTEMPO-Bench',
    license: 'CC BY 4.0',
    split: 'test (synth_core200_v2n-20261028)',
    rowIndex: 20,
    sourceUrl: MEDTEMPO_URL,
    syntheticOnly: true,
    provenance: {
      dataset: 'mirobody/MedTEMPO-Bench',
      license: 'CC BY 4.0',
      split: 'test (synth_core200_v2n-20261028)',
      rowIndex: 20,
      sourceUrl: MEDTEMPO_URL,
      syntheticOnly: true,
      recordId: '90200154_9020015404',
    },
    earlierLabel: 'Discharge medications (MedTEMPO U90200154_ds3m0..5)',
    earlierNote:
      'Discharge Medications (2171-03-18):\n1. Verapamil Hydrochloride 80 mg PO TID\n2. Ursodiol 300 mg PO TID\n3. Acebutolol 200 mg PO BID\n4. NaHCO3 650 mg PO TID\n5. Vitamin D 1000 units PO DAILY\n6. Aspirin 81 mg PO DAILY',
    laterLabel: 'Outpatient clinic & pharmacy fills (MedTEMPO U90200154_omr36..46)',
    laterNote:
      'Progress Note (2173-11-12): Symptomatic bradycardia. Acebutolol no longer indicated and stopped.\nProgress Note (2174-07-24): Uptitrate Verapamil Hydrochloride to 120 mg.\nClinic Note (2175-11-18): Reviewed Ursodiol: still indicated, continue current dose.\nPharmacy Fill History (2176-05-15): Sodium Bicarbonate 650 mg dispensed 2176-01-24; Reltone (Ursodiol) 300 mg last filled 2176-03-30; Aspirin 81 mg dispensed 2176-04-25; Vitamin D 1000 units last filled 2176-04-28.',
    referenceMedications: [
      'Verapamil Hydrochloride',
      'Ursodiol',
      'Acebutolol',
      'NaHCO3',
      'Vitamin D',
      'Aspirin',
    ],
  },
];

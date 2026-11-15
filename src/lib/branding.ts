import type { Metadata } from 'next';

/**
 * Consistent temporary brand name used across browser titles and navigation.
 */
export const BRAND_NAME = 'DiffMD' as const;

export const BRAND_METADATA: Metadata = {
  title: BRAND_NAME,
  description: `${BRAND_NAME} EHR medication reconciliation and note comparison workspace`,
};

export interface BrandCandidateEvaluation {
  name: 'NoteDelta' | 'MedLedger' | 'ChartLens' | 'NoteBridge' | 'Lineward';
  strengths: string;
  tradeoffs: string;
  fit: string;
}

/**
 * Concise evaluation of candidate product names.
 * Note: Does not claim domain or trademark availability.
 */
export const BRAND_CANDIDATE_EVALUATION: readonly BrandCandidateEvaluation[] = [
  {
    name: 'NoteDelta',
    strengths: 'Directly pairs clinical documentation ("Note") with change detection ("Delta").',
    tradeoffs: 'Slightly technical; "Delta" may feel engineering-heavy to some clinicians.',
    fit: 'Strongest literal match for note comparison and diffing.',
  },
  {
    name: 'MedLedger',
    strengths: 'Conveys auditability, accuracy, and medication reconciliation.',
    tradeoffs: 'Leans financial/accounting ("Ledger") and narrows focus away from general notes.',
    fit: 'Best if medication reconciliation is the primary long-term anchor.',
  },
  {
    name: 'ChartLens',
    strengths: 'Clear clinical context ("Chart") with an inspection/review metaphor ("Lens").',
    tradeoffs: 'Less specific to diffing or comparing two versions.',
    fit: 'Good for broader chart review, weaker for side-by-side change tracking.',
  },
  {
    name: 'NoteBridge',
    strengths: 'Suggests continuity and reconciling notes across encounters or care settings.',
    tradeoffs: 'Reads more like interoperability/messaging than version comparison.',
    fit: 'Stronger for handoff workflows than strict diffing.',
  },
  {
    name: 'Lineward',
    strengths: 'Distinctive, concise, and evokes line-by-line review and care.',
    tradeoffs: 'Least self-explanatory; requires brand education to connect to clinical diffs.',
    fit: 'Best if aiming for a memorable, non-descriptive brand.',
  },
] as const;

export interface BrandLogoConcept {
  id: 'offset-documents-diff' | 'parallel-lines-bridge' | 'delta-document-outline';
  name: string;
  description: string;
  viewBox: '0 0 24 24';
  svg: string;
}

/**
 * Three simple, single-color, small-size-legible SVG logo concepts.
 * Uses currentColor only; avoids medical crosses, shields, or sparkles.
 */
export const BRAND_LOGO_CONCEPTS: readonly BrandLogoConcept[] = [
  {
    id: 'offset-documents-diff',
    name: 'Offset Documents with Highlighted Difference',
    description: 'Two offset document frames with a single emphasized diff bar.',
    viewBox: '0 0 24 24',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="11" height="14" rx="2"/><rect x="9" y="7" width="11" height="14" rx="2" fill="none"/><line x1="12" y1="12" x2="17" y2="12" stroke-width="2.5"/></svg>',
  },
  {
    id: 'parallel-lines-bridge',
    name: 'Parallel Note Lines Connected by a Bridge',
    description: 'Two parallel note columns linked by a horizontal reconciliation bridge.',
    viewBox: '0 0 24 24',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="5" x2="6" y2="19"/><line x1="18" y1="5" x2="18" y2="19"/><line x1="6" y1="12" x2="18" y2="12"/></svg>',
  },
  {
    id: 'delta-document-outline',
    name: 'Minimal Delta in Document Outline',
    description: 'A clean document outline housing a geometric delta triangle.',
    viewBox: '0 0 24 24',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><polygon points="12,8 16.5,16 7.5,16"/></svg>',
  },
] as const;

/** All records in this prototype are fictional. Null means not documented. */
export type Medication = { id: string; name: string; dose: string | null; route: string | null; frequency: string | null };
export type Snapshot = { id: string; source: string; recordedAt: string | null; medications: Medication[] };
export type MedicationChange = { medicationId: string; name: string; kind: 'added' | 'removed' | 'changed'; fields: { field: string; before: string | null; after: string | null }[] };

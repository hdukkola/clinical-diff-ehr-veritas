import type { Medication, MedicationChange, Snapshot } from './types';

/** IDs are fixture-supplied identity links, not inferred from drug names. */
export function compareSnapshots(earlier: Snapshot, later: Snapshot): MedicationChange[] {
  for (const snapshot of [earlier, later]) {
    const ids = snapshot.medications.map(m => m.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate medication ID in snapshot ${snapshot.id}`);
  }
  const old = new Map(earlier.medications.map(m => [m.id, m]));
  const current = new Map(later.medications.map(m => [m.id, m]));
  const ids = [...new Set([...old.keys(), ...current.keys()])].sort();
  const fields: (keyof Pick<Medication, 'name' | 'dose' | 'route' | 'frequency'>)[] = ['name', 'dose', 'route', 'frequency'];
  return ids.flatMap<MedicationChange>(id => {
    const before = old.get(id); const after = current.get(id);
    if (!before || !after) return [{ medicationId: id, name: (after ?? before)!.name, kind: before ? 'removed' as const : 'added' as const, fields: [] }];
    const changed = fields.filter(field => before[field] !== after[field]).map(field => ({ field, before: before[field], after: after[field] }));
    return changed.length ? [{ medicationId: id, name: after.name, kind: 'changed' as const, fields: changed }] : [];
  });
}

import { describe, expect, it } from 'vitest';
import { compareSnapshots } from './diff';
import type { Medication, Snapshot } from './types';
const med = (id: string, dose: string | null = '10 mg'): Medication => ({ id, name: id, dose, route: 'oral', frequency: 'daily' });
const snapshot = (medications: Medication[]): Snapshot => ({ id: 'test', source: 'synthetic', recordedAt: null, medications });
describe('compareSnapshots', () => {
  it('identifies additions, removals and changes in stable ID order', () => {
    const changes = compareSnapshots(snapshot([med('z'),med('b'),med('same')]), snapshot([med('a'),med('b', '20 mg'),med('same')]));
    expect(changes.map(c => [c.medicationId,c.kind])).toEqual([['a','added'],['b','changed'],['z','removed']]);
    expect(changes[1].fields).toEqual([{field:'dose',before:'10 mg',after:'20 mg'}]);
  });
  it('preserves missing values instead of inventing evidence', () => {
    expect(compareSnapshots(snapshot([med('a')]), snapshot([med('a',null)]))[0].fields).toEqual([{field:'dose',before:'10 mg',after:null}]);
  });
  it('returns no changes for identical snapshots', () => {
    expect(compareSnapshots(snapshot([med('a')]), snapshot([med('a')]))).toEqual([]);
  });
  it('rejects duplicate identities in either snapshot', () => {
    expect(() => compareSnapshots(snapshot([med('a'),med('a')]),snapshot([]))).toThrow('Duplicate medication ID');
    expect(() => compareSnapshots(snapshot([]),snapshot([med('a'),med('a')]))).toThrow('Duplicate medication ID');
  });
});

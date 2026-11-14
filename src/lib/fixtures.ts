import type { Snapshot } from './types';
export const earlier: Snapshot = { id: 's1', source: 'Fictional outpatient medication list', recordedAt: '2026-10-01', medications: [
  {id:'m1',name:'Lisinopril',dose:'10 mg',route:'oral',frequency:'daily'},
  {id:'m2',name:'Metformin',dose:'500 mg',route:'oral',frequency:'twice daily'},
  {id:'m3',name:'Aspirin',dose:'81 mg',route:'oral',frequency:'daily'},
] };
export const later: Snapshot = { id: 's2', source: 'Fictional discharge medication list', recordedAt: '2026-10-15', medications: [
  {id:'m1',name:'Lisinopril',dose:'20 mg',route:'oral',frequency:'daily'},
  {id:'m2',name:'Metformin',dose:'500 mg',route:'oral',frequency:null},
  {id:'m4',name:'Atorvastatin',dose:'20 mg',route:'oral',frequency:'daily'},
] };

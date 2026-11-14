'use client';
import { earlier, later } from '@/lib/fixtures';

export default function MedicationHistoryView() {
  return (
    <div className="panel">
      <h2>Medication history</h2>
      <p>
        Snapshot contents are shown as recorded; absence does not establish discontinuation. Missing fields are
        labeled “Not documented”.
      </p>
      {[earlier, later].map((s) => (
        <div className="record" key={s.id}>
          <h3>{s.source}</h3>
          <small>Recorded: {s.recordedAt ?? 'Not documented'}</small>
          {s.medications.map((m) => (
            <div className="med-row" key={m.id}>
              <b>{m.name}</b>
              <div className="field-row">
                <span className={m.dose ? '' : 'missing'}>Dose: {m.dose ?? 'Not documented'}</span>
                <span className={m.route ? '' : 'missing'}>Route: {m.route ?? 'Not documented'}</span>
                <span className={m.frequency ? '' : 'missing'}>
                  Frequency: {m.frequency ?? 'Not documented'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
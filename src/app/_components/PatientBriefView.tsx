'use client';
import { patientBrief } from '@/lib/patient-brief';
import { compareSnapshots } from '@/lib/diff';
import { earlier, later } from '@/lib/fixtures';

const changes = compareSnapshots(earlier, later);

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="field">
      <small>{label}</small>
      <span className={value ? '' : 'missing'}>{value ?? 'Not documented'}</span>
    </div>
  );
}

export default function PatientBriefView() {
  return (
    <div className="panel">
      <div className="patient-heading">
        <span className="avatar">ML</span>
        <div>
          <h2>{patientBrief.name}</h2>
          <p>
            {patientBrief.id} · Fictional patient · {patientBrief.age ?? 'Age not documented'} ·{' '}
            {patientBrief.sex ?? 'Not documented'}
          </p>
        </div>
      </div>

      <div className="notice">
        Longitudinal context below is synthetic. Missing or uncertain items are labeled; a difference is not a
        confirmed error.
      </div>

      <section className="brief-grid">
        <div className="card">
          <span className="eyebrow">ACTIVE MEDICATIONS</span>
          {patientBrief.activeMedications.map((m) => (
            <div className="med-row" key={m.id}>
              <b>{m.name}</b>
              <div className="field-row">
                <Field label="Dose" value={m.dose} />
                <Field label="Route" value={m.route} />
                <Field label="Frequency" value={m.frequency} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <span className="eyebrow">ACTIVE PROBLEMS</span>
          {patientBrief.activeProblems.map((p) => (
            <p key={p.name}>
              <b>{p.name}</b> · since {p.since ?? 'Not documented'}
            </p>
          ))}
          <span className="eyebrow" style={{ marginTop: 16, display: 'block' }}>
            ALLERGIES
          </span>
          {patientBrief.allergies.map((a) => (
            <p key={a.substance}>
              <b>{a.substance}</b> · {a.reaction ?? 'Reaction not documented'}
            </p>
          ))}
        </div>

        <div className="card">
          <span className="eyebrow">ENCOUNTER HISTORY</span>
          {patientBrief.encounters.map((e) => (
            <div className="record" key={e.id}>
              <b>{e.date}</b> · {e.kind}
              <p>{e.summary}</p>
              <small>Source: {e.sourceRef}</small>
            </div>
          ))}
        </div>

        <div className="card warning-card">
          <span className="eyebrow">UNRESOLVED DISCREPANCIES</span>
          {patientBrief.unresolvedDiscrepancies.length === 0 && <p>None recorded.</p>}
          {patientBrief.unresolvedDiscrepancies.map((d) => (
            <div className="record" key={d.id}>
              <b>{d.summary}</b>
              <small>Source: {d.sourceRef}</small>
            </div>
          ))}
          <p className="muted">
            {changes.length} snapshot differences exist. None establish a cause; review the source snapshots.
          </p>
        </div>
      </section>

      <section className="card">
        <span className="eyebrow">EVIDENCE &amp; SOURCE REFERENCES</span>
        <p>
          Medication statements cite the synthetic snapshot they came from ({earlier.source} → {later.source}).
          Encounter statements cite the fictional note. Claims without a source reference are shown as not
          documented.
        </p>
      </section>

      <section className="card warning-card">
        <span className="eyebrow">KNOWN GAPS</span>
        {patientBrief.missing.map((m) => (
          <p key={m}>• {m}</p>
        ))}
      </section>
    </div>
  );
}
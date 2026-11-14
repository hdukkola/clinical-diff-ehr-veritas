'use client';
import type { WorkspaceState } from '@/lib/use-workspace';

export default function CommitPreviewView({ ws }: { ws: WorkspaceState }) {
  const { audit } = ws;
  const committed = audit.filter((a) => a.decision === 'accepted' || a.decision === 'edited');
  const rejected = audit.filter((a) => a.decision === 'rejected');

  return (
    <div className="panel">
      <div className="diff-head">
        <div>
          <p className="eyebrow">COMMIT / AFTERCARE PREVIEW</p>
          <h2>Auditable demonstration decisions</h2>
          <p>
            Accepted and edited proposals produce a preview of the intended structured EHR change. This preview
            is synthetic FHIR-shaped data and is <b>not written to any EHR</b>.
          </p>
        </div>
        <span className="badge">{audit.length} decisions</span>
      </div>

      <div className="notice">
        Safety: rejected proposals do not modify chart state. Edited proposals must be revalidated before a
        preview is produced. All decisions are demonstration records only.
      </div>

      {audit.length === 0 && (
        <p className="muted">No decisions recorded yet. Accept, edit, or reject proposals in Review &amp; Clinical Diff, then commit.</p>
      )}

      <section className="two-col">
        <div>
          <h3>Intended EHR changes (accepted / edited)</h3>
          {committed.length === 0 && <p className="muted">None.</p>}
          {committed.map((a) => (
            <div className="record" key={a.id}>
              <b>
                {a.medication} · {a.decision}
                {a.revalidated ? ' · revalidated' : ''}
              </b>
              <small>
                {a.actor} · {a.at}
              </small>
              {a.fhirPreview ? (
                <pre className="fhir">{JSON.stringify(a.fhirPreview, null, 2)}</pre>
              ) : (
                <p className="missing">No preview — edited proposal not yet revalidated.</p>
              )}
            </div>
          ))}
        </div>

        <div>
          <h3>Rejected (no chart change)</h3>
          {rejected.length === 0 && <p className="muted">None.</p>}
          {rejected.map((a) => (
            <div className="record" key={a.id}>
              <b>
                {a.medication} · rejected
              </b>
              <small>
                {a.actor} · {a.at}
              </small>
              <p className="muted">No change proposed to the chart.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <span className="eyebrow">AFTERCARE NOTES</span>
        <p>
          Follow-up is clinician-owned. This demonstration records intent only and does not schedule, notify, or
          prescribe. Confirm every change against the source record before any real action.
        </p>
      </section>
    </div>
  );
}
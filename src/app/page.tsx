'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { compareSnapshots } from '@/lib/diff';
import { earlier, later } from '@/lib/fixtures';
import type { Medication } from '@/lib/types';

const sections = [
  'Dashboard',
  'Patients',
  'Patient chart',
  'Medication history',
  'Encounter timeline',
  'Clinical notes',
  'Clinical Diff',
] as const;

type Section = (typeof sections)[number];

const changes = compareSnapshots(earlier, later);

const encounters = [
  {
    date: '2026-10-15',
    summary: 'Fictional discharge record · medication list available',
  },
  {
    date: '2026-10-01',
    summary: 'Fictional outpatient record · medication list available',
  },
] as const;

export default function Home() {
  const [section, setSection] = useState<Section>('Dashboard');
  const [query, setQuery] = useState('');
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');

  const headingRef = useRef<HTMLHeadingElement>(null);
  const navButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchesMorgan =
    normalizedQuery === '' ||
    'morgan lee demo-001'.includes(normalizedQuery);
  const reviewedCount = changes.filter((c) => Boolean(decisions[c.medicationId])).length;

  function selectSection(nextSection: Section, moveFocusToHeading = false) {
    setSection(nextSection);
    setAnnouncement(`Navigated to ${nextSection}`);
    if (moveFocusToHeading) {
      requestAnimationFrame(() => {
        headingRef.current?.focus();
      });
    }
  }

  function handleNavKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let targetIndex: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      targetIndex = (index + 1) % sections.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      targetIndex = (index - 1 + sections.length) % sections.length;
    } else if (e.key === 'Home') {
      targetIndex = 0;
    } else if (e.key === 'End') {
      targetIndex = sections.length - 1;
    }

    if (targetIndex !== null) {
      e.preventDefault();
      navButtonRefs.current[targetIndex]?.focus();
    }
  }

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside aria-label="Workspace sidebar">
        <div className="brand">
          <span aria-hidden="true">✳</span> Clinical Diff
        </div>
        <p className="side-label" id="workspace-nav-label">
          WORKSPACE
        </p>
        <nav aria-labelledby="workspace-nav-label">
          {sections.map((s, index) => (
            <button
              key={s}
              ref={(el) => {
                navButtonRefs.current[index] = el;
              }}
              type="button"
              className={section === s ? 'active' : undefined}
              aria-current={section === s ? 'page' : undefined}
              onClick={() => selectSection(s, false)}
              onKeyDown={(e) => handleNavKeyDown(e, index)}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          SYNTHETIC DEMO
          <small>Retrospective review only</small>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1}>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        <header className="page-header">
          <div>
            <p className="eyebrow">CLINICAL WORKSPACE / {section.toUpperCase()}</p>
            <h1 ref={headingRef} tabIndex={-1}>
              {section}
            </h1>
          </div>
          <div className="badge">Fictional patient data</div>
        </header>

        <div className="notice" role="note" aria-label="Prototype disclaimer">
          Prototype only · Differences are observations, not confirmed errors or treatment recommendations.
        </div>

        {section === 'Dashboard' && (
          <section aria-labelledby="dashboard-heading">
            <div className="intro">
              <div>
                <p className="eyebrow">WELCOME TO CLINICAL DIFF</p>
                <h2 id="dashboard-heading">A clearer view of the clinical story.</h2>
                <p>
                  Review the record in context, then inspect medication differences alongside their sources.
                </p>
                <button
                  type="button"
                  className="primary"
                  onClick={() => selectSection('Patients', true)}
                >
                  Explore patients <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="intro-mark" aria-hidden="true">
                ✳
              </div>
            </div>

            <div className="cards">
              <article className="card">
                <span>DEMO PATIENTS</span>
                <strong>1</strong>
                <p>Fictional chart available</p>
              </article>
              <article className="card">
                <span>RECORD COMPARISON</span>
                <strong>{changes.length}</strong>
                <p>Differences to review</p>
              </article>
              <article className="card">
                <span>WORKFLOW</span>
                <strong>Review</strong>
                <p>Clinician interpretation required</p>
              </article>
            </div>
          </section>
        )}

        {section === 'Patients' && (
          <section className="panel" aria-labelledby="patients-heading">
            <h2 id="patients-heading">Patient directory</h2>
            <p>Search the fictional demonstration record.</p>

            <div className="search-group">
              <label className="field-label" htmlFor="patient-search">
                Search patients
              </label>
              <div className="search-controls">
                <input
                  id="patient-search"
                  type="search"
                  placeholder="Search by name or ID"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query !== '' && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setQuery('')}
                  >
                    Clear search
                  </button>
                )}
              </div>
            </div>

            <p className="sr-only" role="status" aria-live="polite">
              {matchesMorgan
                ? '1 patient shown: Morgan Lee, DEMO-001.'
                : 'No patients match your search.'}
            </p>

            {matchesMorgan ? (
              <button
                type="button"
                className="patient-row"
                onClick={() => selectSection('Patient chart', true)}
              >
                <span className="avatar" aria-hidden="true">
                  ML
                </span>
                <span className="patient-row-meta">
                  <b>Morgan Lee</b>
                  <small>DEMO-001 · Fictional patient</small>
                </span>
                <span className="patient-row-action">
                  Open chart <span aria-hidden="true">→</span>
                </span>
              </button>
            ) : (
              <div className="empty-state" role="status">
                No synthetic patients match &ldquo;{query.trim()}&rdquo;. Clear the search to view Morgan Lee.
              </div>
            )}
          </section>
        )}

        {section === 'Patient chart' && (
          <section className="panel" aria-labelledby="chart-heading">
            <div className="patient-heading">
              <span className="avatar" aria-hidden="true">
                ML
              </span>
              <div>
                <h2 id="chart-heading">Morgan Lee</h2>
                <p>DEMO-001 · Fictional patient</p>
              </div>
            </div>
            <p>
              This demonstration chart contains synthetic medication snapshots and illustrative encounter context.
            </p>
            <div className="actions">
              <button type="button" onClick={() => selectSection('Medication history', true)}>
                Medication history <span aria-hidden="true">→</span>
              </button>
              <button type="button" onClick={() => selectSection('Encounter timeline', true)}>
                Encounter timeline <span aria-hidden="true">→</span>
              </button>
              <button type="button" onClick={() => selectSection('Clinical notes', true)}>
                Clinical notes <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => selectSection('Clinical Diff', true)}
              >
                Review Clinical Diff <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        )}

        {section === 'Medication history' && (
          <section className="panel" aria-labelledby="med-history-heading">
            <h2 id="med-history-heading">Medication history</h2>
            <p>Snapshot contents are shown as recorded; absence does not establish discontinuation.</p>

            <div className="snapshots-grid">
              {[earlier, later].map((s) => (
                <section className="snapshot-card" key={s.id} aria-labelledby={`snapshot-heading-${s.id}`}>
                  <h3 id={`snapshot-heading-${s.id}`}>{s.source}</h3>
                  <p className="snapshot-meta">
                    Recorded:{' '}
                    {s.recordedAt ? (
                      <time dateTime={s.recordedAt}>{s.recordedAt}</time>
                    ) : (
                      <span className="missing">Not documented</span>
                    )}
                  </p>

                  <ul className="med-list">
                    {s.medications.map((m) => (
                      <li className="med-item" key={m.id}>
                        <strong className="med-name">{m.name}</strong>
                        <MedicationAttributes medication={m} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <button
              type="button"
              className="primary"
              onClick={() => selectSection('Clinical Diff', true)}
            >
              Compare snapshots <span aria-hidden="true">→</span>
            </button>
          </section>
        )}

        {section === 'Encounter timeline' && (
          <section className="panel" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading">Encounter timeline</h2>
            <ol className="timeline-list">
              {encounters.map((enc) => (
                <li className="record" key={enc.date}>
                  <time dateTime={enc.date}>{enc.date}</time>
                  <p>{enc.summary}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {section === 'Clinical notes' && (
          <section className="panel" aria-labelledby="notes-heading">
            <h2 id="notes-heading">Clinical notes</h2>
            <p>
              No supporting clinical note is available in this synthetic fixture. The reason for the differences is
              unknown.
            </p>
          </section>
        )}

        {section === 'Clinical Diff' && (
          <section aria-labelledby="diff-heading">
            <div className="diff-head">
              <div>
                <p className="eyebrow">MORGAN LEE · DEMO-001</p>
                <h2 id="diff-heading">Medication comparison</h2>
                <p>Compare source snapshots and document a review decision.</p>
              </div>
              <div className="badge-group">
                <span className="badge">{changes.length} differences</span>
                <span className="badge badge-neutral" aria-live="polite">
                  {reviewedCount} of {changes.length} reviewed
                </span>
              </div>
            </div>

            <div className="diff-toolbar">
              <button
                type="button"
                className="primary"
                onClick={() => selectSection('Medication history', true)}
              >
                View source snapshots <span aria-hidden="true">→</span>
              </button>
            </div>

            <section aria-label="Source snapshots">
              <div className="sources">
                <dl className="source-item">
                  <dt>EARLIER SOURCE</dt>
                  <dd>
                    <strong>{earlier.source}</strong>
                    <span>
                      {earlier.recordedAt ? (
                        <time dateTime={earlier.recordedAt}>{earlier.recordedAt}</time>
                      ) : (
                        'Timestamp not documented'
                      )}
                    </span>
                  </dd>
                </dl>
                <span className="arrow" aria-hidden="true">
                  →
                </span>
                <dl className="source-item">
                  <dt>LATER SOURCE</dt>
                  <dd>
                    <strong>{later.source}</strong>
                    <span>
                      {later.recordedAt ? (
                        <time dateTime={later.recordedAt}>{later.recordedAt}</time>
                      ) : (
                        'Timestamp not documented'
                      )}
                    </span>
                  </dd>
                </dl>
              </div>
            </section>

            <div className="notice warning" role="note" aria-label="Evidence limitation">
              Evidence is incomplete: no authorization or rationale is included in these fixtures. A difference alone
              does not establish an error.
            </div>

            <section className="diff-list" aria-label="Medication differences">
              {changes.map((c) => {
                const selectId = `decision-${c.medicationId}`;
                const headingId = `diff-med-${c.medicationId}`;
                const snapshotMed =
                  c.fields.length === 0
                    ? (c.kind === 'added' ? later : earlier).medications.find(
                        (item) => item.id === c.medicationId,
                      )
                    : undefined;

                return (
                  <article
                    className={`diff-card diff-card-${c.kind}`}
                    key={c.medicationId}
                    aria-labelledby={headingId}
                  >
                    <div className="diff-title">
                      <div className="diff-title-main">
                        <span className={`tag tag-${c.kind}`}>{c.kind.toUpperCase()}</span>
                        <h3 id={headingId}>{c.name}</h3>
                      </div>

                      <div className="decision-control">
                        <label htmlFor={selectId}>Review decision</label>
                        <select
                          id={selectId}
                          aria-label={`Review decision for ${c.name}`}
                          value={decisions[c.medicationId] ?? ''}
                          onChange={(e) =>
                            setDecisions((prev) => ({
                              ...prev,
                              [c.medicationId]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Not reviewed</option>
                          <option>Reviewed — no conclusion</option>
                          <option>Needs more evidence</option>
                          <option>Discuss with care team</option>
                        </select>
                      </div>
                    </div>

                    {c.fields.length > 0 ? (
                      <table className="diff-table" aria-label={`Field changes for ${c.name}`}>
                        <thead>
                          <tr>
                            <th scope="col">Field</th>
                            <th scope="col">Earlier snapshot</th>
                            <th scope="col">Later snapshot</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.fields.map((f) => (
                            <tr key={f.field}>
                              <td className="field-name" data-label="Field">
                                {f.field}
                              </td>
                              <td data-label="Earlier snapshot">
                                {f.before ?? <span className="missing">Not documented</span>}
                              </td>
                              <td data-label="Later snapshot">
                                {f.after ?? <span className="missing">Not documented</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div>
                        <p>
                          {c.kind === 'added'
                            ? 'Absent from the earlier snapshot; present in the later snapshot.'
                            : 'Present in the earlier snapshot; absent from the later snapshot.'}{' '}
                          This does not establish when or why the record changed.
                        </p>
                        {snapshotMed && <MedicationAttributes medication={snapshotMed} />}
                      </div>
                    )}

                    <small className="diff-sources">
                      Sources: {earlier.source}; {later.source}. No further evidence provided.
                    </small>
                  </article>
                );
              })}
            </section>

            <p className="footnote">
              Review selections are temporary and reset when the page is reloaded. They are not an audit trail.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

/** Displays recorded dose, route, and frequency attributes for a synthetic medication record. */
function MedicationAttributes({ medication }: { medication: Medication }) {
  const fields: { label: string; value: string | null; fallback: string }[] = [
    { label: 'Dose', value: medication.dose, fallback: 'Dose not documented' },
    { label: 'Route', value: medication.route, fallback: 'Route not documented' },
    { label: 'Frequency', value: medication.frequency, fallback: 'Frequency not documented' },
  ];

  return (
    <dl className="med-attrs">
      {fields.map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value ?? <span className="missing">{field.fallback}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

'use client';
import { useState } from 'react';
import { useWorkspace } from '@/lib/use-workspace';
import PatientBriefView from './_components/PatientBriefView';
import EncounterWorkspaceView from './_components/EncounterWorkspaceView';
import ReviewDiffView from './_components/ReviewDiffView';
import CommitPreviewView from './_components/CommitPreviewView';
import MedicationHistoryView from './_components/MedicationHistoryView';

const sections = [
  'Dashboard',
  'Patient Brief',
  'Encounter Workspace',
  'Review & Clinical Diff',
  'Commit / Aftercare',
  'Medication history',
] as const;
type Section = (typeof sections)[number];

export default function Home() {
  const ws = useWorkspace();
  const [section, setSection] = useState<Section>('Dashboard');
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span>✳</span> Clinical Diff
        </div>
        <p className="side-label">WORKSPACE</p>
        <nav>
          {sections.map((s) => (
            <button
              key={s}
              className={section === s ? 'active' : ''}
              onClick={() => setSection(s)}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          AI PROPOSES · HUMANS COMMIT
          <br />
          <small>Synthetic demonstration only</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">CLINICAL WORKSPACE / {section.toUpperCase()}</div>
            <h1>{section}</h1>
          </div>
          <div className="badge">Fictional patient data</div>
        </header>
        <div className="notice">
          Prototype only. AI proposals are not orders. Differences are observations, not confirmed errors or
          treatment recommendations.
        </div>

        {section === 'Dashboard' && <Dashboard onNavigate={setSection} />}
        {section === 'Patient Brief' && <PatientBriefView />}
        {section === 'Encounter Workspace' && <EncounterWorkspaceView ws={ws} />}
        {section === 'Review & Clinical Diff' && <ReviewDiffView ws={ws} />}
        {section === 'Commit / Aftercare' && <CommitPreviewView ws={ws} />}
        {section === 'Medication history' && <MedicationHistoryView />}
      </main>
    </div>
  );
}

function Dashboard({ onNavigate }: { onNavigate: (s: Section) => void }) {
  return (
    <>
      <div className="intro">
        <div>
          <p className="eyebrow">AI-ASSISTED MEDICATION REVIEW</p>
          <h2>A clearer view of the clinical story.</h2>
          <p>
            Review the longitudinal brief, work the encounter, inspect structured proposals with evidence, and
            preview auditable decisions. The existing EHR stays the system of record; nothing here writes to it.
          </p>
          <button className="primary" onClick={() => onNavigate('Patient Brief')}>
            Start with the patient brief →
          </button>
        </div>
        <div className="intro-mark">✳</div>
      </div>
      <div className="cards">
        <div className="card">
          <span>WORKFLOW</span>
          <strong>4 surfaces</strong>
          <p>Brief → Encounter → Review → Commit</p>
        </div>
        <div className="card">
          <span>SAFETY MODEL</span>
          <strong>Propose / Commit</strong>
          <p>Humans accept, edit, or reject</p>
        </div>
        <div className="card">
          <span>DATA</span>
          <strong>Synthetic</strong>
          <p>Fictional patient and notes</p>
        </div>
      </div>
    </>
  );
}
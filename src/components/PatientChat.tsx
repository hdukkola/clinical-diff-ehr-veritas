'use client';

import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type FormEvent, type Ref, type SetStateAction } from 'react';
import type { SyntheticScenario } from '@/lib/fixtures';
import {
  applyChartCorrections,
  chartCorrectionsFor,
  chartReply,
  type ChartAspect,
  type ChartCorrection,
  type ChartReply,
  type CorrectableField,
} from '@/lib/patient-chat';

type ChatTurn = { question: string; answer: ChartReply };
export type ChatThreads = Record<string, ChatTurn[]>;
type WidgetPage = { id: string; label: string };
type WidgetChange = { pageId: string; before: string; value: string };
type Proposal = { kind: 'chart'; change: ChartCorrection } | { kind: 'widget'; change: WidgetChange };
const cloudChat = process.env.NEXT_PUBLIC_CLINICAL_DIFF_CLOUD_CHAT === '1';
const fields: CorrectableField[] = ['dose', 'route', 'frequency'];
const shortName = (chart: SyntheticScenario) => chart.patientLabel.replace(/\s*\(Synthetic.*\)$/, '');

function ReplyText({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <p>{text}</p>;
  const words = text.match(/\S+\s*|\s+/g) ?? [];
  const step = Math.min(24, 400 / Math.max(1, words.length - 1));
  return <p className="patient-chat-reply-typing">{words.map((word, index) => (
    <span key={index} style={{ '--reply-word-delay': `${index * step}ms` } as CSSProperties}>{word}</span>
  ))}</p>;
}

export function PatientChat({
  charts, chart, allowModelFollowUp, onChartChange, aspect, onAspectChange, corrections, widgetPages, widgetNotes,
  onChartApproval, onWidgetApproval, openWidgetPage, headingRef, threads, setThreads,
}: {
  charts: SyntheticScenario[];
  chart: SyntheticScenario;
  allowModelFollowUp: boolean;
  onChartChange: (chartId: string) => void;
  aspect: ChartAspect;
  onAspectChange: (aspect: ChartAspect) => void;
  corrections: ChartCorrection[];
  widgetPages: WidgetPage[];
  widgetNotes: Readonly<Partial<Record<string, string>>>;
  onChartApproval: (change: ChartCorrection) => void;
  onWidgetApproval: (change: WidgetChange) => void;
  openWidgetPage?: string;
  headingRef: Ref<HTMLHeadingElement>;
  threads: ChatThreads;
  setThreads: Dispatch<SetStateAction<ChatThreads>>;
}) {
  const [question, setQuestion] = useState('');
  const [edit, setEdit] = useState<'chart' | 'widget' | null>(openWidgetPage ? 'widget' : null);
  const [medicationHint, setMedicationHint] = useState('');
  const [draft, setDraft] = useState<ChartReply['draft']>();
  const [proposalVersion, setProposalVersion] = useState(0);
  const [status, setStatus] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [animatedTurn, setAnimatedTurn] = useState<ChatTurn>();
  const pending = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const threadKey = `${chart.id}:${aspect}`;
  const turns = threads[threadKey] ?? [];
  const checking = Boolean(pendingQuestion);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [threadKey, animatedTurn, checking]);

  function switchContext() {
    pending.current?.abort();
    pending.current = null;
    setPendingQuestion('');
    setAnimatedTurn(undefined);
    setQuestion('');
    setEdit(null);
    setMedicationHint('');
    setDraft(undefined);
    setStatus('');
  }

  function openProposal(kind: 'chart' | 'widget', answer?: ChartReply) {
    setEdit(kind);
    setMedicationHint(answer?.medication ?? '');
    setDraft(answer?.draft);
    setStatus('');
    setProposalVersion((version) => version + 1);
    requestAnimationFrame(() => document.getElementById('chat-proposal-title')?.focus());
  }

  async function ask(value: string) {
    const text = value.trim();
    if (!text || checking || pending.current) return;
    let answer = chartReply(chart, aspect, text, corrections, turns.at(-1)?.answer.medication);
    setQuestion('');
    if (answer.clarify && allowModelFollowUp && (cloudChat || ['localhost', '127.0.0.1'].includes(window.location.hostname))) {
      const controller = new AbortController();
      pending.current = controller;
      setPendingQuestion(text);
      try {
        const response = await fetch('/api/patient-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(9000)]),
        });
        if (response.ok) {
          const { focus } = await response.json();
          const prompt = focus === 'medication' ? 'What exact medication should I look for?'
            : focus === 'timing' ? 'Which encounter or date are you asking about?'
            : focus === 'source' ? 'Which chart source should I check?'
            : null;
          if (prompt) answer = { modelAssisted: true, text: `${prompt} ${answer.text}` };
        }
      } catch {
        // The chart assistant can still ask for clarification if the model is unavailable.
      } finally {
        if (pending.current === controller) {
          pending.current = null;
          setPendingQuestion('');
        }
      }
      if (controller.signal.aborted) return;
    }
    const turn = { question: text, answer };
    setAnimatedTurn(turn);
    setThreads((current) => ({ ...current, [threadKey]: [...(current[threadKey] ?? []).slice(-19), turn] }));
    if (answer.edit) openProposal(answer.edit, answer);
  }

  function approve(proposal: Proposal) {
    if (proposal.kind === 'chart') onChartApproval(proposal.change);
    else onWidgetApproval(proposal.change);
    setEdit(null);
    setStatus(proposal.kind === 'chart'
      ? 'Correction applied to this demo chart. The original record is preserved.'
      : 'Page note updated after review.');
  }

  return (
    <section className="patient-chat" aria-label="AI chat">
      <header>
        <h1 className="h1" ref={headingRef} id="patient-chat-title" tabIndex={-1}>AI chat</h1>
        <p>Demo chart assistant · Fictional records only</p>
        {cloudChat && allowModelFollowUp && <p>Cloud Qwen may process your question to help ask a follow-up. Do not enter real patient information.</p>}
      </header>
      <div className="patient-chat-context">
        <label>Patient
          <select id="chat-patient-select" value={chart.id} onChange={(event) => {
            switchContext();
            onChartChange(event.target.value);
          }}>
            {charts.map((item) => (
              <option key={item.id} value={item.id}>{shortName(item)} · {item.patientId}</option>
            ))}
          </select>
        </label>
        <label>Record scope
          <select id="chat-scope-select" value={aspect} onChange={(event) => {
            switchContext();
            onAspectChange(event.target.value as ChartAspect);
          }}>
            <option value="timeline">Both medication snapshots</option>
            <option value="earlier">Earlier snapshot</option>
            <option value="later">Later snapshot</option>
            <option value="encounters">Encounter dates and sources</option>
          </select>
        </label>
      </div>
      <p className="patient-chat-scope"><strong>{shortName(chart)} · {chart.patientId}</strong> · {chart.title}</p>

      <div className="patient-chat-log" ref={logRef} role="log" aria-label={`Conversation for ${shortName(chart)}`}>
        {turns.length === 0 && !checking && <p>Ask what the record documents. For a medication decision, confirm the details with the treating clinician or pharmacist.</p>}
        {turns.map((turn, index) => {
          const { answer } = turn;
          return (
            <div className="patient-chat-turn" key={index}>
              <p className="patient-chat-question">{turn.question}</p>
              <div className="patient-chat-answer">
                <ReplyText text={answer.text} animate={turn === animatedTurn} />
                {answer.modelAssisted && <small>{cloudChat ? 'Cloud Qwen' : 'Local Qwen'} assisted with this follow-up.</small>}
                {!!answer.evidence?.length && (
                  <ul aria-label="Chart sources">
                    {answer.evidence.map(({ source, date, medication, corrections }, i) => (
                      <li key={i}>
                        <strong>{medication.name}</strong> · {medication.dose ?? 'Dose undocumented'} · {medication.route ?? 'Route undocumented'} · {medication.frequency ?? 'Frequency undocumented'}
                        <small>{source} · {date ?? 'Undated'}</small>
                        {corrections.map((item, j) => (
                          <small key={j}>Reviewed {item.field} correction from {item.before || 'undocumented'} to {item.value} · Source: {item.source}</small>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
        {checking && <div className="patient-chat-turn" aria-hidden="true">
          <p className="patient-chat-question">{pendingQuestion}</p>
          <p className="patient-chat-answer patient-chat-thinking">Checking for a follow-up…</p>
        </div>}
      </div>

      <form className="patient-chat-compose" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
        <label htmlFor="patient-chat-question">Ask about {shortName(chart)}</label>
        <input id="patient-chat-question" value={question} maxLength={500}
          placeholder="What medications are documented?" onChange={(event) => setQuestion(event.target.value)} />
        <button className="btn primary" disabled={!question.trim() || checking}>{checking ? 'Checking…' : 'Send'}</button>
      </form>
      <div className="patient-chat-actions">
        <button className="btn" type="button" disabled={checking}
          onClick={() => void ask(aspect === 'encounters' ? 'Show encounter dates' : 'Show medication list')}>
          {aspect === 'encounters' ? 'Show encounter dates' : 'Show medication list'}
        </button>
        <button className="btn" type="button" onClick={() => openProposal('chart')}>Propose chart correction</button>
        <button className="btn" type="button" onClick={() => openProposal('widget')}>Propose widget edit</button>
      </div>
      <p role="status" className="patient-chat-status">{checking ? <span className="sr-only">Checking for a follow-up.</span> : status}</p>

      {edit && <EditProposal key={`${threadKey}:${proposalVersion}`} kind={edit}
        chart={chart} aspect={aspect} corrections={corrections} medicationHint={medicationHint}
        widgetPages={widgetPages} widgetNotes={widgetNotes} openWidgetPage={openWidgetPage} draft={draft}
        onApprove={approve} onCancel={() => { setEdit(null); setStatus('Proposal discarded.'); }} />}
    </section>
  );
}

function EditProposal({
  kind, chart, aspect, corrections, medicationHint, widgetPages, widgetNotes, openWidgetPage, draft, onApprove, onCancel,
}: {
  kind: Proposal['kind'];
  chart: SyntheticScenario;
  aspect: ChartAspect;
  corrections: ChartCorrection[];
  medicationHint: string;
  widgetPages: WidgetPage[];
  widgetNotes: Readonly<Partial<Record<string, string>>>;
  openWidgetPage?: string;
  draft?: ChartReply['draft'];
  onApprove: (proposal: Proposal) => void;
  onCancel: () => void;
}) {
  const [scope, setScope] = useState<'earlier' | 'later'>(aspect === 'earlier' ? 'earlier' : 'later');
  const snapshot = chart[scope];
  const [medicationId, setMedicationId] = useState(snapshot.medications.find((med) => med.name === medicationHint)?.id ?? '');
  const [field, setField] = useState<CorrectableField>(draft?.field ?? 'dose');
  const [pageId, setPageId] = useState(draft?.page
    ? widgetPages.find((page) => page.label.toLowerCase() === draft.page?.toLowerCase())?.id ?? ''
    : openWidgetPage ?? '');
  const [value, setValue] = useState(draft?.value.slice(0, kind === 'chart' ? 40 : 240) ?? '');
  const [source, setSource] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const med = snapshot.medications.find((entry) => entry.id === medicationId);
  const chartBefore = med ? applyChartCorrections(med, chartCorrectionsFor(corrections, chart.id, snapshot.id, med.id))[field] ?? '' : '';
  const before = kind === 'chart' ? chartBefore : widgetNotes[pageId] ?? '';

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const proposed = value.trim();
    if (!proposed || proposed === before) return;
    if (kind === 'chart') {
      if (!med || !source.trim()) return;
      setProposal({ kind, change: { scenarioId: chart.id, snapshotId: snapshot.id, medicationId: med.id, field, before, value: proposed, source: source.trim() } });
    } else {
      if (!pageId) return;
      setProposal({ kind, change: { pageId, before, value: proposed } });
    }
    setConfirmed(false);
  }

  return (
    <section className="patient-chat-review" aria-labelledby="chat-proposal-title">
      <h2 id="chat-proposal-title" tabIndex={-1}>{kind === 'chart' ? 'Chart correction' : 'Widget note'}</h2>
      {proposal ? (
        <>
          <p className="patient-chat-scope">
            {proposal.kind === 'chart'
              ? `${shortName(chart)} · ${chart.patientId} · ${snapshot.source} · ${snapshot.recordedAt ?? 'Undated'} · ${med?.name} ${field}`
              : `${shortName(chart)} · ${chart.patientId} · ${widgetPages.find((page) => page.id === pageId)?.label} · Page note`}
          </p>
          <dl>
            <dt>Current</dt><dd>{proposal.change.before || 'Undocumented'}</dd>
            <dt>Proposed</dt><dd>{proposal.change.value}</dd>
            {proposal.kind === 'chart' && <><dt>Source to verify</dt><dd>{proposal.change.source}</dd></>}
          </dl>
          <label className="patient-chat-confirm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            {kind === 'chart'
              ? 'I verified the patient, record and corrected value against the source.'
              : 'I checked the target page and the proposed note.'}
          </label>
          <div className="patient-chat-actions">
            <button type="button" className="btn" onClick={() => { setProposal(null); setConfirmed(false); }}>Edit proposal</button>
            <button type="button" className="btn" onClick={onCancel}>Reject</button>
            <button type="button" className="btn primary" disabled={!confirmed}
              onClick={() => { if (confirmed) onApprove(proposal); }}>Approve and apply</button>
          </div>
        </>
      ) : (
        <form onSubmit={preview}>
          {kind === 'chart' ? (
            <>
              <p>Correct a transcription in this demo chart using a source you can verify. Medication orders stay in the clinical system.</p>
              <div className="patient-chat-context">
                <label>Record
                  <select value={scope} onChange={(event) => {
                    setScope(event.target.value as 'earlier' | 'later');
                    setMedicationId('');
                  }}>
                    <option value="earlier">Earlier · {chart.earlier.recordedAt ?? 'Undated'}</option>
                    <option value="later">Later · {chart.later.recordedAt ?? 'Undated'}</option>
                  </select>
                </label>
                <label>Medication
                  <select required value={medicationId} onChange={(event) => setMedicationId(event.target.value)}>
                    <option value="">Select medication</option>
                    {snapshot.medications.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                  </select>
                </label>
                <label>Field
                  <select value={field} onChange={(event) => setField(event.target.value as CorrectableField)}>
                    {fields.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <label>Source reference<input required maxLength={160} value={source} onChange={(event) => setSource(event.target.value)} /></label>
            </>
          ) : (
            <label>Target page
              <select required value={pageId} onChange={(event) => setPageId(event.target.value)}>
                <option value="">Select a page</option>
                {widgetPages.map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
              </select>
            </label>
          )}
          <label>{kind === 'chart' ? 'Documented value' : 'Proposed note'}
            <input required maxLength={kind === 'chart' ? 40 : 240} value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <div className="patient-chat-actions">
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn primary" disabled={!value.trim() || value.trim() === before || (kind === 'chart' && (!med || !source.trim()))}>Review proposal</button>
          </div>
        </form>
      )}
    </section>
  );
}

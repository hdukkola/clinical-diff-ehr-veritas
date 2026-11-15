import type { Metadata } from 'next';
import {
  WidgetGrid,
  WidgetShell,
  STATE_META,
  type WidgetState,
} from '@/design/widget-shell/WidgetShell';
import {
  CompletenessBarsBody,
  DonutBody,
  EvidenceListBody,
  MetricBody,
  ShortcutsBody,
  TimelineBody,
} from '@/design/widget-shell/ExampleBodies';
import { MOCK_PATIENT, PAGE_WIDGET_MATRIX } from '@/design/widget-shell/mock-data';

export const metadata: Metadata = {
  title: 'Widget design preview (mock)',
  robots: { index: false, follow: false },
};

const ALL_STATES: WidgetState[] = [
  'ready',
  'loading',
  'empty',
  'unavailable',
  'error',
  'stale',
  'partial',
  'restricted',
];

/**
 * DESIGN-SONNET-001 preview. Static mock: nothing here reads app state,
 * calls a model, or performs an action.
 */
export default function DesignPreviewPage() {
  return (
    <main className="wsp-page" id="main-content">
      <p className="wsp-banner" role="note">
        Design mock for review — fictional data for {MOCK_PATIENT.label} ({MOCK_PATIENT.id}). Controls are
        disabled and nothing here is wired to the app, a model, or clinical logic. Each widget is labelled
        Current, Proposed, or Mock data.
      </p>
      <h1>Reusable widget shell and Patient Home concept</h1>
      <p className="wsp-lede">
        One shell with four widths on the existing 12-column grid (compact 3, standard 6, wide 9, full 12), a
        tall variant, and eight explicit states. Resize and reorder are concepts only and are not simulated.
      </p>

      <h2>1. Width and height variants</h2>
      <p className="wsp-lede">Same shell, same slots: header, context and status, body, footer with source and action.</p>
      <WidgetGrid label="Width and height variants">
        <WidgetShell
          id="v-compact"
          title="Open review items"
          icon="◧"
          span="compact"
          provenance="mocked"
          context={`${MOCK_PATIENT.label}`}
          source="Mock review fixture"
          freshness="Mock — not measured"
          actionLabel="Open queue"
        >
          <MetricBody value={7} denominator={12} label="Awaiting a reviewer decision" note="Denominator: all 12 changes for this patient." />
        </WidgetShell>
        <WidgetShell
          id="v-standard"
          title="Review status"
          icon="◔"
          span="standard"
          provenance="mocked"
          context="Parts of one defined whole: 12 changes"
          source="Mock review fixture"
          freshness="Mock — not measured"
          actionLabel="Open Snapshot review"
        >
          <DonutBody />
        </WidgetShell>
        <WidgetShell
          id="v-tall"
          title="Encounter timeline"
          icon="≡"
          span="compact"
          height="tall"
          provenance="mocked"
          context="Oldest first · includes undated records separately"
          source="Mock encounter fixture"
          freshness="Mock — not measured"
          actionLabel="Open encounter"
        >
          <TimelineBody />
        </WidgetShell>
        <WidgetShell
          id="v-wide"
          title="Recent source-backed changes"
          icon="⇄"
          span="wide"
          provenance="proposed"
          context="Unknown is shown as unknown; absent is not treated as stopped"
          source="Mock snapshot comparison"
          freshness="Mock — not measured"
          actionLabel="Open change explorer"
        >
          <EvidenceListBody />
        </WidgetShell>
        <WidgetShell
          id="v-full"
          title="Data completeness"
          icon="▤"
          span="full"
          provenance="proposed"
          context="Counts against a shared denominator of 12 medication entries"
          source="Mock completeness calculation"
          freshness="Mock — not measured"
          actionLabel="Show affected items"
        >
          <CompletenessBarsBody />
        </WidgetShell>
      </WidgetGrid>

      <h2>2. States</h2>
      <p className="wsp-lede">
        Every state has a glyph and a text label in addition to colour. Stale and partial keep the content and add a
        banner; the others replace it.
      </p>
      <WidgetGrid label="Widget states">
        {ALL_STATES.map((state) => (
          <WidgetShell
            key={state}
            id={`s-${state}`}
            title={`State: ${STATE_META[state].label}`}
            span="compact"
            state={state}
            provenance="mocked"
            source="Mock state fixture"
            actionLabel={state === 'error' ? 'Retry' : undefined}
          >
            <MetricBody value={9} denominator={12} label="Fields present" note="3 fields missing." />
          </WidgetShell>
        ))}
      </WidgetGrid>

      <h2>3. Patient Home concept</h2>
      <p className="wsp-lede">
        Concise cross-page summaries that link into the richer page widgets rather than duplicating them. The set is
        customizable in concept only.
      </p>
      <WidgetGrid label="Patient Home concept">
        <WidgetShell id="h-open" title="Open review items" icon="◧" span="compact" provenance="mocked" source="Mock review fixture" freshness="Mock" actionLabel="Open queue">
          <MetricBody value={7} denominator={12} label="Awaiting a decision" note="2 flagged for follow-up." />
        </WidgetShell>
        <WidgetShell id="h-short" title="Shortcuts" icon="➜" span="compact" provenance="proposed" source="App navigation (not wired)" freshness="Mock">
          <ShortcutsBody />
        </WidgetShell>
        <WidgetShell id="h-status" title="Review status" icon="◔" span="standard" provenance="mocked" source="Mock review fixture" freshness="Mock" actionLabel="Open Snapshot review">
          <DonutBody />
        </WidgetShell>
        <WidgetShell id="h-changes" title="Recent source-backed changes" icon="⇄" span="wide" provenance="proposed" source="Mock snapshot comparison" freshness="Mock" actionLabel="Open change explorer">
          <EvidenceListBody />
        </WidgetShell>
        <WidgetShell id="h-enc" title="Encounter timeline" icon="≡" span="compact" provenance="mocked" source="Mock encounter fixture" freshness="Mock" actionLabel="Open encounter">
          <TimelineBody />
        </WidgetShell>
      </WidgetGrid>

      <h2>4. Page-to-widget matrix</h2>
      <p className="wsp-lede">Page names are the existing app pages; Home and the longitudinal view are proposed.</p>
      <div className="wsp-matrix-wrap">
        <table className="wsp-matrix">
          <caption className="sr-only">Pages, primary actions, widgets, and build status</caption>
          <thead>
            <tr>
              <th scope="col">Page</th>
              <th scope="col">Primary action</th>
              <th scope="col">Widgets</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {PAGE_WIDGET_MATRIX.map((row) => (
              <tr key={row.page}>
                <th scope="row">{row.page}</th>
                <td>{row.primaryAction}</td>
                <td>{row.widgets.join(' · ')}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

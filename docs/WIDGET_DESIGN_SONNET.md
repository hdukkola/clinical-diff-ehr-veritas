# Widget design: page-specific layouts and the reusable widget shell

**Task:** `DESIGN-SONNET-001` · **Branch:** `design/sonnet-widget-shell` (from `59a46df`) · **Status:** design delivered for review; nothing here is deployed or wired.

**Design route used:** Claude Sonnet 5.5 (Medium), selected by the user in the Antigravity session settings. I have not verified access to any other Sonnet route.

**Preview:** run `npm run dev` and open `/design-preview`. The preview is a static React/TypeScript mock using fictional data for "Morgan Lee (Synthetic)" (DEMO-001). All controls are disabled. Nothing reads app state, calls a model, or writes data.

**Labels used in this document and the preview**

- **Current:** exists in the app today.
- **Proposed:** a design that needs engineering.
- **Mocked:** appears only in the preview, with invented values.

---

## 1. What I audited

**Pages (`VIEW_NAMES` in `src/app/page.tsx`):** Compare notes, Snapshot review, Review suggestions, Evaluations, Session activity, Models & data.

**Existing widgets (`CockpitWidgetId`):** `diff-breakdown`, `review-progress`, `provenance-health`, `triage-queue`, `model-socket`, `eval-metrics`, `session-activity`. These render on every page today as one shared dashboard. That repetition is the main problem this design addresses.

**Existing contracts (`src/lib/cockpit.ts`):**

- `WidgetDefinition` already has `supportedSizes`, `defaultSize`, `minDimensions`, `maxDimensions`, `dataDependencies`, `requiredPermissions`, `refreshStrategy`, `supportedActions`, `safetyRequirements`.
- `WidgetInstance` already has `position`, `isVisible`, `isMinimized`, `lastRefreshed`, `error`.
- `WidgetSize` is `small | medium | large | full`, on a 12-column grid (`GRID_COLUMN_COUNT = 12`).
- Presets today: `default-ambulatory` and `medication-reconciliation`.

**Backlog (`docs/EHR_WIDGET_BACKLOG.md`):** 100 items. I treated it as an input, not a target. Many items are specialty surfaces (ICU, dental, labor and delivery) for which the app has no real data. Several of those would be near-duplicate tables.

**Preserve:** Graphite palette tokens, the 12-column grid, drag/keyboard/touch reorder, evidence drill-down, and the audit trail.

---

## 2. Product direction

A reviewer opens a patient and needs to answer three questions: what changed, where is the source, and what needs follow-up. Widgets earn their place only if they help with one of those. The first release should be about 20 purposeful widgets spread over the pages, not 100.

**Rule of thumb:** a widget needs (a) a decision or action it supports, (b) a named source, and (c) an honest state when data is missing.

---

## 3. Reusable widget shell

Implemented as `src/design/widget-shell/WidgetShell.tsx` and previewed at `/design-preview`. **Mocked.**

### 3.1 Slots

| Slot | Content |
|---|---|
| Header | Title, optional decorative icon, a provenance chip (Current / Proposed / Mock data) and a state chip |
| Context | One line: patient, period, scope |
| Body | One of: metric, chart, list, timeline, evidence. Scrolls inside the widget if long |
| Footer | **Source** (required), freshness, and one action |

### 3.2 Variants

| Span | Columns | Existing `WidgetSize` | Min width | Typical use |
|---|---|---|---|---|
| compact | 3 | `small` | 220 px | One metric, shortcuts |
| standard | 6 | `medium` | grid cell | Chart, short list |
| wide | 9 | `large` | grid cell | Evidence list, comparison |
| full | 12 | `full` | grid cell | Tables, wide timeline |
| tall (height flag) | any | n/a | 340 px high | Timelines, long lists |

`tall` has no equivalent in the current contract. See section 6.

**Responsive:** at 1100 px and below the grid is 6 columns (compact stays two-up, everything else is a full row). At 640 px and below it is one column and `tall` stops spanning rows.

### 3.3 States

Every non-ready state shows a glyph and a text label, not colour alone. Provenance and state chips also differ by border style.

| State | Glyph | Body | Meaning to the reader |
|---|---|---|---|
| ready | ● | content | Normal |
| loading | ◌ | skeleton, `aria-busy` | In progress |
| empty | ○ | message | Nothing to show; not a negative finding |
| unavailable | ⊘ | message | Source missing; absence is not evidence of absence |
| error | ▲ | message plus retry | Load failed |
| stale | ◷ | content plus banner | Last good load, may be out of date |
| partial | ◐ | content plus banner | Some inputs missing; no extrapolation |
| restricted | ■ | message | Role lacks permission |

### 3.4 Overflow

The body has a maximum height (420 px, 640 px for tall) and scrolls. The scroll region is keyboard focusable and named `<title> content`. The widget never grows past its grid cell.

### 3.5 Accessibility

- The shell is a `<section>` named by its title (`aria-labelledby`).
- The body is a named region with a visible focus ring.
- Charts have a text alternative: the donut has an `aria-label` listing every part and the denominator, plus a native `<details>` data table. Bars use `role="meter"` with `aria-valuetext`.
- Counts always appear as text with the denominator.
- Skeleton animation stops under `prefers-reduced-motion`.
- Mock actions are `disabled` with `aria-disabled` and a title saying they are not wired.

### 3.6 Mobile

One column, evidence pairs stack, tables scroll horizontally inside their wrapper, and the shell keeps the same slots. No content is hidden at small sizes.

### 3.7 Concepts not simulated

Resize, drag-reorder and per-user customization are **concepts**. The preview does not fake persistence or working controls. The current app already has drag, keyboard and touch reorder for the seven cockpit widgets; the shell should adopt that behavior rather than reinvent it.

---

## 4. Page-to-widget matrix

Status describes engineering state of the widgets in the real app.

| Page | Primary action | Widgets | Status |
|---|---|---|---|
| Home (**proposed**) | Open the next item that needs review | Open review items · Recent source-backed changes · Review status · Encounter timeline · Data completeness · Shortcuts | New (needs integration) |
| Compare notes | Compare two notes and review each difference | Earlier vs later list · Evidence-linked differences · Conflicting statements · Missing detail gaps | Extends current |
| Snapshot review | Verify, flag or defer each change | Change explorer with excerpts · Reviewer dispositions · Follow-up queue · Mention timeline | Extends current |
| Review suggestions | Accept, override or skip | Suggestion with evidence · Uncertainty and abstentions · Disposition counts | Extends current |
| Evaluations | Inspect failures and denominators | Tested / passed / failed / timed out · Case-family breakdown · Evidence coverage and abstention · Run comparison (measured only) | Extends current |
| Session activity | Trace an action to its item | Action log with links · Unresolved items · Source freshness and errors | Extends current |
| Models & data | Confirm model and data in use | Mode and model identity · Connection status · Dataset provenance | Extends current |
| Patient longitudinal (**future**) | See documented trends and gaps | Labs and vitals with units · Medication and encounter timeline · Allergies and source status | Future concept |

The Home page shows concise summaries and links into the richer page widgets. It should not duplicate a whole page.

---

## 5. Ranked first release and backlog

### First release (designed in the preview)

1. **Open review items** (compact metric). Extends `review-progress`.
2. **Review status** (standard donut). Parts of one defined whole with counts and denominator. Extends `review-progress`.
3. **Medication changes to review** (standard list, `DESIGN-SONNET-002` worked example).
   - **Page & placement:** Selected patient's Home (`Morgan Lee (Synthetic)` · `DEMO-001`).
   - **Primary user & task:** Reviewer quickly sees unresolved documented differences and opens the comparison page (`Open medication review` prototype action).
   - **Count definition:** Documented medication differences between earlier and later notes that do not yet have a human reviewer disposition (`7 of 12` fictional count in mock; explicitly labeled as documented differences, **never** described as confirmed medication errors).
   - **Body:** Fictional count summary in context line plus up to three source-backed review items (`Metoprolol succinate`, `Lisinopril`, `Furosemide`) with explicit unknown/missing-evidence (`Missing evidence`, `Conflicting sources`, `Linked evidence`) indicators.
   - **States:** `ready`, `loading`, `empty` (no unresolved differences), `unavailable` (comparison source offline), and `stale` (snapshot older than current note) are visually and textually distinct.
4. **Recent source-backed changes** (wide evidence list). Extends `provenance-health` and Snapshot review evidence drill-down.
5. **Encounter timeline** (compact or tall). Reuses `buildEncounterTimeline`.
6. **Data completeness** (full bars). Counts against a shared denominator. New.
7. **Shortcuts** (compact). New, trivial.

### Next, ranked by value

7. Conflicting statements side by side (exists in Snapshot review; promote to a widget).
8. Evaluation denominators and case-family breakdown (exists after Codex item 94; reuse).
9. Evidence coverage and abstention rate for assistant responses.
10. Follow-up queue with owner and next action.
11. Source freshness and service errors.
12. Longitudinal labs and vitals (needs real structured data).

### Not recommended now

Specialty surfaces (ICU, dental, perioperative, labor and delivery, oncology) and operations surfaces (staffing, capacity, billing). They have no real data in this app, so they would be decorative. Defer until there is a user need and a data source.

### Differentiation ideas (concepts, not claims)

I have **not** compared these with competitors, so none is claimed as unique.

| Idea | Benefit | Needs | Safety and validation |
|---|---|---|---|
| Evidence-first change explorer | See the original earlier and later excerpts with date and provenance beside each change | Evidence links (exists in `diff.ts`) | Must show unknown and absent distinctly. Needs reviewer usability check |
| Uncertainty and conflict map | Separate unknown from absent, and disagreement from a confirmed error | Evidence state classification (Codex item 02) | Never label a conflict as an error without a human |
| Encounter-to-follow-up trail | Follow a change from source note to reviewer decision to follow-up | Audit entries with item links (exists) | Dispositions are human only |
| Patient data-completeness view | Show what is missing before review starts | Field counts (derivable now) | Counts against a stated denominator only |
| Reviewer workspace that explains model limits | Explain abstentions and mode (replay, live, unverified) | Model status and eval counts (exist) | Distinguish synthetic replay from live output; no claim of clinical validation |

---

## 6. Interface sketches (aligned with existing contracts)

These are sketches for engineering, not implemented in the app.

```ts
// Existing, unchanged
type WidgetSize = 'small' | 'medium' | 'large' | 'full';
interface WidgetDefinition { /* see src/lib/cockpit.ts */ }

// Proposed additions
type WidgetHeightVariant = 'regular' | 'tall';
type WidgetState =
  | 'ready' | 'loading' | 'empty' | 'unavailable'
  | 'error' | 'stale' | 'partial' | 'restricted';

interface WidgetDefinitionExt extends WidgetDefinition {
  pageIds: Array<'home' | 'extract' | 'diff' | 'triage' | 'eval' | 'audit' | 'models'>;
  heightVariant: WidgetHeightVariant;
  sourceLabel: string;          // required: every widget names its source
}

// Existing WidgetInstance already has error + lastRefreshed; add:
interface WidgetInstanceExt extends WidgetInstance {
  state: WidgetState;
  stateDetail?: string;
}
```

The mapping from span to existing size is `SPAN_TO_EXISTING_SIZE` in `WidgetShell.tsx`. `tall` is the only new layout dimension.

---

## 7. Engineering handoff

| Widget | Data source | Calculation | Dependencies |
|---|---|---|---|
| Open review items | `reviews` map plus `activeReport.changes` | changes without a decision ÷ total changes | Existing review state |
| Review status | Same | Count of verified / flagged / deferred / unreviewed, summing to the denominator | Same |
| Recent source-backed changes | `analyzeSnapshots` evidence links | Per change: earlier and later excerpts, state from `classifyChangeEvidenceState` | Codex item 02 |
| Encounter timeline | `buildEncounterTimeline` | Chronological, undated records separate | Exists |
| Data completeness | `compareSnapshots` field values | Present ÷ total for dose, route, frequency, source and date | New helper |
| Shortcuts | App navigation | None | Wire to `navigateTo` |

### Acceptance criteria

1. Every widget shows its source and freshness, or says why it cannot.
2. Every count shows its denominator.
3. All eight states render, each with a text label.
4. Charts have a text alternative and a data table.
5. Keyboard: the scroll region and every action are reachable; focus is visible.
6. 1440, 768 and 390 px layouts show no clipped content.
7. Reduced motion is respected.
8. Unknown is never rendered as negative, and absent is never rendered as stopped.
9. No widget takes a clinical action or writes data.
10. Utkarsh approves appearance and behavior in a preview before any deployment.

---

## 8. Open questions

1. Is `tall` worth adding to the contract, or should tall widgets just be `large` with a row span?
2. Should Home replace the Compare notes landing page, or sit beside it?
3. Is the 3 PM release scope the six first-release widgets, or more?
4. Which real data exists for the longitudinal view? Without it, that page stays a concept.
5. Do you want a competitor review before any widget is called distinctive?

## 9. What this design does not do

No backend, EHR integration, clinical decisions, predictions or data writes. No real patient data or credentials. All values in the preview are invented and labeled. Clinical interpretation stays with a human reviewer.

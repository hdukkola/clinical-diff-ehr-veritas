# Technical Architecture — Clinical Cockpit

**Repository:** `~/Projects/clinical-diff-ehr-veritas`
**Branch:** `feat/continuous-35b-ml-pipeline`
**Status:** Proposal — not yet implemented
**Related documents:**
- `docs/ANTIGRAVITY_HANDOFF.md` — implementation handoff (read first)
- `docs/WIDGET_CATALOG.md` — widget catalog
- `docs/CLINICAL_WORKFLOW.md` — end-to-end encounter flow
- `docs/MVP_SPECIFICATION.md` — frozen demo scenario and build order

---

## Architecture principles

1. **AI proposes, humans commit.** No widget writes to the EHR without explicit clinician action.
2. **Existing EHR remains the system of record.** The cockpit is a presentation/workflow layer, not a replacement database.
3. **Source-aware information.** Every claim traces to a source; missing data is shown as "Not documented," never as normal.
4. **Widget independence.** Widgets communicate through typed application events/shared state, not arbitrary coupling.
5. **Safe by default.** Evidence-sufficiency gate, abstention on missing data, unauthorized-change blocking, no auto-promotion.
6. **EHR-interoperable but not EHR-dependent.** Vendor-neutral internal representation with vendor-specific adapters.
7. **Synthetic-only for MVP.** No real patient data; no production EHR integration; no clinical validation claims.

---

## Existing stack (do not change without review)

| Layer | Technology | Version | Reason |
|---|---|---|---|
| Frontend framework | Next.js | 16.4.6 | Already in repo; App Router |
| UI library | React | 19.3.0 | Already in repo |
| Language | TypeScript | ^5 | Already in repo |
| Styling | Tailwind CSS | 4.3.3 | Already in repo |
| Testing | Vitest | ^4.1.12 | Already in repo; 14 tests passing |
| Lint | ESLint | ^9 | Already in repo |
| Typecheck | tsc --noEmit | — | Already in repo |
| Backend | Python | 3.14.7 | Existing `fresh-backend/service.py` |
| Backend testing | unittest | — | 71 tests passing |

**Do not:** Add Redux, Zustand, a heavy dashboard/grid library, a new data-fetching library, or a new CSS framework without human project owner approval.

---

## Frontend architecture

### 1. Framework and type system

- **Framework:** Next.js 16.4.6 App Router
- **Language:** TypeScript with strict mode (`tsc --noEmit` must pass)
- **Styling:** Tailwind CSS 4 (already configured)
- **Component model:** React 19 function components with hooks
- **State:** React context + custom hooks (no Redux/Zustand in MVP)

### 2. Component boundaries

| Component | Responsibility | Location |
|---|---|---|
| App shell | Layout, navigation rail, command palette, theme | `src/app/layout.tsx`, `src/app/page.tsx` |
| Widget registry | Widget definitions, registration, lookup | `src/lib/widget-registry.ts` |
| Layout manager | Grid, drag-to-reposition, resize, presets | `src/lib/widget-layout.ts` |
| Shared context | Patient/encounter context provider | `src/lib/clinical-context.ts` |
| Data fetching | Fetch + cache wrapper | `src/lib/data-fetching.ts` |
| Widget base | Common widget props, states, error boundaries | `src/components/widget-base.tsx` |
| Widget catalog | Add/remove/configure widgets | `src/components/widget-catalog.tsx` |
| Individual widgets | One file per widget | `src/components/widgets/*.tsx` |
| AI interface | Model-provider abstraction | `src/lib/ai-service.ts` |
| Clinical Diff | Diff view, accept/edit/reject/defer | `src/components/clinical-diff.tsx` |

### 3. Widget registry

**Type definition** (from `docs/TECHNICAL_ARCHITECTURE.md` data contracts):

```typescript
interface WidgetDefinition {
  id: string;
  displayName: string;
  category: 'patient-context' | 'medication-safety' | 'clinical-information' | 'encounter-workflow' | 'productivity';
  supportedSizes: ('small' | 'medium' | 'large' | 'full')[];
  defaultSize: 'small' | 'medium' | 'large' | 'full';
  minDimensions: { width: number; height: number };
  maxDimensions: { width: number; height: number };
  supportedRoles: string[];
  dataDependencies: string[];
  requiredPermissions: string[];
  refreshStrategy: 'on-demand' | 'on-patient-change' | 'periodic';
  configurationSchema: Record<string, any>;
  supportedActions: string[];
  safetyRequirements: string[];
  version: string;
  featureFlags: string[];
}

interface WidgetInstance {
  id: string;
  definitionId: string;
  position: { x: number; y: number; width: number; height: number };
  configuration: Record<string, any>;
  isVisible: boolean;
  isMinimized: boolean;
  lastRefreshed: string | null;
  error: string | null;
}
```

**Registry implementation:**
- `registerWidget(definition: WidgetDefinition): void`
- `getWidget(id: string): WidgetDefinition | undefined`
- `getAllWidgets(): WidgetDefinition[]`
- `canRender(widgetId: string, context: ClinicalContext): boolean` (checks permissions, dependencies, feature flags)

### 4. Layout manager

**Grid system:** 12-column virtual grid with grid snapping

**Layout constraints:**
- Left rail: fixed width (248px desktop)
- Center column: flexible
- Right rail: fixed width (244px desktop)
- Density: comfortable (MVP only)
- Responsive: desktop-first

**Operations:**
- Drag-to-reposition (widget header)
- Resize (widget corner/edge, snaps to grid)
- Grid snapping (all positions align to 12-column grid)
- Preset layouts (default, medication-focused — default only in MVP)
- Undo/reset ("Restore default" button)
- Conflict handling (last-write-wins with timestamp)

**Avoid:**
- Nested scrolling surfaces
- Widget overlap
- Unpredictable widget disappearance

**Libraries:** No heavy third-party dashboard library in MVP. Custom layout manager built on CSS Grid + React drag events. Rationale: keeps control, avoids nested scrolling, avoids widget overlap.

### 5. Shared application context

```typescript
interface ClinicalContext {
  patient: PatientContext | null;
  encounter: EncounterContext | null;
  clinician: ClinicianContext | null;
  dataPermissions: DataPermissions;
  encounterState: EncounterState;
  sourceVersions: Record<string, string>;
  proposedChanges: ProposedChange[];
  committedChanges: CommittedChange[];
}
```

**Context provider:** `ClinicalContextProvider` wraps the app shell; all widgets consume via `useClinicalContext()` hook.

**Context transitions:**
- Patient change → all widgets re-fetch; previous patient's data cleared
- Encounter change → all widgets re-fetch; stale data not shown
- Proposed change accepted/rejected → Clinical Diff and Orders & Proposed Actions update

### 6. Data fetching and caching

**Pattern:** Custom hook `useClinicalData<T>(key, fetcher)` with:
- SWR-like caching (stale-while-revalidate)
- Per-widget cache isolation (one widget's fetch failure doesn't affect others)
- Automatic re-fetch on patient/encounter change
- Manual refresh button per widget

**No:** React Query, SWR library, or other heavy data-fetching dependencies.

### 7. State persistence

**MVP:** Browser `localStorage` for layout presets only (session-only). No cross-session persistence.

**Not in MVP:** User accounts, preferences sync, server-side layout storage.

### 8. Navigation

- Navigation rail (left rail): patient selection, workspace controls
- Command palette (Ctrl+K): patient search, widget search, action search
- Keyboard shortcuts: J/K move, V verify, F flag, D defer, Esc collapse
- Breadcrumbs: patient → encounter → widget

### 9. Accessibility (WCAG 2.1 AA target)

- Keyboard navigation throughout
- Focus-visible outlines
- Screen-reader labels (aria-labels, aria-describedby)
- Color-not-only-meaning (status icons + text labels)
- Contrast standards (4.5:1 normal text, 3:1 large text)
- Reduced motion support

### 10. Error boundaries

- React error boundaries per widget (one widget's error doesn't crash the app)
- Error state display: "Unable to load [widget]. Check connection."
- Retry button per widget
- Fallback UI for missing data

### 11. Design system

**Tokens:**
- Typography: serif for headings (Newsreader), sans for UI (Inter), mono for data (JetBrains Mono)
- Color: desaturated semantic hues; accent used as punctuation only; never color-only meaning
- Spacing: 4px base unit
- Components: cards, surfaces, buttons, inputs, tables, charts, badges, tags
- States: default, hover, focus-visible, active, disabled, loading, empty, error
- Charts: data-labeled, meaningful, not decorative

**Avoid:** Excessive gradients, glassmorphism, animations that compete with clinical information, decoration.

---

## Backend architecture

### 1. API boundaries

All backend communication is through `src/app/api/service/route.ts` (existing Next.js API route) which proxies to `fresh-backend/service.py` (Python, 127.0.0.1:8765).

**Existing endpoints:**
- `POST /api/service` with `{ op: 'health' }` → service health
- `POST /api/service` with `{ op: 'compare', earlier, later }` → synthetic note comparison

**Backend contract** (from `fresh-backend/README.md`):
- `GET /health` — service health check
- `POST /compare` — accepts `{ synthetic_only, earlier: {source_id, text}, later: {source_id, text} }`
- Response: `earlier`/`later` source IDs, `mentions`, `unsupported_outputs`, `differences` (kinds: `earlier_only`/`later_only`), `review_required`, disclaimer, limitations
- Evidence: source ID, literal matched text (`name`), zero-based Unicode code-point offsets (exclusive end)
- Modes: `local_mlx` (simulated=false, live_ai=true), `deterministic_replay` (simulated=true, live_ai=false)

**No new backend endpoints in MVP.** The frontend calls the existing API route.

### 2. Authentication abstraction

**MVP:** No authentication. Single clinician role; all actions permitted.

**Future:** Role-based access control (RBAC) with:
- Clinician role: read all, write proposed actions, commit documentation
- Read-only role: read only
- Admin role: manage widget registry, presets

**Abstraction:** `authService` with `getCurrentUser()`, `hasPermission(permission)`, `isAuthenticated()`. MVP returns mock clinician.

### 3. Role/permission model

| Permission | Clinician | Read-only | Admin |
|---|---|---|---|
| read:patient | ✅ | ✅ | ✅ |
| read:medications | ✅ | ✅ | ✅ |
| write:proposed-actions | ✅ | ❌ | ✅ |
| commit:documentation | ✅ | ❌ | ✅ |
| manage:widgets | ❌ | ❌ | ✅ |
| manage:presets | ❌ | ❌ | ✅ |

### 4. Synthetic patient-data service

**Data source:** Local fixture data (no external download in MVP)

**Synthetic patients:**
- Morgan Lee (64, F) — hypertension, type 2 diabetes — lisinopril, metformin, atorvastatin
- Elena Rostova (78, F) — hypothyroidism — levothyroxine, vitamin D3
- Marcus Vance (54, M) — hypertension — amlodipine, furosemide, apixaban

**Data provenance:** Every data point tagged with `sourceVersion`, `recordedAt`, `sourceLabel`

**Not in MVP:** Real FHIR server, real patient data, multi-patient sync

### 5. EHR adapter interface

**Vendor-neutral internal representation** backed by vendor-specific adapters:

```typescript
interface EHRAdapter {
  id: string;
  label: string;
  health(conn: Connection): Promise<Health>;
  loadPatient(patientId: string): Promise<PatientContext>;
  loadEncounter(encounterId: string): Promise<EncounterContext>;
  writeProposedChange(change: ProposedChange): Promise<AuditRecord>;
}
```

**Adapters specified (not implemented in MVP):**
- SMART on FHIR adapter (FHIR R4)
- Epic adapter
- Oracle Health adapter
- athenahealth adapter

**Integration maturity levels (documented, not claimed):**
- Standardized capability (FHIR R4 spec)
- Documented vendor capability
- Customer-enabled capability
- Proprietary capability
- Simulation-only capability (MVP)
- Unverified capability

**MVP:** Simulation-only. Writes are local previews only.

### 6. AI service interface

**Model-provider abstraction** (frontend must NOT depend on a particular model):

```typescript
interface AIService {
  id: string;
  label: string;
  health(): Promise<Health>;
  summarizeChart(context: ClinicalContext): Promise<GeneratedSummary>;
  prepareEncounter(context: EncounterContext): Promise<GeneratedSummary>;
  extractMedications(noteText: string): Promise<ExtractedMedication[]>;
  proposeActions(context: EncounterContext): Promise<ProposedChange[]>;
}
```

**Providers (specified, not all implemented):**
- Deterministic simulated output (MVP default)
- Local MLX model (existing `fresh-backend/service.py`)
- Cloud-hosted model (future, not in MVP)

**Fallback:** If AI service unavailable, workspace remains usable with deterministic data only.

### 7. Proposed-change service

Manages the lifecycle of proposed changes:
- Create proposed change (from AI or clinician)
- Validate proposed change (evidence-sufficiency gate)
- Clinician disposition (accept/edit/reject/defer)
- Re-validation on edit
- Commit (simulated write preview only)
- Audit record

### 8. Audit and versioning service

**AuditRecord** (from data contracts):
- Timestamp, actor, action, target, before state, after state, rationale

**Versioning:**
- Patient context version
- Encounter context version
- Proposed change version
- Each change creates a new version; previous versions preserved

**Not in MVP:** Server-side persistence; cross-session audit log

### 9. Persistence strategy

**MVP:** Browser `localStorage` for:
- Layout presets
- Widget configurations
- Session state (reset on reload)

**Not in MVP:** Server-side persistence; database; real audit log

### 10. Error handling

- Frontend: React error boundaries per widget; retry buttons; fallback UI
- Backend: Existing `fresh-backend/service.py` error handling (JSON 400/503, replay labels, no server crashes)
- AI: Fallback to deterministic data; "AI unavailable" message
- Network: "Unable to load [widget]. Check connection."

---

## AI subsystem architecture

### 1. Model-service abstraction

```
Frontend → AIService interface → [Deterministic Simulated | Local MLX | Cloud Model]
```

The frontend imports `AIService` interface only. Concrete provider injected at initialization. No direct model calls from UI components.

### 2. Prompt/context assembly

**Prompt construction:**
- Patient context (redacted for synthetic data)
- Encounter context
- Current medications, conditions, allergies
- Recent changes/diffs
- Task instruction (summarize, prepare, extract, propose)
- Output format constraint (structured JSON)

**Prompt assembly function:** `assemblePrompt(task, context) → string`

**Not in MVP:** Complex prompt chaining; few-shot examples; RAG over external knowledge

### 3. Structured output validation

**Every AI output validated against schema:**
- `GeneratedSummary` — text + source references + confidence
- `ProposedChange` — medication, action, fields, evidence, authority, uncertainty
- `ExtractedMedication` — name, dose, route, frequency, evidence span

**Validation rules:**
- Required fields present
- Types correct
- Evidence spans are literal substrings of source text
- No hallucinated medications (name must appear in source)
- Dose/route/frequency not invented when missing

### 4. Evidence/source references

**Every AI claim includes:**
- `sourceId` — source snapshot/encounter/document
- `sourceText` — literal span from source
- `startOffset` / `endOffset` — Unicode code-point offsets
- `sourceLabel` — human-readable source label

**Validation:** `evidence.text` must be a literal substring of `sourceText`. If not, the claim is flagged as unsupported.

### 5. Deterministic safety checks

**Evidence-sufficiency gate (must pass before proposal):**
- Literal evidence span exists for the proposal
- Required fields present (dose, route, frequency for start/change actions)
- Authority is not `patient_reported` for start/change actions (patient-reported = observation, not order)
- Authority is not `uncertain` for start/change actions

**Abstention:** If gate fails, AI abstains with reason. No guess.

**Unchanged-change blocking:** Proposed change with no actual diff is blocked.

**Unauthorized-change blocking:** Proposed change with missing required fields is blocked.

### 6. Confidence/uncertainty handling

**Uncertainty levels:** `low` / `medium` / `high`

**Assignment rules:**
- `high`: authority is `uncertain`; patient-reported + start/change action; missing fields
- `medium`: any field missing (non-required); authority is `historical`
- `low`: all fields present; authority is `chart_fact`

**Display:** Uncertainty badge on every AI proposal; clinician must review before accept.

### 7. Human approval requirements

**Every AI proposal requires clinician disposition:**
- **Accept** — proposal correct as-is
- **Edit** — proposal needs modification (re-validation before commit)
- **Reject** — proposal incorrect; no chart change
- **Defer** — review later; no chart change now

**No auto-accept.** No silent commit.

### 8. Retry/timeout/fallback behavior

| Scenario | Behavior |
|---|---|
| AI service timeout | Fallback to deterministic data; "AI unavailable" message |
| AI service error | Same fallback; error logged |
| Invalid AI output | Reject; fallback to deterministic; clinician notified |
| Network failure | Same fallback; retry button available |
| Repeated failures | Scheduler pauses (max 3 consecutive failures) |

---

## Data contracts

### PatientContext

| Field | Type | Classification | Description |
|---|---|---|---|
| id | string | authoritative | Patient identifier |
| name | string | authoritative | Patient name (fictional in MVP) |
| age | number \| null | authoritative | Patient age |
| sex | string \| null | authoritative | Patient sex |
| activeProblems | Problem[] | authoritative | Active conditions |
| allergies | Allergy[] | authoritative | Documented allergies |
| activeMedications | Medication[] | authoritative | Chart medications |
| missing | string[] | derived | Known gaps in data |

### EncounterContext

| Field | Type | Classification | Description |
|---|---|---|---|
| id | string | authoritative | Encounter identifier |
| patientId | string | authoritative | Linked patient |
| date | string | authoritative | Encounter date |
| kind | string | authoritative | Encounter type |
| summary | string | derived | Encounter summary |
| sourceRef | string | authoritative | Source reference |
| medications | Medication[] | authoritative | Encounter medications |
| encounters | EncounterRef[] | derived | Related encounters |
| unresolvedDiscrepancies | Discrepancy[] | derived | Medication discrepancies |

### WidgetDefinition

See widget registry schema above (ANTIGRAVITY_HANDOFF.md section 9).

### WidgetInstance

See widget registry schema above (ANTIGRAVITY_HANDOFF.md section 9).

### LayoutPreset

| Field | Type | Description |
|---|---|---|
| id | string | Preset identifier |
| name | string | Display name |
| description | string | When to use |
| widgetInstances | WidgetInstance[] | Initial widget layout |
| supportedRoles | string[] | Roles that can use this preset |

### ClinicalSourceReference

| Field | Type | Classification | Description |
|---|---|---|---|
| sourceId | string | authoritative | Source identifier |
| sourceLabel | string | authoritative | Human-readable label |
| sourceType | string | authoritative | Snapshot/encounter/note |
| recordedAt | string \| null | authoritative | When recorded |
| textSpan | { start: number; end: number } | derived | Unicode code-point offsets |

### ClinicalFact

| Field | Type | Classification | Description |
|---|---|---|---|
| id | string | derived | Fact identifier |
| type | string | derived | medication / condition / allergy / observation |
| value | any | derived | Fact value |
| source | ClinicalSourceReference | derived | Where from |
| authority | SourceAuthority | derived | patient_reported / chart_fact / historical / uncertain / clinician_decision |
| confidence | number | derived | 0..1 |
| status | 'authoritative' | 'derived' | 'synthetic' | 'generated' | 'pending_clinician_review' | derived | Data classification |

### GeneratedSummary

| Field | Type | Classification | Description |
|---|---|---|---|
| id | string | generated | Summary identifier |
| text | string | generated | AI-generated text |
| sourceReferences | ClinicalSourceReference[] | generated | Sources for each claim |
| authority | SourceAuthority | generated | AI-assigned authority |
| uncertainty | 'low' \| 'medium' \| 'high' | generated | AI-assigned uncertainty |
| generatedAt | string | generated | Generation timestamp |
| status | 'pending_clinician_review' | generated | Awaiting clinician review |

### ProposedChange

| Field | Type | Classification | Description |
|---|---|---|---|
| id | string | derived | Change identifier |
| medication | string | derived | Medication name |
| action | ProposalAction | derived | start / stop / continue / change / restart / taper |
| current | ProposalField[] | derived | Current state fields |
| proposed | ProposalField[] | derived | Proposed state fields |
| diff | ProposalDiff[] | derived | Field-level differences |
| evidence | ClinicalEvidence[] | derived | Evidence spans |
| authority | SourceAuthority | derived | Source authority |
| uncertainty | 'low' \| 'medium' \| 'high' | derived | AI-assigned uncertainty |
| gate | GateResult | derived | Evidence-sufficiency gate result |
| abstainReason | string \| null | derived | Reason if abstained |

### ClinicalDiffEntry

| Field | Type | Classification | Description |
|---|---|---|---|
| id | string | derived | Diff entry identifier |
| medication | string | derived | Medication name |
| action | ProposalAction | derived | Type of change |
| current | ProposalField[] | derived | Current state |
| proposed | ProposalField[] | derived | Proposed state |
| diff | ProposalDiff[] | derived | Field-level differences |
| evidence | ClinicalEvidence[] | derived | Evidence spans |
| authority | SourceAuthority | derived | Source authority |
| uncertainty | 'low' \| 'medium' \| 'high' | derived | Uncertainty level |
| gate | GateResult | derived | Gate result |
| abstainReason | string \| null | derived | Abstention reason |

### ReviewDisposition

| Field | Type | Description |
|---|---|---|
| id | string | Review identifier |
| proposalId | string | Linked proposal |
| decision | 'accepted' \| 'edited' \| 'rejected' \| 'pending' | Clinician decision |
| at | string | Timestamp |
| actor | string | Clinician identifier |
| note | string \| null | Clinician note |
| revalidated | boolean | Whether edited proposal was re-validated |
| fhirPreview | FhirMedicationStatement \| null | Simulated preview (not committed) |

### AuditRecord

| Field | Type | Description |
|---|---|---|
| id | string | Audit identifier |
| timestamp | string | When |
| actor | string | Who |
| action | string | What |
| target | string | What was affected |
| before | any \| null | Previous state |
| after | any \| null | New state |
| rationale | string \| null | Why |

### ModelOutputMetadata

| Field | Type | Description |
|---|---|---|
| modelId | string | Model used |
| modelVersion | string | Model version |
| promptHash | string | Hash of prompt used |
| generatedAt | string | When generated |
| confidence | number | Model confidence |
| uncertainty | 'low' \| 'medium' \| 'high' | Assigned uncertainty |
| safetyChecks | string[] | Checks that passed/failed |

---

## Field classification rules

| Classification | Meaning | Can clinician edit? | Can AI generate? |
|---|---|---|---|
| authoritative | From EHR system of record | No (read-only) | No |
| derived | Computed by application | No | No |
| synthetic | Demo fixture data | No | No |
| generated | AI-produced | Yes (before commit) | Yes |
| pending_clinician_review | Proposed change awaiting decision | Yes | Yes |

---

## Patient/encounter versioning and stale-data handling

**Versioning:**
- Every context change creates a new version
- Previous versions preserved in session
- `sourceVersion` field on every data point

**Stale-data handling:**
- Every widget shows "Data as of [timestamp]"
- Refresh button per widget
- Patient/encounter change clears all widget data
- No cross-patient data leakage
- Partial loading handled per widget (one widget's failure doesn't affect others)

---

## Performance

**Targets (provisional, to be measured):**

| Metric | Target | Measurement method |
|---|---|---|
| Widget initial load | < 500ms | `performance.now()` around widget mount |
| Layout reflow | < 200ms | `performance.now()` around drag/resize |
| Context switch (patient change) | < 1s | `performance.now()` around patient selection |
| Memory with 10 widgets | < 200MB | Chrome DevTools memory monitor |
| AI response (simulated) | < 2s | `performance.now()` around AI call |

**Performance strategies:**
- Lazy widget loading (widgets mount on demand)
- Progressive data retrieval (critical data first, secondary data after)
- Virtualized long lists (medication lists > 50 items)
- Cached queries (per-widget SWR-like cache)
- Limited unnecessary re-renders (React.memo, useMemo)
- Background refresh where appropriate (non-blocking)
- Widget isolation (error boundaries per widget)

**Measurement:** Define baseline in Phase 1; refine in Phase 9. No invented benchmarks.

---

## Security

**Threats and mitigations:**

| Threat | Mitigation |
|---|---|
| PHI exposure | MVP uses synthetic data only; no real PHI |
| Role-based access | `requiredPermissions` on widget definitions; `authService` abstraction |
| Patient-context isolation | Shared context validated on every widget mount; patient ID checked |
| Unsafe model output | Evidence-sufficiency gate; structured output validation; clinician review required |
| Prompt injection in chart content | Chart content treated as untrusted; escaped in UI; not included in model prompts as executable instructions |
| Model access to tools | Model has no tool access in MVP; read-only proposals only |
| Auditability | `AuditRecord` for every clinician action; proposed change dispositions logged |
| Data retention | Session-only; localStorage cleared on browser close |
| Secure integration | CORS limited to localhost; no outbound network calls in MVP |
| Logging hygiene | No secrets logged; no patient data in error messages |

**Do not claim:** HIPAA compliance; production security; clinical validation.

---

## Documents referenced

| Document | Purpose | Location |
|---|---|---|
| ANTIGRAVITY HANDOFF | Implementation handoff (20 questions) | `docs/ANTIGRAVITY_HANDOFF.md` |
| Widget Catalog | Full widget specs | `docs/WIDGET_CATALOG.md` |
| Clinical Workflow | End-to-end encounter flow | `docs/CLINICAL_WORKFLOW.md` |
| MVP Specification | Frozen demo, build order | `docs/MVP_SPECIFICATION.md` |
| Research Ledger | Evidence, corrections, open questions | `docs/RESEARCH_LEDGER.md` |

---

**Last updated:** 2026-11-15
**Status:** Proposal — awaiting human project owner review
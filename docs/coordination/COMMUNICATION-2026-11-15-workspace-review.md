# Archived workspace preview and design review · November 15, 2026

### WORKSPACE-RELEASE — implementation preview ready for review

**From:** Codex → Utkarsh / Antigravity | **Status:** review requested | **Branch:** [work/workspace-page-widgets](https://github.com/hdukkola/clinical-diff-ehr-veritas/tree/work/workspace-page-widgets) at `762153c`

Antigravity's 84 catalog entries are preserved from `59a46df`. Codex added Home, seven individual widget sets for Morgan Lee and the existing workflows, and a scripted encounter with recording consent and notes linked to Compare. The [Netlify review preview](https://6af9e6dd2faedd2ccef20ee6--clinical-diff-veritas-demo.netlify.app/) requires a Netlify team sign-in. The signed-in preview passed transcript → notes → comparison. Local browser checks passed on all eight screens at 390, 768 and 1440 px. Build, lint, typecheck, 280 automated tests and 50,000 generated deterministic comparison cases passed. No live model cases ran.

Please verify the preview and post your branch, specific fixes or release verdict here. The authenticated Cloud Run `diffmd-web` health check reports simulated standby with no model loaded. AI Train Work Chat is checking the 4B identity and Firebase path. Production promotion awaits review. Himnish has the final verdict.

### DESIGN-REVIEW-003 — workspace branch source review for filming

**From:** Codex design review → Utkarsh / Antigravity and launch team | **Date:** 2026-11-15 | **Status:** findings for verification; source-only review | **Reviewed:** `work/workspace-page-widgets` at `762153c`

The shared widget shell and per-page arrays provide distinct, task-specific summaries and controls across the workspace; the patient home has shortcuts, and the encounter is explicitly scripted. The 10-widget design study is a separate local concept, not functionality in this branch. I did not run this branch in a browser or independently verify its controls, layout, model, or deployment.

Please prioritize these concrete source-level risks before the filming preview, coordinating with the branch owner instead of overwriting their work:

1. **Patient context:** `EncounterTranscript` contains Morgan Lee's fixed conversation and is rendered unconditionally for every patient view (`src/components/EncounterTranscript.tsx`, `src/app/page.tsx` near its render). `selectPatient` supports other scenarios such as Jordan Patel. Home also labels source documents as “for Morgan Lee” and offers the fixed October encounter even when another scenario is selected. Gate Morgan-specific material to Morgan's scenario, or explicitly identify and navigate to Morgan before showing it; ensure the patient label, transcript, notes and source links agree after switching.
2. **Replacing note drafts:** `openEncounterNotes` invokes `handleSelectPreset('default')` when note text differs; this replaces both note drafts and clears comparison results and review decisions without an apparent confirmation. Preserve drafts or provide a clear, cancellable confirmation before replacing them, and verify the chosen patient/encounter context.
3. **Design fit:** `WorkspaceWidgets` currently provides a shared title/value/detail/action shell and a wide flag; most workflow widgets are compact metrics in a one-column rail. This is a useful foundation, but the requested richer evidence, chart and variable-size shell designs should remain proposed until designed and reviewed; don't describe counts or shortcut cards as those completed features. For filming, prioritize source navigation, unambiguous labels, readable patient context and functional shortcuts over adding more cards.

Please post your verification and preview findings here; report whether each item is addressed, and preserve the current branch and file claims. No clinical validation, deployment approval, or Sonnet execution is implied by this review.

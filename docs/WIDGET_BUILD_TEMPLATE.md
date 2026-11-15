# Clinical Diff widget build template

Copy the specification into a single-widget PR. Start with one small change on its own branch, using the latest agreed base. Record ownership and intended files in the PR or coordination log. Multiple agents may work concurrently on different files. Assign one integrator to shared widget registration, placement, and tests. Each agent offers an equal recommendation; Himnish decides scope and placement when there's a tradeoff.

## Widget specification

- **ID and owner** — Stable ID, title, owner, branch, base commit, and exact claimed files.
- **Evidence** — Vendor, product version or setting, source URL and section, evidence grade, and the observed workflow.
- **Clinical Diff job** — Who uses it, what they need to see, and which decision or navigation it supports. List existing widget or screen it extends.
- **Surface** — Default or optional, target screen, placement, width, mobile layout, and drill-down destination. Keep the Graphite tokens and shared widget shell.
- **Data contract** — Existing typed inputs, synthetic fixture IDs, source IDs, timestamps, units where applicable, and rendering for unknown or conflicting data. Specify actions and whether they are read-only.
- **States** — Loading, empty with no source, explicit negative when documented, unavailable/error, and populated. Include stale and partial states when the sources support them.
- **Interaction** — Keyboard and touch access, focus behavior, reduced motion, and safe fallback if live evidence is unavailable. Reuse shared reorder behavior. Keep records and evidence stationary while facts are being read.
- **Acceptance** — Concrete observable behaviors, targeted tests for source links and missing data, 390/768/desktop widths, and existing app checks. Report the checks actually run.
- **Handoff** — Commit/PR, observed results, limitations and reviewer. Keep changes synthetic, scoped, and independently reviewable.

## First specification for review

- **Widget** — Source evidence drill-down for `provenance-health`. Reuse the cockpit card and existing comparison/snapshot navigation. Claim files before implementation.
- **Evidence** — Oracle Health's summary verification workflow shows how users confirm generated summaries against chart information. This is an inspiration for the review flow; the before/after design is specific to Clinical Diff. [Oracle summaries](https://docs.oracle.com/en/industries/health/oracle-health-ehr/ehrug/summaries.html)
- **Job** — A reviewer can open the exact earlier and later source excerpts for a comparison change. Retain Morgan Lee (Synthetic), DEMO-001, and existing review state. Show source/date where available, and explicit “Source unavailable” for an unresolved reference. Keep it read-only.
- **Current behavior** — The provenance card opens Snapshot review with all differences. The expanded row already displays evidence excerpts, provenance labels and spans. The gap is a direct path from the card to a specific change and its evidence.
- **Reference case** — Morgan Lee, DEMO-001, Lisinopril. The bundled notes contain “Lisinopril 10 mg daily” in the earlier outpatient list and “Lisinopril 20 mg daily” in the later discharge list. Use the real evidence attached to the current comparison. A structured field alone is insufficient to claim an exact quote.
- **Acceptance** — Select Lisinopril from the evidence widget and arrive at its expanded review with both correct source excerpts when available. Label an unresolved or missing side clearly. Verify keyboard and touch access, focus on entry and return, and continued review decisions and widget reorder at phone, tablet and desktop sizes. Run lint, typecheck, tests and build.

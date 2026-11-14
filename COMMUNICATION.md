# Hackathon coordination

This file is a proposed human-operated coordination protocol; no external polling or agent connection has been verified. Never include real patient data, passwords, tokens, or private meeting transcripts here. GitHub is the source of truth; pull before claiming work.

## Claim protocol

1. Create a branch from current `main` and claim one task below in a small PR or issue. State owner, branch, exact files, and intended result. Check existing claims before starting. A file claim is exclusive until released; coordinate shared contract changes first.
2. Record status as `available`, `claimed`, `blocked`, `review`, or `done`. Include last update, blocker if any, and links to the branch/PR. A stale claim is not automatically released: contact its owner or a human coordinator before reassignment.
3. On completion provide commit/PR link, checks and their results, known limitations, and reviewer. An independent reviewer must review before merge. Never mark a task done merely because code was written.
4. On failure stop dependent work, report the exact failure and recovery needed, and avoid retry loops or overwriting another person's changes. Resolve conflicts with owners.

## Queue

| ID | Task | Suggested owner | Files | Status |
| --- | --- | --- | --- | --- |
| CD-01 | Improve EHR layout and accessibility | Frontend / developer 1 | `src/app/` | available |
| CD-02 | Extend evidence links and unknown provenance | Core / developer 2 | `src/lib/` (coordinate contracts) | available |
| CD-03 | Add varied synthetic scenarios | Support | `src/lib/fixtures.ts` | available |
| CD-04 | Add critical workflow end-to-end test | Independent QA | test configuration and tests | available |

## Message template

`ID | timestamp + timezone | sender | recipient | task/branch | status | message | evidence/PR | blocker | next action`

## Antigravity handoff

A human with access may choose an available task, claim it, and run their own agent. Suggested first task: CD-01 after checking `main`; do not edit `src/lib/` while another owner has it. Ask the agent to report changed files, checks, and limitations in its PR. No automated dispatch, polling, or access to Antigravity is established by this file.

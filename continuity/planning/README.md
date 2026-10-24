# Plans and brainstorming

## Sketchpad V1 delivery

Sketchpad V1 implementation is complete at the user's request. [The delivery ledger](../milestones/sk1-sketchpad.md) retains evidence. [H38](../status.md#pending-human-checks) remains native follow-up. No next Sketchpad implementation is selected. Discuss next work with the user.

This is the index for future work. [Roadmap](roadmap.md) owns selected work, sequencing and acceptance; [ideas](ideas.md) owns possibilities without a commitment. Substantial explorations belong in `studies/<topic>.md`, indexed below with topic, date, proposal/accepted/superseded state and a short conclusion. No study is required startup reading unless the current task needs it.

## Where the former planning documents went

The root ROADMAP.md and HANDOFF.md were migrated here on 2026-10-13 and removed. Implemented-pending-verification work (R1-R4), the queued tasks with full acceptance (Q1-Q7) and the platform/validation/release backlog (L1-L10) are in the [roadmap](roadmap.md); possibilities from the old design draft and design study are in [ideas](ideas.md). The historical product design draft is [history/product-design-draft-0.2.md](../history/product-design-draft-0.2.md); the Reading Room visual study is [design/reading-room](../design/reading-room/README.md). AGENTS.md remains the agent rule source.

Q1/Q2/Q3/Q5/Q6/Q7 are implemented in source. The [20-priority list](roadmap.md#current-user-selected-priorities-2026-10-17-revision) now resumes at priority 8, clipboard compatibility, then typed search/directory matching; Q4 is outside the revised selection. R6/R7 user follow-ups are implemented; native checks remain pending. I20 Follow system appearance was selected and implemented in R7.

## Studies

2026-10-19: [Librarian calculator living plan](studies/librarian-calculator.md), selected/implemented R18 foundation, R19 screenshot-driven UI refinement and R20 Enter-focus fix and R21 inline expanded feature view matching Paste Playground ahead of priority 8: fixed keypad below an expression/answer sheet, permanent saved context and local Clear versus Archive; Ctrl+Alt+1–9 replaces recent-paste chords. Concrete steps, automated evidence and pending native H25/H26 stay in the plan. R22 implements last-result copy, history/draft recall, natural math editing, recovery and completion/hints; native H27 remains pending and commit/push is explicitly authorized. Remaining 20-priority order is unchanged.

The later implementation request selects N16, N14, N20, editable text diff and N18 in that order; the roadmap records implementation state and now has 20 priorities. All five are implemented in R15–R16; H21/H22 are pending. R17 also completes Q3/Q7 with H23/H24 pending; clipboard compatibility is next. Earlier studies preserve provenance.

2026-10-17: [Desktop feature review](studies/feature-review-2026-10-17.md) evaluates all I1–I30 and Q/L work, ranks surviving ideas and adds twelve new proposals. The later user revision below supersedes this ranking; the study retains historical dispositions and scope definitions.

| Topic | Date | State | Conclusion |
| --- | --- | --- | --- |
| [User-edited priority revision](studies/feature-priorities-2026-10-17.md) | 2026-10-17 | selected priorities; additions proposed | 15 surviving priorities retain user order; Q3 then Q7, Q4 omitted; eight further proposals N13–N20 remain unselected. |
| [Desktop feature review](studies/feature-review-2026-10-17.md) | 2026-10-17 | historical review; ranking superseded | Every old idea classified; N1–N12 scope definitions retained. Current selection belongs to the roadmap; permanent history remains preserved. |
| [React Native app on Entanglement + Aurora](studies/react-native-app.md) | 2026-10-13 | proposal, not started | Separate repo `archiver-mobile` (Expo 57 / RN 0.86.3), offline-only Entanglement (no backend), Aurora Reading Room theme; capture via share sheet, Process Text, paste box and opt-in clipboard-on-open; 12 prompts P0-P11 for a Sonnet agent. Does not change the desktop Q1-Q7 queue. |

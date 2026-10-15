# Plans and brainstorming

This is the index for future work. [Roadmap](roadmap.md) owns selected work, sequencing and acceptance; [ideas](ideas.md) owns possibilities without a commitment. Substantial explorations belong in `studies/<topic>.md`, indexed below with topic, date, proposal/accepted/superseded state and a short conclusion. No study is required startup reading unless the current task needs it.

## Where the former planning documents went

The root ROADMAP.md and HANDOFF.md were migrated here on 2026-10-13 and removed. Implemented-pending-verification work (R1-R4), the queued tasks with full acceptance (Q1-Q7) and the platform/validation/release backlog (L1-L10) are in the [roadmap](roadmap.md); possibilities from the old design draft and design study are in [ideas](ideas.md). The historical product design draft is [history/product-design-draft-0.2.md](../history/product-design-draft-0.2.md); the Reading Room visual study is [design/reading-room](../design/reading-room/README.md). AGENTS.md remains the agent rule source.

Q1/Q2/Q5/Q6 are implemented in source; Q3 portable import/verified restore is the next remaining item in the [Q1-Q7 queue](roadmap.md#next-agent-queue-q1q7), followed by Q4 and Q7. R6/R7 user follow-ups are implemented; native checks remain pending. I20 Follow system appearance was selected and implemented in R7.

## Studies

| Topic | Date | State | Conclusion |
| --- | --- | --- | --- |
| [React Native app on Entanglement + Aurora](studies/react-native-app.md) | 2026-10-13 | proposal, not started | Separate repo `archiver-mobile` (Expo 57 / RN 0.86.3), offline-only Entanglement (no backend), Aurora Reading Room theme; capture via share sheet, Process Text, paste box and opt-in clipboard-on-open; 12 prompts P0-P11 for a Sonnet agent. Does not change the desktop Q1-Q7 queue. |

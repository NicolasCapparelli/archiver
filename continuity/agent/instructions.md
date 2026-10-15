# Agent contract

Continuity is this project's primary documentation home for understanding, changing, and resuming work. Read [what Continuity is](../about.md) when unfamiliar with it. Full documentation migration is optional and requires explicit user approval; discovering its prompt is not authorization.

Follow applicable repository instructions. At task/session start read this file, [status](../status.md), and the complete [map](map.md); reuse unchanged loaded context. Match request vocabulary/boundaries, then read only relevant model sections, local guides, source, and tests. Follow dependencies and expand investigation when evidence warrants it.

Inspect actual source before changing behavior. Missing/stale routes: search source, establish ownership, repair the map. Routing never prohibits investigation. Read user guides for affected user behavior and decisions/history only when their reasoning matters. Avoid recursive documentation/schema reads and vendor/generated/build/dependency orientation unless needed; use map exclusions.

Initialization is the broad-coverage exception: inventory/search first, then inspect substantive source across capabilities. Never blindly ingest every file.

## Every turn: implementation, testing and intent

Before ending each user-facing turn, update [the implementation log](../implementation-log.md) with one dated entry: what was actually implemented (including documentation/planning or partial work), relevant paths, actual checks/results and tested state, and concrete human verification steps with expected results. Include uncommitted work. For a discussion/read-only turn, state that no implementation occurred and capture its conclusion; use "No runtime change" with a document review or no applicable test. Do not log individual tool calls or internal agent messages. On interruption, record partial work at the next safe handoff.

Keep the newest 10 entries and about 2,000 words in the active log. Archive oldest complete entries to linked `history/implementation/YYYY-MM.md` before removing them; preserve unique evidence and repair moved anchors. Retention is by turn, independent of commits. Keep unresolved human checks (ID, action, expected result, pending/failed state and evidence link) in [status](../status.md) before their entries leave the active log. Only reported human verification closes human checks; automated success is separate. Read recent relevant entries when resuming or discussing what to test, never all archives at startup.

Capture meaningful future ideas and brainstorming conclusions in [planning](../planning/README.md) during the turn. Roadmap owns selected next work, acceptance and sequence; ideas owns unselected possibilities; indexed topic studies preserve substantial reasoning. Preserve origin/date and distinguish proposal, selection and implementation authorization. Status links the exact selected next item or says none selected. Update these homes only when their facts change.

Before UI work, read [design guidance](../design/README.md), the accepted language and relevant board/tool sections, then inspect actual token/component source. Reuse semantic tokens and existing primitives; record intentional extensions and exceptions with affected design docs. Boards illustrate style; runtime source owns implemented screens/behavior and locked requirements retain authority. Tool adoption is a project choice. Report actual visual/interaction checks and remaining uncertainty.

## Every commit and handoff

Commit only when otherwise authorized. Before each commit and every handoff, including uncommitted work:

1. Review the relevant diff; update affected docs with implementation. For partial commits, describe committed behavior accurately and distinguish outstanding working-tree changes. Intermediate edits may defer updates until this boundary.
2. Review status; update changed state, stopping point, next steps, blockers, or verification. State no active work/no established next task when applicable. History alone does not establish human intent.
3. Check changed links/routes. Report actual checks, results, scope, tested code state, and uncertainty. Source inspection is not runtime verification; never claim an unrun check or identify a future documentation commit as tested.

| Change | Documentation / investigation |
| --- | --- |
| Component added/moved/removed/reassigned | Map/local guide; architecture if overall design changes |
| Data access/validation/serialization/identity/relationship/lifecycle | Model/schema routes; producers, consumers, conversions, migrations |
| User behavior | Affected usage/troubleshooting |
| Setup/commands/configuration/verification | Setup and verification routes |
| Consequential durable decision | Architecture or optional decision record |
| State/unfinished work | Status |
| UI language/tokens/patterns | Design guidance, relevant board, token/component source and visual checks |
| Future ideas/selected work/brainstorming | Planning index, ideas/roadmap or topic study |

No ceremonial edits: review can require no change. Keep one home per fact; label plans, inferences, unknowns. Preserve existing rules and discovery pointers. Tools without root-file discovery need an explicit instruction pointing here; compliance is not guaranteed.

Review destination roles and obsolete active reading instructions, not only link existence. Qualify intended invariants with known implementation limits beside the claim. Keep completed documentation evidence optional; status retains current blockers and outcomes, and map dependencies select precise route anchors.

# Ideas and possibilities

2026-10-19 calculator brainstorming: [five improvement suggestions](studies/librarian-calculator.md#suggestions-not-selected-for-implementation) cover keyboard expression recall, math-aware editing/display, draft/context recovery, function/variable completion and named calculation sheets. Originally proposals after R20; the user selected recall, natural math editing, recovery and completion plus last-result copy in R22, now implemented. Named calculation sheets remain unselected. See the living plan for current evidence; priority 8 remains next.

**Later user selection (2026-10-17):** Region OCR (N16), JSON explorer including Paste Playground (N14), archive notes (N20), editable left/right text diff and extractors (N18) are now the first five implementation priorities, with commits every two or three implementations. The roadmap owns current state. Other suggestions remain unselected; earlier proposal statements below are historical.


**2026-10-17 user revision:** the [roadmap](roadmap.md#current-user-selected-priorities-2026-10-17-revision) now owns the 15 surviving priorities. The [revision study](studies/feature-priorities-2026-10-17.md) adds eight unselected proposals N13–N20. Omitted rows, including Q4 scheduled backups, leave the active selection; the earlier review below retains provenance and historical dispositions.

Selective reading, not startup. Selected work lives in the [roadmap](roadmap.md). Items marked "design draft 0.2" come from the [historical product design draft](../history/product-design-draft-0.2.md); they are proposals, not commitments. Migrated and extended 2026-10-13 so no future/open item of the old root documents is lost.

**2026-10-17 review supersedes the old open states below:** [feature review](studies/feature-review-2026-10-17.md) contains the disposition of every I1–I30 idea and the ranked surviving set. Keep the rows as provenance. Drop active automatic pruning (I7), execution/workflow automation (I13), speculative font refinement (I21) and tooling/artwork/historical notes as product features (I3/I23/I25). Sync, AI, remote support and extra destination tracking remain deferred; Ctrl+R still requires a new request. Twelve newly proposed extensions N1–N12 are defined and ranked in that study; none is implemented by this review.

| ID | Idea | Origin / date | State | Open question |
| --- | --- | --- | --- | --- |
| I1 | Cross-device sync (stable IDs and versioned export schemas exist so it can be added; conflict resolution, deletion propagation, accounts and transport are undesigned) | root ROADMAP.md; design draft 0.2 | deferred ("explicitly later"); roadmap L8 | no design |
| I2 | Ctrl+R shell search powered by Archiver | root ROADMAP.md / AGENTS.md | deferred until the user requests it again; do not implement; roadmap L9 | none |
| I3 | Aurora/TokenSeed or other token tooling (design draft suggested evaluating Aurora's core/web adapter) | design draft 0.2 | unused; not proposed | only if the user chooses a theming migration |
| I4 | Design board for the Reading Room language | Continuity initialization 2026-10-13 | deferred | needs explicit user request and a reference; see [board prompt](../design/initialize-board.md) |
| I5 | Typed search filter syntax such as `type:image`, `shell:pwsh`, `after:2026-10-01`, `app:chrome`, `dir:"C:\work"`, with autocomplete and explanations of invalid filters (proposed syntax; today filters are UI controls and CLI options) | design draft 0.2 | idea | whether to add |
| I6 | Directory filter that optionally includes descendant directories | design draft 0.2 | idea (today the directory filter is a literal substring match) | whether to add |
| I7 | Optional retention rules (age/count) previewing affected entries before activation; pins exempt unless included; occurrence-level rules by default; bulk deletion by date/source; removing a rule never restores history | design draft 0.2 | idea; must respect AGENTS.md (history is permanent unless the user configures deletion) | whether wanted at all |
| I8 | Storage health: show archive size and growth, low-disk warning, degraded-capture reporting when persistence fails | design draft 0.2 | idea | which of these exist is unverified |
| I9 | Performance acceptance targets, measured on a documented midrange Windows laptop with SSD: warm quick-panel first interactive frame p95 under 100 ms; first 50 results at one million text occurrences p95 under 100 ms; idle CPU under 0.5%; background private memory under 50 MB with the main UI closed; total under 150 MB with the quick panel; text capture to durable storage p95 under 100 ms; shell submission overhead p95 under 5 ms. Also measure archive/index size, cold startup, large images, burst capture, UI frame times and indexing backlog; use a realistic dataset with accented/non-Latin text, long commands and concurrent capture/search; exercise storage exhaustion, malformed payloads, suspend/resume, migrations and backup restoration | design draft 0.2 | targets, not measured claims; ties to roadmap L6 and Q6 | nothing measured yet |
| I10 | Native-format fidelity matrix and adapters (delayed rendering, OLE virtual files, app-private formats); "full file archival" of copied file contents would be a separate explicit feature | design draft 0.2; README | idea; roadmap L5 | decide whether to archive file contents |
| I11 | Project-aware command search (offer the active connected shell's directory as a filter); related commands from the same session/directory; save a command sequence as a recipe | design draft 0.2 | idea (directory-prioritized quick access already exists) | whether recipes are wanted |
| I12 | Semantic/AI search | design draft 0.2 | deferred | none |
| I13 | Command output capture, command execution endpoints, automation workflows | design draft 0.2 | deferred; the API intentionally has no execution endpoint | none |
| I14 | Remote shell integration; WSL/remote guest-vs-host path, distribution and session identity | design draft 0.2 | idea | the desktop cannot see remote shells without an integration |
| I15 | Encrypted local storage | design draft 0.2 ("not required") | not requested; history is unencrypted today | whether wanted |
| I16 | Engineering questions to settle by prototype: CMD integration mechanism (Clink is the present approach), repeat-copy quiet window length (the two-second heuristic is not validated), webview prewarming versus memory budget, native quick-panel fallback if the webview misses latency budgets, signed installer/update packaging | design draft 0.2 | open | measure |
| I17 | FTS5 token versus trigram benchmarking for punctuation-heavy commands and a bounded short-query fallback; literal search is currently used although FTS is maintained | design draft 0.2; README | open | benchmark |
| I18 | Spool overflow reporting and authenticated local IPC for shell adapters (draft design; current adapters use a per-user spool directory) | design draft 0.2 | idea | whether the current spool reports overflow is unverified |
| I19 | Concurrent desktop app and CLI writers on the same database: isolation not established | Continuity architecture note | open question | test |
| I20 | System-following appearance (appearance is user-selected today, default dark) | Reading Room IMPLEMENTATION.md | implemented 2026-10-13 (R7); native H13 pending | opt-in Follow system; dark stays default |
| I21 | Bundled monospace font refinement (currently Consolas/SFMono/system) | Reading Room IMPLEMENTATION.md | optional future refinement | none |
| I22 | Archivist detail drawer at 900x400 with explicit focus management instead of CSS-only hiding | Reading Room IMPLEMENTATION.md | follow-up if needed | needs native review |
| I23 | Convert the standalone wordmark SVG's live Instrument Serif text to outlines before shipping it as standalone artwork (app wordmark stays live text) | Reading Room IMPLEMENTATION.md, PROMPTS.md | only when shipping standalone artwork | none |
| I24 | Native validation of platform icon optical rendering at 16-64 px, Windows 100-200% scaling, native startup background and persisted-light cold start | Reading Room VALIDATION.md / MIGRATION.md | pending; roadmap L4 and L10 | human review |
| I25 | Browser automation to localhost was blocked in earlier sessions; built assets were served directly instead | root STATUS.md | note, not a task | find a sanctioned way if browser checks are wanted |

Brainstorming from the 2026-10-13 request (Expanded Librarian, Paste Playground) was promoted to the roadmap as R4 and is implemented; its remaining uncertainty is listed there.

## Emoji-turn brainstorming (2026-10-13)

User requested useful possibilities alongside R10. These are proposals, not selected work or implementation authorization; Q3 remains next.

| ID | Possibility | Useful behavior / unresolved choice |
| --- | --- | --- |
| I26 | Searchable symbol catalog | Same copy/paste workflow for arrows, math, typography and currency; choose a curated catalog and clear Unicode names. |
| I27 | Project-aware snippet suggestions | Suggest reusable snippets based on connected shell directory/source app without changing stored content; choose opt-in/context rules. |
| I28 | Clipboard provenance trail | Show where a clip was captured and explicitly delivered, helping trace reused text; recording destinations needs privacy/retention decisions. |
| I29 | Safe paste preview | Show line count, invisible characters and destination before explicitly requested delivery; choose thresholds without slowing every paste. Never execute commands. |
| I30 | Emoji favorites and recent selections | Optional local favorites/recents across restarts, plus preferred skin tone; decide whether these are shared across windows and exported. |

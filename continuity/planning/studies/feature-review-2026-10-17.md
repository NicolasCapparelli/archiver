# Desktop feature review — 2026-10-17

**Superseded priority order:** the user later selected 15 surviving features in the [current roadmap](../roadmap.md#current-user-selected-priorities-2026-10-17-revision). Q3 is followed by Q7; Q4 and other omitted rows are outside the active selection. The ranking and queue statements below record the earlier review. Scope definitions and historical dispositions remain useful. [Revision and eight further proposals](feature-priorities-2026-10-17.md).

Requested by the user after R14. Planning judgment, not authorization to implement every proposal. Reviewed the Q1–Q7 queue, L1–L10 backlog, I1–I30 ideas, implemented catalog and current Windows clipboard/snippet workflows. Q3 → Q4 → Q7 remain the selected implementation queue. Rankings after those are recommendations, ordered by recovery value, everyday reuse, scope and implementation risk; no effort estimates are promised.

Archiver's useful center is a durable local memory with fast retrieval and deliberate reuse. Keep Librarian keyboard-first and compact, Archivist inspectable through buttons/menus, groups exclusive to snippets and archive history permanent. New tools should reuse the Reading Room dialogs, semantic tokens and existing delivery checks. No new dashboard, navigation rail or automatic popup for every paste.

## Ranked surviving features

**New** means newly proposed here, not implemented. Extensions are deliberately distinguished from existing pause, templates, transforms, file checks, exports and manual diffs.

| Rank | Feature | Source | Useful scope / acceptance direction |
| --- | --- | --- | --- |
| 1 | Portable import and verified restore | Q3 | Restore into an isolated staging database; validate version/checksums, preview merge/conflicts and preserve archive history before touching the live store. Existing export/backup alone is not a usable recovery loop. |
| 2 | Scheduled verified backups | Q4 | Opt-in destination/interval, last/next result, unique backups and visible failures. Keep all by default; use the existing verified snapshot path. |
| 3 | Diagnostics and storage health | Q7, I8, I18 | Surface capture/spool failures, disk growth and delivery/shortcut problems; export a redacted report with explicit consent. Check current gaps before duplicating health UI. |
| 4 | Clipboard compatibility matrix and targeted adapters | I10, L5 | Test Explorer, browsers, editors and rich/image consumers; label unsupported formats. R14 covers ordinary images as PNG files, not arbitrary OLE virtual files/metafiles. Prioritize reproduced failures. |
| 5 | Typed search filters with autocomplete | I5, I6 | Parse type/app/date/directory tokens with readable invalid-token errors; add true optional descendant-directory matching rather than substring guesses. Preserve existing filters and saved searches. |
| 6 | Snippet version history | **New N1** | Inspect differences and restore a prior snippet text/name/note/group state. Clip revisions already exist; snippet rollback does not. Preserve prior revisions on restore. |
| 7 | Persistent Playground drafts | **New N2** | Opt-in local draft recovery across accidental close/restart, with explicit discard/save; drafts do not silently become captured history. Existing save-to-library remains explicit. |
| 8 | On-demand paste inspector | I29 | Preview destination, line count, invisible characters and line endings, with the actual prepared text. Open deliberately; avoid adding confirmation to every ordinary paste. |
| 9 | Paste text as a file | **New N3** | Explicitly choose a filename and .txt/.json/.csv extension, then paste a generated file into Explorer or an attachment target. R14 images-as-files provides reusable infrastructure; text conversion remains new. |
| 10 | Reusable transform presets | **New N4** | Save a named sequence of existing pure text transforms with preview/undo; originals stay intact. No scripts, network calls or command execution. |
| 11 | Searchable symbols | I26 | Reuse the emoji grid/search/delivery for arrows, math, typography and currency with exact Unicode names. Keep it a tool inside the current shell. |
| 12 | Emoji favorites, recents and preferred tone | I30 | Local optional preferences, predictable ranking and an explicit clear-recents action; catalog/search remain available. |
| 13 | Timed capture pause | **New N5** | Extend the existing manual pause with an optional duration, clear resume time and restart semantics; do not discard any already archived data. |
| 14 | Repair missing file references | **New N6** | Extend existing availability checks with Locate/relink for a selected record. Record the replacement reference explicitly while preserving original provenance; no automatic disk crawl or file archival. |
| 15 | Export selected records as a portable bundle | **New N7** | Export a chosen subset and its images/metadata to a verified ZIP, previewing contents. Complements existing whole-archive JSONL/SQLite exports; import should reuse Q3. |
| 16 | Per-app paste profiles | **New N8** | Optional explicit plain/original-format and line-ending preferences by executable, with visible override. Preserve focus checks and terminal insertion restrictions. |
| 17 | Project-aware snippet and command suggestions | I11, I27 | Use an explicitly selected connected shell directory or app context. Offer related snippets/commands and saved ordered recipes as copy/insert material; never run the recipe. |
| 18 | Built-in date/time/UUID template fields | **New N9** | Extend current literal placeholders with a small documented local allowlist, one stable value per invocation and a preview. No expression language or execution. |
| 19 | Compare related clip variants | **New N10** | Suggest near-duplicate text families and compare changes before reuse. Existing manual two-item diff stays; never automatically merge/delete permanent records. |
| 20 | Quick slots for saved searches | **New N11** | Assign a few existing saved searches to palette aliases/optional configurable keys; jump into the same filtered results. Avoid adding another persistent toolbar. |
| 21 | Copy an edited image derivative | **New N12** | Explicit crop/rotate and copy/save-as-new with preview; preserve original pixels/history. Avoid building a general image editor. |
| 22 | Encrypted local archive | I15 | Fits private local memory, but requires a key/recovery/migration/backup design first. Lower delivery priority because losing a key must not silently destroy the recovery story. No encryption claim today. |

## Disposition of every previous idea

| IDs | Decision | Reason / destination |
| --- | --- | --- |
| I1 | Defer | Sync needs conflict/deletion/device/account design; first finish local restore and portability. The separate mobile proposal does not authorize desktop sync. |
| I2 | Leave deferred by explicit user rule | Ctrl+R stays out until requested again. |
| I3 | Remove from product feature queue | Token-tool migration is tooling, with no demonstrated user gain over current semantic tokens. Revisit only for a chosen design migration. |
| I4 | Park as a design task | Board needs its own user request/reference; it is not a product capability. |
| I5, I6 | Keep, merge | Ranked search/filter work above. |
| I7 | Drop from active direction | Automatic age/count pruning conflicts with the product's permanent-memory default. Existing explicit deletion/recovery remains available; no new automatic deletion work is selected. |
| I8 | Keep, merge into Q7 | Storage/capture failures deserve first-class diagnostics. |
| I9 | Keep as measured quality goals | Not a feature; establish reproducible hardware/datasets before asserting targets. |
| I10 | Keep adapters; defer full file archival | File-content retention changes disk/resource/privacy costs and deserves a separate explicit feature decision. |
| I11 | Keep, merge with I27 | Contextual retrieval and nonexecuting recipes fit deliberate reuse. |
| I12 | Defer | General semantic archive search adds indexing/model cost and unclear value before lexical/filter quality is proven. Offline emoji vocabulary is a different, bounded feature. |
| I13 | Drop execution endpoints and workflow automation; defer output capture | Executing saved clipboard/command content turns a memory tool into an automation runner. Output capture also has distinct volume/privacy/integration costs. |
| I14 | Defer platform expansion | Validate current local hooks first; remote identity/path semantics need a real integration design. |
| I15 | Keep later | Ranked encryption design above. |
| I16–I19 | Keep as engineering work, not four product features | Measure webview/repeat/FTS behavior, test concurrent writers, assess spool overflow and authenticated IPC against actual gaps. Feed diagnostics, performance and release checks. |
| I20 | Remove from future queue as completed | Follow system appearance is implemented; native validation remains open. |
| I21 | Drop active font refinement | Existing mono fallback is adequate absent a legibility report; spend attention on usability. |
| I22 | Conditional accessibility fix | If native narrow-window checks reveal hidden details, implement a focus-managed drawer. Do not redesign speculatively. |
| I23 | Move out of product backlog | Outline the wordmark only when actually shipping standalone artwork. |
| I24 | Keep as a release quality gate | Scaling, startup, icons and native accessibility require real interaction evidence. |
| I25 | Remove from product queue | Historical tooling note, not a capability. Computer control still requires permission. |
| I26–I27, I29–I30 | Keep | Ranked above. |
| I28 | Defer added destination tracking | Existing capture provenance is useful; new persistent destination tracking needs an explicit privacy choice and demonstrated retrieval benefit. |

## Existing queue and platform backlog

Q1/Q2/Q5/Q6 are implemented, not future features; preserve their remaining native checks. Q3/Q4/Q7 remain next in that order. L3/L4/L10 native delivery, design/accessibility and scaling checks are release gates, not optional features to throw away. L6 performance and I17/I19 concurrency/search experiments should accompany the relevant storage/search changes. L7 signing/update/install validation remains release work (repository is connected; signing/hosting configuration is separate). L1 native macOS/Linux and L2 additional shell support stay deferred expansion/compatibility work. L5 maps to rank 4, L8 to deferred sync, L9 to the explicit Ctrl+R hold.

Before selecting any new recommendation, scope it against the then-current catalog to avoid reimplementing existing functionality. This review adds twelve new proposals, not twelve implementations.

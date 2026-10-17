# Roadmap

Owns selected next work, sequence and acceptance. Possibilities without a commitment are in [ideas](ideas.md). Migrated 2026-10-13 from the root ROADMAP.md and HANDOFF.md (originals removed; recovery copy recorded in the [implementation log](../implementation-log.md)). AGENTS.md still requires the in-app feature catalog `src/feature-catalog.tsx` to be kept aligned with this roadmap and [implemented features](../developer/implemented-features.md) after every implementation turn. Planned items are not implemented. Sequence between the R-items and the Q-queue was not stated by the user; the user's follow-up requests through R11 were prioritized.

2026-10-14 documentation pass: root README now introduces implemented behavior for GitHub readers; no capabilities or priorities changed. Q3 remains next and native checks remain open. Two browser-demo screenshots were captured after explicit permission; they do not validate native behavior. Verification evidence: [setup](../developer/setup.md#documentation-verification-2026-10-14).

## Current user-selected priorities (2026-10-17 revision)

The user's implementation request promotes five tools above the previous 15-feature list, preserving both orders. Implement these five now and commit after each two or three implementations. All five are implemented: the first three in R15 (commit `2b616d5`), and editable text diff/extractors in R16 as the second batch. The remaining backlog resumes at Q3. This supersedes earlier Q3-first sequences; stable Q IDs and acceptance stay available. [Original revision and proposal definitions](studies/feature-priorities-2026-10-17.md).

| Priority | Feature | State / reference |
| --- | --- | --- |
| 1 | Region OCR | N16; implemented R15, native H21 pending |
| 2 | JSON explorer, including Paste Playground | N14; implemented R15, native H21 pending |
| 3 | Notes on archived clips | N20; implemented R15, native H21 pending |
| 4 | Text diff tool with editable left/right inputs and highlighted differences | R16; implemented, native H22 pending |
| 5 | Text extractors | N18; implemented R16, native H22 pending |
| 6 | Portable import and verified restore | Q3 |
| 7 | Diagnostics and storage/capture health | Q7, I8, I18 |
| 8 | Clipboard compatibility improvements | I10, L5 |
| 9 | Typed search filters and proper directory matching | I5, I6 |
| 10 | Playground draft recovery | N2 |
| 11 | On-demand paste inspector: destination, invisible characters, line endings | I29 |
| 12 | Paste text as a .txt, .json or .csv file | N3 |
| 13 | Saved sequences of text transformations | N4 |
| 14 | Searchable symbols: arrows, mathematics, typography | I26 |
| 15 | Emoji favorites and recents | I30 |
| 16 | Locate and repair missing file references | N6 |
| 17 | Per-app paste preferences | N8 |
| 18 | Project-aware snippet and command suggestions | I11, I27 |
| 19 | Date, time and UUID template fields | N9 |
| 20 | Crop/rotate images and copy the edited version | N12 |

N references retain their scope definitions in the [original review](studies/feature-review-2026-10-17.md). Omitted features are outside the active selection: scheduled backups (Q4), snippet version history (N1), timed pause (N5), selected-record bundles (N7), related-variant comparison (N10), saved-search slots (N11) and encryption (I15). Preserve them as provenance; omission does not establish permanent rejection. N14, N16, N18 and N20 are now selected by the user; N13, N15, N17 and N19 remain unselected.

## Implemented, awaiting human verification

### R16: Editable text diff and text extractors
- Implemented 2026-10-17 as the second batch. Palette/selected text details and Full clip/Paste Playground expose both tools (Ctrl+Alt+D diff, Ctrl+Alt+E extract in workbench). Diff supports editable physical left/right sides, baseline reversal, aligned changes and Unicode-safe changed spans; line-ending labels, 100,000-character side limits, existing bounded/coarse algorithm and first 1,000 preview rows.
- Extract HTTP(S) URLs, email addresses, absolute Windows/Unix file paths (quote spaces) or custom regex full matches. Preserve source order, optionally remove exact duplicates; explicit copy. Independent worker has 1.5-second deadline, cancellation/unmount termination, 100,000-character inputs, 2,000 results/10,000 scan ceiling; errors/no-match/limits visible. No path existence check or archive mutation during inspection.
- Frontend build/typecheck and 25 UI helpers pass, including production worker adapted to worker_threads for invalid pattern/termination checks. R15 native check/tests and actual cropped-image Windows OCR passed. Human H21/H22 remain pending; no computer UI control or installer. Resume Q3 after these five.

### R15: Region OCR, JSON explorer and archive notes
- Implemented 2026-10-17, first three tools in the user's promoted queue. Region OCR uses normalized backend-validated rectangles mapped from original pixels, original image decoding limits, shared OCR busy guard and existing Windows worker. Result is ephemeral and explicitly copied; no full-image OCR/index mutation.
- JSON explorer appears in the palette/details and in Full clip/Paste Playground through Ctrl+Alt+J (Archivist button too). Strict parsing, exact source slices for values, escaped JSON Pointers and expandable rows; one million input characters and 2,000 tree rows. Large numeric literals are preserved.
- Clip notes are separate metadata, editable via details/palette with Ctrl+S. Literal/fuzzy search, restart, export, backup and deletion recovery preserve them without modifying payloads, revisions or identity; empty saves remove the note.
- Native visual/interaction check H21 pending; no UI automation or installer. The following R16 batch completes the five promoted tools; Q3 remains the next backlog item.


### R14: Collapsed snippet defaults, category focus and recent batch paste
- Implemented 2026-10-17 from the user's follow-up: fresh snippet visits default all groups closed, query reveals matching sections, opt-in browsing memory still restores saved collapse state. Tab Left/Right and Ctrl+Tab/Ctrl+Shift+Tab preserve category navigation; Down enters group headings, refresh respects tab focus.
- Windows original-image replay adds a full-resolution cached PNG file-drop representation for Explorer, keeping image formats. Ctrl+Win+1–9 / palette snapshots up to N distinct recent clipboard records, oldest to newest: one newline-joined text paste or one image/file drop; mixed batches fail without partial input. Excludes shell commands/snippets, independent of queue and library visibility. Focus/modifier/terminal checks retained; registration conflicts reported.
- Frontend build/typecheck, 19 UI tests, Rust check and 59 Rust tests pass (2 ignored). Native H20 pending; no computer control or installer. Existing Reading Room components/hints reused.
- User-requested backlog triage is in the [ranked feature review](studies/feature-review-2026-10-17.md): its priority order is now superseded by the current user-selected priorities above; the original twelve proposal definitions remain useful. Execution/automation and automatic pruning leave the active direction; sync/AI/remote remain deferred, Ctrl+R explicitly held. These proposals are not implemented.

### R13: Keyboard navigation, details reconciliation and text find
- Implemented 2026-10-14 from follow-up feedback: selected Archivist details now use a keyed subtree and distinct preview/transform/timeline keys. R12 sizing/reset alone failed in user testing; native accumulation recheck remains H19.
- Snippet arrows explicitly update row/group state and restore focus after rendering; visible headings/rows include Home/End/PgUp/PgDn, Enter collapse and Down skip hidden rows; Right on an open heading enters its snippets. Emoji Up/Down transfers search focus into the grid so Left/Right navigate cells; text-field caret keys stay usable.
- Shared Full clip/Paste Playground/Expanded Librarian Ctrl+F finds literal case-insensitive text, highlights all matches/counts and active occurrence, wraps Enter/Shift+Enter and F3/Shift+F3, scrolls to active matches; first Escape closes find and returns text focus. Find never changes stored or prepared text. During matches the backdrop uses plain text with find highlights; closing find restores syntax colors.
- Frontend build/typecheck and 18 UI helper tests pass. No Rust changes or installer build; native interaction/visual checks remain pending H19. Q3 remains next after this requested interruption.

### R11: User-defined snippet groups, Librarian state memory and statistics
- **Implemented 2026-10-13** from the user's follow-up: snippets default to collapsible user groups in both windows, Ungrouped last, empty groups and multiple memberships supported; Archivist membership badges. Arrow/W/S heading/row navigation, Left/Right collapse/expand and Enter heading toggle; A/D retain Librarian tabs. Archivist Rename group updates labels and saved filters transactionally, including empty groups, without changing content or tags.
- Librarian state memory is an opt-in native preference, off in new/old settings. Off: All, newest visible library item, cleared search/filters/archive scope, top scroll and result focus. On: previous browsing tab/query/options/scope/selection/group collapses/scroll and loaded pages; tools close. Snapshot uses quick-webview localStorage.
- Archivist duplicate tabs and horizontal metrics removed; sidebar categories retained/extended, dedicated Statistics page adds permanent totals, content size, groups/snippets/pins/library/source counts, repeats, type/source breakdowns and dates.
- Frontend build, 14 UI helper tests, Rust check, 55 Rust tests pass (2 opt-in ignored). H17 pending for native reopen, keyboard and both-theme layout. Complete snippet vault pages load for grouping; large-vault cost unmeasured. Q3 remains next; no installer built.

### R10: Librarian emoji selector and search
- **Implemented 2026-10-13**, requested by the user ahead of Q3. Ctrl+Shift+J/palette opens an offline 3,781-sequence Unicode 16.0 catalog. Category/name/symbol/alias search, incremental rows, existing Reading Room dialog and rows, arrows/W/S navigation and standard Enter/Shift+Enter copy, Ctrl+Enter/Ctrl+Shift+Enter paste. Existing delivery commands accept generated text without creating a synthetic archive item; capture policy still applies on delivery. Windows paste guards retained; glyph coverage depends on fonts. Lazy load keeps catalog out of the main bundle.
- Automated: frontend build/typecheck, 13 UI helpers (including catalog/search sequences), Rust check and 53 Rust tests pass, 2 opt-in tests ignored. Native/visual H16 pending. No installer created.
- Follow-up brainstorming is captured as unselected I26-I30 in [ideas](ideas.md); Q3 remains the next queue item.

State of R1-R4 (the user's 2026-10-13 request): **implemented in source**; build/typecheck/tests passed, native behavior **unverified** (human checks H3-H8 in [status](../status.md#pending-human-checks); steps in the [implementation log](../implementation-log.md)).

### R1: Remove colored button shadows and entry highlight shadows
- Outcome: no colored drop-shadows on buttons and no left-highlight shadow on entries, app-wide, both windows and themes.
- State: **implemented** (all `box-shadow` declarations removed from `src/style.css`, including the earlier `.chip.chosen` underline and toast shadow). Human check H4: selection/focus still visible by outline/background/border in both themes.
- Dependencies: [design system](../design/system.md#references-and-exceptions).

### R2: Fix Ctrl+Shift+O not opening Archivist from Librarian
- State: **failed in user testing and superseded by R7**. Both capture-phase handling and focused native registration of Ctrl+Shift+O failed to resolve the report. The conflict cause is unknown. Current command is Ctrl+Alt+O; H3 now checks that replacement, without claiming native success.

### R3: Syntax Highlighting transform
- Outcome: a Syntax Highlighting option in the Transform picker (Ctrl+T) opening the text in the full-clip view with highlighting; language auto-detected, updatable and manually settable.
- State: **implemented** (`src/transform-picker.tsx`, `src/clip-workbench.tsx` reusing `src/highlight.tsx`). Human check H7 (auto and manual language). Decisions not recorded as made: whether the chosen language is persisted per item/session, and whether a highlighted result can be copied as rich text (existing transforms copy plain text; archive originals are never altered).

### R4: Expanded Librarian, Open Full Clip and Paste Playground
- Outcome: Expanded Librarian temporarily grows to 1040x800 (bounded to the monitor work area) and restores the saved size and position on exit; hosts (1) **Open Full Clip** (Ctrl+O dialog sized like the F1 dialog; Ctrl+Shift+L opens it expanded; select and copy parts; transforms do not alter the original; Ctrl+S saves changes with prior text retained in revisions; Ctrl+Shift+S saves a **new** clip) and (2) **Paste Playground** (Ctrl+Shift+N: in-app pastebin; transform, then save to library or archive only).
- State: **implemented** (`src/clip-workbench.tsx`; Rust `set_quick_expanded`, `save_text_clip` with `Store::capture_text_item` in `main.rs`/`store.rs`; bridge in `src/api.ts`). R5 superseded the original new-clip-only decision: explicit overwrite retains the prior text in `item_revisions`. Human checks H5, H6, H8. Remaining doubts: size restore on every exit path (Escape, blur, hotkey), small-monitor expansion limits, keyboard-only operation, shortcut choices were never reviewed by the user.
- Map: [full clip route](../agent/map.md#full-clip), [windows route](../agent/map.md#windows-tray).

### R6: Librarian navigation, snippets and shortcut discovery
- User request 2026-10-13: **implemented in source**. W/S navigate results, A/D switch tabs outside editors (arrows continue working in search); snippet saves close the modal and restore result focus (R7 supersedes search autofocus). Original Text/Command grouping is superseded by R11 user-defined groups; changing a search expands matching sections. Search placeholders reflect the tab and library/archive scope. F1 shortcuts are individual searchable cards, grouped by related actions when search is empty. R11 defaults reopening to All with cleared query/options and top selection/scroll, with opt-in state memory; PgUp/PgDn reach the top/bottom of current results, with PgDn fetching remaining pages. Large result sets take proportionally more memory/time to load; no performance guarantee. H9 native/visual check pending.

### R9: Archivist controls, pin renaming and snippet vault
- User clarified 2026-10-13: Archivist is a conventional button/menu UI; Librarian tools use shortcuts. This supersedes R8's removal of buttons from the main window. **Implemented in source**: functional item actions menu; Rename pin button/F2 with persisted searchable display metadata separate from payload and snippet identity. Names survive recapture/restart/recovery and export with items; old recovery rows receive an empty title.
- Archivist New snippet/Edit snippet, editor save/cancel/transform, New group/Move selected, dialog Close, library Undo, Full clip and Paste Playground controls are visible buttons. Librarian tool headers/footers retain key hints. F2 edits snippets/renames pins in both windows.
- Snippet vault: named cards with note previews, collapsible groups and group chips (R11 replaces the original type sections); empty-state creation, destination-group chooser for new snippets, atomic save plus membership and current group retained after save, move/drop feedback. Moves replace collections; edits preserve membership. Notes remain outside pasted text. Uses existing Reading Room tokens and single row focus border. Automated checks recorded in status/log; native and visual H15 pending, no UI automation authorized this turn.

### R8: Restore keyboard-first UI and remove doubled result focus
- User screenshot feedback 2026-10-13: remove clutter from the last additions across both windows and preserve keyboard-first tools. Implemented: compact group chips below tabs; Ctrl+Alt+G creates a group, Ctrl+Alt+M moves through arrows/Enter; group actions also in palette/F1. Ctrl+Alt+S saves Full clip/Playground text as snippet; Ctrl+T edits a selected snippet, Ctrl+S saves and Ctrl+T transforms within its editor. Added inline edit/create/save/undo buttons and the snippet transform dropdown replaced by shortcut hints/dialogs. Librarian tool headers use Esc hints; Archivist Close buttons restored by R9. Result focus uses the existing single accent border/background, with other controls using inset outlines. Frontend build, 11 UI helper tests and both-theme browser keyboard/layout checks pass; native H14 pending.

### R7: Follow-up keyboard and snippet workflow
- State: **implemented in source 2026-10-13**. Ctrl+Alt+O replaces the user-reported failing Ctrl+Shift+O in frontend/native handling and command discovery; focused registration failure is reported in health, with the Archivist button as fallback. Librarian opens at the first result with result focus; Ctrl+K starts search. Saved snippets return to results.
- Ctrl+T edits snippet name/note/content in either window; persistent separate notes up to 10,000 characters, transformations inside the editor, no snippet transform controls in the sidebar. Librarian uses Ctrl+Alt+S in Playground/Full Clip; R9 restores the corresponding Archivist buttons.
- Archivist group creation/browsing uses collections and `Group: …` saved searches (including empty groups). Drag rows onto group chips to replace collection membership; keyboard Move selected clip equivalent. Tags/content/history stay intact. All groups shows all entries; dropping there removes collection memberships. Native interaction H12 pending.
- Three selected extra features: Q2 OCR excerpts, Q6 library-aware fuzzy candidates and I20 Follow system appearance (before first paint, live OS updates and window-to-window preference synchronization). Earlier R6/Q1/Q5 remain implemented and documented; R2 failure is now explicit.

<a id="next-agent-queue-q1q7"></a>
## Next-agent queue (Q1-Q7)

Q1, Q2, Q5 and Q6 **implemented in source 2026-10-13**, native checks pending H9-H13. Q3 and Q7 remain **selected, not implemented**; Q4 is outside the current selection. I20 system appearance is also implemented. The promoted five-tool sequence above takes precedence; after it, Q3 then Q7 resume. Stable Q IDs and acceptance are retained from the 2026-10-12 HANDOFF.md; their original numeric order no longer defines priority. Preserve everything listed in [behavior to preserve](../developer/implemented-features.md#behavior-to-preserve-from-the-2026-10-12-handoff). Delivery expectations for each: report actual test results and limitations; build no-bundle executables when useful (`npm run launch`), avoid installer churn; update the feature catalog and documents with completed behavior; leave unfinished tasks here; give the user a short next-step list. Do not enable startup, modify real shell profiles or delete real user history to test; use isolated data.

### Q1: Undo library clearing
- State: **implemented 2026-10-13**. `library_clear_snapshot` stores the latest nonempty clear transactionally, survives restart and merges into current membership. Deleted IDs cascade out; repeat undo is idempotent. F1, palette, Ctrl+Shift+Z and the post-clear Undo banner expose it. CLI `library undo-clear` and stdio `undo_library_clear` share the behavior. Full SQLite backups preserve the snapshot; portable JSONL exports and individual deletion recovery intentionally omit it (visibility undo belongs to the source archive). Isolated Rust/CLI tests pass; native H10 pending.
- Touchpoints: `src-tauri/src/library.rs`, `main.rs` commands, `archive_io.rs`, `src/main.tsx`, `src/api.ts`, CLI/API commands (`cli.rs`), shortcut reference.
- Requirements: transactional, durable snapshot of the membership removed by a clear. Obvious Undo action in Librarian after clearing and a discoverable Archivist/library action. Default to undoing the most recent **nonempty** clear; an empty clear must not discard a useful snapshot. Undo merges the prior membership with clips captured since clearing, preserving both. Do not revive permanently deleted items or change payloads, occurrences, pins, labels or OCR. Repeat undo is idempotent; semantics survive restart. Decide and document how backup/export carries the snapshot. Distinguish this visibility operation from deletion recovery (already opt-in). No confirmation flow is needed for clearing.
- Acceptance: clear, recapture/new item, undo restores the union; no deleted item is recreated; empty/repeated clear and undo are predictable; restart preserves undo; archive counts/content unchanged. Cover native and CLI/API paths using isolated data.

### Q2: OCR match previews
- State: **implemented 2026-10-13**. Search rows return `ocrMatch` with a maximum 240-character excerpt plus ellipses, UTF-16 highlight offsets and approximate-match label. Literal matching uses the whole query; fuzzy previews highlight the first recognized word matching one query word (not proof that every term occurs in OCR). React text nodes escape markup. One SQL result-page query supplies derived text; empty-query browsing skips reading OCR text. Original image identity/thumbnails remain. Unicode, long text, fuzzy/scope/pagination and unchanged scan timestamp tests pass. Native H13 pending.
- Touchpoints: `src-tauri/src/search.rs`, `store.rs`, `ocr.rs`, `src/image-preview.tsx`, `src/main.tsx`, `src/api.ts`, OCR details.
- Requirements: when image text matches a query, show a bounded recognized-text excerpt around the match in the result list with accessible highlighting, and the matching text in image details. Keep thumbnail and original-image identity visible. Do not change stored text or re-run OCR for a preview. Return derived match metadata, not the entire OCR text for every search row. Handle literal and fuzzy matches, Unicode, empty queries, long OCR, library/archive scopes and pagination. Use React text nodes (no raw HTML injection). No database read per result and no full image payloads during text search. If bounding boxes are unavailable, present textual matches honestly rather than inventing spatial boxes.
- Acceptance: a screenshot whose filename does not match but recognized text does has a useful excerpt; matching text is escaped; fuzzy behavior documented; list/search stays bounded; browsing never changes scan timestamps.

### Q3: Portable archive import and verified backup restore
- Extend existing JSONL export/SQLite verification into a usable import/restore flow. Validate schema, checksums, limits, references and preview counts before mutations. Portable import merges transactionally and idempotently and preserves Unicode, representations, occurrences, snippets, labels, OCR and library scopes. Full backup replacement needs a concrete preview and user approval, a pre-restore backup, closed DB handles/worker coordination and rollback. `settings.json` is outside the database: state explicitly what is restored. Test corrupt files, repeat imports, older supported formats, partial failure and active capture. (Currently export-import and automatic restore are not implemented.)

### Q4: Opt-in scheduled verified backups
- State: outside the active selection after the user's 2026-10-17 edited list; acceptance retained for possible reconsideration.
- Configured destination, interval, last/next status and manual run; disabled by default. Use existing consistent-snapshot verification, unique filenames and one job at a time; report disk/permission/verification failures. Keep every backup by default; any retention/deletion must be explicitly configured and restricted to files this feature generated. Test schedule persistence, pause/restart behavior and no overwrites.

### Q5: Tags and collections in Librarian, with bulk organization
- State: **implemented 2026-10-13**. F1, palette and Ctrl+Shift+G open `src/bulk-organization.tsx`: select up to 500 loaded items (text, commands, images, files and snippets), add/remove comma-separated tags and collections, preserving unrelated labels. Native `bulk_organization` validates and commits the whole selection atomically, deduplicates case-insensitively and caps each label kind at 32. Existing Ctrl+Shift+F filters browse tags/collections. Rust tests cover mixed types/snippets, rollback, duplicates and clear/restore invariance. Native H11 pending.
- Extend item labels into a keyboard-accessible dialog and palette actions for applying/removing labels across a selection. Make collection/tag browsing usable without growing the footer. Clear library, permanent deletion/recovery and bulk label changes keep their distinct semantics. Test transaction rollback, mixed item types, duplicate labels and restored items.

### Q6: Library-aware fuzzy indexing and large-archive search tuning
- State: **implemented 2026-10-13**. `fuzzy_ranked_scoped` applies library/snippet scope to vocabulary and item postings before the 1,000/20,000 budgets; archive candidates exclude snippets. Stable term/ID ordering and existing ranking/pagination retained; literal coverage unchanged. A synthetic 21,001-item regression (one visible item, 1,101 terms, 21,000 archived competitors) retains the library match and isolates snippets. Remaining limits: candidate budgets still apply within the chosen scope; type/source/tag filters are applied later; million-event/disk/concurrency and production latency remain unmeasured.
- Local measurements, Windows x64, AMD Ryzen 7 7800X3D, Rust debug build, in-memory SQLite, single runs: 10,000 synthetic command captures/indexing 2.263 s; first 50 literal results 59.70 ms, broad fuzzy 105.19 ms. Sparse-library regression two page queries together 10.67 ms (first result plus empty next page). Not production guarantees or p95 measurements; disk is not exercised. Native H13 pending.

### Q7: Actionable integration health diagnostics
- Extend connected-shell indicators with stale heartbeat, capture readiness, insertion capability, adapter/version mismatch and a readable last error. Provide safe copyable setup/repair instructions and an explicit repair action through existing installers where applicable. Distinguish PowerShell, CMD/Clink, Bash/Zsh/Fish and WSL limitations. Preserve profile backups/idempotency, no unsolicited real-profile edits, and insertion without Enter. Exercise isolated profiles and stale/unsupported sessions.

<a id="later-platform-validation-and-release-backlog"></a>
## Later: platform, validation and release backlog

Not started; sources are the root ROADMAP.md backlog, the HANDOFF "remaining work" list, and "not yet validated" statements in STATUS.md, README.md, DESIGN.md and the Reading Room records. Signing keys stay outside the repository.

| ID | Item | Notes |
| --- | --- | --- |
| L1 | Native macOS/Linux clipboard capture, replay, focus restoration and OCR adapters | Windows-only today; experimental Unix shell hooks are not native platform support |
| L2 | Real Bash/Zsh/Fish/WSL compatibility and multiline editing validation | Zsh/Fish hooks untested in their real shells; Bash needs emacs Readline and standard Enter, alternate bindings and multiline submission incomplete; WSL process health/PID verification unavailable |
| L3 | Interactive Windows validation: focus restoration across apps, elevated destinations, Windows Terminal tabs, real shell editing, alternate submission paths (alternate accept bindings, custom Enter, Vi mode, other paste paths) | human check H1 |
| L4 | Visual and accessibility review of the Reading Room theme; interactive native cold/persisted startup (flash of wrong theme), monitor-bounded Librarian sizing, Windows 100-200% scaling, taskbar icon contrast, screen readers/high contrast, footer/dialog focus, live clipboard formats/images, OCR states, paste destination restoration | human check H2; also validate automatic OCR scheduler interactively |
| L5 | Broad clipboard format fidelity: native bitmap/metafile handles, OLE virtual files, app-private formats need explicit adapters | design draft 0.2 asks for a fidelity matrix and honest limitation messages |
| L6 | Million-event search/ingestion performance benchmarks and tuning; performance targets of the design draft (see [ideas I9](ideas.md)) | no latency, memory or million-event result is proven; literal search is used although FTS is maintained |
| L7 | Signing and releases: Windows code-signing certificate, updater signing key (private key held locally) and public key, release repository/HTTPS feed (default plan: GitHub Releases with `latest.json`; no repository connected yet), signed installers, real install/update tests | see [release](../developer/release.md) |
| L8 | Cross-device sync, explicitly later | no design; see [ideas I1](ideas.md) |
| L9 | Ctrl+R shell search powered by Archiver | **explicitly deferred**; do not implement until the user requests it again (AGENTS.md) |
| L10 | Reading Room native checks listed in the study migration record | [MIGRATION.md remaining interactive validation](../design/reading-room/MIGRATION.md) |

### R12: Emoji grid/meaning search and Archivist cleanup
- Implemented 2026-10-13 from user feedback: responsive emoji grid, offline curated meaning search (including scared), column-aware keyboard movement, existing delivery keys, snippet-only group UI and drag/drop, tags-only ordinary details, compact header and bounded details/image layout with selection scroll reset. Previous labels/history remain preserved.
- Frontend build/typecheck and 16 UI helper tests pass; no Rust changed. H18 native/visual review pending, including reported right-column image-list issue whose exact cause is unconfirmed without UI inspection. No browser/computer automation or installer. Q3 remains next; general semantic archive search (I12) remains deferred.

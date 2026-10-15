# Status

Startup snapshot. Capability baseline: [implemented features](developer/implemented-features.md); dated verification narrative: [history](history/status-2026-10-12.md).

## Current state

Windows-first Tauri/Rust/React clipboard and command archiver (Librarian quick panel + Archivist full window). Capability baseline: [implemented features](developer/implemented-features.md). Latest implementation 2026-10-14: R13 replaces the selected-details subtree with distinct preview/transform/timeline keys to address accumulating controls, explicitly restores snippet navigation focus and transfers emoji search focus into its grid, and adds Ctrl+F find/highlighting in Full clip, Paste Playground and Expanded Librarian. Native verification pending H19. Earlier 2026-10-13: R12 replaces the emoji list with a grid/meaning search and limits groups to snippets, compacts the Archivist header and bounds/reset details; R11 adds user-defined snippet sections, membership badges, group renaming, opt-in Librarian state memory, sidebar-only Archivist categories and a dedicated Statistics page. R10 adds offline emoji search and standard copy/paste delivery; R9 restores the user-defined split—Archivist buttons/menus, Librarian shortcuts—and adds durable pin names and a navigable snippet vault, following R7 keyboard/snippet/group work plus Q2 OCR match excerpts, Q6 library-scoped fuzzy candidates and I20 Follow system appearance. Earlier R6/Q1/Q5 remain implemented. User reports Ctrl+Shift+O still fails; it is retired in favor of Ctrl+Alt+O, whose native behavior remains unverified. R5 full-clip Ctrl+S saves with revision history; Ctrl+Shift+S saves a new clip. Remaining queue: Q3 import/restore, Q4 scheduled backups, Q7 health diagnostics.

## Active work and last stopping point

- **Repository preparation (2026-10-14)**: user supplied `https://github.com/NicolasCapparelli/archiver.git` and authorized push. Remote was empty; initialized local `main` and configured `origin`. Preparing initial source/documentation commit, excluding dependencies, builds, logs and generated Tauri schemas. Credential-pattern scan of candidate text found no matches. Prior runtime checks remain applicable; no runtime source changes.

- **Documentation handoff (2026-10-14)**: root README expanded for GitHub newcomers/employers, with source-grounded features, setup/configuration, architecture and explicit limitations. Setup data-path errors corrected. Build, 18 UI helpers, Rust check, 55 Rust tests (2 ignored), shell/setup, 2 CLI tests and synthetic Windows OCR pass; CLI README example and demo HTTP routes pass. Clean install/native launch not exercised. With explicit permission, two synthetic-demo browser screenshots captured, visually checked and embedded from `docs/images/`. No runtime change; capability catalog/baseline reviewed, Q3 remains next. [Evidence](developer/setup.md#documentation-verification-2026-10-14).

- **Stopping point**: R13 implemented; frontend build/typecheck and 18 UI helper tests pass. H19 needs native keyboard/details/find verification. R12 details sizing alone did not resolve the user-reported accumulation. No task currently in progress.
- **To see the latest state, run `npm run launch`**: rebuilds via `tauri build --no-bundle` and starts the executable detached. No installer build was made.
- R11 verification: frontend build/typecheck, 14 UI helper tests, Rust check and 55 Rust tests (2 opt-in ignored) pass. Group rename/restart/search references/duplicate rollback, memberships, empty groups, settings compatibility and statistics/history preservation covered. No browser/computer automation, native launch, visual check or installer this turn; H17 pending.

## Next steps and context

1. Run `npm run launch` and check R13 repeated snippet navigation, emoji Left/Right, repeated detail selection and Ctrl+F in text tools (H19), then R12 emoji grid/scared search, snippet-only groups, compact header and details (H18), then user groups, rename, state memory/default reopening and Statistics (H17), then emoji catalog (H16), plus Archivist buttons/menu/pin names/vault and Librarian shortcuts (H15), Ctrl+Alt+O (H3), and H12/H13, plus prior H1-H11 as applicable.
2. Next queued work is [Q3 import/restore](planning/roadmap.md#q3-portable-archive-import-and-verified-backup-restore), unless reprioritized. Q1/Q2/Q5/Q6 are complete in source; native checks remain.
3. Keep the feature catalog, [implemented features](developer/implemented-features.md) and [roadmap](planning/roadmap.md) aligned after implementation turns.

Routes: [map](agent/map.md), [setup](developer/setup.md), [design](design/README.md).

## Pending human checks

| ID | Action | Expected | State |
| --- | --- | --- | --- |
| H1 | Interactive Windows paste: Ctrl+Enter into other apps, elevated apps, Windows Terminal tabs; insert command (no Enter) into a real PowerShell/Clink session | Focus restored or a clear error; text inserted verbatim, never executed | pending; [roadmap L3](planning/roadmap.md#later-platform-validation-and-release-backlog) |
| H2 | Native Reading Room review: cold start, monitor/DPI, screen reader, footer/dialog focus; automatic OCR scheduler interactively | Matches the checklist in [reading-room/MIGRATION.md](design/reading-room/MIGRATION.md#remaining-interactive-validation) | pending; roadmap L4, L10 |
| H3 | Press Ctrl+Alt+O in Librarian (results/search, dialog and palette) | Archivist opens/focuses; registration conflicts produce a health error, button remains available | replacement pending; user reported old Ctrl+Shift+O failed despite prior fixes; root cause unknown |
| H4 | Inspect buttons and result rows in both themes | No colored drop-shadows or left-highlight shadows; selection/focus still visible | pending (R1 implemented, unverified) |
| H5 | Ctrl+Shift+N (and Ctrl+Shift+L on a clip): Librarian grows; exit by Escape, blur and hotkey | Original size/position restored every time; bounded on a small monitor | pending (R4, see [log](implementation-log.md)) |
| H6 | Ctrl+O: select/copy, transform, Ctrl+S, Ctrl+Shift+S | Ctrl+S saves changes with previous text retained in revisions; Ctrl+Shift+S creates a new clip | pending (R5 feedback) |
| H7 | Transform picker, Syntax Highlighting: auto-detected and manual language | Highlighting applies; language changeable | pending (R3) |
| H8 | Paste Playground: save to library, then save archive-only | Library save appears in Librarian; archive-only does not (visible with Ctrl+Shift+A) | pending (R4) |
| H9 | Save a text and command snippet, navigate with arrows and W/S outside editors, A/D tabs, collapse/reopen groups, search; F1 command/key search; PgUp/PgDn on >50 results; close/reopen Librarian; review both themes | Keyboard navigation works after save; groups follow visible result order; typing remains normal; contextual placeholders/cards clear; top/bottom and reopen work | pending; R6 |
| H10 | Clear library, make a new capture, restart, Ctrl+Shift+Z / F1 Undo; repeat clear on empty library and repeat undo | Prior membership merges with new captures, empty clear keeps snapshot, no archive loss or deleted item revival | pending; Q1 |
| H11 | Ctrl+Shift+G: select mixed items/snippets, apply duplicate tags/collections, remove one label, browse via Ctrl+Shift+F filters; force invalid name | Only requested labels change, duplicates collapse, invalid batch changes nothing, keyboard focus remains usable | pending; Q5 |
| H12 | Open/reopen Librarian and use WASD immediately, Ctrl+K search; edit snippet name/note/content, transform inside editor, save and navigate; Playground Save as snippet; Archivist create/drop/move groups, restart | Result focus, no sidebar snippet transforms, notes never pasted, group moves replace collections but preserve tags/history; empty groups survive restart | pending; R7 |
| H13 | Search OCR-only literal and typo text, inspect row/detail highlights and image identity; test library/archive fuzzy scope; select Follow system, change OS appearance with both windows open, restart | Bounded escaped excerpt, approximate label, no rescan; scoped matches; correct prepaint/live theme in both windows | pending; Q2/Q6/I20 |
| H14 | Inspect group strip and result focus in both themes; Ctrl+Alt+G create, Ctrl+Alt+M move; Full clip/Playground Ctrl+Alt+S; snippet Ctrl+T transform and Ctrl+S save; Escape nested dialogs | Librarian has no added inline action buttons; no raw group form/doubled border; shortcuts and result/editor focus work; native group move/drop persists | pending; R8, Archivist buttons superseded by R9/H15. User screenshots rejected R7 visual UI; new browser checks are not native confirmation |
| H15 | Archivist pin rename/button/menu/F2, snippet group creation/edit/moves and workbench buttons; Librarian F2/WASD/shortcut footers; restart and both themes/narrow widths | Names searchable and copied payload unchanged; snippet group save/moves persist, notes never pasted; clear controls and menu dismissal, no doubled focus | pending; R9; no visual/native automation authorized this turn |
| H16 | Ctrl+Shift+J/palette in Librarian, search `heart`, `:thumbs_up:`, `lol`, skin tones and flags; category/no-match, arrows/W/S, Ctrl+K, PgUp/PgDn, Escape; Enter/Shift+Enter and Ctrl+Enter/Ctrl+Shift+Enter from Notepad; invalid/closed target; both themes and narrow widths | Complete Unicode payloads copied/pasted with previous app restored, terminal guards/errors retained; search typing intact; visible single selection/focus and scrolling; failed delivery stays actionable | pending; R10; automated catalog/search/build checks pass, no visual/native automation |

| H17 | Create empty/mixed-type/multi-membership groups, collapse and search in both windows; arrows/W/S headings/rows, Left/Right toggle and A/D tabs; rename populated/empty/case-only/conflicting groups, restart; Librarian close/reopen from a searched/scrolled tab with memory off/on; sidebar and Statistics in both themes/narrow widths | User groups and membership cues accurate; no duplicate type sections; rename preserves tags/content and updates filters, conflict changes nothing; off opens All/latest/library/top with result focus, on restores browsing and scroll; sidebar is sole category navigation, complete stats preserve history after clear | pending; R11; automated build/helper/backend checks pass, no native/visual control authorized |
| H18 | Emoji grid at different widths, scared/nervous/tired search and arrows/WASD; normal copy/paste modifiers; Archivist history vs Snippets groups; switch between text/image/command details, scroll, resize; review header and both themes | Meaning matches and grid selection work, no groups outside vault, details show selected record from top with bounded preview, compact header; right-column image-list report resolved | user reports navigation/details failures after R12; R13 addresses duplicate keys and focus; H19 recheck pending |
| H19 | Snippets: repeatedly navigate rows and headings with arrows, Enter collapse then Down to next group, Home/End/PgUp/PgDn; emoji: Down from search then Left/Right; click 30 mixed clips/snippets/images; Ctrl+F in Full clip/Playground/Expanded Librarian, next/previous, no-match, Escape and copy/save | Focus remains usable, collapsed rows skipped, one selected details subtree without accumulating Transform controls; literal matches/count and active scrolling, first Escape dismisses find, subsequent Escape exits viewer; original text unchanged by finding | pending; R13 source fixes and helper checks, no authorized UI automation |

## Blockers and open questions

- None blocking. Release prerequisites that need the user (signing certificate, updater key and hosting) are in [roadmap L7](planning/roadmap.md#later-platform-validation-and-release-backlog).
- R2/R5 hotkey fixes failed in user testing. Conflict cause is unknown; Ctrl+Alt+O replaces the chord and awaits H3.
- Design-board creation deferred (no user request; see [ideas I4](planning/ideas.md)).
- Open decisions on R3/R4 (language persistence, rich-text copy, small-monitor limits) are noted in the [roadmap](planning/roadmap.md#implemented-awaiting-human-verification).

## Last verified state

2026-10-14 documentation pass: all eight documented build/check/test scripts passed on existing dependencies; isolated CLI example passed; synthetic demo started and both routes returned HTTP 200. Two approved synthetic-demo screenshots captured and reviewed; no fresh install or native launch. [Full scope and unrun commands](developer/setup.md#documentation-verification-2026-10-14). Runtime source unchanged; H1-H19 remain pending.

2026-10-14 R13: frontend build/typecheck and 18 UI helper tests pass, including literal Unicode/multiline find and match wrapping. No Rust changes, native launch, visual checks, computer/browser automation or installer build. H19 pending.

2026-10-13 R12: frontend build/typecheck and 16 UI helper tests pass. New tests cover meaning queries/literal ranking and responsive grid index bounds. No Rust changes or Rust rerun; no computer/browser automation, native launch or visual confirmation. H18 pending.

2026-10-13 R11: frontend build/typecheck, 14 UI helper tests, Rust check and 55 Rust tests pass (2 opt-in ignored). Prior R10 emoji catalog/search checks remain included. No native launch, UI automation or visual verification; H17 and earlier human checks pending. Source recovered after a failed Unicode write and rechecked as a full application build. No installer or commit; workspace has no Git metadata. Rust hard-link cache warnings fall back to copying.

## Last meaningful update

2026-10-14: R13 keyboard/details fixes and shared Ctrl+F text find. Prior R12/R11 behavior retained; user-reported R12 details failure now awaits H19 recheck. Q3 remains next.

# Librarian scientific calculator — living implementation plan

Origin: user request, 2026-10-19. **Selected and authorized for implementation**, ahead of priority 8; roadmap owns subsequent queue order. This file records decisions and progress as implementation proceeds.

## Experience and decisions

Use the expression-list interaction of [Desmos Scientific](https://www.desmos.com/scientific) as inspiration: write an expression, see a live answer, press Enter to commit a row and continue. Keep Archiver's Reading Room styling and keyboard-first Librarian. This is a local scientific worksheet, not a graphing service or embedded website.

- Arithmetic, powers, parentheses, implicit multiplication, factorial/percent, constants, scientific functions, named variables, `ans`, DEG/RAD. Double-precision real numbers; errors explain invalid syntax/domain/overflow. No JavaScript evaluation or network execution.
- Live previews are temporary. Every successful Enter permanently archives expression, result, angle mode, timestamp and the variable/previous-answer context needed to reuse it. Re-evaluation appends history; never silently overwrites a saved calculation.
- Reuse existing archive text items plus a versioned structured representation. Existing search, notes, pins, export/import, backup and recovery then preserve calculations without a parallel database. Save archive-only by default; exclude calculation records from recent clipboard batches. Copy a result explicitly.
- Open with Ctrl+Shift+M or palette/F1. Desmos-style expression sheet above a fixed keypad, accessible editor and keyboard hints. Saved calculations load in pages; reuse restores context explicitly. Local Clear hides sheet history and retains the permanent archive, current input and variables (R19 replaces the R18 New worksheet action).
- Change Windows recent-paste registration/reservation/errors and all current help to Ctrl+Alt+1–9; keep payload ordering, delivery guards and palette fallback.

## Concrete steps and acceptance

1. [x] Inspect existing keyboard, dialogs, storage, recent-paste and export/import routes; choose durable data shape and record this plan.
2. [x] Replace recent-paste chords with Ctrl+Alt+1–9; review registration, conflict handling, palette and current documentation.
3. [x] Build a bounded offline expression parser/evaluator. Verify precedence, angle modes, variables/ans, implicit multiplication, domains and malicious/oversized input with automated tests.
4. [x] Add native save/paged-history commands and frontend bridge using existing archive records. Verify restart, context fidelity, search, clear-library, export/import/backup/recovery and clipboard-batch exclusion with isolated fixtures.
5. [x] Add calculator worksheet dialog, live answers, append-on-Enter, saved history/reuse, result copying, new worksheet (superseded by R19 local Clear) and accessible errors/loading. Wire shortcut/palette/F1 and reopen cleanup; reuse semantic tokens.
6. [x] Run frontend build/helper tests and Rust check/tests; review diffs and changed links. Align catalog, implemented features, data model, map, usage, design, roadmap/status and implementation log.
7. [ ] Human native check: run `npm run launch`; verify calculator in both themes/narrow Librarian, keyboard/focus, close/restart/history, local Clear versus Archive, variable context and result copy; test Ctrl+Alt+1/4/9 in another app and mixed-batch errors. Computer/UI automation requires explicit user permission and is not implied by implementation.

## Deferred possibilities (not implemented or newly selected)

Graphing, symbolic algebra, arbitrary precision, matrices, units, custom functions, editable dependency graphs and automatic evaluation of clipboard contents. R22 implements unfinished-draft recovery below. Start with immutable evaluated rows and explicit context reuse; do not imply full Desmos parity.

## Evidence and stopping point

R18 implemented 2026-10-19. Frontend build/typecheck and all 28 UI helpers pass; Rust check and 73 library tests pass (3 opt-in ignored), plus the main-binary all-nine-shortcuts test. Parser cases cover precedence, implicit multiplication, DEG/RAD, immutable variables/ans, invalid/domain/overflow, hostile input and bounds. Isolated native fixtures cover atomic archive-only records, distinct repeated submissions, 50-row pagination/ties, clear-library/restart, export/import twice, backup/recovery, immutable overwrite and metadata/clipboard exclusion. Reviewed source diffs and current documentation links. No native launch, visual/interaction check, computer/browser automation, installer or commit. Step 7 remains pending H25/H26; run npm run launch. Priority 8 clipboard compatibility remains next after this feature. No graphing/CAS or draft recovery is implied.

## R19 refinement — selected from user screenshots, 2026-10-19

The user accepted the foundation but rejected R18's cluttered stacked form. Their Desmos screenshot supplies the interaction/composition reference; Librarian's Reading Room colors/type remain authoritative. Replace permanent help paragraphs and duplicate worksheet/history sections with one sheet, a live entry row and an anchored keypad. Full mathematical typesetting/structured equation editing is outside this refinement; expressions remain editable plain text.

1. [x] Replace the stacked form with a bounded sheet, left expression/right answer rows, direct reuse/copy, inline preview and a compact header.
2. [x] Anchor a four-row keypad: Main / abc / func pages, DEG/RAD, undo/redo edits, science keys, numbers/operators, cursor navigation, backspace and Enter. Use existing paper/spruce surfaces and focus tokens.
3. [x] Separate visible sheet history from permanent Archive. Clear persists a local display boundary, leaves input/variables/ans intact and never calls archive deletion; new saves remain visible even at the same millisecond or after a backwards clock change. Archive still pages/reuses/copies hidden records.
4. [x] Move instructions/context into optional Help; retain errors/loading/retry, empty states, accessible labels and focus restoration. Scope frame overrides to Calculator, keeping other tools unchanged.
5. [x] Verify frontend build and all 30 helper tests, including visibility preference reload, archive immutability, older pages, timestamp ties/clock changes, future imported rows and invalid preferences. Update catalog and Continuity.
6. [ ] Native human check (H25): run npm run launch; compare both themes at 480x720 and narrower sizes, scroll long expressions/history while keypad stays fixed; type/use every keypad page, undo/redo/caret/backspace, copy/reuse, Clear/reopen/restart/Archive/new save and retained working variables. Native visual/focus behavior remains unverified; computer/browser automation was not authorized.

The display boundary is a WebView-local preference, separate from portable archive records. Clearing browser/WebView preferences resets it; a storage failure explicitly reports session-only visibility. Existing desktop permanent calculation storage and Ctrl+Alt+1–9 recent-paste behavior are retained. Priority 8 clipboard compatibility remains the next implementation queue item after this refinement.

## R20 expanded opening and continuous keyboard entry, 2026-10-19

User selected two corrections: default to Expanded Librarian when opening Calculator, and fix lost focus after Enter. R20 implemented these, but its modal presentation is superseded by R21 below; the focus fix is retained. Suggestions below remain proposals.

1. [x] Include calculator-open state in Librarian's existing native expansion effect for both shortcut/palette. Reuse monitor-bounded 1040x800 target and prior geometry restoration; do not resize Librarian from Archivist.
2. [x] Close the calculator on Librarian blur, releasing its expansion request; Escape/dialog close also restores the prior window geometry.
3. [x] Fix the Enter focus race: disabling the editor blurred it, and the old finally block tried to focus it before React re-enabled it. Keep it read-only/focusable while saving, retain the submission guard, block edit undo during save and focus without scrolling on completion/failure. Failed saves retain input.
4. [x] Frontend build/typecheck and all 30 existing helper tests pass. Review diff/links and align catalog, usage, design, map, status, baseline and roadmap/log. No native code change or installer.
5. [ ] Native H25: open via shortcut and palette; expect Expanded Librarian, then prior geometry after Escape/blur/reopen. Repeatedly type an expression, Enter, immediately type the next; use keypad Enter and an invalid/failed save. Expect editor focus retained/restored, no duplicate save, preserved input on failure and usable caret/undo after completion. Check Archivist leaves Librarian geometry alone. No browser/computer UI automation was authorized or performed.

### Suggestions, not selected for implementation

Ordered proposals based on this calculator's current source and the user's Desmos/archive direction:

1. **Keyboard history recall**: Up/Down from the input recalls prior expressions, with Down returning to the unfinished draft. Keep original-context restoration explicit and append new records on reevaluation.
2. **Math-aware editing/display**: natural fractions, superscript powers and roots, paired parentheses and caret navigation. Preserve exact source/context in the archive; choose a structured editor only after a focused prototype.
3. **Draft and working-context recovery**: restore unfinished expression, angle mode, variables and ans when reopening; distinguish temporary work from permanently submitted rows. Reset work should remain separate from Clear history.
4. **Function/variable completion**: lightweight suggestions plus argument hints (for example min(a,b)); show a useful missing-parenthesis location without persistent help clutter.
5. **Named calculation sheets**: group related immutable rows under a title and optional note, with archive search/reopen. This extends Archiver's usefulness for budgets, measurements and repeated checks without silently changing old results.

At R20 these were brainstorming only; R22 below implements suggestions 1–4 plus last-result copy after explicit user selection. Named sheets remain unselected, and priority 8 follows calculator work. Graphing/CAS remain deferred. Native interaction verification is still needed for the implemented corrections.

## R21 Paste Playground feature shell, 2026-10-19

User clarified that only the feature should open expanded, exactly like Paste Playground. R20 expanded the window behind a calculator modal; this replaces that presentation with the existing inline feature shell.

1. [x] Include Calculator in the existing expanded-view state and render branch, replacing library content with the shared brand/Esc header and full-height calculator. Reuse Paste Playground native geometry effect and blur cleanup.
2. [x] Render the sheet/keypad inline in Librarian; keep ToolDialog only in Archivist. Focus the editor on inline mount; retain read-only save/focus behavior. Route Escape back to Librarian and bypass library shortcuts while the feature owns the view.
3. [x] Reuse existing theme colors, shell spacing and bounded flex/scroll layout. Preserve local Clear, archived rows and immutable calculation storage.
4. [x] Frontend build/typecheck and all 30 helper tests pass; source/links reviewed and catalog/Continuity aligned. Helpers do not test native geometry, rendering or focus.
5. [ ] H25: run npm run launch; open by shortcut/palette, compare with Paste Playground: one full feature view, no library behind a modal. Editor starts focused; Enter keeps entry usable. Escape returns to library and original geometry; blur/reopen resets the feature. Check both themes, narrow widths, fixed keypad/history scroll, Clear and permanent Archive. Archivist remains a dialog. No computer/browser UI automation authorized or performed.

Priority 8 remains next. Earlier suggestions are unselected; no additional feature scope or data migration.

## R22 editing and recovery, selected 2026-10-19

User selected implementation of last-result copy, history recall, natural math editing, recovery and completion, then commit/push. This supersedes the unselected state of suggestions 1–4 above; named sheets remain deferred.

1. [x] Integrate a local structured math editor for fractions, powers and roots, retaining bounded plain-expression archive/evaluator compatibility. Bundle all assets offline.
2. [x] Add Ctrl+Shift+C for the last successful result; Up/Down history recall restores the unfinished draft including its context. Distinguish recall navigation from nested math navigation.
3. [x] Persist a validated versioned local working draft, variables, angle mode and ans on edits and successful submissions; restore on reopening/restart without creating archive records. Report storage failures.
4. [x] Add function/variable completion, argument hints and paired parentheses, with explicit acceptance and keyboard guidance.
5. [x] Add meaningful editing/conversion/recovery tests; build/typecheck and native checks appropriate to the combined uncommitted calculator implementation. Review docs/source/links before authorized commit/push of the completed calculator work.
6. [ ] Human native check: structured caret/navigation, history/draft restoration, copy hotkey, completion/parentheses, save focus and restart in both themes. UI automation still requires explicit permission.

Implemented details: Ctrl+Shift+C is scoped to Calculator and copies the last submitted full-precision result, not a preview. Up/Down recalls original context and pages as needed; Down restores the protected unfinished draft. The protected draft remains in recovery storage while browsing history. Tab accepts the first suggestion (or navigates math when none); buttons accept other names. Function insertion provides parentheses/argument templates and hints. MathLive is lazy loaded with bundled font faces/static styles; its extra menu, virtual keyboard, remote fonts and sounds are disabled. Supported LaTeX converts to the existing bounded evaluator and version-1 readable archive source; recall/reuse converts fractions, powers and roots back to natural math. Unsupported commands/placeholders cannot be silently saved. Local draft data is versioned/validated separately from permanent history/exports.

Pre-publication verification: final build/typecheck and 36 UI helpers pass; Rust check and all 73 library tests pass (3 opt-in ignored), plus the main-binary recent-paste shortcut test. Production dependency audit reports zero advisories. Built assets include local math fonts and a separate lazy calculator chunk (Vite warns it exceeds 500 kB; base application chunk stays separate). No native launch, installer, browser/computer automation or visual check. H27 remains pending; run npm run launch. Commit/push is explicitly authorized; named sheets/CAS/graphing remain deferred and priority 8 is next.

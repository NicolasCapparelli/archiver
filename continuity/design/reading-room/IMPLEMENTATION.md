# Archiver Reading Room implementation handoff

> Relocated 2026-10-13 from the former root `design-study/` folder during the full Continuity migration. The folder is otherwise byte-identical (offline study `index.html`, PDF, handoff ZIP, tokens, assets, QA). References in this document to the old root files were rewritten to their Continuity homes: STATUS.md -> `../../status.md` (current) and `../../developer/implemented-features.md`, ROADMAP.md/HANDOFF.md -> `../../planning/roadmap.md`, DESIGN.md -> `../../history/product-design-draft-0.2.md`. Wording otherwise reflects the date of the original (2026-10-12). Generated artifacts (`index.html`, PDF, ZIP) were not edited and may still name the old files.

Prepared October 12 2026 as the approved implementation brief. The app migration is now implemented; see `MIGRATION.md` for actual changes, checks, and remaining native validation. The source inventory below describes the pre-migration app.

## Direction and assets

Adopt a contemporary reading-room identity: warm paper, deep spruce, precise ink, brass command accents, tabbed catalog geometry, and editorial headings. Texture and physical props stay in the brand plate. Working surfaces are flat, sharp, and fast.

Archiver remains the product, executable, identifier, storage, and CLI name. Librarian and Archivist are window roles sharing the same logo. Pair the mark with each role in DM Sans. Use Instrument Serif for the product wordmark and larger page headings. Keep functional names such as Clipboard, Commands, Pinned, Snippets, Failed commands, URLs, and Settings.

Open index.html for ten visual study pages and sample theme, scope, state, filter, and selection interactions. Archiver-design-study.pdf is the portable equivalent. These are art-directed prototypes with sample data and simplified tool surfaces. Preserve every real capability when implementing.

tokens.css is the proposed value authority. assets/archiver-mark.svg is the primary three-card logo; the micro variant uses two cards. Inverse and app-tile SVGs are included. The wordmark SVG has live font text: convert it to outlines with Instrument Serif before shipping standalone artwork. Keep app wordmarks as text where practical.

assets/brand-concept.png is a generated creative reference. Do not crop it into a shipping icon. Use the editable SVG interpretation. PROMPTS.md records provenance and the exact built-in generation prompt. Study fonts use copied Latin subsets; production retains existing complete font packages, language coverage, and fallbacks.

No service, new paid font, database migration, new preference, release publication, or installer is required.

## Current implementation and queue

src/main.tsx contains separate quick/full branches with Orbit marks, orbital empty states, sidebar rings, space headings, results, and details. src/style.css contains semantic dark/light tokens, shared component styling, global scrollbar suppression, hardcoded theme swatches, overlays, diff colors, and a blue timeline highlight.

src-tauri/tauri.conf.json defines main as Archiver · Archivist at 1280 × 850, minimum 900 × 400; quick is Archiver · Librarian at 480 × 720, undecorated and nonresizable. Native behavior bounds quick access to the monitor. Both configured startup backgrounds are currently #11151d. assets/icon.svg is orbital; platform outputs are in src-tauri/icons. Study assets have not replaced them.

The current default global shortcut is Ctrl+Win+Period. Enter copies; Ctrl+Enter pastes. Older ../../history/product-design-draft-0.2.md proposes different behavior; current code, ../../status.md, ../../planning/roadmap.md, and src/feature-catalog.tsx take precedence.

../../planning/roadmap.md defines the feature queue: undo library clearing and OCR match previews first, followed by portable import/restore, scheduled backups, Librarian bulk organization, library-aware fuzzy tuning, and actionable integration diagnostics. These are planned tasks, not completed capabilities. This visual brief does not reorder that queue. Preserve any of those capabilities that land before theme migration.

## Behavior invariants

1. Preserve permanent archive history. Clear library changes membership/visibility only, including after restart. Retain payloads, occurrences, OCR text, and indexes.
2. Librarian defaults to library scope. Ctrl+Shift+A includes the full archive and keeps a visible scope indicator. Archivist browses full history. Named snippets remain separately available after clearing.
3. New captures restore membership; command delivery retries do not. Add to library remains explicit in Archivist details.
4. Copy, paste, transform-and-copy, and shell insertion remain separate. Preserve Enter/Ctrl+Enter, plain-text modifiers, destination tracking, session selection, stale-target checks, and focus restoration. Insertion never executes.
5. Preserve global shortcut configuration, Ctrl+Shift+O, Ctrl+Shift+Backspace, Ctrl+Shift+S, Ctrl+T, Ctrl+K, F1, and Escape. Ctrl+R shell search stays deferred.
6. Preserve explicit exclusions, pause/resume, configured-only retention/deletion rules, confirmations, and opt-in recovery. Do not add automatic sensitive-content filtering or automatic URL fetching.
7. Unknown metadata and health stay unknown. Repeated command submissions remain distinct events. Do not turn occurrence-specific metadata into invented item-wide facts.
8. OCR remains Windows-only. Bash/Zsh/Fish/WSL remains experimental; WSL PID verification is unavailable. Theme quality does not imply platform/release readiness.

## Theme contract

Use all values in tokens.css. Existing bg, panel, raised, line, ink, muted, faint, accent, accent-bg, amber, success, and serif tokens remain compatible. Add control-border, command, command-bg, danger, and danger-bg. Temporarily alias violet/violet-bg to command tokens to avoid partially migrating current highlight selectors.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | #F5F1E8 | #191F1C |
| Panel | #FFFCF5 | #202823 |
| Raised/hover | #EDE7DA | #2A332D |
| Decorative rule | #D7D0C1 | #3B4940 |
| Control boundary | #817B70 | #84958A |
| Main ink | #252B28 | #EEECE3 |
| Secondary ink | #62695F | #AFB8AE |
| Tertiary ink | #62695F | #A2ADA1 |
| Accent/focus | #214E44 | #A6C8B5 |
| Selection surface | #DFE9E2 | #30473B |
| Command ink / surface | #73572C / #EEE3CE | #D7BB87 / #443A28 |
| Warning | #815B1B | #E1C083 |
| Success | #2E614B | #A6C8B5 |
| Danger ink / surface | #A33C32 / #F7E5DF | #F0A49B / #4B2A29 |

Decorative rules use line. Required input boundaries use control-border; focus and selected edges use accent. Never use quiet line as the sole identification of an essential control. Text targets 4.5:1 on its actual surface; controls/focus target 3:1. Supplied contrast checks cover intended pairs; check extra combinations introduced during migration.

Primary buttons use accent fill and panel-colored text. Secondary buttons use panel fill, ink, and control-border. Selected records use ink/muted on accent-bg, accent outline, and a 3 px inset leading rule. Focus gets a separate 2 px accent ring with 3 px offset, even on selected rows. Command chips use command ink on command-bg. State is always text plus icon.

The study defaults to light. Production retains its current dark default and archiver-theme persistence. Update native startup background to dark canvas; check persisted light on cold launch and resolve flashing within existing initialization. System-following appearance is separate behavior work.

## Typography and layout

Reuse installed DM Sans 400/500/600 and Instrument Serif 400, retaining complete production language coverage. Keep exact commands/paths in Consolas, SFMono-Regular, or system monospace. A new bundled mono font is optional future refinement.

| Usage | Size and line height |
| --- | --- |
| Archivist heading | Instrument Serif 40/44; 30/34 at short height |
| Product wordmark | Instrument Serif 32–48 |
| Window role | DM Sans 20–24/28, 500 |
| Body/result | DM Sans 14/20 |
| Command/exact content | Monospace 13/20 |
| Metadata/labels | DM Sans 12/18 |
| Librarian footer | DM Sans 11/16 |
| Section label | DM Sans 11/16, 500; limited tracking |

Spacing: 4, 8, 12, 16, 24, 32 px. Radii: controls 6, panels 12, details 8 px. Serif never carries dense metadata. Use rules and whitespace rather than nested cards around every field.

Librarian preserves 480 × 720. Proposed regions: 60 px header, 38 px destination row, approximately 66 px search area including margins, 44 px tabs, flexible local-scroll results, 44 px footer. Rows are at least 66 px with 14 px titles and 12 px metadata. Keep tools in existing dialogs/palette. Six sample rows illustrate density, not a fixed result-count requirement. Scope label and placeholder change together. Focus search immediately.

Archivist keeps native dimensions, roughly 208–222 px sidebar, 24–32 px main gutters, and 280–320 px details at default size. Reduce oversized headings/metrics into a page heading and summary strip. Preserve current summary data, including retention; mockups do not authorize removing functionality. Results and details dominate vertical space. Use min-height:0/min-width:0 in scroll containers to prevent footer overlap.

At 900 × 400, reduce heading/summary height, use roughly 190 px sidebar and 240 px details, and preserve reachable essential actions. If a detail drawer is needed, make it an explicit follow-up with focus management rather than accidental CSS disappearance. Test Windows 125–200% scaling and small monitor work areas. Keep search, close, F1, footer, and actions reachable. Show thin scrollbars for overflowing content.

## Component coverage

- Brand/navigation: one mark per signature; selection follows the record rule. Remove orbital sidebar artwork and the trailing brand dot. Use whitespace or one small tab cue.
- Search: preserve query/filter logic and accessible scope controls. Librarian clearly says Library or Archive; Archivist makes full-archive scope clear.
- Results: keep types, thumbnails, title, source, age, pins, repeat count, directory, and failure status. Selection never reflows rows. Truncate rows; expose exact originals in details.
- Details: preserve copy/paste/insert/edit/pin/library/delete action state, native formats, file availability, tags/collections, OCR, occurrence timelines, and completion metadata.
- Dialogs: reuse ToolDialog semantics. Preserve focus entry, Escape, focus return, names, and error focus. Ctrl+T still focuses its first option and restores focus after errors.
- Supporting tools: style snippets/templates, filters/saved searches, tags/collections, queues, combinations, transcripts, URL/file previews, OCR progress, diffs, backups/recovery, integration health, lifecycle/updater, palette, and feature catalog.
- Errors/health: distinguish active, paused, interrupted, and unknown. Paused is not failure. Search errors cannot look like no results. Display actual shell/capture readiness.
- Destruction: clear library uses a normal action and explains retained history. Delete from archive uses danger text/icon and existing confirmation. Keep recovery wording accurate when disabled.
- Images/syntax: preserve functional alpha checkerboards, zoom/pan, original payloads, and readable syntax. Replace hardcoded diff colors with semantic added/removed surfaces while retaining plus/minus labels.

## Copy and motion

| Current expression | Replacement |
| --- | --- |
| Orbit brand / empty icon | Catalog mark / archive or search icon |
| Sidebar rings | Remove |
| Nothing lost in space. | Your archive |
| The recent orbit | Recent records |
| In your orbit. | Archive settings |
| No matches in this orbit | No matching records |
| Meaningful moments | Capture events |
| Workspace breadcrumb | Personal archive, where accurate |
| Brand dot | Remove |

Keep functional labels. Do not rename records “accessions” or navigation “stacks.”

Empty library: “Your library is clear. Your history is still in the archive. Include archive results to find it here.” Preserve shortcut discovery or expose the existing scope action. Empty archive keeps the copy/connect-shell instruction. No matches: “Try a different word or another filter.” Loading describes the operation; errors preserve useful actual diagnostics.

Clear-library feedback: “Library cleared. Your archive history and named snippets stay available.” Preserve the current immediate action; do not introduce a confirmation flow. Keep permanent-deletion confirmation separate and never call a visibility change deletion.

Hover/selection changes take about 100 ms. Quick opening may use up to 140 ms opacity and 4 px travel without gating focus or keyboard input. Reduced motion is immediate. No ambient loops, particles, parallax, full-window blur, or staggered rows.

## Logo rules

Primary mark is for 32 px and above, with one tab-width clear space. Micro mark is for 16–24 px, transparent and single color. Check weight/gaps at 16, 20, 24, and 32 px and Windows 100%, 125%, 150%, 200%. Inline marks beside visible role names are decorative and inherit currentColor; standalone artwork has a label.

Launcher tile uses spruce and paper. Tray uses the transparent micro silhouette. Let native masks decide external corners; avoid double masking, gradients, texture, and tiny lettering. Generate platform outputs from reviewed SVGs. Do not build installers or publish releases during routine theme work.

## Source map and sequence

| Phase | Files | Result |
| --- | --- | --- |
| Theme | src/style.css | Tokens, type, focus, borders, scrolling |
| Identity/copy | src/main.tsx; new shared mark component | Both branches lose orbital expression |
| Window composition | src/main.tsx; src/style.css | Compact Librarian, content-led Archivist |
| Tools | src/tool-dialog.tsx, src/transform-picker.tsx, src/search-tools.tsx, src/snippets.tsx, src/selection-tools.tsx | Matching menus/forms/editors/queues |
| Content/provenance | src/archive-tools.tsx, src/session-transcript.tsx, src/resource-preview.tsx, src/ocr-tools.tsx, src/diff-viewer.tsx, src/highlight.tsx, src/image-preview.tsx | Complete preview and state coverage |
| Discovery/lifecycle | src/command-palette.tsx, src/lifecycle.tsx, src/feature-catalog.tsx | Accurate capabilities and limits |
| Native | assets/icon.svg, src-tauri/icons, src-tauri/tauri.conf.json | Reviewed icon outputs/startup background |
| Documentation | ../../status.md, ../../planning/roadmap.md, ../../history/product-design-draft-0.2.md | Actual completion and remaining work |

Audit hardcoded swatches, overlays, timeline highlighting, diff colors, and global scrollbar suppression. Functional transparency grids remain where needed. Search Orbit/orbit/space in context; do not rewrite whitespace logic, tests, or archived content based on a blind text search.

Implement reviewable stages: theme/identity, both window layouts, complete tool coverage, native assets and verification. Capture before/after screenshots in both themes. Update the feature catalog only for actual product changes; a study is not an app capability. After every implementation turn align src/feature-catalog.tsx, ../../status.md, and ../../planning/roadmap.md as required by AGENTS.md.

## Acceptance checks

1. Run npm run build and relevant existing npm run test:ui checks after frontend changes. Rust checks/tests apply if Rust changes. Do not build installers.
2. Inspect actual windows in both themes, cold/persisted startup, monitor-bound sizing, and 900 × 400. Study browser QA does not validate native behavior.
3. Verify keyboard selection/focus, transforms/error focus, F1, scope switching, Archivist opening, snippets, copy/paste, safe insertion, and Escape. Include long commands, Unicode, multiline content, and images.
4. Test library clearing, restart persistence, recapture/retry semantics with a temporary fixture archive. Never clear the user's actual library as a theme test.
5. Review empty library/archive, no matches, search error, paused/degraded/unknown capture, no shell, OCR empty/error/progress, unavailable files, recovery/undo, and unconfigured updater.
6. Inspect syntax/diffs, transparency, scrollbars, DPI scaling, reduced motion, screen-reader names, focus order, and actual layered color contrast.
7. Review platform icons at actual sizes. Remove orbit identity from chrome/copy while leaving archive content and whitespace behavior intact.
8. Document actual checks and remaining limits. Retain capabilities without shortcuts and all experimental/platform labels in the feature catalog.

## Agent-ready task

> Migrate Archiver's existing visual theme to the Reading Room design in continuity/design/reading-room/index.html and continuity/design/reading-room/IMPLEMENTATION.md. Reuse the SVG catalog-card mark and semantic tokens while retaining the complete feature set, keyboard behavior, library/archive visibility model, permanent history, and platform limitations. Keep Ctrl+R shell search deferred and do not build installers. Inspect AGENTS.md and ../../planning/roadmap.md if present. Implement both window treatments and shared tool coverage; validate actual windows in both themes and required viewport/scaling states, and run the frontend build and relevant existing checks. Use fixture data for behavior verification. Keep src/feature-catalog.tsx, ../../status.md, and ../../planning/roadmap.md aligned with actual completion and report remaining design/native-validation limitations.


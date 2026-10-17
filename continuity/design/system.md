# Design language

Evidence: `src/style.css` (read 2026-10-13, being edited concurrently), [reading-room/README.md](reading-room/README.md), [reading-room/MIGRATION.md](reading-room/MIGRATION.md), [implemented features](../developer/implemented-features.md). The accepted direction is the **Reading Room** study (approved 2026-10-12, implemented across both windows per the migration record). No Aurora/TokenSeed.

## Identity and composition

Warm paper and deep spruce, quiet ink, brass command accents, tabbed catalog-card geometry and editorial serif headings. Librarian is the compact retrieval surface (480x720); Archivist is the full permanent-history window with locally scrolling results/details. Shared "catalog card" identity across both windows and tools. Dark is the default appearance; a light paper theme and opt-in Follow system mode are user-selectable and applied before first paint. Visible scrollbars and visible focus are requirements. Source owns exact screens; the study ([`reading-room/index.html`](reading-room/index.html), [`IMPLEMENTATION.md`](reading-room/IMPLEMENTATION.md)) illustrates them with sample data.

Do/avoid: prefer border, background and focus-ring changes for state; do **not** add colored drop-shadows on buttons or left-highlight shadows on entries (R1 in the [roadmap](../planning/roadmap.md#r1-remove-colored-button-shadows-and-entry-highlight-shadows)); do not use physical texture from the brand plate inside the app UI.

## Tokens and appearances

Runtime authority: CSS custom properties in `src/style.css`: `:root` (dark, default) and `:root[data-theme="light"]` overrides. Reference proposal: [`reading-room/tokens.css`](reading-room/tokens.css) (study, not runtime).

| Role | Token | Use |
| --- | --- | --- |
| Surfaces | `--bg`, `--panel`, `--raised`, `--line` | page, cards, raised/hover, hairlines |
| Text | `--ink`, `--muted`, `--faint` | primary, secondary, tertiary |
| Primary accent | `--accent`, `--accent-bg` | focus ring, selection, primary actions |
| Command accent (brass) | `--command`, `--command-bg` (aliases `--violet`, `--violet-bg`) | command items; alias names are legacy |
| Status | `--success`, `--danger`, `--danger-bg`, `--amber` | results and errors |
| Controls | `--control-border` | control borders and scrollbar thumbs |
| Type | `--serif` (Instrument Serif, headings), DM Sans 14px base, Consolas for `.mono` | fonts via `@fontsource` packages |

The Reading Room migration record states that all 76 production semantic contrast pairs passed (a past check, not re-run). Reduced motion and 125-200% scaling were browser-checked per [reading-room/MIGRATION.md](reading-room/MIGRATION.md).

## Components and interaction

R14 keeps the existing Reading Room shell and snippet headings. New section visits default closed; focus on category tabs persists until the user enters groups, and Ctrl+Tab provides a category escape from results. Recent-paste actions use the existing F1/palette and toast/error primitives without adding toolbar controls or new visual tokens. Native interaction and appearance remain H20; no computer/browser automation was authorized.

Primitives live in `src/style.css` and the React components: `button` (reset style, focus-visible inset outline 2px `--accent`), `.primary` / `.secondary` buttons, `.chip` (`.chosen` state), `kbd` keycaps (bordered), `.entry` / `.entry.selected` result rows, `.tool-dialog` (shared dialog frame, width up to 600px, serif `h2`; frame in `src/tool-dialog.tsx`), `.dialog-actions`, `.palette-action`, `.setting-card`, `.item-labels`. Interaction: Archivist uses visible buttons/menus for management; Librarian uses shortcuts for tools (Up/Down/Home/End, Left/Right tabs, F1 dialog, Ctrl+K search); focus must stay visible; dialogs hold keyboard focus and return it on close.

## References and exceptions

- R10 emoji catalog (2026-10-13) reuses ToolDialog, entry selection/focus borders, semantic panel/line/ink/muted colors and shortcut footers; Archivist has conventional Copy/Paste buttons. Emoji glyphs use system color-emoji fonts, names wrap, result list has bounded height and visible scrolling, and empty/error/busy states are exposed. No new palette tokens or shadows. Visual/native checks in both themes and narrow widths remain pending H16; source styling review and automated helper tests are separate evidence.

- Study and QA: [reading-room/](reading-room/README.md), moved here 2026-10-13 from the root `design-study/` (files hash-identical except the five markdown files, which carry a relocation note). Roles: `README.md` (index and file list), `IMPLEMENTATION.md` (detailed implementation brief: invariants, token table, layout dimensions, copy rules, source map, acceptance checks; written pre-migration), `MIGRATION.md` and `VALIDATION.md` (dated records, 2026-10-12; MIGRATION lists remaining native validation), `PROMPTS.md` (asset provenance and the exact image-generation prompt), `tokens.css`, `index.html`/`study.css`/`study.js` (offline study), PDF, handoff ZIP, `assets/` (editable SVG marks, fonts with licenses, brand plate), `qa/` (screenshots/reports; reproduction scripts `tools/reading-room-qa.mjs` and `tools/reading-room-assets.py` write to `qa/migration`). Open questions from these documents are in [ideas I20-I24](../planning/ideas.md).
- Shadows (R1 implemented, pending H4): all `box-shadow` declarations were removed from `src/style.css`, including the `.chip.chosen` inset accent underline and the popup/toast shadow; selection and focus rely on outline, background and border. The study's selected-record rule of a 3 px inset leading rule (IMPLEMENTATION.md) is therefore intentionally not used.
- Added UI (not part of the original study): Expanded Librarian, Open Full Clip dialog and Paste Playground in `src/clip-workbench.tsx`: [roadmap R4](../planning/roadmap.md#r4-expanded-librarian-open-full-clip-and-paste-playground), implemented, native visual review pending.

- R6 extensions (2026-10-13): F1/Settings shortcut cards reuse panel, line, muted and keycap tokens in a responsive grid; snippet group headings reuse raised surfaces and visible keyboard focus; the organization dialog reuses ToolDialog and standard labeled controls. No new palette tokens or shadows. Browser preview connection timed out; visual checks in both themes and native focus remain pending H9-H11.

- R7/R8 extensions: collection chips sit below tabs; creation/move forms live in keyboard dialogs using existing labeled controls and choice lists. User screenshot feedback rejected the unstyled persistent form and added action buttons. New tool actions use quiet keycap hints plus shortcuts/F1/palette; tool headers show Esc hints. Result rows use one accent border/background for selected or keyboard-focused state, overriding the global outline only on `.entry`. Other controls use a 2px inset outline that follows their edge instead of a separated halo. OCR highlights use accent background/ink and escaped text, with approximate matches labeled. Snippet notes use muted prewrapped text; Ctrl+T transforms inside the editor. User feedback supersedes the historical Ctrl+Shift+O requirement: the command is now Ctrl+Alt+O. Browser sample checks in both themes are separate from pending native H12-H14.

- R9 supersedes the R8 main-window button removal after explicit user clarification: Archivist is a conventional management UI, Librarian is the shortcut retrieval surface. Main-window dialog headers and editor/workbench footers use standard secondary/primary buttons. Groups use compact chips plus New group/Move selected controls; drop targets have accent border/background. Snippet vault cards reuse panel/line tokens and a single accent selected/focus border, with serif section/detail headings and muted note previews. Item actions uses a bordered dropdown without shadows, keyboard navigation, outside dismissal and an accessible trigger; pin naming uses ToolDialog. Buttons wrap at narrow widths, long names wrap/truncate, group chips have bounded overflow. No visual/browser/native verification this turn: explicit permission required; prior R8 screenshots are historical. H15 covers both themes, narrow widths, menu and focus.

- R11: user-defined snippet headings use existing raised/line tokens and right-aligned counts; membership badges reuse accent/background tokens and muted Ungrouped labels, with wrapping for long names. Archivist uses sidebar-only categories and a dedicated Statistics page: responsive cards, serif numbers, muted captions and two-column breakdowns collapsing to one at narrow widths. Librarian retains tab shortcuts, visible single-row selection and inset heading focus. State memory uses a standard Settings checkbox; rename uses ToolDialog/labeled controls. No new palette or shadows. No native/browser/visual control authorized; H17 remains pending.

- R12 (2026-10-13) supersedes R10 list composition with a responsive emoji grid: 44px cells, quiet border/background selection, named tooltips/accessible buttons and selected-name caption. Arrows/WASD follow actual columns; no new tokens or shadows. Archivist groups appear only in Snippets. Main heading removes the eyebrow and uses 28px serif/11px subtitle with 10px vertical padding. Details have a bounded grid row and image preview and reset their scroll per selection. Source-reviewed and build/helper-tested; both-theme/narrow-width visual and native H18 pending.

- R13 text find (2026-10-14): compact inline search uses existing inputs/secondary buttons, muted count, brass meaning-match background and spruce active-match background/outline. No new tokens or shadows. Shared workbench preserves copy/edit/save surface; Escape first dismisses find and restores text focus. Source reviewed against Reading Room tokens; both-theme/native visual checks pending H19.

## R15 tool extensions

Region OCR uses an accent rectangle over a proportional image with equivalent labeled pixel-coordinate controls. JSON uses bounded, wrapping indented rows and explicit expand/copy controls. Notes use the shared text field and ToolDialog. Nested dialogs restore the previous focus. Existing semantic colors, flat surfaces and keyboard focus remain authoritative. Frontend compilation passes; native layout, pointer selection and focus checks remain pending H21.

## R16 text utility extensions

Editable diff and extractors reuse ToolDialog, shared text fields and semantic diff backgrounds. Diff uses a two-column table with textual change/newline labels, underlined changed spans, wrapping lines and bounded scrolling; editor columns stack below 560px. Extractors use labeled controls and explicit extraction/copy actions with live result/error status. Librarian workbench entry points are shortcuts; Archivist also exposes buttons. No new shadows or color tokens. Build verified; both-theme native layout, WebView worker and nested keyboard focus await H22.


## R17 settings extensions

Import/restore and diagnostics reuse setting-card, labeled setting-input, primary/secondary controls and status regions. Explicit replacement/repair approval checkboxes sit beside concrete previews; checksums/diagnostics wrap. Preview uses the accent token without new shadows/colors. No new Librarian shortcuts. Compilation verified; both-theme/native focus/layout checks remain H23/H24.

# SK1: Sketchpad V1

## Outcome and authority

Open Sketchpad from Librarian into Expanded Librarian. Draw simple sketches and copy images.

- **Source/date:** user request, 2026-10-23. Required tools: freehand, strict lines/shapes, text, select/drag, eraser, undo/redo, image copy.
- **Authorization:** user approved implementation, then requested UI repairs and named local sketches. Latest request authorizes icon controls, Ctrl+Shift+D, milestone completion, commit and push.
- **State:** V1 implementation milestone closed at user request on 2026-10-23. H38 remains an unverified native follow-up. Owner: `archiver-sketchpad-20261023-01`. Publication authorized and staged for review. Committing agent and SHA pending actual commit.
- **Planning owner:** `archiver-sketchpad-plan-20261023-01`, documentation only.
- **Selection:** [roadmap](../../planning/roadmap.md#sk1-sketchpad-v1). FS1 remains independent.
- **Location:** user-requested `continuity/milestones/`. The original path retains a stable link to this final ledger.

## V1 contract and delivered behavior

| Capability | Delivered behavior |
| --- | --- |
| Entry | Librarian Ctrl+Shift+P palette entry. Inline expanded workspace. Ctrl+Shift+D in Librarian. No OS-wide binding. |
| Drawing | Freehand pen, lines, rectangles, ellipses. Shift constrains geometry. Fixed widths, optional fill, no pressure sensitivity. |
| Text | Drag a box and type. Enter saves, Shift+Enter adds a line. Select/double-click edits. DM Sans and shared wrapping. |
| Viewport | Fixed controls, left tools, inset paper, tool cursors, anchored wheel zoom, Space/middle/Pan dragging. Fit frames artwork. Canvas frames the page. |
| Selection | Topmost hit, Shift-click membership, empty-space marquee, group drag, Delete selected. |
| Eraser/history | Whole-object erasing. One completed gesture per history step. Undo/redo. No-op edits create no history. |
| Copy | Full white 1200×800 PNG and Windows DIB. No handles/previews. Explicit permanent archive capture. |
| Local sketches | Name, Save/Ctrl+S, New, Open and Delete. Saved snapshots remain independent of working edits. New/Open reset history. |
| Recovery | Committed working draft recovers across reopen/restart. Legacy draft loads. Invalid recovery blocks writes. Failed writes retain memory. |

Artwork and output dimensions remain independent of theme and viewport.
One compact icon row contains document, property, edit and view controls. Tooltips explain actions. Controls wrap only at narrow widths. Shortcut hints wrap without scrolling.
V/P/L/R/O/T/E/H choose tools outside inputs. Ctrl+Z undoes, Ctrl+Shift+Z redoes, Ctrl+Shift+C copies.
0 fits artwork. Shift+0 fits the page.
Escape cancels gestures/text, dismisses list/selection, then exits. Back exits immediately. Blur preserves the workspace.

Unsaved New/Open and saved deletion require confirmation. Deleting the active saved entry retains the drawing as a draft.
App-local storage is outside archive backups/exports. No standalone project file is created.
Archived images remain permanent after saved-sketch deletion or library visibility clearing.
Native capture precedes clipboard publication. A failed clipboard write can leave a successfully archived image. Retry content deduplicates.
Browser preview clipboard support is platform-dependent and does not archive images.

## Implementation and limits

<a id="sk11-model-and-bounds"></a>
<a id="sk12-shell-and-creation"></a>
<a id="sk13-object-editing"></a>
<a id="sk14-history-and-recovery"></a>
<a id="sk15-copy-and-capture"></a>

Earlier anchors route to delivered implementation. SK1.6 owns acceptance.
Source owners: `src/sketchpad.tsx`, model, geometry, history, export, viewport, text and storage helpers.
Entry: `main.tsx`. Clipboard: `api.ts`, native `main.rs` and `sketchpad.rs`.
SVG displays artwork. Canvas exports committed objects after font loading. Inverse transforms map gestures. Cancellation discards previews.

Documents cap at 1,000 objects, 100,000 total stroke points, 10,000 UTF-16 text units and 16 MiB serialized bytes.
History uses immutable snapshots, capped at 100 actions and 16 MiB. This replaces proposed delta commands.
Collections cap at 50 saved sketches and 16 MiB, including the workspace. Browser quota can be smaller.
Storage validation clones documents. One atomic write preserves snapshots and draft. Corrupt collections remain unchanged.
Native PNG validation checks bounded encoding and exact dimensions. No archive migration.

Known limits: legacy text hit widths are estimates. Native layout/text/paste await H38.
Deferred: import, pressure, resize/rotation, layers, connectors, partial erasing, transparency, project/SVG export, collaboration and Archivist entry.

## Task ledger and current checkpoint

SK1.9 completes V1 implementation and SK1.6 delivery documentation. No next implementation is selected. Discuss next steps with the user. H38 retains native follow-up.
Runtime owner: `archiver-sketchpad-20261023-01`.

| ID | Outcome | State | Implementing agent | Commit state | Committing agent | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| SK1.0 | Scope/live plan | done | archiver-sketchpad-plan-20261023-01 | uncommitted | none | This plan |
| SK1.1 | Model/bounds | done | archiver-sketchpad-20261023-01 | uncommitted | none | Model tests |
| SK1.2 | Shell/creation | implemented-awaiting-check | archiver-sketchpad-20261023-01 | uncommitted | none | Source, H38 |
| SK1.3 | Selection/drag/eraser | implemented-awaiting-check | archiver-sketchpad-20261023-01 | uncommitted | none | Geometry tests, H38 |
| SK1.4 | History/recovery | implemented-awaiting-check | archiver-sketchpad-20261023-01 | uncommitted | none | History tests, H38 |
| SK1.5 | Image copy/capture | implemented-awaiting-check | archiver-sketchpad-20261023-01 | uncommitted | none | Native tests, H38 |
| SK1.7 | Workspace repairs | implemented-awaiting-check | archiver-sketchpad-20261023-01 | uncommitted | none | Viewport/text tests, H38 |
| SK1.8 | Fit/controls/saved sketches/review | implemented-awaiting-check | archiver-sketchpad-20261023-01 | uncommitted | none | Storage tests, H38 |
| SK1.9 | Icon control row and opening shortcut | implemented-awaiting-check | archiver-sketchpad-20261023-01 | uncommitted | none | Latest user request |
| SK1.6 | Delivery/docs, native follow-up transferred | done | archiver-sketchpad-20261023-01 | uncommitted | none | Helpers pass, H38 pending |

### Latest implementation completions

SK1.9 delivered after SK1.8 on 2026-10-23. One compact icon control row contains document, property, edit and view actions. Icon tooltips and accessible names explain actions. The left tool rail uses icons. Ctrl+Shift+D opens Sketchpad from Librarian. The palette and F1 list the chord. Exact-modifier tests reject adjacent shortcuts. Publication is scoped to Sketchpad and required integration. H38 remains pending.

SK1.8 delivered after SK1.7 on 2026-10-23. Fit reads live dimensions and frames stroke bounds. Canvas restores page framing. Themed properties and wrapped hints replace scrolling defaults. Named snapshots support Save/New/Open/Delete, separate recovery and dirty-switch protection. Review fixes cover text focus/style, Unicode graphemes, aggregate budgets, invisible click shapes and dirty comparison. All 69 working-tree helpers passed. Earlier completion evidence remains in the implementation log.

### SK1.6: Acceptance

User requested V1 completion and publication, then discussion of next work. Implementation and delivery documentation are complete. H38 remains pending in status. Closure records delivery, not a claim of native verification.

### SK1.7: Workspace repairs

Implementation delivered. Native follow-up remains H38.

### SK1.8: Saved sketches and polish

Implementation delivered. Native follow-up remains H38.

### SK1.9: Icon controls and shortcut

Implementation delivered. Publication authorized. Native control-row and shortcut exercise remains H38.

## Acceptance and pending checks

Scoped staged-snapshot build/typecheck and 54 frontend helpers pass. The full working tree also passes build and 74 helpers. The existing bundle-size warning remains.
The scoped staged-snapshot Rust check passes. Rust library tests pass: 75 passed, three opt-in tests ignored.
No UI automation, native launch or installer. Commit/push status is recorded after publication.

[H38](../../status.md#pending-human-checks) owns actions, expected results, reported failures and pending native retest.
Run `npm run launch`. Test Fit/Canvas after pan/zoom, both themes/scaling, wrapped hints, properties, saved A/B lifecycle, unsaved-switch cancellation, drawing/text/history and paste into two apps.
Automated success does not close human acceptance.

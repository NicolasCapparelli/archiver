# Reading Room migration

> Relocated 2026-10-13 from the former root `design-study/` folder during the full Continuity migration. The folder is otherwise byte-identical (offline study `index.html`, PDF, handoff ZIP, tokens, assets, QA). References in this document to the old root files were rewritten to their Continuity homes: STATUS.md -> `../../status.md` (current) and `../../developer/implemented-features.md`, ROADMAP.md/HANDOFF.md -> `../../planning/roadmap.md`, DESIGN.md -> `../../history/product-design-draft-0.2.md`. Wording otherwise reflects the date of the original (2026-10-12). Generated artifacts (`index.html`, PDF, ZIP) were not edited and may still name the old files.

Implemented October 12 2026 at the user's request. The original study remains the design reference; screenshots in `qa/migration/after-*.png` show the implemented app using its existing browser sample archive. `before-*.png` captures the preceding UI.

## Implemented

- Both window signatures use the shared catalog-card mark, capitalized role names, and accessible identity labels. Orbital artwork and space-themed chrome copy are removed.
- Production semantic tokens match the approved paper/spruce palette. Brass distinguishes commands; errors/deletion and added/removed diff lines use semantic colors. All shared tools inherit the system.
- DM Sans controls/body and Instrument Serif headings retain their existing complete font packages. Controls have stronger boundaries; focus rings and selection rules remain distinct. Overflowing content has visible thin scrollbars.
- Librarian keeps its native dimensions, shortcuts, destination, filters, footer, and tool dialogs. Library/Archive scope is always visible and clickable. Empty/error messaging distinguishes archive scope and suppresses misleading empty results after a search error.
- Archivist uses a smaller heading and summary strip, locally scrolling results/details, and compact rules at minimum height. All four summary values remain, including retention. Details stay available in a stacked, scrolling layout in narrow browser previews.
- Appearance now precedes supporting Settings tools. Saved light/dark appearance initializes with a CSP-compatible external script before page paint; default remains dark. No system-following preference was added.
- Launcher/platform outputs derive from `assets/icon.svg`; transparent tray PNG derives from `assets/tray.svg`. Rust loads that tray asset instead of drawing the old orbital mark. Native startup backgrounds use the dark canvas.
- Feature catalog, ../../status.md, ../../planning/roadmap.md, and ../../history/product-design-draft-0.2.md reflect implemented presentation. ../../planning/roadmap.md's seven feature tasks remain planned. Permanent history, shell/copy/paste behavior, exclusions, OCR settings, and Ctrl+R deferral are preserved.

## Verification

- Frontend typecheck and production build pass.
- A separate no-bundle Windows review executable is built at `target/reading-room/release/archiver.exe`, with a SHA-256 sidecar. Its embedded JS/CSS asset names were checked against the final validated frontend. Windows denied replacement of the existing `target/release/archiver.exe`; the separate output preserves it and the existing installer. Native launch/delivery checks remain pending.
- Existing UI/Clink helper suite: 9 passed. Rust check passes; Rust library suite: 43 passed, 2 opt-in tests ignored.
- `tools/reading-room-qa.mjs after`: 16 browser cases across both themes, 1280×850, 900×400, 480×720, 480×400, 650×700, and Librarian device-scale factors 1.25/1.5/2. Reduced-motion mode, no document overflow, visible details, compact result space, and footer bounds checked.
- Browser interaction checks: search/no matches, F1/Escape, Filters dialog, scope switching, selected-record keyboard navigation, Ctrl+T initial/error focus, theme change and reload persistence, and clearing only the in-memory sample library while full-archive results remain available. Rust fixture tests cover durable library clearing/restart, recapture and command-retry semantics. The user's archive was not cleared.
- Browser checks render the actual built `dist` files using local Playwright request fulfillment. This avoids reliance on localhost networking; no external service or data is fetched. Sample-browser results do not establish native delivery correctness.
- `tools/reading-room-assets.py`: 76 production-token pairs meet 4.5:1 text or 3:1 required control/focus targets. Quiet decorative rules intentionally have lower contrast. `icon-review.png` shows platform and tray assets at 16–64 px.
- Representative screenshots were visually reviewed: both window themes, compact layout, Settings, Filters, transform error, shortcut reference, and narrow stacked-layout entry.

## Remaining interactive validation

Actual Tauri cold/persisted startup flashing, monitor-bounded Librarian sizing, Windows display scaling and taskbar icon contrast, screen readers/high contrast, live clipboard formats/images, OCR states, paste destination restoration, elevated destinations, terminal tabs and shell insertion still require interactive Windows review. Device-scale browser renders check raster output, not Windows work-area calculations. Detailed native functional limitations remain in ../../status.md/../../planning/roadmap.md. No installer or public release is produced by this migration.

## Reproduce

Run `npm run build`, then set `CODEX_NODE_MODULES` to a directory containing Playwright and run `node tools/reading-room-qa.mjs after`. Chrome must be installed. Run `python tools/reading-room-assets.py` with Pillow available. The QA scripts use sample data and write only review artifacts.

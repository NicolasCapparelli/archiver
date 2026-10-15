# Archiver design study

> Relocated 2026-10-13 from the former root `design-study/` folder during the full Continuity migration. The folder is otherwise byte-identical (offline study `index.html`, PDF, handoff ZIP, tokens, assets, QA). References in this document to the old root files were rewritten to their Continuity homes: STATUS.md -> `../../status.md` (current) and `../../developer/implemented-features.md`, ROADMAP.md/HANDOFF.md -> `../../planning/roadmap.md`, DESIGN.md -> `../../history/product-design-draft-0.2.md`. Wording otherwise reflects the date of the original (2026-10-12). Generated artifacts (`index.html`, PDF, ZIP) were not edited and may still name the old files.

October 12 2026. Approved Reading Room design reference. The app migration is now implemented; see `MIGRATION.md` for changes, checks, and remaining native review.

Open `index.html` for the visual study. Use its theme toggle and Librarian scope/state controls to review the concepts. Mockups contain sample data and do not connect to the archive or clipboard. `Archiver-design-study.pdf` is the portable version of the same ten-page study. `IMPLEMENTATION.md` is the detailed agent handoff; `tokens.css` is the proposed semantic contract. `assets/archiver-mark.svg` and its micro variant are editable vector artwork; the PNG brand plate is an AI-generated creative reference.

The proposed direction is Reading Room: warm paper, deep spruce, quiet ink, tabbed catalog geometry, and editorial headings. Librarian is the compact retrieval surface. Archivist is the permanent-history workspace. Archiver remains the product and executable name.

The study/PDF and original handoff ZIP remain design references with simplified sample behavior. The implementation now uses the approved tokens and logo, including platform/tray outputs. Installer artifacts are unchanged. `../../planning/roadmap.md` retains the feature queue: undo library clearing and OCR match previews first, then five extensions. Migration does not mark those planned features complete.

## Files

- `index.html`, `study.css`, `study.js`: offline visual study and interactive mock states.
- `IMPLEMENTATION.md`: behavior constraints, component rules, source map, migration phases, acceptance checks, and an agent-ready task.
- `tokens.css`: proposed light/dark tokens and compatibility aliases.
- `assets/archiver-mark.svg`: primary mark with three catalog cards.
- `assets/archiver-mark-micro.svg`: simplified two-card silhouette for 16–24 px uses.
- `assets/archiver-mark-reversed.svg`, `assets/archiver-app-icon.svg`, `assets/archiver-wordmark.svg`: inverse mark, app tile, and wordmark reference.
- `assets/brand-concept.png`: generated creative direction plate. Physical texture belongs to the plate, not the app UI.
- `assets/fonts`: copies of the already-installed Latin study fonts and their licenses. Production must retain the application's existing complete font packages and fallbacks.
- `PROMPTS.md`: exact built-in image generation prompt and asset provenance.
- `qa/`: reproducible browser/contrast checks and review images, for internal inspection.

The PDF and review images are generated from the authored HTML. Run `qa/render.mjs` with the bundled Node runtime and `CODEX_NODE_MODULES` set to the bundled package directory. Run `qa/verify.py` with the bundled Python runtime for palette checks. The checked-in study works without that tooling.

# Archiver

## Purpose and audience

Archiver is a permanent local clipboard and command archive for one person's Windows machine, built with Rust, SQLite, Tauri 2, and React. It captures clipboard text, rich text, images, and files plus shell commands (PowerShell, CMD/Clink; experimental Bash/Zsh/Fish/WSL), and offers two surfaces: the **Librarian** quick panel (global hotkey, compact, library-scoped by default) and the **Archivist** full window (whole archive, settings, tools). A local CLI (`archiverctl`) and stdio JSON Lines API serve agents and scripts.

The original product intent is the [product design draft](history/product-design-draft-0.2.md) (a draft, partly historical); the user guide is [usage](user/usage.md). All ordinary documentation now lives here ([where things moved](#where-the-old-documents-went)).

## Scope and maturity

Windows-first development build. The first-pass 22-feature queue and several backlog features (OCR, fuzzy search, tags/collections, filters, transcripts) have implementations; interactive native validation (focus restoration, real shell editing, visual review) and release work (signing, updater hosting) remain open. macOS/Linux adapters are future work. Queued work in the [roadmap](planning/roadmap.md#next-agent-queue-q1q7) is planned, not implemented. Current state and blockers: [status](status.md).

## Find what you need

| Task | Start here |
| --- | --- |
| Understand this documentation framework | [What is Continuity?](about.md) |
| Install, build, run, or test; **see your change with `npm run launch`** | [Setup](developer/setup.md#see-your-change-npm-run-launch) |
| Use the app (shortcuts, library, OCR, shells, search) | [Usage](user/usage.md) |
| Use the CLI / agent API | [CLI reference](user/cli.md) |
| Know what is implemented | [Implemented features](developer/implemented-features.md) |
| Release, signing, updates | [Release](developer/release.md) |
| Understand components and flows | [Architecture](developer/architecture.md) |
| Understand data and schema ownership | [Data model](data/model.md) |
| Resume work after an absence | [Status](status.md) |
| See what changed and what to test | [Recent implementations](implementation-log.md) |
| Find selected next work, ideas, and brainstorming | [Planning](planning/README.md) |
| Keep UI consistent | [Design language](design/README.md) |
| Locate implementation context | [Agent map](agent/map.md) |
| Work as an agent | [Reading and maintenance contract](agent/instructions.md) |

## Where the old documents went

Full migration was approved and completed 2026-10-13. Recovery copies of the originals: `C:/Users/cappa/Desktop/Projects/archiver-docs-backup-2026-10-13/` (outside the repository; not part of the reading path; see the [implementation log](implementation-log.md)).

| Former document | Now |
| --- | --- |
| root STATUS.md | [implemented features](developer/implemented-features.md); dated verification [history/status-2026-10-12.md](history/status-2026-10-12.md); current state in [status](status.md) |
| root ROADMAP.md, HANDOFF.md | [roadmap](planning/roadmap.md) (R1-R4, Q1-Q7, L1-L10) and [ideas](planning/ideas.md) |
| root README.md | GitHub-facing purpose, features, architecture, setup, checks and limitations; deeper usage in [usage](user/usage.md); run/build in [setup](developer/setup.md); release in [release](developer/release.md) |
| root CLI.md | [cli](user/cli.md) |
| root DESIGN.md | [history/product-design-draft-0.2.md](history/product-design-draft-0.2.md) |
| `design-study/` | [design/reading-room/](design/reading-room/README.md) |
| AGENTS.md | retained at the root (agent rules); updated to point here |

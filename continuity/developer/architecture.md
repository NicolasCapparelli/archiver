# Architecture

Evidence: source inspection (`src-tauri/src`, `src`) on 2026-10-13; behavior descriptions are source-observed unless noted. Runtime checks are in [history](../history/status-2026-10-12.md) (dated) and [status](../status.md). The source is being edited concurrently by another agent; re-verify paths before relying on them.

## System overview

- **Rust core library** `archiver_core` (`src-tauri/src/lib.rs`): SQLite storage (`store.rs`), search/labels/fuzzy index (`search.rs`), library visibility (`library.rs`), OCR records (`ocr.rs`), exports/backups/deletion recovery (`archive_io.rs`), settings (`settings.rs`), previews (`preview.rs`, `file_preview.rs`, `link_preview.rs`), history import (`history_import.rs`), shell session records (`shell.rs`). Windows-only: `clipboard.rs` (capture), `delivery.rs` (focus tracking and paste).
- **Desktop app** `archiver` (`src-tauri/src/main.rs`): Tauri 2 shell exposing commands to the frontend (see `generate_handler!` in `main()`), global hotkey, tray, two windows (`main` = Archivist, `quick` = Librarian per `tauri.conf.json`), capture writer thread, OCR queue/worker, spool reader for shell hooks, updater and launch-at-sign-in.
- **CLI** `archiverctl` (`src-tauri/src/cli.rs`): same core library; commands plus persistent stdio JSON Lines API. Reference: [CLI reference](../user/cli.md).
- **Frontend** (`src/main.tsx` `App`, one React app used for both windows; `isQuick` selects Librarian behavior): typed command wrappers in `src/api.ts`; tools as dialogs (`tool-dialog.tsx`, `search-tools.tsx`, `selection-tools.tsx`, `archive-tools.tsx`, `snippets.tsx`, `ocr-tools.tsx`, `session-transcript.tsx`, `transform-picker.tsx`, `command-palette.tsx`); Settings feature list in `src/feature-catalog.tsx`; shared helpers `text-tools.ts`, `text-diff.ts`, `navigation.ts`; syntax highlighting runs synchronously (`highlight-engine.ts`, `highlight.tsx`; R5 superseded the worker). Collection-group UI is `clip-groups.tsx`, bounded OCR match rendering is `ocr-match.tsx`.
- **Shell integrations** (`integrations/`): PowerShell, Clink (Lua), Bash, Zsh, Fish hooks write command events and read insertion requests through a per-user spool directory; `install.ps1` / `install-unix.sh` set them up. Unix adapters are experimental.
- **Windows OCR**: embedded PowerShell/WinRT helper (`tools/ocr-windows.ps1`, driven by `ocr.rs` and `main.rs`).

## Representative flows

1. **Capture**: Windows clipboard event -> `clipboard.rs` builds a `Capture` -> writer thread -> `Store::capture_clipboard` (fingerprint dedup into `items`, new/updated `events` row, `representations`, FTS row, fuzzy terms) -> library membership restored for genuine recapture -> copied unscanned images get their IDs queued for OCR.
2. **Paste**: Librarian remembers the previous foreground window/control (`delivery.rs`); `paste_item` restores focus, verifies the target, then sends balanced Ctrl+V; recognized terminals are refused in favor of `insert_command`, which writes literal text to a connected shell's spool for editing-buffer insertion (no Enter).
3. **Search**: `list_items` -> `Store::search_items`/`list` with filters; fuzzy mode uses the `terms`/`item_terms`/`fuzzy_keys` index with documented caps ([implemented features](implemented-features.md#search-and-indexing-limits)); library scope starts from `library` membership.

## Constraints and design reasoning

- **Permanent history**: `items`/`events`/`representations` are never removed by clearing the library; `library` is only a visibility table ([data model](../data/model.md#library-membership)). Permanent deletion is explicit and, with a configured window, recoverable via `trash`. Rationale is from [AGENTS.md](../../AGENTS.md) and the [product design draft](../history/product-design-draft-0.2.md).
- **Unencrypted local history**; captures everything unless exclusions are configured (settings exclusions by executable).
- **Durability**: SQLite WAL, `synchronous=FULL`, foreign keys on (`store.rs` `open`). Captures go through a writer thread in `main()`; atomic file writes for settings/state (`atomic` in `cli.rs`, `write_policy` in `main.rs`). This does not by itself establish isolation between the desktop app and a concurrently running CLI writing the same database (unverified).
- **Privacy**: URL title fetching is explicit and bounded, not automatic; OCR is local.
- **Platform limits**: Windows-only capture/paste/OCR; WSL PID verification unavailable; insertion targets must be chosen per terminal tab. Interactive validation is outstanding ([status](../status.md)).
- **UI window sizes**: Librarian 480x720 bounded to the monitor work area. The Expanded Librarian ([R4](../planning/roadmap.md#r4-expanded-librarian-open-full-clip-and-paste-playground)) temporarily resizes it to 1040x800 (bounded to the monitor) via the `set_quick_expanded` command and restores the saved size/position; implemented 2026-10-13, native behavior unverified.

## Deeper context

[Data model](../data/model.md) · [Implementation map](../agent/map.md) · [Design](../design/README.md) · [Planning](../planning/README.md) · [Implemented features](implemented-features.md) · [Setup](setup.md) · [Release](release.md) · product draft [history/product-design-draft-0.2.md](../history/product-design-draft-0.2.md) (historical intent, partly superseded by source)

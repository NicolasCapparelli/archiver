# Setup and verification

Evidence: `package.json`, `tools/desktop.mjs`, `tools/launch.mjs`, the former root README run/build section (migrated here and into [usage](../user/usage.md)). Commands below are **inspected, not executed** during Continuity initialization/migration unless noted; prior runs are reported in [history](../history/status-2026-10-12.md).

## See your change: `npm run launch`

**Run `npm run launch` after every change to see it in the real app.** It (1) kills any running `archiver.exe` (Windows locks a running exe, so it must exit before relinking), (2) runs `node tools/desktop.mjs build` (a `tauri build --no-bundle` release build: frontend + Rust, **no installer**), then (3) starts `target/release/archiver.exe` **detached**, so the app keeps running after the command exits. If the build fails the old app stays closed and is not relaunched (the script says so). Routine implementation turns end by telling the user to run it (AGENTS.md). It is not a verification step: it does not run tests, and the first native run of a change is what the pending human checks in [status](../status.md#pending-human-checks) need. Installers are separate (see below).

## Prerequisites

Node 24+, Rust (cargo found automatically in `~/.cargo/bin` by `tools/desktop.mjs`), Windows C++ build tools, WebView2. Windows 11 is the supported target; non-Windows builds compile only the portable core. No external services are required. Updater signing/code-signing material is optional and kept outside the repository (never recorded here).

## Configuration

- Data directory: Tauri app-local data dir (`app.archiver.desktop`), overridable for CLI/tests with `ARCHIVER_DATA_DIR` (`src-tauri/src/cli.rs`). The desktop does not honor `ARCHIVER_DATA_DIR`. Contents: `archive.sqlite3`, `settings.json`, `capture-state.json`, `shell-spool/`, and `shell-sessions/`.
- `settings.json` (global hotkey default Ctrl+Win+Period, OCR toggles/interval, recovery window, Librarian state memory): `src-tauri/src/settings.rs`.
- Windows configs: `src-tauri/tauri.conf.json` (windows `main` 1280x850 and `quick` 480x720), `tauri.release.conf.json`.
- Never test against real shell profiles or real history; use isolated profiles/data dirs (see `tools/test-*.ps1`).

## Install, build, and run (working directory: repo root)

| Goal | Command |
| --- | --- |
| Install locked deps | `npm ci` |
| Desktop dev app | `npm run desktop` |
| Frontend typecheck + build | `npm run build` |
| Browser-only sample UI (sample data, no native archive) | `npm run dev` (127.0.0.1:1439) |
| Rebuild and relaunch the app (kill, no-bundle build, start detached) | `npm run launch` |
| No-bundle release executable only (does not launch) | `npm run desktop:build` |
| Unsigned installer (major releases / explicit request only) | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/release.ps1 -Unsigned` |

Per [AGENTS.md](../../AGENTS.md), do not rebuild installers for routine work; the unsigned installer command produces a local NSIS installer in `target/release/bundle/nsis` (bundling shell adapters and `archiverctl.exe`) and installs/publishes nothing. The npm wrappers find Rust in its usual user installation even in older terminals. `npm run dev` serves sample history at localhost:1439 (127.0.0.1); samples never enter the native archive. Release/signing: [release](release.md).

## Verify a change

| Scope | Command |
| --- | --- |
| Rust compile | `npm run check:rust` |
| Rust library tests (`cargo test --lib`; 2 opt-in tests ignored) | `npm test` |
| UI helper tests (navigation, Clink, text tools, highlight, diff, emoji, text find) | `npm run test:ui` |
| Shell hook metadata/insertion | `npm run test:shell` |
| Setup idempotency/backup/uninstall (isolated) | `npm run test:setup` |
| CLI and stdio API round trips | `npm run test:cli` |
| Windows OCR (real engine) | `npm run test:ocr` |

Rust unit tests live inline (`#[cfg(test)]` in `store.rs`, `search.rs`, `library.rs`, `ocr.rs`, `settings.rs`, `archive_io.rs`, ...). Interactive checks (focus restoration, real terminals, visuals) have no automated coverage; see [status](../status.md#pending-human-checks).

## Troubleshooting

- Rust not found in an older terminal: `tools/desktop.mjs` adds `~/.cargo/bin` to PATH.
- Windows can deny replacing a running `target/release/archiver.exe`; a separate no-bundle build exists at `target/reading-room/release/archiver.exe` ([history](../history/status-2026-10-12.md)).
- Hotkey unavailable: the app records "Quick-access shortcut unavailable" (`main.rs` setup) shown in the UI.
- Browser automation to localhost was blocked in earlier sessions (see [history](../history/status-2026-10-12.md)); built assets were served directly instead.

## Documentation verification: 2026-10-14

The GitHub README pass inspected package scripts, native configuration, CLI/data paths, sample-mode API, storage/search, shell tests, and the feature/status/roadmap baseline. No runtime source changed.

Actually run with existing dependencies (Node 24.13.1): `npm run build`, `npm run test:ui` (18 pass), `npm run check:rust`, `npm test` (55 pass, 2 opt-in ignored), `npm run test:shell`, `npm run test:setup`, `npm run test:cli` (2 pass), and `npm run test:ocr` (synthetic image recognized with en-US). All passed; Rust reported cache hard-link warnings and used copy fallback. The CLI tests reported Node's experimental SQLite warning.

Also executed the root README's explicit Cargo build with `--target-dir target` and its synthetic contribute/search example under `target/readme-demo`. `npm run dev` started on 127.0.0.1:1439; both documented demo URLs returned HTTP 200. Initial HTTP requests were blocked by the socket sandbox; approved shell access succeeded. HTTP responses do not establish rendered UI behavior.

Not executed: `npm ci`/a clean dependency install, `npm run desktop`, `npm run desktop:build`, `npm run launch`, installers, or a clean-machine setup. Their instructions were checked against scripts/configuration and the existing lockfile; this is not fresh-environment verification. No native capture, real shell profiles/history, publication, or Git settings were changed. After explicit user permission, captured and visually reviewed the synthetic Archivist and Librarian in the Codex browser; screenshots are in `docs/images/` and embedded in the root README. Captures use 1280x720 and the configured 480x720 Librarian size; the temporary viewport was reset and tab closed. Both screens contain only built-in sample data. Existing `tools/keyboard-ui-qa.mjs` was inspected but not run: it requires environment-specific Playwright wiring and exercises older group UI assumptions. No historical QA images were presented as fresh screenshots.

Final documentation validation: 118 relative links/image paths and Markdown anchors across seven changed documents passed; 11 README npm script names matched package.json. Both screenshot files passed JPEG signature checks and visual review. The temporary demo server was stopped after capture.

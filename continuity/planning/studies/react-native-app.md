# Archiver Mobile: React Native implementation plan (Entanglement + Aurora)

State: **proposal, not started** (written 2026-10-13 at the user's request; no implementation authorized beyond handing these prompts to an agent one at a time). Audience: a Sonnet coding agent receiving one prompt at a time. Each prompt below is self-contained; the appendix holds the API excerpts the prompts reference so the agent does not have to re-derive them.

Once Prompt 0 runs, `archiver-mobile/docs/PLAN.md` (a copy of this file) becomes the working copy for the mobile app, and this study only records the origin and conclusion.

## 1. Framing and assumptions (redirect here before Prompt 1)

| Topic | Assumption | Why |
| --- | --- | --- |
| App location | New sibling repo `C:\Users\cappa\Desktop\Projects\archiver-mobile` (git-initialized). The desktop repo is not touched except for this study. | Matches how Quadra keeps `quadra/` and `quadra-app/` separate. Entanglement and Aurora are both vendored per app. |
| Stack | Expo SDK ~57.0.26, React Native 0.86.3, React 19.2.3, TypeScript ~6.0.3, Hermes, New Architecture, expo-router. Development builds (`expo run:android`), **not Expo Go**. | Aurora's `@aurora/react-native` is qualified on exactly this combination (`aurora/examples/react_native/package.json`). Share-intent and SQLite need a development build. |
| Platforms | Android first; iOS is kept compiling but is unverified. | The user is on Windows. Android runs locally (emulator or device). iOS needs a Mac or EAS Build. |
| Sync | **Offline only.** `EntanglementDb.open` without `backend`/`accounts`, so `db.sync === null`. Only `@entanglement/core` is vendored, not `@entanglement/supabase`. | User decision. The schema is still designed to sync later (section 3). |
| Product scope | Port only behavior that is **implemented** on desktop and that makes sense on a phone (section 2). The desktop Q1-Q7 queue is not implemented there and stays out of the mobile MVP. | Avoid porting plans as if they were features. |
| Invariants carried over | Permanent history: deleting is explicit; clearing the library changes visibility only; genuine recapture restores library membership; transforms never alter the original; history is captured unless the user configures exclusions. | Desktop `AGENTS.md` and [implemented features](../../developer/implemented-features.md#behavior-to-preserve-from-the-2026-10-12-handoff). |
| Design | Reading Room language (warm paper light / deep spruce dark, dark default, brass command accent, serif headings) through an Aurora contract and theme. No drop-shadows (desktop R1). | [Design system](../../design/system.md). |

### Mobile platform reality (why capture differs)

- **Android 10+** lets only the foreground app (or the default keyboard) read the clipboard. **iOS 16+** shows a "paste from X" permission prompt on programmatic reads. A background clipboard watcher like desktop's `clipboard.rs` is not possible.
- Mobile capture therefore uses, in order of importance:
  1. The **share sheet** ("Share → Archiver" for text, URLs, images).
  2. **Android "Process text"** (select text in any app → "Archive" in the selection menu).
  3. An in-app **New clip / Paste box**.
  4. An **opt-in "check clipboard when Archiver opens"** that records the clipboard only if it changed since the last check.
- **Delivery** is "copy to clipboard" (plus the system share sheet). Focus restoration, Ctrl+V injection and shell insertion are desktop-only.

## 2. Feature map

| Desktop feature (implemented) | Mobile | Prompt |
| --- | --- | --- |
| Clipboard capture, dedupe by fingerprint, repeat suppression | **Replace**: share intent, Process-text, paste box, opt-in foreground clipboard check; the same fingerprint dedupe | P5 |
| Direct paste / focus restoration / Ctrl+V | **Replace**: copy to clipboard, share out | P4 |
| Shell insertion, shell hooks, sessions, command results, history import | **Drop for MVP**. The schema keeps a `command` kind so synced desktop commands display later. | deferred |
| Librarian (quick panel) vs Archivist (full window) | **Port** as the Library tab (library membership) vs the Archive tab (everything) | P4, P6 |
| Library scope: clear library, archive toggle, recapture restores | **Port** | P9 |
| Literal search, filters, fuzzy search, saved searches | **Port** (separate rebuildable search index) | P6 |
| Pins, tags, collections | **Port** | P8 |
| Snippets with `{{placeholder}}` templates | **Port** | P8 |
| Transforms (whitespace, case, JSON format, URL decode, Syntax Highlighting) | **Port**. `src/text-tools.ts` and `src/text-diff.ts` are pure TS (only `jsonc-parser`); copy them with their tests. | P7 |
| Syntax highlighting (highlight.js) | **Port**: `src/highlight-engine.ts` is pure (highlight.js core); render to nested `<Text>` instead of HTML | P7 |
| Full clip viewer, overwrite with revisions (R5 `item_revisions`), save as new clip, Paste Playground | **Port** as the Clip screen and Playground screen | P7 |
| Combine clips, paste queue, diff | **Port** combine and diff. The paste queue becomes "copy next" (MVP-optional). | P8 |
| Image thumbnails / previews, file metadata, URL title fetch (explicit) | **Port** images and URL titles (explicit fetch only). File items are shared files copied into app storage. | P10 |
| Deletion with opt-in recovery window | **Port** | P9 |
| JSONL export + SHA-256 manifest, verified backup | **Port** JSONL export through the share sheet. A backup equals an exported copy of the SQLite file. Import stays deferred, as on desktop. | P9 |
| Windows OCR | **Defer** (ML Kit text recognition later; platform-limited) | deferred |
| Command palette, shortcuts, F1 reference | **Replace**: long-press action sheets, swipe actions, and an "Everything in Archiver" feature-catalog screen in Settings | P4, P11 |
| Settings: theme, exclusions, recovery window | **Port** (exclusions = source apps when known, plus a capture pause switch) | P11 |
| Tray, hotkeys, updater, launch at sign-in, CLI/agent API, installer | **Drop** | - |

## 3. Data model (Entanglement collections)

Rules from Entanglement `docs/how-it-works.md` §18 apply:
- All writes go through `db.write`.
- Documents are JSON with finite numbers. Dates are epoch-ms integers.
- Singletons and seed data use deterministic ids; everything else uses UUIDv7 (`newId()` from `@entanglement/core`).
- Cascades are explicit, in the same transaction.
- Device clocks are never used for ordering decisions.

| Collection | sync | id | Fields (top level) | Indexes | Merge |
| --- | --- | --- | --- | --- | --- |
| `items` | yes | `fingerprint` at first capture (rule below). Two devices capturing the same content converge on one document. Exceptions get a UUIDv7 id (collision rules below). | `id, kind ('text'\|'url'\|'image'\|'file'\|'command'), text, truncated?, fingerprint, title?, domain?, blob? {hash, mime, bytes, width?, height?, name?}, pinned, pinnedAt?, firstSeen, lastSeen` | `kind, fingerprint, lastSeen, pinned` | `custom`: `firstSeen` = min, `lastSeen` = max, every other field three-way fieldwise; `text`, `fingerprint` and `truncated` travel together, and a both-sides edit of them is `unmergeable` (becomes a held conflict later) |
| `occurrences` | yes | UUIDv7 | `id, itemId, at, source ('share'\|'processText'\|'clipboard'\|'manual'\|'playground'\|'transform'\|'import'), sourceApp?, deviceId` | `itemId, at` | wholeDocument (immutable) |
| `revisions` | yes | UUIDv7 | `id, itemId, previousText, previousFingerprint, at` (overwrite keeps history, mirroring desktop R5 `item_revisions`) | `itemId` | wholeDocument |
| `library` | yes (**open decision D1**) | the item id | `id, addedAt` | `addedAt` | wholeDocument |
| `labels` | yes | hex SHA-256 of `itemId + "\u0000" + kind + "\u0000" + lower(name)` (set semantics; converges) | `id, itemId, kind ('tag'\|'collection'), name` | `itemId, kind, name` | wholeDocument |
| `snippets` | yes | UUIDv7 | `id, name, body, createdAt, updatedAt` | `name` | fieldwise |
| `saved_searches` | yes | UUIDv7 | `id, name, query (JSON: text, mode, filters)` | - | fieldwise |
| `preferences` | yes | `"preferences"` singleton | `themeId, appearance, recoveryWindowHours, defaultSeparator` | - | fieldwise |
| `device` | **no** | `"device"` singleton | `deviceId, clipboardCheckOnOpen, lastClipboardFingerprint, capturePaused, excludedSourceApps[]` | - | - |
| `trash` | **no** | the item id | `id, snapshot (item + occurrences + labels + library + revisions), deletedAt, expiresAt` | `expiresAt` | - |

**Fingerprint rule** (explicit; not byte-compatible with desktop, which does not matter until a desktop sync bridge exists):
- text, url and command items: lowercase hex SHA-256 of `kind + "\u0000" + text`, where the text has CRLF/CR normalized to LF and nothing else changed.
- image and file items: SHA-256 of the bytes, which is also the blob hash.

`docs/sync-schema.md` records how this differs from desktop `capture_fingerprint`.

**Id collision rules** (fingerprint-as-id has two traps):
- **Overwrite then recapture.** An item overwritten from A to B keeps id `fpA` but carries `fingerprint = fpB`. Capture must look up by the `fingerprint` index **and** `tx.get(items, fp)`. If a document already sits at id `fp` with a different fingerprint, the new item gets a UUIDv7 id.
- **Delete, recapture, undo.** If undo-delete finds a live item at the snapshot's id, it **merges** instead of overwriting: it keeps the live item, unions occurrences, labels and library membership, and takes the min `firstSeen` and max `lastSeen`.

Refs (`refs` option): `occurrences.itemId`, `revisions.itemId`, `labels.itemId` and `library.id` → `items`. So deleting an item must delete those dependents in the same `db.write`.

Images and files: the bytes never go into documents. They live at `FileSystem.documentDirectory + "blobs/<sha256>.<ext>"`, and thumbnails at `cache/thumbs/<sha256>.jpg` (rebuildable). The document carries only `blob` metadata. **Gap to solve when sync is added:** blob transfer (for example Supabase Storage keyed by hash); a missing local blob shows a placeholder.

Search index: Entanglement has no full-text search, and app code must never write Entanglement's database file. The app keeps a **separate, derived, rebuildable** `search.sqlite`:
- an FTS5 `trigram` table over `text`, `title` and label names;
- a denormalized filter table (`item_id, kind, pinned, last_seen, in_library, domain`).

It is fed by `db.onChange` (re-index the changed `items`/`labels`/`library` keys) and fully rebuilt when its `index_version` differs or on demand. If FTS5/trigram is unavailable, a LIKE-scan fallback is used behind the same `SearchIndex` interface.

The shared schema contract is documented in `archiver-mobile/docs/sync-schema.md` (P2), in the style of Quadra's `quadra-sync-schema.md`. **Future sync caveat:** desktop Archiver stores history in its own Rust/SQLite schema, not Entanglement. Desktop↔mobile sync later needs either a desktop Entanglement client (TS in the Tauri frontend, or a Rust port) or a bridge that maps `items`/`events` to these collections. Nothing in the MVP depends on that choice.

### Open decisions (defaults used unless the user says otherwise)

- **D1:** Is library membership synced, so clearing on the phone clears the desktop library too? Default: **synced**. Changing it later means a collection migration.
- **D2 (decided 2026-10-13):** App name "Archiver", package id `com.muoncollective.archiver` (Android and iOS).
- **D3:** Monospace font. Default: JetBrains Mono via `@expo-google-fonts/jetbrains-mono` (desktop uses Consolas, which is Windows-only).
- **D4:** Text size cap per item. Default: store full text up to 1 MB in the document; above that, store the text as a blob file and keep the first 32 KB in `text` with `truncated: true`.

## 4. Architecture of the new repo

```
archiver-mobile/
  AGENTS.md            rules below + "read docs/PLAN.md and PROGRESS.md first"
  PROGRESS.md          one section per prompt: done / checks run / deviations / next
  docs/PLAN.md         copy of this plan (working copy)
  docs/sync-schema.md  collection contract (P2)
  app/                 expo-router screens (UI only)
  src/
    platform/          RN-only adapters: expoSqliteExecutor.ts, fileStore.ts, clipboard.ts, shareIntent.ts
    domain/            PURE TS, no react-native imports: schema.ts, fingerprint.ts, repo/*.ts, search/*.ts,
                       text-tools.ts, text-diff.ts, highlight-engine.ts, export.ts
    theme/             Aurora contract, Reading Room theme, texture, fonts
    ui/                primitives (Screen, Card, Button, Chip, ClipRow, ActionSheet, Keycap-free)
  test/                vitest, Node, domain layer against SqlJsExecutor (sql.js)
  vendor/entanglement  vendored @entanglement/core tarball (never edit)
  vendor/aurora        vendored @aurora/core + @aurora/react-native (never edit)
```

Key rule: `src/domain` must never import `react-native`, `expo-*` or `src/platform`. Platform services are injected as interfaces (`SqlExecutor`, `BlobStore`, `Clock`, `Hasher`). This makes the whole domain testable in Node with `SqlJsExecutor`, which implements the same `SqlExecutor` interface. Only `src/platform` needs a device to test.

Rules for every prompt (put them in `AGENTS.md` in P0):
- Never edit `vendor/`. If Entanglement or Aurora has a bug or missing API, **stop and report**. Framework changes happen in their own repos, then get re-vendored.
- Domain code goes through Entanglement `db.write`/`db.query` only.
- Reading Room tokens only: no literal colors in components and no `boxShadow`/`elevation`.
- Each prompt ends by updating `PROGRESS.md`, running the verification block and committing with a message naming the prompt (for example `P3: Aurora theme and primitives`).
- Keep each prompt under about 25 agent turns. If it grows beyond that, stop at a coherent point, record what is left in `PROGRESS.md` and say so.

## 5. Prompts

Hand these over one at a time. Each says what to read; the appendix has the excerpts.

### P0: Scaffold and vendoring

> You are starting a new React Native app, Archiver Mobile, at `C:\Users\cappa\Desktop\Projects\archiver-mobile`. Read `C:\Users\cappa\Desktop\Projects\archiver\continuity\planning\studies\react-native-app.md` sections 1, 4 and the Appendix (A1, A4, A5) first.
> 1. Create an Expo app with TypeScript and expo-router, pinned to the Appendix A5 versions (match `aurora/examples/react_native/package.json`: expo ~57.0.26, react 19.2.3, react-native 0.86.3, typescript ~6.0.3). `git init`.
> 2. Copy the plan to `docs/PLAN.md`. Create `AGENTS.md` with the rules in plan section 4, and `PROGRESS.md`.
> 3. Vendor Aurora: `python C:\Users\cappa\Desktop\Projects\aurora\tools\vendor.py --react-native --project C:\Users\cappa\Desktop\Projects\archiver-mobile`. Add `"@aurora/core": "file:vendor/aurora/core"` and `"@aurora/react-native": "file:vendor/aurora/react-native"`.
> 4. Vendor Entanglement: run `git -C C:\Users\cappa\Desktop\Projects\Entanglement status --short` first. If it is dirty (it was on 2026-10-13: `tool/vendor.mjs` modified, three untracked design docs), **stop and ask the user** whether to commit there or use `--allow-dirty`. Do not commit in Entanglement yourself. Then run `node tool/vendor.mjs --ts C:\Users\cappa\Desktop\Projects\archiver-mobile\vendor\entanglement` from the Entanglement root and install only the core tarball: `npm install ./vendor/entanglement/entanglement-core-0.1.0.tgz --force`. Do not install the supabase tarball. Do not edit `tool/vendor.mjs` APPS; mention to the user that adding `archiver-mobile` there is an Entanglement change for them to make.
> 5. Add dev dependencies `vitest` and `sql.js` (for Node tests of the domain layer) and scripts: `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `bundle:android` (`expo export --platform android --output-dir dist/android`), `android` (`expo run:android`).
> 6. Add `react-native-get-random-values` and import it as the **first line** of the entry file (Entanglement's `newId()` calls `crypto.getRandomValues`, which Hermes lacks).
> 7. Configure Metro if needed so the vendored packages' `exports` subpaths and `.js` ESM imports resolve.
> Verify: `npm run typecheck`, `npm test` (one trivial test), `npm run bundle:android` succeeds. Update PROGRESS.md, commit "P0: scaffold".

### P1: Walking skeleton (fail-fast on device)

> Read `docs/PLAN.md` sections 3-4 and Appendix A1-A3, plus `PROGRESS.md`. Goal: prove Entanglement and Aurora run on an Android device before anything else is built.
> 1. Add `expo-sqlite`. Write `src/platform/expoSqliteExecutor.ts` implementing `SqlExecutor` (Appendix A1) over one `SQLiteDatabase` connection (`openDatabaseAsync('archiver.db')`). Map `select` to `getAllAsync` and `execute` to `runAsync`. Implement `transaction` with raw `execAsync('BEGIN IMMEDIATE')` / `COMMIT` / `ROLLBACK` on the same connection; do **not** use `withTransactionAsync` (the Entanglement store already serialises access). `dataVersion` reads `PRAGMA data_version`. Convert `bigint` arguments to `number` when they are safe integers, otherwise throw. Pass `Uint8Array` through. Set `PRAGMA journal_mode=WAL`, `foreign_keys=ON` and `synchronous=FULL` on open.
> 2. Add a hidden dev screen `app/dev/diagnostics.tsx` that runs these smoke checks and shows pass/fail for each:
>    - `select sqlite_version()`;
>    - a table with a `GENERATED ALWAYS AS (json_extract(doc,'$.x')) VIRTUAL` column plus an index on it;
>    - a transaction that throws, confirming rollback;
>    - a BLOB round trip;
>    - `PRAGMA data_version`;
>    - FTS5 with `tokenize='trigram'` in a separate database file;
>    - `new TextEncoder()`;
>    - `crypto.getRandomValues`.
> 3. Open `EntanglementDb.open({ executor, schema })` (no backend) with one temporary collection `scratch` (`Collection.json('scratch')`). Show a button that writes a doc and a `watch()`ed list that updates.
> 4. Wrap the root layout in `AuroraProvider` with a temporary generated theme (copy the pattern of `aurora/examples/react_native/src/theme.ts`). Color the diagnostics screen with `nativeColor(tokens.surface)` and `onSurface`.
> 5. In Node: a vitest that opens `EntanglementDb` over `SqlJsExecutor` (from `@entanglement/core/sqljs`, with `initSqlJs()`) and does write/read/watch on the same scratch collection. This is the harness every domain test uses: put it in `test/harness.ts` and record whether sql.js supports FTS5 trigram. If it does not, add a small `better-sqlite3` `SqlExecutor` adapter under `test/` for the search tests, so the primary FTS5 path is tested in Node too.
> Verify: typecheck, tests, `npm run android` on an emulator or device, then open diagnostics and confirm all checks pass. Record every result (including SQLite version and FTS5 availability on both device and sql.js) in PROGRESS.md. If any check fails, stop and report; do not work around Entanglement internals. Commit "P1: walking skeleton".

### P2: Schema, fingerprints and repositories (domain, Node-tested)

> Read `docs/PLAN.md` sections 3-4, Appendix A1-A2, `PROGRESS.md`. Implement in `src/domain` (no RN imports):
> 1. `schema.ts`: the collections from plan section 3 with `fields`, `indexes`, `refs`, `sync` and merge policies (Appendix A2). The `items` custom merge does `firstSeen` min, `lastSeen` max, three-way per field otherwise, and returns `unmergeable` when both sides changed `text`. `Schema({ version: 1, collections })`. Remove the P1 scratch collection.
> 2. `fingerprint.ts`: implement the fingerprint rule in plan section 3 exactly (do not chase desktop parity). Hash with `@noble/hashes/sha256` (add it as an app dependency) to lowercase hex. Glance at `archiver/src-tauri/src/store.rs` `capture_fingerprint` only to document the difference in `docs/sync-schema.md`.
> 3. Repositories taking an `EntanglementDb`:
>    - `ItemsRepo.capture({kind, text, title?, blob?, source, sourceApp?})`. One `db.write`: find by `fingerprint` index; if found, update `lastSeen`. Otherwise put a new item with id = fingerprint, unless `tx.get(items, fp)` returns a document whose fingerprint differs (it was overwritten); then use `newId()`. Follow the id collision rules in plan section 3. Always add an occurrence and put library membership (genuine recapture restores visibility). Return `{item, created}`. Honor `device.capturePaused` and `excludedSourceApps`.
>    - `ItemsRepo.overwriteText(itemId, text)`: reject when the new text's fingerprint already exists; write a `revisions` row with the previous text; update `text`/`fingerprint`.
>    - `ItemsRepo.saveAsNew(text, {libraryOnly|archiveOnly})` (archive-only = no library row).
>    - `pin/unpin`.
>    - `delete(itemId)`: cascade occurrences, labels, library, revisions in the same write; write a `trash` snapshot when `preferences.recoveryWindowHours > 0`.
>    - `undoDelete`, `purgeExpiredTrash(now)`.
>    - `LibraryRepo.clear()` (deletes library docs only), `restore(itemId)`, `count()`.
>    - `LabelsRepo.set(itemId, kind, names[])`, `SnippetsRepo` CRUD, `SavedSearchesRepo` CRUD, `PreferencesRepo`/`DeviceRepo` get-or-create singletons.
> 4. `docs/sync-schema.md`: the contract table (collection, sync flag, id rule, fields, indexes, refs, merge), the invariants, and the future-sync caveats from plan section 3.
> Tests (vitest over `test/harness.ts`):
> - dedupe: same text twice gives one item, two occurrences;
> - recapture after clear restores the library row;
> - clear never touches items, occurrences, labels or pins;
> - delete cascades, and refs stay valid;
> - undo delete restores everything;
> - delete, recapture, undo merges into the live item (no clobber; occurrences unioned);
> - overwrite A→B, then capture A again creates a separate item with a UUIDv7 id and leaves B intact;
> - overwrite keeps the revision and rejects duplicates;
> - archive-only save has no library row;
> - paused capture writes nothing.
> Verify: typecheck, tests. Update PROGRESS.md, commit "P2: schema and repositories".

### P3: Aurora Reading Room theme and UI primitives

> Read `docs/PLAN.md` Appendix A3-A4 (token table, Aurora imports), `PROGRESS.md`, `archiver/continuity/design/system.md`, and the token blocks in `archiver/src/style.css` (`:root` lines ~7-25 and `:root[data-theme="light"]` ~287-304), plus the `.hljs-*` color rules in the same file.
> 1. `src/theme/contract.ts`: an `AuroraContract({ id: 'archiver', extensions })` with extension color tokens `archiver.faint`, `archiver.command`, `archiver.commandBg`, `archiver.controlBorder`, `archiver.dangerBg`, `archiver.accentBg`. Add syntax tokens `archiver.syntax.{keyword,string,number,comment,function,variable,type,punctuation}` with values taken from `style.css` `.hljs-*` rules (both appearances).
> 2. `src/theme/readingRoom.ts`: an `AuroraTheme` "Reading Room" (id `reading-room`, `preferredAppearance: 'dark'`) with dark and light `AuroraThemeVariant`s. Build each by generating a base from the accent (`AuroraGenerator`, as in `aurora/examples/react_native/src/theme.ts`), then constructing an `AuroraThemeVariant` whose values copy the generated ones and override the mapped foundation roles and extensions from Appendix A3. Every foundation token must have a value (the variant constructor validates). Run Aurora's contrast helpers (`aurora/packages/aurora_ts/src/contrast.ts`) in a test over the key text/surface pairs from A3, and fail on less than 4.5:1 for body text.
> 3. `src/theme/texture.ts`: an `AuroraTextureContract` with typography tokens `archiver.type.heading` (Instrument Serif), `archiver.type.body` (DM Sans 15), `archiver.type.mono` (D3 default JetBrains Mono 13), `archiver.type.label`, plus `archiver.lines.card` (1dp `outlineVariant` solid border) and `archiver.shape.card` radius. **No shadow tokens.** Load fonts with `expo-font` + `@expo-google-fonts/instrument-serif`, `@expo-google-fonts/dm-sans`, `@expo-google-fonts/jetbrains-mono`. Use a `fontFamilyResolver` for Android per-weight families (Appendix A4).
> 4. Root layout: `AuroraProvider` with `initialSelection` from `preferences` (default theme `reading-room`, default appearance **dark**, matching desktop's dark default; System/Light/Dark selectable in P11; note Aurora RN treats an unspecified system appearance as light) and `fallback="preferred"`. Also set `expo-system-ui` background and the status bar from tokens.
> 5. `src/ui`: `Screen`, `Card` (catalog-card look: border, radius, no shadow), `Button` (`primary`/`secondary`/`danger`), `Chip` (`chosen` = background + border, no inset underline), `ClipRow` (kind glyph, first line(s), meta line, pinned mark; commands use the brass `command` color), `SectionHeader` (serif), `EmptyState`, `ActionSheet`, `TextField`, `Toast`. Use only tokens via hooks, never literal colors. Every pressable has visible focus/pressed states and an `accessibilityLabel`.
> 6. A dev-only `app/dev/gallery.tsx` showing every primitive in both appearances side by side with `AuroraFixedScope`.
> Verify: typecheck, tests (including contrast), device run with screenshots of the gallery in light and dark, recorded in PROGRESS.md. Commit "P3: theme and primitives".

### P4: Navigation, Library and Archive lists, copy-out

> Read `docs/PLAN.md` section 2, `PROGRESS.md`. Build with expo-router:
> 1. Tabs: **Library** (Librarian equivalent: library-membership items, newest `lastSeen` first), **Archive** (all items, permanent history), **Snippets**, **Settings**. Modal or stack routes: `clip/[id]`, `playground`, `new` (paste box).
> 2. A `useWatchedQuery` hook that wraps `Query.watch`, unsubscribes on unmount, and pages by `limit` (start 100, then load more on end reached). For the Library tab, list via the library collection joined to items. Do it in the repo, not the component (`LibraryRepo.watchItems(limit, listener)`).
> 3. `ClipRow` interactions:
>    - tap: copy to the clipboard (`expo-clipboard`; text with `setStringAsync`, images with `setImageAsync` from the blob file) and show a toast. A copy-out is **not** an occurrence (desktop delivery retries do not resurface either).
>    - long-press: an ActionSheet with Copy, Share (system share sheet), Open, Pin/Unpin, Tags…, Remove from library (Library tab only), Delete….
>    - swipe: pin on one side, remove from library on the other (Library tab only).
> 4. Header actions: on Library, "Clear library" (no confirmation, matching desktop; show an undo toast that calls `LibraryRepo.restore` for the cleared ids from an in-memory list; a persistent library-clear undo is desktop Q1 and out of scope) and a "+" for the paste box.
> 5. Empty states that explain how to capture (share sheet, Process text, paste box).
> Verify: typecheck, tests, device run: seed 200 items through a dev button and confirm the list scrolls smoothly, tap copies, long-press works, clear empties Library but Archive still shows all items. Commit "P4: navigation and lists".

### P5: Capture paths

> Read `docs/PLAN.md` sections 1 (mobile platform reality) and 2, `PROGRESS.md`.
> 1. **Paste box** (`app/new.tsx`): a multiline text field prefilled from the clipboard only when the user taps "Paste". Save goes through `ItemsRepo.capture({source:'manual'})`. Detect URLs (kind `url`, `domain` set).
> 2. **Share intent** (`expo-share-intent` or the current maintained equivalent for Expo 57; check its README for SDK compatibility and add its config plugin). Receive text, URLs and images (single and multiple). Images: copy the shared file into `blobs/<sha256>.<ext>` through `src/platform/fileStore.ts` (`expo-file-system`), read width/height, then capture with kind `image` and `blob` metadata. Files: same, kind `file`. Show a small confirmation screen ("Saved to Library") and return.
> 3. **Android Process Text**: an intent filter for `android.intent.action.PROCESS_TEXT` (`text/plain`) via a config plugin. Capture the selected text with `source:'processText'` and finish immediately with a toast. If that needs a native module beyond the share-intent library, write a minimal Expo config plugin plus native code and document it; if that gets too big, defer it to PROGRESS.md and continue.
> 4. **Opt-in clipboard check on open**: a Settings toggle `device.clipboardCheckOnOpen` (default **off**). On `AppState` → `active`, if enabled and not paused, read the clipboard (`hasStringAsync` first). Fingerprint it; capture with `source:'clipboard'` only if it differs from `device.lastClipboardFingerprint`, then store the new fingerprint. Explain the iOS paste prompt in the setting's description.
> 5. Capture pause toggle (Settings and a Library header indicator).
> Tests (Node): URL detection; clipboard-change logic (the same content twice records once); exclusion and pause.
> Verify: typecheck, tests. On device: share text from Chrome, share a screenshot from Photos, Process-text from any app, and clipboard-on-open with the toggle on and off. Record the results. Commit "P5: capture".

### P6: Search index, filters, fuzzy, saved searches

> Read `docs/PLAN.md` section 3 (search index), `PROGRESS.md` (FTS5 availability from P1), and in the desktop repo `archiver/src-tauri/src/search.rs` (`fuzzy_ranked` and its caps), `Store::search_items` in `store.rs`, and `archiver/continuity/developer/implemented-features.md` "Search and indexing limits".
> 1. `src/domain/search/SearchIndex.ts` is the interface: `rebuild()`, `apply(changedItemIds)`, `search({text, mode:'literal'|'fuzzy', scope:'library'|'archive', kinds?, pinned?, from?, until?, tag?, collection?, domain?, limit, offset}) → itemIds`. Two implementations:
>    - `Fts5SearchIndex` over a **separate** SQLite file `search.sqlite` (its own `SqlExecutor` connection opened through `src/platform/openSqlite.ts`, never Entanglement's file; plain `openDatabaseAsync` crashes on close with FTS5), with an FTS5 `trigram` table and a filter table;
>    - `ScanSearchIndex`, a LIKE fallback.
>    Pick at startup from the capability check. Keep `index_version` in a meta table and rebuild when it changes.
> 2. Feed it from `db.onChange`: re-index changed `items`, `labels` and `library` keys (`ChangeEvent.keys`, Appendix A2). Debounce at 200 ms. Run a full rebuild on first launch and from Settings ("Rebuild search index").
> 3. Fuzzy mode: port desktop semantics and caps (first 32,768 chars and 512 words per item, 48-char words, at most 8 query words, 512-byte query cap, 1,000 vocabulary candidates per lookup). Keep a `terms`/`item_terms` table in `search.sqlite`. Scope library searches to library membership **before** candidate limits (this fixes desktop's known limitation Q6 by construction; note it in docs).
> 4. UI: a search bar on Library and Archive (debounced), a mode toggle (literal/fuzzy), and filter chips (kind, pinned, date range, tag, collection, domain). Save the current search as a saved search; list saved searches in an Archive header menu.
> Tests (Node, both index implementations where the harness supports them): literal substring match including Unicode; fuzzy typo match; library scope excludes cleared items but archive scope includes them; filters combine; re-index after overwrite and delete; rebuild equals incremental.
> Verify: typecheck, tests. On device: search over 2,000 seeded items under 100 ms for literal (record timings). Commit "P6: search".

### P7: Clip screen, transforms, highlighting, playground

> Read `PROGRESS.md`, and in the desktop repo `archiver/src/text-tools.ts`, `text-diff.ts`, `highlight-engine.ts`, `clip-workbench.tsx`, `transform-picker.tsx` (behavior reference only; do not port DOM code) and the R5 entry of `archiver/continuity/implementation-log.md`.
> 1. Copy `text-tools.ts`, `text-diff.ts` and `highlight-engine.ts` into `src/domain` (add `jsonc-parser` and `highlight.js`). Copy their tests from `archiver/tools/text-tools.test.ts`, `highlight.test.ts` and `diff.test.ts` and adapt them to vitest.
> 2. `src/ui/HighlightedText.tsx`: convert highlight.js output to nested `<Text>` spans. Parse the `<span class="hljs-…">` HTML that `highlight()` returns with a tiny parser (spans and entities only, never rendered as HTML), and map classes to `archiver.syntax.*` tokens. Use the mono typography. Bound highlighting to the first 64 KB and show plain text beyond it.
> 3. `app/clip/[id].tsx` (Full clip):
>    - shows the full text, selectable (`<TextInput multiline editable={false}>` or `selectable` Text), highlighted when a language is chosen;
>    - a language picker (Auto + the registered languages);
>    - metadata: first/last seen, occurrence count, sources, tags, revisions;
>    - actions: Copy, Copy selection, Share, Transform…, Edit, Save as new clip, Pin, Delete.
>    - Transforms preview in place and never alter the stored item until the user chooses **Overwrite** (`ItemsRepo.overwriteText`, which keeps a revision) or **Save as new** (`saveAsNew`). Archive-only is an option on Save as new.
> 4. `app/playground.tsx` (Paste Playground): a scratch editor with paste, transforms and highlighting. Save to Library or Archive only (no library row).
> 5. Image items open a full-size viewer (expo-image, pinch zoom) instead of the text view.
> Verify: typecheck, tests (ported plus a span-parser test). On device: open a JSON clip, format it, save as new; overwrite a clip and see the revision; playground save archive-only and confirm it appears only in Archive. Commit "P7: clip, transforms, playground".

### P8: Tags, collections, snippets, combine, diff

> Read `PROGRESS.md`; reference the desktop `archiver/src/archive-tools.tsx`, `snippets.tsx` and `selection-tools.tsx` for behavior.
> 1. Tags and collections editor sheet (from long-press and the Clip screen) using `LabelsRepo.set`. Show labels on `ClipRow`. Add tag/collection filters to search (from P6).
> 2. Snippets tab: list, create, edit, delete. Snippets stay separate from captured history. Placeholders `{{name}}` and `{{name:default}}`: on "Use", show a form filling each placeholder (prefilled with defaults), then copy the rendered result. Port the desktop placeholder parsing (find it in `archiver/src/snippets.tsx`) with tests. "Make snippet from clip" on the Clip screen.
> 3. Multi-select mode on lists (long-press → Select). Actions: **Combine** (ordered by selection, separator picker: newline, blank line, space, comma, custom; persist the default separator in `preferences`; copy, or save as a new clip), **Compare** (exactly two: a diff view using `text-diff.ts`, with added/removed colored by tokens), Pin all, Tag all, Remove from library, Delete.
> Tests: placeholder parse/render; combine ordering and separators.
> Verify: typecheck, tests, device walkthrough. Commit "P8: organization, snippets, combine, diff".

### P9: Deletion recovery, export, backup

> Read `PROGRESS.md`; reference `archiver/src-tauri/src/archive_io.rs` (`export_jsonl`, manifest format) and `archiver/continuity/data/model.md` (Export and backup).
> 1. Settings: a recovery window in hours like desktop (0 = off, the default; 0-8760, enforced by `PreferencesRepo.update`; offer presets such as 1 hour / 1 day / 7 days / 30 days plus a custom value). Delete shows an Undo toast when recovery is on, and a "Recently deleted" screen lists `trash` with Restore. Run `purgeExpiredTrash` on startup and on resume.
> 2. `src/domain/export.ts`: a consistent-snapshot JSONL export. Read all synced collections inside one `db.store.read` or a single read pass; one line per document `{collection, id, doc}`; include blob metadata. Optionally zip the referenced blob files (opt-in toggle; use a maintained zip lib that works in Hermes, or skip blobs and say so). Write a manifest with the SHA-256 of each file. Save to the cache directory and open the share sheet. Never overwrite an existing file (timestamped names).
> 3. Backup: Settings "Back up database" runs `VACUUM INTO '<cache path>'` through the executor. That produces an atomic, consistent copy without closing the database and without racing writes; it is a maintenance statement, not a data write, so document it. Then hash the copy and share it. Restore/import stays **not implemented** (same as desktop).
> 4. Settings shows counts: items, library, occurrences, snippets, blobs size.
> Tests: export round trip (parse the JSONL back and compare with the DB); the manifest hash matches; an expired-trash purge.
> Verify: typecheck, tests. On device: export and share to Files/Drive, and verify that the manifest hashes match when recomputed on the PC (`certutil -hashfile <file> SHA256`). Commit "P9: recovery and export".

### P10: Previews (images, files, URL titles)

> Read `PROGRESS.md`; reference desktop `preview.rs`, `file_preview.rs`, `link_preview.rs` for the bounds.
> 1. Thumbnails: generate lazily with `expo-image-manipulator` (max 256 px, JPEG) into `cache/thumbs/<hash>.jpg`. They are rebuildable and never in documents. `ClipRow` shows thumbnails for images. A missing blob shows a "not on this device" placeholder (future sync).
> 2. File items: name, size, mime, and a bounded text preview (first 64 KB) for text-like files.
> 3. URL titles: **explicit only** (a "Fetch title" action, no automatic network). Bounded fetch like desktop: 6 s timeout, at most 256 KB read, `<title>` only. Store `title`/`domain` on the item. A Domains view in Archive lists items grouped by domain.
> Tests: title extraction from HTML samples, size bounds (mock fetch).
> Verify: typecheck, tests, device. Commit "P10: previews".

### P11: Settings, feature catalog, polish, Android release build

> Read `PROGRESS.md` and the desktop `archiver/src/feature-catalog.tsx` for its format.
> 1. Settings:
>    - Theme: Reading Room with appearance System/Light/Dark, stored in `preferences` and driving the Aurora controller.
>    - Capture: clipboard check on open, pause, excluded source apps (when the share intent exposes a sender package).
>    - Recovery window, default combine separator.
>    - Search index rebuild, export/backup, counts.
>    - About, with vendored Entanglement/Aurora provenance read from their `VENDORED.md`/manifest.
> 2. "Everything in Archiver" screen: `src/feature-catalog.ts` listing every mobile capability, clearly labeling platform-limited ones (clipboard-on-open prompts on iOS, Process Text is Android-only) and deferred ones (OCR, sync, commands/sessions).
> 3. Accessibility pass: labels on every pressable, font scaling to 200% without clipping, TalkBack walkthrough of the capture, search and copy flows, and reduced motion respected.
> 4. Performance pass: 5,000 seeded items; list scroll, search latency and cold start (record the numbers).
> 5. Android release build: `expo run:android --variant release` locally (or `eas build -p android --profile preview --local` if EAS is set up; ask before creating any EAS account or project). Do not publish anything.
> Verify: typecheck, all tests, release APK installs and runs offline (airplane mode). Final PROGRESS.md summary with every human check still pending. Commit "P11: settings, catalog, release build".

### Deferred (not in this plan; candidates for later prompts)

- **Sync:** vendor `@entanglement/supabase`, add the server SQL as a migration, sign-in, VCS vs realtime mode UI, conflict UI, blob sync. Decide how desktop joins: a desktop Entanglement client or a bridge.
- **OCR:** ML Kit on-device text recognition for images, mirroring desktop's persisted success/empty/failed results and no automatic rescans.
- **iOS:** share extension (needs native target configuration), validation on a Mac or EAS.
- **Desktop parity queue:** desktop Q1 (persistent undo for library clearing), Q2 OCR match previews, Q3 import/restore, Q4 scheduled backups, Q5 bulk tags, Q7 health diagnostics, each once implemented on desktop or chosen for mobile.
- **Commands and sessions:** display synced desktop commands (kind `command`, brass accent) once sync exists.
- **Custom keyboard (IME) capture:** the only Android path to background clipboard access; large scope, privacy-sensitive.

## Appendix

### A1. Entanglement TS API excerpts (`Entanglement/ts/packages/core/src`)

```ts
// sqlExecutor.ts: the only way the core touches SQLite
export type SqlValue = string | number | bigint | Uint8Array | null;
export type Row = Record<string, SqlValue>;
export interface SqlExecutor {
  select(sql: string, args?: readonly SqlValue[]): Promise<Row[]>;
  execute(sql: string, args?: readonly SqlValue[]): Promise<void>;
  /** Runs body inside BEGIN IMMEDIATE … COMMIT, rolling back if it throws. Never nested: the store serialises all access. */
  transaction<T>(body: () => Promise<T>): Promise<T>;
  /** PRAGMA data_version: changes when another connection commits. */
  dataVersion(): Promise<number>;
  close(): Promise<void>;
}

// db.ts
export interface OpenOptions { executor: SqlExecutor; schema: Schema; backend?: SyncBackend; accounts?: AccountSource; options?: SyncOptions; role?: "leader" | "passive"; }
class EntanglementDb {
  static open(options: OpenOptions): Promise<EntanglementDb>;   // no backend => sync === null (offline)
  readonly sync: SyncEngine | null;
  write<T>(body: (tx: Tx) => Promise<T>): Promise<T>;           // one atomic, coupled transaction
  get<T>(c: Collection<T>, id: string): Promise<T | null>;
  getAll<T>(c: Collection<T>): Promise<T[]>;
  query<T>(c: Collection<T>): Query<T>;
  watchAll<T>(c, listener): Unsubscribe;
  onChange(listener: (e: ChangeEvent) => void): Unsubscribe;
  close(): Promise<void>;
}
// tx.ts: tx.get(c, id), tx.put(c, value), tx.putJson(c, id, json), tx.patch(c, id, changes), tx.delete(c, id), tx.query(c)
// query.ts: .where(field, { isEqualTo | isNotEqualTo | isLessThan | isLessThanOrEqualTo | isGreaterThan | isGreaterThanOrEqualTo | whereIn | isNull })
//           .orderBy(field, { descending? }).limit(n).get() | .watch(listener, onError?) -> Unsubscribe
//           top-level fields only; declared indexes become generated columns ix_<field>; ties ordered by id
// store.ts: newId() = UUIDv7 (uses crypto.getRandomValues); ChangeEvent { collections: Set<string>; keys: Set<KeyString>; origin }
// schema.ts: parseKey(key) -> { collection, id }
// sqljs.ts (Node tests): new SqlJsExecutor(db: sql.js Database, { persist?, persistDelayMs? }), import from "@entanglement/core/sqljs"
```

Rules (how-it-works §18): all writes through `db.write`; inside it use `tx.get`/`tx.query` only; JSON with finite numbers, integers within ±(2^53−1); deterministic ids for singletons, UUIDv7 otherwise; cascades explicit; use `ChangeEvent.origin` to skip side effects for data that arrived from elsewhere. Re-entrant database access (calling `db.*` inside `db.write`) is only warned about in TS: never do it.

### A2. Schema options

```ts
interface CollectionOptions {
  fields?: Iterable<string> | null;    // top-level keys this build understands; others are preserved
  indexes?: Iterable<string>;          // top-level fields to index
  refs?: (doc: Json) => Ref[];         // outgoing references, checked after every merge
  merge?: MergePolicy;                 // default wholeDocument
  sync?: boolean;                      // false = device-local
}
new Collection<T>(name, { ...options, decode, encode, idOf });
Collection.json(name, { ...options, idField? });
MergePolicy.wholeDocument | MergePolicy.fieldwise(groups?) | MergePolicy.custom((base, local, remote) => ({ kind: "merged", value } | { kind: "unmergeable" }))
new Schema({ version, compatibleSince?, collections, migrations? });
// Collection names: letters, digits, underscores, starting with a letter. Table = c_<name>.
// Additive change: bump version, keep compatibleSince. Breaking: compatibleSince = version + migration.
```

### A3. Reading Room tokens (from `archiver/src/style.css`)

| Desktop token | Dark (default) | Light | Aurora target |
| --- | --- | --- | --- |
| `--bg` | `#191f1c` | `#f5f1e8` | `surface`, `background` (if present), `surfaceContainerLowest`/`Low` |
| `--panel` | `#202823` | `#fffcf5` | `surfaceContainer` |
| `--raised` | `#2a332d` | `#ede7da` | `surfaceContainerHigh`, `surfaceContainerHighest` |
| `--line` | `#3b4940` | `#d7d0c1` | `outlineVariant` |
| `--control-border` | `#84958a` | `#817b70` | `outline`, `archiver.controlBorder` |
| `--ink` | `#eeece3` | `#252b28` | `onSurface`, `onBackground` |
| `--muted` | `#afb8ae` | `#62695f` | `onSurfaceVariant` |
| `--faint` | `#a2ada1` | `#62695f` | `archiver.faint` |
| `--accent` | `#a6c8b5` | `#214e44` | `primary` (and the generator seed) |
| `--accent-bg` | `#30473b` | `#dfe9e2` | `primaryContainer`, `archiver.accentBg` |
| `--command` | `#d7bb87` | `#73572c` | `tertiary`, `archiver.command` |
| `--command-bg` | `#443a28` | `#eee3ce` | `tertiaryContainer`, `archiver.commandBg` |
| `--amber` | `#e1c083` | `#815b1b` | the warning family |
| `--success` | `#a6c8b5` | `#2e614b` | the success family |
| `--danger` | `#f0a49b` | `#a33c32` | `error` |
| `--danger-bg` | `#4b2a29` | `#f7e5df` | `errorContainer`, `archiver.dangerBg` |

The `on*` counterparts (`onPrimary`, `onPrimaryContainer`, and so on) are chosen for contrast from the generated values, checked by the P3 contrast test. Type: headings Instrument Serif, body DM Sans (desktop 14px; mobile 15), mono (desktop Consolas; mobile D3). Rules: dark is the default; focus and selection use border/background/outline, never shadows; visible focus is required.

### A4. Aurora React Native imports (`aurora/packages/aurora_react_native/README.md`)

```ts
import {
  AuroraController, AuroraProvider, AuroraFixedScope, systemAppearance,
  useAuroraScope, useAuroraVariant, useAuroraTokens, useAuroraToken,
  useAuroraTexture, useMaybeAuroraTexture, useAuroraController, useAuroraState,
  nativeColor, nativeColorWithAlpha, nativeDimension, nativeBorderRadius,
  nativeTypography, nativeStrokeStyle, nativeBorder, nativeShadow,
  nativeDuration, nativeCubicBezier, AuroraNativeUnsupportedError,
} from '@aurora/react-native';
// Core (from @aurora/core): AuroraContract, AuroraColorToken, AuroraColor, AuroraTheme, AuroraThemeVariant,
// AuroraGenerator, AuroraGenerationRequest, AuroraAliasRule, AuroraFoundation, AuroraSelection,
// AuroraTextureContract, AuroraTextureStarter, AuroraBorder, AuroraBorderToken, AuroraDimension, AuroraAlias, AuroraStrokeStyle
```

- `AuroraProvider` renders no view and follows `Appearance`.
- `view.native.border/typography` default to strict mode and throw on unsupported features.
- `lineHeight` in the output is absolute dp.
- Android custom fonts select weight by family name, so use `fontFamilyResolver`.
- Never import `@aurora/react` (browser) on native.
- `AuroraThemeVariant` validates completeness: missing, undeclared or mistyped tokens throw `AuroraValidationError`.

### A5. Pinned versions and commands

- From `aurora/examples/react_native/package.json`: `expo ~57.0.26`, `expo-system-ui ~57.0.4`, `react 19.2.3`, `react-native 0.86.3`, `@types/react ~19.2.2`, `typescript ~6.0.3`. Other expo-* packages: use the versions `npx expo install` picks for SDK 57.
- Aurora vendor: `python <aurora>/tools/vendor.py --react-native --project <app>` (`package.json` must exist first; writes `vendor/aurora/{core,react-native}` + manifest; commit it).
- Entanglement vendor: from the Entanglement root, `node tool/vendor.mjs --ts <app>/vendor/entanglement` (refuses a dirty tree unless `--allow-dirty`); then `npm install ./vendor/entanglement/entanglement-core-0.1.0.tgz --force`. Re-vendor after framework changes; check `node tool/vendor.mjs --status` (only after the user adds the app to `APPS`).
- Checks per prompt: `npm run typecheck`, `npm test`, `npm run bundle:android`, and a device run via `npm run android`.

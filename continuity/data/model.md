# Data model

Evidence: schema definitions in `src-tauri/src` (listed below), inspected 2026-10-13. `PRAGMA user_version` is set to 2 in `store.rs` `open`. There is no migrations directory: tables are created idempotently with `CREATE TABLE IF NOT EXISTS`, and one-time migrations run on open (library initialization, fuzzy index build, snippet note and item title column detection).

## Overview and schema routes

One SQLite database (`archive.sqlite` in the data directory; WAL) plus JSON files for settings and capture state.

| Concept | Meaning | Authoritative definition | Detail |
| --- | --- | --- | --- |
| `items` | One row per unique content fingerprint (clip or command): `kind`, searchable `text`, `pinned`, optional display `title` | `store.rs` `Store::open` | [Items and occurrences](#items-and-occurrences) |
| `events` | Occurrences: where/when an item was seen (`source`, `directory`, `session`, `sequence`, `repeats`) | `store.rs` | same |
| `representations` | Raw payload per format (BLOB), keyed `(item_id, format)` | `store.rs` | same |
| `search` (FTS5 trigram) | Literal full-text index | `store.rs` | [Search structures](#search-structures) |
| `terms`, `item_terms`, `fuzzy_keys`, `search_meta` | Bounded fuzzy index | `search.rs` | same |
| `labels`, `saved_searches` | Tags/collections per item; named saved searches | `search.rs` | [Labels and saved searches](#labels-and-saved-searches) |
| `library`, `library_state`, `library_clear_snapshot` | Librarian visibility set | `library.rs` | [Library membership](#library-membership) |
| `image_text` | OCR result per image (text, language, error, updated) | `ocr.rs` | [OCR records](#ocr-records) |
| `thumbnails`, `links` | Derived previews; fetched URL domain/title | `store.rs` | derived/rebuildable |
| `snippets` | Named editable text and separate note, separate from history | `store.rs` | not part of library |
| `command_results` | Exit code/duration per `(session, sequence)` | `store.rs` | joins events |
| `trash` | Serialized deleted items for opt-in recovery | `store.rs`, `archive_io.rs` | [Deletion and recovery](#deletion-and-recovery) |
| Settings / capture state | `settings.json`, capture-state JSON (pause flag) | `settings.rs`, `main.rs` `write_policy` | outside the database; not in SQLite backups |
| Export/backup | JSONL snapshot, verified SQLite backup, SHA-256 manifests | `archive_io.rs` `export_jsonl`, `backup_verified` | [Export and backup](#export-and-backup) |
| Planned structures (scheduled-backup state, syntax-highlight language preference) | Not implemented | [roadmap Q4, R3](../planning/roadmap.md#next-agent-queue-q1q7) | planned only |

## Entities, relationships, and lifecycles

### Items and occurrences
An item is identified by a content fingerprint (`capture_fingerprint` in `store.rs`); repeat copies update an occurrence (`events`) instead of creating a new item (smart repeat suppression). Commands carry `session` and `sequence`; a unique index on `(session, sequence)` makes delivery/capture idempotent. Foreign keys cascade from `items` to events, representations, thumbnails, links, OCR text and library rows.

### Library membership
`library(item_id)` lists items visible in the Librarian. Clearing deletes only these rows; payloads, occurrences, pins, labels and OCR are untouched. Genuine recapture re-adds membership; a delivery retry does not. On first open `library_state('initialized')` seeds the library with all existing items once. Snippets are always available separately. `library_clear_snapshot(item_id PRIMARY KEY REFERENCES items ON DELETE CASCADE)` stores the most recent nonempty clear in the same transaction. Empty clears keep it; undo merges membership without consuming the snapshot. Deleted items cascade out, and restart retains it. Full SQLite backups preserve it; portable JSONL exports and individual deletion recovery deliberately omit the snapshot so recovery cannot revive a prior visibility undo record.

### Labels and saved searches
Archivist groups use collection labels plus `Group: …` saved searches with a collection filter to persist empty groups. Moving a clip replaces collection memberships through `set_labels`, preserving tags and content. Empty group definitions share saved-search backup semantics (SQLite includes, JSONL omits).

Tags and collections are `labels(item_id, kind, name NOCASE)`; saved searches store a JSON blob. Updates are transactional (`set_labels`, `set_organization`, `bulk_organization`). Bulk add/remove validates 1–500 item IDs, preserves unrelated labels and limits each item to 32 tags and 32 collections, with case-insensitive deduplication and whole-selection rollback.

### OCR records
`image_text` persists success, empty, and error results so automatic jobs never repeat; manual retry may rescan, and failed retries preserve prior text. OCR text joins literal/fuzzy search, exports, backups and recovery. Search rows include derived `ocrMatch` (240 characters plus ellipses; start/end UTF-16 offsets and fuzzy flag), calculated from the selected SQL page without per-row OCR database queries. Empty queries skip OCR text reads; preview calculation never changes scan timestamps. Fuzzy metadata highlights the first OCR word matching any query word.

### Deletion and recovery
Deletion is permanent unless a recovery window is configured; then `delete_with_recovery` stores a serialized snapshot in `trash` until expiry (`archive_io.rs` `undo_delete`, `purge_recovery`). This is distinct from library clearing.

### Search structures
FTS and the fuzzy index are derived and rebuilt on migration. Fuzzy indexing is bounded (first 32,768 characters, 512 words per item, 48-character words, at most eight query words; 1,000 vocabulary candidates per lookup, 20,000 associations per word; from [implemented features](../developer/implemented-features.md#search-and-indexing-limits)). Vocabulary and posting candidates are scoped to library membership or snippets before their budgets; full-archive item search excludes snippets. Stable term/ID ordering keeps candidate truncation deterministic. Limits still apply within scope, and type/source/tag filtering happens later.

## Representations and conversion boundaries

- Raw clipboard formats live in `representations`; `items.text` is the normalized searchable form (lossy for images/files). Transformations (`src/text-tools.ts`) never alter stored items; originals remain archived.
- Frontend types mirror Rust serde structs in `src/api.ts` (camelCase). CLI `read` returns representations as byte arrays; image reads add an `ocr` object ([CLI reference](../user/cli.md)).
- Times are Unix milliseconds (`events.first_seen/last_seen`, search filters `from`/`until`).

## Export and backup
`export_jsonl` writes a consistent-snapshot JSONL with SHA-256 manifest; `backup_verified` produces a verified SQLite copy; neither overwrites existing files (test `backup_and_export_are_verified_and_do_not_overwrite` in `archive_io.rs`). Manual import/restore is implemented in R17; settings are not included.

## Change and compatibility constraints

Schema changes must stay idempotent and compatible with existing archives (one-time migrations run synchronously on open). Review together: `store.rs`, `search.rs` (index rebuild), `archive_io.rs` snapshot/recovery/export (tables are enumerated explicitly there; a new table needs handling), `cli.rs` read/search shapes, and `src/api.ts`.

### Snippet notes
`Store::open` detects and adds `snippets.note TEXT NOT NULL DEFAULT ''` idempotently, leaving user_version=2. Notes are at most 10,000 characters and never part of snippet pasted content. `save_snippet_with_note` updates name/content/note/index atomically; an omitted note in CLI or older callers preserves the existing note. Explicit empty note clears it. Search rows expose `note`; note text is not searched. Full backups and JSONL snapshots include the column. Recovery accepts old seven-column snippet records and supplies an empty note.

### Pin display names (R9)

`items.title TEXT NOT NULL DEFAULT ''` is added by idempotent column detection before search initialization. It is presentation metadata separate from `text` and from `Item.name` (the snippet discriminator). `rename_item` accepts trimmed nonempty names up to 200 characters and updates title/fuzzy postings in one transaction. Literal queries include title; fuzzy postings combine title, payload and OCR. Overwrite/OCR/recovery retain title in indexing, and recapture leaves title intact. Renaming does not alter fingerprints, payloads, occurrences or capture times; an unpinned item retains its name. Item JSON reads expose `title`; JSONL snapshots and SQLite backups include the column. Older five-column per-item recovery rows receive empty title, analogous to the existing snippet-note compatibility path.

New snippet group selection uses `save_snippet`'s optional `collection` argument and `Store::save_snippet_in_group`: validates before writes and inserts the snippet and label in one transaction. Existing save wrappers omit group; editor updates preserve collections. Moves remain replacement operations through existing label APIs. Notes remain separately stored and excluded from copy/paste and search.

### Group projection, renaming and browsing memory (R11)

Search/list Item rows now include `collections`, derived from collection labels for history and snippets. No new table or membership copy is created. `rename_collection` validates a trimmed 1–100-byte comma-free name, rejects another group's name case-insensitively, and updates labels plus saved-search JSON/key references in one transaction. `Group: ...` definitions rename with their collection; ordinary saved-search names remain unchanged. Empty group definitions persist across rename/restart. Payloads, pins, tags and event rows are untouched.

`settings.json` adds camelCase `librarianStateMemory`, default false via serde defaults. Quick-webview localStorage key `archiver-librarian-state` stores tab/query/options/scope, selection, collapsed groups, scroll, loaded count and shell session. This is a browsing cache, excluded from archive exports/backups. With memory disabled it is ignored/removed on opening; editing tools are not restored.

`archive_statistics` derives counts from permanent items/events/snippets/labels/saved searches and current library membership, with no writes. Total captures sums event repeats; source breakdown counts event rows (latest eight sources), type breakdown counts distinct items. First/latest dates come from events; snippets do not create capture events.

### Image replay cache and recent snapshots (R14)

`replay.rs` supplements replay payloads only: SHA-256 of length-delimited original format names/data names a full-resolution `replay-images/archiver-image-<hash>.png` under app data. A unique pending write and rename publishes it; subsequent replay regenerates missing files. CF_HDROP uses absolute UTF-16 DROPFILES paths and a copy Preferred DropEffect. Original representations/identity/occurrences remain unchanged. This derived cache is outside SQLite snapshots; it is rebuildable, not a second archive or full file archival. It persists so copied file references outlive UI dismissal; no automatic deletion/retention is added.

`recent.rs` reads the latest up to nine distinct noncommand items through the existing clips query (permanent scope), reverses to oldest-first, and prepares one newline-joined plain text or one image/file drop. It reads no snippets, modifies no queue/library membership and rejects mixed types before input. Fewer than N records use all available. Combined file drops validate referenced files. Capture already ignores clipboard ownership by this process, so replay does not automatically create a new history record.

Browsing collapse cache now uses `null` for default-all-collapsed (including future groups); an array lists explicitly collapsed names, with `[]` meaning all expanded for search. Old array caches still restore when memory is enabled. New Snippets tab visits reset to collapsed unless a nonempty query reveals matches; reopen restoration honors the opted-in saved state.

## Clip annotations and region OCR (R15)

`notes.rs` owns optional `item_notes(item_id PRIMARY KEY REFERENCES items ON DELETE CASCADE, note TEXT NOT NULL)`, initialized before search. Notes are capped at 10,000 Unicode characters, separate from representation identity, and prepended to the bounded fuzzy search input. Literal search includes notes. Central indexing preserves notes through rename, recapture, overwrite and recovery. Archive table snapshots/export include notes; older recovery records may omit the table. CLI/stdio read exposes a separate `note` field.

`recognize_image_region` validates finite normalized coordinates, decodes a supported original representation and crops before the existing OCR worker resizing. Shared OCR busy guard, temporary-file cleanup and Windows language limitations apply; results are ephemeral and never replace stored whole-image text. JSON explorer slices source ranges instead of serializing JavaScript numbers, preserving exact numeric values.

## Ephemeral text utilities (R16)

`diff-sides.ts` maps bounded `text-diff.ts` output back to physical sides regardless of baseline, retaining exact strings and line endings. `changedSpan` uses Unicode code points for shared edges. `text-extract.ts` validates bounded input/pattern/flags and returns ordered full-match strings; presets handle URL sentence punctuation, ASCII email patterns and absolute quoted paths. No arbitrary expression evaluation: regex executes inside `extract-worker.ts`, which the UI terminates on deadline/cancel/input change/unmount. Exact duplicate removal is case-sensitive. Results are temporary text; explicit clipboard copy follows existing capture policy. These tools add no schema or persistent draft storage.


## Import and logical replacement (R17)

archive_import.rs loads checksum-verified bounded JSONL or closed SQLite into an in-memory Store with trusted schema. Imported SQL never executes. Columns/types, supported versions, fingerprints, foreign/polymorphic references, saved-search options and independent recovery snapshots are validated. Legacy titles/notes default empty; missing legacy library tables seed incoming items. Unsupported schemas fail. A private copy rehearses merge/index rebuild without changing the live archive; a UUID token retains validated staging data and destination data_version/total_changes stamp. New preview replaces the pending token; intervening mutations require another preview.

Merge maps fingerprints to local IDs, remaps references/conflicting IDs, keeps local metadata and note/OCR/link/library entries, unions labels and imports occurrences/snippets. Exact duplicates skip; conflicting snippet names/occurrence identities abort. Portable merge omits full-backup-only state. SQLite replacement restores known logical tables plus saved searches, trash, revisions and clear-library snapshot. Mandatory verified backup/manifest precedes replacement; one immediate transaction supplies rollback/external-writer serialization. Logical replacement keeps SQLite handles valid rather than replacing files. App mutex + OCR/preview guards coordinate workers and queue captures; derived FTS/fuzzy indexes/thumbnails rebuild. Preferences/profiles/browsing caches are excluded. Limits: 256 MiB, 250,000 rows, 32 MiB JSONL lines.

Shell JSON adds protocolVersion (1; missing defaults to legacy 0). Readiness marks reports older than two minutes, invalid/future timestamps and protocol mismatch; reports are prompt-driven, not heartbeats. Stale/mismatched insertion rejects without input. Diagnostics query state/storage. Repair stages embedded existing installer/adapters and invokes -SkipCmd only after approval. Safe summary copying excludes content/paths/session IDs/error details.

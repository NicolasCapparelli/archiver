# CLI and agent API reference

Migrated verbatim 2026-10-13 from the root `CLI.md`; this is the authoritative `archiverctl` and stdio API reference. Implementation route: [map](../agent/map.md#cli-api). Indexing/candidate limits referenced as "See STATUS.md" below now live in [implemented features](../developer/implemented-features.md#search-and-indexing-limits).

# Local CLI and agent interface

`npm run test:cli` builds and verifies the debug helper. Release packaging builds and bundles `target/release/archiverctl.exe`. Run `archiverctl help` for syntax. `ARCHIVER_DATA_DIR` selects another archive; by default the helper uses the desktop application's data directory.

```powershell
.\target\release\archiverctl.exe search 'git' command 0
.\target\release\archiverctl.exe read '<item UUID>'
.\target\release\archiverctl.exe import 'C:\path\ConsoleHost_history.txt' powershell
```

Search returns up to 50 results. Filters: `all`, `clips`, `command`, `failed`, `pinned`, `links`, `snippets`. Offset starts at zero. Matching is literal by default. An optional fifth argument is JSON search options, for example `search 'gti' command 0 '{"fuzzy":true,"directory":"archiver"}'`. Read returns kind, text, and representations with byte-array `data`. Snippet IDs start with `snippet:`. Imports support `powershell` and `clink`; see [usage](usage.md#shell-setup) for accepted source formats.

Search options: `source`, `directory` (literal substrings), `kind`, `from`, `until` (Unix milliseconds, inclusive start / exclusive end), `pinned` (boolean or null), `session`, `tag`, `collection`, and `fuzzy`. Tags and collections match whole names without regard to ASCII case. Source/directory/date/session filters must match the same historical occurrence; results show the latest occurrence satisfying those filters. Snippets use their latest edit date and have no directory/session. Fuzzy mode searches indexed content words, including snippet names; literal mode also searches source, directory, and fetched URL titles. See [implemented features](../developer/implemented-features.md#search-and-indexing-limits) for the indexing and candidate limits.

Both search modes include recognized image text after a Windows OCR scan in the desktop app. Image `read` responses retain the original `text` and representations, and add `ocr: {"text":"…","language":"en-US","error":""}`. `ocr` is null for unscanned images and other items. The CLI does not start recognition.

Search covers the full permanent archive by default. Add `{"libraryOnly":true}` to search only the Librarian's visible library. Named snippets remain separately available. `library stats` counts visible captured items; `library clear` removes their visibility without deleting archive data; `library undo-clear` merges the most recent nonempty clear snapshot into current membership (durable across restart, does not recreate deleted items); `library restore ITEM_ID` makes a captured item visible again. A genuinely new capture restores membership automatically, while a retried command delivery does not. `session-timeline SESSION [OFFSET]` returns up to 50 recorded submissions in sequence, including repeated commands and their original directory/completion metadata.

`contribute` reads UTF-8 JSON on stdin:

```json
{"kind":"text","text":"Agent result 🛰","source":"my-agent","timestamp":1791763200000,"directory":"C:\\work"}
```

Timestamp is Unix milliseconds. Optional representations are `[{"format":"PNG","data":[137,80,78,71]}]` (supply the entire payload). File text is newline-separated paths. For command records, supply a UUID `session` and positive integer `sequence`; that pair makes retries idempotent. Explicit contributions are allowed while passive capture is paused.

`snippet` reads `{"name":"Notes","kind":"text","text":"Project {{project}}"}` on stdin. Kind must be `text` or `command`. Optional `id` updates an existing snippet. Names are unique without regard to case.

Success is JSON on stdout. Errors are JSON on stderr with exit status 1. Input is limited to 1 MB. Pipe UTF-8 from your runtime; Windows PowerShell 5.1's default native-pipe encoding can lose Unicode.

## Persistent stdio API

Start `archiverctl serve`. Exchange one JSON object per line; close stdin to stop. This is JSON Lines, not HTTP or JSON-RPC 2.0. Methods: `search`, `read`, `contribute`, `snippet`, `stats`, `sessions`. Responses carry the request `id` and `result` or `error`; malformed JSON has a null id. The sessions method returns the 100 most recent recorded command sessions, excluding imported history.

Additional methods: `library_stats`, `clear_library` and `undo_library_clear` take empty params; the undo result is `{"restored":COUNT}` for newly restored memberships; `restore_library_item` takes `{"id":"ITEM_ID"}`; `session_timeline` takes `{"session":"SESSION","offset":0}`. These operate on the same library and session records as the desktop app. Clearing the library does not delete clips, payloads, events, OCR text, or snippets.

```json
{"id":1,"method":"search","params":{"query":"git","filter":"command","offset":0}}
{"id":2,"method":"contribute","params":{"kind":"text","text":"Agent note","source":"my-agent","timestamp":1791763200000}}
{"id":3,"method":"stats","params":{}}
{"id":4,"method":"search","params":{"query":"gti","filter":"command","options":{"fuzzy":true,"directory":"archiver","pinned":false}}}
{"id":5,"method":"sessions","params":{}}
```

Keep a subprocess alive, write UTF-8 requests, and read corresponding response lines. Desktop views detect external writes. Search and contributions work without the desktop app running. There is no network listener or saved-command execution endpoint.

## Shell bridge

`session`, `begin`, `finish`, `take`, and `ack` are adapter plumbing for atomic spool/session files, literal input, completion metadata, and single-use insertion. `take` returns a request ID and literal text; the shell inserts into its editing buffer before acknowledging. Use the supplied adapters rather than eval-based integrations.



Snippet save JSON accepts an optional `note` string (up to 10,000 characters); omitting it on edits preserves the existing note, and an empty string clears it. Search/list snippet rows expose `note`; copied content remains the text alone. Search image rows expose optional `ocrMatch` excerpt/highlight offsets (UTF-16)/fuzzy flag.

R15: `read` (CLI and stdio) returns the separate archived clip `note` alongside text, representations and OCR; notes are not part of payload text. Snippet notes retain their existing search metadata representation.

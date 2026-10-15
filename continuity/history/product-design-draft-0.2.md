# Product and technical design draft 0.2 (historical)

Migrated verbatim 2026-10-13 from the root DESIGN.md. Role: original product and technical design rationale; **partly historical and superseded by source**. The visual direction below was superseded by the Reading Room study ([design](../design/README.md)); current behavior is in [implemented features](../developer/implemented-features.md) and source. Unimplemented or open proposals from this draft are captured in [ideas](../planning/ideas.md) (items marked "design draft 0.2"). Quoted proposals (shortcut, filter syntax, performance targets) are proposals, not current behavior.

# Archiver — product and technical design, draft 0.2

Visual direction update, October 12 2026: the space/physics identity proposed below is superseded by the Reading Room study in `design-study/index.html` and `design-study/IMPLEMENTATION.md`. The Librarian and Archivist now share catalog-card branding, paper/spruce themes, brass command accents, and content-led layouts. See `design-study/MIGRATION.md` for checks and remaining native validation. This document retains historical product/technical proposals; STATUS.md and the implemented feature catalog describe current behavior.

Status: product direction incorporates the user's decisions; technical details remain a design proposal. Windows V0.1 requires PowerShell and CMD. Cross-device sync and additional shells follow later.

## Product idea

Archiver is a local desktop memory for things you copied and commands you entered. It quietly preserves supported content, then makes retrieval feel immediate. Windows first; shared storage and search core with platform-specific capture adapters for macOS and Linux.

Three principles: retain history until the user deliberately removes it; make common retrieval possible entirely from the keyboard; make capture coverage and failures visible.

“All encompassing” means all supported clipboard representations and submitted interactive commands in connected shells. It cannot promise every transient clipboard value, every proprietary format, commands from disconnected sessions, or historical metadata that was never recorded. These boundaries should be explicit in the product.

## Everyday experience

### Quick access

A configurable global shortcut opens a compact panel near the active window, constrained to the current monitor. Proposed starting shortcut: Ctrl+Alt+V, subject to conflict detection and user customization.

Search receives focus immediately. Recent items appear before typing. Tabs switch among Clips, Commands, and All; remember the last selection. Arrow keys navigate, Enter performs the primary action, Escape returns focus. Ctrl+Enter copies without pasting. Keyboard shortcuts also support plain-text paste, pinning, and details.

Clip rows show a useful preview, type, source app when available, relative time, and repeat count. Image rows use thumbnails. Command rows show command text, shell, directory, and time, with completion information only where reliably available.

Enter on a clip restores the clipboard, closes the panel, and attempts paste into the original application. Provide a copy-only preference and a clear fallback when focus restoration or elevated-app permissions prevent paste. Enter on a command copies it by default; optional insertion into a connected shell must never submit it automatically. Multiline commands deserve an explicit insertion preview.

Design direction: a modern physics/space-themed product. Reference inspection of Tunnel and Waveform found Aurora theme contracts, muted mineral/sage palettes, generous rounded surfaces, fine borders, expressive heading typography, and orbital artwork in Waveform. Carry that restraint and visual consistency into a distinct Archiver identity.

Proposed identity: orbital archive. Midnight ink or warm paper surfaces, pale spectral blue for selection, muted violet for command accents, small amber status indicators, thin orbit/trajectory motifs, and a timeline rail with occurrence markers. DM Sans for controls and body, a restrained serif heading in the main window, and a bundled monospace face for commands. Use normal labels (Clipboard, Commands, Pinned), with the physics theme expressed visually.

Offer system/light/dark appearance through a stable semantic theme contract. Evaluate reuse of Aurora's core/web adapter, already present in the reference projects, rather than duplicating their whole app scaffolds. Keep decorative orbit art static and outside dense results; no permanent particle loop or expensive full-window blur. Popup content is interactive immediately; any 100–140 ms opacity/translation treatment must not delay it. Support reduced motion, screen readers, clear focus states, and high DPI.

### Main window

Sidebar: All, Clipboard, Commands, Pinned, Settings. A central results list and optional right-side details pane support browsing without opening a new window for each item.

Filters: date range, app, content type, shell, directory, pinned status. Details show full content, exact timestamps, capture provenance, occurrence history, and copy/export/delete actions. Directory filtering should optionally include descendants.

Repeated identical content is grouped by default; “show occurrences” expands meaningful capture events. Rapid repeat-copy gestures collapse before persistence, as specified below. Commands preserve whitespace and line breaks exactly; clipboard payloads preserve supported native formats alongside a searchable text representation.

### Search

Start with literal text, phrase, prefix, and substring search. Commands need punctuation-aware matching for paths, flags, identifiers, and fragments such as `--force`, `src\\`, or `git re`.

Optional typed filters mirror visible controls: `type:image`, `shell:pwsh`, `after:2026-10-01`, `app:chrome`, `dir:"C:\\work"`. Offer autocomplete and explain invalid filters. These examples are proposed syntax.

With no query, sort newest first. With a query, prioritize exact and strong text matches, then recency; allow explicit chronological sorting. Fuzzy matching is a bounded fallback over candidates, not a scan of the archive. Semantic/AI search is deferred.

## V0.1 scope

| Area | Proposed commitment |
| --- | --- |
| Clipboard | Text, rich text, images, file lists, and an extensible native-format capture/replay layer; enabled out of the box |
| Retention | Unlimited age and count by default; manual deletion and explicit optional retention rules |
| Retrieval | Quick panel, main browser, indexed search, filters, pinning |
| Commands | PowerShell 5.1 and 7 plus CMD automatic capture; command, submission time, directory, and session |
| Integration setup | Explicit one-time shell setup is accepted; preserve and restore existing configuration |
| Command retrieval | Copy by default; optional insert into a connected shell without submitting |
| Operation | Tray app, optional launch at sign-in, pause capture, integration health |
| Data ownership | Local storage, export/import, consistent backup and recovery path |

Copied file lists preserve references and metadata, not the contents of the files. Show missing files honestly. Full file archival would be a separate explicit feature.

Defer cloud sync, accounts, command output capture, OCR, command execution, and automation workflows. Additional shell adapters (WSL/bash/zsh/fish) can be assigned to a parallel agent later; none are required for Windows V0.1. CMD capture is a release gate, with feasibility and compatibility work first.

“Everything out of the box” is the clipboard product goal: no text-only mode or per-format setup required. Implement replayable standard formats plus registered/custom formats that can safely be serialized. Inventory available formats and store format names, fidelity status, and payloads. Handle native graphics handles, delayed rendering, OLE virtual files, and app-private formats through explicit adapters. Where safe capture/replay is impossible, show the limitation; a process-owned object cannot be made portable merely by recording its handle. Preserve originals and derive previews separately. Clipboard file references and virtual file payloads are distinct cases; do not quietly copy arbitrary referenced files into the archive.

## Capture design

### Clipboard

On Windows, subscribe to native clipboard update notifications. Copy supported representations promptly, release the clipboard, and perform hashing, thumbnails, indexing, and persistence off the capture thread. Clipboard access can fail temporarily; use bounded retries and visible diagnostics.

Record capture time, content formats, byte size, clipboard sequence, and source process/app when available. Source metadata is best effort; foreground app is only a fallback hint, not proof of origin. Do not collect window titles by default. A URL copied as content does not imply we know which browser page it came from.

Handle delayed rendering, transient content, rapid updates, self-generated clipboard writes, sleep/resume, and lock/unlock explicitly. Retrieval should record a reuse action without inventing a new external capture occurrence.

Capture everything accessible by default, including sensitive content: no password-manager app blocklist, secret detection, automatic redaction, or automatic exclusion based on sensitive-content advisory markers. Pause, exclusions, and deletion are explicit user controls only; no rules are enabled automatically. OS-enforced inaccessible content and unreadable formats remain technical limitations.

### Smart repeat-copy suppression

Treat repeated Ctrl+C gestures as one capture occurrence, independently of long-term content deduplication. Proposed initial rule: collapse consecutive captures with the same payload fingerprint and source identity within a rolling two-second quiet window. Preserve the first capture time, update last-seen time on the same event, and keep at most an aggregate repeat-signal count. No separate occurrences or separate search rows are created for the burst.

Compare meaningful representations, not transient bookkeeping formats or raw native handles; still preserve safely captured original payloads. Do not merge across a different intervening clip, a changed representation, a changed known source, or a larger time gap. If source identity is unknown, collapse only consecutive matching payloads within the window. This is a gesture heuristic, not proof of user intent; validate the window during implementation.

Examples:

| User action | Stored result |
| --- | --- |
| Ctrl+C five times on one selection within a short burst | One item, one occurrence |
| Copy A, copy B, copy A | A has two occurrences; B has one |
| Copy A now, copy A ten minutes later | One grouped item with two occurrences |
| Same text, different meaningful rich-text/image representation | Separate item |
| Archiver restores A for paste | Reuse action; no new external capture occurrence |

Repeated executed commands always remain separate occurrences, even if adjacent and identical. A shell event retried over IPC is deduplicated by session ID plus sequence number, not by command text.

### Commands

Capture submitted interactive command text, including multiline input, not keystrokes, passwords at input prompts, or every child process invocation.

Windows Terminal is a host, while PowerShell/CMD/bash are shells. Install adapters per shell rather than per terminal. The same shell integration should work across supported terminal hosts, with a tested compatibility matrix.

PowerShell: prototype a composable profile/module integration that records command submission and pre-execution directory, then correlates completion metadata where reliable. Preserve existing PSReadLine handlers, prompt customizations, and the shell's own history policy. Archiver captures submitted commands independently of PSReadLine's history filtering, consistent with the user's capture-everything decision; this must not change what PSReadLine itself saves. Capture the command before execution, including commands that fail. Existing history imports contain command text but may lack reliable execution timestamps and directories; mark unknown values as unknown.

Adapters deliver events through authenticated local IPC. Each event carries session ID, sequence number, adapter version, shell, directory, command, and submission time. Capture hooks must have bounded overhead and avoid waiting indefinitely for Archiver. An optional bounded local spool supports brief app outages; overflow is reported, never silently described as complete capture.

CMD: automatic capture is required for V0.1. Investigate an explicitly installed compatible line-editor integration (including Clink as a candidate, pending licensing/compatibility review) against a dedicated session helper. Select the least intrusive approach that reliably observes submitted text and pre-execution directory without breaking interactive editing. One-time setup and new-session activation are acceptable; show whether each session is connected. DOSKEY history is useful for limited retrieval/import, but does not by itself establish complete live events and exact per-command metadata. Avoid making invasive process injection a default architecture. Do not ship limited history scraping as if it satisfies this requirement.

WSL/bash/zsh/fish: later adapters follow the same event schema. Distinguish host and guest paths, distribution, and local versus remote session identity. Commands typed in a remote shell need a remote integration; the desktop cannot assume visibility into them.

## Storage and architecture

Selected starting stack: Rust core, SQLite, Tauri 2, and a small React/TypeScript UI built with Vite. This balances a shared desktop UI and release path across Windows/macOS/Linux with native capture adapters and a performance-focused core. Use a small shared component layer and semantic theme tokens; evaluate Aurora reuse from the reference projects. Actual popup latency and total process memory remain acceptance gates. If a webview misses the budget, keep the core and evaluate a native quick panel before rewriting the entire product.

Architecture:

```text
Platform clipboard adapter / Shell adapters
                    |
           bounded ingestion queue
                    |
      policy -> normalization -> single writer
                    |
           SQLite + content-addressed blobs
                    |
            indexed search service
                    |
            Quick panel / Main window
```

The per-user background core owns capture, storage, settings, and global shortcuts. Closing the main window leaves capture active. UI work cannot block capture. Native permissions and replay behavior stay behind platform adapters; platform parity is tracked independently.

Suggested entities:

- `items`: logical clipboard entries or exact command text, searchable content, pin state.
- `representations`: format, content hash, size, inline data or blob reference.
- `events`: occurrence ID, item ID, first capture time, last-seen time, aggregate repeat-signal count, source, session, directory, provenance quality; command adapter sequence where applicable.
- `sessions`: shell, host, adapter version, machine/guest identity.
- `command_results`: optional completion time, status, duration, linked to an occurrence.
- `settings`: versioned explicit capture and retention policy.

Do not merge items solely because plain text matches when other representations differ. Identical payload bytes can share storage while occurrences remain separate. Keep metadata that was observed distinct from metadata inferred during import.

Use SQLite WAL with a single writer, short transactions, scheduled checkpoints, and explicit durability settings. FTS5 serves text search; benchmark token and trigram indexing for punctuation-heavy commands. Short queries need a bounded fallback because trigram indexing does not solve every fragment search.

Keep large blobs outside rows, generate thumbnails asynchronously, paginate by stable keys, virtualize lists, and request previews instead of full payloads. Write blobs atomically before referencing them; reconcile orphaned files after crashes. Persist raw accepted events before expensive indexing, then recover unfinished derived work at startup.

Database migrations must preserve history. Backups use a consistent database snapshot and referenced blobs; copying only the main SQLite file during active WAL writes is insufficient. Export formats preserve occurrence metadata and indicate omitted binary formats.

## Retention, privacy, and reliability

Default: no age expiration, no item-count cap, no silent eviction when disk is low. Show archive size and storage growth. Warn on low space; if persistence fails, report degraded capture and preserve what is already durable.

Optional retention rules should preview affected entries before activation. Initial recommendation: pins are exempt unless explicitly included. Removing a rule stops future deletions; it does not restore already deleted history. Define whether a grouped item qualifies by individual occurrence age or last occurrence; default to occurrence-level rules.

Include pause/resume, explicit capture exclusions, bulk deletion by date/source, and manual deletion. Deleting an item removes its events, representations no longer referenced, search entries, and derived previews. Explain the separate lifetime of existing backups. Do not claim forensic erasure from ordinary deletion on SSDs.

Treat clipboard content as untrusted: render HTML as inert content, block external resource loading, and constrain image decoding. Shell events must not grant the UI arbitrary command execution rights. Diagnostic logs omit captured content by default.

V0.1 uses unencrypted local storage; encryption is not required. Cross-device sync is a later feature. Give items/events stable IDs and versioned export schemas now so sync can be added without redesigning identity. Sync conflict resolution, deletion propagation, accounts, and transport remain future design work.

## Performance acceptance targets

Targets, not measured claims; benchmark on a documented midrange Windows laptop with an SSD.

| Metric | Initial target |
| --- | --- |
| Warm quick-panel first interactive frame | p95 under 100 ms |
| First 50 search results, one million text occurrences | p95 under 100 ms for defined representative queries |
| Idle background CPU | Under 0.5% average with no ongoing capture/indexing |
| Background private memory | Under 50 MB with main UI closed; account for retained webview processes |
| Total private memory with quick panel | Under 150 MB |
| Ordinary text capture to durable storage | p95 under 100 ms |
| Shell submission overhead | p95 under 5 ms while daemon is healthy |

Measure archive/index size, cold startup, large images, burst capture, UI frame times, and indexing backlog separately. Define a realistic dataset with repetition and distinct content, not just one million copies of one string. Test accented/non-Latin text, long commands, and concurrent capture/search.

Correctness gates: committed events survive process crashes; self-paste causes no capture loop; five rapid identical copies create one occurrence; A/B/A and later repeat copies preserve meaningful occurrences; repeated command submissions remain distinct; unsupported capture and permission failures are visible; hooks preserve shell behavior. Exercise storage exhaustion, malformed payloads, suspend/resume, migrations, and backup restoration.

## Useful expansions after the core

1. Paste as plain text and copy command without submitting: high value, small surface area.
2. Project-aware command search: offer the active connected shell's directory as an optional filter.
3. Named pins/snippets: turn frequently reused content into a small personal library.
4. Multi-item paste with a preview and chosen separator.
5. OCR on captured images, with original content preserved.
6. Related commands from the same session/directory; optionally save a sequence as a recipe.

## Implementation order

1. Prove native clipboard capture/replay across the format matrix, smart repeat suppression, PowerShell metadata capture, required CMD integration, and popup performance. Establish actual memory and latency before polishing UI.
2. Implement durable storage, deduplication with occurrence preservation, indexed search, and crash recovery.
3. Build the quick panel and main browser around representative large archives.
4. Complete exclusions, retention, export/backup, diagnostics, integration installation/uninstallation, and Windows packaging.
5. Expand shell coverage, then macOS/Linux adapters and their permission workflows.

## Confirmed direction and remaining engineering decisions

Confirmed: comprehensive clipboard capture out of the box; PowerShell and CMD in Windows V0.1; one-time shell setup accepted; copy plus optional command insertion without execution; everything captured by default; no encryption requirement; sync later; modern physics/space identity informed by Tunnel/Waveform; intelligent repeat-copy suppression; stack chosen for cross-platform release and measured performance.

Engineering decisions to resolve through prototypes: exact native-format coverage/fidelity matrix; CMD integration mechanism; repeat-copy quiet window; Aurora integration footprint; webview prewarming versus memory budget; signed installer and update packaging. No additional user decisions are required to continue refining this design.

## Technical references

- [Windows clipboard listener and sequence APIs](https://learn.microsoft.com/en-us/windows/win32/dataxchg/using-the-clipboard)
- [Windows Terminal as a shell host](https://learn.microsoft.com/en-us/windows/terminal/)
- [PSReadLine history and filtering](https://learn.microsoft.com/en-us/powershell/module/psreadline/about/about_psreadline?view=powershell-7.6)
- [DOSKEY history](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/doskey)
- [Tauri process model](https://tauri.app/concept/process-model/)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)

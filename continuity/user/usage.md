# Usage guide

Migrated 2026-10-13 from the root README (everyday use, storage, shell setup, search, CLI summary, validation limits). Behavior is described as documented by the earlier sessions; source and [status](../status.md) own what is verified. Build/run commands: [setup](../developer/setup.md). Release/updater setup: [release](../developer/release.md). CLI syntax: [cli](cli.md).

## Everyday use

**Ctrl+Shift+J** (or command palette → Emoji catalog) opens searchable emojis in Librarian and Archivist. Browse a responsive grid and search by English name, feeling (such as scared, nervous or tired), category, symbol, shortcode-style text such as `:thumbs_up:`, or common aliases such as `lol` and `+1`. Choose a category to narrow results. Arrows move between grid cells (WASD outside search); selected names appear below the grid; Home/End and PgUp/PgDn jump to the ends; Ctrl+K returns to search. Enter or Shift+Enter copies; Ctrl+Enter or Ctrl+Shift+Enter pastes into the previous app using the normal Windows destination checks. Escape closes the catalog. Archivist also provides Copy/Paste buttons. Browsing adds no history; copying follows normal capture settings. All 3,781 Unicode 16.0 sequences are available offline; newer glyphs may require newer system fonts.

The **Librarian** quick panel defaults to **Ctrl+Win+Period**, configurable in Settings. The full **Archivist** window browses the permanent archive. Up/Down and Home/End navigate results; Left/Right switches tabs while results/tabs have focus or search is empty. Alt+Left/Right switches tabs while editing a search. Tab/Shift+Tab reaches other controls. Enter copies, Shift+Enter copies plain text, Ctrl+Enter pastes into the previous app, and Ctrl+Shift+Enter pastes plain text. Escape dismisses the Librarian. Ctrl+K focuses search, Ctrl+Comma opens Archivist Settings, Ctrl+Shift+P opens the command palette, and **F1 opens a dialog with all shortcuts and tool access**.

The **library** is the Librarian's visible set; the **archive** keeps all durable history. **Ctrl+Shift+A** toggles full archive results in the Librarian, with a visible Archive indicator. **Ctrl+Shift+Backspace** clears the library without deleting payloads, occurrences, or OCR text. New captures make archived items visible again; command delivery retries do not. The Archivist always searches the entire archive and offers **Add to library** in item details. Existing archives begin with all captured items visible once during migration; a cleared library stays clear across restarts. Named snippets remain separately available when the library is cleared.

Paste tracks the previous Windows foreground window and focused control, restores them, and verifies the destination before sending Ctrl+V. Closed destinations or rejected focus changes produce an error. General paste into recognized terminals is blocked: use **Insert command without running**, which inserts literal text through a connected shell's editing buffer. Multiline commands are preserved; no Enter is sent. Choose the correct session in Windows Terminal because Archiver cannot identify its active tab from the foreground window alone.

The Librarian uses a narrow 480×720 window, bounded to the monitor's usable area. Its single footer row shows selection, copy, paste, transform, and F1 for all keys. **Ctrl+Shift+F** opens filters/saved searches; **Ctrl+Shift+Q** opens clip combination/paste queue; **Ctrl+Shift+E** edits text/templates; **Ctrl+Alt+O** opens the Archivist. F1 also exposes the insertion session selector. The command palette fills the window as a page, includes these tools, and scrolls arrow-key selections into view. Scrollbars remain visible.

Images have lazy thumbnails and full-size previews. Text, JSON, SQL, code, and commands support highlighting. Named snippets can be edited and use literal {{name}} or {{name:default}} placeholders. Select a text entry and press **Ctrl+T**, choose a transformation with Up/Down, then press Enter to transform and copy. Quick access closes after copying; the archive stays open. Invalid input leaves the picker open with an error. Available transformations trim whitespace, change case, format JSON while preserving numeric literals, and decode URLs; originals remain archived.

Windows image OCR queues newly copied unscanned images for background recognition; the worker checks event IDs every five seconds. A catch-up batch runs every **two hours** by default, up to 25 images. Settings independently toggles capture-triggered OCR and configures the catch-up interval (30–86400 seconds, or 0 to disable catch-up). Legacy 60-second settings without the new capture toggle migrate to two hours; explicit disable/custom intervals remain intact. Success, empty text, and errors persist across restarts so automatic jobs never repeat already processed images. Manual batch scanning and individual **Extract text / Scan again** remain available. Recognition runs locally using installed Windows OCR languages, one image at a time, on a preview bounded to 2048×2048. Extracted text joins literal/fuzzy search, exports, backups, deletion recovery, and CLI reads. Manual and automatic scans share one worker; capture pause pauses automatic work. Stop takes effect between images, each with a 40-second timeout. Failed retries preserve prior recognized text. macOS/Linux OCR adapters remain future work.

**Ctrl+Shift+S** opens a named-snippet editor prefilled with the selected text or command, including any prepared text. Save it for reuse without changing the original history entry.

Quick access prioritizes commands previously used in the selected shell directory. Completion metadata and Failed search expose failed executions. Occurrence timelines show source, directory, session, and completion data. Selection tools combine ordered clips with configurable separators. A shared paste queue advances one field at a time without sending Tab or Enter.

URLs support domain browsing and title search. Fetching a title requires a click, contacts the URL, and follows up to three redirects; pages are never rendered. Copied files retain their original paths and can be checked for availability. Explicit file previews show PNG/JPEG/BMP thumbnails up to 8 MB or bounded text/code up to 64 KB; binary files are not rendered as text.

## Storage and recovery

Windows data lives at %LOCALAPPDATA%\app.archiver.desktop\archive.sqlite3, with settings alongside it. Data is unencrypted and never expires by default. Source exclusions are opt-in exact, case-insensitive executable names. Known clipboard global-memory representations are stored and replayed. Close hides the app; tray Quit stops capture. Pause persists and stops new passive clipboard/shell capture. Earlier spooled commands remain for ingestion after resume.

Excluding waveform-cli.exe prevents future capture of its dictation copies and restoration of the previous clipboard. The reported old item was unpinned rich text promoted by Waveform's restoration, rather than a stuck pin. Earlier records remain. node tools/diagnose-clipboard.mjs waveform-cli.exe rich performs metadata-only diagnosis.

Deletion is permanent by default. Explicitly configure a recovery window before deleting to enable Undo. Expired recovery records are purged while running and when recovery is accessed. JSON Lines exports preserve representations as base64 plus occurrence/completion metadata, excluding recovery records. SQLite backups include the database snapshot, pass integrity/foreign-key checks, and have SHA-256 manifests. Settings provides backup verification. Existing output files are preserved. Settings and shell profiles are separate; export-import and automatic restore workflows are not implemented.

## Shell setup

Run the one-time Windows setup:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\install.ps1
```

It copies stable adapters to AppData, adds managed blocks to PowerShell 5.1/7 all-hosts profiles with backups, installs Clink through winget if needed, registers its CMD adapter, enables cmd.get_errorlevel, and enables Clink autorun. Restart shells afterward. -WhatIf, -SkipCmd, -ClinkPath, and -Uninstall are supported. Uninstall preserves unrelated profile content, Clink, and its autorun. PowerShell execution policy is not changed.

PowerShell observes standard PSReadLine Enter and records text/directory, session, sequence, duration, success, and native exit code where available. Cmdlet failures may have a success flag without a native numeric exit code. Clink observes onendedit and the next prompt; its duration has one-second resolution. The insertion chord is **Ctrl+X, Ctrl+A**. Requests expire, are consumed once, and acknowledge editing-buffer insertion. Existing custom bindings are preserved. Alternate accept bindings, custom Enter, Vi mode, and all paste/submission paths still need coverage and interactive testing. Automated tests use isolated profiles and mocked Clink, without modifying real shell profiles.

Settings imports PSReadLine history, including backtick-continuation records. For Clink, first export its supported UTF-8 text form:
```bat
clink history --bare > clink-history.txt
```

Reimporting the same file is idempotent even after appending records. Imported history does not invent execution timestamps, directories, or completion data absent from its source.

Experimental Bash 4+, Zsh, Fish, and WSL adapters and install-unix.sh are in integrations. On WSL, use the Windows CLI so events reach the Windows archive:
```sh
sh integrations/install-unix.sh /mnt/c/path/to/archiverctl.exe
```

This copies stable hooks, creates managed profile blocks, and backs up existing profiles. Bash requires emacs Readline and standard Enter; alternate bindings and multiline submission coverage are incomplete. Zsh/Fish hooks are untested in their real shells. WSL process health is explicitly unverified. Native macOS/Linux clipboard capture and focus restoration remain required platform work.

## Finding and organizing history

Open **Filters & searches** in the archive or quick-access menu to combine source, directory, type, pins, dates, tags, and collections. Date ranges include the selected final calendar day. Save the query, view, and filters under a name, then load them together later. Saved searches persist in the local archive database.

Enable **Fuzzy words** for partial names and small typos, such as `gti chekout`. Exact words rank ahead of prefixes and typo matches, with directory preference applied first in quick access. Fuzzy indexing has explicit content and candidate limits; literal search remains available for punctuation and full content. Browser sample mode disables archive-only fuzzy/label controls.

Item details contain **Tags & collections**. Enter comma-separated names and save; both sets update together. Empty fields clear labels. Labels follow deletion recovery and portable exports; verified SQLite backups also preserve saved searches.

Under **Combine clips & paste queue**, add two text entries and open **Compare first two selections**. The comparison preserves Unicode, line endings, and final-newline differences. Large line comparisons show a bounded replacement block; items above 100,000 characters are rejected for comparison while remaining fully archived.

**Recorded terminal sessions** under the search tools lists recent recorded sessions, dates, directories, command counts, and failure counts. Select a session to browse its command items. Imported history has no original session identity. This view groups items; occurrence timelines retain repeated executions.

Choose **View execution timeline** for an ordered transcript of every recorded submission, including repeats, original working directories, exit codes, and durations. Load additional executions in pages of 50 and copy individual commands without running them. The transcript covers archived submissions too. The local CLI/API exposes session timelines and library search/clear/restore controls for agents.

## Local CLI and agent API

See [cli](cli.md). archiverctl supports search, read, contribution, snippets, import, and a persistent JSON Lines API over stdio. There is no listening network port or command-execution endpoint. Desktop views refresh after external database writes. ARCHIVER_DATA_DIR selects an isolated archive. Explicit CLI contributions remain possible while passive capture is paused.

## Validation limits

Tests cover storage/deduplication, insertion fidelity, previews, recovery/backup, transformations/templates, imports, CLI round trips, shell protocols, and setup idempotency. They do not prove real-app focus restoration or interactive shell behavior. Browser automation failed to reach localhost and subsequently blocked the URL; visual review is outstanding. No latency, memory, or million-event benchmark is proven. Literal search is currently used despite maintaining FTS. Native bitmap/metafile handles, OLE virtual files, and app-private clipboard formats still need adapters.


Librarian shows its remembered paste destination near the top and provides an **Archivist** button; **Ctrl+Alt+O** opens the full window. **F1** and Archivist Settings show the bordered-key reference. Archivist Settings also contains **Everything in Archiver**, the complete grouped feature catalog, maintained with [implemented features](../developer/implemented-features.md) and the [roadmap](../planning/roadmap.md) after each implementation turn.

Routine development builds the executable without bundling (`npm run desktop:build`). Rebuild Windows installers only for major releases or an explicit request. The [roadmap](../planning/roadmap.md#next-agent-queue-q1q7) contains the next agent's prioritized implementation tasks. To see the latest changes run `npm run launch` ([setup](../developer/setup.md#see-your-change-npm-run-launch)).

## Librarian keyboard and organization updates

Use W/S to select results and A/D to switch tabs outside editing fields. Typing in search remains normal; arrows navigate results from search. PgUp selects the top result; PgDn loads all remaining pages and selects the bottom of the current query/tab. By default reopening Librarian returns to All, clears query/filters and archive scope, selects the newest visible item and scrolls to the top. Enable Settings → **Librarian state memory** to restore the previous tab, query, filters, scope, selection, collapsed groups and scroll instead. Snippets use collapsible user-defined groups, with Ungrouped last; changing the search expands matching groups. Saving a snippet closes the editor and returns focus to Snippets results.

F1 displays searchable shortcut cards, grouped by related commands while its search is empty. Search placeholders identify the active tab and scope.

After clearing the library, use Ctrl+Shift+Z, F1 or the palette to restore the most recent nonempty clear. The banner shows the shortcut. Undo survives restart, keeps new captures and cannot revive deleted items. Full SQLite backups retain this snapshot; JSONL exports do not.

Ctrl+Shift+G (also F1/palette) opens **Tags & collections**. Select up to 500 loaded results, enter comma-separated names and apply or remove them. Other labels remain; any failure rolls back the complete change. Ctrl+Shift+F filters browse a tag or collection. This requires the desktop archive.

## Snippets, groups and appearance follow-up

R14: entering Snippets starts all sections collapsed, including Ungrouped and newly created groups. A nonempty search reveals matches; clearing search collapses them. Optional Librarian state memory still restores saved group state on reopen. While category tabs have focus, Left/Right keeps switching tabs; Down enters the group headings. Within groups Left/Right collapses/expands, Enter toggles the heading, and Up/Down traverses headings and open rows. Ctrl+Tab / Ctrl+Shift+Tab switches Librarian categories from results/search.

On Windows, **Ctrl+Win+1–9** pastes up to that many distinct recent clipboard records in a single operation, from oldest to newest. Text clips join with line breaks; an all-image/file selection becomes one file drop. Mixed text and image/file batches show an error without sending a partial paste. Uses permanent clipboard history independently of library filters, excludes shell command records and snippets, and leaves the paste queue alone. Palette actions **Paste last N clips** provide the same operation if a global chord is unavailable. Existing terminal/focus checks apply. Repeated copies of the same stored item count as one recent clip.

Ordinary image copying/pasting now includes both original image formats and a full-resolution PNG file reference for Explorer folders. PNGs are generated in the app-data `replay-images` cache and reused; deleting a cached file invalidates its current clipboard reference until the image is copied again. Exotic native formats still need adapters. Plain-text copy remains unchanged. Native Explorer and app compatibility check is pending H20.

Librarian opens on All with the first result focused by default (state memory can restore its prior browsing state); W/S move results and A/D switch tabs immediately. Press Ctrl+K to type a search. Ctrl+Alt+O opens/focuses Archivist (the old Ctrl+Shift+O failed in user testing and is retired); the Archivist button remains available.

Select a snippet and press **Ctrl+T** in either window to edit its name, note and content. Notes stay separate from copied/pasted text. Within the editor **Ctrl+T** opens the transform list (arrows/Enter); **Ctrl+S** saves and **Esc** cancels. Playground and Full Clip use **Ctrl+Alt+S** to open a new snippet form with the current editor text. Their existing Ctrl+S/Ctrl+Shift+S clip saving commands remain available.

Archivist's **Vault groups** strip appears only in Snippets. **Ctrl+Alt+G** creates a snippet group; **Ctrl+Alt+M** moves a selected snippet. Drag snippet rows onto chips to move them; All snippets removes their group memberships. Ordinary history categories have no group strip, group moves or drag/drop. Tags remain available for clips; previous collection metadata is preserved. Empty group definitions remain saved searches.

Settings → Appearance → **Follow system** follows OS light/dark changes live; explicit paper/spruce choices remain. Preferences synchronize across the two windows. Recognized image-text search now shows a bounded highlighted OCR excerpt in results and image details. Approximate fuzzy highlights identify the first matching OCR word; they do not assert every query word appears in OCR.

## Managing pins and the snippet vault

Archivist has visible buttons and menus; Librarian tools use shortcuts. Select a pinned item in Archivist and choose **Rename pin**, or open the three-dot **Item actions** menu. **F2** also renames a selected pin in either window; on a snippet it opens the snippet editor. Names appear in results/details and search, while copy/paste continues using the original content. Names persist after restart and recapture.

Open **Snippets** for the vault. **New snippet** creates a fresh item; **Edit snippet** changes its name, text, type and note. Choose **Save in group** when creating, then **Save snippet**. Notes appear in cards/details and are never copied or pasted. Search matches names and content, not notes. Browse group chips, create with **New group**, and organize with **Move selected**, **Move to group**, or drag a row onto a chip. Moves replace group memberships and retain tags/content; dropping onto All snippets removes memberships while leaving the item in the vault. Use **Rename group**, choose a group and enter its new name; memberships and saved filters update together, including empty groups. Duplicate names are rejected. Empty groups remain available. User-defined groups collapse separately; snippets display all memberships as badges, or an Ungrouped badge. Empty groups remain visible without a search, and a snippet with multiple memberships appears in each group. Snippet types no longer define sections. Up/Down or W/S move through visible headings and snippets in Librarian; Left/Right collapse/expand, Enter toggles the focused heading, and A/D switch tabs. Changing a search expands matching sections. New items save atomically into the chosen group; edits preserve membership.

Archivist's result toolbar opens **Full clip** and **Paste Playground**. Their buttons copy, transform, choose language, save changes/new clips or save as a snippet. Tool dialogs have **Close** buttons; snippet forms have **Save snippet**, **Cancel** and **Transform content**. Librarian retains Ctrl+O/Ctrl+Shift+N/Ctrl+Alt+S, editor Ctrl+S/Ctrl+T, Enter and Esc. Main-window shortcuts also remain available.

Full clip opened on an existing snippet routes Save to snippet/Ctrl+S back into the snippet editor, retaining its name, type and note; it does not use the history overwrite command. Saving a command clip as a snippet retains command type.

## Archivist navigation and statistics

Use the sidebar for history categories; the main page has no duplicate category tabs. **Statistics** has its own sidebar page with archived items, event and command counts, content size, permanent retention, snippets, groups, pinned items, visible library size, capture sources, repeated capture total, type/source breakdowns and first/latest capture dates. These totals describe the entire archive, independent of the current search and library visibility.

Librarian state memory remembers browsing only, not open editing dialogs or an expanded workbench. The preference is saved in native Settings; its browsing snapshot is local to the quick webview and survives restart. With memory off, reopening always uses the default library view.

Text tools: **Ctrl+F** searches within Full clip, Paste Playground and Expanded Librarian. Matches are literal and case-insensitive, highlighted with a count. **Enter/F3** advances; **Shift+Enter/Shift+F3** goes back, wrapping at either end. **Escape** closes find and returns focus to the text; another Escape exits the viewer. Find does not change the text. Syntax colors resume when find closes. Archivist also provides a **Find** button.

## Region OCR, JSON and clip notes (R15)

Select an image and use Region OCR in details or the command palette. Drag a rectangle or enter pixel bounds, then Recognize and Copy result. This Windows-only operation keeps the original image and full-image OCR intact. Select text for JSON explorer, or press Ctrl+Alt+J in Full clip/Paste Playground; expand containers and copy exact values or JSON Pointer paths. Invalid JSON reports a location. Edit clip notes from details or the palette; Save (Ctrl+S) stores separate searchable annotations, and saving an empty note removes it. Notes are not pasted with the clip.

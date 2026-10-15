// Update alongside continuity/developer/implemented-features.md, continuity/status.md and continuity/planning/roadmap.md whenever product behavior changes.
const groups = [
  [
    "Capture and durable history",
    [
      "Permanent local clipboard history with timestamps, source apps, formats, payload sizes, and occurrence counts.",
      "Text, rich text, images, and file capture on Windows, with repeat-copy deduplication.",
      "PowerShell and CMD/Clink command capture with directories, sessions, exit codes, durations, and failed-command search.",
      "Pause/resume capture and exact executable exclusions; history is unencrypted and local.",
      "Experimental Bash, Zsh, Fish, and WSL hooks; integration setup scripts and connection health indicators.",
    ],
  ],
  [
    "Librarian and Archivist",
    [
      "Compact keyboard-navigable Librarian with W/S result navigation and A/D tab switching outside editing fields; opens with results focused (Ctrl+K starts search); reopen on All with the latest result and scroll at the top by default; opt-in Librarian state memory restores the last tab, query, filters, scope, selection, collapsed groups and scroll; PgUp/PgDn jump to the top/bottom, loading remaining result pages. Configurable global hotkey and visible paste destination.",
      "Library-only quick browsing, context-aware tab search placeholders, optional full-archive search, clear library without deleting history, durable undo of the latest nonempty clear (Ctrl+Shift+Z), and individual library restoration.",
      "Archivist provides buttons and menus for managing the full archive; Librarian tools stay shortcut-driven. Sidebar-only history categories and a dedicated Statistics page with archive totals, content size, retention, snippets, groups, pins, library size, source/type breakdowns and capture dates. Shared catalog-card identity and Reading Room paper/spruce themes with visible focus and scrollbars; optional Follow system appearance updates live in both windows.",
      "Direct paste with Windows focus restoration; safe editing-buffer insertion into supported shell sessions without execution.",
      "Command palette, searchable shortcut cards grouped by related commands, and Ctrl+Alt+O to open Archivist.",
    ],
  ],
  [
    "Search and organization",
    [
      "Literal and bounded fuzzy search with library/snippet scope applied before candidate limits, source/date/type/directory/pin/session filters, and saved searches.",
      "Pins with durable searchable display names (Rename pin button, item actions menu or F2); renaming preserves copied content and capture identity. Tags, collections, URL domain groups, and directory-aware command suggestions. Librarian label dialog (Ctrl+Shift+G) applies/removes tags (groups only when all selected items are snippets) transactionally across up to 500 selected loaded results; browse labels through filters.",
      "Archivist collection groups: browse/drop chips with New group, Rename group and Move selected buttons; renaming updates memberships and saved filters atomically, including empty groups; Ctrl+Alt+G/Ctrl+Alt+M remain available. Moving replaces collections and preserves tags and archive content.",
      "Paged occurrence timelines and chronological terminal execution transcripts preserving repeated submissions.",
      "Text comparison between selected entries.",
    ],
  ],
  [
    "Reusable text and delivery",
    [
      "Offline emoji catalog (Ctrl+Shift+J or command palette): 3,781 Unicode 16.0 sequences in a responsive emoji grid, searchable by name, feeling, category, symbol and offline meaning keywords (scared, nervous, tired, grateful), with literal names ranked first, including flags and skin tones. Down/Up move focus from search into the grid; arrows/WASD navigate grid rows and columns, Enter/Shift+Enter copy, Ctrl+Enter/Ctrl+Shift+Enter paste using existing Windows focus restoration; Ctrl+K searches, Escape closes. Native glyph support depends on installed fonts; paste is Windows-only.",
      "Snippet vault with named text/command cards, note previews, collapsible user-defined groups, Ungrouped items, membership badges and collection navigation. Archivist buttons create/edit snippets, choose a destination group on creation, transform/save/cancel, and move by button or drag/drop; new snippet and group membership save atomically. Separate notes are never pasted; Ctrl+T edits a snippet, Ctrl+S saves in its editor, Ctrl+T there chooses a transform with arrows/Enter; create from selected history with Ctrl+Shift+S, return to keyboard navigation after saving, and browse user groups with Up/Down or W/S, Left/Right collapse/expand, Enter toggles headers, Home/End and PageUp/PageDown traverse visible sections, and A/D switch Librarian tabs.",
      "Snippet templates with editable literal placeholders and defaults.",
      "Keyboard transform-and-copy: trim whitespace, change case, format JSON, and decode URLs; Syntax Highlighting transform with auto-detected or manually chosen language.",
      "Full clip viewer with Ctrl+F literal case-insensitive search, highlighted matches, match counts, Enter/Shift+Enter or F3/Shift+F3 traversal and Escape to return to text (also in Paste Playground and Expanded Librarian). Ctrl+K remains catalog search. Full clip viewer (Ctrl+O dialog at 90% height; Ctrl+Shift+L Expanded Librarian), Archivist provides Copy, Transform, Language, Save changes, Save as new clip and Save as snippet buttons; Librarian uses shortcuts: Enter copies selection or clip, Ctrl+T transforms in place (arrows + Enter), Ctrl+H chooses the highlight language, Ctrl+S overwrites the clip (previous text kept in item_revisions), Ctrl+Shift+S saves as a new clip. Experimental: animated Expanded Librarian resize is unverified natively (Windows).",
      "Paste Playground (Archivist toolbar button; Ctrl+Shift+N, listed in F1): one highlighted editing surface in the Expanded Librarian; Ctrl+Enter copies, Ctrl+S saves to the library, Ctrl+Shift+S saves to the archive only; Archivist also has Copy, Transform, Language, Save to library/archive and Save as snippet buttons; Ctrl+Alt+S saves editor text as a named snippet in Playground and Full clip. Reopening the Librarian returns to the normal view.",
      "Combine clips with configurable separators and ordered paste queues with advance, skip, and clear.",
      "Copy original formats or plain text; edit prepared text before copying or inserting.",
    ],
  ],
  [
    "Previews and image text",
    [
      "Lazy image thumbnails and full-size previews; syntax highlighting for commands, code, JSON, and SQL.",
      "Explicit URL title fetching and title search; file availability, metadata, bounded text/code previews, and image previews.",
      "Local Windows OCR on newly copied images, two-hour catch-up batches by default, and manual scan/retry/cancel controls.",
      "Persistent OCR scan state, extracted-text copying, and literal/fuzzy image-text search with bounded highlighted recognized-text excerpts in results and image details; approximate matches are labeled, original images unchanged.",
    ],
  ],
  [
    "Recovery, portability, and agents",
    [
      "Undo deletion after explicitly configuring a recovery window; transactional restoration and expiry cleanup.",
      "Portable JSONL exports and verified SQLite snapshot backups with SHA-256 manifests.",
      "Idempotent import of existing PowerShell/PSReadLine and Clink history.",
      "Local archiverctl CLI and persistent JSON Lines API for agent search, contribution, library management, and session transcripts.",
    ],
  ],
  [
    "Desktop lifecycle and availability",
    [
      "Opt-in launch at sign-in and tray controls.",
      "Manual update checking/install UI and signing/release tooling; public signed releases require configured keys and hosting.",
      "Windows development implementation. Native macOS/Linux capture, replay, focus, and OCR adapters remain on the roadmap.",
    ],
  ],
] as const;

export function FeatureCatalog() {
  return (
    <div className="setting-card feature-catalog">
      <h3>Everything in Archiver</h3>
      <p>
        The implemented feature catalog. Platform and release limitations are
        included below.
      </p>
      {groups.map(([name, features]) => (
        <details key={name} open>
          <summary>{name}</summary>
          <ul>
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

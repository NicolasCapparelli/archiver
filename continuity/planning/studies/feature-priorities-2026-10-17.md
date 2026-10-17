# User-edited priorities and additional proposals — 2026-10-17

**Later user selection (2026-10-17):** Region OCR (N16), JSON explorer including Paste Playground (N14), archive notes (N20), editable left/right text diff and extractors (N18) are now the first five implementation priorities, with commits every two or three implementations. The roadmap owns current state. Other suggestions remain unselected; earlier proposal statements below are historical.


Origin: the user supplied an edited 22-row list with seven empty rows and asked to close the gaps and suggest five to ten useful additions. The 15 surviving features retain their order in the [roadmap](../roadmap.md#current-user-selected-priorities-2026-10-17-revision), which owns the current selection. No runtime implementation was requested or performed this turn.

This revision supersedes the ranking in the [earlier review](feature-review-2026-10-17.md), whose scope definitions and historical dispositions remain useful. Omitted features leave the active sequence; do not infer permanent rejection or silently restore them. Emoji favorites/recents does not select the earlier preferred-tone extension. Q3 is first, Q7 second; scheduled backups are outside the selection. Permanent history, explicit delivery, snippet-only groups and the Ctrl+R hold remain unchanged.

## Eight additional proposals

These are new, unselected suggestions, not implementation authorization. Originals remain intact; transformations and reuse are explicit, local actions. Reviewed against the feature catalog and implemented baseline to distinguish extensions from existing JSON formatting, full-image OCR, two-item diff, snippet notes and ordinary transforms.

| ID | Idea | Useful behavior and boundary |
| --- | --- | --- |
| N13 | Clipboard table toolkit | Preview rows/columns and convert copied tables among TSV, CSV, Markdown and HTML; handle quoting and preserve multiline cells. More than naming a generated text file. |
| N14 | JSON explorer and path copy | Browse a collapsible tree, inspect validation errors and copy a selected value or its JSON Pointer/path. Extends existing formatting/highlighting. |
| N15 | Clean-link preview | Remove recognized tracking parameters and show before/after URLs before copying. Preserve meaningful query values and allow per-domain exceptions; never fetch a URL automatically. |
| N16 | Select-a-region OCR | Select a rectangle of an archived image and copy only its recognized text. Preserve original image and whole-image OCR; region results are explicit derivatives. |
| N17 | Linked clips | Manually link related records, such as an error, its fix and a reference URL, then jump between them. This is a record relationship, not groups for ordinary history or automatic destination tracking. |
| N18 | Text extractors | Preview and copy just URLs, email addresses, file paths or regex matches from a long clip. Preserve order, show match counts and make deduplication optional. |
| N19 | Unicode and encoding workbench | Inspect code points and UTF-8 byte counts; preview NFC/NFKC normalization with changed characters highlighted. Complements the paste inspector's visibility tools and the symbol catalog. |
| N20 | Notes on archived clips | Add searchable personal annotations without changing copied content, capture identity or original history. Snippet notes already exist; this extends annotations to ordinary archived records. |

Suggested first additions for user consideration: table conversion, JSON explorer and clean-link preview. They extend common copy/paste tasks with bounded, inspectable tools. No new selection is assumed.

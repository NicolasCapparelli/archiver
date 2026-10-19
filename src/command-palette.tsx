import { useEffect, useRef, useState } from "react";
type Action = { label: string; element?: HTMLElement; run?: () => void };
function actions(): Action[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "button,input,textarea,select,summary",
    ),
  ]
    .filter(
      (el) =>
        !el.closest("dialog") &&
        !el.classList.contains("entry") &&
        !el.hasAttribute("disabled") &&
        el.getAttribute("type") !== "hidden",
    )
    .map((el) => ({
      element: el,
      label: (
        el.getAttribute("aria-label") ||
        el.closest("label")?.textContent ||
        el.textContent ||
        document.querySelector(`label[for="${el.id}"]`)?.textContent ||
        el.getAttribute("placeholder") ||
        el.tagName
      )
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((a) => a.label);
}
export function CommandPalette({
  onClose,
  extraActions = [],
}: {
  onClose: () => void;
  extraActions?: Action[];
}) {
  const [entries] = useState(() => [...extraActions, ...actions()]),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    page = useRef<HTMLElement>(null),
    list = useRef<HTMLDivElement>(null);
  const matches = entries.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const siblings = Array.from(
      page.current?.parentElement?.children || [],
    ).filter((el) => el !== page.current) as HTMLElement[];
    const state = siblings.map((el) => el.inert);
    siblings.forEach((el) => (el.inert = true));
    page.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      siblings.forEach((el, i) => (el.inert = state[i]));
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    (list.current?.children[index] as HTMLElement | undefined)?.scrollIntoView({
      block: "nearest",
    });
  }, [index, query]);
  function run(action: Action) {
    onClose();
    setTimeout(() => {
      if (action.run) {
        action.run();
        return;
      }
      if (!action.element) return;
      for (let p = action.element.parentElement; p; p = p.parentElement)
        if (p instanceof HTMLDetailsElement) p.open = true;
      action.element.focus();
      if (
        action.element instanceof HTMLButtonElement ||
        action.element.tagName === "SUMMARY"
      )
        action.element.click();
    });
  }
  return (
    <section
      className="command-palette"
      ref={page}
      aria-label="Command palette"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
        if (
          !(e.target instanceof HTMLInputElement) &&
          (e.key === "ArrowDown" || e.key === "ArrowUp")
        ) {
          e.preventDefault();
          setIndex((i) =>
            Math.max(
              0,
              Math.min(
                matches.length - 1,
                i + (e.key === "ArrowDown" ? 1 : -1),
              ),
            ),
          );
        }
        if (
          !(e.target instanceof HTMLInputElement) &&
          e.key === "Enter" &&
          (e.target as HTMLElement).closest(".palette-actions") &&
          matches[index]
        ) {
          e.preventDefault();
          run(matches[index]);
        }
      }}
    >
      <div>
        <h2>Command palette</h2>
        <p>
          Search every action and field on this screen. Enter activates an
          action or focuses a field.
        </p>
        <input
          className="setting-input"
          aria-label="Find an action"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) =>
                Math.max(
                  0,
                  Math.min(
                    matches.length - 1,
                    i + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && matches[index]) {
              e.preventDefault();
              run(matches[index]);
            }
          }}
        />
        <div className="palette-actions" ref={list}>
          {matches.map((action, i) => (
            <button
              className={
                i === index ? "palette-action selected" : "palette-action"
              }
              key={i}
              aria-current={i === index ? "true" : undefined}
              onFocus={() => setIndex(i)}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(action)}
            >
              {action.label}
            </button>
          ))}
          {!matches.length && <p>No matching actions.</p>}
        </div>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
const shortcuts = [
  ["Tools and library", "Ctrl + Alt + 1–9 (Windows)", "Paste up to N recent clipboard records oldest to newest: text joined by line breaks, images/files as files; mixed text/file batches report an error"],
  ["Tools and library", "Ctrl + Shift + M", "Scientific calculator: natural fractions/powers/roots, variables and DEG/RAD; Enter saves; Up/Down recalls and restores draft; Tab completes functions/variables or navigates math; Ctrl+Shift+C copies last result; draft/context recover on reopening"],
  ["Navigation", "Ctrl + Tab / Ctrl + Shift + Tab", "Next/previous Librarian category from tabs or results"],
  ["Text and snippets", "↑ / ↓ or W / S (Snippets)", "Navigate visible group headings and snippets; WASD is Librarian-only"],
  ["Text and snippets", "← / → (Snippet groups)", "Collapse or expand the current group; A/D still switch Librarian tabs"],
  ["Text and snippets", "Enter / Space (Group heading)", "Toggle the focused snippet group"],
  ["Text and snippets", "Ctrl + Alt + S (Full clip / Playground)", "Save editor text as a named snippet"],
  ["Tools and library", "Ctrl + Alt + G (Archivist Snippets)", "Create a group; Enter saves its name"],
  ["Tools and library", "Ctrl + Alt + M (Archivist Snippets)", "Move selected snippet to group; arrows choose, Enter applies"],
  [
    "Tools and library",
    "Ctrl + Win + .",
    "Open quick access (configurable)"
  ],
  [
    "Tools and library",
    "Ctrl + Shift + P",
    "Command palette: every action and field on the current screen"
  ],
  [
    "Tools and library",
    "F1",
    "All shortcuts and tool access"
  ],
  [
    "Tools and library",
    "Ctrl + ,",
    "Settings in the Archivist"
  ],
  [
    "Tools and library",
    "Ctrl + Shift + F",
    "Filters and saved searches"
  ],
  [
    "Tools and library",
    "Ctrl + Shift + Q",
    "Combine clips and paste queue"
  ],
  [
    "Text and snippets",
    "Ctrl + Shift + E",
    "Edit selected text or fill template placeholders"
  ],
  ["Text and snippets", "F2", "Rename the selected pin or edit the selected snippet"],
  [
    "Text and snippets",
    "Ctrl + Shift + S",
    "Save selected text or command as a named snippet"
  ],
  [
    "Tools and library",
    "Ctrl + Alt + O",
    "Open the Archivist"
  ],
  [
    "Tools and library",
    "Ctrl + Shift + A (Librarian)",
    "Toggle full archive results; library is the default"
  ],
  [
    "Tools and library",
    "Ctrl + Shift + Backspace",
    "Clear the visible library; permanent archive history stays intact"
  ],
  [
    "Text and snippets",
    "Ctrl + O",
    "Open the full clip: select, copy and transform it without changing the original; Ctrl + S saves changes with revision history; Ctrl + Shift + S saves a new clip"
  ],
  [
    "Text and snippets",
    "Ctrl + Shift + L",
    "Open the full clip in the Expanded Librarian (Esc returns)"
  ],
  [
    "Text and snippets",
    "Ctrl + Shift + N",
    "Paste Playground: scratch text with transforms, saved to the library or archive"
  ],
  ["Text and snippets", "Ctrl + Alt + D (Full clip / Playground)", "Editable left/right text diff with a selectable baseline"],
  ["Text and snippets", "Ctrl + Alt + E (Full clip / Playground)", "Extract URLs, emails, file paths or custom regex matches"],
  ["Text and snippets", "Ctrl + Alt + J (Full clip / Playground)", "Explore JSON values and copy exact values or JSON Pointer paths"],
  ["Text and snippets", "Ctrl + Shift + J", "Emoji catalog: search names, categories or symbols; arrows select, Enter / Shift + Enter copy, Ctrl + Enter / Ctrl + Shift + Enter paste; Ctrl + K searches"],
  [
    "Navigation",
    "Ctrl + K",
    "Focus history search"
  ],
  [
    "Text and snippets",
    "Ctrl + T",
    "Transform selected text: arrows choose, Enter transforms and copies; snippets open their editor"
  ],
  [
    "Navigation",
    "↑ / ↓ / Home / End",
    "Choose a history result"
  ],
  [
    "Navigation",
    "← / →",
    "Switch tabs outside query editing"
  ],
  [
    "Navigation",
    "Alt + ← / →",
    "Switch tabs while editing a search query"
  ],
  [
    "Delivery",
    "Enter / Shift + Enter",
    "Copy / copy plain text"
  ],
  [
    "Delivery",
    "Ctrl + Enter / Ctrl + Shift + Enter",
    "Paste or insert / paste plain text"
  ],
  [
    "Navigation",
    "Tab / Shift + Tab",
    "Reach every control; Space activates a focused button or expands a section"
  ],
  [
    "Navigation",
    "Escape",
    "Close the active dialog or quick panel"
  ],
  [
    "Delivery",
    "Ctrl + X, Ctrl + A (shell)",
    "Insert staged command text into the editing buffer; never accepts the line"
  ],
  [
    "Navigation",
    "W / S · A / D",
    "Choose results / switch tabs in Librarian outside editing fields"
  ],
  [
    "Navigation",
    "PgUp / PgDn",
    "Top / bottom of the current result list (loads remaining pages)"
  ],
  [
    "Tools and library",
    "Ctrl + Shift + Z",
    "Undo the most recent nonempty library clear"
  ],
  [
    "Tools and library",
    "Ctrl + Shift + G",
    "Tags and collections: add or remove labels across selected items"
  ]
];
export function ShortcutReference() {
  const [query, setQuery] = useState("");
  const matches = shortcuts.filter(row => row.join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const groups = query.trim() ? ["Matching commands"] : [...new Set(shortcuts.map(row => row[0]))];
  return <div className="shortcut-reference">
    <input className="setting-input" data-initial-focus aria-label="Search shortcuts and commands" placeholder="Search commands or keys…" value={query} onChange={e => setQuery(e.target.value)} />
    {groups.map(group => <section key={group}><h3>{group}</h3><div className="shortcut-grid">
      {matches.filter(row => query.trim() || row[0] === group).map(([, keys, description]) => <article className="shortcut-card" key={keys}><kbd>{keys}</kbd><p>{description}</p></article>)}
    </div></section>)}
    {!matches.length && <p role="status">No matching commands.</p>}
    <p>W/A/S/D work outside editing fields. Ordinary typing and cursor shortcuts remain available in editors.</p>
  </div>;
}

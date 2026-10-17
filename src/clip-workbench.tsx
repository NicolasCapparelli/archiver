import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import { ChoiceDialog, type Choice } from "./choice-dialog";
import { highlight, languages } from "./highlight-engine";
import { transform, type Transformation } from "./text-tools";
import { findText, nextMatch } from "./text-find";
import { TextDiffTool } from "./text-diff-tool";
import { TextExtractTool } from "./text-extract-tool";
import { JsonExplorer } from "./json-explorer";
import { ToolDialog } from "./tool-dialog";

export type WorkbenchMode = "clip" | "playground";
const LIMIT = 30000;
const transformChoices: Choice[] = [
  { id: "json", label: "Format JSON" },
  { id: "trim", label: "Trim whitespace" },
  { id: "upper", label: "UPPERCASE" },
  { id: "lower", label: "lowercase" },
  { id: "url", label: "Decode URL escapes" },
  { id: "highlight", label: "Syntax highlighting…" },
];
const languageChoices: Choice[] = [
  { id: "auto", label: "Auto-detect language" },
  { id: "plain", label: "No highlighting" },
  ...languages.map((name) => ({ id: name, label: name })),
];

/**
 * Full-clip viewer and Paste Playground: one editable surface with keyboard shortcuts and Archivist controls.
 * Transforms apply in place; the stored clip changes only on Ctrl+S (clip mode).
 */
export function ClipWorkbench({
  mode,
  itemId,
  initialText,
  kind,
  source,
  startLang = "plain",
  draftText,
  expanded,
  canExpand,
  keyboardOnly = true,
  onExpand,
  onToast,
  onSaveSnippet,
}: {
  mode: WorkbenchMode;
  itemId?: string;
  initialText: string;
  kind: string;
  source: string;
  startLang?: string;
  draftText?: string;
  expanded: boolean;
  canExpand: boolean;
  keyboardOnly?: boolean;
  onExpand: (draft: { text: string; lang: string }) => void;
  onToast: (message: string) => void;
  onSaveSnippet: (text: string) => void;
}) {
  const [utility, setUtility] = useState<"diff" | "extract">();
  const [jsonOpen, setJsonOpen] = useState(false);
  const [text, setText] = useState(draftText ?? initialText),
    [lang, setLang] = useState(startLang),
    [picker, setPicker] = useState<null | "transform" | "language">(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null),
    back = useRef<HTMLPreElement>(null);
  const clip = mode === "clip";
  const [findOpen, setFindOpen] = useState(false), [findQuery, setFindQuery] = useState(""), [findIndex, setFindIndex] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => findOpen ? findText(text, findQuery) : [], [text, findQuery, findOpen]);
  const matchIndex = Math.min(findIndex, Math.max(0, matches.length - 1));
  useEffect(() => {
    if (findOpen) { findInput.current?.focus(); findInput.current?.select(); }
  }, [findOpen]);
  useEffect(() => {
    const mark = back.current?.querySelector<HTMLElement>('[data-current-match]');
    if (!mark || !back.current || !area.current) return;
    const surface = back.current;
    const delta = mark.getBoundingClientRect().top - surface.getBoundingClientRect().top;
    if (delta < 0 || delta + 20 > surface.clientHeight) surface.scrollTop += delta - surface.clientHeight / 2;
    area.current.scrollTop = surface.scrollTop;
  }, [matches, matchIndex]);
  function closeFind() { setFindOpen(false); area.current?.focus(); }
  function moveMatch(delta: number) { setFindIndex(nextMatch(matchIndex, delta, matches.length)); }
  const snippet = !!itemId?.startsWith("snippet:");
  const shown = useMemo(() => {
    if (lang === "plain" || text.length > LIMIT || !text) return null;
    try {
      return highlight(text, kind, source, lang);
    } catch {
      return null;
    }
  }, [text, lang, kind, source]);
  useEffect(() => {
    if (!picker) area.current?.focus();
  }, [picker]);
  const languageLabel =
    lang === "plain"
      ? "off"
      : lang === "auto"
        ? `auto · ${shown?.language ?? "plain text"}`
        : lang;
  function applyTransform(id: string) {
    if (id === "highlight") {
      setPicker("language");
      return;
    }
    setPicker(null);
    if (id === "revert") {
      setText(initialText);
      setError("");
      return;
    }
    try {
      setText(transform(text, id as Transformation));
      setError("");
    } catch (e) {
      setError(`Cannot apply transform: ${String(e)}`);
    }
  }
  async function copy() {
    const field = area.current;
    const part = field
      ? field.value.slice(field.selectionStart, field.selectionEnd)
      : "";
    try {
      await navigator.clipboard.writeText(part || text);
      onToast(part ? "Selection copied" : "Copied");
    } catch (e) {
      setError(String(e));
    }
  }
  async function run(task: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
      onToast(done);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function save(asNew = false) {
    if (clip) {
      if (asNew) void run(() => api.saveTextClip(text, "library"), "Saved as a new clip; original unchanged");
      else if (snippet) onSaveSnippet(text);
      else if (itemId) void run(() => api.overwriteClip(itemId, text), "Clip overwritten (previous text kept in revisions)");
    } else void run(() => api.saveTextClip(text, asNew ? "archive" : "library"), asNew ? "Saved to the archive only" : "Saved to the library");
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (picker || jsonOpen || utility || event.nativeEvent.isComposing) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (ctrl && event.altKey && (key === "d" || key === "e")) {
      stop(); setUtility(key === "d" ? "diff" : "extract");
    } else if (ctrl && event.altKey && key === "j") {
      stop(); setJsonOpen(true);
    } else if (ctrl && !event.altKey && key === "f") {
      stop();
      setFindOpen(true);
      findInput.current?.focus(); findInput.current?.select();
    } else if (findOpen && key === "escape") {
      stop(); closeFind();
    } else if (findOpen && (key === "f3" || (event.target === findInput.current && key === "enter"))) {
      stop(); moveMatch(event.shiftKey ? -1 : 1);
    } else if (ctrl && event.altKey && !event.shiftKey && key === "s") {
      stop();
      if (text.trim() && !busy) onSaveSnippet(text);
    } else if (ctrl && key === "t") {
      stop();
      setPicker("transform");
    } else if (ctrl && !event.shiftKey && key === "h") {
      stop();
      setPicker("language");
    } else if (ctrl && event.shiftKey && key === "l" && canExpand && !expanded) {
      stop();
      onExpand({ text, lang });
    } else if (ctrl && key === "s") {
      stop();
      save(event.shiftKey);
    } else if (clip && key === "enter" && !ctrl && !event.shiftKey) {
      stop();
      void copy();
    } else if (!clip && key === "enter" && ctrl) {
      stop();
      void copy();
    }
  }
  const exit: [string, string] = ["Esc", expanded ? "back" : "close"];
  const keys: [string, string][] = clip
    ? [
        ["Enter", "copy"],
        ["Ctrl F", "find"],
        ["Ctrl Alt J", "JSON explorer"],
        ["Ctrl Alt D", "text diff"],
        ["Ctrl Alt E", "extract text"],
        ["Ctrl T", "transform"],
        ["Ctrl S", snippet ? "edit snippet" : "overwrite clip"],
        ["Ctrl Shift S", "save as new"],
        ["Ctrl Alt S", "save as snippet"],
        ["Ctrl H", "language"],
        ...(canExpand && !expanded
          ? ([["Ctrl Shift L", "expanded"]] as [string, string][])
          : []),
        exit,
      ]
    : [
        ["Ctrl Enter", "copy"],
        ["Ctrl F", "find"],
        ["Ctrl Alt J", "JSON explorer"],
        ["Ctrl Alt D", "text diff"],
        ["Ctrl Alt E", "extract text"],
        ["Ctrl T", "transform"],
        ["Ctrl S", "save to library"],
        ["Ctrl Shift S", "archive only"],
        ["Ctrl Alt S", "save as snippet"],
        ["Ctrl H", "language"],
        exit,
      ];
  const languageIndex = languageChoices.findIndex(
    (c) => c.id === (lang === "plain" ? "auto" : lang),
  );
  return (
    <>
      <div
        className={`clip-workbench ${expanded ? "expanded" : ""}`}
        data-text-find-open={findOpen ? "true" : undefined}
        onKeyDown={onKeyDown}
      >
        <div className="workbench-status">
          <span>Highlighting: {languageLabel}</span>
          {error && (
            <span className="error" role="alert">
              {error}
            </span>
          )}
        </div>
        {findOpen && <div className="text-find" role="search" aria-label="Find within text">
          <input ref={findInput} aria-label="Find in text" placeholder="Find in text…" value={findQuery} onChange={event => { setFindQuery(event.target.value); setFindIndex(0); }} />
          <span role="status">{matches.length ? `${matchIndex + 1} / ${matches.length}` : findQuery ? "No matches" : "Type to find"}</span>
          <button className="secondary" aria-label="Previous match" title="Previous match · Shift Enter" disabled={!matches.length} onClick={() => moveMatch(-1)}>↑</button>
          <button className="secondary" aria-label="Next match" title="Next match · Enter" disabled={!matches.length} onClick={() => moveMatch(1)}>↓</button>
          <button className="secondary" aria-label="Close find" title="Close find · Escape" onClick={closeFind}>×</button>
        </div>}
        <div className={`code-editor ${shown || matches.length ? "highlighted" : ""}`}>
          <pre className="code-backdrop mono" aria-hidden ref={back}>
            {matches.length ? <code>{matches.map((match, index) => <span key={match.start}>
              {text.slice(index ? matches[index - 1].end : 0, match.start)}<mark className={index === matchIndex ? "current-match" : ""} data-current-match={index === matchIndex ? "true" : undefined}>{text.slice(match.start, match.end)}</mark>
            </span>)}{text.slice(matches[matches.length - 1].end)}{"\n"}</code> : shown ? (
              <code dangerouslySetInnerHTML={{ __html: `${shown.value}\n` }} />
            ) : null}
          </pre>
          <textarea
            ref={area}
            className="mono"
            aria-label={clip ? "Full clip" : "Paste Playground"}
            data-initial-focus="true"
            autoFocus
            readOnly={clip}
            spellCheck={false}
            placeholder={
              clip ? "" : "Paste or type here. Ctrl T transforms it in place."
            }
            value={text}
            onChange={(event) => setText(event.target.value)}
            onScroll={(event) => {
              if (back.current)
                back.current.scrollTop = event.currentTarget.scrollTop;
            }}
          />
        </div>
        {!keyboardOnly && <div className="workbench-actions">
          <button className="secondary" disabled={busy || !text} onClick={() => void copy()}>Copy</button>
          <button className="secondary" onClick={() => setFindOpen(true)}>Find</button>
          <button className="secondary" onClick={() => setJsonOpen(true)}>JSON explorer</button>
          <button className="secondary" onClick={() => setUtility("diff")}>Text diff</button>
          <button className="secondary" onClick={() => setUtility("extract")}>Text extractors</button>
          <button className="secondary" disabled={busy || !text} onClick={() => setPicker("transform")}>Transform</button>
          <button className="secondary" onClick={() => setPicker("language")}>Language</button>
          <button className="secondary" disabled={busy || !text.trim()} onClick={() => onSaveSnippet(text)}>{snippet ? "Edit snippet" : "Save as snippet"}</button>
          <button className="secondary" disabled={busy || !text} onClick={() => save(true)}>{clip ? "Save as new clip" : "Save to archive"}</button>
          <button className="primary" disabled={busy || !text || (clip && !itemId)} onClick={() => save()}>{busy ? "Saving…" : clip ? snippet ? "Save to snippet…" : "Save changes" : "Save to library"}</button>
        </div>}
        {keyboardOnly && <div className="workbench-keys" aria-label="Keyboard shortcuts">
          {keys.map(([combo, label]) => (
            <span key={combo}>
              <kbd>{combo}</kbd> {label}
            </span>
          ))}
        </div>}
      </div>
      {utility && <ToolDialog title={utility === "diff" ? "Text diff" : "Text extractors"} tall onClose={() => { setUtility(undefined); area.current?.focus(); }}>{utility === "diff" ? <TextDiffTool initialText={text} /> : <TextExtractTool initialText={text} />}</ToolDialog>}
      {jsonOpen && <ToolDialog title="JSON explorer" tall onClose={() => { setJsonOpen(false); area.current?.focus(); }}><JsonExplorer text={text} /></ToolDialog>}
      {picker === "transform" && (
        <ChoiceDialog
          title="Transform text"
          choices={
            clip
              ? [
                  ...transformChoices,
                  { id: "revert", label: "Revert to original clip" },
                ]
              : transformChoices
          }
          onChoose={applyTransform}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "language" && (
        <ChoiceDialog
          title="Syntax highlighting"
          hint="↑ / ↓ choose a language · Enter applies · auto-detect re-runs as the text changes"
          choices={languageChoices}
          initial={Math.max(0, languageIndex)}
          onChoose={(id) => {
            setLang(id);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

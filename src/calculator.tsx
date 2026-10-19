import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CornerDownLeft, Delete, History, HelpCircle, Redo2, Undo2 } from "lucide-react";
import * as api from "./api";
import { evaluateCalculation, formatNumber, type AngleMode } from "./calculator-engine";
import { clearVisibleCalculations, isCalculationVisible, readVisibility, revealNewCalculation, visibilityKey, type CalculatorVisibility } from "./calculator-visibility";
import { CalculationFormula, CalculatorMathField, type CalculatorEditor } from "./calculator-math-field";
import { argumentHint, completions, draftKey, emptyDraft, expressionToLatex, insertionLatex, latexToExpression, readDraft, recallHistory, type CalculatorDraft, type RecallState } from "./calculator-editing";
import { calculatorFunctions } from "./calculator-engine";
import { ToolDialog } from "./tool-dialog";

const scienceKeys = {
  main: [["a²", "^2"], ["aᵇ", "^"], ["|a|", "abs("], ["√", "sqrt("], ["∛", "cbrt("], ["π", "pi"], ["sin", "sin("], ["cos", "cos("], ["tan", "tan("], ["(", "("], [")", ")"], [",", ","]],
  abc: [["x", "x"], ["y", "y"], ["z", "z"], ["a", "a"], ["b", "b"], ["c", "c"], ["n", "n"], ["r", "r"], ["=", "="], ["e", "e"], ["τ", "tau"], ["!", "!"]],
  func: [["asin", "asin("], ["acos", "acos("], ["atan", "atan("], ["log", "log("], ["ln", "ln("], ["exp", "exp("], ["floor", "floor("], ["ceil", "ceil("], ["round", "round("], ["min", "min("], ["max", "max("], ["!", "!"]],
} as const;
const numberKeys = [["7", "7"], ["8", "8"], ["9", "9"], ["÷", "/"], ["4", "4"], ["5", "5"], ["6", "6"], ["×", "*"], ["1", "1"], ["2", "2"], ["3", "3"], ["−", "-"], ["0", "0"], [".", "."], ["ans", "ans"], ["+", "+"]] as const;

export function Calculator({ onClose, expanded = false }: { onClose: () => void; expanded?: boolean }) {
  const [recovery] = useState(() => { try { return { draft: readDraft(localStorage.getItem(draftKey)), error: "" }; } catch { return { draft: emptyDraft(), error: "Saved draft could not be restored. Permanent Archive is intact." }; } });
  const [latex, setLatex] = useState(recovery.draft.latex);
  const currentLatex = useRef(latex); currentLatex.current = latex;
  const [mode, setMode] = useState<AngleMode>(recovery.draft.mode);
  const [variables, setVariables] = useState<Record<string, number>>(recovery.draft.variables);
  const [answer, setAnswer] = useState(recovery.draft.answer);
  const [lastResult, setLastResult] = useState<number | null>(recovery.draft.lastResult);
  const [prefix, setPrefix] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [templateHint, setTemplateHint] = useState("");
  const [storageError, setStorageError] = useState(recovery.error);
  const recall = useRef<RecallState>({ index: -1, draft: null });
  const draft: CalculatorDraft = { version: 1, latex, mode, variables, answer, lastResult };
  const suggestionsPrefix = /(?:^|[^a-zA-Z\\])([a-zA-Z][a-zA-Z0-9]*)$/.exec(prefix)?.[1] ?? "";
  const suggestions = dismissed ? [] : completions(suggestionsPrefix, variables);
  let hint = "";
  try { hint = argumentHint(latexToExpression(prefix)); } catch { /* A partial template has no complete argument hint yet. */ }
  function persistDraft(next: CalculatorDraft) {
    try { localStorage.setItem(draftKey, JSON.stringify(next)); setStorageError(""); }
    catch { setStorageError("Draft recovery unavailable: local preferences could not be saved. Permanent Archive is intact."); }
  }
  useEffect(() => { persistDraft(recall.current.draft ?? draft); }, [latex, mode, variables, answer, lastResult]);
  const [history, setHistory] = useState<api.SavedCalculation[]>([]);
  const [visibility, setVisibility] = useState(() => { try { return readVisibility(localStorage.getItem(visibilityKey)); } catch { return readVisibility(null); } });
  const [archive, setArchive] = useState(false);
  const [tab, setTab] = useState<keyof typeof scienceKeys>("main");
  const [help, setHelp] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(recovery.error);
  const [loadError, setLoadError] = useState("");
  const [, refreshEdits] = useState(0);
  const edits = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const editor = useRef<CalculatorEditor>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const preview = useMemo(() => {
    try { const expression = latexToExpression(latex); return { expression, evaluation: evaluateCalculation({ expression, mode, variables, answer }), error: "" }; }
    catch (error) { return { expression: "", evaluation: undefined, error: latex.trim() ? (error as Error).message : "" }; }
  }, [latex, mode, variables, answer]);
  const visibleRows = history.filter(row => isCalculationVisible(row, visibility));
  const rows = archive ? history : [...visibleRows].reverse();
  useEffect(() => {
    let current = true;
    void api.calculatorHistory().then(rows => { if (current) { setHistory(rows); setHasMore(rows.length === 50); if (rows[0]) setLastResult(rows[0].calculation.result); } }).catch(error => { if (current) setLoadError(String(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  useEffect(() => { sheet.current?.scrollTo({ top: archive ? 0 : sheet.current.scrollHeight }); }, [history[0]?.id, archive, visibility]);
  function persistVisibility(next: CalculatorVisibility) {
    setVisibility(next);
    try { localStorage.setItem(visibilityKey, JSON.stringify(next)); }
    catch { setMessage("Visibility changed for this session only; local preferences could not be saved. Archive is intact."); }
  }
  async function loadMore() {
    if (busy.current || loading) return;
    busy.current = true; setLoading(true); setLoadError("");
    try {
      const rows = await api.calculatorHistory(history.length);
      setHistory(old => [...old, ...rows.filter(row => !old.some(item => item.id === row.id))]);
      setHasMore(rows.length === 50);
      return rows;
    } catch (error) { setLoadError(String(error)); }
    finally { busy.current = false; setLoading(false); }
  }
  function changeLatex(next: string) {
    if (next === currentLatex.current || saving) return;
    if (next.length > 8192) { setMessage("Expression is too long."); editor.current?.setValue(latex); return; }
    edits.current.undo = [...edits.current.undo.slice(-99), currentLatex.current]; edits.current.redo = [];
    currentLatex.current = next;
    setLatex(next); setMessage(""); setDismissed(false);
  }
  function applyDraft(next: CalculatorDraft) {
    setLatex(next.latex); setMode(next.mode); setVariables(next.variables); setAnswer(next.answer);
    edits.current = { undo: [], redo: [] }; setPrefix(""); setDismissed(true);
    editor.current?.focus();
  }
  async function historyRecall(direction: -1 | 1) {
    if (saving || loading) return;
    try {
      let available = history;
      if (direction === 1 && recall.current.index === history.length - 1 && hasMore) {
        const older = await loadMore();
        if (!older) return;
        available = [...history, ...older.filter(row => !history.some(item => item.id === row.id))];
      }
      const next = recallHistory(recall.current, direction, draft, available);
      if (next.state === recall.current) return;
      recall.current = next.state; applyDraft(next.draft); setTemplateHint("");
      setMessage(next.state.index < 0 ? "Unfinished draft restored." : `History ${next.state.index + 1} · Down returns to your draft.`);
    } catch { setMessage("This archived expression cannot be recalled by the scientific editor. Archive is intact."); }
  }
  function undo(redo = false) {
    if (saving) return;
    const from = redo ? edits.current.redo : edits.current.undo;
    const to = redo ? edits.current.undo : edits.current.redo;
    const next = from.pop();
    if (next === undefined) return;
    to.push(latex); setLatex(next); setMessage(""); refreshEdits(n => n + 1); editor.current?.focus();
  }
  async function submit() {
    if (busy.current || loading || !preview.evaluation) return;
    busy.current = true; setSaving(true); setMessage("");
    const evaluation = preview.evaluation;
    try {
      const row = await api.saveCalculation({ version: 1, expression: preview.expression.trim(), mode, variables, answer, result: evaluation.value });
      setHistory(rows => [row, ...rows]); persistVisibility(revealNewCalculation(row, visibility));
      setVariables(evaluation.variables); setAnswer(evaluation.value); setLastResult(evaluation.value); setLatex("");
      persistDraft({ version: 1, latex: "", mode, variables: evaluation.variables, answer: evaluation.value, lastResult: evaluation.value });
      recall.current = { index: -1, draft: null }; setPrefix(""); setDismissed(true); setTemplateHint("");
      edits.current = { undo: [], redo: [] }; setArchive(false);
    } catch (error) { setMessage(`Could not save: ${String(error)}. Your expression is retained.`); }
    finally { busy.current = false; setSaving(false); editor.current?.focus(); }
  }
  function reuse(row: api.SavedCalculation) {
    let next: string;
    try { next = expressionToLatex(row.calculation.expression); }
    catch { setMessage("This archived expression cannot be reused by the scientific editor. Archive is intact."); return; }
    recall.current = { index: -1, draft: null };
    setVariables({ ...row.calculation.variables }); setAnswer(row.calculation.answer);
    setMode(row.calculation.mode); changeLatex(next); setArchive(false); setTemplateHint("");
    setMessage("Original angle mode and variables restored. Enter saves a new row."); editor.current?.focus();
  }
  async function copy(value: number) {
    try { await navigator.clipboard.writeText(String(value)); setMessage("Answer copied."); }
    catch (error) { setMessage(`Could not copy: ${String(error)}`); }
  }
  function syncEditor() { if (editor.current) changeLatex(editor.current.value); }
  function replaceSelection(text: string, backspace = false) {
    const field = editor.current;
    if (!field || saving) return;
    field.focus();
    if (backspace) field.executeCommand("deleteBackward");
    else {
      field.insert(insertionLatex(text), { selectionMode: "placeholder" });
    }
    syncEditor();
    if (text.endsWith("(")) setTemplateHint(argumentHint(text));
  }
  function moveCaret(direction: -1 | 1) {
    editor.current?.focus(); editor.current?.executeCommand(direction < 0 ? "moveToPreviousChar" : "moveToNextChar");
  }
  function complete(name: string) {
    const field = editor.current;
    if (!field || saving) return;
    field.selection = { ranges: [[Math.max(0, field.position - suggestionsPrefix.length), field.position]], direction: "forward" };
    const template = calculatorFunctions.includes(name) ? insertionLatex(`${name}(`) : expressionToLatex(name);
    field.insert(template, { selectionMode: "placeholder" });
    field.focus(); syncEditor(); setDismissed(true); setTemplateHint(calculatorFunctions.includes(name) ? argumentHint(`${name}(`) : "");
  }
  function editingKey(event: KeyboardEvent) {
    if (event.isComposing) return;
    const handled = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.code === "KeyC") { handled(); if (lastResult !== null) void copy(lastResult); else setMessage("No saved result yet."); return; }
    if (saving) { if (["Enter", "ArrowUp", "ArrowDown"].includes(event.key)) handled(); return; }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) { handled(); undo(event.key.toLowerCase() === "y" || event.shiftKey); return; }
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") { handled(); historyRecall(event.key === "ArrowUp" ? 1 : -1); }
      else if (event.key === "Tab" && !event.shiftKey && suggestions.length) { handled(); complete(suggestions[0]); }
      else if (event.key === "Escape" && suggestions.length) { handled(); setDismissed(true); }
      else if (event.key === "Enter") { handled(); void submit(); }
    }
  }
  const key = (label: string, value: string, numeric = false) => <button type="button" key={label} className={`calculator-key ${numeric ? "number" : ""}`} disabled={saving} aria-label={label === "a²" ? "Square" : label === "aᵇ" ? "Power" : label === "|a|" ? "Absolute value" : label === "√" ? "Square root" : label === "∛" ? "Cube root" : label === "a/b" ? "Divide" : label} onMouseDown={event => event.preventDefault()} onClick={() => replaceSelection(value)}>{label === "a/b" ? <span className="calculator-fraction" aria-hidden="true"><span>a</span><span>b</span></span> : label}</button>;
  const content = <section className={`calculator${expanded ? " calculator-expanded" : ""}`} aria-label="Scientific calculator" aria-busy={saving} onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.code === "KeyC") { event.preventDefault(); event.stopPropagation(); if (lastResult !== null) void copy(lastResult); else setMessage("No saved result yet."); }
  }}>
      <div className="calculator-sheet" ref={sheet}>
        {archive && <div className="calculator-archive-heading"><strong>Permanent archive</strong><button type="button" onClick={() => setArchive(false)}>Back to calculator</button></div>}
        {help && <aside id="calculator-help" className="calculator-help">
          <strong>Write, calculate, keep.</strong> Up/Down recalls saved expressions; Down past the newest restores your unfinished draft and context. Ctrl+Shift+C copies your last submitted result. Fractions, powers and roots are editable math; Tab navigates templates or accepts a suggested name. Draft, variables, ans and DEG/RAD recover on reopening.  Enter saves; select an expression to reuse its original context, or an answer to copy. Clear hides rows from this sheet; Archive keeps every saved calculation.
          <p>Try 2(3+4), n=5, n!, sqrt(81) or sin(30). Use abc for variables and func for more functions. log is base 10; % divides by 100. Real numbers, about 15 significant digits.</p>
          <p className="mono">ans = {formatNumber(answer)}{Object.entries(variables).map(([name, value]) => ` · ${name} = ${formatNumber(value)}`).join("")}</p>
          {!api.native && <p>Browser demo: saved calculations last for this page session. Desktop saves permanently.</p>}
        </aside>}
        {loading && <p className="calculator-notice" role="status">Loading calculations…</p>}
        {loadError && <p className="calculator-notice" role="alert">{loadError} <button type="button" disabled={loading || saving} onClick={() => void loadMore()}>Retry</button></p>}
        {hasMore && !archive && (!visibility.through || visibleRows.length === history.length) && <button type="button" className="calculator-older" disabled={loading || saving} onClick={() => void loadMore()}>Earlier calculations</button>}
        {!rows.length && !loading && <div className="calculator-empty"><span>{archive ? "No saved calculations yet." : "Room to work."}</span><small>{archive ? "Your next calculation starts the archive." : "Type an expression, then press Enter to keep it."}</small></div>}
        <ol className="calculator-rows" aria-label={archive ? "Archived calculations" : "Visible calculations"}>{rows.map(row => <li key={row.id}>
          <button type="button" className="calculator-expression" disabled={saving} onClick={() => reuse(row)} title={`Reuse ${row.calculation.expression} · ${row.calculation.mode.toUpperCase()} · ${new Date(row.timestamp).toLocaleString()}`} aria-label={`Reuse ${row.calculation.expression}`}><CalculationFormula source={row.calculation.expression} /></button>
          <button type="button" className="calculator-result" onClick={() => void copy(row.calculation.result)} title="Copy answer" aria-label={`Copy answer ${formatNumber(row.calculation.result)}`}>= {formatNumber(row.calculation.result)}</button>
        </li>)}</ol>
        {archive && hasMore && <button type="button" className="calculator-older" disabled={loading || saving} onClick={() => void loadMore()}>Load older calculations</button>}
      </div>
      <form className="calculator-entry" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <CalculatorMathField editor={editor} value={latex} saving={saving} onChange={changeLatex} onSelection={value => { setPrefix(value); setDismissed(false); }} onKey={editingKey} />
        {preview.evaluation && <button type="button" className="calculator-live-answer" title="Copy answer" onClick={() => preview.evaluation && void copy(preview.evaluation.value)}>= {formatNumber(preview.evaluation.value)}</button>}
        <span id="calculator-preview" className="sr-only" aria-live="polite">{preview.evaluation ? `Answer ${formatNumber(preview.evaluation.value)}` : preview.error}</span>
      </form>
      {suggestions.length > 0 && <div className="calculator-completions" role="group" aria-label="Completions: Tab accepts the first suggestion">{suggestions.map(name => <button type="button" key={name} onMouseDown={event => event.preventDefault()} onClick={() => complete(name)}>{name}{calculatorFunctions.includes(name) ? "(…)" : ""}</button>)}<small>Tab to complete</small></div>}
      <div id="calculator-editing-hint" className="calculator-editing-hint">{hint || templateHint || "↑ ↓ recall · Tab moves through math · Ctrl Shift C copies last result"}</div>
      <div className="calculator-feedback" role="status">{saving ? "Saving…" : storageError || message || preview.error || "\u00a0"}</div>
      <div className="calculator-pad">
        <div className="calculator-controls">
          <div className="calculator-tabs" role="group" aria-label="Keypad page">{(["main", "abc", "func"] as const).map(name => <button type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</div>
          <div className="calculator-angles" role="group" aria-label="Angle mode">{(["rad", "deg"] as const).map(value => <button type="button" key={value} disabled={saving} aria-pressed={mode === value} onClick={() => setMode(value)}>{value.toUpperCase()}</button>)}</div>
          <button type="button" className="calculator-icon" aria-label="Undo edit" title="Undo edit" disabled={saving || !edits.current.undo.length} onClick={() => undo()}><Undo2 size={16}/></button>
          <button type="button" className="calculator-icon" aria-label="Redo edit" title="Redo edit" disabled={saving || !edits.current.redo.length} onClick={() => undo(true)}><Redo2 size={16}/></button>
          <button type="button" className="calculator-clear" title="Hide visible calculations; keep permanent archive and variables" disabled={saving || loading || archive || !visibleRows.length} onClick={() => { setMessage("Sheet cleared. Saved calculations remain in Archive."); persistVisibility(clearVisibleCalculations(history, Date.now())); editor.current?.focus(); }}>Clear</button>
          <button type="button" className="calculator-icon" aria-label={archive ? "Return to worksheet" : "Open permanent calculation archive"} aria-pressed={archive} title="Permanent archive" onClick={() => setArchive(value => !value)}><History size={17}/></button>
          <button type="button" className="calculator-icon" aria-label="Calculator help" aria-expanded={help} title="Help and variables" onClick={() => { setHelp(value => !value); if (!help) requestAnimationFrame(() => sheet.current?.scrollTo({ top: 0 })); }}><HelpCircle size={17}/></button>
        </div>
        <div className="calculator-keyboard">
          <div className="calculator-science" aria-label="Scientific keys">{scienceKeys[tab].map(([label, value]) => key(label, value))}</div>
          <div className="calculator-numbers" aria-label="Numbers and operators">{numberKeys.map(([label, value]) => key(label, value, /^[0-9.]$/.test(label)))}</div>
          <div className="calculator-utilities" aria-label="Editing keys">
            {key("%", "%")}{key("a/b", "/")}
            <button type="button" className="calculator-key" disabled={saving} aria-label="Move cursor left" onMouseDown={event => event.preventDefault()} onClick={() => moveCaret(-1)}><ArrowLeft size={19}/></button>
            <button type="button" className="calculator-key" disabled={saving} aria-label="Move cursor right" onMouseDown={event => event.preventDefault()} onClick={() => moveCaret(1)}><ArrowRight size={19}/></button>
            <button type="button" className="calculator-key calculator-wide" disabled={saving} aria-label="Backspace" onMouseDown={event => event.preventDefault()} onClick={() => replaceSelection("", true)}><Delete size={20}/></button>
            <button type="button" className="calculator-key calculator-enter calculator-wide" disabled={saving || loading || !preview.evaluation} aria-label="Calculate and save" title="Enter · calculate and save" onMouseDown={event => event.preventDefault()} onClick={() => void submit()}><CornerDownLeft size={25}/></button>
          </div>
        </div>
      </div>
    </section>;
  return expanded ? content : <ToolDialog title="Calculator" tall className="calculator-dialog" onClose={onClose}>{content}</ToolDialog>;
}

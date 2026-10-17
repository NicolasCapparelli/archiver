import { useMemo, useState } from "react";
import { changedSpan, compareSides, type DiffCell } from "./diff-sides";
export function TextDiffTool({ initialText = "" }: { initialText?: string }) {
  const [left, setLeft] = useState(initialText), [right, setRight] = useState("");
  const [baseline, setBaseline] = useState<"left" | "right">("left");
  const [message, setMessage] = useState("");
  const result = useMemo(() => {
    try { return { ...compareSides(left, right, baseline), error: "" }; }
    catch (error) { return { rows: [], coarse: false, error: String(error) }; }
  }, [left, right, baseline]);
  function cell(value: DiffCell | undefined, other: DiffCell | undefined) {
    if (!value) return <td className="diff-gap" aria-label="No corresponding line" />;
    const [prefix, middle, suffix] = value.kind === "same" ? [value.text, "", ""] : changedSpan(value.text, other?.text ?? "");
    const ending = value.text.endsWith("\r\n") ? "CRLF" : value.text.endsWith("\n") ? "LF" : "No newline";
    return <td className={`diff-${value.kind}`}><span className="diff-line-label">{value.line} · {value.kind === "same" ? "Unchanged" : value.kind === "add" ? "Added" : "Removed"} · {ending}</span><pre>{prefix}<mark>{middle}</mark>{suffix}</pre></td>;
  }
  return <section aria-label="Editable text comparison">
    <p>Edit both sides. Added and removed are relative to the chosen baseline. Up to 100,000 characters per side.</p>
    <div className="text-tool-columns">{(["left", "right"] as const).map(side => <label key={side}>{side === "left" ? "Left text" : "Right text"}<textarea className="tool-text mono" data-initial-focus={side === "left" || undefined} value={side === "left" ? left : right} maxLength={100000} onChange={event => { (side === "left" ? setLeft : setRight)(event.target.value); setMessage(""); }} /></label>)}</div>
    <div className="text-tool-actions"><label>Baseline <select value={baseline} onChange={event => setBaseline(event.target.value as "left" | "right")}><option value="left">Left</option><option value="right">Right</option></select></label><button className="secondary" onClick={() => { setLeft(right); setRight(left); }}>Swap sides</button>{(["left", "right"] as const).map(side => <button className="secondary" key={side} onClick={() => void navigator.clipboard.writeText(side === "left" ? left : right).then(() => setMessage(`${side} text copied`)).catch(error => setMessage(String(error)))}>Copy {side}</button>)}</div>
    <p role="status">{result.error || (left === right ? "Texts are identical." : `${result.rows.filter(row => row.left?.kind === "remove" || row.right?.kind === "remove").length} removed lines; ${result.rows.filter(row => row.left?.kind === "add" || row.right?.kind === "add").length} added lines.`)} {result.coarse && "Large comparison: changed blocks are grouped; alignment is approximate."} {result.rows.length > 1000 && "Preview shows the first 1,000 aligned rows."}</p>
    <div className="diff-sides-scroll"><table className="diff-sides"><thead><tr><th scope="col">Left {baseline === "left" ? "(baseline)" : ""}</th><th scope="col">Right {baseline === "right" ? "(baseline)" : ""}</th></tr></thead><tbody>{result.rows.slice(0, 1000).map((row, i) => <tr key={i}>{cell(row.left, row.right)}{cell(row.right, row.left)}</tr>)}</tbody></table></div>
    {message && <p role="status">{message}</p>}
  </section>;
}

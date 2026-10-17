import { useMemo, useState } from "react";
import { inspectJson } from "./json-tree";
export function JsonExplorer({ text }: { text: string }) {
  const result = useMemo(() => inspectJson(text), [text]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied"); }
    catch (error) { setMessage(String(error)); }
  }
  const hidden = new Set<string>();
  return <section className="json-explorer" aria-label="JSON explorer">
    <p>Expand values and copy their exact JSON or JSON Pointer. Root pointer is an empty string.</p>
    {result.error && <p role="status">{result.error}</p>}
    {result.truncated && <p role="status">Showing the first 2,000 values. Copying a container includes its complete original JSON.</p>}
    <div className="json-rows">{result.rows.map(row => {
      if (row.parent !== null && (closed.has(row.parent) || hidden.has(row.parent))) { hidden.add(row.pointer); return null; }
      const raw = text.slice(row.start, row.start + row.length);
      return <div className="json-row" key={`${row.pointer}:${row.start}`} style={{ paddingLeft: Math.min(row.depth, 12) * 12 }}>
        {row.children ? <button className="secondary" aria-expanded={!closed.has(row.pointer)} aria-label={`${closed.has(row.pointer) ? "Expand" : "Collapse"} ${row.label}`} onClick={() => setClosed(previous => { const next = new Set(previous); if (next.has(row.pointer)) next.delete(row.pointer); else next.add(row.pointer); return next; })}>{closed.has(row.pointer) ? "▸" : "▾"}</button> : <span>·</span>}
        <span className="mono json-value" title={row.pointer || "Root"}>{row.label}: {row.children ? row.type : raw.slice(0, 160)}</span>
        <button className="secondary" aria-label={`Copy value ${row.label}`} onClick={() => void copy(raw)}>Value</button>
        <button className="secondary" aria-label={`Copy JSON Pointer ${row.label}`} onClick={() => void copy(row.pointer)}>Path</button>
      </div>;
    })}</div>
    {message && <p role="status">{message}</p>}
  </section>;
}

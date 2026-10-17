import { useEffect, useRef, useState } from "react";
import type { ExtractKind } from "./text-extract";
export function TextExtractTool({ initialText = "" }: { initialText?: string }) {
  const [text, setText] = useState(initialText), [kind, setKind] = useState<ExtractKind>("urls"), [pattern, setPattern] = useState(""), [flags, setFlags] = useState("iu"), [unique, setUnique] = useState(true);
  const [output, setOutput] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const job = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null);
  function cancel() { if (job.current) { job.current.worker.onmessage = null; job.current.worker.onerror = null; job.current.worker.terminate(); clearTimeout(job.current.timer); job.current = null; } }
  useEffect(() => () => cancel(), []);
  function changed() { cancel(); setBusy(false); setOutput(""); setMessage(""); }
  function run() {
    changed();
    if (text.length > 100000) { setMessage("Extract from up to 100,000 characters at a time."); return; }
    try {
      const worker = new Worker(new URL("./extract-worker.ts", import.meta.url), { type: "module" });
      setBusy(true);
      const finish = () => { cancel(); setBusy(false); };
      const timer = setTimeout(() => { finish(); setMessage("Pattern took too long. Simplify it or use a smaller input."); }, 1500);
      job.current = { worker, timer };
      worker.onmessage = event => {
        if (job.current?.worker !== worker) return;
        const { result, error } = event.data as { result?: { values: string[]; truncated: boolean }; error?: string };
        finish();
        if (error) { setMessage(error); return; }
        if (result) { setOutput(result.values.join("\n")); setMessage(`${result.values.length} matches${unique ? " (duplicates removed, case-sensitive)" : ""}.${result.truncated ? " Limit reached: at most 2,000 results / 10,000 scanned matches." : ""}`); }
      };
      worker.onerror = () => { if (job.current?.worker !== worker) return; finish(); setMessage("Extractor worker failed. Try again with a smaller input."); };
      worker.postMessage({ text, kind, pattern, flags, unique });
    } catch (error) { cancel(); setBusy(false); setMessage(String(error)); }
  }
  return <section aria-label="Text extractors">
    <p>Extract HTTP(S) URLs, email addresses, absolute Windows/Unix file paths, or full regex matches. Results keep source order. Up to 100,000 characters.</p>
    <label>Source text<textarea data-initial-focus className="tool-text mono" value={text} maxLength={100000} onChange={event => { changed(); setText(event.target.value); }} /></label>
    <div className="text-tool-actions"><label>Extractor <select value={kind} onChange={event => { changed(); setKind(event.target.value as ExtractKind); }}><option value="urls">URLs</option><option value="emails">Email addresses</option><option value="paths">File paths</option><option value="regex">Custom regex</option></select></label><label><input type="checkbox" checked={unique} onChange={event => { changed(); setUnique(event.target.checked); }} /> Remove exact duplicates</label></div>
    {kind === "regex" && <div className="text-tool-columns"><label>Pattern (without / delimiters)<input className="mono" value={pattern} maxLength={2000} placeholder="e.g. ticket-\d+" onChange={event => { changed(); setPattern(event.target.value); }} /></label><label>Flags (i, m, u)<input value={flags} onChange={event => { changed(); setFlags(event.target.value); }} /></label></div>}
    {kind === "paths" && <p>Quote paths containing spaces. Paths are extracted as text; existence is not checked.</p>}
    <div className="text-tool-actions"><button className="primary" disabled={busy} onClick={run}>{busy ? "Extracting…" : "Extract"}</button>{busy && <button className="secondary" onClick={() => { changed(); setMessage("Cancelled"); }}>Cancel</button>}<button className="secondary" disabled={!output || busy} onClick={() => void navigator.clipboard.writeText(output).then(() => setMessage("Extracted text copied")).catch(error => setMessage(String(error)))}>Copy results</button></div>
    <p role="status">{message}</p><label>Results<textarea className="tool-text mono" readOnly value={output} /></label>
  </section>;
}

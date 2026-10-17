import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "./api";
import { ToolDialog } from "./tool-dialog";
export function ClipNotes({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    void invoke<string>("clip_note", { id }).then(value => { if (!disposed) { setNote(value); setLoading(false); } }).catch(error => { if (!disposed) setError(String(error)); });
    return () => { disposed = true; };
  }, [id]);
  async function save() {
    if (busy || loading) return;
    setBusy(true); setError("");
    try { await invoke("save_clip_note", { id, note }); onSaved(); onClose(); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  return <ToolDialog title="Clip notes" onClose={onClose}>
    <p>Searchable annotations stay separate from copied content. Leave empty to remove the note.</p>
    {loading && !error && <p role="status">Loading note…</p>}
    <textarea autoFocus data-initial-focus className="tool-text" aria-label="Clip note" maxLength={10000} value={note} disabled={loading || busy} onChange={event => setNote(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); event.stopPropagation(); void save(); } }} />
    <button className="primary" disabled={!native || loading || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save note"}</button>
    {error && <p role="alert">{error}</p>}
  </ToolDialog>;
}

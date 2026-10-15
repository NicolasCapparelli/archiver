import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native, type Item } from "./api";
export function BulkOrganization({ items, active, onSaved }: { items: Item[]; active?: Item; onSaved: () => void }) {
  const [ids, setIds] = useState<string[]>(active ? [active.id] : []);
  const [tags, setTags] = useState("");
  const [collections, setCollections] = useState("");
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const names = (text: string) => text.split(",").map(s => s.trim()).filter(Boolean);
  const snippetsOnly = ids.length > 0 && ids.every(id => items.find(item => item.id === id)?.name);
  return <form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setMessage("");
    try { await invoke("bulk_organization", { ids, tags: names(tags), collections: snippetsOnly ? names(collections) : [], remove }); onSaved(); }
    catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  }}>
    <p>Add or remove named labels without replacing other labels. Select from the currently loaded results.</p>
    <button type="button" className="secondary" disabled={busy} onClick={() => setIds(items.slice(0, 500).map(i => i.id))}>Select loaded results (up to 500)</button>
    <button type="button" className="secondary" disabled={busy} onClick={() => setIds([])}>Clear selection</button>
    <fieldset disabled={busy} className="organization-selection"><legend>{ids.length} selected</legend>{items.slice(0, 500).map(item => <label key={item.id}><input type="checkbox" checked={ids.includes(item.id)} onChange={e => setIds(e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />{item.name || item.text.slice(0, 100) || item.kind}</label>)}</fieldset>
    <label>Tags<input className="setting-input" value={tags} disabled={busy} onChange={e => setTags(e.target.value)} /></label>
    {snippetsOnly && <label>Snippet groups<input className="setting-input" value={collections} disabled={busy} onChange={e => setCollections(e.target.value)} /></label>}
    <label><input type="checkbox" checked={remove} disabled={busy} onChange={e => setRemove(e.target.checked)} />Remove these labels</label>
    <button className="primary" disabled={busy || !native || !ids.length || (!names(tags).length && !(snippetsOnly && names(collections).length))}>{busy ? "Saving…" : remove ? "Remove labels" : "Apply labels"}</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}

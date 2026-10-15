import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { collectionGroups, renameCollection, native, type Item } from "./api";
import { ToolDialog } from "./tool-dialog";
import { Folder, Plus, FolderInput } from "lucide-react";
import { ChoiceDialog } from "./choice-dialog";

/** Collections are the durable group memberships; empty groups are saved searches. */
export function ClipGroups({ selected, onSelect, onChanged, active, action, onClose, onAction, vault = false }: {
  selected: string; onSelect: (name: string) => void; onChanged: () => void; active: Item | undefined;
  action?: "create" | "move" | "rename"; onClose: () => void; onAction: (action: "create" | "move" | "rename") => void; vault?: boolean;
}) {
  const [renameFrom, setRenameFrom] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [groups, setGroups] = useState<string[]>([]), [name, setName] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setGroups(await collectionGroups());
  }, []);
  useEffect(() => { void refresh().catch(e => setError(String(e))); }, [refresh, selected, active?.id]);
  useEffect(() => {
    if (!native) return;
    let disposed = false, stop: undefined | (() => void);
    void listen("archive-changed", () => { void refresh().catch(e => setError(String(e))); }).then(fn => { if (disposed) fn(); else stop = fn; }).catch(e => setError(String(e)));
    return () => { disposed = true; stop?.(); };
  }, [refresh]);
  useEffect(() => { if (action === "rename") { const value = selected || groups[0] || ""; setRenameFrom(value); setName(value); setError(""); } else if (action === "create") { setName(""); setError(""); } }, [action]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value || new TextEncoder().encode(value).length > 100 || value.includes(",")) { setError("Use a group name of 1–100 bytes without commas."); return; }
    setBusy(true);
    try {
      if (action === "rename") { await renameCollection(renameFrom, value); onChanged(); }
      else if (native) await invoke("save_search", { search: { name: `Group: ${value}`, query: "", filter: "all", options: { collection: value } } });
      else localStorage.setItem("archiver-preview-groups", JSON.stringify([...new Set([...groups, value])]));
      await refresh(); setName(""); setError(""); onSelect(value); onClose();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function move(id: string, group: string) {
    if (!native || busy) return;
    setBusy(true);
    try {
      // Replace only collection membership, retaining all tags and content.
      await invoke("set_item_labels", { id, kind: "collection", names: group ? [group] : [] });
      setError(""); onChanged(); await refresh(); onClose();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <div className="clip-groups">
    <div className="group-heading"><span><Folder size={14} /> {vault ? "Vault groups" : "Groups"}</span><div className="group-controls">
      <button className="text-action" onClick={() => onAction("create")}><Plus size={13} /> New group</button>
      <button className="text-action" disabled={!groups.length || busy} onClick={() => onAction("rename")}>Rename group</button>
      <button className="text-action" disabled={!active || !native || busy} onClick={() => onAction("move")}><FolderInput size={13} /> Move selected</button>
    </div></div>
    <div className="group-chips">{["", ...groups].map(group => <button key={group} className={`chip ${selected === group ? "chosen" : ""} ${dropTarget === group ? "drop-target" : ""}`} disabled={busy}
      onClick={() => onSelect(group)} onDragOver={event => { if (event.dataTransfer.types.includes("application/x-archiver-snippet") && native && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(group); } }}
      onDragLeave={() => setDropTarget(null)} onDrop={event => { setDropTarget(null); event.preventDefault(); const id = event.dataTransfer.getData("application/x-archiver-snippet"); if (id) void move(id, group); }}
      aria-pressed={selected === group}
      title={group ? `Show ${group}; drop a snippet here to move it into this group` : "Show all groups; drop here to remove group memberships"}>{group || (vault ? "All snippets" : "All groups")}</button>)}</div>
    {vault && <p className="group-guidance">Choose a group to browse it. Drag a snippet onto a group to move it.</p>}
    {(action === "create" || action === "rename") && <ToolDialog title={action === "rename" ? "Rename group" : "New group"} onClose={onClose}>
      <form onSubmit={event => { if (!busy) void create(event); else event.preventDefault(); }}>
        {action === "rename" && <><label htmlFor="rename-group-from">Group</label><select id="rename-group-from" className="setting-input" value={renameFrom} disabled={busy} onChange={e => { setRenameFrom(e.target.value); setName(e.target.value); }}>{groups.map(group => <option key={group}>{group}</option>)}</select></>}
        <label htmlFor="new-group">Group name</label>
        <input className="setting-input" data-initial-focus id="new-group" placeholder="e.g. Work, Writing, Projects" required disabled={busy} value={name} onChange={e => setName(e.target.value)} maxLength={100} />
        {error && <p role="alert" className="error">{error}</p>}
        <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : action === "rename" ? "Save name" : "Create group"}</button></div>
      </form>
    </ToolDialog>}
    {action === "move" && active && <ChoiceDialog title="Move to group" choices={[{ id: "", label: "Remove from groups" }, ...groups.map(group => ({ id: group, label: group }))]} onChoose={group => void move(active.id, group)} onClose={onClose} />}
    {error && action !== "create" && action !== "rename" && <p role="alert" className="error">{error}</p>}
  </div>;
}

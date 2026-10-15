import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ToolDialog } from "./tool-dialog";
import * as api from "./api";

export function ItemActions({ actions }: { actions: { label: string; run: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className="item-action-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && open) {
      event.preventDefault(); event.stopPropagation();
      const entries = [...(root.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") || [])];
      const index = entries.indexOf(document.activeElement as HTMLButtonElement);
      entries[event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length]?.focus();
    }
  }}>
    <button ref={trigger} className="icon-action" aria-label="Item actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={19} /></button>
    {open && <div role="menu" aria-label="Item actions" className="item-action-popover">{actions.map(action => <button key={action.label} role="menuitem" disabled={action.disabled} onClick={() => { setOpen(false); trigger.current?.focus(); action.run(); }}>{action.label}</button>)}</div>}
  </div>;
}

export function RenamePin({ item, keyboardOnly = false, onClose, onSaved }: { item: api.Item; keyboardOnly?: boolean; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(item.title || ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <ToolDialog title="Rename pin" onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      if (busy || !title.trim()) return;
      setBusy(true);
      void api.renameItem(item.id, title).then(onSaved).catch(e => setError(String(e))).finally(() => setBusy(false));
    }}>
      <p>Give this pin a name you’ll recognize. Copy and paste still use its original content.</p>
      <label htmlFor="pin-name">Name</label>
      <input id="pin-name" className="setting-input" data-initial-focus required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Project setup, Contact details" disabled={busy} />
      {error && <p role="alert" className="error">{error}</p>}
      {keyboardOnly ? <p className="workbench-keys"><span><kbd>Enter</kbd> save name</span><span><kbd>Esc</kbd> cancel</span></p> : <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save name"}</button></div>}
    </form>
  </ToolDialog>;
}

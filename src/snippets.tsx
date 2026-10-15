import { useEffect, useRef, useState } from "react";
import type { Item } from "./api";
import * as api from "./api";
import { ChoiceDialog } from "./choice-dialog";
import {
  placeholders,
  renderTemplate,
  transform,
  type Transformation,
} from "./text-tools";
export interface SnippetDraft {
  id?: string;
  note?: string;
  name: string;
  kind: string;
  text: string;
}
export function SnippetEditor({
  draft,
  keyboardOnly = false,
  collection,
  onClose,
  onSaved,
}: {
  draft: SnippetDraft;
  keyboardOnly?: boolean;
  collection?: string;
  onClose: () => void;
  onSaved: (id: string, collection?: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saved = useRef(false);
  const [value, setValue] = useState(draft);
  const [group, setGroup] = useState(collection || "");
  const [groups, setGroups] = useState<string[]>([]);
  useEffect(() => {
    if (keyboardOnly || draft.id) return;
    let disposed = false;
    void api.collectionGroups().then(rows => { if (!disposed) setGroups(rows); }).catch(e => { if (!disposed) setError(String(e)); });
    return () => { disposed = true; };
  }, [keyboardOnly, draft.id]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [transformOpen, setTransformOpen] = useState(false);
  const content = useRef<HTMLTextAreaElement>(null);
  const restoreContentFocus = useRef(false);
  function closeTransform() {
    restoreContentFocus.current = true;
    setTransformOpen(false);
  }
  useEffect(() => {
    if (!transformOpen && restoreContentFocus.current) {
      restoreContentFocus.current = false;
      content.current?.focus();
    }
  }, [transformOpen]);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save(event: Pick<React.FormEvent, "preventDefault">) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      placeholders(value.text);
      const id = await api.saveSnippet(value.id, value.name, value.kind, value.text, value.note, !value.id ? group : undefined);
      saved.current = true;
      dialog.current?.close();
      onSaved(id, !value.id ? group : collection);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} className="edit-dialog" onClose={event => { if (event.target === event.currentTarget && !saved.current) onClose(); }}>
      <form onSubmit={(event) => void save(event)} onKeyDown={event => {
        if (event.ctrlKey && !event.altKey && !event.shiftKey && ["s", "t"].includes(event.key.toLowerCase())) {
          event.preventDefault(); event.stopPropagation();
          if (event.key.toLowerCase() === "t") setTransformOpen(true);
          else if (event.currentTarget.reportValidity()) void save(event);
        }
      }}>
        <h2>{value.id ? "Edit snippet" : "New snippet"}</h2>
        {!value.id && keyboardOnly && group && <p>Saving into <strong>{group}</strong></p>}
        {!value.id && !keyboardOnly && <label>Save in group<select value={group} onChange={event => setGroup(event.target.value)} disabled={busy}>
          <option value="">Ungrouped</option>{[...new Set([...groups, ...(group ? [group] : [])])].map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>}
        <label>
          Name
          <input
            autoFocus
            required
            maxLength={200}
            value={value.name}
            onChange={(event) =>
              setValue({ ...value, name: event.target.value })
            }
          />
        </label>
        <label>
          Type
          <select
            value={value.kind}
            onChange={(event) =>
              setValue({ ...value, kind: event.target.value })
            }
          >
            <option value="text">Text</option>
            <option value="command">Command</option>
          </select>
        </label>
        <label>
          Content
          <textarea
            ref={content}
            required
            rows={8}
            value={value.text}
            onChange={(event) =>
              setValue({ ...value, text: event.target.value })
            }
          />
        </label>
        <label>Note<textarea rows={3} maxLength={10000} value={value.note || ""} onChange={event => setValue({ ...value, note: event.target.value })} /></label><p>Your note is kept with the snippet and is never copied or pasted.</p>
        <p>
          Templates: <code>{"{{project:archiver}}"}</code>. Repeated names share
          one editable value. Values are inserted as literal text.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {keyboardOnly ? <div className="workbench-keys"><span><kbd>Ctrl S</kbd> {busy ? "saving…" : "save snippet"}</span><span><kbd>Ctrl T</kbd> transform content</span><span><kbd>Esc</kbd> cancel</span></div> : <div className="dialog-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => setTransformOpen(true)}>Transform content</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save snippet"}</button>
        </div>}
      </form>
      {transformOpen && <ChoiceDialog title="Transform snippet" choices={[
        { id: "trim", label: "Trim whitespace" }, { id: "upper", label: "UPPERCASE" }, { id: "lower", label: "lowercase" }, { id: "json", label: "Format JSON" }, { id: "url", label: "Decode URL escapes" },
      ]} onChoose={kind => {
        try { setValue({ ...value, text: transform(value.text, kind as Transformation) }); setError(""); } catch (error) { setError(String(error)); }
        closeTransform();
      }} onClose={closeTransform} />}
    </dialog>
  );
}
export function TextWorkbench({
  item,
  prepared,
  onPrepared,
  onDone,
}: {
  item: Item;
  prepared?: string;
  onPrepared: (text: string | undefined) => void;
  onDone?: () => void;
}) {
  const [values, setValues] = useState(() =>
    placeholders(item.name ? item.text : ""),
  );
  const [error, setError] = useState("");
  function apply(kind: Transformation) {
    try {
      onPrepared(transform(prepared ?? item.text, kind));
      setError("");
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <div className="text-workbench">
      {Object.keys(values).length > 0 && (
        <fieldset>
          <legend>Template values</legend>
          {Object.entries(values).map(([name, value]) => (
            <label key={name}>
              {name}
              <input
                value={value}
                onChange={(event) =>
                  setValues({ ...values, [name]: event.target.value })
                }
              />
            </label>
          ))}
          <button
            className="secondary"
            onClick={() => {
              onPrepared(renderTemplate(item.text, values));
              onDone?.();
            }}
          >
            Use these values
          </button>
        </fieldset>
      )}
      <label>
        Transform{" "}
        <select
          aria-label="Text transformation"
          value=""
          onChange={(event) => apply(event.target.value as Transformation)}
        >
          <option value="" disabled>
            Choose…
          </option>
          <option value="trim">Trim whitespace</option>
          <option value="upper">UPPERCASE</option>
          <option value="lower">lowercase</option>
          <option value="json">Format JSON</option>
          <option value="url">Decode URL escapes</option>
        </select>
      </label>
      {prepared !== undefined && (
        <>
          <label>
            Prepared text
            <textarea
              rows={5}
              value={prepared}
              onChange={(event) => onPrepared(event.target.value)}
            />
          </label>
          <small>
            Copy and paste use this text. Original history is preserved.
          </small>
          <button className="text-action" onClick={() => onPrepared(undefined)}>
            Reset to original
          </button>
          {onDone && (
            <button className="primary" onClick={onDone}>
              Use prepared text
            </button>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function TemplateDialog({
  item,
  prepared,
  onPrepared,
  onClose,
}: {
  item: Item;
  prepared?: string;
  onPrepared: (text: string | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="edit-dialog" onClose={onClose}>
      <h2>Prepare {item.name || "text"}</h2>
      <TextWorkbench
        item={item}
        prepared={prepared}
        onPrepared={onPrepared}
        onDone={() => ref.current?.close()}
      />
      <button className="secondary" onClick={() => ref.current?.close()}>
        Close
      </button>
    </dialog>
  );
}

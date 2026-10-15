import { useState, useEffect } from "react";
import * as api from "./api";
import type { Item } from "./api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DiffViewer } from "./diff-viewer";
const key = "archiver-paste-queue-v1";
type QueueEntry = { id: string; kind: string; name: string };
export function removeQueuedItem(id: string) {
  localStorage.setItem(
    key,
    JSON.stringify(readQueue().filter((entry) => entry.id !== id)),
  );
  window.dispatchEvent(new Event("storage"));
}
function readQueue(): QueueEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (e) =>
              typeof e?.id === "string" &&
              typeof e?.kind === "string" &&
              typeof e?.name === "string",
          )
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
export function SelectionTools({
  basket,
  setBasket,
  active,
}: {
  basket: Item[];
  setBasket: (items: Item[]) => void;
  active: Item | undefined;
}) {
  const [separator, setSeparator] = useState("\n"),
    [combined, setCombined] = useState(""),
    [message, setMessage] = useState(""),
    [queue, setQueue] = useState(readQueue),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const listener = () => setQueue(readQueue());
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  function saveQueue(entries: QueueEntry[]) {
    localStorage.setItem(key, JSON.stringify(entries));
    setQueue(entries);
  }
  const eligible =
    active &&
    !!active.text &&
    active.kind !== "image" &&
    active.kind !== "files" &&
    !active.text.includes("{{");
  function add() {
    if (eligible && active && !basket.some((i) => i.id === active.id))
      setBasket([...basket, active]);
  }
  async function copy() {
    try {
      if (!basket.length) return;
      await api.copy(basket[0], true, combined);
      setMessage("Combined text copied. Original entries preserved.");
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function next() {
    if (busy || !queue.length) return;
    setBusy(true);
    setMessage("");
    try {
      const entry = queue[0];
      await api.paste({ id: entry.id, kind: entry.kind } as Item);
      const current = readQueue();
      if (current[0]?.id === entry.id) saveQueue(current.slice(1));
    } catch (e) {
      setMessage(String(e));
      if (api.native) {
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="selection-tools">
      <p>
        Combine clips & paste queue{" "}
        {basket.length > 0 && `· ${basket.length} selected`}{" "}
        {queue.length > 0 && `· ${queue.length} queued`}
      </p>
      <p>
        Selection order determines combination and queue order. Images, files,
        and unfilled templates cannot be combined. Queue steps paste into the
        previous app without sending Tab or Enter.
      </p>
      <button
        className="secondary"
        disabled={
          !eligible ||
          basket.some((i) => i.id === active?.id) ||
          basket.length >= 100
        }
        onClick={add}
      >
        Add selected item
      </button>
      <button
        className="secondary"
        disabled={!basket.length}
        onClick={() => setBasket([])}
      >
        Clear selection
      </button>
      {basket.map((item, index) => (
        <div className="selection-row" key={item.id}>
          <span>
            {index + 1}. {item.name || item.text.slice(0, 70)}
          </span>
          <button
            aria-label={`Move selection ${index + 1} up`}
            disabled={!index}
            onClick={() => {
              const copy = [...basket];
              [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
              setBasket(copy);
            }}
          >
            ↑
          </button>
          <button
            aria-label={`Remove selection ${index + 1}`}
            onClick={() => setBasket(basket.filter((i) => i.id !== item.id))}
          >
            ×
          </button>
        </div>
      ))}
      {basket.length >= 2 && (
        <DiffViewer before={basket[0]} after={basket[1]} />
      )}
      <label>
        Separator
        <select
          className="setting-input"
          value={separator}
          onChange={(e) => setSeparator(e.target.value)}
        >
          <option value={"\n"}>Newline</option>
          <option value={"\n\n"}>Blank line</option>
          <option value=", ">Comma</option>
          <option value=" ">Space</option>
          <option value="">None</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {separator === "custom" && (
        <input
          className="setting-input"
          aria-label="Custom separator"
          id="combine-separator"
          onChange={(e) =>
            setCombined(basket.map((i) => i.text).join(e.target.value))
          }
        />
      )}
      <button
        className="secondary"
        disabled={!basket.length}
        onClick={() =>
          setCombined(
            basket
              .map((i) => i.text)
              .join(
                separator === "custom"
                  ? (
                      document.getElementById(
                        "combine-separator",
                      ) as HTMLInputElement
                    )?.value || ""
                  : separator,
              ),
          )
        }
      >
        Preview combined text
      </button>
      {combined && (
        <>
          <textarea
            className="setting-input"
            aria-label="Combined text"
            value={combined}
            onChange={(e) => setCombined(e.target.value)}
          />
          <button className="primary" onClick={() => void copy()}>
            Copy combination
          </button>
        </>
      )}
      <button
        className="secondary"
        disabled={
          !basket.length ||
          basket.some((i) => i.kind === "command") ||
          queue.length + basket.length > 100
        }
        onClick={() =>
          saveQueue([
            ...queue,
            ...basket.map((i) => ({
              id: i.id,
              kind: i.kind,
              name: i.name || i.text.slice(0, 70),
            })),
          ])
        }
      >
        Append clips to queue
      </button>
      {queue.length > 0 && (
        <>
          <p>
            Next: {queue[0].name} · {queue.length} remaining
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void next()}
          >
            Paste next queued clip
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => saveQueue(queue.slice(1))}
          >
            Skip next
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => saveQueue([])}
          >
            Clear queue
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

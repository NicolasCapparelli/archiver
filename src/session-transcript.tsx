import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { copy, type Item } from "./api";
type Execution = {
  id: string;
  itemId: string;
  text: string;
  timestamp: number;
  directory: string;
  sequence: number;
  successful: boolean | null;
  exitCode: number | null;
  durationMs: number | null;
};
export function SessionTranscript({ session }: { session: string }) {
  const [rows, setRows] = useState<Execution[]>([]),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    setRows([]);
    setMessage("");
    setBusy(true);
    void invoke<Execution[]>("session_timeline", { session, offset: 0 })
      .then((r) => {
        if (live) {
          setRows(r);
          setMore(r.length === 50);
        }
      })
      .catch((e) => {
        if (live) setMessage(String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [session]);
  async function loadMore() {
    setBusy(true);
    try {
      const r = await invoke<Execution[]>("session_timeline", {
        session,
        offset: rows.length,
      });
      setRows([...rows, ...r]);
      setMore(r.length === 50);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Session execution timeline">
      <h3>Execution timeline</h3>
      <p>
        Every recorded submission in sequence, including repeated commands.
        Copying never executes a command.
      </p>
      {rows.map((r) => (
        <article className="session-execution" key={r.id}>
          <strong>
            #{r.sequence} · {new Date(r.timestamp).toLocaleString()}
          </strong>
          <p>
            {r.directory} ·{" "}
            {r.successful === null
              ? "Completion unavailable"
              : r.successful
                ? "Succeeded"
                : "Failed"}
            {r.exitCode === null ? "" : ` · exit ${r.exitCode}`}
            {r.durationMs === null
              ? ""
              : ` · ${(r.durationMs / 1000).toFixed(2)}s`}
          </p>
          <pre tabIndex={0}>{r.text}</pre>
          <button
            className="secondary"
            onClick={() =>
              void copy({ id: r.itemId, text: r.text } as Item, true, r.text)
                .then(() => setMessage("Command copied"))
                .catch((e) => setMessage(String(e)))
            }
          >
            Copy command
          </button>
        </article>
      ))}
      {busy && <p>Loading executions…</p>}
      {!busy && !rows.length && <p>No recorded submissions.</p>}
      {more && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void loadMore()}
        >
          Load next 50 executions
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
